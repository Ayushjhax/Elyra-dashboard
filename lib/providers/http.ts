import "server-only";

import {
  codeForStatus,
  fail,
  ok,
  type ProviderErrorCode,
  type ProviderHealth,
  type ProviderId,
  type ToolResult,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   One way to call an upstream.

   Every adapter goes through `providerFetch`, which owns the four things that
   are wrong in every hand-rolled integration: a timeout, a retry policy that
   knows what is worth retrying, 429 backoff that reads `Retry-After`, and a
   breaker so a provider that is down stops being asked.

   ── Why the breaker matters here specifically ──────────────────────────

   A portfolio read fans out to several providers at once. Without a breaker,
   one dead provider costs every request its full timeout, and an aggregate
   with a 10s budget spends 8 of them discovering the same outage over and
   over. With one, the second request through a dead provider fails in
   microseconds and the aggregate returns partial data while it is still
   useful.

   State is per server instance — the same trade `lib/agent/providers/router`
   makes, and for the same reason: sharing it would put a network round trip
   on the hot path of every call to bound something already bounded per
   instance.
--------------------------------------------------------------------------- */

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 3;

/** Consecutive failures before a provider is skipped. */
const BREAKER_THRESHOLD = 4;
/** How long it stays skipped before one trial request is allowed through. */
const BREAKER_OPEN_MS = 30_000;

interface HealthState {
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastErrorCode: ProviderErrorCode | null;
  consecutiveFailures: number;
  openedAt: number | null;
  /** Rolling mean, so one slow call does not redefine the provider. */
  latencyMs: number | null;
  samples: number;
}

const health = new Map<ProviderId, HealthState>();

function stateFor(provider: ProviderId): HealthState {
  const existing = health.get(provider);
  if (existing !== undefined) return existing;
  const created: HealthState = {
    lastSuccessAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    consecutiveFailures: 0,
    openedAt: null,
    latencyMs: null,
    samples: 0,
  };
  health.set(provider, created);
  return created;
}

function recordSuccess(provider: ProviderId, ms: number): void {
  const state = stateFor(provider);
  state.lastSuccessAt = Date.now();
  state.consecutiveFailures = 0;
  state.openedAt = null;
  state.samples += 1;
  state.latencyMs =
    state.latencyMs === null ? ms : state.latencyMs + (ms - state.latencyMs) / Math.min(state.samples, 20);
}

function recordFailure(provider: ProviderId, code: ProviderErrorCode): void {
  const state = stateFor(provider);
  state.lastErrorAt = Date.now();
  state.lastErrorCode = code;

  /* A malformed request of ours is not a health signal about them. Counting
     it would let a bug in this codebase trip the breaker and take a working
     provider offline. */
  if (code === "INVALID_REQUEST" || code === "NOT_FOUND") return;

  state.consecutiveFailures += 1;
  if (state.consecutiveFailures >= BREAKER_THRESHOLD) state.openedAt = Date.now();
}

function circuitOpen(provider: ProviderId, now = Date.now()): boolean {
  const state = stateFor(provider);
  if (state.openedAt === null) return false;
  if (now - state.openedAt < BREAKER_OPEN_MS) return true;
  /* Half-open: let one through. If it fails, `recordFailure` re-opens. */
  state.openedAt = null;
  return false;
}

export function providerHealth(provider: ProviderId): ProviderHealth {
  const state = stateFor(provider);
  const open = state.openedAt !== null && Date.now() - state.openedAt < BREAKER_OPEN_MS;
  return {
    provider,
    status: open ? "down" : state.consecutiveFailures > 0 ? "degraded" : "healthy",
    lastSuccessAt: state.lastSuccessAt === null ? null : new Date(state.lastSuccessAt).toISOString(),
    lastErrorAt: state.lastErrorAt === null ? null : new Date(state.lastErrorAt).toISOString(),
    lastErrorCode: state.lastErrorCode,
    consecutiveFailures: state.consecutiveFailures,
    latencyMs: state.latencyMs === null ? null : Math.round(state.latencyMs),
    circuitOpen: open,
  };
}

/** Test seam. Nothing in the app calls this. */
export function resetProviderHealth(): void {
  health.clear();
}

/* ---------------------------------------------------------------------------
   The call
--------------------------------------------------------------------------- */

export interface FetchOptions {
  provider: ProviderId;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  /** Retries on a retryable failure. 0 for anything non-idempotent. */
  attempts?: number;
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    /* Honour the provider's own number when it gives one — guessing shorter
       is how a 429 becomes a ban. Capped so a hostile header cannot hang the
       request for an hour. */
    if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1_000, 10_000);
  }
  /* Exponential with jitter, so a fleet of instances does not retry in step. */
  return Math.min(2 ** attempt * 250, 4_000) + Math.random() * 250;
}

/**
 * A JSON call to a provider, normalised.
 *
 * Never throws. Every outcome — timeout, 429, malformed JSON, a breaker that
 * refused to even try — comes back as a `ToolResult`, because a caller
 * aggregating six providers must not have to wrap each one in try/catch to
 * stay alive.
 */
export async function providerFetch<T>(options: FetchOptions): Promise<ToolResult<T>> {
  const { provider } = options;

  if (circuitOpen(provider)) {
    return fail<T>(
      provider,
      "UPSTREAM_UNAVAILABLE",
      `${provider} is failing repeatedly and is being skipped for a short period.`,
    );
  }

  const attempts = options.attempts ?? MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let lastCode: ProviderErrorCode = "UPSTREAM_UNAVAILABLE";
  let lastMessage = "No attempt completed.";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(options.url, {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(options.body === undefined ? {} : { "content-type": "application/json" }),
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
        cache: "no-store",
      });

      clearTimeout(timer);

      if (!response.ok) {
        const code = codeForStatus(response.status);
        /* The body is read for a message but never surfaced raw — providers
           return HTML error pages and vendor stack traces, and neither
           belongs in a prompt or on a screen. */
        const detail = await response.text().catch(() => "");
        lastCode = code;
        lastMessage = summarise(provider, response.status, detail);
        recordFailure(provider, code);

        const worthRetrying =
          code === "RATE_LIMIT" || code === "UPSTREAM_TIMEOUT" || code === "UPSTREAM_UNAVAILABLE";
        if (!worthRetrying || attempt === attempts - 1) {
          return fail<T>(provider, code, lastMessage);
        }

        await sleep(backoffMs(attempt, response.headers.get("retry-after")));
        continue;
      }

      const text = await response.text();
      let parsed: T;
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        recordFailure(provider, "UPSTREAM_UNAVAILABLE");
        return fail<T>(
          provider,
          "UPSTREAM_UNAVAILABLE",
          `${provider} returned a response that was not JSON.`,
        );
      }

      recordSuccess(provider, Date.now() - startedAt);
      return ok<T>(parsed, provider);
    } catch (error: unknown) {
      clearTimeout(timer);
      const aborted = error instanceof Error && error.name === "AbortError";
      lastCode = aborted ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNAVAILABLE";
      lastMessage = aborted
        ? `${provider} did not answer within ${timeoutMs}ms.`
        : `${provider} could not be reached.`;
      recordFailure(provider, lastCode);

      if (attempt === attempts - 1) return fail<T>(provider, lastCode, lastMessage);
      await sleep(backoffMs(attempt, null));
    }
  }

  return fail<T>(provider, lastCode, lastMessage);
}

/**
 * A short, safe description of an upstream failure.
 *
 * Deliberately does not include the response body: a provider's error page
 * can contain request echoes, internal hostnames and — with a key in a query
 * string — the key itself.
 */
function summarise(provider: ProviderId, status: number, detail: string): string {
  const code = codeForStatus(status);
  if (code === "AUTH") {
    return `${provider} rejected the request (${status}) — the key is missing, invalid, or the plan does not include this endpoint.`;
  }
  if (code === "RATE_LIMIT") return `${provider} rate limit reached.`;
  if (code === "NOT_FOUND") return `${provider} has no record for that request.`;

  /* One short clause of the body helps when the provider names the problem,
     and is bounded so nothing large or structured leaks through. */
  const hint = detail.slice(0, 120).replace(/\s+/g, " ").trim();
  return `${provider} returned ${status}${hint.length > 0 && !hint.startsWith("<") ? `: ${hint}` : ""}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ---------------------------------------------------------------------------
   Cache

   A small in-process TTL cache. Prices are asked for far more often than they
   change, and a provider plan is a budget: the Birdeye key configured here
   rate-limits quickly enough that an uncached price lookup per chat message
   would exhaust it.
--------------------------------------------------------------------------- */

interface Entry {
  value: unknown;
  storedAt: number;
  ttlMs: number;
}

const cache = new Map<string, Entry>();
const MAX_ENTRIES = 2_000;

export async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<ToolResult<T>>,
): Promise<ToolResult<T>> {
  const hit = cache.get(key);
  const now = Date.now();

  if (hit !== undefined && now - hit.storedAt < hit.ttlMs) {
    return hit.value as ToolResult<T>;
  }

  const result = await load();

  /* Only successes are cached. Caching a failure would turn a one-second
     blip into a full TTL of unavailability. */
  if (result.ok) {
    if (cache.size > MAX_ENTRIES) {
      for (const [entryKey, entry] of cache) {
        if (now - entry.storedAt > entry.ttlMs) cache.delete(entryKey);
      }
    }
    cache.set(key, { value: result, storedAt: now, ttlMs });
    return result;
  }

  /* Stale-if-error: an expired reading, clearly marked, beats nothing. The
     caller decides whether stale is good enough — for a price shown on a
     dashboard it usually is; for executing a swap it is not, which is why
     the swap path does not read through this cache. */
  if (hit !== undefined) {
    const stale = hit.value as ToolResult<T>;
    return {
      ...stale,
      stale: true,
      warnings: [
        ...(stale.warnings ?? []),
        `Showing a cached reading — ${result.error?.message ?? "the provider is unavailable"}`,
      ],
    };
  }

  return result;
}

/** Test seam. */
export function clearProviderCache(): void {
  cache.clear();
}
