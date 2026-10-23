import { NextResponse } from "next/server";
import { executeTool } from "@/lib/agent/tools/registry";
import { resolveWritable } from "@/lib/personalized/session";
import { predictionAccount } from "@/lib/prediction/account";
import { predictionViewTool } from "@/lib/prediction/appViews";

/* ---------------------------------------------------------------------------
   The Android app's prediction-market views — what the Telegram Mini App's
   Prediction and Trending views showed, and the chat's prediction commands,
   computed by the same agent tools, so the app, the chat and the assistant
   describe one position, one execution estimate and one market the same
   way.

   GET /api/app/prediction?view=
     trending | events&category= | summary | positions | expiring |
     activity | orders | execution&market=&outcome=&side=&notionalUsd= |
     exit&market=&outcome=&shares= | history&tokenId=&interval=

   An allowlist, not a pass-through: `view` and every argument come from the
   client and are checked here before a tool sees them. The account is the
   verified session's; the linked Polymarket address is its profile's, never
   the request's. Read-only — no tool reachable from here places, changes or
   cancels anything.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const resolved = await resolveWritable(request, "This view");
  if ("response" in resolved) return resolved.response;
  const { session } = resolved;

  const params = new URL(request.url).searchParams;
  const view = params.get("view") ?? "";
  const tool = predictionViewTool(view, params);
  if ("error" in tool) return NextResponse.json({ error: tool.error }, { status: 400 });

  const prediction = await predictionAccount(session.userId);
  const outcome = await executeTool(tool.name, tool.args, {
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
