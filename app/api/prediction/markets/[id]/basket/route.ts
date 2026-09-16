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

  const basket = outcome === undefined ? null : view.baskets.get(outcome.tokenId) ?? null;
  if (basket === null) {
    return NextResponse.json({ error: "The basket could not be built." }, { status: 404 });
  }

  return NextResponse.json({
    market: { id: view.resolved.market.id, question: view.resolved.market.question },
    outcome: outcome?.outcomeLabel ?? null,
    basket,
    label: "Elyra Probability Basket",
    disclaimer:
      "An analytical reference built from observable prices. Not a guaranteed probability.",
  });
}
