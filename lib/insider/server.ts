import "server-only";

import {
  assess,
  candidatesFrom,
  candleEntries,
  fillEntries,
  INSIDER_RULES,
  leaderboardEntries,
  ledgerEntries,
  marketParts,
  moveInFavour,
  rangeTiming,
  walletState,
  type Assessment,
  type InsiderFeed,
  type InsiderFinding,
  type InsiderScanState,
  type InsiderWallet,
  type InsiderWatch,
  type WalletNow,
} from "@/lib/insider/analyze";
import { msg } from "@/lib/i18n/translate";
import { serviceClient } from "@/lib/supabase/server";
import type { InsiderWalletRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Insider watch, server half: reading Hyperliquid, the scan the tick runs,
   and the stored findings and watches.

   Everything read here is public — Hyperliquid's leaderboard, a wallet's
   ledger, fills and positions, candles and mids — and nothing is written
   anywhere but Elyra's own tables. Its own fetch rather than the shared
   provider client, so a scan that meets a slow Hyperliquid never trips the
   circuit the chart and the automation read through.
--------------------------------------------------------------------------- */

const INFO_URL = "https://api.hyperliquid.xyz/info";
const LEADERBOARD_URL = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";

export const MIGRATION = msg("Insider watch needs database migration 0031, which has not been applied.");

const DAY = 86_400_000;
const LIST_DAYS = 30;
const LIST_LIMIT = 60;
const CONCURRENCY = 3;
/** Flagged wallets whose first hour was still running, read again per scan. */
const REFRESH_CAP = 5;
const LIVE_TTL_MS = 30_000;

async function getJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`Hyperliquid answered ${response.status}`);
  return response.json();
}

function info(body: Record<string, unknown>, timeoutMs = 10_000): Promise<unknown> {
  return getJson(INFO_URL, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, timeoutMs);
}

export function tablesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return error !== null && error !== undefined && (error.code === "42P01" || error.code === "PGRST205" || /insider_/.test(error.message ?? ""));
}

/* --- the scan ------------------------------------------------------------- */

export interface InsiderScanReport {
  candidates: number;
  checked: number;
  flagged: number;
  refreshed: number;
  errors: number;
  error?: string;
}

async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.allSettled(items.slice(index, index + size).map(run))));
  }
  return results;
}

/** One wallet, read and judged; a flagged one gets its entry placed in the past week's range. */
async function readWallet(address: string, now: number): Promise<Assessment> {
  const ledger = ledgerEntries(await info({ type: "userNonFundingLedgerUpdates", user: address, startTime: 0 }));
  const fills = fillEntries(await info({ type: "userFillsByTime", user: address, startTime: 0, aggregateByTime: true }));
  const assessment = assess({ address, ledger, fills, now });
  if (assessment.kind !== "flagged") return assessment;
  const bet = assessment.finding.bet;
  const at = Date.parse(bet.firstAt);
  const candles = await info({ type: "candleSnapshot", req: { coin: bet.coin, interval: "1h", startTime: at - INSIDER_RULES.rangeDays * DAY, endTime: at - 1 } }).catch(() => []);
  return { kind: "flagged", finding: { ...assessment.finding, timing: rangeTiming(candleEntries(candles), bet.entryPx) } };
}

function flaggedRow(finding: InsiderFinding, now: number) {
  return {
    address: finding.address,
    status: "flagged" as const,
    reason: null,
    first_trade_at: finding.firstTradeAt,
    notional_usd: finding.bet.notionalUsd,
    window_open: !finding.windowComplete,
    finding: finding as unknown as Record<string, unknown>,
    updated_at: new Date(now).toISOString(),
  };
}

/**
 * The tick's pass: read the leaderboard, judge the accounts that have only
 * just started trading, and record each one once. A wallet that may yet
 * match (its first hour still running) is not recorded, so the next scan
 * reads it again; a recorded one is never read again, except a flagged
 * wallet whose first hour had not ended, whose bet is brought up to date.
 */
export async function runInsiderScan(now: number = Date.now()): Promise<InsiderScanReport> {
  const db = serviceClient();
  const report: InsiderScanReport = { candidates: 0, checked: 0, flagged: 0, refreshed: 0, errors: 0 };

  const entries = leaderboardEntries(await getJson(LEADERBOARD_URL, {}, 45_000));
  if (entries.length === 0) throw new Error("Hyperliquid's leaderboard came back empty.");

  /* Every fresh account, so the ones already read can be looked up at once. */
  const fresh = candidatesFrom(entries, new Set(), Number.POSITIVE_INFINITY).map((candidate) => candidate.address);
  const known = new Set<string>();
  for (let index = 0; index < fresh.length; index += 100) {
    const { data, error } = await db.from("insider_wallets").select("address").in("address", fresh.slice(index, index + 100));
    if (error !== null) return { ...report, error: tablesMissing(error) ? MIGRATION : msg("Insider watch could not read its records.") };
    for (const row of data ?? []) known.add(row.address);
  }

  const candidates = candidatesFrom(entries, known);
  report.candidates = candidates.length;
  const results = await inBatches(candidates, CONCURRENCY, (candidate) => readWallet(candidate.address, now));
  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      report.errors += 1;
      continue;
    }
    report.checked += 1;
    const assessment = result.value;
    if (assessment.kind === "later") continue;
    /* The address is the key: two overlapping scans write the same row. */
    const { error } =
      assessment.kind === "flagged"
        ? await db.from("insider_wallets").upsert(flaggedRow(assessment.finding, now), { onConflict: "address" })
        : await db
            .from("insider_wallets")
            .upsert({ address: candidates[index].address, status: "passed", reason: assessment.reason, updated_at: new Date(now).toISOString() }, { onConflict: "address", ignoreDuplicates: true });
    if (error !== null) report.errors += 1;
    else if (assessment.kind === "flagged") report.flagged += 1;
  }

  /* A flagged bet whose first hour was still running: read it again. */
  const { data: open } = await db.from("insider_wallets").select("address").eq("status", "flagged").eq("window_open", true).limit(REFRESH_CAP);
  for (const row of open ?? []) {
    const assessment = await readWallet(row.address, now).catch(() => null);
    if (assessment?.kind !== "flagged") continue;
    const { error } = await db.from("insider_wallets").update(flaggedRow(assessment.finding, now)).eq("address", row.address).eq("status", "flagged");
    if (error === null) report.refreshed += 1;
  }

  /* A passed wallet is no longer fresh after a week, so its record is not needed after a month. */
  await db.from("insider_wallets").delete().eq("status", "passed").lt("updated_at", new Date(now - LIST_DAYS * DAY).toISOString());

  await db.from("insider_scans").upsert({
    id: "hyperliquid",
    at: new Date(now).toISOString(),
    leaderboard_rows: entries.length,
    candidates: report.candidates,
    checked: report.checked,
    flagged: report.flagged,
    error: report.errors > 0 ? `${report.errors} wallet reads failed.` : null,
  });
  return report;
}

/* --- live prices and positions -------------------------------------------- */

const midsCache = new Map<string, { at: number; value: Promise<Record<string, string>> }>();

/** Every mid on one perp exchange ("" is Hyperliquid's own), shared for half a minute. */
function midsFor(dex: string): Promise<Record<string, string>> {
  const hit = midsCache.get(dex);
  if (hit !== undefined && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
  const value = (info(dex === "" ? { type: "allMids" } : { type: "allMids", dex }) as Promise<Record<string, string>>).catch((error: unknown) => {
    midsCache.delete(dex);
    throw error;
  });
  midsCache.set(dex, { at: Date.now(), value });
  return value;
}

async function marksFor(coins: readonly string[]): Promise<Map<string, number>> {
  const dexes = [...new Set(coins.map((coin) => marketParts(coin).dex ?? ""))];
  const marks = new Map<string, number>();
  const read = await Promise.allSettled(dexes.map((dex) => midsFor(dex)));
  for (const outcome of read) {
    if (outcome.status !== "fulfilled") continue;
    for (const [coin, mid] of Object.entries(outcome.value)) {
      const price = Number(mid);
      if (Number.isFinite(price) && price > 0) marks.set(coin, price);
    }
  }
  return marks;
}

const walletCache = new Map<string, { at: number; value: Promise<WalletNow> }>();

/** A flagged wallet's positions now, on Hyperliquid and on each builder exchange its bets were on. */
export function walletNow(address: string, coins: readonly string[]): Promise<WalletNow> {
  const hit = walletCache.get(address);
  if (hit !== undefined && Date.now() - hit.at < LIVE_TTL_MS) return hit.value;
  const dexes = [...new Set(["", ...coins.map((coin) => marketParts(coin).dex ?? "")])];
  const value = Promise.all(dexes.map((dex) => info(dex === "" ? { type: "clearinghouseState", user: address } : { type: "clearinghouseState", user: address, dex })))
    .then((states) => {
      const read = states.map(walletState);
      return {
        accountValueUsd: read.reduce((sum, state) => sum + state.accountValueUsd, 0),
        positions: read.flatMap((state) => state.positions).sort((a, b) => b.valueUsd - a.valueUsd),
        at: new Date().toISOString(),
      };
    })
    .catch((error: unknown) => {
      walletCache.delete(address);
      throw error;
    });
  if (walletCache.size > 500) walletCache.clear();
  walletCache.set(address, { at: Date.now(), value });
  return value;
}

/* --- reads for the page --------------------------------------------------- */

function toWallet(row: InsiderWalletRow, marks: Map<string, number>): InsiderWallet | null {
  const finding = row.finding as unknown as InsiderFinding | null;
  if (finding === null || typeof finding !== "object" || finding.bet === undefined) return null;
  const mark = marks.get(finding.bet.coin) ?? null;
  return {
    ...finding,
    detectedAt: row.detected_at,
    markPx: mark,
    sinceEntryPct: mark === null ? null : moveInFavour(finding.bet.side, finding.bet.entryPx, mark),
  };
}

/** The flagged wallets of the last month, newest trade first, the last scan, and the person's watch. */
export async function insiderFeed(userId: string | null): Promise<InsiderFeed> {
  const db = serviceClient();
  const since = new Date(Date.now() - LIST_DAYS * DAY).toISOString();
  const [rows, scan, watch] = await Promise.all([
    db.from("insider_wallets").select("*").eq("status", "flagged").gte("first_trade_at", since).order("first_trade_at", { ascending: false }).limit(LIST_LIMIT),
    db.from("insider_scans").select("at, checked, flagged, error").eq("id", "hyperliquid").maybeSingle(),
    userId === null ? Promise.resolve({ data: null, error: null }) : db.from("insider_watches").select("min_usd, created_at").eq("user_id", userId).maybeSingle(),
  ]);
  if (rows.error !== null) return { wallets: [], scan: null, watch: null, error: tablesMissing(rows.error) ? MIGRATION : msg("Insider watch could not be read.") };

  const found = (rows.data ?? []) as InsiderWalletRow[];
  const coins = found.map((row) => (row.finding as { bet?: { coin?: string } } | null)?.bet?.coin).filter((coin): coin is string => typeof coin === "string");
  const marks = await marksFor(coins);
  const scanRow = scan.data as { at: string; checked: number; flagged: number; error: string | null } | null;
  const watchRow = watch.data as { min_usd: number | string; created_at: string } | null;
  return {
    wallets: found.map((row) => toWallet(row, marks)).filter((wallet): wallet is InsiderWallet => wallet !== null),
    scan: scanRow === null ? null : ({ at: scanRow.at, checked: scanRow.checked, flagged: scanRow.flagged, error: scanRow.error } satisfies InsiderScanState),
    watch: watchRow === null ? null : ({ minUsd: Number(watchRow.min_usd), since: watchRow.created_at } satisfies InsiderWatch),
    error: null,
  };
}

/** The bet markets of a flagged wallet, or null when Elyra has not flagged it. */
export async function flaggedCoins(address: string): Promise<{ coins: string[] } | { error: string; status: number }> {
  const { data, error } = await serviceClient().from("insider_wallets").select("finding").eq("address", address).eq("status", "flagged").maybeSingle();
  if (error !== null) return { error: tablesMissing(error) ? MIGRATION : msg("Insider watch could not be read."), status: 503 };
  const finding = (data as { finding: InsiderFinding | null } | null)?.finding;
  if (finding === null || finding === undefined) return { error: msg("Elyra has not flagged that wallet."), status: 404 };
  return { coins: [finding.bet.coin, ...finding.otherBets.map((bet) => bet.coin)] };
}

/* --- watches -------------------------------------------------------------- */

export async function setWatch(userId: string, minUsd: number): Promise<{ watch: InsiderWatch } | { error: string; status: number }> {
  const { data, error } = await serviceClient()
    .from("insider_watches")
    .upsert({ user_id: userId, min_usd: minUsd, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("min_usd, created_at")
    .single();
  if (error !== null || data === null) return { error: tablesMissing(error) ? MIGRATION : msg("The watch could not be saved."), status: 503 };
  return { watch: { minUsd: Number(data.min_usd), since: data.created_at } };
}

export async function deleteWatch(userId: string): Promise<{ error: string | null }> {
  const { error } = await serviceClient().from("insider_watches").delete().eq("user_id", userId);
  return { error: error === null ? null : tablesMissing(error) ? MIGRATION : msg("The watch could not be turned off.") };
}
