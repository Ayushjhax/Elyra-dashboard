import "server-only";

import { randomBytes } from "node:crypto";
import { serviceClient } from "@/lib/supabase/server";
import type { PreparedAction } from "@/lib/personalized/types";
import type { PreparedActionStatus, PreparedActionSurface } from "@/lib/actions/types";

/* ---------------------------------------------------------------------------
   Prepared actions, and the opaque handle a Telegram button carries.

   ── The rule this file exists to enforce ───────────────────────────────

   A TELEGRAM TAP IS NOT A SIGNATURE.

   Telegram authenticates a *chat account*. It says nothing about custody of a
   wallet, and an inline button is not a consent mechanism for moving money.
   So a tap here does exactly one thing: it moves a record from `prepared` to
   `acknowledged` and returns a link. Confirmation happens in a surface that
   can verify the person and their wallet. Nothing in this repository can sign
   a transaction anyway — there is no signing path in it — but the boundary is
   written down here so that adding one later does not accidentally make a
   button an authorisation.

   ── Why the token is random ────────────────────────────────────────────

   `callback_data` is 64 bytes that Telegram hands back verbatim. Packing the
   action into it — "swap:SOL:USDC:21.25" — makes the amount an input to the
   webhook rather than a fact the server established. The token below is
   random, unguessable, and means nothing on its own: everything that decides
   what happens is read from the row it points at.

   ── Why they expire ────────────────────────────────────────────────────

   A swap prepared against one price and tapped twenty minutes later is a
   different trade. Expiry is short and enforced on read, not by a sweeper,
   so a row that outlives its window is unusable even if nothing cleaned up.
--------------------------------------------------------------------------- */

/** Long enough that guessing is hopeless, short enough for callback_data. */
const TOKEN_BYTES = 16;

/** A financial preview is stale well before this; ten minutes is generous. */
const TTL_MS = 10 * 60 * 1000;

/* Shared with the website and the Android app through lib/actions/types.ts. */
export type { PreparedActionStatus };

export interface PreparedActionRecord {
  id: string;
  userId: string;
  token: string;
  kind: string;
  action: PreparedAction;
  surface: PreparedActionSurface;
  status: PreparedActionStatus;
  expiresAt: string;
}

/** url-safe base64, so it survives callback_data without escaping. */
function newToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * The string an inline button carries.
 *
 * Prefixed so the webhook can route it without parsing, and bounded because
 * Telegram silently rejects a keyboard whose callback_data exceeds 64 bytes —
 * silently meaning the message sends without the buttons.
 */
export function callbackDataFor(token: string): string {
  const data = `action:${token}`;
  if (Buffer.byteLength(data, "utf8") > 64) {
    throw new Error("callback_data exceeds Telegram's 64-byte limit");
  }
  return data;
}

/** The token out of a callback payload, or null if it is not one of ours. */
export function tokenFromCallback(data: string): string | null {
  const match = /^action:([A-Za-z0-9_-]{16,64})$/.exec(data.trim());
  return match === null ? null : match[1];
}

/**
 * Persists a prepared action and returns its handle.
 *
 * Returns null when the store is unreachable. The caller must then show the
 * preview WITHOUT a button rather than with one that cannot resolve — a
 * button that does nothing is worse than no button, because the user waits.
 */
export async function storePreparedAction(input: {
  userId: string;
  action: PreparedAction;
  surface: PreparedActionSurface;
}): Promise<PreparedActionRecord | null> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { data, error } = await serviceClient()
    .from("prepared_actions")
    .insert({
      user_id: input.userId,
      token,
      kind: input.action.kind,
      payload: input.action,
      surface: input.surface,
      status: "prepared",
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    console.error("[telegram] could not store prepared action", error?.code ?? "no row");
    return null;
  }

  return {
    id: data.id,
    userId: input.userId,
    token,
    kind: input.action.kind,
    action: input.action,
    surface: input.surface,
    status: "prepared",
    expiresAt,
  };
}

/**
 * Resolves a token, for a specific user.
 *
 * `userId` is required and filtered on rather than read from the row. The
 * service-role client bypasses RLS, so this filter IS the tenant boundary:
 * without it, a token leaked from one chat would resolve in another. The
 * token being unguessable is not a substitute — defence in depth is the whole
 * reason both exist.
 */
export async function resolvePreparedAction(
  token: string,
  userId: string,
): Promise<PreparedActionRecord | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;

  const { data, error } = await serviceClient()
    .from("prepared_actions")
    .select("id, user_id, token, kind, payload, surface, status, expires_at")
    .eq("token", token)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  /* Enforced on read. A row that outlived its window is unusable whether or
     not anything swept it, and the clock that matters is this one. */
  if (Date.parse(data.expires_at) <= Date.now()) {
    return {
      id: data.id,
      userId: data.user_id,
      token: data.token,
      kind: data.kind,
      action: data.payload as PreparedAction,
      surface: data.surface,
      status: "expired",
      expiresAt: data.expires_at,
    };
  }

  return {
    id: data.id,
    userId: data.user_id,
    token: data.token,
    kind: data.kind,
    action: data.payload as PreparedAction,
    surface: data.surface,
    status: data.status as PreparedActionStatus,
    expiresAt: data.expires_at,
  };
}

/**
 * Records that the user tapped the button.
 *
 * Deliberately NOT `confirmed`. Acknowledgement means "this person saw the
 * preview in Telegram and asked to proceed"; confirmation means "this person
 * authorised moving money", and Telegram cannot establish the second.
 *
 * The `status = 'prepared'` filter makes this idempotent: a double tap, or
 * Telegram redelivering the callback, updates zero rows the second time.
 */
export async function acknowledgePreparedAction(
  token: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("prepared_actions")
    .update({ status: "acknowledged", updated_at: new Date().toISOString() })
    .eq("token", token)
    .eq("user_id", userId)
    .eq("status", "prepared")
    .gt("expires_at", new Date().toISOString())
    .select("id");

  if (error) {
    console.error("[telegram] could not acknowledge action", error.code);
    return false;
  }
  return (data ?? []).length > 0;
}

export async function cancelPreparedAction(
  token: string,
  userId: string,
): Promise<boolean> {
  const { data } = await serviceClient()
    .from("prepared_actions")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("token", token)
    .eq("user_id", userId)
    .in("status", ["prepared", "acknowledged"])
    .select("id");

  return (data ?? []).length > 0;
}

/* ---------------------------------------------------------------------------
   The web's side of the same record.

   Telegram prepares and acknowledges; the dashboard is the surface that can
   verify a wallet, so it is where an open action is finished or set aside.
   Both are addressed by row id rather than token — the token is Telegram's
   handle, and there is no reason to put it in a browser.
--------------------------------------------------------------------------- */

/** An action still waiting on the person: prepared or acknowledged, unexpired. */
export async function listOpenActions(userId: string): Promise<PreparedActionRecord[]> {
  const { data, error } = await serviceClient()
    .from("prepared_actions")
    .select("id, user_id, token, kind, payload, surface, status, expires_at")
    .eq("user_id", userId)
    .in("status", ["prepared", "acknowledged"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    token: row.token,
    kind: row.kind,
    action: row.payload as PreparedAction,
    surface: row.surface,
    status: row.status as PreparedActionStatus,
    expiresAt: row.expires_at,
  }));
}

/** Postgres undefined-column: a database from before 0012. */
const UNDEFINED_COLUMN = "42703";
let warnedNoSignatureColumn = false;

/**
 * Closes an open action from the web.
 *
 * `cancelled` is the person setting it aside. `confirmed` is written only
 * with the signature of the swap that did it, which /api/actions has
 * already checked on-chain; it is stored on the row as the evidence. Both
 * are filtered on `user_id` and on an open status, so a stale or foreign id
 * changes nothing.
 *
 * "closed" is an id that is not open for this user — already settled,
 * expired, or someone else's. "failed" is the database not answering, which
 * is not the same thing and must not be reported as it.
 */
export async function settleOpenAction(
  id: string,
  userId: string,
  settlement: { outcome: "cancelled" } | { outcome: "confirmed"; signature: string },
): Promise<"settled" | "closed" | "failed"> {
  const write = (withSignature: boolean) =>
    serviceClient()
      .from("prepared_actions")
      .update({
        status: settlement.outcome,
        updated_at: new Date().toISOString(),
        ...(withSignature && settlement.outcome === "confirmed"
          ? { confirmed_signature: settlement.signature }
          : {}),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .in("status", ["prepared", "acknowledged"])
      .select("id");

  let { data, error } = await write(true);

  /* A database one migration behind still records the confirmation — it was
     verified either way — and the log says what to run to keep the proof. */
  if (error?.code === UNDEFINED_COLUMN && settlement.outcome === "confirmed") {
    if (!warnedNoSignatureColumn) {
      warnedNoSignatureColumn = true;
      console.warn(
        "[actions] prepared_actions.confirmed_signature is missing, so signatures are not stored. " +
          "Apply supabase/migrations/0012_prepared_action_signature.sql.",
      );
    }
    ({ data, error } = await write(false));
  }

  if (error) {
    console.error("[actions] could not settle action", error.code);
    return "failed";
  }
  return (data ?? []).length > 0 ? "settled" : "closed";
}
