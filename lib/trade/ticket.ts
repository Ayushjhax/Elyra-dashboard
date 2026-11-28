import { slippageBps } from "@/lib/autotrade/manage";
import { exitPrices, LIMITS, PAPER_COSTS, paperFill, type Side } from "@/lib/autotrade/rules";
import type { OrderView, TradeView } from "@/lib/autotrade/types";
import { bookStats, estimateFill, type Book } from "@/lib/market/book";

/* ---------------------------------------------------------------------------
   The chart's order ticket, as arithmetic. Pure.

   - The preview: where the entry is expected, what it costs, the margin it
     holds and where its exits would sit. A paper market order fills the way
     the paper engine fills it — Hyperliquid's mid moved against the trader
     by `PAPER_COSTS.slippagePct` (`paperFill`) — so its estimate is that, not
     a walk of the book, which paper ignores. A live market order walks the
     book (`estimateFill`). A limit order enters at its own price.
   - Size is the order's notional, as everywhere in automation: the
     quantity is size over price, and the margin is size over leverage.
   - The fill against the estimate taken when the order was sent, side by
     side: worse is a long filled higher or a short filled lower.
   - Which position a limit order became, once it fills.
--------------------------------------------------------------------------- */

export type TicketMode = "paper" | "live";
export type OrderType = "market" | "limit";

export interface TicketInput {
  mode: TicketMode;
  type: OrderType;
  side: Side;
  /** Notional, in dollars. */
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  /** Only for a limit order. */
  limitPrice: number | null;
  book: Book | null;
  /** The chart's quote, for when the book has not been read yet. */
  quote: number | null;
}

export interface TicketPreview {
  /** Where the entry is expected. Null until there is a price to expect it at. */
  entry: number | null;
  /** What the estimate rests on: the paper model, the live book, the limit price, or the chart's quote alone. */
  basis: "paper" | "book" | "limit" | "quote" | null;
  feeUsd: number | null;
  marginUsd: number | null;
  /** Units of the market the notional buys at the entry. */
  quantity: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  /** A live market order the visible book cannot fill within `LIMITS.entrySlippagePct`. */
  beyondCap: boolean;
  /** A limit priced through the book, which fills at once. Null for a market order or without a book. */
  crosses: boolean | null;
  /** How far a resting limit sits from the mid, in percent. */
  restsPct: number | null;
  /** The book's spread, for the collapsed Liquidity row. */
  spreadBps: number | null;
}

const positive = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

export function ticketPreview(input: TicketInput): TicketPreview {
  const stats = input.book === null ? null : bookStats(input.book);
  const mid = stats?.mid ?? (positive(input.quote) ? input.quote : null);
  const size = positive(input.sizeUsd) ? input.sizeUsd : null;

  let entry: number | null = null;
  let basis: TicketPreview["basis"] = null;
  let beyondCap = false;
  if (input.type === "limit") {
    if (positive(input.limitPrice)) {
      entry = input.limitPrice;
      basis = "limit";
    }
  } else if (input.mode === "paper") {
    if (mid !== null) {
      entry = paperFill(input.side, "entry", mid);
      basis = stats === null ? "quote" : "paper";
    }
  } else {
    const walked = input.book === null || size === null ? null : estimateFill(input.book, input.side === "long" ? "buy" : "sell", size);
    if (walked !== null) {
      entry = walked.avgPrice;
      basis = "book";
      beyondCap = !walked.complete || walked.slippageBps > LIMITS.entrySlippagePct * 100;
    } else if (mid !== null) {
      entry = mid;
      basis = "quote";
    }
  }

  const exits = entry !== null && positive(input.takeProfitPct) && positive(input.stopLossPct) ? exitPrices(input.side, entry, input.takeProfitPct, input.stopLossPct) : null;
  let crosses: boolean | null = null;
  let restsPct: number | null = null;
  if (input.type === "limit" && entry !== null && stats !== null) {
    crosses = input.side === "long" ? entry >= stats.bestAsk : entry <= stats.bestBid;
    restsPct = crosses ? null : (Math.abs(entry - stats.mid) / stats.mid) * 100;
  }

  return {
    entry,
    basis,
    feeUsd: size === null ? null : (size * PAPER_COSTS.takerFeePct) / 100,
    marginUsd: size === null || !positive(input.leverage) ? null : size / Math.max(1, input.leverage),
    quantity: size === null || entry === null ? null : size / entry,
    takeProfit: exits?.takeProfit ?? null,
    stopLoss: exits?.stopLoss ?? null,
    beyondCap,
    crosses,
    restsPct,
    spreadBps: stats?.spreadBps ?? null,
  };
}

export interface FillOutcome {
  filled: number;
  /** The estimate the order was sent with, or the server's own when the ticket had none. */
  estimate: number | null;
  /** Against the estimate; positive is worse for this side. */
  bps: number | null;
  verdict: "worse" | "better" | "even" | null;
}

/** Below this, a fill is called even rather than better or worse. */
export const EVEN_BPS = 0.05;

/**
 * How an entry filled against the estimate captured when it was sent. The
 * side decides the sign: a long that fills above its estimate paid more, a
 * short that fills below it received less — both worse.
 */
export function fillOutcome(trade: Pick<TradeView, "side" | "entryPrice" | "expectedPrice">, captured: number | null): FillOutcome {
  const estimate = positive(captured) ? captured : positive(trade.expectedPrice) ? trade.expectedPrice : null;
  const bps = slippageBps(trade.side, estimate, trade.entryPrice);
  return {
    filled: trade.entryPrice,
    estimate,
    bps,
    verdict: bps === null ? null : Math.abs(bps) < EVEN_BPS ? "even" : bps > 0 ? "worse" : "better",
  };
}

/**
 * The position a limit order became. The engine records it on the order
 * (`position_id`) when it fills; an order filled before that column was
 * read is matched by what it must have opened: its coin, its side and its
 * price as the entry's expected price, opened after it was placed.
 */
export function positionForOrder(order: OrderView, trades: readonly TradeView[]): TradeView | null {
  if (order.status !== "filled") return null;
  if (order.positionId) return trades.find((trade) => trade.id === order.positionId) ?? null;
  const placed = Date.parse(order.createdAt);
  return (
    trades
      .filter(
        (trade) =>
          trade.coin === order.coin &&
          trade.side === order.side &&
          trade.mode === order.mode &&
          trade.expectedPrice === order.price &&
          Date.parse(trade.openedAt) >= placed,
      )
      .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt))[0] ?? null
  );
}
