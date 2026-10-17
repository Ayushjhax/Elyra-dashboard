import { NextResponse } from "next/server";
import { polymarketSearch } from "@/lib/providers/polymarket";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public discovery through the same adapter used by the agent. Read only. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 200)
    return NextResponse.json(
      { error: "Enter a topic of up to 200 characters." },
      { status: 400 },
    );
  const result = await polymarketSearch(query, 20);
  if (!result.ok)
    return NextResponse.json(
      { error: "Market search is temporarily unavailable." },
      { status: 503 },
    );
  return NextResponse.json(
    {
      markets: result.data ?? [],
      asOf: result.asOf,
      stale: result.stale ?? false,
      warnings: result.warnings ?? [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
