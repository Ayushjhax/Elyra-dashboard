import { NextResponse } from "next/server";
import { rateLimited } from "@/lib/personalized/session";
import { cleanSymbol, testDesign } from "@/lib/strategies/server";
import { jsonBody, strategiesUser } from "@/lib/strategies/session";
import { validateDesign } from "@/lib/strategies/spec";

/* ---------------------------------------------------------------------------
   Backtests one design — the designer's, the library's or the AI's — on
   Binance spot candles: { design, symbol, days }. The engine's own rules:
   long-only, next-bar fills, 10 bps fees and 10 bps slippage each way, stops
   inside the bar. Signed in and rate-limited like every backtest.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RUNS_PER_MINUTE = 12;

export async function POST(request: Request): Promise<Response> {
  const user = await strategiesUser(request, false);
  if ("response" in user) return user.response;
  if (rateLimited(`strategy-test:${user.userId}`, RUNS_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many backtests. Wait a moment and try again." }, { status: 429 });
  }
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const checked = validateDesign(body.design);
  if ("error" in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
  const symbol = cleanSymbol(body.symbol);
  if (symbol === null) return NextResponse.json({ error: "Name a market, such as BTC or SOL." }, { status: 400 });
  const days = typeof body.days === "number" ? body.days : 365;
  const tested = await testDesign(checked.design, { symbol, days });
  if (!tested.ok) return NextResponse.json({ error: tested.error }, { status: 422 });
  return NextResponse.json({ result: tested.result }, { headers: { "cache-control": "no-store" } });
}
