import "server-only";

import { analyseBook } from "@/lib/prediction/book-analytics";
import {
  armedRulesFor,
  evaluateAlert,
  markAlertTriggered,
  rearmAlert,
  type PredictionAlertRule,
} from "@/lib/prediction/alerts";
import {
  evaluateLifecycle,
  openSignals,
  updateSignalStatus,
} from "@/lib/prediction/signal-store";
import { liveMarket } from "@/lib/prediction/signals";
import { pruneSnapshots } from "@/lib/prediction/book-history";
import { polymarketTrending } from "@/lib/providers/polymarket";
import { serviceClient } from "@/lib/supabase/server";
import type { LiveMarketView } from "@/lib/prediction/signals";

/* ---------------------------------------------------------------------------
   The prediction worker.

   Three jobs, run on the delivery tick:

     1. advance the lifecycle of every tracked signal;
     2. evaluate every armed alert rule;
     3. record order-book features forward.

   ── Why the markets are loaded once ────────────────────────────────────

   A signal, an alert on the same market, and the snapshot recorder all need
   the same book. Loading it three times would triple the venue's load and —
   worse — let the three disagree, because a book read 400ms apart is a
   different book. One read per market per tick, shared.

   ── What this worker does NOT do ───────────────────────────────────────

   It never places an order. Forward tracking is paper: `entered` means the
   ask reached the entry zone, not that anything was bought.

   ── Delivery is someone else's job ─────────────────────────────────────

   This returns what fired. `lib/telegram/deliver.ts` owns the chat lookup,
   the notification preferences and the send, because those are the same for
   every alert kind and duplicating them here would mean prediction alerts
   quietly ignoring a preference the user set.
--------------------------------------------------------------------------- */

/** Markets touched per tick. Bounds the venue load on a busy deployment. */
const MAX_MARKETS = 40;

/**
 * Liquid markets sampled each tick purely to build the recorded corpus.
 *
 * Without this, features accumulate only for markets someone is already
 * watching — so a deployment with no signals and no alerts records nothing,
 * and order-book strategies stay unmeasurable forever. That is a chicken-and-egg
 * the collection is supposed to break.
 *
 * Twenty markets × two outcomes on a five-minute tick is roughly eleven
 * thousand rows a day, which `pruneSnapshots` keeps bounded.
 */
const CORPUS_MARKETS = 20;

/** Ticks between retention sweeps. A delete on every tick is wasted work. */
const PRUNE_EVERY = 288;
let tickCounter = 0;

export interface FiredAlert {
  ruleId: string;
  userId: string;
  marketId: string;
  marketQuestion: string | null;
  outcomeLabel: string | null;
  kind: string;
  message: string;
  value: number | null;
}

export interface LifecycleChange {
  signalId: string;
  userId: string | null;
  marketQuestion: string;
  outcomeLabel: string;
  status: string;
  reason: string;
  resultPoints: number | null;
}

export interface WorkerReport {
  marketsRead: number;
  signalsChecked: number;
  lifecycleChanges: LifecycleChange[];
  alertsChecked: number;
  alertsFired: FiredAlert[];
  alertsRearmed: number;
  snapshotsRecorded: number;
  snapshotsPruned: number;
  errors: number;
}

/**
 * One pass over everything being watched.
 *
 * Never throws: a failure on one market must not stop the others, and the
 * delivery tick that calls this has other work to do.
 */
export async function runPredictionWorker(): Promise<WorkerReport> {
  const report: WorkerReport = {
    marketsRead: 0,
    signalsChecked: 0,
    lifecycleChanges: [],
    alertsChecked: 0,
    alertsFired: [],
    alertsRearmed: 0,
    snapshotsRecorded: 0,
    snapshotsPruned: 0,
    errors: 0,
  };

  const [signals, rules] = await Promise.all([openSignals(200), allArmedRules()]);

  /* Every market anyone is watching, deduplicated. */
  const marketIds = new Set<string>();
  for (const record of signals) marketIds.add(record.signal.marketId);
  for (const rule of rules) marketIds.add(rule.marketId);

  const views = new Map<string, LiveMarketView>();
  for (const marketId of [...marketIds].slice(0, MAX_MARKETS)) {
    try {
      const view = await liveMarket(marketId);
      if (view !== null) {
        views.set(marketId, view);
        report.marketsRead += 1;
      }
    } catch {
      report.errors += 1;
    }
  }

  /* ---- 1. Signal lifecycle ---- */

  for (const record of signals) {
    report.signalsChecked += 1;

    const view = views.get(record.signal.marketId);
    if (view === undefined) continue;

    const outcome = view.state.outcomes.get(record.signal.tokenId);
    /* A book that could not be read is not a price movement. Skipped, so an
       outage never invalidates a setup that is still fine. */
    if (outcome === undefined) continue;

    const transition = evaluateLifecycle(record, {
      ask: outcome.book.bestAsk,
      bid: outcome.book.bestBid,
    });
    if (transition === null) continue;

    const settled =
      transition.status === "target_hit" ||
      transition.status === "invalidated" ||
      transition.status === "expired";

    const updated = await updateSignalStatus(record.id, {
      status: transition.status,
      ...(transition.entryPrice !== undefined
        ? { entryFilledAt: new Date().toISOString(), entryPrice: transition.entryPrice }
        : {}),
      ...(settled ? { resolvedAt: new Date().toISOString() } : {}),
      ...(transition.resultPoints !== undefined ? { resultPoints: transition.resultPoints } : {}),
    });

    if (!updated) {
      report.errors += 1;
      continue;
    }

    report.lifecycleChanges.push({
      signalId: record.id,
      userId: record.userId,
      marketQuestion: record.signal.marketQuestion,
      outcomeLabel: record.signal.outcomeLabel,
      status: transition.status,
      reason: transition.reason,
      resultPoints: transition.resultPoints ?? null,
    });
  }

  /* ---- 2. Alerts ---- */

  for (const rule of rules) {
    report.alertsChecked += 1;

    const view = views.get(rule.marketId);
    if (view === undefined) continue;

    const outcome =
      rule.tokenId === null
        ? [...view.state.outcomes.values()][0]
        : view.state.outcomes.get(rule.tokenId);
    if (outcome === undefined) continue;

    const analytics = view.analytics.get(outcome.tokenId) ?? analyseBook(outcome.book);

    const decision = evaluateAlert(rule, {
      price: analytics.midpoint,
      analytics,
      /* Probability-change rules need a baseline, which lives in the
         `prediction_probability_marks` table from migration 0008. Without a
         mark there is nothing to compare against, and a change of zero would
         be a claim rather than an absence. */
      changePoints: await changeSinceMark(outcome.tokenId, analytics.midpoint, rule),
    });

    if (decision.action === "rearm") {
      await rearmAlert(rule.id, decision.value);
      report.alertsRearmed += 1;
      continue;
    }

    if (decision.action !== "fire") continue;

    /* Claimed BEFORE the caller sends. The row is the idempotency boundary,
       so two overlapping ticks cannot both deliver one crossing. */
    await markAlertTriggered(rule.id, decision.value);

    report.alertsFired.push({
      ruleId: rule.id,
      userId: rule.userId,
      marketId: rule.marketId,
      marketQuestion: rule.marketQuestion,
      outcomeLabel: rule.outcomeLabel,
      kind: rule.kind,
      message: decision.message,
      value: decision.value,
    });
  }

  /* ---- 3. Forward book-feature collection ---- */

  /* Liquid markets are added to whatever is already being watched, so the
     corpus grows even on a deployment nobody is using yet. */
  await addCorpusMarkets(views, report);

  report.snapshotsRecorded = await recordSnapshots(views);

  /* Retention. Swept occasionally rather than every tick — the window is
     ninety days and a delete-by-date on each five-minute run is wasted work. */
  tickCounter += 1;
  if (tickCounter % PRUNE_EVERY === 0) {
    report.snapshotsPruned = await pruneSnapshots();
  }

  return report;
}

/**
 * Tops the tick up with liquid markets, for collection only.
 *
 * Ordered by 24h volume, which is where a book is most likely to be
 * two-sided and worth recording. Markets already in `views` are skipped, so
 * a watched market is never read twice in one tick.
 */
async function addCorpusMarkets(
  views: Map<string, LiveMarketView>,
  report: WorkerReport,
): Promise<void> {
  if (views.size >= MAX_MARKETS) return;

  const trending = await polymarketTrending(CORPUS_MARKETS);
  if (!trending.ok || trending.data === undefined) return;

  for (const market of trending.data) {
    if (views.size >= MAX_MARKETS) break;
    if (views.has(market.id)) continue;
    /* Binary only, and only with tokens — the same shape the rest of the
       corpus holds, so the sample stays comparable. */
    if (market.outcomes.length !== 2) continue;
    if ((market.tokenIds ?? []).length !== 2) continue;

    try {
      const view = await liveMarket(market.id);
      if (view !== null) {
        views.set(market.id, view);
        report.marketsRead += 1;
      }
    } catch {
      report.errors += 1;
    }
  }
}

/* ---------------------------------------------------------------------------
   Supporting reads
--------------------------------------------------------------------------- */

async function allArmedRules(): Promise<PredictionAlertRule[]> {
  const { data, error } = await serviceClient()
    .from("prediction_alert_rules")
    .select("token_id")
    .eq("state", "armed")
    .limit(500);

  if (error !== null || data === null) return [];

  const tokens = [
    ...new Set(
      (data as Array<{ token_id: string | null }>)
        .map((row) => row.token_id)
        .filter((token): token is string => token !== null),
    ),
  ];

  return armedRulesFor(tokens);
}

/**
 * Probability points moved since the last recorded mark.
 *
 * Returns null when there is no mark, which the alert evaluator treats as
 * "cannot be measured" and holds on — rather than as a zero move, which would
 * be a claim that the market has not moved.
 */
async function changeSinceMark(
  tokenId: string,
  current: number | null,
  rule: PredictionAlertRule,
): Promise<number | null> {
  if (rule.kind !== "probability_change" || current === null) return null;

  const { data } = await serviceClient()
    .from("prediction_probability_marks")
    .select("probability")
    .eq("token_id", tokenId)
    .maybeSingle();

  const previous = (data as { probability: number } | null)?.probability ?? null;
  if (previous === null) return null;

  return (current - previous) * 100;
}

/**
 * Records derived book features for every market read this tick.
 *
 * This is how order-book strategies eventually get a historical sample.
 * Polymarket publishes probability history but not depth, so the only honest
 * route to a book-strategy win rate is to accumulate observations going
 * forward — never to reconstruct depth that was not recorded.
 *
 * Derived features only, one row per token per tick. Storing raw updates
 * would cost gigabytes per market per month to answer questions these columns
 * already answer.
 */
async function recordSnapshots(views: Map<string, LiveMarketView>): Promise<number> {
  const rows: Array<{
    token_id: string;
    market_id: string;
    best_bid: number | null;
    best_ask: number | null;
    midpoint: number | null;
    microprice: number | null;
    spread: number | null;
    bid_depth_1: number;
    ask_depth_1: number;
    bid_depth_5: number;
    ask_depth_5: number;
    imbalance_5: number | null;
    transport: string;
  }> = [];

  for (const view of views.values()) {
    for (const [tokenId, outcome] of view.state.outcomes) {
      const analytics = view.analytics.get(tokenId);
      if (analytics === undefined) continue;

      rows.push({
        token_id: tokenId,
        market_id: view.resolved.market.id,
        best_bid: analytics.bestBid,
        best_ask: analytics.bestAsk,
        midpoint: analytics.midpoint,
        microprice: analytics.microprice,
        spread: analytics.spread,
        bid_depth_1: analytics.depth.top1.bidUsd,
        ask_depth_1: analytics.depth.top1.askUsd,
        bid_depth_5: analytics.depth.top5.bidUsd,
        ask_depth_5: analytics.depth.top5.askUsd,
        imbalance_5: analytics.depth.top5.imbalance,
        /* Recorded, so a pooled sample can later be split by transport. A
           REST snapshot and a live observation are not the same evidence. */
        transport: outcome.book.transport,
      });
    }
  }

  if (rows.length === 0) return 0;

  const { error } = await serviceClient().from("prediction_book_snapshots").insert(rows);
  return error === null ? rows.length : 0;
}
