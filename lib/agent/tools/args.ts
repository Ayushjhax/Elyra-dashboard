/* ---------------------------------------------------------------------------
   Argument extraction for tool calls.

   Tool arguments are model output, not validated input. A model will
   occasionally send a string where a number belongs, one symbol where an
   array belongs, or a lookback of 100000. Each extractor coerces what is
   reasonable and throws a message written *for the model* on what is not —
   the loop feeds that text back as the tool result, and a clear message
   usually gets a corrected call on the next iteration.
--------------------------------------------------------------------------- */

export class ToolArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolArgumentError";
  }
}

type Args = Record<string, unknown>;

/** A ticker, upper-cased and stripped of a venue suffix the model may add. */
export function symbol(args: Args, key = "symbol"): string {
  const raw = args[key];
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new ToolArgumentError(
      `"${key}" must be a ticker string such as "SOL".`,
    );
  }
  return checkedTicker(normaliseSymbol(raw), key);
}

/**
 * Models reach for the venue's own name for an instrument — "SOL-PERP",
 * "SOLUSDT", "SOL/USDC". The whole app keys on the bare ticker, so strip the
 * decoration rather than failing a call that was clear in intent.
 */
export function normaliseSymbol(raw: string): string {
  let value = raw.trim().toUpperCase();
  value = value.replace(/[-_/]?(PERP|SWAP|USDT|USDC|USD|BUSD|FDUSD)$/g, "");
  value = value.replace(/[-_/]$/, "");
  return value.length > 0 ? value : raw.trim().toUpperCase();
}

/**
 * What a ticker can look like: letters and digits, with the separators real
 * instruments use ("XYZ:NVDA", "BRK.B", "1000PEPE"), and short. A symbol is
 * model output that ends up in upstream requests and cache keys, so anything
 * longer or stranger is refused rather than passed along.
 */
const TICKER = /^[A-Z0-9$][A-Z0-9$.:_-]{0,31}$/;

function checkedTicker(value: string, key: string): string {
  if (!TICKER.test(value)) {
    throw new ToolArgumentError(`"${key}" must be a ticker such as "SOL" — letters and digits, at most 32 characters.`);
  }
  return value;
}

export function symbols(args: Args, key = "symbols", max = 20): string[] {
  const raw = args[key];

  /* A single string where an array belongs is the most common malformed
     call by a wide margin. Accepting it costs nothing. */
  const list = typeof raw === "string" ? [raw] : raw;

  if (!Array.isArray(list) || list.length === 0) {
    throw new ToolArgumentError(
      `"${key}" must be a non-empty array of tickers, such as ["SOL","BTC"].`,
    );
  }

  const cleaned = list
    .filter((entry): entry is string => typeof entry === "string")
    .map(normaliseSymbol)
    .filter((entry) => TICKER.test(entry));

  if (cleaned.length === 0) {
    throw new ToolArgumentError(`"${key}" contained no usable tickers.`);
  }

  return [...new Set(cleaned)].slice(0, max);
}

export function integer(
  args: Args,
  key: string,
  { min, max, fallback }: { min: number; max: number; fallback: number },
): number {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === "") return fallback;

  const parsed = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  if (!Number.isFinite(parsed)) {
    throw new ToolArgumentError(`"${key}" must be a number.`);
  }

  /* Clamp rather than throw. A lookback of 100000 is a reasonable thing to
     want and an unreasonable thing to fetch; the summary says what window it
     actually covered, so the model is not misled. */
  return Math.min(Math.max(Math.round(parsed), min), max);
}

/* ---------------------------------------------------------------------------
   Changes need the operator's own words.

   The few tools that change anything (an alert) run only when the
   operator's message in THIS turn asks for that kind of change. A tool
   result, a document or a market description can talk the model into
   calling a tool; it cannot edit what the operator typed, so this is
   checked against the message rather than trusted to the model.
--------------------------------------------------------------------------- */

export type OperatorChange = "create_alert" | "delete_alert";

const MENTIONS_ALERT = /\b(alerts?|notif(y|ication|ications)|ping me|tell me when|let me know when|remind me|warn me)\b/i;
const MENTIONS_REMOVAL = /\b(delete|remove|cancel|clear|turn off|switch off|disable|stop|drop|get rid of)\b/i;

/** Whether `message` — the operator's own words this turn — asks for `change`. */
export function operatorAskedFor(message: string | null | undefined, change: OperatorChange): boolean {
  if (typeof message !== "string" || message.trim().length === 0) return false;
  if (change === "create_alert") return MENTIONS_ALERT.test(message);
  return /\balerts?\b/i.test(message) && MENTIONS_REMOVAL.test(message);
}

export function oneOf<T extends string>(
  args: Args,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = args[key];
  if (raw === undefined || raw === null || raw === "") return fallback;

  const value = String(raw);
  const match = allowed.find(
    (entry) => entry.toLowerCase() === value.toLowerCase(),
  );
  if (match === undefined) {
    throw new ToolArgumentError(
      `"${key}" must be one of: ${allowed.join(", ")}.`,
    );
  }
  return match;
}
