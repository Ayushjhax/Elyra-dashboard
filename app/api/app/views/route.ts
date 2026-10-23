import { NextResponse } from "next/server";
import { executeTool } from "@/lib/agent/tools/registry";
import { resolveWritable } from "@/lib/personalized/session";
import { predictionAccount } from "@/lib/prediction/account";

/* ---------------------------------------------------------------------------
   The Android app's detail views — the same figures the Telegram Mini App's
   Overview, Holdings, Risk and DeFi showed, and the chat's /orders and
   /activity, computed by the same agent tools, so the app, the chat and the
   assistant can never define "exposure" or "distance to liquidation" two
   ways.

   GET /api/app/views?view=risk|defi|holdings|overview|orders|fills

   An allowlist, not a pass-through: `view` comes from the client, and a
   string that reached `executeTool` unchecked could call any registered
   tool. The caller is the verified Privy session; the addresses are its
   profile's, never the request's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOOL: Record<string, { name: string; args?: Record<string, unknown> }> = {
  overview: { name: "portfolio_overview" },
  /* Every holding, unverified ones included — the screen filters. */
  holdings: { name: "portfolio_holdings", args: { minValueUsd: 0 } },
  risk: { name: "portfolio_risk" },
  defi: { name: "defi_positions" },
  orders: { name: "open_orders" },
  fills: { name: "recent_activity", args: { limit: 50 } },
};

export async function GET(request: Request): Promise<Response> {
  const resolved = await resolveWritable(request, "This view");
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  const view = new URL(request.url).searchParams.get("view") ?? "";
  const tool = TOOL[view];
  if (tool === undefined) {
    return NextResponse.json({ error: "Unknown view." }, { status: 400 });
  }

  const prediction = await predictionAccount(session.userId);
  const outcome = await executeTool(tool.name, tool.args ?? {}, {
    userId: session.userId,
    sessionWallet: session.sessionWallet,
    solanaAddress: session.solanaAddress,
    polymarketAddress: prediction?.address ?? null,
  });

  return NextResponse.json(
    { view, ok: outcome.ok, data: outcome.result },
    /* Per-user data. Nothing may cache it. */
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}
