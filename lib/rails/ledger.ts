import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { LedgerEvent, LedgerVerification } from "@/lib/rails/types";

/* ---------------------------------------------------------------------------
   The agent ledger's hash chain. Pure: the server writes with it, the
   console verifies with it, and anyone holding an export can verify it with
   nothing but SHA-256.

   Each event's hash is SHA-256 over the canonical JSON of

     { v: 1, prev, seq, at, actor, event, subject, body }

   where `prev` is the previous event's hash (64 zeros for the first). The
   canonical form sorts object keys at every depth and writes no spaces, so
   the same event always hashes to the same bytes, however its JSON was
   stored. Bodies hold strings, booleans, small integers and nested objects
   — amounts travel as decimal strings, never floats, so nothing is rounded
   between writing and verifying.

   Changing, removing or reordering any event changes every hash after it;
   the database also refuses a second event at the same position or after
   the same predecessor, so the chain cannot fork.
--------------------------------------------------------------------------- */

export const GENESIS_HASH = "0".repeat(64);
export const LEDGER_VERSION = 1;

/** JSON with keys sorted at every depth and no whitespace. */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("A ledger value cannot be a non-finite number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  throw new Error(`A ledger value cannot be a ${typeof value}.`);
}

export interface LedgerEntry {
  prevHash: string;
  seq: number;
  at: string;
  actor: string;
  event: string;
  subjectId: string | null;
  body: Record<string, unknown>;
}

export function ledgerHash(entry: LedgerEntry): string {
  const payload = canonicalJson({
    v: LEDGER_VERSION,
    prev: entry.prevHash,
    seq: entry.seq,
    at: entry.at,
    actor: entry.actor,
    event: entry.event,
    subject: entry.subjectId,
    body: entry.body,
  });
  return bytesToHex(sha256(utf8ToBytes(payload)));
}

/** Checks a chain from its first event, in order. */
export function verifyChain(events: readonly LedgerEvent[]): LedgerVerification {
  let prev = GENESIS_HASH;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.seq !== index + 1) return { ok: false, count: events.length, brokenAt: event.seq, reason: "An event is missing or out of order." };
    if (event.prevHash !== prev) return { ok: false, count: events.length, brokenAt: event.seq, reason: "An event does not follow the one before it." };
    const expected = ledgerHash({
      prevHash: event.prevHash,
      seq: event.seq,
      at: event.at,
      actor: event.actor,
      event: event.event,
      subjectId: event.subjectId,
      body: event.body,
    });
    if (expected !== event.hash) return { ok: false, count: events.length, brokenAt: event.seq, reason: "An event's contents do not match its hash." };
    prev = event.hash;
  }
  return { ok: true, count: events.length, head: prev };
}

/** The ledger as CSV, for an export a person can keep and anyone can re-verify. */
export function ledgerCsv(events: readonly LedgerEvent[]): string {
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const rows = events.map((event) =>
    [String(event.seq), event.at, event.actor, event.event, event.subjectId ?? "", canonicalJson(event.body), event.prevHash, event.hash].map(cell).join(","),
  );
  return ["seq,at,actor,event,subject,body,prev_hash,hash", ...rows].join("\n") + "\n";
}
