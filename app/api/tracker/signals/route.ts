import { NextResponse } from "next/server";
import {
  CONSENSUS_DISCLAIMER,
  hyperliquidConsensus,
} from "@/lib/smartmoney/hyperliquid";
import { parseTrackerSignalList } from "@/lib/tracker/types";

/* ---------------------------------------------------------------------------
   Smart-money signals.

   The tracker service first: it watches a curated set of wallets across
   venues and is the richer source. When it is not running — the default on
   any machine that has not started it — this falls back to Elyra's own read
   of Hyperliquid's public leaderboard (lib/smartmoney/hyperliquid.ts) rather
   than going dark, and says so in `origin` and `notice`.

   Only when both fail does `error` carry a reason, so the panel never reports
   a connection failure as a quiet market.
--------------------------------------------------------------------------- */

const TRACKER_URL = process.env.SMART_MONEY_TRACKER_URL ?? "http://localhost:8790";
export const dynamic = "force-dynamic";
/* The first in-app read downloads the leaderboard; later ones are cached. */
export const maxDuration = 60;

async function fromTracker(incoming: URL): Promise<Response | string> {
  const target = new URL("/signals", TRACKER_URL);
  for (const key of ["source", "marketId", "side", "status", "limit"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return `tracker returned ${response.status}`;
    const payload = parseTrackerSignalList((await response.json()) as unknown);
    return NextResponse.json({ ...payload, origin: "tracker" });
  } catch (error: unknown) {
    return error instanceof Error ? error.message : "tracker unavailable";
  }
}

export async function GET(request: Request): Promise<Response> {
  const tracked = await fromTracker(new URL(request.url));
  if (typeof tracked !== "string") return tracked;

  try {
    const consensus = await hyperliquidConsensus();
    return NextResponse.json({
      signals: consensus.signals,
      count: consensus.signals.length,
      disclaimer: CONSENSUS_DISCLAIMER,
      generatedAt: consensus.generatedAt,
      error: null,
      origin: "hyperliquid",
      notice:
        `The tracker service is not running, so this is Elyra's own read: ` +
        `${consensus.walletsRead} top Hyperliquid wallets, ${consensus.walletsWithPositions} holding positions.`,
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "Hyperliquid could not be read";
    return NextResponse.json({
      signals: [],
      count: 0,
      disclaimer: "",
      generatedAt: new Date().toISOString(),
      error: `Tracker unavailable (${tracked}) and the in-app read failed: ${reason}`,
    });
  }
}
