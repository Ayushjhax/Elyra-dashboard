import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { insiderFeed } from "@/lib/insider/server";

/* ---------------------------------------------------------------------------
   Insider watch: the fresh Hyperliquid wallets Elyra has flagged in the last
   month, each with the live price of its bet's market, the last scan, and —
   signed in — the person's watch. The findings are public data about public
   addresses, so they read signed out too.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  const feed = await insiderFeed(user?.userId ?? null);
  return NextResponse.json({ ...feed, signedIn: user !== null && user.userId !== null }, { headers: { "cache-control": "no-store" } });
}
