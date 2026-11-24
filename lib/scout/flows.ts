/* ---------------------------------------------------------------------------
   What smart money did, from its fills.

   The cohort is Elyra's existing read of Hyperliquid's public leaderboard
   (lib/smartmoney/hyperliquid.ts): the most profitable traders over 30
   days, with real accounts and a positive all-time record. Their positions
   say what they hold; their fills say what they just did. Every fill
   Hyperliquid publishes carries its direction — "Open Long", "Close Short",
   "Long > Short" — so opening is told from closing without guessing.

   A flow signal is a market where at least `minWallets` of the cohort OPENED
   the same side inside the window and few opened the other. It counts
   wallets, not dollars: one whale is one opinion. Closing is reported beside
   it and never counted as a signal, because taking profit says little about
   the next move.

   Pure.
--------------------------------------------------------------------------- */

export interface WalletFill {
  coin: string;
  px: number;
  sz: number;
  time: number;
  /** Hyperliquid's own words: "Open Long", "Close Short", "Long > Short"… */
  dir: string;
  /** "B" bought, "A" sold. */
  side: "A" | "B";
}

export interface CoinFlow {
  coin: string;
  /** Distinct wallets that opened or added to a long (or flipped to one). */
  openedLong: number;
  openedShort: number;
  closedLong: number;
  closedShort: number;
  /** Dollars bought and sold by the cohort in this market, in the window. */
  boughtUsd: number;
  soldUsd: number;
  lastAt: number;
}

export interface FlowSignal {
  coin: string;
  side: "long" | "short";
  /** Wallets that opened this side. */
  wallets: number;
  /** Wallets that opened the other side. */
  against: number;
  /** Dollars the cohort put on this side. */
  usd: number;
  lastAt: number;
}

export const FLOW_RULES = {
  /** Cohort wallets that must open one side for a signal. */
  minWallets: 3,
  /** At most this share of the openers may be on the other side. */
  maxAgainstShare: 1 / 3,
} as const;

/** Spot fills ("@107", "PURR/USDC") are left out: the cohort is read as a perp trader. */
export function isPerpCoin(coin: string): boolean {
  return coin !== "" && !coin.startsWith("@") && !coin.includes("/");
}

function legsOf(dir: string): { open: "long" | "short" | null; close: "long" | "short" | null } {
  switch (dir) {
    case "Open Long":
      return { open: "long", close: null };
    case "Open Short":
      return { open: "short", close: null };
    case "Close Long":
      return { open: null, close: "long" };
    case "Close Short":
      return { open: null, close: "short" };
    case "Long > Short":
      return { open: "short", close: "long" };
    case "Short > Long":
      return { open: "long", close: "short" };
    default:
      return { open: null, close: null };
  }
}

export function aggregateFlows(wallets: ReadonlyArray<{ wallet: string; fills: readonly WalletFill[] }>, since: number): CoinFlow[] {
  const flows = new Map<string, { flow: CoinFlow; sets: Record<"openedLong" | "openedShort" | "closedLong" | "closedShort", Set<string>> }>();
  for (const { wallet, fills } of wallets) {
    for (const fill of fills) {
      if (fill.time < since || !isPerpCoin(fill.coin)) continue;
      const usd = fill.px * fill.sz;
      if (!Number.isFinite(usd) || usd <= 0) continue;
      let entry = flows.get(fill.coin);
      if (entry === undefined) {
        entry = {
          flow: { coin: fill.coin, openedLong: 0, openedShort: 0, closedLong: 0, closedShort: 0, boughtUsd: 0, soldUsd: 0, lastAt: 0 },
          sets: { openedLong: new Set(), openedShort: new Set(), closedLong: new Set(), closedShort: new Set() },
        };
        flows.set(fill.coin, entry);
      }
      const legs = legsOf(fill.dir);
      if (legs.open === "long") entry.sets.openedLong.add(wallet);
      if (legs.open === "short") entry.sets.openedShort.add(wallet);
      if (legs.close === "long") entry.sets.closedLong.add(wallet);
      if (legs.close === "short") entry.sets.closedShort.add(wallet);
      if (fill.side === "B") entry.flow.boughtUsd += usd;
      else entry.flow.soldUsd += usd;
      entry.flow.lastAt = Math.max(entry.flow.lastAt, fill.time);
    }
  }
  return [...flows.values()]
    .map(({ flow, sets }) => ({
      ...flow,
      openedLong: sets.openedLong.size,
      openedShort: sets.openedShort.size,
      closedLong: sets.closedLong.size,
      closedShort: sets.closedShort.size,
      boughtUsd: Math.round(flow.boughtUsd),
      soldUsd: Math.round(flow.soldUsd),
    }))
    .sort((a, b) => Math.max(b.openedLong, b.openedShort) - Math.max(a.openedLong, a.openedShort) || b.boughtUsd + b.soldUsd - (a.boughtUsd + a.soldUsd));
}

/** The flows that qualify as signals, strongest first. */
export function flowSignals(flows: readonly CoinFlow[], minWallets: number = FLOW_RULES.minWallets): FlowSignal[] {
  const signals: FlowSignal[] = [];
  for (const flow of flows) {
    for (const side of ["long", "short"] as const) {
      const wallets = side === "long" ? flow.openedLong : flow.openedShort;
      const against = side === "long" ? flow.openedShort : flow.openedLong;
      if (wallets < minWallets) continue;
      if (against > wallets * FLOW_RULES.maxAgainstShare) continue;
      signals.push({ coin: flow.coin, side, wallets, against, usd: side === "long" ? flow.boughtUsd : flow.soldUsd, lastAt: flow.lastAt });
    }
  }
  return signals.sort((a, b) => b.wallets - a.wallets || b.usd - a.usd);
}

export type SmartMoneyRead = "buying" | "selling" | "quiet";

/** One market's flow, in one word: what the cohort leaned to in the window. */
export function readOf(flow: CoinFlow | undefined): SmartMoneyRead {
  if (flow === undefined) return "quiet";
  if (flow.openedLong >= 2 && flow.openedLong > flow.openedShort * 2) return "buying";
  if (flow.openedShort >= 2 && flow.openedShort > flow.openedLong * 2) return "selling";
  return "quiet";
}

/** The Hyperliquid coin a ticker trades as: "PEPE" is kPEPE, sized per thousand. */
export function coinForTicker(ticker: string, coins: Iterable<string>): string | null {
  const set = coins instanceof Set ? (coins as Set<string>) : new Set(coins);
  if (set.has(ticker)) return ticker;
  if (set.has(`k${ticker}`)) return `k${ticker}`;
  return null;
}
