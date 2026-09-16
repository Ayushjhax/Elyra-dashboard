import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { marketRecap, type RecapScope } from "@/lib/research/recap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCOPES = ["crypto", "equities", "portfolio"];

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const raw = new URL(request.url).searchParams.get("scope") ?? "crypto";
  const scope = (SCOPES.includes(raw) ? raw : "crypto") as RecapScope;

  const result = await marketRecap(scope);

  return NextResponse.json(result.data, { headers: { "cache-control": "no-store" } });
}
