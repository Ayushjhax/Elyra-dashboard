import { randomUUID } from "node:crypto";

import { ageMs, isCrossed, isTwoSided, roundToTick, type NormalizedBook } from "@/lib/prediction/book";
import {
  analyseBook,
  nearestZone,
  type BookAnalytics,
  type LiquidityTracker,
} from "@/lib/prediction/book-analytics";
import { buildBasket, type ProbabilityBasket } from "@/lib/prediction/basket";
import { estimateExecution } from "@/lib/prediction/execution";
import { STALE_AFTER_MS } from "@/lib/prediction/state";
import {
  defaultParams,
  type PredictionStrategy,
} from "@/lib/prediction/strategies";
import type {
  HistoricalWinRate,
  LiquidityQuality,
  PredictionTechnicalSignal,
  ResolutionProximity,
  SignalDirection,
  SignalEntry,
  SignalEvidence,
  SignalStop,
  SignalStrength,
  SignalTarget,
} from "@/lib/prediction/signal-types";
import type { PredictionMarket, PredictionPricePoint, PredictionTrade } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The signal engine.

   Deterministic throughout. Given the same book, tape, history and parameters
   it produces the same signal, byte for byte. No model is consulted at any
   point, and there is no path by which one could write a number into the
   result.

   ── The gates come first, and they are not advisory ────────────────────

   A setup is checked against freshness, spread, depth and resolution
   proximity BEFORE any direction is taken. That ordering matters: an engine
   that finds a direction and then downgrades it produces a "low strength LONG
   YES" on a stale, illiquid book, and a reader sees the direction, not the
   caveat. Failing the gates returns WATCH with the reason attached, which is
   a different thing to look at.

   ── Every threshold is a parameter, every parameter is recorded ────────

   Nothing below hard-codes a threshold in a comparison. The strategy supplies
   them, the caller may override them, and the values used land in the
   signal's evidence so the number can be argued with later.

   ── Long-only, always ──────────────────────────────────────────────────

   Being bearish on YES is expressed by buying NO, which is a long position in
   a different contract with its own book and its own ask. It is NOT a short,
   and it is not priced off the YES bid — that would be a different trade at a
   different price.
--------------------------------------------------------------------------- */

/** A signal is a snapshot of a moving book. It does not stay true. */
export const SIGNAL_TTL_MS = 5 * 60_000;

/** Inside this window a strategy marked `disabledWhenImminent` stands down. */
export const IMMINENT_MS = 60 * 60_000;
const NEAR_MS = 24 * 60 * 60_000;
const MEDIUM_MS = 7 * 24 * 60 * 60_000;

export interface SignalContext {
  market: PredictionMarket;
  /** The outcome being evaluated. */
  tokenId: string;
  outcomeLabel: string;
  book: NormalizedBook;
  /** The other side, for the basket's integrity check and for LONG NO. */
  complementBook?: NormalizedBook | null;
  complementTokenId?: string | null;
  complementLabel?: string | null;
  trades?: PredictionTrade[];
  priceHistory?: PredictionPricePoint[];
  tracker?: LiquidityTracker;
  now?: number;
}

export interface SignalRequest {
  strategy: PredictionStrategy;
  params?: Record<string, number>;
  /** Attached verbatim. Produced by the backtest service, never invented. */
  winRate?: HistoricalWinRate | null;
  /** Why there is none, when there is none. Also produced by that service. */
  winRateUnavailableReason?: string | null;
}

export interface SignalOutcome {
  ok: boolean;
  signal?: PredictionTechnicalSignal;
  /** Why no signal could be produced. Reported plainly, never filled in. */
  reason?: string;
  analytics?: BookAnalytics;
  basket?: ProbabilityBasket;
}

/* ---------------------------------------------------------------------------
   Resolution timing
--------------------------------------------------------------------------- */

export function resolutionProximity(
  endsAt: string | null | undefined,
  now: number,
): { ms: number | null; proximity: ResolutionProximity } {
  if (endsAt === null || endsAt === undefined) return { ms: null, proximity: "unknown" };
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end)) return { ms: null, proximity: "unknown" };

  const ms = end - now;
  if (ms <= 0) return { ms, proximity: "imminent" };
  if (ms <= IMMINENT_MS) return { ms, proximity: "imminent" };
  if (ms <= NEAR_MS) return { ms, proximity: "near" };
  if (ms <= MEDIUM_MS) return { ms, proximity: "medium" };
  return { ms, proximity: "far" };
}

/* ---------------------------------------------------------------------------
   Liquidity
--------------------------------------------------------------------------- */

export function liquidityQualityOf(
  analytics: BookAnalytics,
  params: Record<string, number>,
): { quality: LiquidityQuality; reasons: string[] } {
  const reasons: string[] = [];
  const maxSpread = params.maxSpreadPoints ?? 4;
  const minDepth = params.minDepthUsd ?? 2_000;

  const spread = analytics.spreadPoints;
  const depth = analytics.depth.top5.askUsd + analytics.depth.top5.bidUsd;

  if (analytics.oneSided) {
    return { quality: "poor", reasons: ["Only one side of the book has resting orders."] };
  }
  if (analytics.crossed) {
    return { quality: "poor", reasons: ["The book is crossed."] };
  }

  /* Spreads and depths are sums of floats, so a 2-point spread arrives as
     2.0000000000000018 and fails a `<= 2` test. Comparisons are made with a
     tolerance well below a tick, so a threshold means what it says. */
  const EPSILON = 1e-9;

  let score = 0;
  /* A gate that FAILS caps the result, rather than being outvoted by the
     other one. A 40-point spread on a deep book is not "fair" liquidity, and
     a $12 book with a 1-point spread is not either — each failure alone
     makes the market unusable for an actionable signal. */
  let gateFailed = false;

  if (spread === null) {
    reasons.push("Spread unavailable.");
    gateFailed = true;
  } else if (spread <= maxSpread / 2 + EPSILON) {
    score += 2;
  } else if (spread <= maxSpread + EPSILON) {
    score += 1;
  } else {
    reasons.push(`Spread ${spread.toFixed(1)} points exceeds the ${maxSpread}-point limit.`);
    gateFailed = true;
  }

  if (depth >= minDepth * 2 - EPSILON) {
    score += 2;
  } else if (depth >= minDepth - EPSILON) {
    score += 1;
  } else {
    reasons.push(
      `Top-5 depth $${Math.round(depth).toLocaleString()} is below the $${minDepth.toLocaleString()} floor.`,
    );
    gateFailed = true;
  }

  const quality: LiquidityQuality = gateFailed
    ? "poor"
    : score >= 4
      ? "good"
      : score >= 2
        ? "fair"
        : "poor";

  return { quality, reasons };
}

/* ---------------------------------------------------------------------------
   The engine
--------------------------------------------------------------------------- */

export function generateSignal(
  context: SignalContext,
  request: SignalRequest,
): SignalOutcome {
  const now = context.now ?? Date.now();
  const { strategy } = request;
  const params = { ...defaultParams(strategy), ...(request.params ?? {}) };

  const analytics = analyseBook(context.book, context.tracker);
  const basket = buildBasket({
    book: context.book,
    complementBook: context.complementBook ?? null,
    trades: context.trades,
    outcomeLabel: context.outcomeLabel,
    now,
  });

  const warnings: string[] = [];
  const evidence: SignalEvidence[] = [];
  const stamp = context.book.timestamp;

  const note = (
    key: string,
    label: string,
    value: number | string,
    direction: SignalEvidence["direction"],
    source: string,
  ): void => {
    evidence.push({ key, label, value, direction, source, timestamp: stamp });
  };

  /* ---- Gate 1: the book must be usable at all ----------------------- */

  if (!isTwoSided(context.book)) {
    return refuse(context, strategy, "Only one side of the book has resting orders — there is no tradable setup.", analytics, basket);
  }
  if (isCrossed(context.book)) {
    return refuse(context, strategy, "The book is crossed; the best bid is at or above the best ask.", analytics, basket);
  }

  /* ---- Gate 2: freshness ------------------------------------------- */

  const freshness = ageMs(context.book, now);
  if (freshness > STALE_AFTER_MS) {
    return refuse(
      context,
      strategy,
      `The order book is ${Math.round(freshness / 1000)}s old, past the ${STALE_AFTER_MS / 1000}s limit. No actionable signal is generated from a stale book.`,
      analytics,
      basket,
    );
  }

  if (context.book.transport === "rest_snapshot") {
    warnings.push(
      "Built from a REST snapshot, not the live feed. Correct as of its timestamp, with no update stream behind it.",
    );
  }

  /* ---- Gate 3: the strategy's own data requirements ----------------- */

  if (strategy.requires.persistence && context.tracker === undefined) {
    return refuse(
      context,
      strategy,
      `${strategy.name} needs update-to-update persistence, which a single snapshot cannot demonstrate. Requires the live feed.`,
      analytics,
      basket,
    );
  }
  if (strategy.requires.trades && (context.trades ?? []).length === 0) {
    return refuse(context, strategy, `${strategy.name} needs the trade tape, which is unavailable.`, analytics, basket);
  }
  if (strategy.requires.priceHistory && (context.priceHistory ?? []).length === 0) {
    return refuse(context, strategy, `${strategy.name} needs probability history, which is unavailable.`, analytics, basket);
  }

  /* ---- Gate 4: resolution proximity --------------------------------- */

  const timing = resolutionProximity(context.market.endsAt, now);
  if (strategy.disabledWhenImminent && timing.proximity === "imminent") {
    return refuse(
      context,
      strategy,
      "Resolution is within the hour. Microstructure edges decay into settlement — the book thins and the price pins — so this strategy stands down.",
      analytics,
      basket,
    );
  }

  /* ---- Gate 5: liquidity -------------------------------------------- */

  const liquidity = liquidityQualityOf(analytics, params);
  for (const reason of liquidity.reasons) warnings.push(reason);

  note("spread", "Spread", analytics.spreadPoints === null ? "unavailable" : `${analytics.spreadPoints.toFixed(1)} pts`, analytics.spreadPoints !== null && analytics.spreadPoints <= (params.maxSpreadPoints ?? 4) ? "supports" : "contradicts", "orderbook_analytics");
  note("depth_top5", "Top-5 depth", `$${Math.round(analytics.depth.top5.bidUsd + analytics.depth.top5.askUsd).toLocaleString()}`, liquidity.quality === "poor" ? "contradicts" : "supports", "orderbook_analytics");

  /* ---- Direction -------------------------------------------------- */

  const decision = decideDirection(strategy, params, {
    analytics,
    basket,
    book: context.book,
    trades: context.trades ?? [],
    priceHistory: context.priceHistory ?? [],
    now,
  });

  for (const item of decision.evidence) evidence.push({ ...item, timestamp: stamp });

  /* A poor-liquidity book cannot carry an actionable direction. Downgraded
     to WATCH rather than emitted with a caveat — §44. */
  let direction: SignalDirection = decision.direction;
  if (direction !== "neutral" && direction !== "watch" && liquidity.quality === "poor") {
    direction = "watch";
    warnings.push("Direction downgraded to WATCH: liquidity is too poor to act on.");
  }

  /* ---- The executable side ---------------------------------------- */

  /* LONG NO is a long position in the NO contract, priced off the NO book's
     own ask. Pricing it off the YES bid would be a different trade. */
  const wantsComplement = direction === "long_no";

  /* ── Not every binary market is a YES/NO market ──────────────────────
     "Suzan Lamens vs Carolina M. Alves" has two outcomes, neither called Yes
     nor No. Rendering "LONG NO" there names nothing a reader can act on, and
     actively misleads: the complement is a PLAYER, not a negation. So the
     direction becomes `long_outcome`, which every renderer pairs with the
     outcome's real label. */
  const binaryYesNo = ["yes", "no"].includes(context.outcomeLabel.trim().toLowerCase());
  const executionBook = wantsComplement ? (context.complementBook ?? null) : context.book;

  if (wantsComplement && executionBook === null) {
    return refuse(
      context,
      strategy,
      "The setup points at the complementary outcome, but its book was not supplied — the entry cannot be priced.",
      analytics,
      basket,
    );
  }

  const tradedBook = executionBook ?? context.book;
  const tradedTokenId = wantsComplement ? (context.complementTokenId ?? context.tokenId) : context.tokenId;
  const tradedLabel = wantsComplement ? (context.complementLabel ?? "No") : context.outcomeLabel;

  /* Re-labelled once the traded contract is known, so the direction always
     matches the outcome actually being bought. */
  if (!binaryYesNo && (direction === "long_yes" || direction === "long_no")) {
    direction = "long_outcome";
  }

  /* ---- Entry, target, stop ----------------------------------------- */

  const referenceSize = params.referenceSizeUsd ?? 500;
  const execution = estimateExecution(tradedBook, { side: "buy", notionalUsd: referenceSize });
  for (const warning of execution.warnings) warnings.push(warning);

  const tick = tradedBook.tickSize;
  const touchAsk = tradedBook.bestAsk;

  const actionable = direction === "long_yes" || direction === "long_no" || direction === "long_outcome";

  let entry: SignalEntry = { type: "zone", trigger: decision.entryTrigger };
  let target: SignalTarget = { basis: "Not applicable — no actionable direction." };
  let stop: SignalStop = { basis: "Not applicable — no actionable direction.", executable: false };
  let riskReward: number | null = null;

  if (actionable) {
    if (touchAsk === null) {
      return refuse(context, strategy, "No resting asks on the traded outcome — there is no entry price.", analytics, basket);
    }

    const executable = execution.filled ? execution.averagePrice : null;
    if (executable === null) {
      return refuse(
        context,
        strategy,
        `The book cannot absorb the $${referenceSize} reference size — there is no executable entry.`,
        analytics,
        basket,
      );
    }

    /* The zone spans the touch to what the reference size actually averages.
       A single-number entry hides the cost of size, which is exactly the
       error the execution estimator exists to prevent. Rounded UP, so the
       quoted entry is one a taker can be filled at. */
    const entryLow = roundToTick(touchAsk, tick, "up");
    const entryHigh = roundToTick(executable, tick, "up");

    entry = {
      type: entryHigh > entryLow ? "zone" : "limit",
      price: entryHigh > entryLow ? undefined : entryLow,
      minPrice: entryHigh > entryLow ? entryLow : undefined,
      maxPrice: entryHigh > entryLow ? entryHigh : undefined,
      trigger: decision.entryTrigger,
      executablePrice: executable,
      missed: false,
    };

    const entryReference = entryHigh;

    /* ---- Target ---- */
    const built = buildTarget(strategy, params, {
      entry: entryReference,
      analytics,
      basket,
      tick,
    });
    target = built.target;

    /* ---- Stop ---- */
    stop = buildStop(strategy, params, {
      entry: entryReference,
      analytics,
      basket,
      tick,
      liquidity: liquidity.quality,
    });

    /* ---- Risk/reward ---- */
    riskReward = computeRiskReward(entryReference, target, stop);

    if (riskReward === null) {
      warnings.push("Risk/reward could not be computed — target or invalidation is not a price.");
    } else if (riskReward < 1) {
      warnings.push(`Risk/reward is ${riskReward.toFixed(2)} — the invalidation is further than the target.`);
    }

    /* Ordering must hold or the setup is incoherent. Caught rather than
       emitted: a target below the entry on a long is not a weak signal, it
       is a broken one. */
    const targetPrice = target.price ?? target.maxPrice;
    const stopPrice = stop.price;
    if (targetPrice !== undefined && targetPrice <= entryReference) {
      return refuse(context, strategy, "The derived target sits at or below the entry — no coherent setup.", analytics, basket);
    }
    if (stopPrice !== undefined && stopPrice >= entryReference) {
      return refuse(context, strategy, "The derived invalidation sits at or above the entry — no coherent setup.", analytics, basket);
    }
  }

  /* ---- Strength ----------------------------------------------------- */

  const strength = computeStrength({
    direction,
    supports: evidence.filter((item) => item.direction === "supports").length,
    contradicts: evidence.filter((item) => item.direction === "contradicts").length,
    liquidity: liquidity.quality,
    basketConfidence: basket.confidence,
    winRate: request.winRate ?? null,
    transport: context.book.transport,
    proximity: timing.proximity,
  });

  /* ---- Assemble ----------------------------------------------------- */

  const signal: PredictionTechnicalSignal = {
    id: randomUUID(),
    marketId: context.market.id,
    conditionId: context.market.conditionId ?? null,
    tokenId: tradedTokenId,
    outcomeId: tradedTokenId,
    marketQuestion: context.market.question,
    outcomeLabel: tradedLabel,
    strategyId: strategy.id,
    strategyVersion: strategy.version,
    direction,
    entry,
    target,
    stop,
    riskReward,
    historicalWinRate: request.winRate ?? null,
    winRateUnavailableReason:
      request.winRate === null || request.winRate === undefined
        ? (request.winRateUnavailableReason ?? null)
        : null,
    strength,
    liquidityQuality: liquidity.quality,
    evidence,
    timeToResolutionMs: timing.ms,
    resolutionProximity: timing.proximity,
    /* A resolution inside the setup's own five-minute horizon is a
       discontinuity, not a trend. Flagged so no chart-shaped confidence is
       presented as unaffected by it. */
    eventRisk: timing.ms !== null && timing.ms <= NEAR_MS,
    generatedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SIGNAL_TTL_MS).toISOString(),
    dataFreshnessMs: freshness,
    transport: context.book.transport,
    warnings,
    snapshot: {
      bestBid: analytics.bestBid,
      bestAsk: analytics.bestAsk,
      midpoint: analytics.midpoint,
      microprice: analytics.microprice,
      spreadPoints: analytics.spreadPoints,
      imbalanceTop5: analytics.depth.top5.imbalance,
      basketProbability: basket.basketProbability,
      basketDeviationPoints: basket.deviationFromAskPoints,
      depthTop5Usd: analytics.depth.top5.bidUsd + analytics.depth.top5.askUsd,
    },
  };

  return { ok: true, signal, analytics, basket };
}

function refuse(
  context: SignalContext,
  strategy: PredictionStrategy,
  reason: string,
  analytics: BookAnalytics,
  basket: ProbabilityBasket,
): SignalOutcome {
  void context;
  void strategy;
  return { ok: false, reason, analytics, basket };
}

/* ---------------------------------------------------------------------------
   Direction
--------------------------------------------------------------------------- */

interface DecisionInput {
  analytics: BookAnalytics;
  basket: ProbabilityBasket;
  book: NormalizedBook;
  trades: PredictionTrade[];
  priceHistory: PredictionPricePoint[];
  now: number;
}

interface Decision {
  direction: SignalDirection;
  entryTrigger: string;
  evidence: Array<Omit<SignalEvidence, "timestamp">>;
}

function decideDirection(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  input: DecisionInput,
): Decision {
  switch (strategy.family) {
    case "orderbook_imbalance":
      return imbalanceDecision(params, input);
    case "microprice_divergence":
      return micropriceDecision(params, input);
    case "basket_convergence":
      return basketDecision(params, input);
    case "probability_momentum":
      return momentumDecision(params, input);
    case "probability_mean_reversion":
      return reversionDecision(params, input);
    case "support_break":
      return supportBreakDecision(params, input);
    case "volume_breakout":
      return volumeDecision(params, input);
    default:
      return { direction: "neutral", entryTrigger: "", evidence: [] };
  }
}

function imbalanceDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const threshold = params.minImbalance ?? 0.25;
  const required = params.persistenceUpdates ?? 3;
  const reading = input.analytics.depth.top5;
  const imbalance = reading.imbalance;
  const micro = input.analytics.microprice;
  const mid = input.analytics.midpoint;

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [
    {
      key: "imbalance_top5",
      label: "Top-5 notional imbalance",
      value: imbalance === null ? "unavailable" : imbalance.toFixed(3),
      direction:
        imbalance === null ? "neutral" : imbalance >= threshold ? "supports" : imbalance <= -threshold ? "contradicts" : "neutral",
      source: "orderbook_analytics",
    },
    {
      key: "microprice_vs_mid",
      label: "Microprice vs midpoint",
      value: micro !== null && mid !== null ? `${((micro - mid) * 100).toFixed(2)} pts` : "unavailable",
      direction: micro !== null && mid !== null && micro > mid ? "supports" : "contradicts",
      source: "orderbook_analytics",
    },
  ];

  /* Persistence is evidenced by the walls the tracker has confirmed. Without
     repeated observations there are none, and the condition is not met —
     which is the correct reading of a single frame, not a failure. */
  const persisted = Math.max(
    input.analytics.bidWalls[0]?.persistenceCount ?? 0,
    input.analytics.askWalls[0]?.persistenceCount ?? 0,
  );
  evidence.push({
    key: "persistence",
    label: "Level persistence",
    value: `${persisted} of ${required} observations`,
    direction: persisted >= required ? "supports" : "neutral",
    source: "liquidity_tracker",
  });

  if (imbalance === null || micro === null || mid === null) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  const bidHeavy = imbalance >= threshold && micro > mid;
  const askHeavy = imbalance <= -threshold && micro < mid;

  if (!bidHeavy && !askHeavy) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }
  if (persisted < required) {
    return {
      direction: "watch",
      entryTrigger: `Imbalance ${imbalance.toFixed(2)} has held ${persisted} of the ${required} observations required.`,
      evidence,
    };
  }

  return {
    direction: bidHeavy ? "long_yes" : "long_no",
    entryTrigger: `Top-5 imbalance ${imbalance.toFixed(2)} with the microprice ${(Math.abs(micro - mid) * 100).toFixed(2)} points ${micro > mid ? "above" : "below"} the midpoint, held for ${persisted} updates.`,
    evidence,
  };
}

function micropriceDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const threshold = params.minDivergencePoints ?? 0.4;
  const micro = input.analytics.microprice;
  const mid = input.analytics.midpoint;

  const divergence = micro !== null && mid !== null ? (micro - mid) * 100 : null;

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [
    {
      key: "microprice_divergence",
      label: "Microprice minus midpoint",
      value: divergence === null ? "unavailable" : `${divergence.toFixed(2)} pts`,
      direction: divergence === null ? "neutral" : Math.abs(divergence) >= threshold ? "supports" : "neutral",
      source: "orderbook_analytics",
    },
  ];

  if (divergence === null || Math.abs(divergence) < threshold) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  return {
    direction: divergence > 0 ? "long_yes" : "long_no",
    entryTrigger: `Microprice sits ${Math.abs(divergence).toFixed(2)} points ${divergence > 0 ? "above" : "below"} the midpoint.`,
    evidence,
  };
}

function basketDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const minEdge = params.minEdgePoints ?? 2;
  const deviation = input.basket.deviationFromAskPoints;

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [
    {
      key: "basket_edge",
      label: "Basket minus executable ask",
      value: deviation === null ? "unavailable" : `${deviation.toFixed(2)} pts`,
      direction: deviation !== null && deviation >= minEdge ? "supports" : "neutral",
      source: "probability_basket",
    },
    {
      key: "basket_confidence",
      label: "Basket confidence",
      value: input.basket.confidence,
      direction: input.basket.confidence === "low" ? "contradicts" : "supports",
      source: "probability_basket",
    },
  ];

  /* A low-confidence basket cannot carry a basket-edge trade: the edge IS the
     basket, so trading it while distrusting it is incoherent. */
  if (input.basket.confidence === "low") {
    return { direction: "neutral", entryTrigger: "", evidence };
  }
  if (deviation === null || deviation < minEdge) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  return {
    direction: "long_yes",
    entryTrigger: `Basket ${(input.basket.basketProbability ?? 0).toFixed(3)} exceeds the executable ask by ${deviation.toFixed(2)} points.`,
    evidence,
  };
}

function seriesOf(history: PredictionPricePoint[]): number[] {
  return history
    .slice()
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    .map((point) => point.probability);
}

function momentumDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const lookback = Math.round(params.lookbackBars ?? 24);
  const rocBars = Math.round(params.rocBars ?? 6);
  const series = seriesOf(input.priceHistory);

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [];

  if (series.length < lookback + 1) {
    evidence.push({
      key: "history",
      label: "Probability history",
      value: `${series.length} of ${lookback + 1} points needed`,
      direction: "neutral",
      source: "price_history",
    });
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  const current = series[series.length - 1];
  /* The window EXCLUDES the current point. Including it means the level is
     partly defined by the value being tested against it, and the breakout
     can never fail. */
  const window = series.slice(-lookback - 1, -1);
  const high = Math.max(...window);
  const roc = series.length > rocBars ? current - series[series.length - 1 - rocBars] : null;

  evidence.push(
    {
      key: "breakout_level",
      label: `${lookback}-bar high`,
      value: high.toFixed(3),
      direction: current > high ? "supports" : "neutral",
      source: "price_history",
    },
    {
      key: "roc",
      label: `${rocBars}-bar rate of change`,
      value: roc === null ? "unavailable" : `${(roc * 100).toFixed(2)} pts`,
      direction: roc !== null && roc > 0 ? "supports" : "contradicts",
      source: "price_history",
    },
  );

  if (current > high && roc !== null && roc > 0) {
    return {
      direction: "long_yes",
      entryTrigger: `Probability ${current.toFixed(3)} cleared the ${lookback}-bar high of ${high.toFixed(3)} with positive ${rocBars}-bar momentum.`,
      evidence,
    };
  }

  return { direction: "neutral", entryTrigger: "", evidence };
}

function reversionDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const lookback = Math.round(params.lookbackBars ?? 24);
  const bandPoints = params.bandPoints ?? 5;
  const series = seriesOf(input.priceHistory);

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [];

  if (series.length < lookback + 2) {
    evidence.push({
      key: "history",
      label: "Probability history",
      value: `${series.length} of ${lookback + 2} points needed`,
      direction: "neutral",
      source: "price_history",
    });
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  const window = series.slice(-lookback);
  const average = window.reduce((total, value) => total + value, 0) / window.length;
  const lower = average - bandPoints / 100;

  const current = series[series.length - 1];
  const previous = series[series.length - 2];

  evidence.push({
    key: "band",
    label: "Lower band",
    value: lower.toFixed(3),
    direction: previous < lower && current >= lower ? "supports" : "neutral",
    source: "price_history",
  });

  /* The RECLAIM is the signal, not the breach. A probability below the band
     can stay below it all the way to zero. */
  if (previous < lower && current >= lower) {
    return {
      direction: "long_yes",
      entryTrigger: `Probability reclaimed the lower band at ${lower.toFixed(3)} after trading beneath it.`,
      evidence,
    };
  }

  return { direction: "neutral", entryTrigger: "", evidence };
}

function supportBreakDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const required = Math.round(params.persistenceUpdates ?? 4);
  const walls = input.analytics.bidWalls.filter((wall) => wall.persistenceCount >= required);
  const bestBid = input.analytics.bestBid;

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [
    {
      key: "persistent_bid_walls",
      label: "Persistent bid walls",
      value: walls.length,
      direction: walls.length > 0 ? "neutral" : "neutral",
      source: "liquidity_tracker",
    },
  ];

  if (walls.length === 0 || bestBid === null) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  /* A break means the bid has moved BELOW a level that had been holding. */
  const broken = walls.find((wall) => bestBid < wall.price);
  if (broken === undefined) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  evidence.push({
    key: "broken_level",
    label: "Broken support",
    value: broken.price.toFixed(3),
    direction: "supports",
    source: "liquidity_tracker",
  });

  /* Support breaking on YES is bearish for YES, and the executable
     expression of that is buying NO. */
  return {
    direction: "long_no",
    entryTrigger: `The best bid fell below a support level at ${broken.price.toFixed(3)} that had held for ${broken.persistenceCount} observations.`,
    evidence,
  };
}

function volumeDecision(params: Record<string, number>, input: DecisionInput): Decision {
  const multiple = params.volumeMultiple ?? 2.5;
  const recentMs = (params.recentMinutes ?? 15) * 60_000;
  const baselineMs = (params.baselineMinutes ?? 120) * 60_000;
  const token = input.book.tokenId;

  let recent = 0;
  let baseline = 0;
  for (const trade of input.trades) {
    if (trade.tokenId !== token) continue;
    const age = input.now - Date.parse(trade.at);
    if (!Number.isFinite(age) || age < 0) continue;
    if (age <= recentMs) recent += trade.size;
    else if (age <= baselineMs) baseline += trade.size;
  }

  /* Rates, not totals. Comparing 15 minutes of size against 105 minutes of
     size finds a "surge" in every market that trades at all. */
  const recentRate = recent / (recentMs / 60_000);
  const baselineWindowMin = Math.max(1, (baselineMs - recentMs) / 60_000);
  const baselineRate = baseline / baselineWindowMin;

  const ratio = baselineRate > 0 ? recentRate / baselineRate : null;
  const vwapValue = input.basket.recentVwap;
  const mid = input.analytics.midpoint;

  const evidence: Array<Omit<SignalEvidence, "timestamp">> = [
    {
      key: "volume_ratio",
      label: "Recent vs baseline trade rate",
      value: ratio === null ? "no baseline" : `${ratio.toFixed(2)}×`,
      direction: ratio !== null && ratio >= multiple ? "supports" : "neutral",
      source: "trade_tape",
    },
    {
      key: "vwap_vs_mid",
      label: "Recent VWAP vs midpoint",
      value: vwapValue !== null && mid !== null ? `${((vwapValue - mid) * 100).toFixed(2)} pts` : "unavailable",
      direction: vwapValue !== null && mid !== null && vwapValue > mid ? "supports" : "contradicts",
      source: "trade_tape",
    },
  ];

  if (ratio === null || ratio < multiple || vwapValue === null || mid === null) {
    return { direction: "neutral", entryTrigger: "", evidence };
  }

  /* Volume alone is activity, not direction. The VWAP's side decides. */
  if (vwapValue > mid) {
    return {
      direction: "long_yes",
      entryTrigger: `Trade rate is ${ratio.toFixed(1)}× baseline with the recent VWAP ${((vwapValue - mid) * 100).toFixed(2)} points above the midpoint.`,
      evidence,
    };
  }

  return {
    direction: "long_no",
    entryTrigger: `Trade rate is ${ratio.toFixed(1)}× baseline with the recent VWAP ${((mid - vwapValue) * 100).toFixed(2)} points below the midpoint.`,
    evidence,
  };
}

/* ---------------------------------------------------------------------------
   Target and stop
--------------------------------------------------------------------------- */

function buildTarget(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  input: { entry: number; analytics: BookAnalytics; basket: ProbabilityBasket; tick: number | null },
): { target: SignalTarget } {
  const fallbackPoints = params.targetPoints ?? 6;

  if (strategy.targetMethod === "next_liquidity_zone") {
    const zone = nearestZone(input.analytics, input.entry, "resistance");
    if (zone !== null) {
      /* Just BELOW the wall. Targeting the wall itself means queuing behind
         the size that is stopping the move. */
      const price = roundToTick(zone.price - (input.tick ?? 0.01), input.tick, "down");
      if (price > input.entry) {
        return {
          target: {
            price,
            basis: `One tick below the persistent ask wall at ${zone.price.toFixed(3)} ($${Math.round(zone.notionalUsd).toLocaleString()}, held ${zone.persistenceCount} observations).`,
          },
        };
      }
    }
    /* No wall has persisted long enough to name. Falls back to the declared
       fixed distance rather than inventing a level. */
  }

  if (strategy.targetMethod === "basket_convergence") {
    const basketValue = input.basket.basketProbability;
    if (basketValue !== null && basketValue > input.entry) {
      return {
        target: {
          price: roundToTick(basketValue, input.tick, "down"),
          basis: `Convergence to the Elyra Probability Basket at ${basketValue.toFixed(3)}.`,
        },
      };
    }
  }

  return {
    target: {
      price: roundToTick(Math.min(0.99, input.entry + fallbackPoints / 100), input.tick, "down"),
      basis: `A fixed ${fallbackPoints}-point move from entry.`,
    },
  };
}

function buildStop(
  strategy: PredictionStrategy,
  params: Record<string, number>,
  input: {
    entry: number;
    analytics: BookAnalytics;
    basket: ProbabilityBasket;
    tick: number | null;
    liquidity: LiquidityQuality;
  },
): SignalStop {
  const fallbackPoints = params.stopPoints ?? 4;

  /* A thin book gaps through a level rather than filling at it. Where
     liquidity is not good the level is labelled an INVALIDATION — the point
     at which the idea is wrong — and never presented as a fill price. */
  const executable = input.liquidity === "good";

  const withBasis = (price: number, basis: string, invalidation?: string): SignalStop => ({
    price: roundToTick(price, input.tick, "down"),
    basis,
    invalidation,
    executable,
  });

  if (strategy.stopMethod === "support_break") {
    const zone = nearestZone(input.analytics, input.entry, "support");
    if (zone !== null) {
      return withBasis(
        zone.price - (input.tick ?? 0.01),
        `One tick below the persistent bid wall at ${zone.price.toFixed(3)} (held ${zone.persistenceCount} observations).`,
        `Price trades through the ${zone.price.toFixed(3)} support.`,
      );
    }
  }

  if (strategy.stopMethod === "imbalance_flip") {
    const threshold = params.minImbalance ?? 0.25;
    return {
      price: roundToTick(Math.max(0.01, input.entry - fallbackPoints / 100), input.tick, "down"),
      basis: `A ${fallbackPoints}-point move against the entry, or an imbalance flip.`,
      invalidation: `Top-5 imbalance falls below −${threshold.toFixed(2)}, removing the reason for the trade.`,
      executable,
    };
  }

  if (strategy.stopMethod === "basket_invalidation") {
    return {
      price: roundToTick(Math.max(0.01, input.entry - fallbackPoints / 100), input.tick, "down"),
      basis: `A ${fallbackPoints}-point move against the entry, or basket invalidation.`,
      invalidation: "The Elyra Probability Basket falls to or below the entry price.",
      executable,
    };
  }

  return withBasis(
    Math.max(0.01, input.entry - fallbackPoints / 100),
    `A fixed ${fallbackPoints}-point move against the entry.`,
  );
}

/**
 * Reward over risk.
 *
 * Uses the WORST end of an entry zone for the entry, which is the price a
 * taker of the reference size actually pays. Using the touch would overstate
 * the reward and understate the risk simultaneously.
 */
export function computeRiskReward(
  entry: number,
  target: SignalTarget,
  stop: SignalStop,
): number | null {
  const targetPrice = target.price ?? target.maxPrice;
  const stopPrice = stop.price;
  if (targetPrice === undefined || stopPrice === undefined) return null;

  const reward = targetPrice - entry;
  const risk = entry - stopPrice;
  if (risk <= 0 || reward <= 0) return null;

  return reward / risk;
}

/* ---------------------------------------------------------------------------
   Strength
--------------------------------------------------------------------------- */

function computeStrength(input: {
  direction: SignalDirection;
  supports: number;
  contradicts: number;
  liquidity: LiquidityQuality;
  basketConfidence: ProbabilityBasket["confidence"];
  winRate: HistoricalWinRate | null;
  transport: NormalizedBook["transport"];
  proximity: ResolutionProximity;
}): SignalStrength {
  if (input.direction === "neutral" || input.direction === "watch") return "low";
  if (input.liquidity === "poor") return "low";

  let score = 0;

  /* Technical and order-book confirmation. */
  score += Math.min(2, input.supports);
  score -= Math.min(2, input.contradicts);

  /* Liquidity. */
  if (input.liquidity === "good") score += 2;
  else if (input.liquidity === "fair") score += 1;

  /* Basket agreement. */
  if (input.basketConfidence === "high") score += 2;
  else if (input.basketConfidence === "medium") score += 1;

  /* Historical robustness. An insufficient sample adds NOTHING — it does not
     subtract either, because "not yet measured" is not evidence against. */
  if (input.winRate !== null && !input.winRate.insufficientSample) {
    if (input.winRate.valuePct >= 55) score += 2;
    else if (input.winRate.valuePct >= 50) score += 1;
    else score -= 1;
  }

  /* A snapshot cannot support a high-strength microstructure call. */
  if (input.transport === "rest_snapshot") score -= 1;

  /* Approaching resolution, price action is settlement mechanics. */
  if (input.proximity === "near") score -= 1;

  /* HIGH is deliberately hard to reach: it needs corroboration, good
     liquidity, a confident basket and a real backtested edge. */
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}
