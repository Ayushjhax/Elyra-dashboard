import "server-only";

import { describe as describeError, isUnreachable } from "@/lib/supabase/reachability";
import { serviceClient } from "@/lib/supabase/server";
import type { MemorySource, MemoryType, PersonalizedMemory } from "@/lib/personalized/types";
import type { PersonalizedMemoryRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Durable preferences.

   A memory is a standing instruction — "never let one asset exceed 25%" —
   and it is read on every turn, whatever the conversation. That is the whole
   distinction from chat history, which scrolls away.

   Two rules the spec is emphatic about and this file enforces:

   1. Phase 1 is EXPLICIT only. Nothing here writes a memory the operator did
      not state. `source: "inferred"` exists in the type because the column
      does, but no code path in this repository produces one — inferring a
      risk limit from a single trade and then silently enforcing it is the
      failure mode the separation is meant to prevent.

   2. Every read and write is scoped by `user_id` in the query itself. The
      service-role client bypasses RLS and Privy means auth.uid() is null, so
      a missing filter here is not caught by anything downstream.
--------------------------------------------------------------------------- */

/** Reported once. A missing table is a migration to run, not a per-request error. */
let tableMissing = false;

function noteMissing(reason: string): void {
  if (tableMissing) return;
  tableMissing = true;
  console.warn(
    `\n[elyra] personalized_memories is unavailable: ${reason}\n` +
      "  Saved preferences will not persist. Run\n" +
      "  supabase/migrations/0005_personalized.sql to enable them.\n",
  );
}

function missingTable(error: { code?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205";
}

/* ---------------------------------------------------------------------------
   Validation

   A memory reaches this file from an HTTP body, so its value is validated
   against its type before it is written. A "concentration_limit" of "banana"
   would otherwise flow into `riskMetrics`, fail a comparison silently, and
   quietly disable the limit the operator thought they had set.
--------------------------------------------------------------------------- */

const TYPES: MemoryType[] = [
  "concentration_limit",
  "stablecoin_buffer",
  "preferred_venue",
  "leverage_limit",
  "watch_symbol",
  "note",
];

export function isMemoryType(value: unknown): value is MemoryType {
  return typeof value === "string" && TYPES.includes(value as MemoryType);
}

export interface MemoryDraft {
  type: MemoryType;
  value: unknown;
}

export interface ValidatedMemory {
  type: MemoryType;
  key: string;
  value: unknown;
  label: string;
}

function percent(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new MemoryValidationError(`${field} must be a percentage between 0 and 100.`);
  }
  return Math.round(number * 10) / 10;
}

export class MemoryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryValidationError";
  }
}

/**
 * A draft turned into a row, or a thrown reason why it cannot be.
 *
 * `key` is what makes re-stating a preference an update rather than a second
 * row: singleton preferences key on their own type, and per-symbol ones key
 * on the symbol.
 */
export function validateMemory(draft: MemoryDraft): ValidatedMemory {
  switch (draft.type) {
    case "concentration_limit": {
      const pct = percent(draft.value, "Concentration limit");
      return {
        type: draft.type,
        key: draft.type,
        value: pct,
        label: `Max ${pct}% in any one asset`,
      };
    }
    case "stablecoin_buffer": {
      const pct = percent(draft.value, "Stablecoin buffer");
      return {
        type: draft.type,
        key: draft.type,
        value: pct,
        label: `Keep at least ${pct}% in stablecoins`,
      };
    }
    case "leverage_limit": {
      const number = typeof draft.value === "number" ? draft.value : Number(draft.value);
      if (!Number.isFinite(number) || number < 1 || number > 100) {
        throw new MemoryValidationError("Leverage limit must be between 1 and 100.");
      }
      const rounded = Math.round(number * 10) / 10;
      return {
        type: draft.type,
        key: draft.type,
        value: rounded,
        label: `Never above ${rounded}× leverage`,
      };
    }
    case "preferred_venue": {
      const venue = String(draft.value ?? "").trim();
      if (venue.length === 0 || venue.length > 40) {
        throw new MemoryValidationError("Name a venue.");
      }
      return {
        type: draft.type,
        key: draft.type,
        value: venue,
        label: `Prefer ${venue}`,
      };
    }
    case "watch_symbol": {
      const symbol = String(draft.value ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9]{2,10}$/.test(symbol)) {
        throw new MemoryValidationError("A symbol is 2–10 letters or digits.");
      }
      return {
        type: draft.type,
        key: symbol,
        value: symbol,
        label: `Watching ${symbol}`,
      };
    }
    case "note": {
      const note = String(draft.value ?? "").trim();
      if (note.length === 0 || note.length > 280) {
        throw new MemoryValidationError("A note is 1–280 characters.");
      }
      return { type: draft.type, key: note.slice(0, 60), value: note, label: note };
    }
  }
}

/* ---------------------------------------------------------------------------
   Reads and writes
--------------------------------------------------------------------------- */

function toMemory(row: PersonalizedMemoryRow): PersonalizedMemory {
  return {
    id: row.id,
    type: row.type,
    key: row.key,
    value: row.value,
    confidence: Number(row.confidence),
    source: row.source,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every memory for one user. Empty — never an error — when unavailable. */
export async function listMemories(userId: string): Promise<PersonalizedMemory[]> {
  if (tableMissing) return [];

  try {
    const { data, error } = await serviceClient()
      .from("personalized_memories")
      .select("*")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error !== null) {
      if (missingTable(error)) noteMissing(error.message);
      else if (!isUnreachable(error)) {
        console.warn("[personalized memory] read failed:", describeError(error));
      }
      return [];
    }

    return (data ?? []).map((row) => toMemory(row as PersonalizedMemoryRow));
  } catch {
    /* Unreachable database. The turn this belongs to still answers, without
       the operator's saved limits — and the context marks them missing. */
    return [];
  }
}

export interface SaveResult {
  memory: PersonalizedMemory | null;
  error: string | null;
}

/**
 * Writes a preference, replacing any earlier one of the same key.
 *
 * `source` is not a parameter: everything this repository writes is
 * explicit. An inference path would take a different entry point with its own
 * evidence requirement, and would be labelled in the UI.
 */
export async function saveMemory(
  userId: string,
  draft: MemoryDraft,
): Promise<SaveResult> {
  let validated: ValidatedMemory;
  try {
    validated = validateMemory(draft);
  } catch (error: unknown) {
    return {
      memory: null,
      error: error instanceof MemoryValidationError ? error.message : "Invalid preference.",
    };
  }

  try {
    const { data, error } = await serviceClient()
      .from("personalized_memories")
      .upsert(
        {
          user_id: userId,
          type: validated.type,
          key: validated.key,
          value: validated.value,
          label: validated.label,
          confidence: 1,
          source: "explicit" as MemorySource,
          updated_at: new Date().toISOString(),
          confirmed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,type,key" },
      )
      .select("*")
      .single();

    if (error !== null) {
      if (missingTable(error)) {
        noteMissing(error.message);
        return { memory: null, error: "Preferences are not available yet." };
      }
      return { memory: null, error: describeError(error) };
    }

    return { memory: toMemory(data as PersonalizedMemoryRow), error: null };
  } catch (error: unknown) {
    return {
      memory: null,
      error: error instanceof Error ? error.message : "Could not save the preference.",
    };
  }
}

/**
 * Deletes one memory, scoped to its owner.
 *
 * The `user_id` filter is the authorization: without it, an id from another
 * account's response would delete that account's preference. Returns false
 * when nothing matched, which is what the route answers 404 to.
 */
export async function deleteMemory(userId: string, id: string): Promise<boolean> {
  try {
    const { data, error } = await serviceClient()
      .from("personalized_memories")
      .delete()
      .eq("user_id", userId)
      .eq("id", id)
      .select("id");

    if (error !== null) return false;
    return (data ?? []).length > 0;
  } catch {
    return false;
  }
}

/** Updates a memory's value in place, scoped to its owner. */
export async function updateMemory(
  userId: string,
  id: string,
  value: unknown,
): Promise<SaveResult> {
  try {
    const existing = await serviceClient()
      .from("personalized_memories")
      .select("*")
      .eq("user_id", userId)
      .eq("id", id)
      .maybeSingle();

    if (existing.error !== null || existing.data === null) {
      return { memory: null, error: "Preference not found." };
    }

    const row = existing.data as PersonalizedMemoryRow;
    let validated: ValidatedMemory;
    try {
      validated = validateMemory({ type: row.type, value });
    } catch (error: unknown) {
      return {
        memory: null,
        error: error instanceof MemoryValidationError ? error.message : "Invalid preference.",
      };
    }

    const { data, error } = await serviceClient()
      .from("personalized_memories")
      .update({
        value: validated.value,
        label: validated.label,
        key: validated.key,
        updated_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", id)
      .select("*")
      .single();

    if (error !== null) return { memory: null, error: describeError(error) };
    return { memory: toMemory(data as PersonalizedMemoryRow), error: null };
  } catch (error: unknown) {
    return {
      memory: null,
      error: error instanceof Error ? error.message : "Could not update the preference.",
    };
  }
}
