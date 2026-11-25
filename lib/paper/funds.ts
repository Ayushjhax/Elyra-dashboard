import type { Side } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   The paper account's money, as arithmetic. Pure.

   Nothing here is stored: the balance is the starting funds plus the result
   of every paper position the account has opened since it started — closed
   ones, and the parts of open ones already closed — so it is always exactly
   the trades it is made of (migration 0032).

   - Balance: starting funds plus realised results. What is left if every
     open position were closed at its entry.
   - Equity: the balance plus the open positions marked to the mid now.
   - Margin in use: each open position's entry value over its leverage, and
     each resting limit order's size over its leverage — an order holds the
     margin it will need when it fills.
   - Available: equity less margin in use. A new paper order needs its own
     margin from here, or it is refused.

   An open position with no mark counts as flat, and says so (`unmarked`).
--------------------------------------------------------------------------- */

export const PAPER_STARTING_USD = 100_000;

export interface PaperOpenPosition {
  coin: string;
  side: Side;
  /** What is still open. */
  size: number;
  entryPrice: number;
  /** Null for positions from before migration 0020; read as 1x. */
  leverage: number | null;
  /** The result of the parts already closed, after fees. */
  realisedPartialUsd: number;
}

export interface PaperRestingOrder {
  sizeUsd: number;
  leverage: number;
}

export interface PaperFunds {
  startingUsd: number;
  /** Results of closed paper trades and closed parts of open ones, after fees. */
  realisedUsd: number;
  balanceUsd: number;
  unrealisedUsd: number;
  equityUsd: number;
  marginUsd: number;
  availableUsd: number;
  openPositions: number;
  restingOrders: number;
  /** Open positions no price was found for, counted as flat. */
  unmarked: number;
}

const round = (value: number) => Math.round(value * 100) / 100;

export function paperFunds(input: {
  startingUsd: number;
  /** Realised results of closed paper positions, after fees. */
  closed: readonly number[];
  open: readonly PaperOpenPosition[];
  orders: readonly PaperRestingOrder[];
  /** The mid now, by coin; a coin missing is unmarked. */
  marks: ReadonlyMap<string, number>;
}): PaperFunds {
  const realised =
    input.closed.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) +
    input.open.reduce((sum, position) => sum + (Number.isFinite(position.realisedPartialUsd) ? position.realisedPartialUsd : 0), 0);
  let unrealised = 0;
  let unmarked = 0;
  let margin = 0;
  for (const position of input.open) {
    margin += (position.entryPrice * position.size) / Math.max(1, position.leverage ?? 1);
    const mark = input.marks.get(position.coin);
    if (mark === undefined || !(mark > 0)) {
      unmarked += 1;
      continue;
    }
    unrealised += position.size * (position.side === "long" ? mark - position.entryPrice : position.entryPrice - mark);
  }
  for (const order of input.orders) margin += order.sizeUsd / Math.max(1, order.leverage);
  const balance = input.startingUsd + realised;
  const equity = balance + unrealised;
  return {
    startingUsd: input.startingUsd,
    realisedUsd: round(realised),
    balanceUsd: round(balance),
    unrealisedUsd: round(unrealised),
    equityUsd: round(equity),
    marginUsd: round(margin),
    availableUsd: round(Math.max(0, equity - margin)),
    openPositions: input.open.length,
    restingOrders: input.orders.length,
    unmarked,
  };
}

/** The margin a new paper order needs: its size over its leverage. */
export function marginFor(order: { sizeUsd: number; leverage: number }): number {
  return order.sizeUsd / Math.max(1, order.leverage);
}

/** Null when the paper account can fund a new order; otherwise why not, in words. */
export function paperRefusal(funds: Pick<PaperFunds, "availableUsd">, marginUsd: number): string | null {
  if (marginUsd <= funds.availableUsd + 1e-6) return null;
  const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `Not enough paper funds: ${usd(funds.availableUsd)} available, and this needs ${usd(marginUsd)} of margin. Close a paper position or lower the size, or reset the paper account.`;
}
