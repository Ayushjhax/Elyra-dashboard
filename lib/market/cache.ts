import "server-only";

import { optional } from "@/lib/env";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Market data cache.

   Upstash when UPSTASH_REDIS_REST_URL is set, the market_cache table
   otherwise. Both are behind one function, so nothing upstream of here knows
   which is in use.

   The cache is an optimisation, never a source of truth. Every failure inside
   it — a Redis outage, a table write conflict — degrades to a live fetch
   rather than an error, because a slow correct answer beats a failed one.
--------------------------------------------------------------------------- */

/** Seconds. Prices move constantly; funding and OI settle on a schedule. */
export const TTL = {
  price: 10,
  funding: 60,
  openInterest: 60,
  candles: 30,
} as const;

interface Envelope<T> {
  value: T;
  /** When the upstream call happened, so staleness is reportable to the model. */
  fetchedAt: string;
}

function upstash(): { url: string; token: string } | null {
  const url = optional("UPSTASH_REDIS_REST_URL");
  const token = optional("UPSTASH_REDIS_REST_TOKEN");
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

async function readUpstash<T>(
  key: string,
  config: { url: string; token: string },
): Promise<Envelope<T> | null> {
  const response = await fetch(`${config.url}/get/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${config.token}` },
    signal: AbortSignal.timeout(2_000),
    cache: "no-store",
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { result: string | null };
  if (body.result === null) return null;
  return JSON.parse(body.result) as Envelope<T>;
}

async function writeUpstash(
  key: string,
  envelope: Envelope<unknown>,
  ttlSeconds: number,
  config: { url: string; token: string },
): Promise<void> {
  await fetch(
    `${config.url}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(2_000),
      cache: "no-store",
    },
  );
}

async function readTable<T>(key: string): Promise<Envelope<T> | null> {
  const { data, error } = await serviceClient()
    .from("market_cache")
    .select("payload, expires_at")
    .eq("cache_key", key)
    .maybeSingle();

  if (error || !data) return null;
  /* Rows are not swept on a schedule, so an expired one is simply ignored and
     overwritten by the next write for the same key. */
  if (Date.parse(data.expires_at) <= Date.now()) return null;
  return data.payload as Envelope<T>;
}

async function writeTable(
  key: string,
  envelope: Envelope<unknown>,
  ttlSeconds: number,
): Promise<void> {
  await serviceClient()
    .from("market_cache")
    .upsert(
      {
        cache_key: key,
        payload: envelope as never,
        fetched_at: envelope.fetchedAt,
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      },
      { onConflict: "cache_key" },
    );
}

/** What a cached read produced, and how old it was. */
export interface Cached<T> {
  value: T;
  fetchedAt: string;
  hit: boolean;
}

/**
 * Read through the cache, computing on a miss.
 *
 * `key` is `symbol:endpoint:interval` — see the call sites in tools/market.ts.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<Cached<T>> {
  const redis = upstash();

  try {
    const hit = redis
      ? await readUpstash<T>(key, redis)
      : await readTable<T>(key);
    if (hit) return { value: hit.value, fetchedAt: hit.fetchedAt, hit: true };
  } catch {
    /* Cache unreachable. Fall through to the live call — never fail a read
       because the thing that exists to make it faster is down. */
  }

  const value = await compute();
  const envelope: Envelope<T> = { value, fetchedAt: new Date().toISOString() };

  try {
    if (redis) await writeUpstash(key, envelope, ttlSeconds, redis);
    else await writeTable(key, envelope, ttlSeconds);
  } catch {
    /* Written or not, the caller gets the fresh value. */
  }

  return { value, fetchedAt: envelope.fetchedAt, hit: false };
}

/** Deletes expired rows. Nothing calls this on a schedule yet. */
export async function sweepExpired(): Promise<void> {
  await serviceClient()
    .from("market_cache")
    .delete()
    .lt("expires_at", new Date().toISOString());
}
