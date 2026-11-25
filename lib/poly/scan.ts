import "server-only";

import { bookSums, movers, polyConsensus, toLite, toPosition, type GammaEventLite, type GammaMarketLite, type PolyPosition } from "@/lib/poly/scanMath";
import type { PolyCategory, PolyScanResponse } from "@/lib/poly/types";

/* ---------------------------------------------------------------------------
   Poly scan: Polymarket's public data, read live.

     - the 30-day PnL leaderboard (Data API v2), and each top wallet's open
       positions, six wallets at a time;
     - Gamma's most-traded open markets, for the day's movers;
     - Gamma's most-traded open events, for book sums.

   Each read is shared: the smart-money read for ten minutes per category,
   the market reads for five. No key, no cost.
--------------------------------------------------------------------------- */

export const GAMMA = "https://gamma-api.polymarket.com";
export const DATA_API = "https://data-api.polymarket.com";
const TOP_WALLETS = 40;
const CONCURRENCY = 6;
const SMART_TTL_MS = 10 * 60_000;
const MARKET_TTL_MS = 5 * 60_000;

export async function polyJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "elyra-server/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Polymarket answered ${response.status}`);
  return (await response.json()) as T;
}

function shared<T>(ttlMs: number, load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const cache = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string) => {
    const now = Date.now();
    const hit = cache.get(key);
    if (hit !== undefined && now - hit.at <= ttlMs) return hit.value;
    const value = load(key).catch((error: unknown) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { at: now, value });
    return value;
  };
}

interface Board {
  data?: Array<{ user_id?: unknown; pnl?: unknown }>;
}

const smartRead = shared(SMART_TTL_MS, async (category: string) => {
  const params = new URLSearchParams({ time_period: "month", sort_by: "PNL", limit: String(TOP_WALLETS) });
  if (category !== "overall") params.set("category", category);
  const board = await polyJson<Board>(`${DATA_API}/v2/leaderboard?${params.toString()}`);
  const wallets = (board.data ?? [])
    .filter((row) => typeof row.user_id === "string" && Number(row.pnl) > 0)
    .map((row) => String(row.user_id).toLowerCase());
  const positions: PolyPosition[] = [];
  let read = 0;
  for (let index = 0; index < wallets.length; index += CONCURRENCY) {
    const batch = wallets.slice(index, index + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((wallet) =>
        polyJson<{ data?: unknown[] }>(`${DATA_API}/v2/positions?user=${wallet}&limit=100&status=OPEN&sort_by=CURRENT_VALUE`),
      ),
    );
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      read += 1;
      for (const row of result.value.data ?? []) {
        const position = row !== null && typeof row === "object" ? toPosition(row as Record<string, unknown>) : null;
        if (position !== null) positions.push(position);
      }
    }
  }
  return { positions, read, asked: wallets.length };
});

const marketsRead = shared(MARKET_TTL_MS, async () => {
  const wire = await polyJson<Array<Record<string, unknown>>>(`${GAMMA}/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=200`);
  return (Array.isArray(wire) ? wire : []).map((row) => toLite(row)).filter((market): market is GammaMarketLite => market !== null);
});

const eventsRead = shared(MARKET_TTL_MS, async () => {
  const wire = await polyJson<Array<Record<string, unknown>>>(`${GAMMA}/events?active=true&closed=false&order=volume24hr&ascending=false&limit=60`);
  return (Array.isArray(wire) ? wire : []).flatMap((event): GammaEventLite[] => {
    if (typeof event.slug !== "string" || typeof event.title !== "string") return [];
    const markets = (Array.isArray(event.markets) ? (event.markets as Array<Record<string, unknown>>) : [])
      .map((market) => toLite(market, event.slug as string))
      .filter((market): market is GammaMarketLite => market !== null);
    return [{ slug: event.slug, title: event.title, negRisk: event.negRisk === true, markets }];
  });
});

const MARKETS_FAILED = "Polymarket's markets could not be read.";
const EVENTS_FAILED = "Polymarket's events could not be read.";

export async function polyScan(category: PolyCategory): Promise<PolyScanResponse> {
  const now = Date.now();
  const errors: string[] = [];
  const [smart, markets, events] = await Promise.all([
    smartRead(category).catch(() => {
      errors.push("Polymarket's leaderboard could not be read.");
      return null;
    }),
    marketsRead("all").catch(() => {
      errors.push(MARKETS_FAILED);
      return [] as GammaMarketLite[];
    }),
    eventsRead("all").catch(() => {
      errors.push(EVENTS_FAILED);
      return [] as GammaEventLite[];
    }),
  ]);
  return {
    category,
    smartMoney: smart === null ? [] : polyConsensus(smart.positions, now).slice(0, 20),
    wallets: { read: smart?.read ?? 0, asked: smart?.asked ?? 0 },
    read: { smartMoney: smart !== null && smart.read > 0, markets: !errors.includes(MARKETS_FAILED), events: !errors.includes(EVENTS_FAILED) },
    movers: movers(markets, now),
    bookSums: bookSums(events),
    at: new Date(now).toISOString(),
    errors,
  };
}

/** Gamma's markets for these conditions, open and closed. */
export async function marketsByCondition(conditionIds: readonly string[]): Promise<Map<string, GammaMarketLite>> {
  const found = new Map<string, GammaMarketLite>();
  if (conditionIds.length === 0) return found;
  for (const closed of [false, true]) {
    const missing = conditionIds.filter((id) => !found.has(id));
    if (missing.length === 0) break;
    const query = missing.map((id) => `condition_ids=${encodeURIComponent(id)}`).join("&");
    const wire = await polyJson<Array<Record<string, unknown>>>(`${GAMMA}/markets?${query}${closed ? "&closed=true" : ""}&limit=${missing.length}`).catch(() => []);
    for (const row of Array.isArray(wire) ? wire : []) {
      const market = toLite(row);
      if (market !== null) found.set(market.conditionId, market);
    }
  }
  return found;
}
