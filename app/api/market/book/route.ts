import { NextResponse } from "next/server";
import { marketFor } from "@/lib/autotrade/rules";
import { parseHyperliquidBook, type Book } from "@/lib/market/book";

/* ---------------------------------------------------------------------------
   GET /api/market/book?coin=BTC

   Hyperliquid's live order book for one of Elyra's perp markets — the top
   twenty levels a side, read from the public info endpoint on mainnet — for
   the trade panel's liquidity read and fill estimate (lib/market/book.ts).
   Public, and cached two seconds at the edge: a book is only worth reading
   fresh.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS = 20;

export async function GET(request: Request): Promise<NextResponse<{ book: Book | null; error: string | null }>> {
  const market = marketFor(new URL(request.url).searchParams.get("coin"));
  if (market === null) return NextResponse.json({ book: null, error: "Not one of Elyra's perp markets." }, { status: 400 });
  try {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "l2Book", coin: market.coin }),
      signal: AbortSignal.timeout(6_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Hyperliquid answered ${response.status}`);
    const book = parseHyperliquidBook(market.coin, await response.json());
    if (book === null || book.bids.length === 0 || book.asks.length === 0) throw new Error("empty book");
    return NextResponse.json(
      { book: { ...book, bids: book.bids.slice(0, LEVELS), asks: book.asks.slice(0, LEVELS) }, error: null },
      { headers: { "cache-control": "public, s-maxage=2, stale-while-revalidate=4" } },
    );
  } catch {
    return NextResponse.json({ book: null, error: "Hyperliquid's order book could not be read just now." }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
