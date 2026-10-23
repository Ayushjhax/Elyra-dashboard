import { NextResponse } from "next/server";
import { badJson, jsonBody, storedSession } from "@/lib/notifications/session";
import {
  addToWatchlist,
  readWatchlist,
  removeFromWatchlist,
  reorderWatchlist,
  watchlistSymbol,
  WATCHLIST_MAX,
  type WatchlistResult,
} from "@/lib/watchlist";

/* ---------------------------------------------------------------------------
   The caller's watchlist.

   GET lists it in order. POST { symbol } adds one at the end. DELETE
   { symbol } removes one. PATCH { symbols } reorders — it must name exactly
   the symbols already there. Every answer is the list as it now stands.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function answer(result: WatchlistResult): Response {
  return "error" in result
    ? NextResponse.json({ error: result.error }, { status: result.status })
    : NextResponse.json({ symbols: result.symbols }, { headers: { "cache-control": "no-store" } });
}

const BAD_SYMBOL = () => NextResponse.json({ error: "That is not a symbol." }, { status: 400 });

export async function GET(request: Request): Promise<Response> {
  const session = await storedSession(request, "The watchlist");
  if ("response" in session) return session.response;
  const symbols = await readWatchlist(session.userId);
  return answer(symbols === null ? { error: "The watchlist could not be read.", status: 503 } : { symbols });
}

export async function POST(request: Request): Promise<Response> {
  const session = await storedSession(request, "The watchlist");
  if ("response" in session) return session.response;
  const body = await jsonBody(request);
  if (body === null) return badJson();
  const symbol = watchlistSymbol(body.symbol);
  if (symbol === null) return BAD_SYMBOL();
  return answer(await addToWatchlist(session.userId, symbol));
}

export async function DELETE(request: Request): Promise<Response> {
  const session = await storedSession(request, "The watchlist");
  if ("response" in session) return session.response;
  const body = await jsonBody(request);
  if (body === null) return badJson();
  const symbol = watchlistSymbol(body.symbol);
  if (symbol === null) return BAD_SYMBOL();
  return answer(await removeFromWatchlist(session.userId, symbol));
}

export async function PATCH(request: Request): Promise<Response> {
  const session = await storedSession(request, "The watchlist");
  if ("response" in session) return session.response;
  const body = await jsonBody(request);
  if (body === null) return badJson();
  if (!Array.isArray(body.symbols) || body.symbols.length > WATCHLIST_MAX) {
    return NextResponse.json({ error: "Pass symbols, the whole list in its new order." }, { status: 400 });
  }
  const order = body.symbols.map(watchlistSymbol);
  if (order.some((symbol) => symbol === null)) return BAD_SYMBOL();
  return answer(await reorderWatchlist(session.userId, order as string[]));
}
