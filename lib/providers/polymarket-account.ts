import "server-only";

import { cached, providerFetch } from "@/lib/providers/http";
import {
  fail,
  ok,
  type PredictionActivity,
  type PredictionActivityKind,
  type PredictionPosition,
  type PredictionPositionStatus,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Polymarket — a specific account's positions and activity.

   Data API v2 (data-api.polymarket.com/v2/openapi.json), verified against
   live calls on 2026-11-25. v1 was retired on 2 November 2026 and now
   answers every route with an error, so nothing here may call it. v2 wraps
   each payload in `data`, writes fields in snake_case, pages by cursor and
   rejects `offset`; its positions route serves the whole lifecycle behind a
   single `status` (OPEN, REDEEMABLE, REDEEMABLE_LOST, MERGEABLE, CLOSED),
   and deposits and withdrawals appear in activity only when asked for.

   ── Public, and why that matters ───────────────────────────────────────

   These endpoints need no credential. Polymarket positions live on Polygon,
   so anyone can read anyone's — which is why browsing and tracking work with
   nothing connected, and why nothing in this file can ever WRITE. Placing an
   order needs a signed allowance and an authenticated CLOB session, neither
   of which exists in this repository.

   ── The address problem ────────────────────────────────────────────────

   Positions are held by a PROXY WALLET that Polymarket deploys per user, not
   by the EOA that controls it. A user's Privy EVM address and their
   Polymarket address are usually different strings, so querying with the EOA
   returns `[]` — which is indistinguishable from "no positions" unless the
   caller knows it asked about the right address.

   Every function here therefore takes an address that the caller has
   established IS the Polymarket account. `profiles.polymarket_address` is
   where that lives, and when it is absent the answer is "not connected",
   never "$0". Those are different facts and only one of them is true.
--------------------------------------------------------------------------- */

const DATA = "https://data-api.polymarket.com/v2";

/** Positions change on fills, not continuously. */
const POSITION_TTL_MS = 20_000;
const ACTIVITY_TTL_MS = 45_000;

function num(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

/* ---------------------------------------------------------------------------
   Positions
--------------------------------------------------------------------------- */

/** Every v2 read: the payload in `data`, and a cursor where it pages. */
interface Envelope<T> {
  data?: T | null;
  pagination?: { has_more?: boolean; next_cursor?: string | null } | null;
}

interface WirePosition {
  proxy_wallet?: string;
  token_id?: string;
  condition_id?: string;
  current_size?: number;
  avg_price?: number;
  /** What the shares still held cost, before fees — v1's `initialValue`. */
  entry_cost_usdc?: number;
  current_value?: number;
  /** current_value − entry_cost_usdc — v1's `cashPnl`. */
  unrealized_pnl?: number;
  percent_pnl?: number;
  realized_pnl?: number;
  total_pnl?: number;
  current_price?: number;
  status?: string;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  slug?: string;
  event_id?: string;
  outcome?: string;
  outcome_index?: number;
  end_date?: string;
  negative_risk?: boolean;
  /** Epoch seconds of the row's last economic event. */
  last_event_at?: number;
}

/**
 * Where a position stands.
 *
 * ── `redeemable` does NOT mean "won" ───────────────────────────────────
 *
 * Verified against a live account: Polymarket sets `redeemable: true` on
 * every position in a RESOLVED market, winners and losers alike — a losing
 * row comes back with `redeemable: true`, `currentValue: 0` and a `cashPnl`
 * of minus the whole stake. Reading the flag alone reported 200 settled
 * losses as "unclaimed winnings" and would have sent an alert congratulating
 * someone on a market they lost.
 *
 * So a claim is only a claim when there is something to collect: resolved AND
 * still worth something.
 */
function statusOf(wire: WirePosition): PredictionPositionStatus {
  const value = wire.current_value ?? 0;

  if (wire.redeemable === true) {
    return value > 0 ? "claimable" : "resolved";
  }

  /* A settled loser that is not flagged redeemable prices at exactly 0.
     Distinguished from a long shot still trading near zero by the end date
     having passed. */
  const ended =
    typeof wire.end_date === "string" && Date.parse(wire.end_date) < Date.now();
  if (ended && (wire.current_price ?? 1) === 0) return "resolved";

  return "open";
}

function toPosition(wire: WirePosition, account: string): PredictionPosition | null {
  if (typeof wire.condition_id !== "string" || wire.condition_id.length === 0 || typeof wire.title !== "string") return null;

  const size = num(wire.current_size);
  const current = num(wire.current_price);

  return {
    /* The token id is the outcome token, which is what makes a row unique —
       a user can hold both YES and NO on the same condition. */
    id: wire.token_id || `${wire.condition_id}:${wire.outcome_index ?? 0}`,
    provider: "polymarket",
    accountId: account,
    marketId: wire.condition_id,
    eventId: wire.event_id || null,
    marketTitle: wire.title,
    slug: wire.slug || null,
    outcome: wire.outcome || "?",
    outcomeIndex: wire.outcome_index ?? null,
    quantity: size,
    entryPrice: num(wire.avg_price),
    currentPrice: current === null ? null : Math.min(1, Math.max(0, current)),
    costBasisUsd: num(wire.entry_cost_usdc),
    currentValueUsd: num(wire.current_value),
    pnlUsd: num(wire.unrealized_pnl),
    pnlPct: num(wire.percent_pnl),
    realizedPnlUsd: num(wire.realized_pnl),
    endsAt: wire.end_date || null,
    status: statusOf(wire),
    /* Only true when there is value to collect — see statusOf. */
    redeemable: wire.redeemable === true && (wire.current_value ?? 0) > 0,
  };
}

/** One page of one position status, or the failure that stopped it. */
async function positionsPage(
  account: string,
  status: "OPEN" | "REDEEMABLE" | "CLOSED",
  extra: Record<string, string>,
): Promise<ToolResult<WirePosition[]>> {
  const params = new URLSearchParams({ user: account, status, ...extra });
  const response = await providerFetch<Envelope<WirePosition[]>>({
    provider: "polymarket",
    url: `${DATA}/positions?${params.toString()}`,
    timeoutMs: 15_000,
  });
  if (!response.ok || !Array.isArray(response.data?.data)) {
    /* A failure, never an empty list. "We could not read your positions"
       and "you have none" are opposite claims about someone's money. */
    return fail<WirePosition[]>(
      "polymarket",
      response.error?.code ?? "UPSTREAM_UNAVAILABLE",
      response.error?.message ?? "Polymarket positions could not be read.",
    );
  }
  return ok(response.data.data, "polymarket");
}

export interface PositionQuery {
  /** Hide dust. The API's own default is 1.0 share. */
  sizeThreshold?: number;
  /** Only settled positions awaiting a claim. */
  redeemableOnly?: boolean;
  limit?: number;
}

/**
 * Every prediction position an account holds.
 *
 * Sorted by current value, so the first row is the one that matters most —
 * the API's default sort is by share count, which ranks a thousand shares of
 * a 2¢ long shot above ten shares of a 90¢ near-certainty.
 */
export async function polymarketPositions(
  address: string,
  query: PositionQuery = {},
): Promise<ToolResult<PredictionPosition[]>> {
  const account = address.trim().toLowerCase();
  if (!isAddress(account)) {
    return fail<PredictionPosition[]>(
      "polymarket",
      "INVALID_REQUEST",
      "A Polymarket account address is an EVM address.",
    );
  }

  const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
  const threshold = query.sizeThreshold ?? 1;
  /* v1's one list was every position still held. v2 splits it: OPEN is a
     market still trading, REDEEMABLE a resolved one not yet claimed — the
     row that carries unclaimed winnings, so it is never left out. One
     status per request, so two requests; either failing fails the read. */
  const statuses = query.redeemableOnly === true ? (["REDEEMABLE"] as const) : (["OPEN", "REDEEMABLE"] as const);
  const extra = { limit: String(limit), sort_by: "CURRENT_VALUE", sort_direction: "DESC" };

  return cached(`polymarket:positions:${account}:${statuses.join(",")}:${limit}:${threshold}`, POSITION_TTL_MS, async () => {
    const pages = await Promise.all(statuses.map((status) => positionsPage(account, status, extra)));
    const failed = pages.find((page) => !page.ok);
    if (failed !== undefined) {
      return fail<PredictionPosition[]>(
        "polymarket",
        failed.error?.code ?? "UPSTREAM_UNAVAILABLE",
        failed.error?.message ?? "Polymarket positions could not be read.",
      );
    }

    const seen = new Set<string>();
    const positions = pages
      .flatMap((page) => page.data ?? [])
      .map((wire) => toPosition(wire, account))
      .filter((position): position is PredictionPosition => {
        if (position === null || seen.has(position.id)) return false;
        seen.add(position.id);
        /* Dust is hidden, as v1's sizeThreshold did — a share count, not
           a dollar value. */
        return (position.quantity ?? 0) >= threshold;
      })
      .sort((a, b) => (b.currentValueUsd ?? 0) - (a.currentValueUsd ?? 0))
      .slice(0, limit);

    return ok(positions, "polymarket");
  });
}

/** A position whose outcome is settled: sold out, redeemed, or resolved and unclaimed. */
export interface ClosedPredictionPosition {
  id: string;
  marketTitle: string;
  outcome: string;
  /** The position's final result in USD: realised, plus what a resolved row still holds. */
  pnlUsd: number;
  /** When its last economic event happened. */
  at: string;
}

const CLOSED_PAGES = 4;

/**
 * Settled positions since `sinceSec`, newest first — the prediction half of
 * a win rate. CLOSED rows are fully exited; REDEEMABLE rows are resolved and
 * still held, so their outcome is final too (a resolved loser holds $0).
 * Rows with no clock are left out by the API itself under a time bound.
 */
export async function polymarketClosedPositions(
  address: string,
  sinceSec: number,
): Promise<ToolResult<ClosedPredictionPosition[]>> {
  const account = address.trim().toLowerCase();
  if (!isAddress(account)) {
    return fail<ClosedPredictionPosition[]>("polymarket", "INVALID_REQUEST", "That is not an EVM address.");
  }

  return cached(`polymarket:closed:${account}:${Math.floor(sinceSec / 3600)}`, ACTIVITY_TTL_MS, async () => {
    const rows: ClosedPredictionPosition[] = [];
    for (const status of ["CLOSED", "REDEEMABLE"] as const) {
      let cursor: string | null = null;
      for (let page = 0; page < CLOSED_PAGES; page += 1) {
        const extra: Record<string, string> = { sort_by: "TIMESTAMP", sort_direction: "DESC", start: String(Math.max(0, Math.floor(sinceSec))) };
        if (cursor === null) extra.limit = "500";
        else extra.cursor = cursor;
        const params = new URLSearchParams({ user: account, status, ...extra });
        const response: ToolResult<Envelope<WirePosition[]>> = await providerFetch<Envelope<WirePosition[]>>({
          provider: "polymarket",
          url: `${DATA}/positions?${params.toString()}`,
          timeoutMs: 15_000,
        });
        if (!response.ok || !Array.isArray(response.data?.data)) {
          return fail<ClosedPredictionPosition[]>(
            "polymarket",
            response.error?.code ?? "UPSTREAM_UNAVAILABLE",
            response.error?.message ?? "Polymarket's closed positions could not be read.",
          );
        }
        for (const wire of response.data.data) {
          const pnl = num(wire.total_pnl) ?? num(wire.realized_pnl);
          if (pnl === null || typeof wire.last_event_at !== "number" || typeof wire.title !== "string") continue;
          rows.push({
            id: wire.token_id || `${wire.condition_id}:${wire.outcome_index ?? 0}`,
            marketTitle: wire.title,
            outcome: wire.outcome || "?",
            pnlUsd: pnl,
            at: new Date(wire.last_event_at * 1000).toISOString(),
          });
        }
        cursor = response.data.pagination?.has_more === true ? (response.data.pagination.next_cursor ?? null) : null;
        if (cursor === null) break;
      }
    }
    return ok(rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)), "polymarket");
  });
}

/** Total current value of an account's open positions, as the venue reports it. */
export async function polymarketAccountValue(
  address: string,
): Promise<ToolResult<number>> {
  const account = address.trim().toLowerCase();
  if (!isAddress(account)) {
    return fail<number>("polymarket", "INVALID_REQUEST", "That is not an EVM address.");
  }

  return cached(`polymarket:value:${account}`, POSITION_TTL_MS, async () => {
    const response = await providerFetch<Envelope<{ proxy_wallet?: string; value?: number }>>({
      provider: "polymarket",
      url: `${DATA}/value?user=${account}`,
      timeoutMs: 10_000,
    });

    const value = num(response.data?.data?.value);
    if (!response.ok || value === null) {
      return fail<number>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket account value could not be read.",
      );
    }

    return ok(value, "polymarket");
  });
}

/* ---------------------------------------------------------------------------
   Activity
--------------------------------------------------------------------------- */

interface WireActivity {
  timestamp?: number;
  condition_id?: string;
  type?: string;
  size?: number;
  usdc_size?: number;
  transaction_hash?: string;
  price?: number;
  side?: string;
  title?: string;
  outcome?: string;
}

/** The provider's own words, mapped onto the ledger's vocabulary. */
function activityKind(type: string | undefined, side: string | undefined): PredictionActivityKind {
  const upper = (type ?? "").toUpperCase();
  if (upper === "REDEEM") return "prediction_redeem";
  if (upper === "REWARD") return "prediction_settlement";
  if (upper === "SPLIT") return "prediction_split";
  if (upper === "MERGE") return "prediction_merge";
  if (upper === "TRADE") {
    return (side ?? "").toUpperCase() === "SELL" ? "prediction_sell" : "prediction_buy";
  }
  /* An unrecognised type is passed through as `other` rather than guessed
     into a buy or a sell — a mislabelled direction in a ledger is worse than
     an unlabelled row. */
  return "prediction_other";
}

export async function polymarketActivity(
  address: string,
  limit = 25,
): Promise<ToolResult<PredictionActivity[]>> {
  const account = address.trim().toLowerCase();
  if (!isAddress(account)) {
    return fail<PredictionActivity[]>(
      "polymarket",
      "INVALID_REQUEST",
      "That is not an EVM address.",
    );
  }

  const size = Math.min(Math.max(limit, 1), 100);

  return cached(`polymarket:activity:${account}:${size}`, ACTIVITY_TTL_MS, async () => {
    const response = await providerFetch<Envelope<WireActivity[]>>({
      provider: "polymarket",
      url: `${DATA}/activity?user=${account}&limit=${size}`,
      timeoutMs: 15_000,
    });

    if (!response.ok || !Array.isArray(response.data?.data)) {
      return fail<PredictionActivity[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket activity could not be read.",
      );
    }

    const rows: PredictionActivity[] = [];
    for (const wire of response.data.data) {
      if (typeof wire.timestamp !== "number") continue;

      rows.push({
        id: wire.transaction_hash || `${wire.condition_id}:${wire.timestamp}`,
        provider: "polymarket",
        kind: activityKind(wire.type, wire.side),
        marketId: wire.condition_id || null,
        marketTitle: wire.title || null,
        outcome: wire.outcome || null,
        quantity: num(wire.size),
        price: num(wire.price),
        usdValue: num(wire.usdc_size),
        /* Seconds on the wire. Treating it as milliseconds dates every row to
           1970 and sorts the whole ledger wrong. */
        at: new Date(wire.timestamp * 1000).toISOString(),
        txHash: wire.transaction_hash || null,
      });
    }

    return ok(rows, "polymarket");
  });
}

/** Money into or out of the Polymarket account: positive in, negative out. */
export interface PredictionFlow {
  usd: number;
  at: string;
  txHash: string | null;
}

/**
 * Deposits and withdrawals since `sinceSec` — what the portfolio's flow
 * tracking needs so that funding Polymarket does not read as a gain. v2
 * drops these rows unless `exclude_deposits_withdrawals=false`.
 */
export async function polymarketFlows(
  address: string,
  sinceSec: number,
): Promise<ToolResult<PredictionFlow[]>> {
  const account = address.trim().toLowerCase();
  if (!isAddress(account)) {
    return fail<PredictionFlow[]>("polymarket", "INVALID_REQUEST", "That is not an EVM address.");
  }
  const params = new URLSearchParams({
    user: account,
    type: "DEPOSIT,WITHDRAWAL",
    exclude_deposits_withdrawals: "false",
    start: String(Math.max(0, Math.floor(sinceSec))),
    limit: "500",
  });
  return cached(`polymarket:flows:${params.toString()}`, ACTIVITY_TTL_MS, async () => {
    const response = await providerFetch<Envelope<WireActivity[]>>({
      provider: "polymarket",
      url: `${DATA}/activity?${params.toString()}`,
      timeoutMs: 15_000,
    });
    if (!response.ok || !Array.isArray(response.data?.data)) {
      return fail<PredictionFlow[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket deposits and withdrawals could not be read.",
      );
    }
    const flows: PredictionFlow[] = [];
    for (const wire of response.data.data) {
      const usd = num(wire.usdc_size);
      if (typeof wire.timestamp !== "number" || usd === null) continue;
      const type = (wire.type ?? "").toUpperCase();
      if (type !== "DEPOSIT" && type !== "WITHDRAWAL") continue;
      flows.push({
        usd: type === "DEPOSIT" ? usd : -usd,
        at: new Date(wire.timestamp * 1000).toISOString(),
        txHash: wire.transaction_hash || null,
      });
    }
    return ok(flows, "polymarket");
  });
}

/* ---------------------------------------------------------------------------
   Open orders

   Deliberately absent. Resting orders live in the CLOB's `/data/orders`,
   which requires an authenticated API key derived from a wallet signature —
   unlike positions, they are not on-chain and not public. There is no
   authenticated CLOB session in this repository, so an orders function here
   could only ever return an empty array, and an empty array would read as
   "you have no resting orders" rather than "Elyra cannot see them".

   `predictionOrdersUnavailable` is what the tool layer returns instead, so
   the distinction survives all the way to the user.
--------------------------------------------------------------------------- */

export const ORDERS_REQUIRE_AUTH =
  "Open orders are not public on Polymarket — reading them needs an " +
  "authenticated CLOB session, which Elyra does not have yet. This is a " +
  "missing connection, not an empty order book.";
