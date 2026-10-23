import type { ExchangesResponse, ExchangeWriteResponse, HyperliquidAccountCheck } from "@/lib/connections/types";
import { api, ApiError } from "~/lib/api";
import { createAccountStore, SKIP, type AccountFeed } from "~/lib/stores/createAccountStore";
import { refreshPortfolio } from "~/lib/stores/portfolio";

/* ---------------------------------------------------------------------------
   The account's exchange connections — /api/exchanges.

   What is stored is described, never returned: an address, or the last four
   characters of a key. A Binance key and secret are sent once, in the body
   of one POST, and the API encrypts them on arrival and checks with Binance
   that the key cannot trade, transfer or withdraw. Nothing here keeps them —
   not this store, not storage, not a log.

   Every change reads the connections and the portfolio again, so each
   screen that shows a venue sees the change.
--------------------------------------------------------------------------- */

let writes = 0;

const store = createAccountStore<ExchangesResponse>({
  pollMs: 5 * 60_000,
  retryMs: 2 * 60_000,
  async load(signal) {
    const before = writes;
    const body = await api.get<ExchangesResponse>("/api/exchanges", { signal });
    return before === writes ? body : SKIP;
  },
});

export function useConnections(): AccountFeed<ExchangesResponse> {
  return store.useFeed();
}

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

async function write<T>(run: () => Promise<T>, fallback: string): Promise<Outcome<T>> {
  writes += 1;
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : fallback };
  } finally {
    writes += 1;
    await Promise.all([store.refresh(), refreshPortfolio()]);
  }
}

/** Reads what is at a Hyperliquid address. Nothing is stored. */
export async function previewHyperliquid(address: string): Promise<Outcome<HyperliquidAccountCheck>> {
  try {
    const body = await api.post<ExchangeWriteResponse>("/api/exchanges", { exchange: "hyperliquid", walletAddress: address.toLowerCase(), preview: true }, { timeoutMs: 30_000 });
    return body.found ? { ok: true, data: body.found } : { ok: false, error: "Could not read that address. Try again." };
  } catch (error) {
    return { ok: false, error: error instanceof ApiError ? error.message : "Could not reach Elyra to read that address." };
  }
}

export function saveHyperliquid(address: string) {
  return write(() => api.post<ExchangeWriteResponse>("/api/exchanges", { exchange: "hyperliquid", walletAddress: address }, { timeoutMs: 30_000 }), "Could not save that address. Nothing was changed.");
}

/** Sends a Binance key pair once. The caller clears its fields whatever the answer. */
export function connectBinance(apiKey: string, apiSecret: string) {
  return write(() => api.post<ExchangeWriteResponse>("/api/exchanges", { exchange: "binance", apiKey, apiSecret }, { timeoutMs: 30_000 }), "Could not connect Binance. Nothing was saved.");
}

export function disconnect(exchange: "binance" | "hyperliquid") {
  return write(
    () => api.delete(`/api/exchanges?exchange=${exchange}`),
    exchange === "binance" ? "Could not disconnect Binance. The key is still stored." : "Could not remove the saved address. It is still the one being read.",
  );
}
