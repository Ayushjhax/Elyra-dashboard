import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { kaminoYield, YIELD_RANKING_NOTE } from "@/lib/research/yield";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const result = await kaminoYield({
    asset: params.get("asset"),
    stablesOnly: params.get("stables") === "true",
    minApyPct: params.has("minApy") ? Number(params.get("minApy")) : null,
    limit: 25,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error?.message }, { status: 503 });
  }

  return NextResponse.json(
    {
      opportunities: result.data ?? [],
      asOf: result.asOf,
      ranking: YIELD_RANKING_NOTE,
      warnings: result.warnings ?? [],
    },
    { headers: { "cache-control": "no-store" } },
  );
}
