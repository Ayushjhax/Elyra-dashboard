import "server-only";

import { priceDecimals } from "@/lib/market/precision";
import type { TrackerSignal } from "@/lib/tracker/types";

/* ---------------------------------------------------------------------------
   Smart money, read by Elyra itself from Hyperliquid.

   The smart-money tracker is a separate service, and when it is not running
   the feed used to go dark. This is the in-app read that stands in for it,
   built only from data Hyperliquid publishes for anyone:

     1. The public leaderboard — every trader's account value and 30-day and
        all-time PnL. The most profitable accounts over 30 days, with a real
        account behind them and a positive all-time record, are the cohort.
     2. Each of those wallets' open positions (`clearinghouseState`).
     3. Consensus: a market where at least three of the cohort hold the same
        side, and at least two thirds of the cohort's wallets in that market
        are on it. Contested markets are left out rather than called.

   Nothing here is a prediction. A row says what profitable wallets are
   holding right now, how many of them, and how much — the same claim the
   tracker makes, from a smaller and plainly described cohort, and labelled
   as Elyra's own read wherever it is shown.

   The leaderboard is ~40 MB and is re-read at most every 30 minutes; the
   positions every minute. Both are shared across requests, including the
   ones that arrive while a read is in flight.
--------------------------------------------------------------------------- */

const LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const INFO_URL = "https://api.hyperliquid.xyz/info";

const LEADERBOARD_TTL_MS = 30 * 60_000;
const CONSENSUS_TTL_MS = 60_000;

/** How many wallets make up the cohort. */
const COHORT = 40;
/** Below this an account is noise; above it, it is a vault or a protocol. */
const MIN_ACCOUNT_USD = 100_000;
const MAX_ACCOUNT_USD = 250_000_000;
/** At least 2% over 30 days: profitable, not merely large. */
const MIN_MONTH_ROI = 0.02;

const MIN_WALLETS = 3;
const MIN_WALLET_SHARE = 2 / 3;
const MAX_SIGNALS = 12;
const MAX_PARTICIPANTS = 10;
const POSITION_CONCURRENCY = 8;

export const CONSENSUS_CONFIG = "elyra-hl-consensus-1";
export const CONSENSUS_DISCLAIMER =
  `Elyra's read of Hyperliquid: open positions of the ${COHORT} most profitable traders ` +
  `over 30 days on the public leaderboard. Consensus is ${MIN_WALLETS}+ wallets with two ` +
  "thirds of them on one side. Observational, not financial advice.";

export interface Trader {
  address: string;
  accountValue: number;
  monthPnl: number;
  monthRoi: number;
}

interface WireLeaderboard {
  leaderboardRows?: Array<{
    ethAddress?: string;
    accountValue?: string;
    windowPerformances?: Array<[string, { pnl?: string; roi?: string }]>;
  }>;
}

interface WirePosition {
  coin?: string;
  szi?: string;
  entryPx?: string | null;
  positionValue?: string;
}

interface WireState {
  assetPositions?: Array<{ position?: WirePosition }>;
}

export interface Consensus {
  signals: TrackerSignal[];
  generatedAt: string;
  /** How many cohort wallets answered, and how many hold anything. */
  walletsRead: number;
  walletsWithPositions: number;
}

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function json<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Hyperliquid answered ${response.status}`);
  return (await response.json()) as T;
}

function info<T>(body: Record<string, unknown>): Promise<T> {
  return json<T>(
    INFO_URL,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    8_000,
  );
}

/* --- the cohort ----------------------------------------------------------- */

let cohortCache: { at: number; value: Promise<Trader[]> } | null = null;
let lastCohort: Trader[] | null = null;

async function loadCohort(): Promise<Trader[]> {
  const board = await json<WireLeaderboard>(LEADERBOARD_URL, {}, 30_000);
  const rows = board.leaderboardRows ?? [];

  const traders: Trader[] = [];
  for (const row of rows) {
    if (typeof row.ethAddress !== "string") continue;
    const windows = new Map(row.windowPerformances ?? []);
    const month = windows.get("month");
    const allTime = windows.get("allTime");
    const accountValue = num(row.accountValue);
    const monthPnl = num(month?.pnl);
    const monthRoi = num(month?.roi);
    if (accountValue < MIN_ACCOUNT_USD || accountValue > MAX_ACCOUNT_USD) continue;
    if (monthPnl <= 0 || monthRoi < MIN_MONTH_ROI || num(allTime?.pnl) <= 0) continue;
    traders.push({ address: row.ethAddress, accountValue, monthPnl, monthRoi });
  }

  traders.sort((a, b) => b.monthPnl - a.monthPnl);
  return traders.slice(0, COHORT);
}

/** The cohort, shared across requests; a failed refresh keeps the last one. */
async function cohort(): Promise<Trader[]> {
  const now = Date.now();
  if (cohortCache === null || now - cohortCache.at > LEADERBOARD_TTL_MS) {
    const value = loadCohort()
      .then((traders) => {
        lastCohort = traders;
        return traders;
      })
      .catch((error: unknown) => {
        /* Retry on the next call rather than caching the failure. */
        cohortCache = null;
        if (lastCohort !== null) return lastCohort;
        throw error;
      });
    cohortCache = { at: now, value };
  }
  return cohortCache.value;
}

/* --- consensus ------------------------------------------------------------ */

export interface Holding {
  trader: Trader;
  coin: string;
  size: number;
  entry: number | null;
  /** The entry exactly as Hyperliquid wrote it — never re-stringified, which
      turns a small price into exponent notation. */
  entryText: string | null;
  valueUsd: number;
}

async function positionsOf(traders: Trader[]): Promise<{ holdings: Holding[]; read: number; holding: number }> {
  const holdings: Holding[] = [];
  let read = 0;
  let holding = 0;

  for (let index = 0; index < traders.length; index += POSITION_CONCURRENCY) {
    const batch = traders.slice(index, index + POSITION_CONCURRENCY);
    const states = await Promise.allSettled(
      batch.map((trader) => info<WireState>({ type: "clearinghouseState", user: trader.address })),
    );
    states.forEach((outcome, offset) => {
      if (outcome.status !== "fulfilled") return;
      read += 1;
      const positions = outcome.value.assetPositions ?? [];
      if (positions.length > 0) holding += 1;
      for (const entry of positions) {
        const position = entry.position;
        if (!position?.coin) continue;
        const size = num(position.szi);
        if (size === 0) continue;
        const entryPx = num(position.entryPx);
        holdings.push({
          trader: batch[offset],
          coin: position.coin,
          size,
          entry: entryPx > 0 ? entryPx : null,
          entryText: entryPx > 0 ? (position.entryPx ?? null) : null,
          valueUsd: Math.abs(num(position.positionValue)),
        });
      }
    });
  }

  return { holdings, read, holding };
}

/** Pure: holdings in, consensus out. Exported for the tests. */
export function buildSignals(
  holdings: Holding[],
  mids: Record<string, string>,
  createdAt: string,
): TrackerSignal[] {
  const byCoin = new Map<string, Holding[]>();
  for (const holding of holdings) {
    const list = byCoin.get(holding.coin) ?? [];
    list.push(holding);
    byCoin.set(holding.coin, list);
  }

  const signals: TrackerSignal[] = [];
  for (const [coin, list] of byCoin) {
    const longs = list.filter((holding) => holding.size > 0);
    const shorts = list.filter((holding) => holding.size < 0);
    const side = longs.length >= shorts.length ? longs : shorts;
    const sideName = side === longs ? "LONG" : "SHORT";

    if (side.length < MIN_WALLETS) continue;
    if (side.length / list.length < MIN_WALLET_SHARE) continue;

    const sideValue = side.reduce((sum, holding) => sum + holding.valueUsd, 0);
    const totalValue = list.reduce((sum, holding) => sum + holding.valueUsd, 0);
    const priced = side.filter((holding) => holding.entry !== null && holding.valueUsd > 0);
    const pricedValue = priced.reduce((sum, holding) => sum + holding.valueUsd, 0);
    const vwap =
      pricedValue > 0
        ? priced.reduce((sum, holding) => sum + (holding.entry ?? 0) * holding.valueUsd, 0) / pricedValue
        : null;
    const mid = num(mids[coin]);

    const participants = [...side]
      .sort((a, b) => b.valueUsd - a.valueUsd)
      .slice(0, MAX_PARTICIPANTS)
      .map((holding) => {
        const roiPct = Math.round(holding.trader.monthRoi * 1000) / 10;
        return {
          wallet: holding.trader.address,
          side: sideName,
          score: roiPct,
          archetype: "30d top trader",
          magnitudeUsd: holding.valueUsd.toFixed(2),
          quantityDelta: String(holding.size),
          vwapEntryUsd: holding.entryText,
          performance: {
            realizedPnlUsd: holding.trader.monthPnl.toFixed(2),
            roiPct: roiPct.toFixed(1),
            winRatePct: "—",
            tradeCount: 0,
            archetype: "30d top trader",
            score: roiPct,
            historyStatus: "leaderboard-30d",
            basisIncomplete: false,
          },
        };
      });

    signals.push({
      id: `hl-${coin}-${sideName}`,
      source: "hyperliquid",
      marketId: coin,
      symbol: coin,
      side: sideName,
      window: "Open positions",
      walletCount: side.length,
      /* The share of the cohort's money in this market that is on this side,
         0–100. A ratio of observed values, not a confidence. */
      weightedScore: totalValue > 0 ? Math.round((sideValue / totalValue) * 100) : 0,
      archetypeCount: 1,
      vwapEntryUsd: vwap === null ? null : vwap.toFixed(priceDecimals(vwap)),
      currentPxUsd: mid > 0 ? (mids[coin] ?? null) : null,
      participants,
      qualifies: true,
      rejectionReasons: [],
      createdAt,
      status: `${side.length} of ${list.length} wallets`,
      supersededBy: null,
      confirmation: null,
      configVersion: CONSENSUS_CONFIG,
    });
  }

  return signals
    .sort((a, b) => b.walletCount - a.walletCount || b.weightedScore - a.weightedScore)
    .slice(0, MAX_SIGNALS);
}

async function loadConsensus(): Promise<Consensus> {
  const traders = await cohort();
  if (traders.length === 0) throw new Error("The Hyperliquid leaderboard returned no qualifying traders.");

  const [positions, mids] = await Promise.all([
    positionsOf(traders),
    info<Record<string, string>>({ type: "allMids" }).catch(() => ({}) as Record<string, string>),
  ]);
  if (positions.read === 0) throw new Error("No Hyperliquid wallet positions could be read.");

  const generatedAt = new Date().toISOString();
  return {
    signals: buildSignals(positions.holdings, mids, generatedAt),
    generatedAt,
    walletsRead: positions.read,
    walletsWithPositions: positions.holding,
  };
}

let consensusCache: { at: number; value: Promise<Consensus> } | null = null;
let lastConsensus: Consensus | null = null;

/** The current consensus, shared across requests and refreshed every minute. */
export async function hyperliquidConsensus(): Promise<Consensus> {
  const now = Date.now();
  if (consensusCache === null || now - consensusCache.at > CONSENSUS_TTL_MS) {
    const value = loadConsensus()
      .then((result) => {
        lastConsensus = result;
        return result;
      })
      .catch((error: unknown) => {
        consensusCache = null;
        if (lastConsensus !== null) return lastConsensus;
        throw error;
      });
    consensusCache = { at: now, value };
  }
  return consensusCache.value;
}
