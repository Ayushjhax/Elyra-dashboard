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

   Verified against the official Data API spec
   (docs.polymarket.com/api-spec/data-openapi.yaml) and live calls. Paths are
   not guessed: `/positions`, `/activity`, `/value` and `/closed-positions`
   are all in that document, all keyed on `user`.

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

const DATA = "https://data-api.polymarket.com";

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

interface WirePosition {
  proxyWallet?: string;
  asset?: string;
  conditionId?: string;
  size?: number;
  avgPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  realizedPnl?: number;
  curPrice?: number;
  redeemable?: boolean;
  mergeable?: boolean;
  title?: string;
  slug?: string;
  eventId?: string;
  outcome?: string;
  outcomeIndex?: number;
  endDate?: string;
  negativeRisk?: boolean;
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
  const value = wire.currentValue ?? 0;

  if (wire.redeemable === true) {
    return value > 0 ? "claimable" : "resolved";
  }

  /* A settled loser that is not flagged redeemable prices at exactly 0.
     Distinguished from a long shot still trading near zero by the end date
     having passed. */
  const ended =
    typeof wire.endDate === "string" && Date.parse(wire.endDate) < Date.now();
  if (ended && (wire.curPrice ?? 1) === 0) return "resolved";

  return "open";
}

function toPosition(wire: WirePosition, account: string): PredictionPosition | null {
  if (wire.conditionId === undefined || wire.title === undefined) return null;

  const size = num(wire.size);
  const current = num(wire.curPrice);

  return {
    /* Asset id is the outcome token, which is what makes a row unique — a
       user can hold both YES and NO on the same condition. */
    id: wire.asset ?? `${wire.conditionId}:${wire.outcomeIndex ?? 0}`,
    provider: "polymarket",
    accountId: account,
    marketId: wire.conditionId,
    eventId: wire.eventId ?? null,
    marketTitle: wire.title,
    slug: wire.slug ?? null,
    outcome: wire.outcome ?? "?",
    outcomeIndex: wire.outcomeIndex ?? null,
    quantity: size,
    entryPrice: num(wire.avgPrice),
    currentPrice: current === null ? null : Math.min(1, Math.max(0, current)),
    costBasisUsd: num(wire.initialValue),
    currentValueUsd: num(wire.currentValue),
    pnlUsd: num(wire.cashPnl),
    pnlPct: num(wire.percentPnl),
    realizedPnlUsd: num(wire.realizedPnl),
    endsAt: wire.endDate ?? null,
    status: statusOf(wire),
    /* Only true when there is value to collect — see statusOf. */
    redeemable: wire.redeemable === true && (wire.currentValue ?? 0) > 0,
  };
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

  const params = new URLSearchParams({
    user: account,
    limit: String(Math.min(Math.max(query.limit ?? 100, 1), 500)),
    sortBy: "CURRENT",
    sortDirection: "DESC",
    sizeThreshold: String(query.sizeThreshold ?? 1),
  });
  if (query.redeemableOnly === true) params.set("redeemable", "true");

  return cached(`polymarket:positions:${params.toString()}`, POSITION_TTL_MS, async () => {
    const response = await providerFetch<WirePosition[]>({
      provider: "polymarket",
      url: `${DATA}/positions?${params.toString()}`,
      timeoutMs: 15_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      /* A failure, never an empty list. "We could not read your positions"
         and "you have none" are opposite claims about someone's money. */
      return fail<PredictionPosition[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket positions could not be read.",
      );
    }

    const positions = response.data
      .map((wire) => toPosition(wire, account))
      .filter((position): position is PredictionPosition => position !== null);

    return ok(positions, "polymarket");
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
    const response = await providerFetch<Array<{ user?: string; value?: number }>>({
      provider: "polymarket",
      url: `${DATA}/value?user=${account}`,
      timeoutMs: 10_000,
    });

    const value = num(response.data?.[0]?.value);
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
  conditionId?: string;
  type?: string;
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
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
    const response = await providerFetch<WireActivity[]>({
      provider: "polymarket",
      url: `${DATA}/activity?user=${account}&limit=${size}`,
      timeoutMs: 15_000,
    });

    if (!response.ok || !Array.isArray(response.data)) {
      return fail<PredictionActivity[]>(
        "polymarket",
        response.error?.code ?? "UPSTREAM_UNAVAILABLE",
        response.error?.message ?? "Polymarket activity could not be read.",
      );
    }

    const rows: PredictionActivity[] = [];
    for (const wire of response.data) {
      if (typeof wire.timestamp !== "number") continue;

      rows.push({
        id: wire.transactionHash ?? `${wire.conditionId}:${wire.timestamp}`,
        provider: "polymarket",
        kind: activityKind(wire.type, wire.side),
        marketId: wire.conditionId ?? null,
        marketTitle: wire.title ?? null,
        outcome: wire.outcome ?? null,
        quantity: num(wire.size),
        price: num(wire.price),
        usdValue: num(wire.usdcSize),
        /* Seconds on the wire. Treating it as milliseconds dates every row to
           1970 and sorts the whole ledger wrong. */
        at: new Date(wire.timestamp * 1000).toISOString(),
        txHash: wire.transactionHash ?? null,
      });
    }

    return ok(rows, "polymarket");
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
