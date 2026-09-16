import "server-only";

import { providerFetch } from "@/lib/providers/http";
import { fail, ok, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Hyperliquid — open orders and fills for an address.

   Read-only and keyless. Hyperliquid's `/info` endpoint is address-keyed and
   public: anyone can read any address's orders, because they are on-chain.
   That is why this needs no credential, and also why it can only ever READ —
   placing or cancelling an order requires a signature, and there is no
   signing path in this repository.

   Both shapes verified live while writing this.

   ── The field that will catch someone out ──────────────────────────────

   `side` is "A" or "B". Not "buy"/"sell", not "long"/"short". A is ASK (a
   sell), B is BID (a buy). Getting it backwards inverts every order in the
   list, and both values look equally plausible on a screen.
--------------------------------------------------------------------------- */

const INFO = "https://api.hyperliquid.xyz/info";

export interface OpenOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  limitPrice: number | null;
  size: number;
  originalSize: number | null;
  orderType: string;
  reduceOnly: boolean;
  isTrigger: boolean;
  triggerPrice: number | null;
  placedAt: string;
}

export interface Fill {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  /** Hyperliquid's own words: "Open Long", "Close Short", … */
  direction: string;
  price: number;
  size: number;
  closedPnl: number | null;
  fee: number | null;
  feeToken: string | null;
  at: string;
  hash: string | null;
}

interface WireOrder {
  coin?: string;
  side?: string;
  limitPx?: string;
  sz?: string;
  origSz?: string;
  oid?: number;
  timestamp?: number;
  orderType?: string;
  reduceOnly?: boolean;
  isTrigger?: boolean;
  triggerPx?: string;
}

interface WireFill {
  coin?: string;
  px?: string;
  sz?: string;
  side?: string;
  time?: number;
  dir?: string;
  closedPnl?: string;
  fee?: string;
  feeToken?: string;
  hash?: string;
  tid?: number;
  oid?: number;
}

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** "A" is ask — a sell. "B" is bid — a buy. */
function sideOf(raw: string | undefined): "buy" | "sell" {
  return raw === "B" ? "buy" : "sell";
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

export async function hyperliquidOpenOrders(
  address: string,
): Promise<ToolResult<OpenOrder[]>> {
  if (!isAddress(address)) {
    return fail<OpenOrder[]>(
      "hyperliquid",
      "INVALID_REQUEST",
      "That does not look like an EVM address.",
    );
  }

  const response = await providerFetch<WireOrder[]>({
    provider: "hyperliquid",
    url: INFO,
    method: "POST",
    body: { type: "frontendOpenOrders", user: address.toLowerCase() },
    timeoutMs: 10_000,
  });

  if (!response.ok || !Array.isArray(response.data)) {
    return fail<OpenOrder[]>(
      "hyperliquid",
      response.error?.code ?? "UPSTREAM_UNAVAILABLE",
      response.error?.message ?? "Hyperliquid did not answer.",
    );
  }

  const orders: OpenOrder[] = [];
  for (const wire of response.data) {
    const size = num(wire.sz);
    if (wire.coin === undefined || wire.oid === undefined || size === null) continue;

    orders.push({
      id: String(wire.oid),
      symbol: wire.coin.toUpperCase(),
      side: sideOf(wire.side),
      limitPrice: num(wire.limitPx),
      size,
      originalSize: num(wire.origSz),
      orderType: wire.orderType ?? "Limit",
      reduceOnly: wire.reduceOnly === true,
      isTrigger: wire.isTrigger === true,
      /* Hyperliquid sends "0.0" for a non-trigger order. Zero is not a
         trigger price, and rendering it as one would read as a stop at $0. */
      triggerPrice: wire.isTrigger === true ? num(wire.triggerPx) : null,
      placedAt:
        wire.timestamp === undefined
          ? new Date().toISOString()
          : new Date(wire.timestamp).toISOString(),
    });
  }

  return ok(orders, "hyperliquid");
}

export async function hyperliquidFills(
  address: string,
  limit = 20,
): Promise<ToolResult<Fill[]>> {
  if (!isAddress(address)) {
    return fail<Fill[]>(
      "hyperliquid",
      "INVALID_REQUEST",
      "That does not look like an EVM address.",
    );
  }

  const response = await providerFetch<WireFill[]>({
    provider: "hyperliquid",
    url: INFO,
    method: "POST",
    body: { type: "userFills", user: address.toLowerCase() },
    timeoutMs: 12_000,
  });

  if (!response.ok || !Array.isArray(response.data)) {
    return fail<Fill[]>(
      "hyperliquid",
      response.error?.code ?? "UPSTREAM_UNAVAILABLE",
      response.error?.message ?? "Hyperliquid did not answer.",
    );
  }

  const fills: Fill[] = [];
  /* The endpoint returns up to 2000 rows. Sliced here rather than rendered,
     because every caller wants the recent ones and none wants 2000. */
  for (const wire of response.data.slice(0, Math.min(Math.max(limit, 1), 100))) {
    const price = num(wire.px);
    const size = num(wire.sz);
    if (wire.coin === undefined || price === null || size === null) continue;

    fills.push({
      id: String(wire.tid ?? wire.oid ?? `${wire.coin}:${wire.time}`),
      symbol: wire.coin.toUpperCase(),
      side: sideOf(wire.side),
      direction: wire.dir ?? "",
      price,
      size,
      closedPnl: num(wire.closedPnl),
      fee: num(wire.fee),
      feeToken: wire.feeToken ?? null,
      at:
        wire.time === undefined
          ? new Date().toISOString()
          : new Date(wire.time).toISOString(),
      hash: wire.hash ?? null,
    });
  }

  return ok(fills, "hyperliquid");
}
