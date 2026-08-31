import "server-only";

import { createHmac } from "node:crypto";
import { UpstreamError, fetchJson } from "@/lib/market/http";

/* ---------------------------------------------------------------------------
   Binance request signing.

   Every signed call is HMAC-SHA256 over the exact query string, appended as
   `signature=`. The signature covers the string as sent, so the query must be
   built once and reused — re-serialising the parameters to sign them can
   reorder or re-encode a value and produce a signature for a different
   request than the one transmitted.
--------------------------------------------------------------------------- */

const DEFAULT_RECV_WINDOW_MS = 5_000;

/**
 * Binance rejects a request whose timestamp is outside `recvWindow` of its
 * own clock. A developer machine or a container with drifted time would fail
 * every signed call with an opaque -1021, so the offset is measured once and
 * reused rather than trusting the local clock.
 */
let clockOffsetMs: number | null = null;
let offsetFetchedAt = 0;
const OFFSET_TTL_MS = 300_000;

async function serverTimeOffset(baseUrl: string): Promise<number> {
  const fresh = Date.now() - offsetFetchedAt < OFFSET_TTL_MS;
  if (clockOffsetMs !== null && fresh) return clockOffsetMs;

  try {
    const body = await fetchJson<{ serverTime: number }>({
      source: "binance",
      url: `${baseUrl}/fapi/v1/time`,
      timeoutMs: 3_000,
    });
    clockOffsetMs = body.serverTime - Date.now();
    offsetFetchedAt = Date.now();
  } catch {
    /* Unreachable clock endpoint. Assume no drift rather than failing the
       read outright — if the assumption is wrong the signed call returns a
       clear -1021 that names the problem. */
    clockOffsetMs = clockOffsetMs ?? 0;
  }

  return clockOffsetMs;
}

export interface SignedRequest {
  baseUrl: string;
  path: string;
  apiKey: string;
  apiSecret: string;
  params?: Record<string, string | number>;
  timeoutMs?: number;
}

/**
 * A signed GET.
 *
 * GET only, deliberately. This module has no way to express a POST or DELETE,
 * which is what every Binance order endpoint requires — adding trade
 * execution would mean changing this file, not just calling it differently.
 */
export async function signedGet<T>(request: SignedRequest): Promise<T> {
  const { baseUrl, path, apiKey, apiSecret, params = {}, timeoutMs } = request;

  const offset = await serverTimeOffset(baseUrl);
  const query = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    recvWindow: String(DEFAULT_RECV_WINDOW_MS),
    timestamp: String(Date.now() + offset),
  }).toString();

  const signature = createHmac("sha256", apiSecret).update(query).digest("hex");

  try {
    return await fetchJson<T>({
      source: "binance",
      url: `${baseUrl}${path}?${query}&signature=${signature}`,
      headers: { "X-MBX-APIKEY": apiKey },
      timeoutMs,
    });
  } catch (error) {
    /* A rejected key is a configuration problem the user can fix, not a
       transient one to retry. Say so plainly; the raw body would otherwise
       reach a log with the key's own error text and nothing else. */
    if (error instanceof UpstreamError && error.status === 401) {
      throw new UpstreamError(
        "client_error",
        "binance",
        "API key rejected. Check the key, its permissions, and any IP allowlist.",
        401,
      );
    }
    throw error;
  }
}
