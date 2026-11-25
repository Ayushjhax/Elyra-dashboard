import { NextResponse } from "next/server";
import { validateMarketOrder } from "@/lib/autotrade/orders";
import { automationUser } from "@/lib/autotrade/session";
import { openMarketTrade } from "@/lib/autotrade/trade";

/* ---------------------------------------------------------------------------
   Opens a long or a short now, by hand. The order is checked here
   (`validateMarketOrder`) and carried out by `openMarketTrade`
   (lib/autotrade/trade.ts) — the same path an agent's approved perp intent
   takes, with the same limits, account gate and position-before-order rule.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validateMarketOrder(body);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });

  const outcome = await openMarketTrade(resolved.userId, checked.order);
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ position: outcome.position }, { status: 201 });
}
