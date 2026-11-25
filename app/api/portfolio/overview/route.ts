import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { suiWalletFor } from "@/lib/auth/sui";
import { isEvmAddress } from "@/lib/evm/chains";
import { candles } from "@/lib/market/router";
import { composePortfolio } from "@/lib/portfolio/compose";
import { readFlows, valueByNetwork } from "@/lib/portfolio/flowsServer";
import type { BenchmarkPoint, EquityReading, OverviewResponse } from "@/lib/portfolio/performance";
import { toDailyRecord } from "@/lib/portfolio/tracking";
import { readClosedTrades } from "@/lib/portfolio/trades";
import { predictionAccount } from "@/lib/prediction/account";
import { isSolanaAddress } from "@/lib/solana/address";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   GET /api/portfolio/overview — everything the Portfolio page's performance
   needs, for the signed-in account, in one read:

   - the daily closes the tracking job recorded (lib/portfolio/tracking.ts);
   - the last week of five-minute readings (portfolio_snapshots);
   - the last week's deposits and withdrawals, valued, and how far back they
     are complete (lib/portfolio/flowsServer.ts);
   - closed trades with a realised result, for the win rate
     (lib/portfolio/trades.ts);
   - Bitcoin's closes, for the benchmark.

   The page computes every window from this (lib/portfolio/performance.ts)
   and takes the live total from the shared portfolio store. Every address
   comes from the verified session — never the request — and every query is
   scoped to the session's own user id. Nothing here writes.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 86_400_000;
/** At most this many five-minute readings are sent: 7 days at 15-minute spacing. */
const MAX_READINGS = 672;

const EMPTY: OverviewResponse = {
  error: null,
  trackingSince: null,
  daily: [],
  readings: [],
  flows: [],
  flowsCoveredSince: null,
  flowNotes: [],
  trades: [],
  tradeNotes: [],
  benchmark: { symbol: "BTC", hourly: [], daily: [] },
};

function fail(error: string, status = 200): NextResponse<OverviewResponse> {
  return NextResponse.json({ ...EMPTY, error }, { status, headers: { "cache-control": "no-store" } });
}

/** Every Nth reading, so a busy week is not 2,000 points; the newest is always kept. */
function thin(readings: EquityReading[]): EquityReading[] {
  if (readings.length <= MAX_READINGS) return readings;
  const step = Math.ceil(readings.length / MAX_READINGS);
  const kept = readings.filter((_, index) => index % step === 0);
  const last = readings.at(-1);
  if (last !== undefined && kept.at(-1) !== last) kept.push(last);
  return kept;
}

async function bench(interval: "1H" | "1D", limit: number): Promise<BenchmarkPoint[]> {
  try {
    const rows = await candles("BTC", interval, limit);
    return rows.map((row) => ({ at: new Date(row.openTime).toISOString(), close: row.close }));
  } catch {
    return [];
  }
}

export async function GET(request: Request): Promise<NextResponse<OverviewResponse>> {
  const user = await getSessionUser(request);
  if (user === null) return fail("Not signed in", 401);
  if (user.userId === null) return fail("Your account could not be read right now.");

  const solanaAddress = user.solanaAddress !== null && isSolanaAddress(user.solanaAddress) ? user.solanaAddress : null;
  const evmAddress = isEvmAddress(user.walletAddress) ? user.walletAddress : null;
  if (solanaAddress === null && evmAddress === null) return fail("This account has no wallet yet.");

  const userId = user.userId;
  const now = Date.now();
  const db = serviceClient();

  try {
    const [sui, prediction] = await Promise.all([
      suiWalletFor(user.privyDid).catch(() => ({ ok: false as const })),
      predictionAccount(userId).catch(() => null),
    ]);
    const suiAddress = sui.ok && "wallet" in sui && sui.wallet !== null ? sui.wallet.address : null;
    const polymarketAddress = prediction?.address ?? null;

    const [daily, first, readings, snapshot, trades, hourly, dailyBench] = await Promise.all([
      db
        .from("portfolio_daily")
        .select("day, recorded_at, equity_usd, flow_usd, flows_complete")
        .eq("user_id", userId)
        .gte("day", new Date(now - 400 * DAY_MS).toISOString().slice(0, 10))
        .order("day", { ascending: true })
        .limit(400),
      db.from("portfolio_daily").select("day").eq("user_id", userId).order("day", { ascending: true }).limit(1).maybeSingle(),
      db
        .from("portfolio_snapshots")
        .select("at, total_value_usd")
        .eq("user_id", userId)
        .gte("at", new Date(now - 7 * DAY_MS).toISOString())
        .order("at", { ascending: true })
        .limit(2100),
      /* Which networks hold value — so a chain that cannot be read and is
         empty does not blank the page. The providers' own caches make this
         the same read the portfolio store just made. */
      composePortfolio({ solanaAddress, sessionWallet: evmAddress, suiAddress, userId }).catch(() => null),
      readClosedTrades({ evmAddress, polymarketAddress, since: now - 365 * DAY_MS }),
      bench("1H", 170),
      bench("1D", 370),
    ]);

    const flows = await readFlows(
      { solanaAddress, evmAddress, suiAddress, polymarketAddress },
      new Date(now - 7 * DAY_MS).toISOString(),
      valueByNetwork(snapshot),
    );

    const body: OverviewResponse = {
      error: null,
      trackingSince: first.data?.day ?? null,
      daily: (daily.data ?? []).map(toDailyRecord),
      readings: thin(
        (readings.data ?? [])
          .map((row) => ({ at: new Date(String(row.at)).toISOString(), equityUsd: Number(row.total_value_usd) }))
          .filter((row) => Number.isFinite(row.equityUsd)),
      ),
      flows: flows.flows,
      flowsCoveredSince: flows.coveredSince,
      flowNotes: flows.notes,
      trades: trades.trades,
      tradeNotes: trades.notes,
      benchmark: { symbol: "BTC", hourly, daily: dailyBench },
    };
    return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[portfolio overview]", error);
    return fail("The portfolio's performance could not be read.");
  }
}
