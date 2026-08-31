/* ---------------------------------------------------------------------------
   Environment.

   Every process-level secret enters the app here and nowhere else. Reading
   `process.env` directly anywhere in `lib/` or `app/api/` is a bug: it skips
   the shape check, and it makes it impossible to audit what the server needs.

   Nothing in this file may be imported from a client component. The only
   client-safe values are the two `NEXT_PUBLIC_` reads, which live in
   `publicEnv` at the bottom and are deliberately kept apart from the rest.
--------------------------------------------------------------------------- */

/** Thrown by the startup check with every missing variable at once. */
export class EnvError extends Error {
  readonly missing: string[];

  constructor(missing: string[]) {
    super(
      `Missing required environment variable${missing.length === 1 ? "" : "s"}: ` +
        `${missing.join(", ")}. Copy .env.example to .env.local and fill them in.`,
    );
    this.name = "EnvError";
    this.missing = missing;
  }
}

/**
 * Required on every server boot. A missing one of these is a deployment
 * mistake, not a runtime condition, so `assertServerEnv` fails the process
 * rather than letting the first request discover it.
 */
const REQUIRED = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "CREDENTIALS_ENC_KEY",
] as const;

/**
 * Not required to boot, but required by the feature that reads them. Each is
 * checked at its own call site with a message naming what it disables — the
 * Telegram surface is optional, and so is Gemini fallback.
 */
const OPTIONAL = [
  "ANTHROPIC_MODEL",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "PRIVY_VERIFICATION_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_BOT_USERNAME",
  "TELEGRAM_WEBHOOK_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "AGENT_MAX_RUNS_PER_DAY",
  "APP_URL",
] as const;

type RequiredKey = (typeof REQUIRED)[number];
type OptionalKey = (typeof OPTIONAL)[number];

function read(key: string): string | undefined {
  const value = process.env[key];
  /* Treat whitespace-only as absent: a key left as `FOO=` in a .env file
     arrives as "" and would otherwise pass a truthiness check downstream. */
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** A required variable. Throws if it is absent — callers never handle that. */
export function required(key: RequiredKey): string {
  const value = read(key);
  if (value === undefined) throw new EnvError([key]);
  return value;
}

/** An optional variable, absent when the feature that needs it is unused. */
export function optional(key: OptionalKey): string | undefined {
  return read(key);
}

/**
 * An optional variable that the caller cannot proceed without. `feature` names
 * what stops working, so the error explains itself in a log with no context.
 */
export function requireFor(key: OptionalKey, feature: string): string {
  const value = read(key);
  if (value === undefined) {
    throw new EnvError([`${key} (needed for ${feature})`]);
  }
  return value;
}

/** Every missing required variable, reported together rather than one per boot. */
export function assertServerEnv(): void {
  const missing = REQUIRED.filter((key) => read(key) === undefined);
  if (missing.length > 0) throw new EnvError([...missing]);

  /* The encryption key is the one required variable whose *shape* matters:
     a short or malformed key fails at first use, deep inside a decrypt, long
     after the mistake was made. Check it where it can still be read as a
     configuration error. */
  assertEncryptionKey();
}

/**
 * `CREDENTIALS_ENC_KEY` must decode to exactly 32 bytes — AES-256-GCM takes
 * nothing else. Base64 or hex, so `openssl rand -base64 32` works directly.
 */
export function assertEncryptionKey(): void {
  const raw = required("CREDENTIALS_ENC_KEY");
  const bytes = decodeKey(raw);
  if (bytes === null) {
    throw new EnvError([
      "CREDENTIALS_ENC_KEY (must be base64 or hex; run `openssl rand -base64 32`)",
    ]);
  }
  if (bytes.length !== 32) {
    throw new EnvError([
      `CREDENTIALS_ENC_KEY (must decode to 32 bytes, got ${bytes.length}; ` +
        "run `openssl rand -base64 32`)",
    ]);
  }
}

/** Base64 or hex to bytes. Null when the string is neither. */
export function decodeKey(raw: string): Buffer | null {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  try {
    const buf = Buffer.from(raw, "base64");
    /* Node's base64 decoder never throws — it skips invalid characters — so
       a round trip is the only way to know the input was really base64. */
    if (buf.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
      return null;
    }
    return buf;
  } catch {
    return null;
  }
}

/** Runs per user per UTC day. Past this, `runAgent` refuses. */
export function maxRunsPerDay(): number {
  const raw = optional("AGENT_MAX_RUNS_PER_DAY");
  if (raw === undefined) return 100;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 100;
}

/** Absolute origin, for the Telegram deep link and the webhook registration. */
export function appUrl(): string {
  return optional("APP_URL") ?? "http://localhost:3000";
}

/* ---------------------------------------------------------------------------
   Client-safe values.

   These two are the only environment reads that may cross into the browser.
   They are `NEXT_PUBLIC_` and inlined at build time, so they must be written
   as full literal property accesses — `process.env[key]` is not substituted.
--------------------------------------------------------------------------- */

export const publicEnv = {
  privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
} as const;
