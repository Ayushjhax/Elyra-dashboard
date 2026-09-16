import "server-only";

import { serviceClient } from "@/lib/supabase/server";
import type { BookTransport } from "@/lib/prediction/book";

/* ---------------------------------------------------------------------------
   Recorded order-book history.

   ── Why this table exists ──────────────────────────────────────────────

   Polymarket publishes probability history and not depth. So a price strategy
   can be measured against the past and an order-book strategy cannot — there
   is no archive of what the book looked like.

   The tempting fix is to infer depth from price and volume. That would
   produce a number, the number would be a measurement of the inference, and
   on screen it would be indistinguishable from a real one. This module is the
   alternative: record the features as they are observed, and measure against
   those once enough exist.

   That means an order-book win rate is UNAVAILABLE for a while and then
   becomes available. `collectionProgress` exists so the interface can say
   which, and how far off the second one is, instead of showing a blank.

   ── What is stored, and what is not ────────────────────────────────────

   Derived features, one row per token per sampling tick. Not raw updates:
   a busy market produces thousands of book deltas a minute, and storing them
   forever costs gigabytes to answer questions these columns answer directly.

   The cost is resolution. A strategy needing sub-tick sequencing cannot be
   measured from samples taken minutes apart, and `PERSISTENCE_NOTE` says so
   rather than letting a coarse sample masquerade as a fine one.
--------------------------------------------------------------------------- */

/** Observations one token needs before its series can be simulated. */
export const MIN_OBSERVATIONS_PER_TOKEN = 60;

/** Total decided trades needed across the corpus before a rate is reported. */
export const MIN_BOOK_SAMPLE = 30;

/** Rows older than this are pruned. Kept long enough to build a corpus. */
export const RETENTION_DAYS = 90;

export const PERSISTENCE_NOTE =
  "Recorded at the sampling interval, not per book update. A condition that " +
  "must hold across N consecutive UPDATES cannot be verified from this series; " +
  "persistence is measured across consecutive SAMPLES instead, which is a " +
  "weaker and slower-moving test. It is stated on every result built from it.";

export interface BookObservation {
  at: number;
  bestBid: number | null;
  bestAsk: number | null;
  midpoint: number | null;
  microprice: number | null;
  spreadPoints: number | null;
  bidDepth5: number;
  askDepth5: number;
  imbalance5: number | null;
  transport: BookTransport;
}

export interface TokenSeries {
  tokenId: string;
  marketId: string;
  observations: BookObservation[];
}

/* ---------------------------------------------------------------------------
   Reading
--------------------------------------------------------------------------- */

interface Row {
  token_id: string;
  market_id: string;
  best_bid: number | null;
  best_ask: number | null;
  midpoint: number | null;
  microprice: number | null;
  spread: number | null;
  bid_depth_5: number | null;
  ask_depth_5: number | null;
  imbalance_5: number | null;
  transport: string;
  recorded_at: string;
}

function toObservation(row: Row): BookObservation {
  return {
    at: Date.parse(row.recorded_at),
    bestBid: row.best_bid,
    bestAsk: row.best_ask,
    midpoint: row.midpoint,
    microprice: row.microprice,
    /* Stored as a fraction; points are what a prediction trader reads. */
    spreadPoints: row.spread === null ? null : row.spread * 100,
    bidDepth5: row.bid_depth_5 ?? 0,
    askDepth5: row.ask_depth_5 ?? 0,
    imbalance5: row.imbalance_5,
    transport: row.transport === "realtime" ? "realtime" : "rest_snapshot",
  };
}

/**
 * Every token with enough recorded observations to simulate.
 *
 * Paged, because a corpus that has been accumulating for weeks is larger than
 * one response. Ordered oldest-first per token so the series reads forward in
 * time without a sort at the call site.
 */
export async function recordedSeries(options: {
  /** Tokens to return. Each one costs memory proportional to its length. */
  maxTokens?: number;
  /** Observations per token. Bounds a long-running collection. */
  maxPerToken?: number;
  sinceMs?: number;
} = {}): Promise<{ series: TokenSeries[]; warnings: string[] }> {
  const maxTokens = Math.min(Math.max(options.maxTokens ?? 60, 1), 300);
  const maxPerToken = Math.min(Math.max(options.maxPerToken ?? 2_000, 60), 10_000);
  const since = new Date(
    Date.now() - (options.sinceMs ?? RETENTION_DAYS * 86_400_000),
  ).toISOString();

  const warnings: string[] = [];

  /* Which tokens have anything worth reading. Fetched as ids first so a
     corpus of millions of rows is never pulled just to count it. */
  const { data: recent, error: recentError } = await serviceClient()
    .from("prediction_book_snapshots")
    .select("token_id")
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: false })
    .limit(20_000);

  if (recentError !== null || recent === null) {
    return { series: [], warnings: ["Recorded book history could not be read."] };
  }

  const counts = new Map<string, number>();
  for (const row of recent as Array<{ token_id: string }>) {
    counts.set(row.token_id, (counts.get(row.token_id) ?? 0) + 1);
  }

  const eligible = [...counts.entries()]
    .filter(([, count]) => count >= MIN_OBSERVATIONS_PER_TOKEN)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTokens)
    .map(([tokenId]) => tokenId);

  if (eligible.length === 0) return { series: [], warnings };

  const series: TokenSeries[] = [];

  for (const tokenId of eligible) {
    const { data, error } = await serviceClient()
      .from("prediction_book_snapshots")
      .select("*")
      .eq("token_id", tokenId)
      .gte("recorded_at", since)
      .order("recorded_at", { ascending: true })
      .limit(maxPerToken);

    if (error !== null || data === null || data.length < MIN_OBSERVATIONS_PER_TOKEN) continue;

    const rows = data as Row[];
    series.push({
      tokenId,
      marketId: rows[0].market_id,
      observations: rows.map(toObservation),
    });
  }

  return { series, warnings };
}

/* ---------------------------------------------------------------------------
   Progress
--------------------------------------------------------------------------- */

export interface CollectionProgress {
  totalObservations: number;
  tokensTracked: number;
  /** Tokens that have crossed `MIN_OBSERVATIONS_PER_TOKEN`. */
  tokensReady: number;
  oldestAt: string | null;
  newestAt: string | null;
  /** Whether a book backtest can be attempted at all. */
  readyToMeasure: boolean;
  /** Written for a person, stating what is missing and roughly when. */
  summary: string;
}

/**
 * How far the forward collection has got.
 *
 * The point of this function is the `summary`: "no win rate" is a very
 * different message from "no win rate yet, 3 of 40 markets ready", and a user
 * who sees the first will conclude the feature is broken.
 */
export async function collectionProgress(): Promise<CollectionProgress> {
  const client = serviceClient();

  const { count, error: countError } = await client
    .from("prediction_book_snapshots")
    .select("*", { count: "exact", head: true });

  if (countError !== null) {
    return {
      totalObservations: 0,
      tokensTracked: 0,
      tokensReady: 0,
      oldestAt: null,
      newestAt: null,
      readyToMeasure: false,
      summary:
        "Recorded book history is unavailable — the prediction_book_snapshots table could not be read. " +
        "Migration 0011 may not be applied.",
    };
  }

  const total = count ?? 0;

  const [{ data: oldest }, { data: newest }] = await Promise.all([
    client
      .from("prediction_book_snapshots")
      .select("recorded_at")
      .order("recorded_at", { ascending: true })
      .limit(1),
    client
      .from("prediction_book_snapshots")
      .select("recorded_at")
      .order("recorded_at", { ascending: false })
      .limit(1),
  ]);

  const { data: sample } = await client
    .from("prediction_book_snapshots")
    .select("token_id")
    .order("recorded_at", { ascending: false })
    .limit(20_000);

  const counts = new Map<string, number>();
  for (const row of (sample ?? []) as Array<{ token_id: string }>) {
    counts.set(row.token_id, (counts.get(row.token_id) ?? 0) + 1);
  }

  const ready = [...counts.values()].filter(
    (value) => value >= MIN_OBSERVATIONS_PER_TOKEN,
  ).length;

  const oldestAt = (oldest as Array<{ recorded_at: string }> | null)?.[0]?.recorded_at ?? null;
  const newestAt = (newest as Array<{ recorded_at: string }> | null)?.[0]?.recorded_at ?? null;

  return {
    totalObservations: total,
    tokensTracked: counts.size,
    tokensReady: ready,
    oldestAt,
    newestAt,
    readyToMeasure: ready > 0,
    summary: describeProgress(total, counts.size, ready, oldestAt),
  };
}

function describeProgress(
  total: number,
  tracked: number,
  ready: number,
  oldestAt: string | null,
): string {
  if (total === 0) {
    return (
      "No order-book history has been recorded yet. Elyra samples book features on every " +
      "delivery tick; a measurable corpus builds over days, not minutes."
    );
  }

  const since =
    oldestAt === null
      ? ""
      : ` Collection started ${describeAge(Date.now() - Date.parse(oldestAt))} ago.`;

  if (ready === 0) {
    return (
      `${total.toLocaleString()} observations recorded across ${tracked} outcome(s), but none has ` +
      `yet reached the ${MIN_OBSERVATIONS_PER_TOKEN} needed to simulate a strategy.${since}`
    );
  }

  return (
    `${total.toLocaleString()} observations across ${tracked} outcome(s); ${ready} have enough ` +
    `history to simulate.${since}`
  );
}

function describeAge(ms: number): string {
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} minutes`;
  if (hours < 48) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}

/* ---------------------------------------------------------------------------
   Retention
--------------------------------------------------------------------------- */

/**
 * Prunes observations past the retention window.
 *
 * Called from the worker. Without it the table grows without bound: sampling
 * twenty markets on a five-minute tick is roughly eleven thousand rows a day,
 * which is fine for a quarter and not fine forever.
 */
export async function pruneSnapshots(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();

  const { data, error } = await serviceClient()
    .from("prediction_book_snapshots")
    .delete()
    .lt("recorded_at", cutoff)
    .select("id");

  if (error !== null || data === null) return 0;
  return data.length;
}
