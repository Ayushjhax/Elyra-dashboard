import type { Candle } from "@/lib/backtest/intervals";

/* ---------------------------------------------------------------------------
   Trading rules: what a person sets, and what Elyra decides from it.

   Pure. A rule names a strategy from the backtest catalogue (the same rule
   text the Backtests tab tests), a Hyperliquid perp, a timeframe, a size, a
   leverage, and a take-profit and stop-loss. Every five minutes the
   scheduler evaluates each enabled rule on its latest CLOSED bar:

     · no position and the strategy says enter → open, with TP and SL placed
       on the exchange in the same request, so they hold between checks;
     · a position and the strategy says exit → close it;
     · otherwise nothing.

   ── The limits are not settings ────────────────────────────────────────

   `LIMITS` bounds every rule whatever the person types, and the guards in
   `decide` stop entries account-wide: paused, the day's loss limit reached,
   or the most open positions allowed. A rule cannot be configured past them.

   ── Shorts are the strategy's mirror image ─────────────────────────────

   The catalogue's strategies say when to enter and exit a LONG. A short rule
   runs the same strategy on the price chart turned upside down
   (`mirrorCandles`), so "close crosses below the lower band" becomes "close
   crosses above the upper band", and "RSI crosses up through 30" becomes
   "RSI crosses down through 70". Swapping a long's entry and exit instead
   would be wrong for every mean-reversion rule: a long's exit is not where
   a short should begin. The Backtests tab is long-only, so a short rule has
   no backtest of its own; the page says so.
--------------------------------------------------------------------------- */

export type Side = "long" | "short";

/* ---------------------------------------------------------------------------
   Markets: Hyperliquid perps Elyra trades, checked live on 10 November 2026.

   Crypto and memecoins are Hyperliquid's own perps; the memecoins listed each
   traded over $1M a day (a "k" prefix means one contract is 1,000 coins).
   Nasdaq names are trade[XYZ]'s perps — a builder-deployed exchange on
   Hyperliquid (HIP-3), named "xyz:TICKER", priced and margined in USDC, open
   around the clock. Its stocks are perps that follow the share price, not
   shares: no vote, no dividend, and its own margin rules (some are isolated
   margin only, which is how Elyra always trades). XYZ100 is trade[XYZ]'s own
   index, named as such rather than as anything it was not verified to track.
--------------------------------------------------------------------------- */

export type MarketGroup = "crypto" | "meme" | "nasdaq";

export interface PerpMarket {
  /** Hyperliquid's name, exactly: "BTC", "kPEPE", "xyz:NVDA". */
  coin: string;
  label: string;
  group: MarketGroup;
}

export const MARKET_GROUP_LABEL: Record<MarketGroup, string> = {
  crypto: "Crypto",
  meme: "Memecoins",
  nasdaq: "Nasdaq stocks · trade[XYZ]",
};

export const PERP_MARKETS: readonly PerpMarket[] = [
  { coin: "BTC", label: "BTC", group: "crypto" },
  { coin: "ETH", label: "ETH", group: "crypto" },
  { coin: "SOL", label: "SOL", group: "crypto" },
  { coin: "HYPE", label: "HYPE", group: "crypto" },
  { coin: "BNB", label: "BNB", group: "crypto" },
  { coin: "XRP", label: "XRP", group: "crypto" },
  { coin: "AVAX", label: "AVAX", group: "crypto" },
  { coin: "LINK", label: "LINK", group: "crypto" },
  { coin: "SUI", label: "SUI", group: "crypto" },
  { coin: "DOGE", label: "DOGE", group: "meme" },
  { coin: "kPEPE", label: "kPEPE (1,000 PEPE)", group: "meme" },
  { coin: "PUMP", label: "PUMP", group: "meme" },
  { coin: "FARTCOIN", label: "FARTCOIN", group: "meme" },
  { coin: "TRUMP", label: "TRUMP", group: "meme" },
  { coin: "MEME", label: "MEME", group: "meme" },
  { coin: "GOAT", label: "GOAT", group: "meme" },
  { coin: "WIF", label: "WIF", group: "meme" },
  { coin: "POPCAT", label: "POPCAT", group: "meme" },
  { coin: "kBONK", label: "kBONK (1,000 BONK)", group: "meme" },
  { coin: "PENGU", label: "PENGU", group: "meme" },
  { coin: "SPX", label: "SPX (SPX6900)", group: "meme" },
  { coin: "kSHIB", label: "kSHIB (1,000 SHIB)", group: "meme" },
  { coin: "xyz:XYZ100", label: "XYZ100 index", group: "nasdaq" },
  { coin: "xyz:NVDA", label: "NVIDIA (NVDA)", group: "nasdaq" },
  { coin: "xyz:AAPL", label: "Apple (AAPL)", group: "nasdaq" },
  { coin: "xyz:MSFT", label: "Microsoft (MSFT)", group: "nasdaq" },
  { coin: "xyz:TSLA", label: "Tesla (TSLA)", group: "nasdaq" },
  { coin: "xyz:AMZN", label: "Amazon (AMZN)", group: "nasdaq" },
  { coin: "xyz:GOOGL", label: "Alphabet (GOOGL)", group: "nasdaq" },
  { coin: "xyz:META", label: "Meta (META)", group: "nasdaq" },
  { coin: "xyz:AMD", label: "AMD (AMD)", group: "nasdaq" },
  { coin: "xyz:PLTR", label: "Palantir (PLTR)", group: "nasdaq" },
  { coin: "xyz:COIN", label: "Coinbase (COIN)", group: "nasdaq" },
];

/** Every coin a rule or a limit order may trade. */
export const AUTOTRADE_COINS: readonly string[] = PERP_MARKETS.map((market) => market.coin);
export type AutotradeCoin = string;

/** The market for a coin, matched without regard to case ("kpepe" is kPEPE). */
export function marketFor(coin: unknown): PerpMarket | null {
  if (typeof coin !== "string") return null;
  const wanted = coin.trim().toLowerCase();
  return PERP_MARKETS.find((market) => market.coin.toLowerCase() === wanted) ?? null;
}

/** The builder-deployed exchange a coin trades on, or null for Hyperliquid's own. */
export function dexOf(coin: string): string | null {
  const colon = coin.indexOf(":");
  return colon > 0 ? coin.slice(0, colon) : null;
}

export const AUTOTRADE_INTERVALS = ["15m", "1h", "4h", "1d"] as const;
export type AutotradeInterval = (typeof AUTOTRADE_INTERVALS)[number];

export const INTERVAL_MINUTES: Record<AutotradeInterval, number> = { "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };

export type RuleMode = "paper" | "live";

export const LIMITS = {
  maxRulesPerAccount: 10,
  /** Hyperliquid refuses orders under $10; this leaves room for a price move. */
  minSizeUsd: 12,
  maxSizeUsd: 5_000,
  maxLeverage: 5,
  minTakeProfitPct: 0.3,
  maxTakeProfitPct: 50,
  minStopLossPct: 0.3,
  maxStopLossPct: 25,
  maxOpenPositions: 5,
  maxDailyLossUsd: 5_000,
  /** How far past the mid an entry may fill, as Hyperliquid has no market order. */
  entrySlippagePct: 1,
  /** A trigger order's worst acceptable fill, past its trigger price. */
  triggerSlippagePct: 3,
} as const;

export const DEFAULT_SETTINGS = { paused: false, dailyLossLimitUsd: 100, maxOpenPositions: 3 } as const;

/**
 * What a paper trade pays, so its record is one a live trade could match.
 * Hyperliquid's base-tier taker fee on each leg — check it against their
 * fee schedule when it changes — and slippage against the trader on every
 * fill, entries and exits alike (a triggered stop is a market order).
 */
export const PAPER_COSTS = { takerFeePct: 0.045, slippagePct: 0.05 } as const;

export interface TradingRule {
  id: string;
  name: string;
  side: Side;
  coin: AutotradeCoin;
  strategyId: string;
  params: Record<string, number>;
  interval: AutotradeInterval;
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  mode: RuleMode;
  enabled: boolean;
  /** Close time of the last bar this rule acted on, ISO — so one bar never trades twice. */
  lastSignalAt: string | null;
}

export type RuleInput = Omit<TradingRule, "id" | "lastSignalAt">;

export interface StrategyRef {
  id: string;
  parameters: readonly { key: string; min?: number; max?: number; default: number }[];
  intradayOnly?: boolean;
}

function inRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

/** A rule as typed, checked against the limits, or what is wrong with it in words. */
export function validateRule(
  input: Record<string, unknown>,
  strategies: readonly StrategyRef[],
): { rule: RuleInput } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (name.length === 0) return { error: "Give the rule a name." };

  const market = marketFor(input.coin);
  if (market === null) return { error: "Choose one of Elyra's markets." };
  const coin = market.coin;

  const interval = String(input.interval ?? "");
  if (!(AUTOTRADE_INTERVALS as readonly string[]).includes(interval)) {
    return { error: `Choose a timeframe: ${AUTOTRADE_INTERVALS.join(", ")}.` };
  }

  const strategy = strategies.find((entry) => entry.id === input.strategyId);
  if (strategy === undefined) return { error: "Choose a strategy from the list." };
  if (strategy.intradayOnly === true && interval === "1d") return { error: "That strategy only works on intraday bars." };

  const raw = (typeof input.params === "object" && input.params !== null ? input.params : {}) as Record<string, unknown>;
  const params: Record<string, number> = {};
  for (const parameter of strategy.parameters) {
    const value = raw[parameter.key] ?? parameter.default;
    if (!inRange(value, parameter.min ?? -Infinity, parameter.max ?? Infinity)) {
      return { error: `${parameter.key} is outside the range the strategy accepts.` };
    }
    params[parameter.key] = value;
  }

  if (!inRange(input.sizeUsd, LIMITS.minSizeUsd, LIMITS.maxSizeUsd)) {
    return { error: `Size must be between $${LIMITS.minSizeUsd} and $${LIMITS.maxSizeUsd.toLocaleString("en-US")}.` };
  }
  if (!inRange(input.leverage, 1, LIMITS.maxLeverage) || !Number.isInteger(input.leverage)) {
    return { error: `Leverage must be a whole number from 1 to ${LIMITS.maxLeverage}.` };
  }
  if (!inRange(input.takeProfitPct, LIMITS.minTakeProfitPct, LIMITS.maxTakeProfitPct)) {
    return { error: `Take-profit must be between ${LIMITS.minTakeProfitPct}% and ${LIMITS.maxTakeProfitPct}%.` };
  }
  if (!inRange(input.stopLossPct, LIMITS.minStopLossPct, LIMITS.maxStopLossPct)) {
    return { error: `Stop-loss must be between ${LIMITS.minStopLossPct}% and ${LIMITS.maxStopLossPct}%.` };
  }
  /* A stop that a leveraged position would be liquidated before reaching is
     not a stop: refuse it rather than place one that cannot fire. */
  if ((input.stopLossPct as number) * (input.leverage as number) >= 80) {
    return { error: "At that leverage the position would be liquidated before the stop-loss. Lower one of them." };
  }

  const mode = input.mode === "live" ? "live" : "paper";
  if (input.side !== undefined && input.side !== "long" && input.side !== "short") return { error: "Choose long or short." };
  return {
    rule: {
      name,
      side: input.side === "short" ? "short" : "long",
      coin,
      strategyId: strategy.id,
      params,
      interval: interval as AutotradeInterval,
      sizeUsd: input.sizeUsd as number,
      leverage: input.leverage as number,
      takeProfitPct: input.takeProfitPct as number,
      stopLossPct: input.stopLossPct as number,
      mode,
      enabled: input.enabled !== false,
    },
  };
}

/** Bars whose close is in the past. The forming bar is never traded on. */
export function closedBars(candles: readonly Candle[], now: number): Candle[] {
  return candles.filter((candle) => candle.closeTime < now);
}

/**
 * The chart turned upside down, for a short rule: every price p becomes
 * C²/p, with C the latest close, so the latest bar keeps its price and every
 * rise becomes a fall of the same proportion. High and low swap places.
 */
export function mirrorCandles(candles: readonly Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const pivot = candles[candles.length - 1].close;
  const flip = (price: number) => (pivot * pivot) / price;
  return candles.map((candle) => ({
    ...candle,
    open: flip(candle.open),
    high: flip(candle.low),
    low: flip(candle.high),
    close: flip(candle.close),
  }));
}

/** Take-profit and stop-loss around an entry: above and below for a long, the reverse for a short. */
export function exitPrices(side: Side, entry: number, takeProfitPct: number, stopLossPct: number): { takeProfit: number; stopLoss: number } {
  const sign = side === "long" ? 1 : -1;
  return { takeProfit: entry * (1 + (sign * takeProfitPct) / 100), stopLoss: entry * (1 - (sign * stopLossPct) / 100) };
}

/** A paper fill: the price moved against the trader by `PAPER_COSTS.slippagePct`. */
export function paperFill(side: Side, leg: "entry" | "exit", price: number): number {
  const buying = (side === "long") === (leg === "entry");
  return price * (1 + ((buying ? 1 : -1) * PAPER_COSTS.slippagePct) / 100);
}

/** A trade's result after the taker fee on both legs. */
export function netPnl(side: Side, size: number, entry: number, exit: number): number {
  const gross = size * (side === "long" ? exit - entry : entry - exit);
  const fees = (size * (entry + exit) * PAPER_COSTS.takerFeePct) / 100;
  return gross - fees;
}

export interface AccountState {
  paused: boolean;
  dailyLossLimitUsd: number;
  maxOpenPositions: number;
  /** Realised PnL since 00:00 UTC, across every rule. Negative is a loss. */
  realisedTodayUsd: number;
  openPositions: number;
}

export interface OpenTrade {
  side: Side;
  entryPrice: number;
  takeProfit: number;
  stopLoss: number;
  /** Epoch ms the position opened. */
  openedAt: number;
}

export type Decision =
  | { kind: "enter"; barCloseAt: string; reason: string }
  | { kind: "exit"; reason: string }
  | { kind: "hold"; reason: string };

/**
 * What a rule does on this tick.
 *
 * `signals` are the strategy's per-bar verdicts over `bars` (closed bars,
 * oldest first). Only the LAST closed bar is acted on: a signal from three
 * bars ago that was missed is not a trade to take now, at a different price.
 */
export function decide(input: {
  rule: Pick<TradingRule, "enabled" | "lastSignalAt">;
  bars: readonly Candle[];
  signals: readonly { enterLong: boolean; exitLong: boolean; reason: string | null }[];
  open: OpenTrade | null;
  account: AccountState;
}): Decision {
  const { rule, bars, signals, open, account } = input;
  if (!rule.enabled) return { kind: "hold", reason: "The rule is off." };
  const last = bars.length - 1;
  if (last < 0 || signals.length !== bars.length) return { kind: "hold", reason: "Not enough closed bars yet." };

  const signal = signals[last];
  const barCloseAt = new Date(bars[last].closeTime).toISOString();

  if (open !== null) {
    if (signal.exitLong) return { kind: "exit", reason: signal.reason ?? "The strategy's exit rule fired." };
    return { kind: "hold", reason: "In a position; waiting for take-profit, stop-loss or the exit rule." };
  }

  if (!signal.enterLong) return { kind: "hold", reason: "No entry on the latest closed bar." };
  if (rule.lastSignalAt !== null && rule.lastSignalAt >= barCloseAt) return { kind: "hold", reason: "Already acted on this bar." };
  if (account.paused) return { kind: "hold", reason: "Automation is paused." };
  if (account.realisedTodayUsd <= -account.dailyLossLimitUsd) {
    return { kind: "hold", reason: `Today's loss limit of $${account.dailyLossLimitUsd} is reached; no new entries until 00:00 UTC.` };
  }
  if (account.openPositions >= account.maxOpenPositions) {
    return { kind: "hold", reason: `${account.openPositions} positions are open, the most allowed.` };
  }
  return { kind: "enter", barCloseAt, reason: signal.reason ?? "The strategy's entry rule fired." };
}

/**
 * Whether a paper position's take-profit or stop-loss was touched by bars
 * since it opened. When one bar spans both, the stop is assumed first — the
 * candle cannot say which came first, and assuming the kinder order is how
 * a paper record flatters a strategy. The bar the entry happened inside is
 * counted, pre-entry range and all: pessimistic, never flattering.
 */
export function paperExit(open: OpenTrade, bars: readonly Candle[]): { price: number; reason: "take_profit" | "stop_loss" } | null {
  const long = open.side === "long";
  for (const bar of bars) {
    if (bar.closeTime <= open.openedAt) continue;
    const stopped = long ? bar.low <= open.stopLoss : bar.high >= open.stopLoss;
    if (stopped) return { price: open.stopLoss, reason: "stop_loss" };
    const target = long ? bar.high >= open.takeProfit : bar.low <= open.takeProfit;
    if (target) return { price: open.takeProfit, reason: "take_profit" };
  }
  return null;
}
