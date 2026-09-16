import { NextResponse } from "next/server";

import { liveMarket } from "@/lib/prediction/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Public market data. No session required — a prediction market's book is
   public, and gating it would break the discovery surface for signed-out
   visitors. Anything user-scoped lives under /api/prediction/signals. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const view = await liveMarket(id);
  if (view === null) {
    return NextResponse.json({ error: "No such market." }, { status: 404 });
  }

  return NextResponse.json({
    market: view.resolved.market,
    phase: view.state.phase,
    lastUpdateAt: view.state.lastUpdateAt,
    outcomes: [...view.state.outcomes.values()].map((outcome) => ({
      tokenId: outcome.tokenId,
      label: outcome.outcomeLabel,
      bestBid: outcome.book.bestBid,
      bestAsk: outcome.book.bestAsk,
      midpoint: outcome.book.midpoint,
      spread: outcome.book.spread,
      tickSize: outcome.book.tickSize,
      transport: outcome.book.transport,
      timestamp: outcome.book.timestamp,
    })),
    recentTrades: view.state.trades.slice(0, 25),
    warnings: view.state.warnings,
  });
}
