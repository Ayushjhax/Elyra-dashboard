import "server-only";

/* ---------------------------------------------------------------------------
   The only way this codebase talks to an upstream HTTP API.

   Every call gets a deadline and a typed failure. A bare `fetch` has no
   timeout at all — it waits as long as the socket stays open — and one hung
   exchange request would sit inside an agent run until the whole run's wall
   clock expired, spending the budget on nothing.
--------------------------------------------------------------------------- */

/** Distinguishes what a caller can do about a failure. */
export type UpstreamFailure =
  | "timeout"
  | "network"
  | "rate_limited"
  | "server_error"
  | "client_error"
  | "malformed";

export class UpstreamError extends Error {
  readonly kind: UpstreamFailure;
  readonly source: string;
  readonly status: number | null;

  constructor(
    kind: UpstreamFailure,
    source: string,
    message: string,
    status: number | null = null,
  ) {
    super(`[${source}] ${message}`);
    this.name = "UpstreamError";
    this.kind = kind;
    this.source = source;
    this.status = status;
  }

  /** Whether trying a different source for the same data is worth it. */
  get retryable(): boolean {
    return (
      this.kind === "timeout" ||
      this.kind === "network" ||
      this.kind === "rate_limited" ||
      this.kind === "server_error"
    );
  }
}

export interface UpstreamRequest {
  /** Names the source in errors, e.g. "binance". */
  source: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;

/** A JSON request with a deadline. Every upstream call in the app goes here. */
export async function fetchJson<T>(request: UpstreamRequest): Promise<T> {
  const {
    source,
    url,
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = request;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined
        ? headers
        : { "content-type": "application/json", ...headers },
      body,
      signal: AbortSignal.timeout(timeoutMs),
      /* These are live market reads. Next would otherwise cache them in its
         data cache and serve a stale price as if it were current. */
      cache: "no-store",
    });
  } catch (error) {
    /* AbortSignal.timeout rejects with a TimeoutError DOMException; anything
       else at this stage is DNS, TLS or a dropped connection. */
    const timedOut =
      error instanceof DOMException && error.name === "TimeoutError";
    throw new UpstreamError(
      timedOut ? "timeout" : "network",
      source,
      timedOut
        ? `No response within ${timeoutMs}ms`
        : `Request failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }

  if (!response.ok) {
    /* Read a bounded amount of the body: some exchanges explain the refusal,
       and a rate-limit reason is worth keeping. */
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new UpstreamError(
      classify(response.status),
      source,
      `HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new UpstreamError(
      "malformed",
      source,
      "Response was not valid JSON",
      response.status,
    );
  }
}

function classify(status: number): UpstreamFailure {
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  return "client_error";
}
