import { NextResponse } from "next/server";

import { capabilities } from "@/lib/research/capabilities";
import { marketState } from "@/lib/prediction/state";
import { collectionProgress } from "@/lib/prediction/book-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Feed and capability health. No secrets, no user data. */
export async function GET(): Promise<Response> {
  const map = capabilities();

  return NextResponse.json({
    feed: marketState.health(),
    /* How far the forward order-book collection has got. This is what turns
       "order-book strategies have no win rate" from a permanent statement
       into a progress report. */
    recordedBookCorpus: await collectionProgress(),
    capabilities: {
      "prediction.data": map["prediction.data"],
      "prediction.realtime": map["prediction.realtime"],
      "prediction.orderbook": map["prediction.orderbook"],
      "prediction.orderbook_analytics": map["prediction.orderbook_analytics"],
      "prediction.probability_basket": map["prediction.probability_basket"],
      "prediction.signals": map["prediction.signals"],
      "prediction.signal_backtest": map["prediction.signal_backtest"],
      "prediction.alerts": map["prediction.alerts"],
    },
  });
}
