import "server-only";

import { parseBybit, parseOkx, parseUpbit, type Announcement, type Exchange } from "@/lib/scout/listings";

/* ---------------------------------------------------------------------------
   The exchanges' own listing feeds, read live and shared for three minutes.

   Bybit and OKX through their documented public APIs; Upbit through the
   notice feed its own site reads. Each is read on its own, so one that is
   down or refuses this server's region leaves the others — and the
   response says which answered.
--------------------------------------------------------------------------- */

const TTL_MS = 3 * 60_000;
const TIMEOUT_MS = 8_000;

const FEEDS: ReadonlyArray<{ exchange: Exchange; url: string; parse: (body: unknown) => Announcement[] }> = [
  { exchange: "Bybit", url: "https://api.bybit.com/v5/announcements/index?locale=en-US&type=new_crypto&limit=30", parse: parseBybit },
  { exchange: "OKX", url: "https://www.okx.com/api/v5/support/announcements?annType=announcements-new-listings", parse: parseOkx },
  { exchange: "Upbit", url: "https://api-manager.upbit.com/api/v1/announcements?os=web&page=1&per_page=30&category=trade", parse: parseUpbit },
];

export interface Feeds {
  announcements: Announcement[];
  feeds: Array<{ exchange: Exchange; ok: boolean }>;
}

let cache: { at: number; value: Promise<Feeds> } | null = null;

async function readFeed(url: string, parse: (body: unknown) => Announcement[]): Promise<Announcement[]> {
  const response = await fetch(url, {
    headers: { accept: "application/json", "user-agent": "elyra-server/1.0" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`answered ${response.status}`);
  return parse(await response.json());
}

async function load(): Promise<Feeds> {
  const results = await Promise.allSettled(FEEDS.map((feed) => readFeed(feed.url, feed.parse)));
  const announcements: Announcement[] = [];
  const feeds = FEEDS.map((feed, index) => {
    const result = results[index];
    if (result.status === "fulfilled") announcements.push(...result.value);
    return { exchange: feed.exchange, ok: result.status === "fulfilled" };
  });
  announcements.sort((a, b) => b.at - a.at);
  return { announcements, feeds };
}

/** Every feed's latest announcements, newest first. */
export async function listingFeeds(): Promise<Feeds> {
  const now = Date.now();
  if (cache === null || now - cache.at > TTL_MS) {
    const value = load();
    cache = { at: now, value };
    value.then((feeds) => {
      /* A pass where nothing answered is not kept for three minutes. */
      if (feeds.feeds.every((feed) => !feed.ok) && cache?.value === value) cache = null;
    });
  }
  return cache.value;
}
