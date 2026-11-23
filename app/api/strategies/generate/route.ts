import { NextResponse } from "next/server";
import { UsageLimitError } from "@/lib/agent";
import { localeFromHeaders } from "@/lib/i18n/locales";
import { rateLimited } from "@/lib/personalized/session";
import { generateStrategies, MAX_IDEA } from "@/lib/strategies/generate";
import { cleanSymbol } from "@/lib/strategies/server";
import { jsonBody, strategiesUser } from "@/lib/strategies/session";
import { DESIGN_TIMEFRAMES, type DesignTimeframe } from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   Elyra's AI proposes strategies for an idea — { idea, symbol, timeframe,
   days } — and code validates and backtests each before the person sees it
   (lib/strategies/generate.ts). One agent run against the daily cap.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const PER_MINUTE = 3;

export async function POST(request: Request): Promise<Response> {
  const user = await strategiesUser(request);
  if ("response" in user) return user.response;
  if (rateLimited(`strategy-ai:${user.userId}`, PER_MINUTE)) {
    return NextResponse.json({ error: "One moment — the last proposals are still fresh. Try again shortly." }, { status: 429 });
  }
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const idea = typeof body.idea === "string" ? body.idea : "";
  if (idea.length > MAX_IDEA) return NextResponse.json({ error: `Describe the idea in at most ${MAX_IDEA} characters.` }, { status: 400 });
  const symbol = cleanSymbol(body.symbol);
  if (symbol === null) return NextResponse.json({ error: "Name a market, such as BTC or SOL." }, { status: 400 });
  const timeframe = (DESIGN_TIMEFRAMES as readonly unknown[]).includes(body.timeframe) ? (body.timeframe as DesignTimeframe) : "4h";
  const days = typeof body.days === "number" ? body.days : 365;

  try {
    const generated = await generateStrategies({
      userId: user.userId,
      idea,
      symbol,
      timeframe,
      days,
      locale: localeFromHeaders(request.headers.get("cookie"), request.headers.get("accept-language")),
    });
    return NextResponse.json(generated, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("[strategies/generate]", error);
    return NextResponse.json({ error: "Elyra's AI could not propose strategies just now." }, { status: 502 });
  }
}
