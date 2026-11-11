import { NextResponse } from "next/server";
import { LIMITS } from "@/lib/autotrade/rules";
import { STRATEGY_OPTIONS, automationUser } from "@/lib/autotrade/session";
import { listOrders, listPositions, listRules, liveEnabled, paperAnalysis, readAgent, readSettings, tablesMissing, tradingNetwork } from "@/lib/autotrade/store";
import type { AutomationResponse } from "@/lib/autotrade/types";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Trading automation for the signed-in account: settings, Elyra's trading
   key (never the key itself), rules, recent trades and the strategy list.

   POST changes the account-wide settings — the pause switch, the day's loss
   limit and the most positions open at once. Pausing stops new entries at
   the next check; positions already open keep their TP and SL.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;
  const { userId, evmAddress } = resolved;

  try {
    const [settings, agent, rules, trades, orders] = await Promise.all([
      readSettings(userId),
      readAgent(userId),
      listRules(userId),
      listPositions(userId),
      listOrders(userId),
    ]);
    const analysis = await paperAnalysis(userId, rules);
    const body: AutomationResponse = {
      settings,
      agent,
      live: { enabled: liveEnabled(), network: tradingNetwork() },
      accountAddress: evmAddress,
      rules,
      trades,
      orders,
      analysis,
      strategies: STRATEGY_OPTIONS,
      error: null,
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    const missing = error instanceof Error && /trading_/.test(error.message);
    return NextResponse.json(
      { error: missing ? "Automation needs database migration 0018, which has not been applied." : "Automation could not be read." },
      { status: 503 },
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await automationUser(request);
  if ("response" in resolved) return resolved.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await readSettings(resolved.userId);
  const next = { ...current };

  if (typeof body.paused === "boolean") next.paused = body.paused;
  if (body.dailyLossLimitUsd !== undefined) {
    const value = Number(body.dailyLossLimitUsd);
    if (!(value > 0 && value <= LIMITS.maxDailyLossUsd)) {
      return NextResponse.json({ error: `The daily loss limit must be between $1 and $${LIMITS.maxDailyLossUsd.toLocaleString("en-US")}.` }, { status: 400 });
    }
    next.dailyLossLimitUsd = value;
  }
  if (body.maxOpenPositions !== undefined) {
    const value = Number(body.maxOpenPositions);
    if (!(Number.isInteger(value) && value >= 1 && value <= LIMITS.maxOpenPositions)) {
      return NextResponse.json({ error: `Open positions must be from 1 to ${LIMITS.maxOpenPositions}.` }, { status: 400 });
    }
    next.maxOpenPositions = value;
  }

  const { error } = await serviceClient().from("trading_settings").upsert({
    user_id: resolved.userId,
    paused: next.paused,
    daily_loss_limit_usd: next.dailyLossLimitUsd,
    max_open_positions: next.maxOpenPositions,
    updated_at: new Date().toISOString(),
  });
  if (error !== null) {
    return NextResponse.json(
      { error: tablesMissing(error) ? "Automation needs database migration 0018, which has not been applied." : "The settings could not be saved." },
      { status: 503 },
    );
  }
  return NextResponse.json({ settings: next });
}
