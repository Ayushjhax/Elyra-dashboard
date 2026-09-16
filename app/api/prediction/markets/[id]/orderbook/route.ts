import { NextResponse } from "next/server";

import { liveMarket } from "@/lib/prediction/signals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const wanted = new URL(request.url).searchParams.get("outcome")?.toLowerCase() ?? null;

  const view = await liveMarket(id);
  if (view === null) {
    return NextResponse.json({ error: "No such market." }, { status: 404 });
  }

  const outcome =
    [...view.state.outcomes.values()].find(
      (entry) => wanted === null || entry.outcomeLabel?.toLowerCase() === wanted,
    ) ?? [...view.state.outcomes.values()][0];

  if (outcome === undefined) {
    return NextResponse.json({ error: "No order book for that outcome." }, { status: 404 });
  }

  return NextResponse.json({
    market: { id: view.resolved.market.id, question: view.resolved.market.question },
    outcome: outcome.outcomeLabel,
    tokenId: outcome.tokenId,
    /* Capped. A deep ladder is hundreds of levels and the panel renders ten;
       sending the rest costs bandwidth to display nothing. */
    bids: outcome.book.bids.slice(0, 15),
    asks: outcome.book.asks.slice(0, 15),
    analytics: view.analytics.get(outcome.tokenId) ?? null,
    transport: outcome.book.transport,
    timestamp: outcome.book.timestamp,
  });
}
