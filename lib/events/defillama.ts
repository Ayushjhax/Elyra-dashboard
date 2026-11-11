import "server-only";

import { cached } from "@/lib/market/cache";
import type { RawHack } from "@/lib/events/feed";

/* ---------------------------------------------------------------------------
   DefiLlama's public hack list (https://api.llama.fi/hacks): every recorded
   hack and exploit since 2011 — date, amount, chains, technique, a source —
   kept current by DefiLlama. Read live and cached for ten minutes, so the
   feed's history and the AI's new-hack posts are DefiLlama's record, never a
   copy that drifts.
--------------------------------------------------------------------------- */

const URL = "https://api.llama.fi/hacks";
const TTL_SECONDS = 10 * 60;

function valid(entry: unknown): entry is RawHack {
  if (typeof entry !== "object" || entry === null) return false;
  const hack = entry as Record<string, unknown>;
  return typeof hack.date === "number" && Number.isFinite(hack.date) && typeof hack.name === "string" && hack.name.trim().length > 0;
}

/* In-process memo: the list is over a thousand records, read on every feed page. */
let memo: { at: number; value: Promise<RawHack[]> } | null = null;

export async function defillamaHacks(): Promise<RawHack[]> {
  if (memo !== null && Date.now() - memo.at < TTL_SECONDS * 1000) return memo.value;
  const value = read().catch((error: unknown) => {
    memo = null;
    throw error;
  });
  memo = { at: Date.now(), value };
  return value;
}

async function read(): Promise<RawHack[]> {
  const result = await cached("events:defillama:hacks:v1", TTL_SECONDS, async () => {
    const response = await fetch(URL, {
      headers: { accept: "application/json", "user-agent": "elyra-server/1.0" },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`DefiLlama's hack list returned ${response.status}`);
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("DefiLlama's hack list was not a list");
    return body.filter(valid);
  });
  return result.value;
}
