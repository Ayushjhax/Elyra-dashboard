import "server-only";

import { closeTrade } from "@/lib/autotrade/close";
import { hourBucket } from "@/lib/funds/accounting";
import { readMarks, snapshot, statsFor, type FundSnapshot } from "@/lib/funds/store";
import type { FundBook, FundStatus } from "@/lib/funds/types";
import { notifyOwner } from "@/lib/rails/notify";
import { appendLedger } from "@/lib/rails/store";
import { serviceClient } from "@/lib/supabase/server";
import type { AiFundRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The steps a fund's life is made of, shared by the person's actions
   (lib/funds/owner.ts) and the five-minute pass (lib/funds/run.ts):
   closing every position, writing a mark, and closing the fund out with its
   final report.

   Every status change is a compare-and-set on the status it expects
   (`.eq("status", …)`), so the person winding a fund down and the pass
   halting it in the same second cannot both win.
--------------------------------------------------------------------------- */

export const fundRoute = (id: string) => `/funds/${id}`;

const usd = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** Closes every open position in the fund now. "Opening" rows are left for the pass to settle. */
export async function flatten(snap: FundSnapshot, reason: string): Promise<{ closed: number; failed: string[] }> {
  let closed = 0;
  const failed: string[] = [];
  for (const row of snap.open) {
    if (row.status !== "open") {
      failed.push(`${row.coin}: its entry is still being confirmed.`);
      continue;
    }
    const outcome = await closeTrade(snap.fund.user_id, row, reason).catch(() => ({ ok: false as const, error: "could not be closed", status: 503 }));
    if (outcome.ok) {
      closed += 1;
      await appendLedger(snap.fund.user_id, {
        actor: "elyra",
        event: "fund.position_closed",
        subjectId: snap.fund.id,
        body: {
          positionId: row.id,
          coin: row.coin,
          side: row.side,
          exitPrice: outcome.position.exitPrice,
          realisedUsd: outcome.position.realisedPnlUsd,
          reason,
        },
      });
    } else failed.push(`${row.coin}: ${outcome.error}`);
  }
  return { closed, failed };
}

/** The book at this hour. The first mark of an hour stands; later ones in it are dropped. */
export async function writeMark(fund: AiFundRow, book: FundBook, now: number): Promise<void> {
  await serviceClient()
    .from("ai_fund_marks")
    .upsert(
      {
        fund_id: fund.id,
        user_id: fund.user_id,
        bucket: hourBucket(now),
        nav: Number(book.navUsd.toFixed(4)),
        npu: Number(book.npu.toFixed(6)),
        gross_usd: Number(book.grossUsd.toFixed(4)),
        positions: book.openPositions,
      },
      { onConflict: "fund_id,bucket", ignoreDuplicates: true },
    );
}

/**
 * Closes the fund out once it is flat: its final NAV and record frozen in
 * `final_report`, a last mark, a ledger event and a notice. Returns the
 * closed row, or null while positions remain (or another writer moved the
 * status first).
 */
export async function closeOut(
  fund: AiFundRow,
  reason: "wound_down" | "graduated",
  from: readonly FundStatus[],
  now: number = Date.now(),
): Promise<AiFundRow | null> {
  const snap = await snapshot(fund, now);
  if (snap === null || snap.open.length > 0) return null;
  const stats = statsFor(snap, await readMarks(fund), now);
  const at = new Date(now).toISOString();
  const { data } = await serviceClient()
    .from("ai_funds")
    .update({
      status: "closed",
      closed_reason: reason,
      final_report: { ...stats, navUsd: snap.book.navUsd, npu: snap.book.npu },
      last_nav: Number(snap.book.navUsd.toFixed(4)),
      last_npu: Number(snap.book.npu.toFixed(6)),
      marked_at: at,
      closed_at: at,
      updated_at: at,
    })
    .eq("id", fund.id)
    .eq("user_id", fund.user_id)
    .in("status", [...from])
    .select("*")
    .maybeSingle();
  const closed = (data as AiFundRow | null) ?? null;
  if (closed === null) return null;
  await writeMark(closed, snap.book, now);
  await appendLedger(fund.user_id, {
    actor: "elyra",
    event: "fund.closed",
    subjectId: fund.id,
    body: {
      reason,
      navUsd: Number(snap.book.navUsd.toFixed(2)),
      npu: Number(snap.book.npu.toFixed(4)),
      returnPct: Number(stats.returnPct.toFixed(2)),
      maxDrawdownPct: Number(stats.maxDrawdownPct.toFixed(2)),
      trades: stats.trades,
    },
  });
  if (reason === "wound_down") {
    await notifyOwner(
      fund.user_id,
      `Fund closed · ${fund.name}`,
      [`Every position is closed. Final NAV ${usd(snap.book.navUsd)}, ${stats.returnPct >= 0 ? "+" : ""}${stats.returnPct.toFixed(2)}% since launch.`, "Its record stays in Funds and in your ledger."],
      fundRoute(fund.id),
    );
  }
  return closed;
}
