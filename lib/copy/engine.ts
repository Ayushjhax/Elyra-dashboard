import "server-only";

import { closeTrade } from "@/lib/autotrade/close";
import { midPrice } from "@/lib/autotrade/hyperliquid";
import { num } from "@/lib/autotrade/store";
import { openMarketTrade } from "@/lib/autotrade/trade";
import { COPY_LIMITS, copyOrderFor, type FollowTerms } from "@/lib/copy/rules";
import { MIGRATION_NOTE, ensureHouse } from "@/lib/copy/store";
import { recipientFor, send, type DeliveryReport, type Recipient } from "@/lib/notifications/deliver";
import { serviceClient } from "@/lib/supabase/server";
import type { CopyFollowRow, TradingPositionRow, TradingRuleSetRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The copy pass. Run by the five-minute scheduler right after the
   automation pass (lib/autotrade/engine.ts), so a leader's entry or exit
   from this tick is copied in the same tick.

   1. Closes first. A copy whose leader's position has closed is closed
      through `closeTrade` — the one close path — whatever closed the
      leader: its target, its stop, its exit rule or its owner's hand. A
      copy whose own exits fire first was already closed by the automation
      pass. Stopping a copy only stops new entries: copies already open
      still close with the leader.
   2. Then entries. Each enabled follow copies its leader's entries made
      after it began, while they are fresh (`COPY_LIMITS.freshMs`) and while
      the leader still shares the set. `copyOrderFor` sizes the order to the
      follower and refuses it once the price has run too far; the order
      then goes through `openMarketTrade` — the one market-order path — so
      the follower's own limits (`accountGate`), the live switch and their
      approved key all apply, and the row is written before anything is
      sent. A leader entry is copied once per follow: the database holds
      the pair unique.

   Every copy and close reaches the follower like a rule's trade does —
   inbox, push and a linked Telegram chat — whatever their alert settings.
--------------------------------------------------------------------------- */

export interface CopyReport {
  follows: number;
  copied: number;
  closed: number;
  skipped: number;
  failed: number;
  notified: number;
  notes: string[];
}

const px = (value: number) => `$${Number(value.toPrecision(6))}`;
const usd = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export async function runCopy(now: number = Date.now()): Promise<CopyReport> {
  const report: CopyReport = { follows: 0, copied: 0, closed: 0, skipped: 0, failed: 0, notified: 0, notes: [] };
  const house = await ensureHouse().catch((error: unknown) => (error instanceof Error ? error.message : "house"));
  if (house === MIGRATION_NOTE) {
    report.notes.push(house);
    return report;
  }
  if (house !== null) report.notes.push(house);

  const db = serviceClient();
  const [followsRead, copiesRead] = await Promise.all([
    db.from("copy_follows").select("*").eq("enabled", true),
    db.from("trading_positions").select("*").eq("origin", "copy").eq("status", "open"),
  ]);
  if (followsRead.error !== null || copiesRead.error !== null) {
    report.notes.push("Could not read copies.");
    return report;
  }
  const follows = (followsRead.data ?? []) as CopyFollowRow[];
  const copies = (copiesRead.data ?? []) as TradingPositionRow[];
  report.follows = follows.length;

  /* ---- telling the follower ---- */
  const recipients = new Map<string, Promise<Recipient>>();
  const delivery: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  const notify = async (userId: string, title: string, lines: string[]) => {
    try {
      if (!recipients.has(userId)) recipients.set(userId, recipientFor(userId));
      const recipient = await (recipients.get(userId) as Promise<Recipient>);
      const channels = { inbox: true, push: recipient.devices.some((device) => device.disabled_at === null), telegram: recipient.chatId !== null };
      await send(recipient, channels, { kind: "system", title, lines, route: "/automation/copy" }, delivery);
      report.notified += 1;
    } catch {
      report.notes.push(`could not notify ${userId}`);
    }
  };

  /* ---- 1. closes ---- */
  const leaderIds = [...new Set(copies.map((row) => row.leader_position_id).filter((id): id is string => typeof id === "string"))];
  if (leaderIds.length > 0) {
    const { data } = await db.from("trading_positions").select("id, status").in("id", leaderIds);
    const closedLeaders = new Set((data ?? []).filter((row) => row.status === "closed").map((row) => row.id));
    for (const copy of copies) {
      if (copy.leader_position_id === null || copy.leader_position_id === undefined || !closedLeaders.has(copy.leader_position_id)) continue;
      try {
        const outcome = await closeTrade(copy.user_id, copy, "leader_closed");
        if (!outcome.ok) {
          report.notes.push(`copy ${copy.id}: ${outcome.error}`);
          continue;
        }
        report.closed += 1;
        const result = outcome.position.realisedPnlUsd;
        await notify(copy.user_id, `Copy closed · ${copy.coin}`, [
          `${copy.rule_name} (${copy.mode}): the leader closed, so your copy closed at ${px(outcome.position.exitPrice ?? outcome.position.entryPrice)}.`,
          result === null ? "" : `Result ${usd(result)} after fees.`,
        ]);
      } catch (error) {
        report.notes.push(`copy ${copy.id}: ${error instanceof Error ? error.message : "close failed"}`);
      }
    }
  }

  /* ---- 2. entries ---- */
  if (follows.length === 0) return report;
  const setIds = [...new Set(follows.map((follow) => follow.set_id))];
  const [setsRead, freshRead] = await Promise.all([
    db.from("trading_rule_sets").select("*").in("id", setIds),
    db
      .from("trading_positions")
      .select("*")
      .in("set_id", setIds)
      .eq("origin", "rule")
      .eq("status", "open")
      .gte("opened_at", new Date(now - COPY_LIMITS.freshMs).toISOString()),
  ]);
  const sets = new Map(((setsRead.data ?? []) as TradingRuleSetRow[]).map((set) => [set.id, set]));
  const fresh = (freshRead.data ?? []) as TradingPositionRow[];
  if (fresh.length === 0) return report;

  const copiedRead = await db.from("trading_positions").select("copy_id, leader_position_id").in("leader_position_id", fresh.map((row) => row.id));
  const done = new Set((copiedRead.data ?? []).map((row) => `${row.copy_id}:${row.leader_position_id}`));
  const handlesRead = await db.from("arena_profiles").select("user_id, handle").in("user_id", [...new Set([...sets.values()].map((set) => set.user_id))]);
  const handles = new Map((handlesRead.data ?? []).map((row) => [row.user_id, row.handle]));

  const mids = new Map<string, Promise<number | null>>();
  const mid = (coin: string) => {
    if (!mids.has(coin)) mids.set(coin, midPrice("mainnet", coin).catch(() => null));
    return mids.get(coin) as Promise<number | null>;
  };

  for (const follow of follows) {
    const set = sets.get(follow.set_id);
    const note = async (text: string) => {
      await db.from("copy_follows").update({ last_checked_at: new Date(now).toISOString(), last_note: text }).eq("id", follow.id);
    };
    if (set === undefined) continue;
    const entries = fresh.filter(
      (row) => row.set_id === set.id && row.user_id !== follow.user_id && Date.parse(row.opened_at) >= Date.parse(follow.created_at) && !done.has(`${follow.id}:${row.id}`),
    );
    if (entries.length === 0) continue;
    if (!set.published) {
      await note("The leader stopped sharing this set, so its new entries are not copied.");
      continue;
    }
    const handle = set.house ? null : (handles.get(set.user_id) ?? null);
    const leaderName = handle === null ? set.name : `@${handle} · ${set.name}`;
    const terms: FollowTerms = { sizeUsd: num(follow.size_usd), maxLeverage: follow.max_leverage, mode: follow.mode, maxDriftPct: num(follow.max_drift_pct) };

    for (const entry of entries) {
      try {
        const side = entry.side === "short" ? "short" : "long";
        const price = await mid(entry.coin);
        if (price === null) {
          await note(`Hyperliquid had no price for ${entry.coin}; will try again in five minutes.`);
          continue;
        }
        const planned = copyOrderFor(
          { coin: entry.coin, side, entryPrice: num(entry.entry_price), takeProfit: num(entry.take_profit), stopLoss: num(entry.stop_loss), leverage: entry.leverage },
          terms,
          price,
        );
        if ("skip" in planned) {
          report.skipped += 1;
          await note(`Did not copy ${entry.coin} ${side} from ${leaderName}: ${planned.skip}`);
          continue;
        }
        const outcome = await openMarketTrade(follow.user_id, planned.order, {
          ruleName: `Copy · ${leaderName}`,
          reason: `Copied from ${leaderName}${entry.entry_reason === null ? "." : `: ${entry.entry_reason}`}`,
          copy: { followId: follow.id, leaderPositionId: entry.id },
        });
        if (outcome.ok) {
          report.copied += 1;
          done.add(`${follow.id}:${entry.id}`);
          const position = outcome.position;
          await note(`Copied ${entry.coin} ${side} from ${leaderName} at ${px(position.entryPrice)}.`);
          await notify(follow.user_id, `Copied ${entry.coin} ${side}`, [
            `${leaderName} (${follow.mode}): ${side === "long" ? "bought" : "sold short"} ${usd(terms.sizeUsd)} of ${entry.coin} at ${px(position.entryPrice)}, ${planned.order.leverage}x.`,
            `TP ${px(position.takeProfit)}, SL ${px(position.stopLoss)}${follow.mode === "live" ? " are on Hyperliquid" : ""}. It closes when the leader closes.`,
          ]);
        } else if (outcome.status !== 409) {
          report.failed += 1;
          await note(`Did not copy ${entry.coin} ${side} from ${leaderName}: ${outcome.error}`);
          /* The exchange refusing a live order is worth a message; a limit of the follower's own is in the note. */
          if (outcome.status >= 500) await notify(follow.user_id, `Copy failed · ${entry.coin}`, [`${leaderName}: ${outcome.error}`]);
        }
      } catch (error) {
        report.notes.push(`follow ${follow.id}: ${error instanceof Error ? error.message : "copy failed"}`);
      }
    }
  }
  return report;
}
