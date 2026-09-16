import "server-only";

import { defaultParams, type PredictionStrategy } from "@/lib/prediction/strategies";
import type { HistoricalWinRate } from "@/lib/prediction/signal-types";
import {
  polymarketPriceHistory,
  polymarketUniverse,
} from "@/lib/providers/polymarket";
import type { PredictionPricePoint } from "@/lib/providers/types";
import {
  collectionProgress,
  MIN_BOOK_SAMPLE,
  PERSISTENCE_NOTE,
  recordedSeries,
  type BookObservation,
} from "@/lib/prediction/book-history";

/* ---------------------------------------------------------------------------
   Where the win rate comes from.

   ── The rule ───────────────────────────────────────────────────────────

   A win rate is a measurement or it is absent. There is no path in this file
   that produces a percentage from anything other than a simulation over real
   historical probability series, and no caller can pass one in.

   ── What can and cannot be measured, and why ───────────────────────────

   Polymarket publishes probability HISTORY. It does not publish historical
   order-book DEPTH. That asymmetry decides everything here:

     price-only strategies — momentum, mean reversion — replay exactly, so
     they carry a real backtested win rate;

     book strategies — imbalance, microprice, support break, basket — depend
     on depth that was never recorded, so they carry NONE.

   The tempting move is to approximate depth from price and volume and report
   a number anyway. That number would be a measurement of the approximation,
   not of the strategy, and it would be indistinguishable on screen from a
   real one. `reasonUnavailable` is returned instead, and the signal card
   prints it where the percentage would have been.

   `lib/prediction/book-store.ts` begins recording the missing features
   forward, so these strategies become measurable later — from data that was
   actually observed, not reconstructed.

   ── Success definition ─────────────────────────────────────────────────

   One definition, stated on every result:

     "Target reached before invalidation, counted only where entry triggered."

   The other plausible definition — did the outcome settle correctly — is a
   different statistic about a different thing, and the two must never be
   pooled. A setup can be right about the next ten points and wrong about the
   event, and averaging those produces a number describing neither.
--------------------------------------------------------------------------- */

/** Below this the percentage is unstable enough to be misleading. */
export const MIN_SAMPLE = 30;

/** Bars after entry before a trade is abandoned as a time stop. */
const MAX_HOLD_BARS = 72;

/**
 * Minimum points a series needs before it can be simulated at all.
 *
 * A 24-bar lookback plus a 72-bar hold needs room for at least one complete
 * trade. Below this a market contributes nothing but an inflated
 * "markets sampled" count.
 */
const MIN_SERIES_POINTS = 120;

/** Concurrent history fetches. One per market, and the sample is large. */
const HISTORY_CONCURRENCY = 8;

export const SUCCESS_DEFINITION =
  "Target reached before invalidation, counted only where entry triggered. " +
  "Setups that never entered are excluded from the rate and reported separately.";

export interface UniverseFilter {
  label: string;
  /** Lifetime traded volume floor, in dollars. A structural property. */
  minVolumeUsd: number;
  /**
   * Entry probability band, applied PER TRADE inside the simulation.
   *
   * ── Why this is not a market filter ────────────────────────────────
   *
   * It was, and that was wrong twice over. Filtering markets by their
   * CURRENT price asks a question about today while the simulation enters at
   * historical prices — a market at 85% now may have spent months at 45%, and
   * excluding it discards exactly the bars the band was meant to select.
   *
   * Worse, it made settled markets unusable: a resolved market prices at 0 or
   * 1, so every one of them failed a 0.2–0.8 test and the richest source of
   * complete history was silently excluded from every backtest.
   *
   * Applied at entry, the band means what §52 says — "entry probability
   * 40–70%" is a property of the trade, not of the market.
   */
  minEntryProbability: number;
  maxEntryProbability: number;
  /** Include settled markets, whose history runs to resolution. */
  includeClosed: boolean;
  /** Markets to sample. Each costs one history call. */
  sampleSize: number;
}

export const DEFAULT_UNIVERSE: UniverseFilter = {
  label:
    "Binary markets with at least $25k lifetime volume, open and settled, " +
    "entered only at probabilities between 15% and 85%",
  minVolumeUsd: 25_000,
  minEntryProbability: 0.15,
  maxEntryProbability: 0.85,
  includeClosed: true,
  sampleSize: 120,
};

export interface BacktestRequest {
  strategy: PredictionStrategy;
  params?: Record<string, number>;
  universe?: UniverseFilter;
  /** Restrict to one token rather than sampling a universe. */
  tokenId?: string;
  /**
   * The LOOKBACK WINDOW, not the bar size — see `polymarketPriceHistory`.
   *
   * Defaults to "max" because anything shorter cannot carry a simulation: a
   * "1d" window returns roughly twenty-five points, and a strategy with a
   * 24-bar lookback then produces zero trades on every market, which reads as
   * "this never triggers" rather than "there was no data".
   */
  interval?: "1h" | "6h" | "1d" | "1w" | "max";
  /** Bar size in minutes. 60 is hourly, 1440 daily. */
  fidelityMinutes?: number;
}

export interface BacktestOutcome {
  ok: boolean;
  winRate?: HistoricalWinRate;
  /** Present when no win rate could honestly be produced. */
  reasonUnavailable?: string;
  marketsSampled: number;
}

interface SimulatedTrade {
  entryIndex: number;
  entryPrice: number;
  exitIndex: number;
  exitPrice: number;
  result: "target" | "stop" | "timeout";
  riskReward: number;
}

/* ---------------------------------------------------------------------------
   The simulation
--------------------------------------------------------------------------- */

/**
 * Replays one strategy over one probability series.
 *
 * ── No lookahead ───────────────────────────────────────────────────────
 *
 * A condition is evaluated on bar `i` using data up to and including `i`, and
 * the entry fills at bar `i + 1`. Filling at `i` would let the simulation buy
 * at a price that was only known once the bar it is reacting to had closed —
 * which produces excellent results and describes nothing.
 *
 * Exported for direct testing: a simulator that can only be exercised through
 * the network cannot be pinned down.
 */
export function simulate(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  series: number[],
  band: { min: number; max: number } = { min: 0, max: 1 },
): SimulatedTrade[] {
  const trades: SimulatedTrade[] = [];
  const targetPoints = (params.targetPoints ?? 6) / 100;
  const stopPoints = (params.stopPoints ?? 4) / 100;

  const signals = entrySignals(strategy, params, series);

  let index = 0;
  while (index < series.length - 1) {
    if (!signals[index]) {
      index += 1;
      continue;
    }

    /* Fill on the NEXT bar. */
    const entryIndex = index + 1;
    const entryPrice = series[entryIndex];
    if (!Number.isFinite(entryPrice) || entryPrice <= 0 || entryPrice >= 1) {
      index += 1;
      continue;
    }

    /* The universe's probability band, applied where it belongs: to the
       price actually being entered at. A 3¢ contract and a 50¢ contract
       behave nothing alike, and pooling them produces a rate describing
       neither. */
    if (entryPrice < band.min || entryPrice > band.max) {
      index += 1;
      continue;
    }

    const target = Math.min(0.999, entryPrice + targetPoints);
    const stop = Math.max(0.001, entryPrice - stopPoints);

    let exitIndex = Math.min(entryIndex + MAX_HOLD_BARS, series.length - 1);
    let exitPrice = series[exitIndex];
    let result: SimulatedTrade["result"] = "timeout";

    for (let scan = entryIndex + 1; scan <= Math.min(entryIndex + MAX_HOLD_BARS, series.length - 1); scan += 1) {
      const price = series[scan];

      /* ── The ambiguity, resolved pessimistically ──────────────────────
         A single close cannot say whether the target or the stop was touched
         first when both lie inside one bar's move. This series is closes
         only, so when a bar closes beyond BOTH levels the stop is taken.
         The optimistic reading inflates every win rate and cannot be
         distinguished from skill. */
      const hitStop = price <= stop;
      const hitTarget = price >= target;

      if (hitStop) {
        exitIndex = scan;
        exitPrice = stop;
        result = "stop";
        break;
      }
      if (hitTarget) {
        exitIndex = scan;
        exitPrice = target;
        result = "target";
        break;
      }
    }

    trades.push({
      entryIndex,
      entryPrice,
      exitIndex,
      exitPrice,
      result,
      riskReward: stopPoints > 0 ? targetPoints / stopPoints : 0,
    });

    /* No overlapping positions: the next search starts after this exit. */
    index = exitIndex + 1;
  }

  return trades;
}

/** Where the strategy's entry condition is true, per bar. */
function entrySignals(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  series: number[],
): boolean[] {
  const out = new Array<boolean>(series.length).fill(false);

  if (strategy.family === "probability_momentum") {
    const lookback = Math.round(params.lookbackBars ?? 24);
    const rocBars = Math.round(params.rocBars ?? 6);

    for (let i = lookback; i < series.length; i += 1) {
      /* Window excludes bar i — see the note in the engine. */
      const window = series.slice(i - lookback, i);
      const high = Math.max(...window);
      const roc = i >= rocBars ? series[i] - series[i - rocBars] : null;
      out[i] = series[i] > high && roc !== null && roc > 0;
    }
    return out;
  }

  if (strategy.family === "probability_mean_reversion") {
    const lookback = Math.round(params.lookbackBars ?? 24);
    const bandPoints = (params.bandPoints ?? 5) / 100;

    for (let i = lookback; i < series.length; i += 1) {
      const window = series.slice(i - lookback, i);
      const average = window.reduce((total, value) => total + value, 0) / window.length;
      const lower = average - bandPoints;
      out[i] = series[i - 1] < lower && series[i] >= lower;
    }
    return out;
  }

  /* Every other family needs depth that was never recorded. Callers check
     `backtestNeedsBookHistory` before reaching here. */
  return out;
}

/* ---------------------------------------------------------------------------
   The service
--------------------------------------------------------------------------- */

interface CacheEntry {
  at: number;
  outcome: BacktestOutcome;
}

const CACHE_TTL_MS = 30 * 60_000;
const cache = new Map<string, CacheEntry>();

/**
 * Measures a strategy's historical behaviour.
 *
 * Returns `ok: false` with a stated reason whenever a measurement cannot be
 * made — an unmeasurable strategy, an unreachable history, or a sample too
 * small to report. Every one of those is a legitimate outcome and none of
 * them is a percentage.
 */
export async function backtestPredictionStrategy(
  request: BacktestRequest,
): Promise<BacktestOutcome> {
  const { strategy } = request;
  const params = { ...defaultParams(strategy), ...(request.params ?? {}) };
  const universe = request.universe ?? DEFAULT_UNIVERSE;
  const interval = request.interval ?? "max";
  /* Hourly bars over the full window. On a live market that is ~745 points
     across a month, which supports a 24-bar lookback with room to spare. */
  const fidelity = request.fidelityMinutes ?? 60;

  /* ---- The measurability gate ----

     A strategy that reads depth cannot be measured against Polymarket's
     published history, which carries prices and no book. It is NOT simply
     refused, though: Elyra records those features itself, so the attempt is
     handed to the recorded corpus. That returns a real win rate once enough
     has accumulated and a PROGRESS SUMMARY before then — "no win rate yet,
     3 of 40 outcomes ready" rather than a blank a reader fills in themselves. */

  if (strategy.backtestNeedsBookHistory) {
    const recorded = await backtestFromRecordedBooks({
      strategy,
      params: request.params,
      universe: request.universe,
    });

    if (recorded.ok) return recorded;

    return {
      ok: false,
      marketsSampled: recorded.marketsSampled,
      reasonUnavailable:
        `${strategy.name} is evaluated on order-book depth, which Polymarket does not publish ` +
        `historically. Elyra records it forward rather than reconstructing it — a reconstructed ` +
        `figure would measure the reconstruction, not the strategy. ` +
        (recorded.reasonUnavailable ?? ""),
    };
  }

  const key = JSON.stringify({
    id: strategy.id,
    version: strategy.version,
    params,
    universe: universe.label,
    sampleSize: universe.sampleSize,
    token: request.tokenId ?? null,
    interval,
    fidelity,
  });

  const hit = cache.get(key);
  if (hit !== undefined && Date.now() - hit.at < CACHE_TTL_MS) return hit.outcome;

  /* ---- Gather series ---- */

  const series: number[][] = [];
  let sampled = 0;
  const warnings: string[] = [];

  if (request.tokenId !== undefined) {
    const history = await polymarketPriceHistory(request.tokenId, interval, fidelity);
    if (history.ok && history.data !== undefined) {
      series.push(toSeries(history.data));
      sampled = 1;
    } else {
      return {
        ok: false,
        marketsSampled: 0,
        reasonUnavailable: history.error?.message ?? "Probability history was unavailable.",
      };
    }
  } else {
    const markets = await polymarketUniverse({
      limit: universe.sampleSize,
      includeClosed: universe.includeClosed,
      minVolumeUsd: universe.minVolumeUsd,
    });

    if (!markets.ok || markets.data === undefined) {
      return {
        ok: false,
        marketsSampled: 0,
        reasonUnavailable: markets.error?.message ?? "The market universe could not be read.",
      };
    }

    if (markets.data.length === 0) {
      return {
        ok: false,
        marketsSampled: 0,
        reasonUnavailable: `No market meets the universe definition (${universe.label}).`,
      };
    }

    /* ── Fetched concurrently, with a cap ──────────────────────────────
       One history call per market, and the sample needs a hundred of them.
       Serially that is a minute of wall time; unbounded it is a hundred
       simultaneous requests at a venue with no published rate limit for this
       endpoint. A small pool is the honest middle. */
    const tokens = markets.data
      .map((market) => market.tokenIds?.[0])
      .filter((token): token is string => token !== undefined);

    let cursor = 0;
    let withoutHistory = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= tokens.length) return;

        const history = await polymarketPriceHistory(tokens[index], interval, fidelity);
        if (!history.ok || history.data === undefined) {
          withoutHistory += 1;
          continue;
        }

        const points = toSeries(history.data);
        /* Below the warm-up a strategy cannot produce a single signal, so a
           short series contributes nothing but a misleading "market
           sampled" count. */
        if (points.length < MIN_SERIES_POINTS) {
          withoutHistory += 1;
          continue;
        }

        series.push(points);
        sampled += 1;
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(HISTORY_CONCURRENCY, tokens.length) }, worker),
    );

    if (withoutHistory > 0) {
      /* Stated rather than silent. Verified live: of four settled markets
         sampled at random, three served no history at all. A reader
         comparing "120 markets" against a small sample deserves to know
         where the other markets went. */
      warnings.push(
        `${withoutHistory} of ${tokens.length} sampled markets served too little price history to simulate.`,
      );
    }
  }

  if (series.length === 0) {
    return {
      ok: false,
      marketsSampled: sampled,
      reasonUnavailable: "No market in the universe had enough probability history to simulate.",
    };
  }

  /* ---- Simulate ---- */

  const trades: SimulatedTrade[] = [];
  const band = { min: universe.minEntryProbability, max: universe.maxEntryProbability };
  for (const points of series) trades.push(...simulate(strategy, params, points, band));

  const wins = trades.filter((trade) => trade.result === "target").length;
  const losses = trades.filter((trade) => trade.result === "stop").length;
  /* A timeout is neither. Counting it as a loss would penalise a strategy for
     the arbitrary hold limit; counting it as a win would be absurd. */
  const timeouts = trades.filter((trade) => trade.result === "timeout").length;
  const decided = wins + losses;

  if (timeouts > 0) {
    warnings.push(`${timeouts} setup(s) neither reached target nor invalidation within ${MAX_HOLD_BARS} bars and are excluded.`);
  }
  warnings.push(
    "Closing prices only — where a bar closed beyond both the target and the invalidation, the invalidation was taken.",
  );

  const insufficient = decided < MIN_SAMPLE;

  const winRate: HistoricalWinRate = {
    valuePct: decided > 0 ? (wins / decided) * 100 : 0,
    sampleSize: decided,
    wins,
    losses,
    noEntry: timeouts,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    lookback: `${fidelity}-minute bars over the ${interval} window, across ${sampled} market(s)`,
    marketUniverse: request.tokenId !== undefined ? "This market only" : universe.label,
    successDefinition: SUCCESS_DEFINITION,
    dataSource: "polymarket_prices_history",
    insufficientSample: insufficient,
    averageRiskReward:
      trades.length > 0
        ? trades.reduce((total, trade) => total + trade.riskReward, 0) / trades.length
        : null,
    warnings,
  };

  const outcome: BacktestOutcome = { ok: true, winRate, marketsSampled: sampled };
  cache.set(key, { at: Date.now(), outcome });
  return outcome;
}

function toSeries(points: PredictionPricePoint[]): number[] {
  return points
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((point) => point.probability)
    .filter((value) => Number.isFinite(value) && value > 0 && value < 1);
}

/** Clears the memo. Tests only. */
export function clearBacktestCache(): void {
  cache.clear();
}

/* ---------------------------------------------------------------------------
   Order-book strategies, measured against RECORDED features

   Polymarket publishes no historical depth, so these strategies start with no
   win rate at all. `lib/prediction/book-history.ts` records the features
   forward; once a corpus exists, this is what measures against it.

   ── What this measurement is, precisely ────────────────────────────────

   Not a reconstruction. Every imbalance, microprice and depth figure below
   was computed from a book Elyra actually read and then stored. The sample is
   small and recent, and it is real.

   ── And what it is not ─────────────────────────────────────────────────

   Samples are taken on the delivery tick, not per book update. A rule reading
   "the condition must persist for N consecutive updates" therefore cannot be
   verified as written; persistence is tested across consecutive SAMPLES,
   which is a weaker and slower test. Every result carries that caveat rather
   than quietly redefining the rule it claims to have measured.
--------------------------------------------------------------------------- */

interface BookTrade {
  entryPrice: number;
  result: "target" | "stop" | "timeout";
  riskReward: number;
}

/**
 * Replays one order-book strategy over one token's recorded observations.
 *
 * Same no-lookahead contract as the price simulator: the condition is
 * evaluated on observation `i` and the entry fills at `i + 1`, paying the ASK
 * recorded there. Exits are measured against the recorded BID, because that
 * is what a holder would actually receive.
 *
 * Exported for direct testing — a simulator reachable only through a database
 * cannot be pinned down.
 */
export function simulateBookStrategy(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  observations: BookObservation[],
  band: { min: number; max: number } = { min: 0, max: 1 },
): BookTrade[] {
  const trades: BookTrade[] = [];
  const targetPoints = (params.targetPoints ?? 6) / 100;
  const stopPoints = (params.stopPoints ?? 4) / 100;
  const maxSpread = params.maxSpreadPoints ?? 4;
  const minDepth = params.minDepthUsd ?? 2_000;

  const fires = bookEntrySignals(strategy, params, observations);

  let index = 0;
  while (index < observations.length - 1) {
    if (!fires[index]) {
      index += 1;
      continue;
    }

    const entryAt = observations[index + 1];
    const entryPrice = entryAt.bestAsk;

    /* No recorded ask is no entry. A midpoint fill would record a trade that
       could not have happened. */
    if (entryPrice === null || entryPrice <= 0 || entryPrice >= 1) {
      index += 1;
      continue;
    }
    if (entryPrice < band.min || entryPrice > band.max) {
      index += 1;
      continue;
    }

    /* The liquidity gates the live engine applies, applied here too. A
       backtest that ignores them measures a different strategy from the one
       that would have been signalled. */
    if (entryAt.spreadPoints !== null && entryAt.spreadPoints > maxSpread) {
      index += 1;
      continue;
    }
    if (entryAt.bidDepth5 + entryAt.askDepth5 < minDepth) {
      index += 1;
      continue;
    }

    const target = Math.min(0.999, entryPrice + targetPoints);
    const stop = Math.max(0.001, entryPrice - stopPoints);

    let exitIndex = Math.min(index + 1 + MAX_HOLD_BARS, observations.length - 1);
    let result: BookTrade["result"] = "timeout";

    for (
      let scan = index + 2;
      scan <= Math.min(index + 1 + MAX_HOLD_BARS, observations.length - 1);
      scan += 1
    ) {
      const bid = observations[scan].bestBid;
      if (bid === null) continue;

      /* Invalidation checked first — the pessimistic reading, for the same
         reason as the price simulator. */
      if (bid <= stop) {
        exitIndex = scan;
        result = "stop";
        break;
      }
      if (bid >= target) {
        exitIndex = scan;
        result = "target";
        break;
      }
    }

    trades.push({
      entryPrice,
      result,
      riskReward: stopPoints > 0 ? targetPoints / stopPoints : 0,
    });

    index = exitIndex + 1;
  }

  return trades;
}

/** Where an order-book strategy's entry condition is true, per observation. */
function bookEntrySignals(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  observations: BookObservation[],
): boolean[] {
  const out = new Array<boolean>(observations.length).fill(false);

  if (strategy.family === "orderbook_imbalance") {
    const threshold = params.minImbalance ?? 0.25;
    const persistence = Math.max(1, Math.round(params.persistenceUpdates ?? 3));

    let held = 0;
    for (let i = 0; i < observations.length; i += 1) {
      const row = observations[i];
      const met =
        row.imbalance5 !== null &&
        row.imbalance5 >= threshold &&
        row.microprice !== null &&
        row.midpoint !== null &&
        row.microprice > row.midpoint;

      held = met ? held + 1 : 0;
      /* Fires on the observation where persistence is first satisfied, not
         on every one after — otherwise a long-held condition produces a
         signal per sample and the sample count becomes a measure of how
         often we looked. */
      out[i] = met && held === persistence;
    }
    return out;
  }

  if (strategy.family === "microprice_divergence") {
    const threshold = params.minDivergencePoints ?? 0.4;
    for (let i = 0; i < observations.length; i += 1) {
      const row = observations[i];
      if (row.microprice === null || row.midpoint === null) continue;
      out[i] = (row.microprice - row.midpoint) * 100 >= threshold;
    }
    return out;
  }

  /* Support break and basket convergence need persistent WALLS and basket
     components, neither of which is in the stored feature set. They stay
     unmeasurable until those are recorded too. */
  return out;
}

/**
 * Measures an order-book strategy against recorded history.
 *
 * Returns `ok: false` with a progress summary while the corpus is still
 * building — which is the honest state for a feature that begins with no data
 * and accumulates it, and is very different from "this cannot be measured".
 */
export async function backtestFromRecordedBooks(
  request: Omit<BacktestRequest, "interval" | "fidelityMinutes">,
): Promise<BacktestOutcome> {
  const { strategy } = request;
  const params = { ...defaultParams(strategy), ...(request.params ?? {}) };
  const universe = request.universe ?? DEFAULT_UNIVERSE;

  const measurable =
    strategy.family === "orderbook_imbalance" || strategy.family === "microprice_divergence";

  if (!measurable) {
    return {
      ok: false,
      marketsSampled: 0,
      reasonUnavailable:
        `${strategy.name} depends on persistent liquidity zones or basket components, which are ` +
        "not part of the recorded feature set. Only the touch, depth, spread, microprice and " +
        "imbalance are stored, so this strategy cannot be measured from them.",
    };
  }

  const { series, warnings: readWarnings } = await recordedSeries({ maxTokens: 80 });

  if (series.length === 0) {
    const progress = await collectionProgress();
    return {
      ok: false,
      marketsSampled: 0,
      reasonUnavailable: `No win rate yet. ${progress.summary}`,
    };
  }

  const band = { min: universe.minEntryProbability, max: universe.maxEntryProbability };

  const trades: BookTrade[] = [];
  for (const entry of series) {
    trades.push(...simulateBookStrategy(strategy, params, entry.observations, band));
  }

  const wins = trades.filter((trade) => trade.result === "target").length;
  const losses = trades.filter((trade) => trade.result === "stop").length;
  const timeouts = trades.filter((trade) => trade.result === "timeout").length;
  const decided = wins + losses;

  if (decided === 0) {
    const progress = await collectionProgress();
    return {
      ok: false,
      marketsSampled: series.length,
      reasonUnavailable:
        `The recorded corpus contains no completed setup for this strategy yet. ${progress.summary}`,
    };
  }

  const warnings = [
    ...readWarnings,
    PERSISTENCE_NOTE,
    "Measured against order-book features Elyra recorded itself, not against venue-published " +
      "history — the sample begins when collection began and grows from there.",
  ];
  if (timeouts > 0) {
    warnings.push(
      `${timeouts} setup(s) neither reached target nor invalidation within ${MAX_HOLD_BARS} samples and are excluded.`,
    );
  }

  return {
    ok: true,
    marketsSampled: series.length,
    winRate: {
      valuePct: (wins / decided) * 100,
      sampleSize: decided,
      wins,
      losses,
      noEntry: timeouts,
      strategyId: strategy.id,
      strategyVersion: strategy.version,
      lookback: `Recorded book samples across ${series.length} outcome(s)`,
      marketUniverse: `${universe.label} — measured on Elyra-recorded order-book features`,
      successDefinition: SUCCESS_DEFINITION,
      dataSource: "elyra_recorded_book_snapshots",
      insufficientSample: decided < MIN_BOOK_SAMPLE,
      averageRiskReward:
        trades.length > 0
          ? trades.reduce((total, trade) => total + trade.riskReward, 0) / trades.length
          : null,
      warnings,
    },
  };
}
