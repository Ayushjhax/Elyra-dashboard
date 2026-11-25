import "server-only";

import { marketFor } from "@/lib/autotrade/rules";
import { utcDay } from "@/lib/funds/accounting";
import { closeOut, flatten, fundRoute, writeMark } from "@/lib/funds/lifecycle";
import { closedElsewhere, FUND_EXIT, n, snapshot, tablesMissing, toTrade } from "@/lib/funds/store";
import { notifyOwner } from "@/lib/rails/notify";
import { appendLedger } from "@/lib/rails/store";
import { serviceClient } from "@/lib/supabase/server";
import type { AiFundRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The funds pass — Elyra as each fund's administrator and risk officer, on
   the five-minute tick, after the automation pass has recorded any
   take-profit or stop-loss that fired (lib/autotrade/engine.ts).

   For every open fund, oldest mark first, at most FUND_CAP a run:

     1. Mark the book to market (lib/funds/store.ts `snapshot`).
     2. Ledger any of its positions that closed on their own since the last
        mark — a take-profit, a stop-loss, a close by hand on Automation.
     3. On a new UTC day, seal the closing NAV into the ledger and start the
        day's loss count again.
     4. Raise the high-water mark. At the charter's drawdown limit, halt the
        fund and close every position. Nothing new opens until the person
        resumes it.
     5. A fund winding down: close what is left; once flat, close it out.
     6. Write the hour's mark and the fund's latest NAV.

   A fund that fails one step is left for the next tick; the others go on.
--------------------------------------------------------------------------- */

export const FUND_CAP = 50;

export interface FundsReport {
  marked: number;
  halted: number;
  closed: number;
  notes: string[];
}

export async function runFunds(now: number = Date.now()): Promise<FundsReport> {
  const report: FundsReport = { marked: 0, halted: 0, closed: 0, notes: [] };
  const db = serviceClient();
  const read = await db
    .from("ai_funds")
    .select("*")
    .in("status", ["active", "paused", "halted", "winding_down"])
    .order("marked_at", { ascending: true })
    .limit(FUND_CAP);
  if (read.error !== null) {
    report.notes.push(tablesMissing(read.error) ? "Migration 0025 is not applied; funds are idle." : "Could not read funds.");
    return report;
  }

  for (const row of (read.data ?? []) as AiFundRow[]) {
    try {
      await markOne(row, now, report);
    } catch (error) {
      report.notes.push(`fund ${row.id}: ${error instanceof Error ? error.message : "pass failed"}`);
    }
  }
  return report;
}

async function markOne(initial: AiFundRow, now: number, report: FundsReport): Promise<void> {
  let fund = initial;
  let snap = await snapshot(fund, now);
  if (snap === null) {
    report.notes.push(`fund ${fund.id}: book unreadable`);
    return;
  }

  /* 2. Closes that happened without the funds module: into the ledger once,
     by the window since the last mark. */
  const since = fund.marked_at ?? fund.created_at;
  const until = new Date(now).toISOString();
  for (const row of snap.closed) {
    if (row.closed_at === null || row.closed_at <= since || row.closed_at > until || !closedElsewhere(row.exit_reason)) continue;
    const trade = toTrade(row);
    await appendLedger(fund.user_id, {
      actor: "elyra",
      event: "fund.position_closed",
      subjectId: fund.id,
      body: { positionId: row.id, coin: row.coin, side: row.side, exitPrice: trade.exitPrice, realisedUsd: trade.realisedUsd, reason: row.exit_reason },
    });
  }

  /* 3. A new UTC day: the previous one's close, sealed. */
  const today = utcDay(now);
  let dayStartNpu = n(fund.day_start_npu);
  if (fund.day_start_on !== today) {
    if (fund.day_start_on !== null) {
      await appendLedger(fund.user_id, {
        actor: "elyra",
        event: "fund.nav",
        subjectId: fund.id,
        body: { day: fund.day_start_on, navUsd: Number(snap.book.navUsd.toFixed(2)), npu: Number(snap.book.npu.toFixed(6)), units: Number(snap.book.units.toFixed(6)), positions: snap.open.length },
      });
    }
    dayStartNpu = snap.book.npu;
  }

  /* 4. The drawdown limit. */
  const highWaterMark = Math.max(n(fund.hwm_npu) || snap.book.npu, snap.book.npu);
  const drawdownPct = (1 - snap.book.npu / highWaterMark) * 100;
  if ((fund.status === "active" || fund.status === "paused") && drawdownPct >= snap.charter.maxDrawdownPct) {
    const reason = `Down ${drawdownPct.toFixed(2)}% from its high-water mark, at the charter's ${snap.charter.maxDrawdownPct}% limit.`;
    const { data } = await serviceClient()
      .from("ai_funds")
      .update({ status: "halted", halt_reason: reason, updated_at: until })
      .eq("id", fund.id)
      .eq("user_id", fund.user_id)
      .eq("status", fund.status)
      .select("*")
      .maybeSingle();
    if (data !== null && data !== undefined) {
      fund = data as AiFundRow;
      report.halted += 1;
      const result = await flatten(snap, FUND_EXIT.halt);
      await appendLedger(fund.user_id, {
        actor: "elyra",
        event: "fund.halted",
        subjectId: fund.id,
        body: { drawdownPct: Number(drawdownPct.toFixed(2)), limitPct: snap.charter.maxDrawdownPct, npu: Number(snap.book.npu.toFixed(4)), highWaterMark: Number(highWaterMark.toFixed(4)), closed: result.closed, stillOpen: result.failed },
      });
      const coins = snap.open.map((row) => marketFor(row.coin)?.label ?? row.coin);
      await notifyOwner(
        fund.user_id,
        `${fund.name} halted`,
        [
          reason,
          coins.length > 0 ? `Elyra closed ${coins.join(", ")}${result.failed.length > 0 ? `; ${result.failed.length} could not be closed yet and will be retried` : ""}.` : "It held no positions.",
          "It opens nothing until you resume it.",
        ],
        fundRoute(fund.id),
      );
      snap = (await snapshot(fund, now)) ?? snap;
    }
  }

  /* A halted fund that still holds something — a close that failed — keeps trying. */
  if (fund.status === "halted" && snap.open.some((row) => row.status === "open")) {
    await flatten(snap, FUND_EXIT.halt);
    snap = (await snapshot(fund, now)) ?? snap;
  }

  /* 5. Winding down. */
  if (fund.status === "winding_down") {
    if (snap.open.length > 0) {
      await flatten(snap, FUND_EXIT.windDown);
      snap = (await snapshot(fund, now)) ?? snap;
    }
    const closed = await closeOut(fund, "wound_down", ["winding_down"], now);
    if (closed !== null) {
      report.closed += 1;
      report.marked += 1;
      return;
    }
  }

  /* 6. The mark. The high-water mark is written only when it rose, so a
     resume that restarted it while this pass ran is not undone. */
  await writeMark(fund, snap.book, now);
  await serviceClient()
    .from("ai_funds")
    .update({
      last_nav: Number(snap.book.navUsd.toFixed(4)),
      last_npu: Number(snap.book.npu.toFixed(6)),
      marked_at: until,
      day_start_npu: Number(dayStartNpu.toFixed(6)),
      day_start_on: today,
      ...(snap.book.npu > n(fund.hwm_npu) ? { hwm_npu: Number(snap.book.npu.toFixed(6)) } : {}),
    })
    .eq("id", fund.id)
    .eq("user_id", fund.user_id);
  report.marked += 1;
  if (snap.book.stale) report.notes.push(`fund ${fund.id}: marked at entry for a coin with no price`);
}
