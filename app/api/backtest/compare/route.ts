import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { compareStrategies, MAX_COMPARE } from "@/lib/backtest/run";
import { resolveStrategy } from "@/lib/backtest/strategies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null || user.userId === null) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const raw = Array.isArray(body.strategies) ? body.strategies : [];
  const ids: string[] = [];
  const unresolved: string[] = [];

  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const match = resolveStrategy(entry);
    if (match === null) unresolved.push(entry);
    else if (!ids.includes(match.strategy.id)) ids.push(match.strategy.id);
  }

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "None of those were recognised as strategies.", unresolved },
      { status: 400 },
    );
  }

  if (ids.length > MAX_COMPARE) {
    return NextResponse.json(
      { error: `Compare at most ${MAX_COMPARE} strategies at once.` },
      { status: 400 },
    );
  }

  const days = typeof body.days === "number" ? body.days : 365;
  const endAt = Date.now();

  const result = await compareStrategies({
    symbol: typeof body.symbol === "string" ? body.symbol : "SOL",
    timeframe: typeof body.timeframe === "string" ? body.timeframe : "1h",
    startAt: endAt - days * 86_400_000,
    endAt,
    strategyIds: ids,
    feeBps: typeof body.feeBps === "number" ? body.feeBps : 10,
    slippageBps: typeof body.slippageBps === "number" ? body.slippageBps : 10,
    initialCapitalUsd: typeof body.capital === "number" ? body.capital : 10_000,
  });

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 });

  return NextResponse.json(
    { ...result, unresolved },
    { headers: { "cache-control": "no-store" } },
  );
}
