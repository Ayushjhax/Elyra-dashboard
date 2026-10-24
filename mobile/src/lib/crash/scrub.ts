/* ---------------------------------------------------------------------------
   What a crash report may carry: nothing that identifies a person or opens
   their account.

   Every string in an event and its breadcrumbs passes through `scrubText`
   before it leaves the phone. It removes, wherever they appear:

     - wallet addresses (Solana base58, EVM 0x…) and transaction signatures;
     - bearer tokens, JWTs (the Privy access token is one), API keys in URLs,
       Expo push tokens;
     - Privy user ids (did:privy:…) and email addresses;
     - a URL's query string and fragment — where keys and addresses travel.

   The event's user, request headers and cookies are dropped outright, and
   stack frames keep only what locates code (file, function, line).

   Pure, so it is tested without the SDK (scrub.test.ts).
--------------------------------------------------------------------------- */

const REDACTED = "[redacted]";

const PATTERNS: readonly [RegExp, string][] = [
  /* Bearer tokens and JWTs first, before their pieces match anything else. */
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`],
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}(?:\.[A-Za-z0-9_-]*)?/g, "[jwt]"],
  [/ExponentPushToken\[[^\]]*\]/g, "[push-token]"],
  [/\bdid:privy:[A-Za-z0-9]+/gi, "[user]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  /* A URL keeps its origin and path; the query and fragment go. */
  [/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/gi, "$1?[redacted]"],
  [/\b(api[-_]?key|token|secret|signature|auth)=([^&\s"']+)/gi, `$1=${REDACTED}`],
  [/\b0x[a-fA-F0-9]{40}\b/g, "[evm-address]"],
  /* Solana signatures (~88 base58) before addresses (32–44). */
  [/\b[1-9A-HJ-NP-Za-km-z]{80,90}\b/g, "[signature]"],
  [/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[address]"],
];

export function scrubText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/* What a stack frame keeps unscrubbed: where the code is, not what it held. */
const FRAME_KEYS = new Set(["filename", "abs_path", "function", "module", "lineno", "colno", "in_app", "platform", "instruction_addr"]);
/* Dropped whole. */
const DROPPED_KEYS = new Set(["user", "cookies", "headers", "vars", "data_body"]);

function scrubValue(value: unknown, key: string | null, inFrame: boolean): unknown {
  if (typeof value === "string") return inFrame && key !== null && FRAME_KEYS.has(key) ? value : scrubText(value);
  if (Array.isArray(value)) return value.map((entry) => scrubValue(entry, key, inFrame));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value)) {
      if (DROPPED_KEYS.has(childKey)) continue;
      out[childKey] = scrubValue(child, childKey, inFrame || key === "frames");
    }
    return out;
  }
  return value;
}

/** A copy of the event with every string scrubbed. */
export function scrubEvent<T extends object>(event: T): T {
  return scrubValue(event, null, false) as T;
}

interface BreadcrumbLike {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * A breadcrumb as it may leave the phone, or null to drop it.
 *
 * Console lines stay on the phone — they are the app's own diagnostics. A
 * tap keeps only that it happened: Sentry records the tapped control's
 * label, and here a label can be a suggested question or a holdings row
 * reading out a balance.
 */
export function scrubBreadcrumb<T extends BreadcrumbLike>(breadcrumb: T): T | null {
  if (breadcrumb.category === "console") return null;
  if (breadcrumb.category === "touch" || breadcrumb.category === "ui.click" || breadcrumb.category === "ui.touch") {
    const { message: _message, data: _data, ...rest } = breadcrumb;
    return rest as T;
  }
  return scrubEvent(breadcrumb);
}
