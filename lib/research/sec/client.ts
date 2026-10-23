import "server-only";

import { fail, ok, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The SEC EDGAR client.

   Free, keyless, and governed by a fair-access policy rather than a billing
   relationship — which changes what "being a good client" means. There is no
   plan to upgrade and no support contract; there is a rate ceiling and a
   requirement to identify yourself, and exceeding either gets the whole
   deploying IP blocked.

   ── Identification is mandatory ────────────────────────────────────────

   The SEC requires a declared `User-Agent` naming the requester and a contact
   address. Requests without one are refused. `SEC_USER_AGENT` carries it, and
   a missing value is a hard failure here rather than a silent default —
   sending a generic agent would be both a policy breach and untraceable back
   to us when something goes wrong.

   ── The limiter is the point ───────────────────────────────────────────

   The SEC's published ceiling is 10 requests per second. This limiter runs at
   8, because the ceiling is measured at their end across every process this
   deployment runs: a limiter set exactly at the limit is a limiter that
   breaches it the moment a second instance starts.

   It is a token-bucket over a shared module-level queue, so every SEC call in
   this process serialises through one gate no matter how many pipelines are
   running. That is a within-process guarantee, not a distributed one — see
   the note on `SEC_MAX_RPS` below.
--------------------------------------------------------------------------- */

const DATA_HOST = "https://data.sec.gov";
const WWW_HOST = "https://www.sec.gov";

/**
 * Requests per second. Below the SEC's published ceiling of 10 on purpose.
 *
 * Deliberately configurable DOWNWARD: when this runs on more than one
 * instance, each one must be given a share of the budget rather than each
 * assuming it owns the whole thing. Two instances at 8 rps is 16 rps at the
 * SEC's end, which is a breach they attribute to the deployment, not to an
 * instance.
 */
function maxRps(): number {
  const raw = Number.parseFloat(process.env.SEC_MAX_RPS ?? "");
  if (Number.isFinite(raw) && raw > 0 && raw <= 10) return raw;
  return 8;
}

function userAgent(): string | null {
  const raw = process.env.SEC_USER_AGENT?.trim();
  /* The SEC asks for "Company Name contact@domain". A value without an "@"
     is almost certainly a placeholder, and sending it would identify us as
     someone who did not read the policy. */
  if (raw === undefined || raw.length === 0 || !raw.includes("@")) return null;
  return raw;
}

export function secConfigured(): boolean {
  return userAgent() !== null;
}

/* ---------------------------------------------------------------------------
   Rate limiting
--------------------------------------------------------------------------- */

let queue: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

/**
 * Serialises every SEC call in this process behind a minimum spacing.
 *
 * A chain rather than a counter: the spacing has to hold across concurrent
 * callers, and a token count checked-then-decremented races exactly the way
 * an unsynchronised rate limiter always does.
 */
function schedule<T>(task: () => Promise<T>): Promise<T> {
  const spacingMs = 1000 / maxRps();

  /* The chain orders START times, not completions. The SEC's ceiling is on
     how often requests begin; waiting for each response before starting the
     next held eight feed reads to one at a time — a minute of wall clock
     for what the limit allows in one second. */
  const started = queue.then(async () => {
    const wait = Math.max(0, lastStartedAt + spacingMs - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStartedAt = Date.now();
  });
  queue = started;

  return started.then(task);
}

/* ---------------------------------------------------------------------------
   Cache

   SEC data is immutable once filed. A 10-Q for a period that has closed will
   never change, so these TTLs are long by the standards of the rest of the
   provider layer — and the fair-access policy makes caching a courtesy as
   well as an optimisation.
--------------------------------------------------------------------------- */

interface Entry {
  value: unknown;
  storedAt: number;
  ttlMs: number;
}

const cache = new Map<string, Entry>();
const MAX_ENTRIES = 500;

export const SEC_TTL = {
  /** The ticker map changes when companies list or delist. */
  tickers: 12 * 3_600_000,
  /** New filings appear here; a few minutes is responsive enough. */
  submissions: 15 * 60_000,
  /** Restated only by an amendment, which arrives as a new filing. */
  facts: 60 * 60_000,
  /** A filed document never changes. */
  document: 24 * 3_600_000,
} as const;

export function clearSecCache(): void {
  cache.clear();
}

/* ---------------------------------------------------------------------------
   Fetch
--------------------------------------------------------------------------- */

interface SecFetchOptions {
  /** Path including leading slash. */
  path: string;
  /** `data` for the JSON APIs, `www` for the archives and static files. */
  host?: "data" | "www";
  ttlMs?: number;
  /** Set for filing documents, which are HTML rather than JSON. */
  as?: "json" | "text";
  timeoutMs?: number;
}

async function request<T>(options: SecFetchOptions): Promise<ToolResult<T>> {
  const agent = userAgent();
  if (agent === null) {
    /* Named precisely, because this is an operator problem with an exact fix
       and it would otherwise present as "the SEC is down". */
    return fail<T>(
      "sec",
      "AUTH",
      "SEC_USER_AGENT is not set. The SEC requires automated clients to " +
        'identify themselves as "Company Name contact@domain".',
    );
  }

  const base = options.host === "www" ? WWW_HOST : DATA_HOST;
  const url = `${base}${options.path}`;
  const key = `sec:${url}`;
  const ttlMs = options.ttlMs ?? SEC_TTL.submissions;

  const hit = cache.get(key);
  if (hit !== undefined && Date.now() - hit.storedAt < hit.ttlMs) {
    return ok(hit.value as T, "sec", { asOf: new Date(hit.storedAt).toISOString() });
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const response = await schedule(() => {
      /* The clock starts when the request does, not while it waits its turn
         in the limiter behind other reads — a background read of filings
         must not time out a person's request before it is ever sent. */
      timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
      return fetch(url, {
        headers: {
          "User-Agent": agent,
          /* Requested explicitly: the SEC serves large JSON and asks clients
             to accept compression. */
          "Accept-Encoding": "gzip, deflate",
          Accept: options.as === "text" ? "text/html,*/*" : "application/json",
        },
        signal: controller.signal,
        cache: "no-store",
      });
    });

    clearTimeout(timer);

    if (response.status === 404) {
      return fail<T>("sec", "NOT_FOUND", "The SEC has no such record.");
    }

    if (response.status === 403) {
      /* The fair-access block. Distinguished from an ordinary failure because
         the fix is operational — slow down or fix the User-Agent — and
         retrying immediately makes it worse. */
      return fail<T>(
        "sec",
        "AUTH",
        "The SEC refused the request. This usually means the rate limit was " +
          "exceeded or the User-Agent is not acceptable.",
      );
    }

    if (response.status === 429) {
      return fail<T>("sec", "RATE_LIMIT", "SEC rate limit reached.");
    }

    if (!response.ok) {
      return fail<T>(
        "sec",
        response.status >= 500 ? "UPSTREAM_UNAVAILABLE" : "INVALID_REQUEST",
        `The SEC returned ${response.status}.`,
      );
    }

    let value: unknown;
    if (options.as === "text") {
      value = await response.text();
    } else {
      const text = await response.text();
      try {
        value = JSON.parse(text);
      } catch {
        return fail<T>("sec", "UPSTREAM_UNAVAILABLE", "The SEC returned malformed JSON.");
      }
    }

    /* A TTL of zero is a read the caller keeps itself — a filing document
       whose parsed form is cached elsewhere. Storing it here would evict
       the ticker map and the submissions everything else depends on. */
    if (ttlMs > 0) {
      if (cache.size >= MAX_ENTRIES) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, { value, storedAt: Date.now(), ttlMs });
    }

    return ok(value as T, "sec");
  } catch (error: unknown) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === "AbortError";
    return fail<T>(
      "sec",
      aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE",
      aborted ? "The SEC did not answer in time." : "The SEC could not be reached.",
    );
  }
}

export function secJson<T>(
  path: string,
  ttlMs?: number,
  host: "data" | "www" = "data",
): Promise<ToolResult<T>> {
  return request<T>({ path, ttlMs, host, as: "json" });
}

export function secText(
  path: string,
  ttlMs = SEC_TTL.document,
  host: "data" | "www" = "www",
): Promise<ToolResult<string>> {
  return request<string>({ path, ttlMs, host, as: "text", timeoutMs: 30_000 });
}

/** CIK as the ten-digit zero-padded form the JSON APIs expect. */
export function padCik(cik: number | string): string {
  return String(typeof cik === "string" ? cik.replace(/\D/g, "") : cik).padStart(10, "0");
}

/** An accession number with its dashes removed, as archive paths use. */
export function bareAccession(accession: string): string {
  return accession.replace(/-/g, "");
}
