import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { rateLimited } from "@/lib/personalized/session";
import { serviceClient } from "@/lib/supabase/server";
import type { AgentKeyRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Agent keys: how an outside AI agent proves whose Elyra it is reading.

   A key is `elyra_ak_` + 32 random base-62 characters (about 190 bits). Only
   its SHA-256 is stored; the key is shown once, when it is created. A key
   carries scopes: `market` (public market data, always) and `account` (the
   owner's own portfolio and positions, only when they ask for it).

   Every call is held to two limits: a burst limit per minute, in memory, and
   a daily cap counted atomically in the database (claim_agent_key_call), so
   a leaked key can neither hammer the upstream sources nor run up unbounded
   reads. A key is revoked, never deleted.
--------------------------------------------------------------------------- */

export type AgentScope = "market" | "account";

export const KEY_PREFIX = "elyra_ak_";
const KEY_BODY = 32;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
/** How many characters of a key are kept for recognising it in a list. */
const SHOWN = KEY_PREFIX.length + 4;

export const MAX_KEYS_PER_ACCOUNT = 10;
export const CALLS_PER_MINUTE = 60;
export const CALLS_PER_DAY = 2_000;

export interface AgentAuth {
  keyId: string;
  userId: string;
  scopes: AgentScope[];
}

export interface AgentKeyView {
  id: string;
  name: string;
  prefix: string;
  scopes: AgentScope[];
  createdAt: string;
  lastUsedAt: string | null;
}

export class AgentKeyError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "AgentKeyError";
  }
}

/** A new key. Rejection sampling keeps every character equally likely. */
export function generateKey(): string {
  let body = "";
  while (body.length < KEY_BODY) {
    for (const byte of randomBytes(48)) {
      /* 62 × 4 = 248: bytes above it would bias the first characters. */
      if (byte < 248 && body.length < KEY_BODY) body += ALPHABET[byte % 62];
    }
  }
  return `${KEY_PREFIX}${body}`;
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

/** Whether a string is shaped like an agent key — checked before any lookup. */
export function looksLikeKey(value: string): boolean {
  return new RegExp(`^${KEY_PREFIX}[A-Za-z0-9]{${KEY_BODY}}$`).test(value);
}

/** The key from an `Authorization: Bearer …` header, or null. */
export function bearerKey(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match !== null && looksLikeKey(match[1]) ? match[1] : null;
}

function view(row: AgentKeyRow): AgentKeyView {
  return { id: row.id, name: row.name, prefix: row.prefix, scopes: row.scopes, createdAt: row.created_at, lastUsedAt: row.last_used_at };
}

export async function createAgentKey(userId: string, input: Record<string, unknown>): Promise<{ key: string; view: AgentKeyView }> {
  const name = typeof input.name === "string" ? input.name.trim().slice(0, 60) : "";
  if (name.length === 0) throw new AgentKeyError("Name the key after the agent that will use it.");
  const scopes: AgentScope[] = input.account === true ? ["market", "account"] : ["market"];
  const db = serviceClient();
  const active = await db.from("agent_keys").select("id").eq("user_id", userId).is("revoked_at", null);
  if (active.error !== null) throw new AgentKeyError("Agent keys need database migration 0022.", 503);
  if ((active.data ?? []).length >= MAX_KEYS_PER_ACCOUNT) {
    throw new AgentKeyError(`You can have ${MAX_KEYS_PER_ACCOUNT} active keys. Revoke one you no longer use.`);
  }
  const key = generateKey();
  const { data, error } = await db
    .from("agent_keys")
    .insert({ user_id: userId, name, prefix: key.slice(0, SHOWN), key_hash: hashKey(key), scopes })
    .select("*")
    .single();
  if (error !== null || data === null) throw new AgentKeyError("The key could not be saved.", 503);
  return { key, view: view(data as AgentKeyRow) };
}

export async function listAgentKeys(userId: string): Promise<AgentKeyView[]> {
  const { data, error } = await serviceClient()
    .from("agent_keys")
    .select("*")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  if (error !== null) throw new AgentKeyError("Agent keys need database migration 0022.", 503);
  return (data ?? []).map((row) => view(row as AgentKeyRow));
}

export async function revokeAgentKey(userId: string, id: string): Promise<void> {
  const { data, error } = await serviceClient()
    .from("agent_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error !== null) throw new AgentKeyError("The key could not be revoked.", 503);
  if ((data ?? []).length === 0) throw new AgentKeyError("No such key.", 404);
}

/** The owner and scopes of a live key, or null for a missing, malformed or revoked one. */
export async function authenticateAgentKey(key: string | null): Promise<AgentAuth | null> {
  if (key === null || !looksLikeKey(key)) return null;
  const db = serviceClient();
  const { data } = await db.from("agent_keys").select("*").eq("key_hash", hashKey(key)).is("revoked_at", null).maybeSingle();
  if (data === null || data === undefined) return null;
  const row = data as AgentKeyRow;
  /* Recorded at most once a minute: it is a hint for the owner, not a log. */
  const last = row.last_used_at === null ? 0 : Date.parse(row.last_used_at);
  if (Date.now() - last > 60_000) {
    await db.from("agent_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  }
  return { keyId: row.id, userId: row.user_id, scopes: row.scopes };
}

/**
 * Counts one tool call against a key. Returns why it is refused, or null.
 * The minute limit is checked first, so a burst never spends the day's cap.
 */
export async function claimCall(auth: AgentAuth): Promise<string | null> {
  if (rateLimited(`agent-key:${auth.keyId}`, CALLS_PER_MINUTE)) {
    return `This key is limited to ${CALLS_PER_MINUTE} calls a minute. Wait a moment and retry.`;
  }
  const { data, error } = await serviceClient().rpc("claim_agent_key_call", { p_key_id: auth.keyId, p_limit: CALLS_PER_DAY });
  if (error !== null) return "Usage could not be counted, so the call was not made.";
  const row = (data as { allowed: boolean; calls: number }[] | null)?.[0];
  if (row === undefined || !row.allowed) return `This key has used its ${CALLS_PER_DAY.toLocaleString("en-US")} calls for today (UTC).`;
  return null;
}
