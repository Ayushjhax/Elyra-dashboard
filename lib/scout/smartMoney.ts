import "server-only";

import { CONSENSUS_DISCLAIMER, hyperliquidConsensus, smartMoneyCohort } from "@/lib/smartmoney/hyperliquid";
import { listingFeeds } from "@/lib/scout/announcements";
import { aggregateFlows, coinForTicker, flowSignals, type CoinFlow, type WalletFill } from "@/lib/scout/flows";
import type { AnnouncementView, FlowWindow, HoldingView, SmartMoneyResponse } from "@/lib/scout/types";

/* ---------------------------------------------------------------------------
   What smart money just did, read from Hyperliquid's public data.

   The cohort's fills over the last 24 hours are read once and shared for
   four minutes; every window (an hour, six, a day) and every read's check of
   a coin is cut from that one read. The cohort is the 30 most profitable of
   Elyra's 40 (the leaderboard read in lib/smartmoney/hyperliquid.ts), read
   six at a time to stay well inside Hyperliquid's public rate limit.
--------------------------------------------------------------------------- */

const INFO_URL = "https://api.hyperliquid.xyz/info";
const FILL_WALLETS = 30;
const CONCURRENCY = 6;
const FILLS_TTL_MS = 4 * 60_000;
const MIDS_TTL_MS = 30_000;
export const DAY_MS = 86_400_000;

export const WINDOWS: Record<FlowWindow, number> = { "1h": 3_600_000, "6h": 6 * 3_600_000, "24h": DAY_MS };

export const FLOW_DISCLAIMER =
  "What the most profitable Hyperliquid traders over 30 days opened and closed, from Hyperliquid's public fills. Counted by wallet, not by dollar. Observational, not financial advice.";

async function info<T>(body: Record<string, unknown>, timeoutMs = 8_000): Promise<T> {
  const response = await fetch(INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Hyperliquid answered ${response.status}`);
  return (await response.json()) as T;
}

interface WireFill {
  coin?: string;
  px?: string;
  sz?: string;
  time?: number;
  dir?: string;
  side?: string;
}

function toFill(wire: WireFill): WalletFill | null {
  const px = Number(wire.px);
  const sz = Number(wire.sz);
  if (typeof wire.coin !== "string" || !Number.isFinite(px) || !Number.isFinite(sz) || typeof wire.time !== "number") return null;
  return { coin: wire.coin, px, sz, time: wire.time, dir: typeof wire.dir === "string" ? wire.dir : "", side: wire.side === "B" ? "B" : "A" };
}

export interface CohortFills {
  wallets: Array<{ wallet: string; fills: WalletFill[] }>;
  cohortSize: number;
  read: number;
  at: number;
}

async function loadFills(): Promise<CohortFills> {
  const cohort = (await smartMoneyCohort()).slice(0, FILL_WALLETS);
  const since = Date.now() - DAY_MS;
  const wallets: CohortFills["wallets"] = [];
  for (let index = 0; index < cohort.length; index += CONCURRENCY) {
    const batch = cohort.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((trader) => info<WireFill[]>({ type: "userFillsByTime", user: trader.address, startTime: since, aggregateByTime: true })),
    );
    results.forEach((result, offset) => {
      if (result.status !== "fulfilled" || !Array.isArray(result.value)) return;
      wallets.push({ wallet: batch[offset].address, fills: result.value.map(toFill).filter((fill): fill is WalletFill => fill !== null) });
    });
  }
  if (wallets.length === 0) throw new Error("No smart-money wallet could be read from Hyperliquid.");
  return { wallets, cohortSize: cohort.length, read: wallets.length, at: Date.now() };
}

let fillsCache: { at: number; value: Promise<CohortFills> } | null = null;
let lastFills: CohortFills | null = null;

/** The cohort's last day of fills, shared; a failed refresh keeps the last read. */
export async function cohortFills(): Promise<CohortFills> {
  const now = Date.now();
  if (fillsCache === null || now - fillsCache.at > FILLS_TTL_MS) {
    const value = loadFills()
      .then((result) => {
        lastFills = result;
        return result;
      })
      .catch((error: unknown) => {
        fillsCache = null;
        if (lastFills !== null) return lastFills;
        throw error;
      });
    fillsCache = { at: now, value };
  }
  return fillsCache.value;
}

/** Flows over the last `windowMs`, cut from the shared read. */
export async function flowsFor(windowMs: number): Promise<{ flows: CoinFlow[]; fills: CohortFills }> {
  const fills = await cohortFills();
  return { flows: aggregateFlows(fills.wallets, Date.now() - windowMs), fills };
}

let midsCache: { at: number; value: Promise<Record<string, string>> } | null = null;

/** Every main-dex mid, shared for 30 seconds. Its keys are also the coins Hyperliquid trades. */
export async function allMids(): Promise<Record<string, string>> {
  const now = Date.now();
  if (midsCache === null || now - midsCache.at > MIDS_TTL_MS) {
    const value = info<Record<string, string>>({ type: "allMids" }).catch((error: unknown) => {
      midsCache = null;
      throw error;
    });
    midsCache = { at: now, value };
  }
  return midsCache.value;
}

/** Hyperliquid's perp coins, from the mids (spot pairs, "@107", left out). */
export async function perpCoins(): Promise<Set<string>> {
  const mids = await allMids().catch(() => ({}) as Record<string, string>);
  return new Set(Object.keys(mids).filter((coin) => !coin.startsWith("@") && !coin.includes("/")));
}

export async function holdings(): Promise<{ holdings: HoldingView[]; wallets: number; at: string | null }> {
  const consensus = await hyperliquidConsensus().catch(() => null);
  if (consensus === null) return { holdings: [], wallets: 0, at: null };
  return {
    holdings: consensus.signals.map((signal) => ({
      coin: signal.symbol,
      side: signal.side === "SHORT" ? "SHORT" : "LONG",
      wallets: signal.walletCount,
      /* The consensus writes "4 of 6 wallets"; the page words it in the reader's language. */
      of: Number(/\d+ of (\d+)/.exec(signal.status)?.[1] ?? NaN) || null,
      status: signal.status,
      sharePct: signal.weightedScore,
    })),
    wallets: consensus.walletsRead,
    at: consensus.generatedAt,
  };
}

const WEEK_MS = 7 * DAY_MS;

export async function announcementViews(now: number): Promise<{ announcements: AnnouncementView[]; feeds: SmartMoneyResponse["feeds"] }> {
  const [feeds, coins] = await Promise.all([listingFeeds(), perpCoins()]);
  return {
    announcements: feeds.announcements
      .filter((entry) => entry.kind !== "other" && now - entry.at <= WEEK_MS)
      .slice(0, 30)
      .map((entry) => ({
        exchange: entry.exchange,
        title: entry.title,
        url: entry.url,
        at: new Date(entry.at).toISOString(),
        kind: entry.kind,
        tickers: entry.tickers,
        coins: entry.tickers.map((ticker) => coinForTicker(ticker, coins)).filter((coin): coin is string => coin !== null),
      })),
    feeds: feeds.feeds,
  };
}

export async function smartMoneyBoard(window: FlowWindow): Promise<SmartMoneyResponse> {
  const now = Date.now();
  const [flowRead, held, listed] = await Promise.all([
    flowsFor(WINDOWS[window]).catch((error: unknown) => ({ error: error instanceof Error ? error.message : "Hyperliquid could not be read." })),
    holdings(),
    announcementViews(now).catch(() => ({ announcements: [], feeds: [] as SmartMoneyResponse["feeds"] })),
  ]);
  const failed = "error" in flowRead;
  return {
    window,
    flows: failed ? [] : flowRead.flows.slice(0, 25),
    signals: failed ? [] : flowSignals(flowRead.flows),
    holdings: held.holdings,
    cohort: { wallets: failed ? 0 : flowRead.fills.cohortSize, read: failed ? 0 : flowRead.fills.read, at: failed ? held.at : new Date(flowRead.fills.at).toISOString() },
    announcements: listed.announcements,
    feeds: listed.feeds,
    disclaimer: `${FLOW_DISCLAIMER} ${CONSENSUS_DISCLAIMER}`,
    error: failed ? flowRead.error : null,
  };
}
