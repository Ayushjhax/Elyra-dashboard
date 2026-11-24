import "server-only";

import { candles } from "@/lib/market/router";
import { evmChainOf, onSolanaWallet, onSuiWallet } from "@/lib/portfolio/chain";
import { coversSince, flowsIn, PEGGED, valueFlows, type FlowEvent, type FlowNetwork } from "@/lib/portfolio/flows";
import type { OverviewNote } from "@/lib/portfolio/performance";
import type { PortfolioSnapshot } from "@/lib/portfolio/types";
import { polymarketFlows } from "@/lib/providers/polymarket-account";
import type { EvmChainKey } from "@/lib/evm/chains";
import { networkLabel } from "@/lib/portfolio/networkLabel";
import { readAccountActivity } from "@/lib/wallet/readActivity";

/* ---------------------------------------------------------------------------
   Reading an account's deposits and withdrawals, and pricing them.

   The decisions are lib/portfolio/flows.ts; this reads what they decide
   over. Each wallet's recent transactions (lib/wallet/readActivity.ts, the
   same reader as the history list), Polymarket's own deposit and withdrawal
   rows, and a daily close for every token that moved.

   `coveredSince` is the line the page leans on: every flow after it was
   seen. A chain whose page filled before reaching the start moves it later;
   a chain that could not be read at all — and holds value, so a transfer
   there would matter — leaves it null, and every interval is then a gap
   the page names rather than a PnL that might include a deposit.
--------------------------------------------------------------------------- */

/** Each chain's page. Helius describes up to 100 signatures a call, the EVM indexer pages at 100. */
const PAGE = 100;

export interface FlowRead {
  flows: FlowEvent[];
  coveredSince: string | null;
  /** What could not be read. */
  notes: OverviewNote[];
}

export interface FlowAccount {
  solanaAddress: string | null;
  evmAddress: string | null;
  suiAddress: string | null;
  polymarketAddress: string | null;
}


/** What each wallet network holds, from a portfolio read — to tell an unreadable chain that matters from one that is empty. */
export function valueByNetwork(snapshot: PortfolioSnapshot | null): Map<FlowNetwork, number> {
  const values = new Map<FlowNetwork, number>();
  if (snapshot === null) return values;
  for (const holding of snapshot.spot) {
    if (!holding.verified || holding.valueUsd === null || holding.valueUsd <= 0) continue;
    const network: FlowNetwork | null = onSolanaWallet(holding)
      ? "solana"
      : onSuiWallet(holding)
        ? "sui"
        : ((evmChainOf(holding)?.key as EvmChainKey | undefined) ?? null);
    if (network === null) continue;
    values.set(network, (values.get(network) ?? 0) + holding.valueUsd);
  }
  if ((snapshot.prediction.valueUsd ?? 0) > 0) values.set("polymarket", snapshot.prediction.valueUsd ?? 0);
  return values;
}

/** A daily-close price book for the symbols that moved, read once per call. */
async function priceBook(symbols: readonly string[]): Promise<(symbol: string, day: string) => number | null> {
  const book = new Map<string, Map<string, number>>();
  await Promise.all(
    [...new Set(symbols)]
      .filter((symbol) => !PEGGED.has(symbol))
      .map(async (symbol) => {
        try {
          const rows = await candles(symbol, "1D", 30);
          book.set(symbol, new Map(rows.map((row) => [new Date(row.openTime).toISOString().slice(0, 10), row.close])));
        } catch {
          /* No market for it: its flows stay unpriced and their day is marked. */
        }
      }),
  );
  return (symbol, day) => {
    const days = book.get(symbol);
    if (days === undefined) return null;
    /* Today's candle is still open; its close is the latest price. */
    return days.get(day) ?? null;
  };
}

/**
 * Every deposit and withdrawal since `since`, valued, with how far back the
 * reads are complete. `holdings` says which networks hold value, so an
 * unreadable empty chain does not blank the whole page.
 */
export async function readFlows(account: FlowAccount, since: string, holdings: Map<FlowNetwork, number>): Promise<FlowRead> {
  const sinceSec = Math.floor(Date.parse(since) / 1000);
  const [activity, polymarket] = await Promise.all([
    readAccountActivity({
      solanaAddress: account.solanaAddress,
      addressesUnresolved: false,
      evmAddress: account.evmAddress,
      suiAddress: account.suiAddress,
      limit: PAGE,
      keepAll: true,
    }),
    account.polymarketAddress === null ? Promise.resolve(null) : polymarketFlows(account.polymarketAddress, sinceSec),
  ]);

  const boundary = {
    solana: account.solanaAddress === null ? [] : [account.solanaAddress],
    evm: account.evmAddress === null ? [] : [account.evmAddress],
    sui: account.suiAddress === null ? [] : [account.suiAddress],
  };
  const window = activity.items.filter((item) => item.at === null || item.at > since);
  const { flows } = flowsIn(window, boundary);

  const notes: OverviewNote[] = [];
  let neverCovered = false;
  let coveredFrom = Date.parse(since);
  const holds = (network: FlowNetwork) => (holdings.get(network) ?? 0) > 0;

  for (const source of activity.sources) {
    const name = networkLabel(source.network);
    const unread = window.filter((item) => (item.network ?? "solana") === source.network && item.status === "confirmed" && (item.summary ?? null) === null).length;
    if (source.failed) {
      if (holds(source.network)) {
        neverCovered = true;
        notes.push({ key: "{network} transfers could not be read, so deposits and withdrawals there are unknown.", values: { network: name } });
      }
      continue;
    }
    /* Rows whose contents are unknown matter where the chain holds value —
       an empty chain's in-and-out nets to nothing in the total. */
    if (unread > 0 && holds(source.network)) {
      neverCovered = true;
      notes.push(
        source.network === "solana"
          ? { key: "Solana transfers need a Helius RPC to be read, so deposits and withdrawals there are unknown." }
          : { key: "{network} transfers cannot be read yet, so deposits and withdrawals there are unknown.", values: { network: name } },
      );
      continue;
    }
    const coverage = coversSince([{ network: source.network, rows: source.rows, limit: PAGE, failed: false, oldest: source.oldest }], since);
    if (!coverage.complete && source.oldest !== null) {
      coveredFrom = Math.max(coveredFrom, Date.parse(source.oldest));
    }
  }

  const all: FlowEvent[] = [...flows];
  if (polymarket !== null) {
    if (polymarket.ok && polymarket.data) {
      for (const entry of polymarket.data) {
        all.push({
          at: entry.at,
          network: "polymarket",
          direction: entry.usd >= 0 ? "in" : "out",
          symbol: "USDC",
          amount: Math.abs(entry.usd),
          usd: Math.abs(entry.usd),
          counterparty: null,
          reference: entry.txHash ?? entry.at,
        });
      }
    } else if (holds("polymarket")) {
      neverCovered = true;
      notes.push({ key: "Polymarket deposits and withdrawals could not be read." });
    }
  }

  const priceOn = await priceBook(all.filter((flow) => flow.usd === null && flow.symbol !== null).map((flow) => flow.symbol as string));
  const valued = valueFlows(all, priceOn).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const unpriced = [...new Set(valued.filter((flow) => flow.usd === null).map((flow) => flow.symbol))];
  if (unpriced.length > 0) notes.push({ key: "{symbols} had no price for a transfer, so those days are left out.", values: { symbols: unpriced.join(", ") } });

  return {
    flows: valued,
    coveredSince: neverCovered ? null : new Date(coveredFrom).toISOString(),
    notes,
  };
}
