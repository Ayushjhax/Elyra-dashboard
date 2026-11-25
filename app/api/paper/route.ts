import { NextResponse } from "next/server";
import { automationUser } from "@/lib/autotrade/session";
import { paperResponse } from "@/lib/paper/respond";
import { PAPER_MIGRATION_NOTE, readPaperRow } from "@/lib/paper/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   The paper account: GET reads it — balance, equity, margin in use, what is
   available — and PATCH switches the account orders go to, Live or Paper.
   Paper needs the account claimed first (POST /api/paper/claim).
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  return paperResponse(resolved.userId);
}

export async function PATCH(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.active !== "boolean") return NextResponse.json({ error: "Choose Live or Paper." }, { status: 400 });

  const row = await readPaperRow(resolved.userId).catch(() => null);
  if (row === null) {
    return body.active
      ? NextResponse.json({ error: "Claim the paper account first." }, { status: 409 })
      : paperResponse(resolved.userId);
  }
  const { error } = await serviceClient()
    .from("paper_accounts")
    .update({ active: body.active, updated_at: new Date().toISOString() })
    .eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: PAPER_MIGRATION_NOTE }, { status: 503 });
  return paperResponse(resolved.userId);
}
