import "server-only";

import { midsFor } from "@/lib/autotrade/hyperliquid";
import { marketFor, netPnl, type Side } from "@/lib/autotrade/rules";
import { tradingNetwork } from "@/lib/autotrade/store";
import { bookValue, downsample, fundStats, riskMarks, utcDay } from "@/lib/funds/accounting";
import { maxNewPosition, openBlockers, type OrderContext } from "@/lib/funds/policy";
import type {
  FundBook,
  FundCharter,
  FundEventView,
  FundFlowView,
  FundMarkPoint,
  FundNoteView,
  FundPositionView,
  FundRisk,
  FundStats,
  FundSummary,
  FundTradeView,
} from "@/lib/funds/types";
import { serviceClient } from "@/lib/supabase/server";
import type { AiFundFlowRow, AiFundMarkRow, AiFundNoteRow, AiFundRow, RailsLedgerRow, TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   AI funds, the database half: reading a fund and its book, and marking the
   book to market. Every query names the owner (`user_id`) — the service-role
   client bypasses RLS, so a missing filter here is caught by nothing
   downstream.

   A fund's book is exactly the automation positions tagged with its id
   (`trading_positions.fund_id`) plus its capital flows. Nothing else is
   counted, so a position opened outside the fund can never move its NAV.
--------------------------------------------------------------------------- */

export const FUND_MIGRATION = "AI funds need database migration 0025, which has not been applied.";

/** The exit reasons the funds module writes itself — and so ledgers itself. */
export const FUND_EXIT = {
  manager: "closed_by_manager",
  owner: "closed_by_owner",
  halt: "risk_halt",
  windDown: "wind_down",
  graduate: "graduated",
} as const;

const OWN_EXITS = new Set<string>(Object.values(FUND_EXIT));

/** Whether a close was recorded by something other than the funds module — a TP/SL, or by hand. */
export function closedElsewhere(reason: string | null): boolean {
  return reason === null || !OWN_EXITS.has(reason);
}

const EXIT_WORDS: Record<string, string> = {
  take_profit: "Take-profit",
  stop_loss: "Stop-loss",
  exit_rule: "Exit rule",
  closed_by_hand: "Closed by you on Automation",
  closed_outside_elyra: "Closed outside Elyra",
  [FUND_EXIT.manager]: "Closed by the manager",
  [FUND_EXIT.owner]: "Closed by you",
  [FUND_EXIT.halt]: "Closed by Elyra at the drawdown limit",
  [FUND_EXIT.windDown]: "Closed by Elyra in the wind-down",
  [FUND_EXIT.graduate]: "Closed when the fund graduated",
};

export const exitWords = (reason: string | null): string => (reason === null ? "Closed" : (EXIT_WORDS[reason] ?? "Closed"));

export const n = (value: string | number | null | undefined): number => (value === null || value === undefined ? NaN : Number(value));

export function tablesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  return error !== null && error !== undefined && (error.code === "42P01" || error.code === "PGRST205" || /ai_fund/.test(error.message ?? ""));
}

export function toCharter(row: AiFundRow): FundCharter {
  return {
    name: row.name,
    objective: row.objective,
    markets: row.markets,
    allowShorts: row.allow_shorts,
    maxPositionPct: n(row.max_position_pct),
    maxGrossExposure: n(row.max_gross_exposure),
    maxLeverage: row.max_leverage,
    maxPositions: row.max_positions,
    maxDrawdownPct: n(row.max_drawdown_pct),
    dailyLossPct: n(row.daily_loss_pct),
  };
}

/** The charter as the table's columns, for an insert or an update. */
export function charterColumns(charter: FundCharter) {
  return {
    name: charter.name,
    objective: charter.objective,
    markets: charter.markets,
    allow_shorts: charter.allowShorts,
    max_position_pct: charter.maxPositionPct,
    max_gross_exposure: charter.maxGrossExposure,
    max_leverage: charter.maxLeverage,
    max_positions: charter.maxPositions,
    max_drawdown_pct: charter.maxDrawdownPct,
    daily_loss_pct: charter.dailyLossPct,
  };
}

export async function readFund(userId: string, id: string): Promise<AiFundRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await serviceClient().from("ai_funds").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return (data as AiFundRow | null) ?? null;
}

/** The open fund a key manages — one at most (ai_funds_manager_idx). */
export async function fundForKey(userId: string, keyId: string): Promise<AiFundRow | null> {
  const { data, error } = await serviceClient()
    .from("ai_funds")
    .select("*")
    .eq("user_id", userId)
    .eq("key_id", keyId)
    .in("status", ["active", "paused", "halted", "winding_down"])
    .limit(1)
    .maybeSingle();
  if (error !== null) return null;
  return (data as AiFundRow | null) ?? null;
}

/** Names of the owner's keys, revoked ones included, so history keeps its authors. */
export async function keysOf(userId: string): Promise<Map<string, { name: string; prefix: string; revoked: boolean; lastUsedAt: string | null }>> {
  const { data } = await serviceClient().from("agent_keys").select("id, name, prefix, revoked_at, last_used_at").eq("user_id", userId);
  return new Map(
    ((data ?? []) as { id: string; name: string; prefix: string; revoked_at: string | null; last_used_at: string | null }[]).map((row) => [
      row.id,
      { name: row.name, prefix: row.prefix, revoked: row.revoked_at !== null, lastUsedAt: row.last_used_at },
    ]),
  );
}

/* ---------------------------------------------------------------------------
   The book
--------------------------------------------------------------------------- */

export interface FundSnapshot {
  fund: AiFundRow;
  charter: FundCharter;
  open: TradingPositionRow[];
  closed: TradingPositionRow[];
  flows: AiFundFlowRow[];
  book: FundBook;
  risk: FundRisk;
  positions: FundPositionView[];
  context: OrderContext;
}

const sideOf = (row: TradingPositionRow): Side => (row.side === "short" ? "short" : "long");

/**
 * The fund's book marked to market now. Paper funds are marked at
 * Hyperliquid mainnet's mids, as paper fills are; live funds at the network
 * this server trades on. Null when the fund's rows cannot be read.
 */
export async function snapshot(fund: AiFundRow, now: number = Date.now()): Promise<FundSnapshot | null> {
  const db = serviceClient();
  const [positions, flowsRead] = await Promise.all([
    db
      .from("trading_positions")
      .select("*")
      .eq("user_id", fund.user_id)
      .eq("fund_id", fund.id)
      .in("status", ["opening", "open", "closed"])
      .order("opened_at", { ascending: false })
      .limit(5000),
    db.from("ai_fund_flows").select("*").eq("user_id", fund.user_id).eq("fund_id", fund.id).order("created_at", { ascending: true }),
  ]);
  if (positions.error !== null || flowsRead.error !== null) return null;

  const rows = (positions.data ?? []) as TradingPositionRow[];
  const open = rows.filter((row) => row.status === "open" || row.status === "opening");
  const closed = rows.filter((row) => row.status === "closed");
  const flows = (flowsRead.data ?? []) as AiFundFlowRow[];

  const mids =
    open.length === 0
      ? new Map<string, number>()
      : await midsFor(fund.mode === "live" ? tradingNetwork() : "mainnet", [...new Set(open.map((row) => row.coin))]).catch(() => new Map<string, number>());

  const book = bookValue({
    flows: flows.map((flow) => ({ kind: flow.kind, amountUsd: n(flow.amount_usd), units: n(flow.units) })),
    realisedUsd: closed.reduce((sum, row) => sum + (n(row.realised_pnl_usd) || 0), 0),
    open: open.map((row) => ({
      side: sideOf(row),
      size: n(row.size),
      entryPrice: n(row.entry_price),
      leverage: row.leverage ?? 1,
      mid: mids.get(row.coin) ?? null,
    })),
  });

  const charter = toCharter(fund);
  const highWaterMark = Math.max(n(fund.hwm_npu) || book.npu, book.npu);
  const dayStart = fund.day_start_on === utcDay(now) ? n(fund.day_start_npu) : n(fund.last_npu) || book.npu;
  const marks = riskMarks(book.npu, highWaterMark, dayStart);
  const context: OrderContext = {
    status: fund.status,
    charter,
    book: {
      navUsd: book.navUsd,
      grossUsd: book.grossUsd,
      marginUsd: book.marginUsd,
      openPositions: open.length,
      openCoins: open.map((row) => row.coin),
    },
    risk: marks,
  };

  return {
    fund,
    charter,
    open,
    closed,
    flows,
    book,
    risk: {
      highWaterMark,
      drawdownPct: marks.drawdownPct,
      todayPct: marks.todayPct,
      grossExposure: book.navUsd > 0 ? book.grossUsd / book.navUsd : 0,
      maxNewPositionUsd: maxNewPosition(context),
      blockers: openBlockers(context),
    },
    positions: open.map((row) => {
      const mark = mids.get(row.coin) ?? null;
      const size = n(row.size);
      const entry = n(row.entry_price);
      return {
        id: row.id,
        coin: row.coin,
        label: marketFor(row.coin)?.label ?? row.coin,
        side: sideOf(row),
        size,
        entryPrice: entry,
        mark,
        notionalUsd: size * (mark ?? entry),
        unrealisedUsd: netPnl(sideOf(row), size, entry, mark ?? entry),
        takeProfit: n(row.take_profit),
        stopLoss: n(row.stop_loss),
        leverage: row.leverage ?? 1,
        status: row.status === "opening" ? "opening" : "open",
        openedAt: row.opened_at,
      };
    }),
    context,
  };
}

export function toTrade(row: TradingPositionRow): FundTradeView {
  return {
    id: row.id,
    coin: row.coin,
    label: marketFor(row.coin)?.label ?? row.coin,
    side: sideOf(row),
    entryPrice: n(row.entry_price),
    exitPrice: row.exit_price === null ? null : n(row.exit_price),
    realisedUsd: n(row.realised_pnl_usd) || 0,
    exitReason: exitWords(row.exit_reason),
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? row.opened_at,
  };
}

export function toFlow(row: AiFundFlowRow): FundFlowView {
  return { id: row.id, kind: row.kind, amountUsd: n(row.amount_usd), npu: n(row.npu), units: n(row.units), at: row.created_at };
}

export function toNote(row: AiFundNoteRow, author: string): FundNoteView {
  return { id: row.id, body: row.body, positionId: row.position_id, author, at: row.created_at };
}

/** Up to `max` hourly marks, oldest first. */
export async function readMarks(fund: AiFundRow, max = 3000): Promise<FundMarkPoint[]> {
  const db = serviceClient();
  const out: AiFundMarkRow[] = [];
  for (let from = 0; from < max; from += 1000) {
    const page = await db
      .from("ai_fund_marks")
      .select("*")
      .eq("user_id", fund.user_id)
      .eq("fund_id", fund.id)
      .order("bucket", { ascending: false })
      .range(from, Math.min(max, from + 1000) - 1);
    if (page.error !== null) break;
    out.push(...((page.data ?? []) as AiFundMarkRow[]));
    if ((page.data ?? []).length < 1000) break;
  }
  return out.reverse().map((row) => ({ at: row.bucket, nav: n(row.nav), npu: n(row.npu) }));
}

export async function fundEvents(userId: string, fundId: string, limit = 40): Promise<FundEventView[]> {
  const { data } = await serviceClient()
    .from("rails_ledger")
    .select("*")
    .eq("user_id", userId)
    .eq("subject_id", fundId)
    .order("seq", { ascending: false })
    .limit(limit);
  return ((data ?? []) as RailsLedgerRow[]).map((row) => ({
    seq: Number(row.seq),
    at: row.occurred_at,
    actor: row.actor,
    event: row.event,
    body: row.body,
    hash: row.hash,
  }));
}

export function statsFor(snap: FundSnapshot, marks: readonly FundMarkPoint[], now: number): FundStats {
  return fundStats({
    marks,
    npuNow: snap.book.npu,
    trades: snap.closed.map((row) => ({ pnlUsd: n(row.realised_pnl_usd) })),
    createdAt: snap.fund.created_at,
    now,
  });
}

/** A fund's row in a list: its last mark, not a fresh one, so a list costs no network. */
export function toSummary(
  fund: AiFundRow,
  keys: Map<string, { name: string; prefix: string; revoked: boolean }>,
  spark: readonly number[],
): FundSummary {
  const npu = fund.last_npu === null ? null : n(fund.last_npu);
  const high = n(fund.hwm_npu);
  const key = fund.key_id === null ? undefined : keys.get(fund.key_id);
  return {
    id: fund.id,
    name: fund.name,
    mode: fund.mode,
    status: fund.status,
    navUsd: fund.last_nav === null ? null : n(fund.last_nav),
    returnPct: npu === null ? null : (npu / 100 - 1) * 100,
    drawdownPct: npu === null || !(high > 0) ? null : Math.max(0, (1 - npu / Math.max(high, npu)) * 100),
    manager: key === undefined || fund.key_id === null ? null : { keyId: fund.key_id, name: key.revoked ? `${key.name} (revoked)` : key.name, prefix: key.prefix },
    managerSeenAt: fund.manager_seen_at,
    haltReason: fund.halt_reason,
    closedReason: fund.closed_reason,
    spark: downsample(spark, 42),
    createdAt: fund.created_at,
    closedAt: fund.closed_at,
  };
}
