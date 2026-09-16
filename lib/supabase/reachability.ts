import "server-only";

import { publicEnv } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Is the failure the project, or the query?

   supabase-js reports both through one `{ message, details, hint, code }`
   shape, and a transport failure arrives with `code: ""` — an empty string
   rather than null. Every call site written as `error.code ?? "error"`
   therefore rendered it as ": TypeError: fetch failed", which names neither
   the host that could not be reached nor anything a reader can act on. That
   string is what the smart-money panel showed for a deleted project.

   The distinction matters more than the wording. A query error is a bug in
   this codebase — a wrong column, a violated constraint — and the fix is
   here. A transport error means the project at NEXT_PUBLIC_SUPABASE_URL did
   not answer at all: it was deleted, it is paused, or the URL is wrong. No
   retry and no reading of the query will fix that, and reporting it as
   "unavailable" sends whoever is on call looking in the wrong place.

   A DNS failure is separated from the rest because it is the one that carries
   a definite conclusion. A refused connection or a timeout can be transient.
   NXDOMAIN cannot: the name does not exist, so neither does the project.
--------------------------------------------------------------------------- */

/** What `NEXT_PUBLIC_SUPABASE_URL` points at, for messages that name it. */
export function supabaseHost(): string {
  try {
    return new URL(publicEnv.supabaseUrl).host;
  } catch {
    /* An unparseable URL is itself the problem, and the raw value is the
       most useful thing to show — it is public by construction. */
    return publicEnv.supabaseUrl || "(NEXT_PUBLIC_SUPABASE_URL is unset)";
  }
}

/** Every string an error of either shape might be carrying, concatenated. */
function text(error: unknown): string {
  if (error === null || typeof error !== "object") return String(error ?? "");
  const record = error as Record<string, unknown>;
  const parts = [record.message, record.details, record.hint, record.code];
  if (error instanceof Error && error.cause !== undefined) {
    parts.push(text(error.cause));
  }
  return parts.filter((part) => typeof part === "string").join(" ");
}

const DNS = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i;
const TRANSPORT =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EPIPE|CERT_|fetch failed|Failed to fetch|socket hang up|network|timeout|aborted/i;

/**
 * Why the project could not be reached, or null when the error is an ordinary
 * query failure that the caller should handle on its own terms.
 *
 * The message is written for whoever reads it in a log or a panel with no
 * other context, so it names the host and the next action rather than
 * describing the symptom.
 */
export function unreachableReason(error: unknown): string | null {
  const description = text(error);
  if (description.length === 0) return null;

  const host = supabaseHost();

  if (DNS.test(description)) {
    return (
      `Supabase host ${host} does not exist — DNS returns NXDOMAIN. ` +
      "A paused project still resolves, so this is a project that was deleted " +
      "or a wrong NEXT_PUBLIC_SUPABASE_URL. Create one at supabase.com, then " +
      "run `npm run supabase:setup` with its URL and keys."
    );
  }

  if (TRANSPORT.test(description)) {
    return (
      `Could not reach Supabase at ${host}: ${
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : description.slice(0, 120)
      }. The project may be paused, or this machine has no route to it.`
    );
  }

  return null;
}

/** Whether this error is the project being unreachable rather than a bad query. */
export function isUnreachable(error: unknown): boolean {
  return unreachableReason(error) !== null;
}

/**
 * The reason a Supabase error should be shown as, whatever its kind.
 *
 * Query errors keep their code, which is how a caller tells 42P01 from
 * PGRST205 in a log. The empty-string code that transport failures carry is
 * dropped rather than printed as a bare colon.
 */
export function describe(error: unknown): string {
  const unreachable = unreachableReason(error);
  if (unreachable !== null) return unreachable;

  const record = (error ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof record.code === "string" && record.code.length > 0 ? record.code : null;
  const message =
    typeof record.message === "string" && record.message.length > 0
      ? record.message
      : "Unknown database error";
  return code === null ? message : `${code}: ${message}`;
}
