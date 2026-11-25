import "server-only";

import { suiWalletFor } from "@/lib/auth/sui";
import { isEvmAddress } from "@/lib/evm/chains";
import { composePortfolio } from "@/lib/portfolio/compose";
import { readFlows, valueByNetwork } from "@/lib/portfolio/flowsServer";
import { recordSnapshot } from "@/lib/portfolio/history";
import { flowBetween, noteText, type DailyRecord } from "@/lib/portfolio/performance";
import { predictionAccount } from "@/lib/prediction/account";
import { isSolanaAddress } from "@/lib/solana/address";
import { serviceClient } from "@/lib/supabase/server";
import type { PortfolioDailyRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Portfolio tracking: one close a day for every account with a wallet.

   Run by /api/portfolio/track, which pg_cron calls every ten minutes from
   00:00 to 05:59 UTC (0034_portfolio_tracking.sql). Each call finds the
   accounts with no close for yesterday yet and records the next batch:

   - equity, read the way /api/portfolio reads it (composePortfolio), or null
     when a venue failed and the total is not the account's value;
   - the net of deposits and withdrawals since the previous close's reading
     (lib/portfolio/flowsServer.ts), or null when a chain holding value
     could not be read far enough back.

   One row per account per day (the primary key); the first write wins, so a
   call that overlaps another records nothing twice. A batch is capped and
   the call stops before the function's limit, and the next call picks up
   where it left off — the work checkpoints itself in the table.

   The addresses come from the profile, never a request; the Sui wallet from
   Privy. Nothing here signs or moves anything.
--------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;
/** Accounts per call, and how many are read at once. */
const BATCH = 30;
const PARALLEL = 3;
/** Stop starting new accounts past this, inside the route's 300 seconds. */
const BUDGET_MS = 240_000;
const PROFILE_PAGE = 1000;

const num = (value: number | string | null): number | null => {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function toDailyRecord(row: Pick<PortfolioDailyRow, "day" | "recorded_at" | "equity_usd" | "flow_usd" | "flows_complete">): DailyRecord {
  return {
    day: row.day,
    recordedAt: new Date(row.recorded_at).toISOString(),
    equityUsd: num(row.equity_usd),
    flowUsd: num(row.flow_usd),
    flowsComplete: row.flows_complete,
  };
}

/** The UTC day whose close a reading at `now` stands for: the day before. */
export function closeDay(now: number): string {
  return new Date(now - DAY_MS).toISOString().slice(0, 10);
}

interface TrackedProfile {
  id: string;
  privy_did: string;
  solana_address: string | null;
  wallet_address: string | null;
}

/** Records one account's close for `day`. */
export async function recordClose(profile: TrackedProfile, day: string, now: number): Promise<"recorded" | "skipped" | "failed"> {
  const db = serviceClient();
  const solanaAddress = profile.solana_address !== null && isSolanaAddress(profile.solana_address) ? profile.solana_address : null;
  const evmAddress = isEvmAddress(profile.wallet_address) ? profile.wallet_address : null;
  if (solanaAddress === null && evmAddress === null) return "skipped";

  try {
    const [previous, sui, prediction] = await Promise.all([
      db
        .from("portfolio_daily")
        .select("day, recorded_at")
        .eq("user_id", profile.id)
        .lt("day", day)
        .order("day", { ascending: false })
        .limit(1)
        .maybeSingle(),
      suiWalletFor(profile.privy_did).catch(() => ({ ok: false as const })),
      predictionAccount(profile.id).catch(() => null),
    ]);
    const suiAddress = sui.ok && "wallet" in sui && sui.wallet !== null ? sui.wallet.address : null;

    const snapshot = await composePortfolio({ solanaAddress, sessionWallet: evmAddress, suiAddress, userId: profile.id });
    const equity = snapshot.partial ? null : snapshot.summary.totalValueUsd;
    const nowIso = new Date(now).toISOString();
    const since = previous.data?.recorded_at ? new Date(previous.data.recorded_at).toISOString() : `${day}T00:00:00.000Z`;

    const flows = await readFlows(
      { solanaAddress, evmAddress, suiAddress, polymarketAddress: prediction?.address ?? null },
      since,
      valueByNetwork(snapshot),
    );
    const flow = flowBetween(flows.flows, since, nowIso, flows.coveredSince);
    const notes = [
      ...(snapshot.partial ? ["A venue could not be read, so this close is not the account's full value."] : []),
      ...flows.notes.map(noteText),
    ];

    const { error } = await db.from("portfolio_daily").upsert(
      {
        user_id: profile.id,
        day,
        recorded_at: nowIso,
        equity_usd: equity,
        flow_usd: flow,
        flows_complete: flow !== null,
        notes,
      },
      { onConflict: "user_id,day", ignoreDuplicates: true },
    );
    if (error !== null) {
      console.warn("[portfolio tracking] write failed:", error.message);
      return "failed";
    }
    /* A reading for the five-minute line too, so 24h and 7d have a point
       for every day even when nobody opened the page. */
    if (equity !== null) void recordSnapshot(profile.id, equity);
    return "recorded";
  } catch (error) {
    console.warn("[portfolio tracking]", profile.id, error instanceof Error ? error.message : error);
    return "failed";
  }
}

export interface TrackingReport {
  day: string;
  recorded: number;
  skipped: number;
  failed: number;
  /** Accounts still without a close for the day when this call stopped. */
  remaining: number;
}

/** The next batch of accounts with no close for `day`, oldest profile first. */
async function pending(day: string, limit: number): Promise<{ batch: TrackedProfile[]; remaining: number }> {
  const db = serviceClient();
  const done = new Set<string>();
  for (let from = 0; ; from += PROFILE_PAGE) {
    const { data, error } = await db.from("portfolio_daily").select("user_id").eq("day", day).range(from, from + PROFILE_PAGE - 1);
    if (error !== null) throw new Error(error.message);
    for (const row of data ?? []) done.add(row.user_id);
    if ((data ?? []).length < PROFILE_PAGE) break;
  }

  const batch: TrackedProfile[] = [];
  let remaining = 0;
  for (let from = 0; ; from += PROFILE_PAGE) {
    const { data, error } = await db
      .from("profiles")
      .select("id, privy_did, solana_address, wallet_address")
      .or("solana_address.not.is.null,wallet_address.not.is.null")
      .order("id", { ascending: true })
      .range(from, from + PROFILE_PAGE - 1);
    if (error !== null) throw new Error(error.message);
    for (const row of (data ?? []) as TrackedProfile[]) {
      if (done.has(row.id)) continue;
      /* An address that does not parse is never recorded, so it must not
         be picked — it would sit at the head of every batch. */
      if (!(row.solana_address !== null && isSolanaAddress(row.solana_address)) && !isEvmAddress(row.wallet_address)) continue;
      remaining += 1;
      if (batch.length < limit) batch.push(row);
    }
    if ((data ?? []).length < PROFILE_PAGE) break;
  }
  return { batch, remaining };
}

export async function runTracking(now = Date.now()): Promise<TrackingReport> {
  const started = Date.now();
  const day = closeDay(now);
  const { batch, remaining } = await pending(day, BATCH);
  const report: TrackingReport = { day, recorded: 0, skipped: 0, failed: 0, remaining };

  for (let i = 0; i < batch.length; i += PARALLEL) {
    if (Date.now() - started > BUDGET_MS) break;
    const results = await Promise.all(batch.slice(i, i + PARALLEL).map((profile) => recordClose(profile, day, now)));
    for (const result of results) report[result] += 1;
  }
  report.remaining = Math.max(0, remaining - report.recorded - report.skipped);
  return report;
}
