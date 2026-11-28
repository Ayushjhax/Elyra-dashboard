import { LIMITS, marketFor } from "@/lib/autotrade/rules";
import { englishTranslator, type Translator } from "@/lib/i18n/translate";
import type { FundAction, FundCharter, FundMode, FundStatus } from "@/lib/funds/types";

/* ---------------------------------------------------------------------------
   The fund's rules: what a charter may say, what the manager may do under
   it, and how a fund moves through its life. Pure.

   ── The charter binds the manager, the limits bind the charter ─────────

   The person writes a charter; `validateCharter` holds it to FUND_LIMITS,
   which are not settings. The manager's every order is then held to the
   charter by `checkOrder` BEFORE it reaches the automation's own order path
   (lib/autotrade/trade.ts), which holds it again to the trading limits and
   the account's own (accountGate). Three layers, each refusing on its own.

   ── A life in five states ───────────────────────────────────────────────

     active ──pause──▶ paused ──resume──▶ active
       │                 │
       │  drawdown limit (Elyra, on the tick)
       ▼                 ▼
     halted ──resume (the high-water mark restarts)──▶ active
       │
     any open state ──wind_down──▶ winding_down ──flat──▶ closed
     paper, with a record ──graduate──▶ closed (graduated) + a new live fund

   Every fund is born on paper. Live is reached only by graduating: after
   `minIncubationDays` and `minIncubationTrades`, a paper fund closes and a
   live one opens with the same charter and manager, so a live record is
   never mixed with a paper one.
--------------------------------------------------------------------------- */

export const FUND_LIMITS = {
  maxOpenFunds: 5,
  minCapitalUsd: 100,
  maxPaperCapitalUsd: 1_000_000,
  /** Smallest addition or withdrawal. */
  minFlowUsd: 10,
  maxNameChars: 60,
  maxObjectiveChars: 1_200,
  maxNoteChars: 2_000,
  maxMarkets: 40,
  minPositionPct: 1,
  maxPositionPct: 100,
  maxGrossExposure: 5,
  maxLeverage: LIMITS.maxLeverage,
  maxPositions: LIMITS.maxOpenPositions,
  minDrawdownPct: 2,
  maxDrawdownPct: 50,
  minDailyLossPct: 0.5,
  maxDailyLossPct: 20,
  minIncubationDays: 7,
  minIncubationTrades: 3,
  startingNpu: 100,
} as const;

export const CHARTER_DEFAULTS: Omit<FundCharter, "name" | "objective"> = {
  markets: ["BTC", "ETH", "SOL"],
  allowShorts: true,
  maxPositionPct: 25,
  maxGrossExposure: 1.5,
  maxLeverage: 3,
  maxPositions: 4,
  maxDrawdownPct: 15,
  dailyLossPct: 4,
};

const between = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const MAX = FUND_LIMITS;

/**
 * A charter as typed, checked against the limits, or what is wrong with it in
 * words. `t` words the refusal for the reader; the server passes none and
 * keeps the English.
 */
export function validateCharter(input: Record<string, unknown>, t: Translator = englishTranslator): { charter: FundCharter } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length === 0) return { error: t("Name the fund.") };
  if (name.length > MAX.maxNameChars) return { error: t("A fund's name is at most {max} characters.", { max: MAX.maxNameChars }) };

  const objective = typeof input.objective === "string" ? input.objective.trim() : "";
  if (objective.length === 0) return { error: t("Write the manager's brief: what the fund is for and how it should trade.") };
  if (objective.length > MAX.maxObjectiveChars) return { error: t("The brief is at most {max} characters.", { max: MAX.maxObjectiveChars.toLocaleString("en-US") }) };

  if (!Array.isArray(input.markets) || input.markets.length === 0) return { error: t("Choose at least one market.") };
  const markets: string[] = [];
  for (const entry of input.markets) {
    const market = marketFor(entry);
    if (market === null) return { error: t("{market} is not one of Elyra's markets.", { market: String(entry).slice(0, 20) }) };
    if (!markets.includes(market.coin)) markets.push(market.coin);
  }
  if (markets.length > MAX.maxMarkets) return { error: t("A fund trades at most {max} markets.", { max: MAX.maxMarkets }) };

  if (!between(input.maxPositionPct, MAX.minPositionPct, MAX.maxPositionPct)) {
    return { error: t("The largest position must be {min}% to {max}% of NAV.", { min: MAX.minPositionPct, max: MAX.maxPositionPct }) };
  }
  if (!between(input.maxGrossExposure, 0.1, MAX.maxGrossExposure)) {
    return { error: t("Gross exposure must be 0.1× to {max}× NAV.", { max: MAX.maxGrossExposure }) };
  }
  if (!between(input.maxLeverage, 1, MAX.maxLeverage) || !Number.isInteger(input.maxLeverage)) {
    return { error: t("Leverage must be a whole number from 1 to {max}.", { max: MAX.maxLeverage }) };
  }
  if (!between(input.maxPositions, 1, MAX.maxPositions) || !Number.isInteger(input.maxPositions)) {
    return { error: t("Open positions must be a whole number from 1 to {max}.", { max: MAX.maxPositions }) };
  }
  if (!between(input.maxDrawdownPct, MAX.minDrawdownPct, MAX.maxDrawdownPct)) {
    return { error: t("The drawdown limit must be {min}% to {max}%.", { min: MAX.minDrawdownPct, max: MAX.maxDrawdownPct }) };
  }
  if (!between(input.dailyLossPct, MAX.minDailyLossPct, MAX.maxDailyLossPct)) {
    return { error: t("The daily loss limit must be {min}% to {max}%.", { min: MAX.minDailyLossPct, max: MAX.maxDailyLossPct }) };
  }
  if ((input.dailyLossPct as number) > (input.maxDrawdownPct as number)) {
    return { error: t("The daily loss limit cannot be larger than the drawdown limit.") };
  }
  if ((input.maxPositionPct as number) / 100 > (input.maxGrossExposure as number)) {
    return { error: t("One position cannot be larger than the fund's whole gross exposure. Raise exposure or lower the position size.") };
  }

  return {
    charter: {
      name,
      objective,
      markets,
      allowShorts: input.allowShorts !== false,
      maxPositionPct: input.maxPositionPct as number,
      maxGrossExposure: input.maxGrossExposure as number,
      maxLeverage: input.maxLeverage as number,
      maxPositions: input.maxPositions as number,
      maxDrawdownPct: input.maxDrawdownPct as number,
      dailyLossPct: input.dailyLossPct as number,
    },
  };
}

/** The fields that differ between two charters, for the ledger. */
export function charterChanges(before: FundCharter, after: FundCharter): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(after) as (keyof FundCharter)[]) {
    const a = before[key];
    const b = after[key];
    const same = Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((value, index) => value === b[index]) : a === b;
    if (!same) changes[key] = key === "objective" ? { from: `${String(a).length} characters`, to: `${String(b).length} characters` } : { from: a, to: b };
  }
  return changes;
}

/* ---------------------------------------------------------------------------
   The lifecycle
--------------------------------------------------------------------------- */

const ACTIONS: Record<FundStatus, readonly FundAction[]> = {
  active: ["pause", "wind_down", "graduate"],
  paused: ["resume", "wind_down", "graduate"],
  halted: ["resume", "wind_down"],
  winding_down: [],
  closed: [],
};

/** What the person may do to a fund now. Graduation is for paper funds only. */
export function actionsFor(status: FundStatus, mode: FundMode): FundAction[] {
  return ACTIONS[status].filter((action) => action !== "graduate" || mode === "paper");
}

/** Whether capital may move in or out, and the charter change, in this state. */
export function editable(status: FundStatus): boolean {
  return status === "active" || status === "paused" || status === "halted";
}

export const STATUS_WORD: Record<FundStatus, string> = {
  active: "Trading",
  paused: "Paused",
  halted: "Halted by risk",
  winding_down: "Winding down",
  closed: "Closed",
};

/**
 * Whether a paper fund has the record it takes to trade real money, and
 * what is missing. The live switches (`liveRefusal`) are the caller's to
 * add: they depend on the server and the person's key, not the fund.
 */
export function graduationCheck(input: {
  mode: FundMode;
  status: FundStatus;
  createdAt: string;
  closedTrades: number;
  openPositions: number;
  now: number;
}): { ready: boolean; reasons: string[]; incubatedDays: number } {
  const incubatedDays = Math.max(0, Math.floor((input.now - Date.parse(input.createdAt)) / 86_400_000));
  const reasons: string[] = [];
  if (input.mode !== "paper") reasons.push("Only a paper fund graduates; this one is already live.");
  if (input.status !== "active" && input.status !== "paused") reasons.push("A halted or closing fund cannot graduate. Resume it first.");
  if (incubatedDays < MAX.minIncubationDays) {
    const left = MAX.minIncubationDays - incubatedDays;
    reasons.push(`It needs ${MAX.minIncubationDays} days on paper; ${left} ${left === 1 ? "day" : "days"} to go.`);
  }
  if (input.closedTrades < MAX.minIncubationTrades) {
    reasons.push(`It needs ${MAX.minIncubationTrades} closed trades on paper; it has ${input.closedTrades}.`);
  }
  return { ready: reasons.length === 0, reasons, incubatedDays };
}

/* ---------------------------------------------------------------------------
   Holding an order to the charter
--------------------------------------------------------------------------- */

export interface OrderContext {
  status: FundStatus;
  charter: FundCharter;
  book: { navUsd: number; grossUsd: number; marginUsd: number; openPositions: number; openCoins: readonly string[] };
  risk: { drawdownPct: number; todayPct: number };
}

const fmt = (value: number) => `$${Math.max(0, value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Why no new position may open right now, whatever its size. Empty when one may. */
export function openBlockers(context: OrderContext): string[] {
  const { status, charter, book, risk } = context;
  const reasons: string[] = [];
  if (status !== "active") {
    reasons.push(
      status === "paused"
        ? "The fund is paused by its owner; it opens nothing new."
        : status === "halted"
          ? "The fund is halted: it reached its drawdown limit. Its owner must resume it."
          : "The fund is closing; it opens nothing new.",
    );
  }
  if (!(book.navUsd > 0)) reasons.push("The fund has no capital.");
  if (book.openPositions >= charter.maxPositions) reasons.push(`${book.openPositions} positions are open, the most the charter allows.`);
  if (risk.drawdownPct >= charter.maxDrawdownPct) reasons.push(`Down ${risk.drawdownPct.toFixed(2)}% from its high, at the ${charter.maxDrawdownPct}% limit.`);
  if (-risk.todayPct >= charter.dailyLossPct) {
    reasons.push(`Down ${(-risk.todayPct).toFixed(2)}% today, at the ${charter.dailyLossPct}% daily limit; nothing new until 00:00 UTC.`);
  }
  return reasons;
}

/** The largest new position the charter allows now, in USD; 0 when none may open. */
export function maxNewPosition(context: OrderContext): number {
  if (openBlockers(context).length > 0) return 0;
  const { charter, book } = context;
  const byPosition = (charter.maxPositionPct / 100) * book.navUsd;
  const byGross = charter.maxGrossExposure * book.navUsd - book.grossUsd;
  const byMargin = (book.navUsd - book.marginUsd) * charter.maxLeverage;
  return Math.max(0, Math.min(byPosition, byGross, byMargin, LIMITS.maxSizeUsd));
}

/**
 * Whether the manager may open this position under the charter, and every
 * reason it may not. The order has already passed `validateMarketOrder`, so
 * its size, leverage and exits are within the trading limits.
 */
export function checkOrder(
  context: OrderContext,
  order: { coin: string; side: "long" | "short"; sizeUsd: number; leverage: number },
): { ok: true } | { ok: false; reasons: string[] } {
  const { charter, book } = context;
  const reasons = openBlockers(context);
  const label = marketFor(order.coin)?.label ?? order.coin;

  if (!charter.markets.includes(order.coin)) reasons.push(`${label} is outside the fund's markets (${charter.markets.join(", ")}).`);
  if (order.side === "short" && !charter.allowShorts) reasons.push("The charter does not allow shorts.");
  if (order.leverage > charter.maxLeverage) reasons.push(`Leverage ${order.leverage}x is above the charter's ${charter.maxLeverage}x.`);
  if (book.openCoins.includes(order.coin)) reasons.push(`The fund already holds ${label}; close it before opening another.`);

  if (book.navUsd > 0) {
    const cap = (charter.maxPositionPct / 100) * book.navUsd;
    if (order.sizeUsd > cap + 1e-9) {
      reasons.push(`${fmt(order.sizeUsd)} is more than ${charter.maxPositionPct}% of NAV; at most ${fmt(cap)} per position.`);
    }
    const gross = (book.grossUsd + order.sizeUsd) / book.navUsd;
    if (gross > charter.maxGrossExposure + 1e-9) {
      reasons.push(`Gross exposure would be ${gross.toFixed(2)}× NAV; the charter allows ${charter.maxGrossExposure}×.`);
    }
    const margin = book.marginUsd + order.sizeUsd / order.leverage;
    if (margin > book.navUsd + 1e-9) {
      reasons.push(`It needs ${fmt(order.sizeUsd / order.leverage)} of margin and ${fmt(book.navUsd - book.marginUsd)} is free.`);
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
