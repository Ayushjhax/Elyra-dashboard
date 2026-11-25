import "server-only";

import { NextResponse } from "next/server";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { liveEnabled, readAgent, tradingNetwork } from "@/lib/autotrade/store";
import { downsample } from "@/lib/funds/accounting";
import { actionsFor, graduationCheck } from "@/lib/funds/policy";
import {
  FUND_MIGRATION,
  fundEvents,
  keysOf,
  n,
  readFund,
  readMarks,
  snapshot,
  statsFor,
  tablesMissing,
  toFlow,
  toNote,
  toSummary,
  toTrade,
} from "@/lib/funds/store";
import type { FundDetail, FundsResponse, FundStats } from "@/lib/funds/types";
import { serviceClient } from "@/lib/supabase/server";
import type { AiFundMarkRow, AiFundNoteRow, AiFundRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The Funds page's reads: every fund in a list (from each one's last mark,
   so the list costs no network), and one fund in full (marked to market
   now). The user is the verified session's, never the body's.
--------------------------------------------------------------------------- */

export async function fundsUser(request: Request): Promise<{ response: Response } | { userId: string }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Funds") }, { status: 503 }) };
  return { userId: user.userId };
}

const OPEN = ["active", "paused", "halted", "winding_down"];

export async function fundsState(userId: string, now: number = Date.now()): Promise<FundsResponse> {
  const db = serviceClient();
  const [fundsRead, keys, agent] = await Promise.all([
    db.from("ai_funds").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    keysOf(userId),
    readAgent(userId),
  ]);
  const live = { enabled: liveEnabled(), network: tradingNetwork(), keyApproved: agent !== null && agent.approved && agent.network === tradingNetwork() };
  if (fundsRead.error !== null) {
    return { funds: [], managers: [], live, error: tablesMissing(fundsRead.error) ? FUND_MIGRATION : "Funds could not be read." };
  }
  const funds = (fundsRead.data ?? []) as AiFundRow[];

  /* A week of marks for every fund, in one read, for the sparklines. */
  const sparks = new Map<string, number[]>();
  if (funds.length > 0) {
    const { data } = await db
      .from("ai_fund_marks")
      .select("fund_id, bucket, npu")
      .eq("user_id", userId)
      .in("fund_id", funds.map((fund) => fund.id))
      .gte("bucket", new Date(now - 7 * 86_400_000).toISOString())
      .order("bucket", { ascending: true })
      .limit(5000);
    for (const mark of (data ?? []) as AiFundMarkRow[]) {
      const list = sparks.get(mark.fund_id) ?? [];
      list.push(n(mark.npu));
      sparks.set(mark.fund_id, list);
    }
  }

  const managing = new Map(funds.filter((fund) => fund.key_id !== null && OPEN.includes(fund.status)).map((fund) => [fund.key_id as string, fund.id]));
  return {
    funds: funds.map((fund) => toSummary(fund, keys, sparks.get(fund.id) ?? [])),
    managers: [...keys.entries()]
      .filter(([, key]) => !key.revoked)
      .map(([keyId, key]) => ({ keyId, name: key.name, prefix: key.prefix, lastUsedAt: key.lastUsedAt, managing: managing.get(keyId) ?? null })),
    live,
    error: null,
  };
}

export async function fundDetail(userId: string, id: string, now: number = Date.now()): Promise<FundDetail | null> {
  const fund = await readFund(userId, id);
  if (fund === null) return null;
  const db = serviceClient();
  const [snap, marks, events, notesRead, keys, successorRead] = await Promise.all([
    snapshot(fund, now),
    readMarks(fund),
    fundEvents(userId, id),
    db.from("ai_fund_notes").select("*").eq("user_id", userId).eq("fund_id", id).order("created_at", { ascending: false }).limit(50),
    keysOf(userId),
    db.from("ai_funds").select("id").eq("user_id", userId).eq("predecessor_id", id).limit(1).maybeSingle(),
  ]);
  if (snap === null) return null;

  const stats = statsFor(snap, marks, now);
  /* The summary shows the fresh mark, not the stored one. */
  const summary = toSummary(fund, keys, marks.filter((mark) => Date.parse(mark.at) >= now - 7 * 86_400_000).map((mark) => mark.npu));
  if (fund.status !== "closed") {
    summary.navUsd = snap.book.navUsd;
    summary.returnPct = stats.returnPct;
    summary.drawdownPct = snap.risk.drawdownPct;
  }

  let graduation: FundDetail["graduation"] = null;
  if (fund.mode === "paper" && fund.status !== "closed") {
    const check = graduationCheck({ mode: fund.mode, status: fund.status, createdAt: fund.created_at, closedTrades: snap.closed.length, openPositions: snap.open.length, now });
    const live = await liveRefusal(userId);
    const reasons = live === null ? check.reasons : [...check.reasons, live];
    graduation = { ready: reasons.length === 0, reasons, incubatedDays: check.incubatedDays, closedTrades: snap.closed.length };
  }

  const authorOf = (keyId: string | null) => (keyId === null ? "The manager" : (keys.get(keyId)?.name ?? "The manager"));
  return {
    summary,
    charter: snap.charter,
    book: snap.book,
    risk: snap.risk,
    stats,
    positions: snap.positions,
    trades: snap.closed.slice(0, 100).map(toTrade),
    flows: snap.flows.map(toFlow).reverse(),
    notes: ((notesRead.data ?? []) as AiFundNoteRow[]).map((row) => toNote(row, authorOf(row.key_id))),
    marks: downsample(marks, 400),
    events,
    actions: actionsFor(fund.status, fund.mode),
    graduation,
    predecessorId: fund.predecessor_id,
    successorId: (successorRead.data as { id: string } | null)?.id ?? null,
    finalReport: fund.final_report === null ? null : (fund.final_report as unknown as FundStats),
  };
}

/** The fund's statement as CSV: every mark, flow and trade, in time order. */
export async function fundStatement(userId: string, id: string): Promise<string | null> {
  const fund = await readFund(userId, id);
  if (fund === null) return null;
  const snap = await snapshot(fund);
  if (snap === null) return null;
  const marks = await readMarks(fund, 20_000);
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    /* A leading = + - @ would be read as a formula by a spreadsheet. */
    const safe = /^[=+\-@]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows: string[][] = [];
  for (const mark of marks) rows.push([mark.at, "mark", "", "", "", mark.nav.toFixed(2), mark.npu.toFixed(6), "", ""]);
  for (const flow of snap.flows) {
    rows.push([flow.created_at, flow.kind, "", "", n(flow.amount_usd).toFixed(2), "", n(flow.npu).toFixed(6), n(flow.units).toFixed(6), ""]);
  }
  for (const row of snap.closed) {
    const trade = toTrade(row);
    rows.push([trade.closedAt, "trade", trade.coin, trade.side, "", "", "", "", trade.realisedUsd.toFixed(4)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const header = ["at", "type", "coin", "side", "amount_usd", "nav_usd", "nav_per_unit", "units", "realised_pnl_usd"];
  return [header, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}
