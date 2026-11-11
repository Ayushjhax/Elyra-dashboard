import "server-only";

import { LIMITS, dexOf, exitPrices } from "@/lib/autotrade/rules";
import { signL1Action } from "@/lib/autotrade/sign";
import {
  API_URL,
  cancelByCloidAction,
  cloidFrom,
  floorSize,
  limitOrder,
  orderAction,
  roundPerpPrice,
  triggerOrder,
  updateLeverageAction,
  type ApproveAgentAction,
  type Network,
} from "@/lib/autotrade/wire";
import type { Packable } from "@/lib/autotrade/msgpack";
import type { Side } from "@/lib/autotrade/rules";
import type { Candle } from "@/lib/backtest/intervals";

/* ---------------------------------------------------------------------------
   Hyperliquid execution — the one place in this codebase that calls /exchange.

   lib/exchange/ stays read-only, as its header says; order placement lives
   here, behind the automation's own limits and the AUTOTRADE_LIVE switch.

   An entry is ONE request: an immediate-or-cancel buy at the mid plus a
   bounded slippage, grouped (`normalTpsl`) with a reduce-only take-profit and
   stop-loss. Hyperliquid attaches the two to the fill and holds them on the
   exchange, so they work between Elyra's five-minute checks and even if
   Elyra is down. If the buy does not fill, neither exit is placed.
--------------------------------------------------------------------------- */

const TIMEOUT_MS = 10_000;

async function post<T>(network: Network, path: "/info" | "/exchange", body: unknown): Promise<T> {
  const response = await fetch(`${API_URL[network]}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Hyperliquid answered ${response.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

export interface PerpMeta {
  asset: number;
  szDecimals: number;
  maxLeverage: number;
}

const metaCache = new Map<string, { at: number; byCoin: Map<string, PerpMeta> }>();
const dexIndexCache = new Map<Network, { at: number; byName: Map<string, number> }>();

/**
 * A builder-deployed exchange's place in Hyperliquid's list, which its asset
 * ids are numbered from. Read, never hard-coded: testnet's list differs.
 */
async function dexIndex(network: Network, dex: string): Promise<number | null> {
  const cached = dexIndexCache.get(network);
  if (cached === undefined || Date.now() - cached.at > 10 * 60_000) {
    const dexes = await post<Array<{ name: string } | null>>(network, "/info", { type: "perpDexs" });
    const byName = new Map<string, number>();
    dexes.forEach((entry, index) => {
      if (entry !== null && typeof entry.name === "string") byName.set(entry.name, index);
    });
    dexIndexCache.set(network, { at: Date.now(), byName });
  }
  return dexIndexCache.get(network)?.byName.get(dex) ?? null;
}

/**
 * The asset id, size decimals and leverage cap for a coin.
 *
 * Hyperliquid's own perps are numbered by their place in `meta`. A builder-
 * deployed perp ("xyz:NVDA") is 100000 + dex index × 10000 + its place in
 * that dex's `meta` — Hyperliquid's documented formula (api/asset-ids).
 */
export async function perpMeta(network: Network, coin: string): Promise<PerpMeta | null> {
  const dex = dexOf(coin);
  const key = `${network}:${dex ?? ""}`;
  const cached = metaCache.get(key);
  if (cached === undefined || Date.now() - cached.at > 10 * 60_000) {
    let offset = 0;
    if (dex !== null) {
      const index = await dexIndex(network, dex);
      if (index === null) return null;
      offset = 100_000 + index * 10_000;
    }
    const meta = await post<{ universe: { name: string; szDecimals: number; maxLeverage: number; isDelisted?: boolean }[] }>(
      network,
      "/info",
      dex === null ? { type: "meta" } : { type: "meta", dex },
    );
    const byCoin = new Map<string, PerpMeta>();
    meta.universe.forEach((entry, index) => {
      if (entry.isDelisted !== true) byCoin.set(entry.name, { asset: offset + index, szDecimals: entry.szDecimals, maxLeverage: entry.maxLeverage });
    });
    metaCache.set(key, { at: Date.now(), byCoin });
  }
  return metaCache.get(key)?.byCoin.get(coin) ?? null;
}

export async function midPrice(network: Network, coin: string): Promise<number | null> {
  const dex = dexOf(coin);
  const mids = await post<Record<string, string>>(network, "/info", dex === null ? { type: "allMids" } : { type: "allMids", dex });
  const mid = Number(mids[coin]);
  return Number.isFinite(mid) && mid > 0 ? mid : null;
}

/** The account's signed position size in `coin`; 0 when flat. A builder dex keeps its own book. */
export async function positionSize(network: Network, account: string, coin: string): Promise<number> {
  const dex = dexOf(coin);
  const state = await post<{ assetPositions: { position: { coin: string; szi: string } }[] }>(
    network,
    "/info",
    dex === null ? { type: "clearinghouseState", user: account } : { type: "clearinghouseState", user: account, dex },
  );
  const position = state.assetPositions.find((entry) => entry.position.coin === coin);
  return position === undefined ? 0 : Number(position.position.szi);
}

/**
 * Bars from Hyperliquid itself, so a setup is read on the market it trades.
 * Always mainnet: testnet's prices are play prices, and a strategy tested on
 * them would be tested on nothing. Hyperliquid serves the latest 5,000 bars.
 */
export async function hyperliquidCandles(coin: string, interval: string, startTime: number, endTime: number): Promise<Candle[]> {
  const rows = await post<{ t: number; T: number; o: string; h: string; l: string; c: string; v: string; i: string }[]>("mainnet", "/info", {
    type: "candleSnapshot",
    req: { coin, interval, startTime, endTime },
  });
  return rows.map((row) => ({
    instrumentId: coin,
    venue: "hyperliquid",
    interval: row.i,
    openTime: row.t,
    closeTime: row.T,
    open: Number(row.o),
    high: Number(row.h),
    low: Number(row.l),
    close: Number(row.c),
    volume: Number(row.v),
    complete: row.T < endTime,
    source: "hyperliquid",
  }));
}

export interface Fill {
  coin: string;
  px: string;
  sz: string;
  side: "A" | "B";
  time: number;
  closedPnl: string;
  fee: string;
}

export async function fillsSince(network: Network, account: string, startTime: number): Promise<Fill[]> {
  return post<Fill[]>(network, "/info", { type: "userFillsByTime", user: account, startTime, aggregateByTime: true });
}

type OrderStatus = { filled?: { totalSz: string; avgPx: string; oid: number }; resting?: { oid: number }; error?: string } | string;

interface ExchangeResponse {
  status: "ok" | "err";
  response: string | { type: string; data?: { statuses?: OrderStatus[] } };
}

async function send(network: Network, key: `0x${string}`, action: Packable): Promise<ExchangeResponse> {
  const nonce = Date.now();
  const signature = await signL1Action(key, action, nonce, network);
  return post<ExchangeResponse>(network, "/exchange", { action, nonce, signature, vaultAddress: null });
}

function failure(response: ExchangeResponse): string | null {
  if (response.status === "err") return typeof response.response === "string" ? response.response : "Hyperliquid refused the request.";
  return null;
}

export type OpenResult =
  | { ok: true; size: number; entryPrice: number; takeProfit: number; stopLoss: number; cloids: { entry: string; tp: string; sl: string } }
  | { ok: false; error: string };

/**
 * Opens a long (buy) or a short (sell) of `sizeUsd` of `coin` with leverage,
 * its TP and SL attached. For a short every price flips side: the entry
 * sells below the mid, and the exits are reduce-only BUYS, the take-profit
 * under the entry and the stop above it.
 */
export async function openPosition(input: {
  network: Network;
  key: `0x${string}`;
  side: Side;
  coin: string;
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  /** Unique per rule and bar, so a retry carries the same client order ids. */
  seed: string;
}): Promise<OpenResult> {
  const meta = await perpMeta(input.network, input.coin);
  if (meta === null) return { ok: false, error: `${input.coin} is not a listed perp on Hyperliquid ${input.network}.` };
  const leverage = Math.min(input.leverage, meta.maxLeverage, LIMITS.maxLeverage);

  const mid = await midPrice(input.network, input.coin);
  if (mid === null) return { ok: false, error: `Hyperliquid has no price for ${input.coin} right now.` };

  const size = floorSize(input.sizeUsd / mid, meta.szDecimals);
  if (size === null) return { ok: false, error: "The size is smaller than the smallest order this coin allows." };

  /* Isolated margin: a position can lose at most what was put up for it,
     never the rest of the account. */
  const lever = await send(input.network, input.key, updateLeverageAction(meta.asset, leverage, false));
  const leverError = failure(lever);
  if (leverError !== null) return { ok: false, error: `Could not set leverage: ${leverError}` };

  const long = input.side === "long";
  const { takeProfit, stopLoss } = exitPrices(input.side, mid, input.takeProfitPct, input.stopLossPct);
  /* The exits close the position, so they trade the other way — and their
     worst acceptable fill is further in that direction. */
  const exitSlip = (long ? -1 : 1) * (LIMITS.triggerSlippagePct / 100);
  const entrySlip = (long ? 1 : -1) * (LIMITS.entrySlippagePct / 100);
  const cloids = { entry: cloidFrom(`${input.seed}:entry`), tp: cloidFrom(`${input.seed}:tp`), sl: cloidFrom(`${input.seed}:sl`) };

  const action = orderAction(
    [
      limitOrder({
        asset: meta.asset,
        isBuy: long,
        price: roundPerpPrice(mid * (1 + entrySlip), meta.szDecimals),
        size,
        reduceOnly: false,
        tif: "Ioc",
        cloid: cloids.entry,
      }),
      triggerOrder({
        asset: meta.asset,
        isBuy: !long,
        triggerPrice: roundPerpPrice(takeProfit, meta.szDecimals),
        limitPrice: roundPerpPrice(takeProfit * (1 + exitSlip), meta.szDecimals),
        size,
        tpsl: "tp",
        cloid: cloids.tp,
      }),
      triggerOrder({
        asset: meta.asset,
        isBuy: !long,
        triggerPrice: roundPerpPrice(stopLoss, meta.szDecimals),
        limitPrice: roundPerpPrice(stopLoss * (1 + exitSlip), meta.szDecimals),
        size,
        tpsl: "sl",
        cloid: cloids.sl,
      }),
    ],
    "normalTpsl",
  );

  const response = await send(input.network, input.key, action);
  const refused = failure(response);
  if (refused !== null) return { ok: false, error: refused };

  const statuses = typeof response.response === "object" ? (response.response.data?.statuses ?? []) : [];
  const entry = statuses[0];
  if (typeof entry !== "object" || entry.filled === undefined) {
    const reason =
      typeof entry === "object" && entry.error !== undefined
        ? entry.error
        : `The ${long ? "buy" : "sale"} did not fill within the slippage allowed.`;
    return { ok: false, error: reason };
  }
  return {
    ok: true,
    size: Number(entry.filled.totalSz),
    entryPrice: Number(entry.filled.avgPx),
    takeProfit: Number(roundPerpPrice(takeProfit, meta.szDecimals)),
    stopLoss: Number(roundPerpPrice(stopLoss, meta.szDecimals)),
    cloids,
  };
}

/** Trades a position back to flat — a sale for a long, a buy for a short — then cancels its exits. */
export async function closePosition(input: {
  network: Network;
  key: `0x${string}`;
  side: Side;
  coin: string;
  size: number;
  cloids: { tp: string | null; sl: string | null };
}): Promise<{ ok: true; exitPrice: number } | { ok: false; error: string }> {
  const meta = await perpMeta(input.network, input.coin);
  const mid = await midPrice(input.network, input.coin);
  if (meta === null || mid === null) return { ok: false, error: `No market for ${input.coin} right now.` };
  const size = floorSize(input.size, meta.szDecimals);
  if (size === null) return { ok: false, error: "Nothing to close." };
  const buy = input.side === "short";

  const response = await send(
    input.network,
    input.key,
    orderAction([
      limitOrder({
        asset: meta.asset,
        isBuy: buy,
        price: roundPerpPrice(mid * (1 + (buy ? 1 : -1) * (LIMITS.entrySlippagePct / 100)), meta.szDecimals),
        size,
        reduceOnly: true,
        tif: "Ioc",
      }),
    ]),
  );
  const refused = failure(response);
  if (refused !== null) return { ok: false, error: refused };
  const status = typeof response.response === "object" ? response.response.data?.statuses?.[0] : undefined;
  if (typeof status !== "object" || status.filled === undefined) {
    return { ok: false, error: typeof status === "object" && status.error ? status.error : "The closing order did not fill." };
  }

  const cancels = [input.cloids.tp, input.cloids.sl].filter((cloid): cloid is string => cloid !== null);
  if (cancels.length > 0) {
    /* Best effort: reduce-only exits cannot open anything once flat. */
    await send(input.network, input.key, cancelByCloidAction(cancels.map((cloid) => ({ asset: meta.asset, cloid })))).catch(() => null);
  }
  return { ok: true, exitPrice: Number(status.filled.avgPx) };
}

export type LimitResult =
  | {
      ok: true;
      /** "resting" while it waits on the book; "filled" if the price was already there. */
      state: "resting" | "filled";
      size: number;
      entryPrice: number | null;
      price: number;
      takeProfit: number;
      stopLoss: number;
      cloids: { entry: string; tp: string; sl: string };
    }
  | { ok: false; error: string };

/**
 * A good-till-cancelled limit order with its take-profit and stop-loss, in
 * one request (`normalTpsl`). It rests on Hyperliquid's book, so it fills at
 * the price whether or not anyone has Elyra open; the exits attach the moment
 * it fills. Elyra only learns of the fill on its next check.
 */
export async function placeLimitOrder(input: {
  network: Network;
  key: `0x${string}`;
  side: Side;
  coin: string;
  sizeUsd: number;
  leverage: number;
  price: number;
  takeProfit: number;
  stopLoss: number;
  seed: string;
}): Promise<LimitResult> {
  const meta = await perpMeta(input.network, input.coin);
  if (meta === null) return { ok: false, error: `${input.coin} is not a listed perp on Hyperliquid ${input.network}.` };
  const leverage = Math.min(input.leverage, meta.maxLeverage, LIMITS.maxLeverage);
  const size = floorSize(input.sizeUsd / input.price, meta.szDecimals);
  if (size === null) return { ok: false, error: "The size is smaller than the smallest order this market allows." };

  const lever = await send(input.network, input.key, updateLeverageAction(meta.asset, leverage, false));
  const leverError = failure(lever);
  if (leverError !== null) return { ok: false, error: `Could not set leverage: ${leverError}` };

  const long = input.side === "long";
  const exitSlip = (long ? -1 : 1) * (LIMITS.triggerSlippagePct / 100);
  const price = roundPerpPrice(input.price, meta.szDecimals);
  const takeProfit = roundPerpPrice(input.takeProfit, meta.szDecimals);
  const stopLoss = roundPerpPrice(input.stopLoss, meta.szDecimals);
  const cloids = { entry: cloidFrom(`${input.seed}:entry`), tp: cloidFrom(`${input.seed}:tp`), sl: cloidFrom(`${input.seed}:sl`) };

  const response = await send(
    input.network,
    input.key,
    orderAction(
      [
        limitOrder({ asset: meta.asset, isBuy: long, price, size, reduceOnly: false, tif: "Gtc", cloid: cloids.entry }),
        triggerOrder({
          asset: meta.asset,
          isBuy: !long,
          triggerPrice: takeProfit,
          limitPrice: roundPerpPrice(Number(takeProfit) * (1 + exitSlip), meta.szDecimals),
          size,
          tpsl: "tp",
          cloid: cloids.tp,
        }),
        triggerOrder({
          asset: meta.asset,
          isBuy: !long,
          triggerPrice: stopLoss,
          limitPrice: roundPerpPrice(Number(stopLoss) * (1 + exitSlip), meta.szDecimals),
          size,
          tpsl: "sl",
          cloid: cloids.sl,
        }),
      ],
      "normalTpsl",
    ),
  );
  const refused = failure(response);
  if (refused !== null) return { ok: false, error: refused };

  const entry = typeof response.response === "object" ? response.response.data?.statuses?.[0] : undefined;
  if (typeof entry === "object" && entry.error !== undefined) return { ok: false, error: entry.error };
  const filled = typeof entry === "object" && entry.filled !== undefined ? entry.filled : null;
  const resting = typeof entry === "object" && entry.resting !== undefined;
  if (filled === null && !resting) return { ok: false, error: "Hyperliquid did not confirm the order." };
  return {
    ok: true,
    state: filled !== null ? "filled" : "resting",
    size: filled !== null ? Number(filled.totalSz) : Number(size),
    entryPrice: filled !== null ? Number(filled.avgPx) : null,
    price: Number(price),
    takeProfit: Number(takeProfit),
    stopLoss: Number(stopLoss),
    cloids,
  };
}

/** Where an order stands on Hyperliquid, looked up by its client order id. */
export async function orderStatus(
  network: Network,
  account: string,
  cloid: string,
): Promise<{ status: string; filledSize: number | null; limitPrice: number | null }> {
  const answer = await post<{ status: string; order?: { status?: string; order?: { limitPx?: string; origSz?: string; sz?: string } } }>(network, "/info", {
    type: "orderStatus",
    user: account,
    oid: cloid,
  });
  if (answer.status !== "order" || answer.order === undefined) return { status: "unknown", filledSize: null, limitPrice: null };
  const order = answer.order.order ?? {};
  const original = Number(order.origSz);
  const remaining = Number(order.sz);
  return {
    status: answer.order.status ?? "unknown",
    filledSize: Number.isFinite(original) && Number.isFinite(remaining) ? original - remaining : null,
    limitPrice: Number.isFinite(Number(order.limitPx)) ? Number(order.limitPx) : null,
  };
}

/** Cancels orders by client order id. Ids already filled or gone are ignored by the exchange. */
export async function cancelOrders(network: Network, key: `0x${string}`, coin: string, cloids: string[]): Promise<string | null> {
  const meta = await perpMeta(network, coin);
  if (meta === null) return `${coin} is not a listed perp on Hyperliquid ${network}.`;
  const response = await send(network, key, cancelByCloidAction(cloids.map((cloid) => ({ asset: meta.asset, cloid }))));
  return failure(response);
}

/** Submits the person's signed approval of Elyra's trading key. */
export async function submitAgentApproval(
  network: Network,
  action: ApproveAgentAction,
  signature: { r: string; s: string; v: number },
): Promise<string | null> {
  const response = await post<ExchangeResponse>(network, "/exchange", { action, nonce: action.nonce, signature });
  return failure(response);
}
