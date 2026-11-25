import { NextResponse } from "next/server";
import { railsState, railsUser } from "@/lib/rails/console";

/* ---------------------------------------------------------------------------
   Everything the Agents page shows, in one read: each live agent key with
   its mandate and today's use of it, the intents agents sent, the payment
   requests, and the ledger's recent events with the whole chain verified.
   The user is the verified session's, never the request's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await railsUser(request);
  if ("response" in user) return user.response;
  const state = await railsState(user.userId);
  return NextResponse.json(state, { status: state.error === null ? 200 : 503, headers: { "cache-control": "no-store" } });
}
