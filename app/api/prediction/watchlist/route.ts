import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { resolveMarket } from "@/lib/prediction/signals";
import { listWatchedMarkets, unwatchMarket, watchMarket } from "@/lib/prediction/watchlist";

/* ---------------------------------------------------------------------------
   The caller's watchlist of prediction markets.

   GET lists it. POST { market } adds one — resolved against the venue
   first, so only a real market is stored, with its own question. DELETE
   ?market= removes one. Scoped by the session, never by a parameter.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MARKET = /^[A-Za-z0-9_-]{1,160}$/;

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const markets = await listWatchedMarkets(user.userId);
  if (markets === null) {
    return NextResponse.json({ error: "Your watched markets could not be read." }, { status: 503 });
  }
  return NextResponse.json({ markets }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  let body: { market?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  const market = typeof body.market === "string" ? body.market.trim() : "";
  if (!MARKET.test(market)) return NextResponse.json({ error: "Name a market." }, { status: 400 });

  const resolved = await resolveMarket(market);
  if (resolved === null) return NextResponse.json({ error: "No such market." }, { status: 404 });

  const saved = await watchMarket({
    userId: user.userId,
    marketId: resolved.market.id,
    tokenId: resolved.tokens[0]?.tokenId ?? null,
    question: resolved.market.question,
  });
  if (!saved) return NextResponse.json({ error: "That market could not be added." }, { status: 503 });
  const markets = await listWatchedMarkets(user.userId);
  return NextResponse.json({ markets: markets ?? [] });
}

export async function DELETE(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const market = new URL(request.url).searchParams.get("market") ?? "";
  if (!MARKET.test(market)) return NextResponse.json({ error: "Name a market." }, { status: 400 });
  if (!(await unwatchMarket(user.userId, market))) {
    return NextResponse.json({ error: "That market could not be removed." }, { status: 503 });
  }
  const markets = await listWatchedMarkets(user.userId);
  return NextResponse.json({ markets: markets ?? [] });
}
