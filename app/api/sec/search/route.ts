import { NextResponse, type NextRequest } from "next/server";
import { secConfigured } from "@/lib/research/sec/client";
import { searchEntities, type SecEntity } from "@/lib/research/sec/entities";

/* GET /api/sec/search?q=nvi — registrants by ticker or name, for the
   Research view's company search. The SEC's ticker map, cached for hours. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse<{ results: SecEntity[] }>> {
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 40);
  if (!secConfigured() || query.length === 0) return NextResponse.json({ results: [] });
  return NextResponse.json(
    { results: await searchEntities(query, 8) },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
