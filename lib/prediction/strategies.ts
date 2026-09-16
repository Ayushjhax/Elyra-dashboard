/* ---------------------------------------------------------------------------
   The prediction-signal strategy registry.

   ── What a strategy is, here ───────────────────────────────────────────

   A named, versioned, fully written-out rule. "Order-book imbalance" is not a
   strategy: an imbalance is a number between −1 and +1, and turning it into a
   position requires deciding the threshold, the window it is measured over,
   how long it must persist, what spread and depth are tolerable, where the
   entry sits, what the target is, and what voids the idea. All of that is
   below, in words, per strategy.

   The version is part of the identity. A win rate is only attributable to the
   exact rule that produced it, so changing a default or a condition means a
   new version — never an edit that silently reattaches old statistics to new
   behaviour.

   ── The data each strategy needs, declared ─────────────────────────────

   `requires` is checked before evaluation. A strategy needing update-to-update
   persistence cannot run on a single REST snapshot, and saying so up front is
   the difference between "not available from a snapshot" and a signal built
   on one frame that claims a persistent wall.

   Client-safe: declarations and pure predicates, no I/O.
--------------------------------------------------------------------------- */

import type { SignalDirection } from "@/lib/prediction/signal-types";

export type StrategyFamily =
  | "probability_momentum"
  | "probability_mean_reversion"
  | "orderbook_imbalance"
  | "microprice_divergence"
  | "basket_convergence"
  | "support_break"
  | "volume_breakout";

export interface StrategyParameter {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  description: string;
}

/** What a strategy must have before it can be evaluated at all. */
export interface StrategyRequirements {
  /** A two-sided book. Every strategy here needs one. */
  book: true;
  /**
   * Update-to-update persistence — several observations of the same level.
   *
   * Only satisfiable from a live feed. A REST snapshot is one frame, and one
   * frame cannot demonstrate that anything persisted.
   */
  persistence: boolean;
  /** The trade tape, for VWAP and volume conditions. */
  trades: boolean;
  /** Historical probability series, for momentum and mean reversion. */
  priceHistory: boolean;
  /** The probability basket. */
  basket: boolean;
}

export type TargetMethod =
  | "next_liquidity_zone"
  | "basket_convergence"
  | "fixed_points"
  | "risk_reward_multiple";

export type StopMethod =
  | "fixed_points"
  | "support_break"
  | "imbalance_flip"
  | "basket_invalidation"
  | "time_stop";

export interface PredictionStrategy {
  id: string;
  version: string;
  name: string;
  family: StrategyFamily;
  /** The rule, in words. Rendered verbatim in the UI and the PDF. */
  rules: {
    entry: string;
    exit: string;
    invalidation: string;
  };
  parameters: StrategyParameter[];
  requires: StrategyRequirements;
  targetMethod: TargetMethod;
  stopMethod: StopMethod;
  /**
   * Which direction this strategy is capable of producing.
   *
   * Every strategy here is long-only in the contract it names — being bearish
   * on YES is expressed as buying NO, which is a long position in the NO
   * contract. Nothing shorts.
   */
  directions: SignalDirection[];
  /**
   * Whether the strategy stands down as resolution approaches.
   *
   * Microstructure edges decay into settlement: near resolution the book
   * thins, the price pins, and an imbalance reflects redemption mechanics
   * rather than opinion.
   */
  disabledWhenImminent: boolean;
  /** Whether historical book depth is needed to backtest it — see §50. */
  backtestNeedsBookHistory: boolean;
}

const p = (
  key: string,
  label: string,
  value: number,
  description: string,
  extra: Partial<StrategyParameter> = {},
): StrategyParameter => ({ key, label, default: value, description, ...extra });

/** Shared defaults. Overridden per strategy where the rule demands it. */
const MAX_SPREAD_POINTS = p(
  "maxSpreadPoints",
  "Max spread",
  4,
  "Widest bid/ask spread tolerated, in probability points.",
  { min: 1, max: 20 },
);

const MIN_DEPTH_USD = p(
  "minDepthUsd",
  "Min depth",
  2_000,
  "Minimum top-5 depth on the entry side, in dollars.",
  { min: 100 },
);

export const PREDICTION_STRATEGIES: PredictionStrategy[] = [
  /* --- Order-book imbalance ------------------------------------------- */
  {
    id: "PM_ORDERBOOK_IMBALANCE_V1",
    version: "1.0.0",
    name: "Order-book imbalance",
    family: "orderbook_imbalance",
    rules: {
      entry:
        "Top-5 notional imbalance is at or above the threshold on the bid " +
        "side AND the microprice sits above the midpoint AND that condition " +
        "has held for the required number of consecutive book updates. " +
        "Entry is the executable ask for the reference size.",
      exit:
        "The nearest persistent ask wall above the entry, or a fixed " +
        "probability-point move when no wall has persisted long enough to name.",
      invalidation:
        "Imbalance flips below the negative of the threshold, or price trades " +
        "through the nearest persistent bid wall.",
    },
    parameters: [
      p("minImbalance", "Min imbalance", 0.25, "Top-5 notional imbalance floor, 0–1.", {
        min: 0.05,
        max: 0.95,
      }),
      p(
        "persistenceUpdates",
        "Persistence",
        3,
        "Consecutive book updates the condition must hold for.",
        { min: 1, max: 20 },
      ),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("minVolume24hUsd", "Min 24h volume", 25_000, "Market activity floor, in dollars.", {
        min: 0,
      }),
      p("targetPoints", "Target move", 6, "Fallback target distance, in points.", {
        min: 1,
        max: 50,
      }),
      p("stopPoints", "Invalidation", 4, "Fallback invalidation distance, in points.", {
        min: 1,
        max: 50,
      }),
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: true, trades: false, priceHistory: false, basket: true },
    targetMethod: "next_liquidity_zone",
    stopMethod: "imbalance_flip",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    /* Backtesting this honestly needs historical DEPTH, which Polymarket does
       not publish. See §50 and `signal-backtest.ts` — it reports no win rate
       rather than substituting a price-only proxy. */
    backtestNeedsBookHistory: true,
  },

  /* --- Microprice divergence ------------------------------------------ */
  {
    id: "PM_MICROPRICE_DIVERGENCE_V1",
    version: "1.0.0",
    name: "Microprice divergence",
    family: "microprice_divergence",
    rules: {
      entry:
        "The size-weighted microprice sits at least the threshold number of " +
        "points above the midpoint, meaning resting size at the touch leans " +
        "toward the ask. Entry is the executable ask.",
      exit: "Midpoint converges to the microprice, or the fixed target is reached.",
      invalidation: "The microprice falls back to or below the midpoint.",
    },
    parameters: [
      p("minDivergencePoints", "Min divergence", 0.4, "Microprice minus midpoint, in points.", {
        min: 0.1,
        max: 10,
      }),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("targetPoints", "Target move", 4, "Target distance, in points.", { min: 1, max: 50 }),
      p("stopPoints", "Invalidation", 3, "Invalidation distance, in points.", { min: 1, max: 50 }),
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: false, trades: false, priceHistory: false, basket: true },
    targetMethod: "fixed_points",
    stopMethod: "fixed_points",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    backtestNeedsBookHistory: true,
  },

  /* --- Basket convergence --------------------------------------------- */
  {
    id: "PM_BASKET_CONVERGENCE_V1",
    version: "1.0.0",
    name: "Basket convergence",
    family: "basket_convergence",
    rules: {
      entry:
        "The Elyra Probability Basket exceeds the price a buyer would " +
        "actually pay by at least the minimum edge, with basket confidence " +
        "at medium or better and every component fresh. Entry is the " +
        "executable ask for the reference size.",
      exit:
        "Price converges to the basket, or the basket itself moves down to " +
        "meet the price.",
      invalidation:
        "The basket falls to or below the entry price, which removes the " +
        "reason the position was taken.",
    },
    parameters: [
      p("minEdgePoints", "Min edge", 2, "Basket minus executable ask, in points.", {
        min: 0.5,
        max: 30,
      }),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("stopPoints", "Invalidation", 4, "Invalidation distance, in points.", { min: 1, max: 50 }),
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: false, trades: true, priceHistory: false, basket: true },
    targetMethod: "basket_convergence",
    stopMethod: "basket_invalidation",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    /* The basket's inputs include the microprice and depth, neither of which
       exists in Polymarket's published history. */
    backtestNeedsBookHistory: true,
  },

  /* --- Probability momentum breakout ---------------------------------- */
  {
    id: "PM_MOMENTUM_BREAKOUT_V1",
    version: "1.0.0",
    name: "Probability momentum breakout",
    family: "probability_momentum",
    rules: {
      entry:
        "The outcome's probability closes above the highest level of the " +
        "lookback window, and the rate of change over the confirmation " +
        "window is positive. Entry is the executable ask on the breakout bar.",
      exit: "A fixed probability-point move from entry.",
      invalidation: "Probability closes back below the breakout level.",
    },
    parameters: [
      p("lookbackBars", "Breakout lookback", 24, "Bars defining the level to clear.", {
        min: 4,
        max: 240,
      }),
      p("rocBars", "Momentum window", 6, "Bars for the rate-of-change confirmation.", {
        min: 2,
        max: 100,
      }),
      p("targetPoints", "Target move", 8, "Target distance, in points.", { min: 1, max: 50 }),
      p("stopPoints", "Invalidation", 5, "Invalidation distance, in points.", { min: 1, max: 50 }),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: false, trades: false, priceHistory: true, basket: false },
    targetMethod: "fixed_points",
    stopMethod: "fixed_points",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    /* Price-only. Polymarket publishes probability history, so this one CAN
       carry a real backtested win rate. */
    backtestNeedsBookHistory: false,
  },

  /* --- Probability mean reversion ------------------------------------- */
  {
    id: "PM_MEAN_REVERSION_V1",
    version: "1.0.0",
    name: "Probability mean reversion",
    family: "probability_mean_reversion",
    rules: {
      entry:
        "Probability closes below the lower band of a moving average of the " +
        "lookback window, then closes back above it. The reclaim is the " +
        "signal, not the breach — a probability outside the band can stay " +
        "outside for a long time.",
      exit: "Probability returns to the moving average.",
      invalidation: "Probability closes a further fixed distance below the band.",
    },
    parameters: [
      p("lookbackBars", "Average length", 24, "Bars in the moving average.", { min: 4, max: 240 }),
      p("bandPoints", "Band width", 5, "Distance from the average, in points.", {
        min: 1,
        max: 40,
      }),
      p("stopPoints", "Invalidation", 4, "Distance below the band, in points.", {
        min: 1,
        max: 50,
      }),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: false, trades: false, priceHistory: true, basket: false },
    targetMethod: "fixed_points",
    stopMethod: "fixed_points",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    backtestNeedsBookHistory: false,
  },

  /* --- Support break -------------------------------------------------- */
  {
    id: "PM_SUPPORT_BREAK_V1",
    version: "1.0.0",
    name: "Support break",
    family: "support_break",
    rules: {
      entry:
        "A persistent bid wall that had held for the required observations " +
        "is consumed, and the best bid moves below it. The executable " +
        "expression of that is buying the COMPLEMENTARY outcome.",
      exit: "The next persistent zone beyond the break, or a fixed move.",
      invalidation: "Price reclaims the broken level.",
    },
    parameters: [
      p("persistenceUpdates", "Wall persistence", 4, "Observations the wall must have held.", {
        min: 2,
        max: 30,
      }),
      p("targetPoints", "Target move", 6, "Target distance, in points.", { min: 1, max: 50 }),
      p("stopPoints", "Invalidation", 3, "Invalidation distance, in points.", { min: 1, max: 50 }),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: true, trades: false, priceHistory: false, basket: false },
    targetMethod: "next_liquidity_zone",
    stopMethod: "support_break",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    backtestNeedsBookHistory: true,
  },

  /* --- Volume breakout ------------------------------------------------ */
  {
    id: "PM_VOLUME_BREAKOUT_V1",
    version: "1.0.0",
    name: "Volume breakout",
    family: "volume_breakout",
    rules: {
      entry:
        "Traded size over the recent window is at least the multiple of the " +
        "baseline window, AND the recent VWAP sits above the midpoint — " +
        "activity alone is not direction. Entry is the executable ask.",
      exit: "A fixed probability-point move from entry.",
      invalidation: "Recent VWAP falls back below the midpoint.",
    },
    parameters: [
      p("volumeMultiple", "Volume multiple", 2.5, "Recent size over baseline size.", {
        min: 1.2,
        max: 20,
      }),
      p("recentMinutes", "Recent window", 15, "Minutes counted as recent.", { min: 1, max: 240 }),
      p("baselineMinutes", "Baseline window", 120, "Minutes forming the baseline.", {
        min: 10,
        max: 1_440,
      }),
      p("targetPoints", "Target move", 6, "Target distance, in points.", { min: 1, max: 50 }),
      p("stopPoints", "Invalidation", 4, "Invalidation distance, in points.", { min: 1, max: 50 }),
      MAX_SPREAD_POINTS,
      MIN_DEPTH_USD,
      p("referenceSizeUsd", "Reference size", 500, "Order size the entry is priced for.", {
        min: 10,
      }),
    ],
    requires: { book: true, persistence: false, trades: true, priceHistory: false, basket: true },
    targetMethod: "fixed_points",
    stopMethod: "fixed_points",
    directions: ["long_yes", "long_no", "watch", "neutral"],
    disabledWhenImminent: true,
    backtestNeedsBookHistory: true,
  },
];

const BY_ID = new Map(PREDICTION_STRATEGIES.map((strategy) => [strategy.id, strategy]));

export function getPredictionStrategy(id: string): PredictionStrategy | undefined {
  return BY_ID.get(id.trim().toUpperCase());
}

export function defaultParams(strategy: PredictionStrategy): Record<string, number> {
  const params: Record<string, number> = {};
  for (const parameter of strategy.parameters) params[parameter.key] = parameter.default;
  return params;
}

/**
 * Plain-language aliases.
 *
 * Boundaries are lookarounds rather than `\b`, so an alias may begin or end
 * with punctuation — `\b` cannot match beside a non-word character, which
 * silently breaks any such alias inside a sentence.
 */
const ALIASES: Record<string, string> = {
  imbalance: "PM_ORDERBOOK_IMBALANCE_V1",
  "order book imbalance": "PM_ORDERBOOK_IMBALANCE_V1",
  "orderbook imbalance": "PM_ORDERBOOK_IMBALANCE_V1",
  "book imbalance": "PM_ORDERBOOK_IMBALANCE_V1",
  "bid imbalance": "PM_ORDERBOOK_IMBALANCE_V1",

  microprice: "PM_MICROPRICE_DIVERGENCE_V1",
  "microprice divergence": "PM_MICROPRICE_DIVERGENCE_V1",

  basket: "PM_BASKET_CONVERGENCE_V1",
  "basket convergence": "PM_BASKET_CONVERGENCE_V1",
  "fair value": "PM_BASKET_CONVERGENCE_V1",
  edge: "PM_BASKET_CONVERGENCE_V1",

  momentum: "PM_MOMENTUM_BREAKOUT_V1",
  breakout: "PM_MOMENTUM_BREAKOUT_V1",
  "momentum breakout": "PM_MOMENTUM_BREAKOUT_V1",

  "mean reversion": "PM_MEAN_REVERSION_V1",
  reversion: "PM_MEAN_REVERSION_V1",

  "support break": "PM_SUPPORT_BREAK_V1",
  support: "PM_SUPPORT_BREAK_V1",

  volume: "PM_VOLUME_BREAKOUT_V1",
  "volume breakout": "PM_VOLUME_BREAKOUT_V1",
};

const ALIAS_PATTERNS: ReadonlyArray<readonly [key: string, pattern: RegExp]> = Object.keys(
  ALIASES,
)
  .sort((a, b) => b.length - a.length)
  .map(
    (key) =>
      [
        key,
        new RegExp(
          `(?<![A-Za-z0-9])${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z0-9])`,
        ),
      ] as const,
  );

/** Resolves a phrase to a strategy, or null. Never guesses a substitute. */
export function resolvePredictionStrategy(phrase: string): PredictionStrategy | null {
  const cleaned = phrase.toLowerCase().replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0) return null;

  const direct = BY_ID.get(phrase.trim().toUpperCase());
  if (direct !== undefined) return direct;

  for (const [key, pattern] of ALIAS_PATTERNS) {
    if (cleaned === key || pattern.test(cleaned)) {
      const strategy = BY_ID.get(ALIASES[key]);
      if (strategy !== undefined) return strategy;
    }
  }

  return null;
}

/** Strategies that can run given what the current data actually supports. */
export function eligibleStrategies(available: {
  persistence: boolean;
  trades: boolean;
  priceHistory: boolean;
  basket: boolean;
}): PredictionStrategy[] {
  return PREDICTION_STRATEGIES.filter(
    (strategy) =>
      (!strategy.requires.persistence || available.persistence) &&
      (!strategy.requires.trades || available.trades) &&
      (!strategy.requires.priceHistory || available.priceHistory) &&
      (!strategy.requires.basket || available.basket),
  );
}
