import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { signalsFor } from "@/lib/research/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const symbol = new URL(request.url).searchParams.get("symbol") ?? "SOL";
  const result = await signalsFor(symbol);

  return NextResponse.json(
    { signals: result.data ?? [], asOf: result.asOf, warnings: result.warnings ?? [] },
    { headers: { "cache-control": "no-store" } },
  );
}
