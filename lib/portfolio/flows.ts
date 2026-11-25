import type { WalletActivity } from "@/lib/wallet/types";

/* ---------------------------------------------------------------------------
   Deposits and withdrawals — money that crossed the edge of the account.

   Equity moves for two reasons: what the person holds changed in price or
   was traded well or badly, or money came in or went out. Only the first is
   performance. A $10,000 deposit is not a 40% day, and a withdrawal is not
   a loss, so every PnL, return and drawdown on the Portfolio page is taken
   net of the flows found here.

   The rule is one line: a transfer counts when exactly one side of it is an
   account Elyra is valuing. So
   - a receive from an outside address is money in; a send to one is out;
   - a send between the person's own wallets is not a flow at all;
   - a send from their Arbitrum wallet into Hyperliquid's bridge is not a
     flow either, because Hyperliquid's account is in the total too;
   - a swap, a stake or a DeFi deposit moves value between things the total
     already counts.
   Polymarket's own deposits and withdrawals are read from Polymarket
   (lib/providers/polymarket-account.ts) rather than inferred, since its
   proxy wallet lives on Polygon, which Elyra does not read; a send into it
   from a read wallet and its arrival there then net to zero, as they should.

   A token nobody verified is never valued in the total, so its transfers
   are never flows either — an airdropped "USDC" is not a deposit.

   What cannot be read is said, never assumed to be zero: a chain that
   failed, a read that did not reach back to the start of the day, a
   transfer of a token with no price. The day is then marked incomplete and
   the page says so, rather than printing a PnL that quietly includes a
   deposit it never saw.

   Pure: the server reads and prices (lib/portfolio/flowsServer.ts); this
   decides.
--------------------------------------------------------------------------- */

/** Hyperliquid's Bridge2 on Arbitrum (docs: for-developers/api/bridge2). Deposits go in here, withdrawals come out of it. */
export const HYPERLIQUID_BRIDGE = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";

export type FlowNetwork = NonNullable<WalletActivity["network"]> | "polymarket";

export interface FlowEvent {
  /** ISO time it happened. */
  at: string;
  network: FlowNetwork;
  direction: "in" | "out";
  /** The verified symbol; null for Polymarket's dollar flows (always USDC). */
  symbol: string | null;
  /** Token amount, unsigned. */
  amount: number;
  /** Unsigned USD value; null when the token could not be priced. */
  usd: number | null;
  /** The other side, when the chain names one. */
  counterparty: string | null;
  /** Signature or hash, for the explorer. */
  reference: string;
}

/** The person's own addresses, and other accounts whose value is in the total. */
export interface FlowBoundary {
  /** Solana addresses, compared exactly (base58 is case-sensitive). */
  solana: readonly string[];
  /** EVM addresses, compared lower-cased. */
  evm: readonly string[];
  /** Sui addresses, compared lower-cased. */
  sui: readonly string[];
}

/** Coins held at a dollar rather than priced — what the total does too. */
export const PEGGED = new Set(["USDC", "USDT", "PYUSD", "USDE", "DAI", "FDUSD", "USDS", "USDG", "PUSD"]);

function insideOf(boundary: FlowBoundary, network: FlowNetwork, address: string | null): boolean {
  if (address === null) return false;
  if (network === "solana") return boundary.solana.includes(address);
  if (network === "sui") return boundary.sui.some((own) => own.toLowerCase() === address.toLowerCase());
  const lower = address.toLowerCase();
  if (network === "arbitrum" && lower === HYPERLIQUID_BRIDGE) return true;
  return boundary.evm.some((own) => own.toLowerCase() === lower);
}

/**
 * The flows in a set of wallet transactions, unpriced. Rows that did not
 * land, rows with no time, and every kind but a plain send or receive are
 * left out; a row with no summary is counted in `unreadable`, because what
 * it moved is unknown.
 */
export function flowsIn(
  items: readonly WalletActivity[],
  boundary: FlowBoundary,
): { flows: FlowEvent[]; unreadable: number } {
  const flows: FlowEvent[] = [];
  let unreadable = 0;
  for (const item of items) {
    if (item.status !== "confirmed" || item.at === null) continue;
    const network: FlowNetwork = item.network ?? "solana";
    const summary = item.summary ?? null;
    if (summary === null) {
      unreadable += 1;
      continue;
    }
    if (summary.kind !== "send" && summary.kind !== "receive") continue;
    if (summary.unverifiedOnly) continue;
    if (insideOf(boundary, network, summary.counterparty)) continue;
    for (const moved of summary.amounts) {
      if (moved.symbol === null || !Number.isFinite(moved.amount) || moved.amount === 0) continue;
      const direction = moved.amount > 0 ? "in" : "out";
      /* A receive that also paid something out (or the reverse) is the
         chain's own netting; only the leg matching the kind is the flow. */
      if ((summary.kind === "receive") !== (direction === "in")) continue;
      flows.push({
        at: item.at,
        network,
        direction,
        symbol: moved.symbol.toUpperCase(),
        amount: Math.abs(moved.amount),
        usd: null,
        counterparty: summary.counterparty,
        reference: item.signature,
      });
    }
  }
  return { flows, unreadable };
}

/** A token's USD price on a UTC day ("2026-11-24"), or null when it has none. */
export type PriceOn = (symbol: string, day: string) => number | null;

/** Each flow with its USD value at that day's price; pegged coins at $1. */
export function valueFlows(flows: readonly FlowEvent[], priceOn: PriceOn): FlowEvent[] {
  return flows.map((flow) => {
    if (flow.usd !== null) return flow;
    if (flow.symbol === null) return flow;
    const price = PEGGED.has(flow.symbol) ? 1 : priceOn(flow.symbol, dayOf(flow.at));
    return price === null || !Number.isFinite(price) ? flow : { ...flow, usd: flow.amount * price };
  });
}

/** "2026-11-24" for any ISO time, in UTC. */
export function dayOf(at: string): string {
  return new Date(Date.parse(at)).toISOString().slice(0, 10);
}

/** One day's net flow: in minus out, in USD, and whether every flow had a price. */
export interface DayFlow {
  day: string;
  netUsd: number;
  /** False when a flow on this day could not be priced. */
  priced: boolean;
  count: number;
}

export function flowsByDay(flows: readonly FlowEvent[]): Map<string, DayFlow> {
  const days = new Map<string, DayFlow>();
  for (const flow of flows) {
    const day = dayOf(flow.at);
    const entry = days.get(day) ?? { day, netUsd: 0, priced: true, count: 0 };
    entry.count += 1;
    if (flow.usd === null) entry.priced = false;
    else entry.netUsd += flow.direction === "in" ? flow.usd : -flow.usd;
    days.set(day, entry);
  }
  return days;
}

/** One source's read, as completeness sees it. */
export interface SourceCoverage {
  network: string;
  /** Rows the source returned. */
  rows: number;
  /** It was asked for this many; returning that many means there may be older ones. */
  limit: number;
  failed: boolean;
  /** The oldest time among its rows, or null when it returned none. */
  oldest: string | null;
}

/**
 * Whether the reads reached back to `since`, so every flow after it was
 * seen. A source that failed, or filled its page with rows all newer than
 * `since`, may have missed some.
 */
export function coversSince(sources: readonly SourceCoverage[], since: string): { complete: boolean; short: string[] } {
  const short: string[] = [];
  const start = Date.parse(since);
  for (const source of sources) {
    if (source.failed) {
      short.push(source.network);
      continue;
    }
    const filled = source.rows >= source.limit;
    if (filled && source.oldest !== null && Date.parse(source.oldest) > start) short.push(source.network);
  }
  return { complete: short.length === 0, short };
}
