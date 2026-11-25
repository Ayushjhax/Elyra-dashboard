import { NextResponse } from "next/server";
import { automationUser } from "@/lib/autotrade/session";
import { PAPER_STARTING_USD } from "@/lib/paper/funds";
import { paperResponse } from "@/lib/paper/respond";
import { readPaperRow } from "@/lib/paper/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Starts the paper account again at $100,000, from now. Only while nothing
   is open on paper: a position or a resting order from before the reset
   would no longer belong to any balance. Past paper trades stay in the
   trade history; they are simply not this balance's any more.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const row = await readPaperRow(resolved.userId).catch(() => null);
  if (row === null) return NextResponse.json({ error: "There is no paper account to reset. Claim one first." }, { status: 404 });

  const db = serviceClient();
  const [positions, orders] = await Promise.all([
    db.from("trading_positions").select("id", { count: "exact", head: true }).eq("user_id", resolved.userId).eq("mode", "paper").is("fund_id", null).in("status", ["opening", "open"]),
    db.from("trading_orders").select("id", { count: "exact", head: true }).eq("user_id", resolved.userId).eq("mode", "paper").eq("status", "open"),
  ]);
  if (positions.error !== null) return NextResponse.json({ error: "Paper positions could not be read." }, { status: 503 });
  const open = (positions.count ?? 0) + (orders.error === null ? (orders.count ?? 0) : 0);
  if (open > 0) {
    return NextResponse.json(
      { error: `${open === 1 ? "1 paper position or order is" : `${open} paper positions and orders are`} open. Close or cancel them first, then reset.` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("paper_accounts")
    .update({ starting_usd: PAPER_STARTING_USD, started_at: now, resets: row.resets + 1, updated_at: now })
    .eq("user_id", resolved.userId);
  if (error !== null) return NextResponse.json({ error: "The paper account could not be reset." }, { status: 503 });
  return paperResponse(resolved.userId);
}
