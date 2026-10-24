import * as Application from "expo-application";
import Constants from "expo-constants";
import { fetch as streamingFetch } from "expo/fetch";
import { createLineSplitter, createSseParser, parseNdjsonLine, type SseEvent } from "~/lib/stream";
import { forgetReferral, referralForRequest } from "~/lib/referral";
import { sessionVersion } from "~/lib/session";

/* ---------------------------------------------------------------------------
   Talking to Elyra's API — the only server the app talks to.

   The app never calls Supabase, an RPC, Pyth, Jupiter, an exchange or a model
   provider itself; the API does, with keys the app never holds. Every request
   names the app build (`x-elyra-app`), and every signed-in request carries
   the Privy access token as a bearer — the API derives the account from that
   token and nothing else.

   Errors are typed, because the screens answer them differently:
     - 401 → the session is over; every listener of `onUnauthorized` hears it.
     - 503 with `unconfigured` → this deployment lacks something; show the
       server's own sentence, which says what.
     - anything else → the server's `error` text when it gave one.
--------------------------------------------------------------------------- */

const BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** This build's version, as the API's version gate reads it. */
export const APP_VERSION: string =
  Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? "0.0.0";

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The deployment is missing a dependency, not the request at fault. */
    readonly unconfigured: boolean = false,
    readonly body: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ---- the token, injected by the auth layer (Prompt 7) ---- */

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter = async () => null;

export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

const unauthorizedListeners = new Set<() => void>();

/** Called when the API answers 401: the token is gone and could not be refreshed. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/* ---- requests ---- */

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** Send the access token. Off only for the public routes (health, config). */
  auth?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

export function apiUrl(path: string): string {
  if (BASE_URL === "") {
    throw new ApiError("EXPO_PUBLIC_API_URL is not set, so the app has no API to talk to.", 0, true);
  }
  return `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

async function headersFor(options: RequestOptions): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-elyra-app": APP_VERSION,
    ...options.headers,
  };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.auth !== false) {
    const version = sessionVersion();
    const token = await getToken();
    if (version !== sessionVersion()) throw new ApiError("Your account changed. Try again.", 0);
    if (token !== null) {
      headers.authorization = `Bearer ${token}`;
      /* A referral link's code rides along until an authenticated request
         succeeds: the server binds it only when this request creates a new
         account's profile, and ignores it otherwise (lib/referral.ts). */
      const referral = await referralForRequest();
      if (referral !== null) headers[REFERRAL_HEADER] = referral;
    }
  }
  return headers;
}

const REFERRAL_HEADER = "x-elyra-referral";

/** The server has had the referral code once a request that carried it succeeded. */
function settleReferral(headers: Record<string, string>, ok: boolean): void {
  if (ok && headers[REFERRAL_HEADER] !== undefined) void forgetReferral();
}

/**
 * The headers an authenticated request carries, for a native transfer that
 * does not go through `request` — a PDF downloaded straight to a file.
 */
export function authHeaders(accept: string): Promise<Record<string, string>> {
  return headersFor({ headers: { accept } });
}

/** Joins an outer signal and a timeout into one. */
function withTimeout(timeoutMs: number, outer?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ApiError("The request timed out.", 0)), timeoutMs);
  const forward = () => controller.abort(outer?.reason);
  if (outer?.aborted) controller.abort(outer.reason);
  outer?.addEventListener("abort", forward);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", forward);
    },
  };
}

/** The error a non-2xx answer means, from its status and body. */
export function errorFor(status: number, body: unknown): ApiError {
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const message =
    typeof record.error === "string" && record.error.length > 0
      ? record.error
      : status === 401
        ? "Your session has ended. Sign in again."
        : `Elyra could not complete that (${status}).`;
  return new ApiError(message, status, record.unconfigured === true, body);
}

/** A JSON request. Resolves with the parsed body; rejects with an ApiError. */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = apiUrl(path);
  const { signal, done } = withTimeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, options.signal);
  let response: Response;
  let headers: Record<string, string>;
  try {
    headers = await headersFor(options);
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
  } catch (error) {
    done();
    if (error instanceof ApiError) throw error;
    if (signal.aborted && signal.reason instanceof ApiError) throw signal.reason;
    throw new ApiError("Could not reach Elyra. Check your connection.", 0);
  }

  let body: unknown = null;
  try {
    const text = await response.text();
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = null;
  } finally {
    done();
  }

  settleReferral(headers, response.ok);
  if (!response.ok) {
    const error = errorFor(response.status, body);
    if (response.status === 401 && options.auth !== false) {
      for (const listener of [...unauthorizedListeners]) listener();
    }
    throw error;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) => request<T>(path, options),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...options, method: "DELETE", body }),
};

/* ---- streams ---- */

/**
 * Opens a streamed response with expo/fetch, which — unlike React Native's
 * own fetch — hands back the body as it arrives. No timeout: a stream ends
 * when the server ends it or the caller aborts.
 */
async function openStream(path: string, options: RequestOptions): Promise<ReadableStream<Uint8Array>> {
  const headers = await headersFor(options);
  const response = await streamingFetch(apiUrl(path), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });
  settleReferral(headers, response.ok);
  if (!response.ok || response.body === null) {
    const text = await response.text().catch(() => "");
    let body: unknown = null;
    try {
      body = text.length > 0 ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const error = errorFor(response.status, body);
    if (response.status === 401) for (const listener of [...unauthorizedListeners]) listener();
    throw error;
  }
  return response.body as ReadableStream<Uint8Array>;
}

async function* lines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const splitter = createLineSplitter();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of splitter.push(decoder.decode(value, { stream: true }))) yield line;
    }
    for (const line of splitter.push(decoder.decode())) yield line;
    for (const line of splitter.flush()) yield line;
  } finally {
    reader.releaseLock();
  }
}

/** Each newline-delimited JSON event of a streamed response, as it arrives. */
export async function* streamNdjson<T>(path: string, options: RequestOptions = {}): AsyncGenerator<T> {
  for await (const line of lines(await openStream(path, options))) {
    const value = parseNdjsonLine(line);
    if (value !== undefined) yield value as T;
  }
}

/** Each Server-Sent Event of a streamed response, as it arrives. */
export async function* streamSse(path: string, options: RequestOptions = {}): AsyncGenerator<SseEvent> {
  const parser = createSseParser();
  for await (const line of lines(await openStream(path, { ...options, headers: { accept: "text/event-stream", ...options.headers } }))) {
    const event = parser.line(line);
    if (event !== null) yield event;
  }
  const last = parser.line("");
  if (last !== null) yield last;
}

/**
 * A POST whose error answers still carry a result — a transfer's "failed"
 * comes back as 502 with the reason and the signature. Resolves with the
 * body for any status the server answered, except 401 (the session is over)
 * and no answer at all, which reject as usual.
 */
export async function postForOutcome<T>(
  path: string,
  body: unknown,
  options?: Omit<RequestOptions, "method" | "body">,
): Promise<{ ok: boolean; status: number; body: T }> {
  try {
    return { ok: true, status: 200, body: await request<T>(path, { ...options, method: "POST", body }) };
  } catch (error) {
    if (error instanceof ApiError && error.status > 0 && error.status !== 401 && error.body !== null) {
      return { ok: false, status: error.status, body: error.body as T };
    }
    throw error;
  }
}
