import { NextResponse } from "next/server";
import { automationUser } from "@/lib/autotrade/session";
import { paperResponse } from "@/lib/paper/respond";
import { PAPER_MIGRATION_NOTE, ensurePaperAccount } from "@/lib/paper/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Claims the paper account — $100,000 in virtual funds — and switches to it.
   Claiming one that already exists (a paper rule may have made it) only
   switches to it: the balance is never topped up by claiming again.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const row = await ensurePaperAccount(resolved.userId).catch(() => null);
  if (row === null) return NextResponse.json({ error: PAPER_MIGRATION_NOTE }, { status: 503 });
  const { error } = await serviceClient()
    .from("paper_accounts")
    .update({ active: true, updated_at: new Date().toISOString() })
    .eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: "The paper account could not be switched on." }, { status: 503 });
  return paperResponse(resolved.userId, 201);
}
