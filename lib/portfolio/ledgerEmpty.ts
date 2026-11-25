import type { LedgerTab, MarketFilter } from "@/lib/types";
import { msg } from "@/lib/i18n/translate";

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
      title: msg("No open positions"),
      body: msg("Wallet holdings, venue positions and DeFi deposits appear here, marked to the live price."),
    },
    spot: {
      title: msg("No spot positions"),
      body: msg("Tokens you hold in your wallet or on a connected venue appear here at the live price. A wallet holding can be sold from its row."),
    },
    perps: {
      title: msg("No perp positions open"),
      body: msg("Perps on a connected venue appear here with their size, entry, liquidation price and PnL. Connect a venue from Agent."),
    },
    prediction: {
      title: msg("No prediction positions"),
      body: msg("These markets settle to $0 or $1 at resolution. Take a side and the position tracks its mark until then."),
    },
    defi: {
      title: msg("Nothing deployed on-chain"),
      body: msg("Supplied balances, staked tokens and LP ranges are listed here once you deploy them."),
    },
  },
  orders: {
    all: {
      title: msg("No resting orders"),
      body: msg("Limit, stop and trigger orders on every venue wait here until they fill or you cancel them."),
    },
    spot: {
      title: msg("No resting spot orders"),
      body: msg("Limit orders wait here until they fill or you cancel them. Market orders skip this list entirely."),
    },
    perps: {
      title: msg("No resting perp orders"),
      body: msg("Entries waiting on a price sit here, and so do the stops and take-profits attached to an open position."),
    },
    prediction: {
      title: msg("No open orders on prediction markets"),
      body: msg("These fill at market against the book, so they rarely rest. Anything that does wait shows up here."),
    },
    defi: {
      title: msg("DeFi has no order book"),
      body: msg("Supplying, withdrawing and rebalancing settle straight to the chain. Look under History for what has already gone through."),
    },
  },
  history: {
    all: {
      title: msg("No transactions yet"),
      body: msg("Your wallet's transactions land here as they confirm, each linked to the explorer."),
    },
    spot: {
      title: msg("No spot fills yet"),
      body: msg("Completed buys and sells are recorded here with the fee paid and the transaction that carried them."),
    },
    perps: {
      title: msg("No perp fills yet"),
      body: msg("Every open, add and close is written to this list with its price, fee and transaction."),
    },
    prediction: {
      title: msg("No prediction fills yet"),
      body: msg("Entries and exits are recorded at the price you paid, in cents on the dollar of the final settlement."),
    },
    defi: {
      title: msg("No DeFi settlements yet"),
      body: msg("Supply, withdraw and LP rebalance transactions land here once they confirm on-chain."),
    },
  },
};
