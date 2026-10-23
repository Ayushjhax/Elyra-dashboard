import { NextResponse, after } from "next/server";
import { alphaFeed, warmingPromise, type AlphaResponse } from "@/lib/research/sec/alpha";
import { secConfigured } from "@/lib/research/sec/client";

/* ---------------------------------------------------------------------------
   GET /api/sec/alpha

   Today's filings, read for what matters: insider buying and clusters,
   activist stakes and their stated purpose, red flags and catalysts from
   8-Ks, planned insider sales and new IPO registrations
   (lib/research/sec/alpha.ts).

   Answers with what has been read — waiting a moment on a cold start — and
   keeps reading after the response, so `pending` falls with each poll.
   Public: EDGAR is public, and the answer says nothing about the caller.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Room for the background read to finish after the response. */
export const maxDuration = 60;

const EMPTY: AlphaResponse = {
  summary: {
    insiderBuys: 0,
    buyValue: 0,
    clusters: 0,
    insiderSells: 0,
    sellValue: 0,
    activists: 0,
    newActivists: 0,
    redFlags: 0,
    catalysts: 0,
    leadership: 0,
    plannedSales: 0,
    plannedValue: 0,
    ipos: 0,
  },
  buys: [],
  sells: [],
  clusters: [],
  activists: [],
  redFlags: [],
  catalysts: [],
  leadership: [],
  plannedSales: [],
  ipos: [],
  read: 0,
  pending: 0,
  since: null,
  errors: [],
  asOf: new Date(0).toISOString(),
  configured: false,
};

export async function GET(): Promise<NextResponse<AlphaResponse>> {
  if (!secConfigured()) {
    return NextResponse.json({ ...EMPTY, errors: ["SEC_USER_AGENT is not set, so EDGAR cannot be read."], asOf: new Date().toISOString() });
  }
  const feed = await alphaFeed({ budgetMs: 2_500 });
  if (feed.pending > 0) after(() => warmingPromise());
  return NextResponse.json(feed, { headers: { "cache-control": "no-store" } });
}
