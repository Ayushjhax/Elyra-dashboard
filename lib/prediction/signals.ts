import "server-only";

import { analyseBook, type BookAnalytics } from "@/lib/prediction/book-analytics";
import { buildBasket, type ProbabilityBasket } from "@/lib/prediction/basket";
import { generateSignal, type SignalOutcome } from "@/lib/prediction/signal-engine";
import { backtestPredictionStrategy } from "@/lib/prediction/signal-backtest";
import { marketState, type MarketState } from "@/lib/prediction/state";
import {
  eligibleStrategies,
  getPredictionStrategy,
  PREDICTION_STRATEGIES,
  resolvePredictionStrategy,
  type PredictionStrategy,
} from "@/lib/prediction/strategies";
import type { HistoricalWinRate, PredictionTechnicalSignal } from "@/lib/prediction/signal-types";
import {
  polymarketMarket,
  polymarketPriceHistory,
  polymarketSearch,
} from "@/lib/providers/polymarket";
import type { PredictionMarket } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The pipeline, in one place.

     resolve market
       → live state (realtime where available, REST snapshot otherwise)
       → order-book analytics
       → probability basket
       → strategy evaluation
       → historical win rate
       → freshness and liquidity gates
       → structured signal

   Every surface — the Agent, Telegram, the Mini App, the web panel, the alert
   engine — enters here. Telegram implementing its own version of any step is
   the specific failure this module exists to prevent: two implementations of
   a microprice drift apart, and the one in the chat client is the one nobody
   tests.

   Nothing here consults a model.
--------------------------------------------------------------------------- */

export interface ResolvedMarket {
  market: PredictionMarket;
  /** Token id and label per outcome, positional with `market.outcomes`. */
  tokens: Array<{ tokenId: string; label: string }>;
}

/**
 * Finds the market a request means.
 *
 * Accepts a numeric Gamma id or free text. Returns null rather than a
 * best-effort match when nothing is found — running analysis on the wrong
 * market and labelling it correctly is worse than saying it was not found.
 */
export async function resolveMarket(query: string): Promise<ResolvedMarket | null> {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;

  let market: PredictionMarket | null = null;

  if (/^[0-9]+$/.test(trimmed)) {
    const direct = await polymarketMarket(trimmed);
    if (direct.ok && direct.data !== undefined) market = direct.data;
  }

  if (market === null) {
    const found = await polymarketSearch(trimmed, 8);
    if (found.ok && found.data !== undefined && found.data.length > 0) {
      /* The FIRST result, not the busiest. `polymarketSearch` returns the
         venue's own relevance ranking with each event's markets sorted by
         volume inside it, so the head is already "the most traded market of
         the most relevant event".

         Re-sorting the whole list by volume would undo that and hand back
         whatever trades most anywhere — which is how a search for "bitcoin"
         ends up analysing a Fed market and captioning it correctly. */
      market = found.data[0];
    }
  }

  if (market === null) return null;

  const tokenIds = market.tokenIds ?? [];
  if (tokenIds.length !== market.outcomes.length || tokenIds.length === 0) {
    /* Without a token per outcome there is no book to read. Reported as
       unresolvable rather than analysed off the Gamma price alone, which
       would produce a "signal" with no order book behind it. */
    return null;
  }

  return {
    market,
    tokens: market.outcomes.map((outcome, index) => ({
      tokenId: tokenIds[index],
      label: outcome.label,
    })),
  };
}

export interface LiveMarketView {
  resolved: ResolvedMarket;
  state: MarketState;
  /** Analytics per outcome token. */
  analytics: Map<string, BookAnalytics>;
  baskets: Map<string, ProbabilityBasket>;
}

/** Live state plus the full analytics pass for every outcome. */
export async function liveMarket(query: string): Promise<LiveMarketView | null> {
  const resolved = await resolveMarket(query);
  if (resolved === null) return null;
  return liveMarketFor(resolved);
}

export async function liveMarketFor(resolved: ResolvedMarket): Promise<LiveMarketView> {
  const state = await marketState.read({
    marketId: resolved.market.id,
    conditionId: resolved.market.conditionId ?? null,
    tokens: resolved.tokens,
  });

  const tracker = marketState.liquidityTracker();
  const analytics = new Map<string, BookAnalytics>();
  const baskets = new Map<string, ProbabilityBasket>();

  for (const [tokenId, outcome] of state.outcomes) {
    analytics.set(tokenId, analyseBook(outcome.book, tracker));

    /* The complement is the OTHER outcome of a binary market. Passed for the
       integrity check only — the two books are mechanically mirrored on this
       venue, so it carries no independent price information. */
    const complement =
      state.outcomes.size === 2
        ? [...state.outcomes.values()].find((other) => other.tokenId !== tokenId)?.book ?? null
        : null;

    baskets.set(
      tokenId,
      buildBasket({
        book: outcome.book,
        complementBook: complement,
        trades: state.trades,
        outcomeLabel: outcome.outcomeLabel,
      }),
    );
  }

  return { resolved, state, analytics, baskets };
}

export interface SignalRequestInput {
  /** Market id or free text. */
  query: string;
  /** Which outcome to evaluate. Defaults to the first (YES on a binary). */
  outcomeIndex?: number;
  /** Strategy name or id. Omitted means "pick the best eligible one". */
  strategy?: string;
  params?: Record<string, number>;
  /** Skips the historical pass when the caller only wants the setup. */
  withWinRate?: boolean;
}

export interface SignalResult {
  ok: boolean;
  signal?: PredictionTechnicalSignal;
  reason?: string;
  market?: PredictionMarket;
  analytics?: BookAnalytics;
  basket?: ProbabilityBasket;
  /** Strategies that could not run, and why. Shown rather than hidden. */
  skipped?: Array<{ strategyId: string; reason: string }>;
  state?: MarketState;
}

/**
 * The full pipeline for one market and one outcome.
 *
 * When no strategy is named, every eligible one is evaluated and the
 * strongest actionable result wins. Strategies that could not run are
 * reported in `skipped` rather than omitted — "no signal" and "could not
 * evaluate" are different answers, and only the second one tells a user that
 * turning on the live feed would change it.
 */
export async function buildSignal(input: SignalRequestInput): Promise<SignalResult> {
  const resolved = await resolveMarket(input.query);
  if (resolved === null) {
    return { ok: false, reason: `No Polymarket market matched "${input.query}".` };
  }

  const view = await liveMarketFor(resolved);
  const { state } = view;

  const index = input.outcomeIndex ?? 0;
  const token = resolved.tokens[index];
  if (token === undefined) {
    return {
      ok: false,
      reason: `That market has ${resolved.tokens.length} outcome(s); index ${index} does not exist.`,
      market: resolved.market,
      state,
    };
  }

  const outcome = state.outcomes.get(token.tokenId);
  if (outcome === undefined) {
    return {
      ok: false,
      reason:
        state.warnings[0] ??
        "The order book for that outcome could not be read, so no signal can be generated.",
      market: resolved.market,
      state,
    };
  }

  const complement =
    state.outcomes.size === 2
      ? [...state.outcomes.values()].find((other) => other.tokenId !== token.tokenId) ?? null
      : null;

  /* ---- Which strategies can run at all ---- */

  const realtime = outcome.book.transport === "realtime";
  const history = await priceHistoryFor(token.tokenId, resolved.market);

  const available = {
    /* Persistence needs repeated observations of the same level, which only
       a live feed produces. A snapshot is one frame. */
    persistence: realtime,
    trades: state.trades.length > 0,
    priceHistory: history.length > 0,
    basket: true,
  };

  const named = input.strategy !== undefined ? resolvePredictionStrategy(input.strategy) : null;
  if (input.strategy !== undefined && named === null) {
    return {
      ok: false,
      reason: `"${input.strategy}" did not match any prediction strategy.`,
      market: resolved.market,
      state,
    };
  }

  const eligible = named !== null ? [named] : eligibleStrategies(available);
  const skipped: Array<{ strategyId: string; reason: string }> = [];

  if (named === null) {
    for (const strategy of PREDICTION_STRATEGIES) {
      if (eligible.includes(strategy)) continue;
      skipped.push({
        strategyId: strategy.id,
        reason: unmetRequirement(strategy, available),
      });
    }
  }

  if (eligible.length === 0) {
    return {
      ok: false,
      reason:
        "No prediction strategy can run on the data currently available. " +
        skipped.map((entry) => `${entry.strategyId}: ${entry.reason}`).join(" "),
      market: resolved.market,
      analytics: view.analytics.get(token.tokenId),
      basket: view.baskets.get(token.tokenId),
      skipped,
      state,
    };
  }

  /* ---- Evaluate ---- */

  const results: Array<{ strategy: PredictionStrategy; outcome: SignalOutcome }> = [];

  for (const strategy of eligible) {
    const measured =
      input.withWinRate === false
        ? { rate: null, reason: null }
        : await winRateFor(strategy, input.params, token.tokenId);

    const produced = generateSignal(
      {
        market: resolved.market,
        tokenId: token.tokenId,
        outcomeLabel: outcome.outcomeLabel ?? token.label,
        book: outcome.book,
        complementBook: complement?.book ?? null,
        complementTokenId: complement?.tokenId ?? null,
        complementLabel: complement?.outcomeLabel ?? null,
        trades: state.trades,
        priceHistory: history,
        tracker: realtime ? marketState.liquidityTracker() : undefined,
      },
      {
        strategy,
        params: input.params,
        winRate: measured.rate,
        winRateUnavailableReason: measured.reason,
      },
    );

    results.push({ strategy, outcome: produced });
    if (!produced.ok && produced.reason !== undefined) {
      skipped.push({ strategyId: strategy.id, reason: produced.reason });
    }
  }

  /* Strongest actionable signal wins; a WATCH beats nothing. */
  const ranked = results
    .filter((entry) => entry.outcome.ok && entry.outcome.signal !== undefined)
    .map((entry) => entry.outcome.signal as PredictionTechnicalSignal)
    .sort((a, b) => rank(b) - rank(a));

  const best = ranked[0];

  if (best === undefined) {
    const first = results[0]?.outcome;
    return {
      ok: false,
      reason: first?.reason ?? "No strategy produced a signal on this book.",
      market: resolved.market,
      analytics: view.analytics.get(token.tokenId),
      basket: view.baskets.get(token.tokenId),
      skipped,
      state,
    };
  }

  return {
    ok: true,
    signal: best,
    market: resolved.market,
    analytics: view.analytics.get(token.tokenId),
    basket: view.baskets.get(token.tokenId),
    skipped,
    state,
  };
}

function rank(signal: PredictionTechnicalSignal): number {
  const strength = signal.strength === "high" ? 3 : signal.strength === "medium" ? 2 : 1;
  const actionable =
    signal.direction === "long_yes" || signal.direction === "long_no" || signal.direction === "long_outcome"
      ? 10
      : signal.direction === "watch"
        ? 5
        : 0;
  /* A measured edge breaks ties between equally strong setups. An
     unmeasured one contributes nothing rather than counting as zero. */
  const measured =
    signal.historicalWinRate !== null && !signal.historicalWinRate.insufficientSample
      ? signal.historicalWinRate.valuePct / 100
      : 0;
  return actionable + strength + measured;
}

function unmetRequirement(
  strategy: PredictionStrategy,
  available: { persistence: boolean; trades: boolean; priceHistory: boolean; basket: boolean },
): string {
  if (strategy.requires.persistence && !available.persistence) {
    return "needs update-to-update book persistence, which requires the live feed (a REST snapshot is one frame).";
  }
  if (strategy.requires.trades && !available.trades) return "needs the trade tape, which is unavailable.";
  if (strategy.requires.priceHistory && !available.priceHistory) {
    return "needs probability history, which is unavailable.";
  }
  return "requirements not met.";
}

async function priceHistoryFor(tokenId: string, market: PredictionMarket) {
  /* Always the FULL window. `interval` is the lookback, not the bar size, so
     asking for "1d" returns about twenty-five points — fewer than the default
     24-bar lookback needs, which would make every momentum and mean-reversion
     strategy silently produce nothing.

     The BAR SIZE is what varies with the market's horizon: a market
     resolving within days needs fine bars to have any shape at all, and a
     long-dated one read at that resolution returns thousands of points to
     compute a 24-bar average over. */
  const endsAt = market.endsAt === null ? null : Date.parse(market.endsAt);
  const remaining = endsAt === null ? Infinity : endsAt - Date.now();
  const fidelityMinutes = remaining <= 3 * 86_400_000 ? 10 : 60;

  const history = await polymarketPriceHistory(tokenId, "max", fidelityMinutes);
  return history.ok && history.data !== undefined ? history.data : [];
}

async function winRateFor(
  strategy: PredictionStrategy,
  params: Record<string, number> | undefined,
  tokenId: string,
): Promise<{ rate: HistoricalWinRate | null; reason: string | null }> {
  /* An order-book strategy has nothing to measure against on ONE market —
     its corpus is what Elyra recorded across everything it watched. Scoping
     it to a token would always return an empty sample and hide the progress
     that would explain why. */
  const scoped = strategy.backtestNeedsBookHistory ? {} : { tokenId };

  const result = await backtestPredictionStrategy({ strategy, params, ...scoped });

  return result.ok && result.winRate !== undefined
    ? { rate: result.winRate, reason: null }
    : { rate: null, reason: result.reasonUnavailable ?? null };
}

/** Why a strategy carries no win rate, for display beside the blank. */
export async function winRateUnavailableReason(strategyId: string): Promise<string | null> {
  const strategy = getPredictionStrategy(strategyId);
  if (strategy === undefined) return null;
  const result = await backtestPredictionStrategy({ strategy });
  return result.ok ? null : (result.reasonUnavailable ?? null);
}
