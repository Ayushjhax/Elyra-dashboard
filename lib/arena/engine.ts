import "server-only";

import { brierScore, settleBacking, settleCall, type CallStatus } from "@/lib/arena/calls";
import { LABEL_TEXT, fallbackCoaching, factLines, labelTrade, reviewFacts } from "@/lib/arena/review";
import { writeFromFacts } from "@/lib/arena/writer";
import { hyperliquidCandles } from "@/lib/autotrade/hyperliquid";
import { marketFor } from "@/lib/autotrade/rules";
import { num } from "@/lib/autotrade/store";
import { recipientFor, send, type DeliveryReport, type Recipient } from "@/lib/notifications/deliver";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Arena's part of the five-minute tick, after the trading pass:

     1. review trades that have closed and have no review yet;
     2. settle calls whose time has come, at Hyperliquid's one-minute close
        for that minute — or void them if no price exists for it;
     3. write the card for settled calls that have none.

   Each step is capped per run: the model is paid per call, and a backlog
   clears over a few ticks rather than in one long, expensive pass. A
   failure in one item never stops the rest.
--------------------------------------------------------------------------- */

export const REVIEW_CAP = 4;
export const CARD_CAP = 4;
export const SETTLE_CAP = 40;
/** A one-minute bar is final a little after it closes. */
const SETTLE_DELAY_MS = 2 * 60_000;
/** Hyperliquid serves about 3.5 days of one-minute bars; past that, a missed settlement is void. */
const VOID_AFTER_MS = 3 * 24 * 60 * 60_000;

export interface ArenaReport {
  reviewed: number;
  settled: number;
  voided: number;
  cards: number;
  notes: string[];
}

export async function runArena(now: number = Date.now()): Promise<ArenaReport> {
  const report: ArenaReport = { reviewed: 0, settled: 0, voided: 0, cards: 0, notes: [] };
  const db = serviceClient();

  const recipients = new Map<string, Promise<Recipient>>();
  const delivery: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  const notify = async (userId: string, title: string, lines: string[]) => {
    try {
      if (!recipients.has(userId)) recipients.set(userId, recipientFor(userId));
      const recipient = await (recipients.get(userId) as Promise<Recipient>);
      await send(
        recipient,
        { inbox: true, push: recipient.devices.some((device) => device.disabled_at === null), telegram: recipient.chatId !== null },
        { kind: "system", title, lines, route: "/notifications" },
        delivery,
      );
    } catch {
      report.notes.push(`could not notify ${userId}`);
    }
  };

  /* ---- 1. trade reviews ---- */
  const closed = await db
    .from("trading_positions")
    .select("*")
    .eq("status", "closed")
    .gte("closed_at", new Date(now - 14 * 86_400_000).toISOString())
    .order("closed_at", { ascending: false })
    .limit(60);
  if (closed.error === null && (closed.data ?? []).length > 0) {
    const rows = closed.data ?? [];
    const done = await db.from("trade_reviews").select("position_id").in("position_id", rows.map((row) => row.id));
    if (done.error === null) {
      const reviewed = new Set((done.data ?? []).map((row) => row.position_id));
      const pending = rows.filter((row) => !reviewed.has(row.id) && row.exit_price !== null && row.realised_pnl_usd !== null && row.closed_at !== null).slice(0, REVIEW_CAP);
      for (const row of pending) {
        try {
          const opened = Date.parse(row.opened_at);
          const closedAt = Date.parse(row.closed_at as string);
          const interval = closedAt - opened < 50 * 86_400_000 ? "15m" : "1h";
          const bars = (await hyperliquidCandles(row.coin, interval, opened, closedAt).catch(() => [])).filter(
            (bar) => bar.closeTime > opened && bar.openTime < closedAt,
          );
          const facts = reviewFacts(
            {
              side: row.side === "short" ? "short" : "long",
              coin: marketFor(row.coin)?.label ?? row.coin,
              mode: row.mode,
              size: num(row.size),
              entryPrice: num(row.entry_price),
              exitPrice: num(row.exit_price),
              takeProfit: num(row.take_profit),
              stopLoss: num(row.stop_loss),
              leverage: row.leverage,
              exitReason: row.exit_reason,
              realisedPnlUsd: num(row.realised_pnl_usd),
              openedAt: row.opened_at,
              closedAt: row.closed_at as string,
            },
            bars,
          );
          const label = labelTrade(facts);
          const lines = factLines(facts, label);
          const coaching = await writeFromFacts(
            "Write the coaching for this trade review: how the trade was played against its plan, and the one thing it shows.",
            lines,
            fallbackCoaching(facts, label),
          );
          const inserted = await db.from("trade_reviews").insert({
            user_id: row.user_id,
            position_id: row.id,
            label,
            facts,
            coaching: coaching.text,
            coaching_model: coaching.model,
          });
          if (inserted.error !== null) continue;
          report.reviewed += 1;
          if (label === "brilliant" || label === "blunder") {
            await notify(row.user_id, `${LABEL_TEXT[label]} · ${facts.coin} ${facts.side}`, [coaching.text]);
          }
        } catch (error) {
          report.notes.push(`review ${row.id}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }
    }
  }

  /* ---- 2. settle calls ---- */
  const due = await db
    .from("arena_calls")
    .select("*")
    .eq("status", "open")
    .lt("resolves_at", new Date(now - SETTLE_DELAY_MS).toISOString())
    .order("resolves_at", { ascending: true })
    .limit(SETTLE_CAP);
  for (const call of due.data ?? []) {
    try {
      const at = Date.parse(call.resolves_at);
      const bars = await hyperliquidCandles(call.market, "1m", at - 10 * 60_000, at + 60_000).catch(() => []);
      /* The close of the minute that ends at the resolution time. */
      const bar = bars.filter((candidate) => candidate.closeTime < at).at(-1);
      let status: CallStatus;
      let settledPrice: number | null = null;
      if (bar === undefined || at - bar.closeTime > 5 * 60_000) {
        if (now - at < VOID_AFTER_MS) continue;
        status = "void";
      } else {
        settledPrice = bar.close;
        status = settleCall({ direction: call.direction, price: num(call.price) }, bar.close);
      }
      await db
        .from("arena_calls")
        .update({
          status,
          settled_price: settledPrice,
          settled_source: settledPrice === null ? "No Hyperliquid price for that minute" : "Hyperliquid one-minute close",
          settled_at: new Date(now).toISOString(),
          brier: status === "void" ? null : brierScore(call.confidence, status === "hit"),
        })
        .eq("id", call.id)
        .eq("status", "open");
      const backings = await db.from("arena_call_backings").select("*").eq("call_id", call.id);
      for (const backing of backings.data ?? []) {
        await db.from("arena_call_backings").update({ settled_points: settleBacking(backing.stance, backing.points, status) }).eq("id", backing.id);
      }
      if (status === "void") report.voided += 1;
      else report.settled += 1;
      await notify(call.user_id, status === "hit" ? "Your call hit" : status === "miss" ? "Your call missed" : "Your call was voided", [
        call.statement,
        settledPrice === null ? "No price existed for that minute, so it does not count." : `It settled at $${Number(settledPrice.toPrecision(6))}.`,
      ]);
    } catch (error) {
      report.notes.push(`call ${call.id}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  /* ---- 3. cards ---- */
  const uncarded = await db
    .from("arena_calls")
    .select("*")
    .in("status", ["hit", "miss"])
    .is("card", null)
    .order("settled_at", { ascending: false })
    .limit(CARD_CAP);
  for (const call of uncarded.data ?? []) {
    try {
      const hit = call.status === "hit";
      const settled = num(call.settled_price);
      const facts = [
        `Call: ${call.statement}`,
        `Outcome: ${hit ? "hit" : "missed"}`,
        `Settled at $${Number(settled.toPrecision(6))} (${call.settled_source})`,
        `Brier score ${num(call.brier).toFixed(2)}, where 0 is perfect and a 50% call scores 0.25`,
      ];
      const fallback = hit
        ? `Called it: ${call.statement}. It settled at $${Number(settled.toPrecision(6))}, and the confidence held up.`
        : `Here lies a call: ${call.statement}. It settled at $${Number(settled.toPrecision(6))}. The receipt stays.`;
      const card = await writeFromFacts(
        hit ? "Write a short, dry hit card celebrating this call that came true." : "Write a short, dry, affectionate eulogy for this call that did not come true.",
        facts,
        fallback,
      );
      await db.from("arena_calls").update({ card: card.text, card_model: card.model }).eq("id", call.id);
      report.cards += 1;
    } catch (error) {
      report.notes.push(`card ${call.id}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  return report;
}
