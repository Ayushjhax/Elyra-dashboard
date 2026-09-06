import { NextResponse } from "next/server";
import { parseTrackerSignalList } from "@/lib/tracker/types";

const TRACKER_URL = process.env.SMART_MONEY_TRACKER_URL ?? "http://localhost:8790";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const incoming = new URL(request.url);
  const target = new URL("/signals", TRACKER_URL);
  for (const key of ["source", "marketId", "side", "status", "limit"]) {
    const value = incoming.searchParams.get(key);
    if (value !== null) target.searchParams.set(key, value);
  }
  try {
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) return NextResponse.json({ signals: [], count: 0, disclaimer: "", generatedAt: new Date().toISOString(), error: `tracker returned ${response.status}` }, { status: 200 });
    const payload = parseTrackerSignalList(await response.json() as unknown);
    return NextResponse.json(payload);
  } catch (error: unknown) {
    return NextResponse.json({ signals: [], count: 0, disclaimer: "", generatedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "tracker unavailable" }, { status: 200 });
  }
}
