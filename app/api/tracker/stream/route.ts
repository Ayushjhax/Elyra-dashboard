import { NextResponse } from "next/server";

const TRACKER_URL = process.env.SMART_MONEY_TRACKER_URL ?? "http://localhost:8790";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const upstream = await fetch(new URL("/stream", TRACKER_URL), { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!upstream.ok || upstream.body === null) return NextResponse.json({ error: "tracker stream unavailable" }, { status: 503 });
    return new Response(upstream.body, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
  } catch { return NextResponse.json({ error: "tracker stream unavailable" }, { status: 503 }); }
}
