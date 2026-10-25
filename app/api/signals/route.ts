import { NextResponse } from "next/server";
import { serviceUrl } from "@/lib/services";
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

const ENGINE_URL = serviceUrl(process.env.ELYRA_ENGINE_URL, "http://localhost:8787");
const TIMEOUT_MS = 5_000;

export const dynamic = "force-dynamic";

/** One candidate the engine built and then refused to publish. */
export interface EngineRejection {
  id: string;
  stage: string;
  detail: string;
}

/**
 * What the engine's last build cycle did.
 *
 * Fetched alongside the signals so an empty feed can say why it is empty. An
 * engine that ran and rejected every candidate and an engine that never
 * started both produce zero signals, and only one of them is a problem — the
 * panel cannot tell them apart without this.
 */
export interface EngineDiagnostics {
  ran: boolean;
  startedAt: string | null;
  durationMs: number | null;
  /** Rejections counted per stage: `levels`, `firing`, `scan`, `source`. */
  byStage: Record<string, number>;
  rejections: EngineRejection[];
  legs: Array<{ name: string; signals: number; rejections: number; failed: boolean }>;
}

export interface SignalsResponse extends SignalListDto {
  /** Null when the engine answered. A string when it did not. */
  engineError: string | null;
  /** Signals the engine sent that failed validation here, with the reason. */
  rejected: string[];
  /** Null when the engine could not be reached, or serves no diagnostics. */
  diagnostics: EngineDiagnostics | null;
}

export async function GET(request: Request): Promise<NextResponse<SignalsResponse>> {
  const incoming = new URL(request.url);
  const empty = (engineError: string): NextResponse<SignalsResponse> =>
    NextResponse.json(
      {
        signals: [], count: 0, disclaimer: "", engineError, rejected: [],
        diagnostics: null,
      },
      { status: 200 },
    );

  if (ENGINE_URL === null) return empty("The signal engine is not configured on this deployment.");
  const target = new URL("/signals", ENGINE_URL);
  for (const key of ["status", "assetClass", "symbol", "limit"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }

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
    return empty(`engine unreachable: ${detail}`);
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
    diagnostics: await diagnostics(),
  });
}

/**
 * The engine's own account of its last cycle.
 *
 * Best effort and never fatal: the signals are the answer and this is
 * commentary on it, so an engine too old to serve `/diagnostics` returns 404
 * here and the feed is unaffected.
 */
async function diagnostics(): Promise<EngineDiagnostics | null> {
  if (ENGINE_URL === null) return null;
  try {
    const response = await fetch(new URL("/diagnostics", ENGINE_URL), {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!response.ok) return null;

    const body = (await response.json()) as Partial<EngineDiagnostics> & {
      ran?: boolean;
    };
    if (body.ran !== true) {
      return {
        ran: false, startedAt: null, durationMs: null,
        byStage: {}, rejections: [], legs: [],
      };
    }
    return {
      ran: true,
      startedAt: body.startedAt ?? null,
      durationMs: body.durationMs ?? null,
      byStage: body.byStage ?? {},
      rejections: body.rejections ?? [],
      legs: body.legs ?? [],
    };
  } catch {
    return null;
  }
}
