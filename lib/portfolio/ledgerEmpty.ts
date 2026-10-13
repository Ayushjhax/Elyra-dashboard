import type { LedgerTab, MarketFilter } from "@/lib/types";

/**
 * Every tab × filter combination gets its own sentence. Empty states are
 * invitations — they say what belongs here and how it gets here.
 *
 * Written for the signed-in account's own ledger: an empty tab here means
 * the read succeeded and found nothing, never that nothing was read.
 */
export const LEDGER_EMPTY: Record<
  LedgerTab,
  Record<MarketFilter, { title: string; body: string }>
> = {
  positions: {
    all: {
      title: "No open positions",
      body: "Wallet holdings, venue positions and DeFi deposits appear here, marked to the live price.",
    },
    spot: {
      title: "No spot positions",
      body: "Tokens you hold in your wallet or on a connected venue appear here at the live price. A wallet holding can be sold from its row.",
    },
    perps: {
      title: "No perp positions open",
      body: "Perps on a connected venue appear here with their size, entry, liquidation price and PnL. Connect a venue from Agent.",
    },
    prediction: {
      title: "No prediction positions",
      body: "These markets settle to $0 or $1 at resolution. Take a side and the position tracks its mark until then.",
    },
    defi: {
      title: "Nothing deployed on-chain",
      body: "Supplied balances, staked tokens and LP ranges are listed here once you deploy them.",
    },
  },
  orders: {
    all: {
      title: "No resting orders",
      body: "Limit, stop and trigger orders on every venue wait here until they fill or you cancel them.",
    },
    spot: {
      title: "No resting spot orders",
      body: "Limit orders wait here until they fill or you cancel them. Market orders skip this list entirely.",
    },
    perps: {
      title: "No resting perp orders",
      body: "Entries waiting on a price sit here, and so do the stops and take-profits attached to an open position.",
    },
    prediction: {
      title: "No open orders on prediction markets",
      body: "These fill at market against the book, so they rarely rest. Anything that does wait shows up here.",
    },
    defi: {
      title: "DeFi has no order book",
      body: "Supplying, withdrawing and rebalancing settle straight to the chain. Look under History for what has already gone through.",
    },
  },
  history: {
    all: {
      title: "No transactions yet",
      body: "Your wallet's transactions land here as they confirm, each linked to the explorer.",
    },
    spot: {
      title: "No spot fills yet",
      body: "Completed buys and sells are recorded here with the fee paid and the transaction that carried them.",
    },
    perps: {
      title: "No perp fills yet",
      body: "Every open, add and close is written to this list with its price, fee and transaction.",
    },
    prediction: {
      title: "No prediction fills yet",
      body: "Entries and exits are recorded at the price you paid, in cents on the dollar of the final settlement.",
    },
    defi: {
      title: "No DeFi settlements yet",
      body: "Supply, withdraw and LP rebalance transactions land here once they confirm on-chain.",
    },
  },
};
