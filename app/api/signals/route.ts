import { NextResponse } from "next/server";
import { assertSignalDto, type SignalListDto } from "@/lib/signals/types";

/* ---------------------------------------------------------------------------
   Signals, from the engine.

   A server-side proxy rather than a browser fetch, for two reasons:

   - The engine's address stays server-side, so it never has to be reachable
     from the public internet to make the dashboard work.
   - The payload is validated here, once, before any card sees it. A signal
     missing its disclaimer or its measured/fixture flag is dropped rather
     than rendered, because both absences produce a card that looks ordinary
     and is not.

   When the engine is unreachable this returns an empty list and says so in
   `engineError`. It does NOT fall back to mock signals: a card that cannot
   be traced to the engine that produced it is exactly the thing this whole
   pipeline exists to prevent, and "the service is down" is a better answer
   than a plausible number from nowhere.
--------------------------------------------------------------------------- */

const ENGINE_URL = process.env.ELYRA_ENGINE_URL ?? "http://localhost:8787";
const TIMEOUT_MS = 5_000;

export const dynamic = "force-dynamic";

export interface SignalsResponse extends SignalListDto {
  /** Null when the engine answered. A string when it did not. */
  engineError: string | null;
  /** Signals the engine sent that failed validation here, with the reason. */
  rejected: string[];
}

export async function GET(request: Request): Promise<NextResponse<SignalsResponse>> {
  const incoming = new URL(request.url);
  const target = new URL("/signals", ENGINE_URL);
  for (const key of ["status", "assetClass", "symbol", "limit"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }

  const empty = (engineError: string): NextResponse<SignalsResponse> =>
    NextResponse.json(
      { signals: [], count: 0, disclaimer: "", engineError, rejected: [] },
      { status: 200 },
    );

  let payload: SignalListDto;
  try {
    const response = await fetch(target, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) {
      return empty(`engine returned ${response.status}`);
    }
    payload = (await response.json()) as SignalListDto;
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "unknown";
    return empty(`engine unreachable at ${ENGINE_URL}: ${detail}`);
  }

  /* Validate each signal individually so one bad row does not lose the rest,
     and so the reason is reportable rather than a blank list. */
  const signals: SignalListDto["signals"] = [];
  const rejected: string[] = [];
  for (const candidate of payload.signals ?? []) {
    try {
      signals.push(assertSignalDto(candidate));
    } catch (error: unknown) {
      rejected.push(error instanceof Error ? error.message : "unknown");
    }
  }

  return NextResponse.json({
    signals,
    count: signals.length,
    disclaimer: payload.disclaimer ?? "",
    engineError: null,
    rejected,
  });
}
