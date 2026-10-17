import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/personalized/session";
import { runOne, saveResult, validateRequest } from "@/lib/backtest/run";
import { resolveStrategy } from "@/lib/backtest/strategies";

/* A run can hold a function for minutes of candle reads and simulation. */
const RUNS_PER_MINUTE = 10;

/* ---------------------------------------------------------------------------
   Run one backtest.

   Synchronous: a year of hourly bars is roughly nine paginated fetches and a
   single pass over 8,700 bars, which completes in a couple of seconds. A job
   queue here would add a poll loop for no benefit. The optimiser, which is
   materially heavier, is the one that would need it.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  if (rateLimited(`backtest:${user.userId}`, RUNS_PER_MINUTE)) {
    return NextResponse.json(
      { error: "Too many requests. Wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  /* A phrase or an explicit id. `resolveStrategy` handles both, including the
     misspellings people actually type. */
  const raw = typeof body.strategy === "string" ? body.strategy : "";
  const match = resolveStrategy(raw);
  if (match === null) {
    return NextResponse.json(
      { error: `I do not recognise "${raw}" as a strategy.` },
      { status: 400 },
    );
  }

  const days = typeof body.days === "number" ? body.days : 365;
  const endAt = Date.now();
  const startAt = endAt - days * 86_400_000;

  const params = {
    ...match.params,
    ...(typeof body.params === "object" && body.params !== null
      ? (body.params as Record<string, number>)
      : {}),
  };

  const runRequest = {
    symbol: typeof body.symbol === "string" ? body.symbol : "SOL",
    timeframe: typeof body.timeframe === "string" ? body.timeframe : "1h",
    startAt,
    endAt,
    strategyId: match.strategy.id,
    params,
    initialCapitalUsd: typeof body.capital === "number" ? body.capital : 10_000,
    feeBps: typeof body.feeBps === "number" ? body.feeBps : 10,
    slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : 10,
  };

  const invalid = validateRequest(runRequest);
  if (invalid !== null) return NextResponse.json({ error: invalid }, { status: 400 });

  const outcome = await runOne(runRequest, { robustness: body.robustness === true });
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: 422 });
  }

  /* Persisted best-effort: a storage failure must not discard a result the
     user is looking at. */
  const id = await saveResult({
    userId: user.userId,
    query: typeof body.query === "string" ? body.query : null,
    outcome,
  });

  return NextResponse.json(
    {
      id,
      strategy: { id: match.strategy.id, name: match.strategy.name, rules: match.strategy.rules },
      config: outcome.config,
      metrics: outcome.metrics,
      quality: outcome.quality,
      robustness: outcome.robustness ?? null,
      warnings: outcome.warnings,
      barsLoaded: outcome.barsLoaded,
      coverage: outcome.coverage,
      /* Trades and equity are returned but capped — the full arrays are in
         the stored result. */
      trades: outcome.trades?.slice(0, 500),
      equity: outcome.equity,
      persisted: id !== null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
