import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { STRATEGIES, STRATEGY_CATEGORIES } from "@/lib/backtest/strategies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  /* Parameter metadata travels with each strategy so the UI renders the right
     controls without twenty hand-coded forms. */
  return NextResponse.json({
    categories: STRATEGY_CATEGORIES,
    strategies: STRATEGIES.map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      category: strategy.category,
      rules: strategy.rules,
      parameters: strategy.parameters,
      requiresVolume: strategy.requiresVolume,
      intradayOnly: strategy.intradayOnly ?? false,
      version: strategy.version,
    })),
  });
}
