import "server-only";

import { randomUUID } from "node:crypto";
import { marketFor } from "@/lib/autotrade/rules";
import { openMarketTrade } from "@/lib/autotrade/trade";
import { recipientFor, send, type DeliveryReport, type Recipient } from "@/lib/notifications/deliver";
import { serviceClient } from "@/lib/supabase/server";
import { listingFeeds } from "@/lib/scout/announcements";
import { AUTOBUY_COINS, AUTOBUY_LIMITS, flowKey, listingKey, utcDay, wants, type DetectedSignal } from "@/lib/scout/autobuy";
import { ruleFromRow } from "@/lib/scout/autobuys";
import { coinForTicker, flowSignals } from "@/lib/scout/flows";
import { flowsFor } from "@/lib/scout/smartMoney";

/* ---------------------------------------------------------------------------
   The auto-buy pass, on the five-minute tick, after the automation pass.

   It does nothing — not even a read of Hyperliquid — unless someone has an
   active rule. Then it detects the signals the rules can want, and for each
   rule and signal that match:

     1. checks the rule's trades today against its `maxPerDay`;
     2. writes the fire FIRST, unique on (rule, signal key), so a signal seen
        again on the next tick, or by a second pass running at once, never
        trades twice;
     3. places the order through `openMarketTrade` — the chart ticket's own
        path, with `accountGate`, the live switch, and take-profit and
        stop-loss sent with the entry;
     4. records what happened, and tells the person when a trade opened.
--------------------------------------------------------------------------- */

/** Orders one pass may place, across everyone. The rest wait for the next tick. */
const FIRE_CAP = 20;

export interface ScoutReport {
  rules: number;
  signals: number;
  opened: number;
  refused: number;
  notes: string[];
}

async function detect(triggers: Set<string>, now: number, notes: string[]): Promise<DetectedSignal[]> {
  const signals: DetectedSignal[] = [];
  if (triggers.has("smart_money")) {
    const read = await flowsFor(AUTOBUY_LIMITS.flowWindowMs).catch((error: unknown) => {
      notes.push(error instanceof Error ? error.message : "Smart money could not be read.");
      return null;
    });
    for (const signal of read === null ? [] : flowSignals(read.flows)) {
      if (!AUTOBUY_COINS.includes(signal.coin)) continue;
      const label = marketFor(signal.coin)?.label ?? signal.coin;
      signals.push({
        key: flowKey(signal.coin, signal.side, now),
        trigger: "smart_money",
        coin: signal.coin,
        side: signal.side,
        wallets: signal.wallets,
        reason: `${signal.wallets} smart-money wallets opened ${signal.side === "long" ? "longs" : "shorts"} in ${label} in the last hour; ${signal.against} opened the other side.`,
        at: signal.lastAt,
      });
    }
  }
  if (triggers.has("listing")) {
    const feeds = await listingFeeds().catch(() => null);
    if (feeds === null || feeds.feeds.every((feed) => !feed.ok)) notes.push("No exchange listing feed answered.");
    for (const entry of feeds?.announcements ?? []) {
      if (entry.kind !== "listing" || now - entry.at > AUTOBUY_LIMITS.listingFreshMs || entry.at > now + 60_000) continue;
      for (const ticker of entry.tickers) {
        const coin = coinForTicker(ticker, AUTOBUY_COINS);
        if (coin === null) continue;
        signals.push({
          key: listingKey(entry.exchange, entry.id, coin),
          trigger: "listing",
          coin,
          side: "long",
          wallets: null,
          reason: `${entry.exchange} announced a listing in its own feed: "${entry.title.slice(0, 160)}".`,
          at: entry.at,
        });
      }
    }
  }
  return signals;
}

export async function runScoutTick(now: number = Date.now()): Promise<ScoutReport> {
  const report: ScoutReport = { rules: 0, signals: 0, opened: 0, refused: 0, notes: [] };
  const db = serviceClient();
  const { data, error } = await db.from("scout_rules").select("*").eq("status", "active");
  if (error !== null) {
    if (error.code !== "42P01" && error.code !== "PGRST205") report.notes.push("Could not read auto-buy rules.");
    return report;
  }
  const rules = ((data ?? []) as Array<Record<string, unknown>>).map(ruleFromRow);
  report.rules = rules.length;
  if (rules.length === 0) return report;

  const signals = await detect(new Set(rules.map((rule) => rule.trigger)), now, report.notes);
  report.signals = signals.length;
  if (signals.length === 0) return report;

  const dayStart = `${utcDay(now)}T00:00:00.000Z`;
  const firedToday = new Map<string, number>();
  const recipients = new Map<string, Promise<Recipient>>();
  const delivery: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  let placed = 0;

  for (const rule of rules) {
    for (const signal of signals) {
      if (placed >= FIRE_CAP) {
        report.notes.push("Fire cap reached; the rest wait for the next pass.");
        return report;
      }
      if (!wants(rule, signal)) continue;

      if (!firedToday.has(rule.id)) {
        const { count } = await db
          .from("scout_fires")
          .select("id", { count: "exact", head: true })
          .eq("rule_id", rule.id)
          .in("outcome", ["opened", "pending"])
          .gte("created_at", dayStart);
        firedToday.set(rule.id, count ?? 0);
      }
      if ((firedToday.get(rule.id) ?? 0) >= rule.maxPerDay) continue;

      const fireId = randomUUID();
      const claimed = await db.from("scout_fires").insert({
        id: fireId,
        rule_id: rule.id,
        user_id: rule.userId,
        signal_key: signal.key,
        trigger: signal.trigger,
        coin: signal.coin,
        side: signal.side,
        outcome: "pending",
        reason: signal.reason,
        position_id: null,
        created_at: new Date(now).toISOString(),
      });
      /* 23505: this rule already acted on this signal. */
      if (claimed.error !== null) continue;
      placed += 1;
      firedToday.set(rule.id, (firedToday.get(rule.id) ?? 0) + 1);

      const outcome = await openMarketTrade(
        rule.userId,
        { coin: signal.coin, side: signal.side, sizeUsd: rule.sizeUsd, leverage: rule.leverage, takeProfitPct: rule.takeProfitPct, stopLossPct: rule.stopLossPct, mode: rule.mode },
        { ruleName: `Auto-buy · ${rule.name}`, reason: signal.reason },
      ).catch((failure: unknown) => ({ ok: false as const, error: failure instanceof Error ? failure.message : "The order failed.", status: 500 }));

      if (outcome.ok) {
        report.opened += 1;
        await db.from("scout_fires").update({ outcome: "opened", position_id: outcome.position.id }).eq("id", fireId);
        try {
          if (!recipients.has(rule.userId)) recipients.set(rule.userId, recipientFor(rule.userId));
          const recipient = await (recipients.get(rule.userId) as Promise<Recipient>);
          const label = marketFor(signal.coin)?.label ?? signal.coin;
          await send(
            recipient,
            { inbox: true, push: recipient.devices.some((device) => device.disabled_at === null), telegram: recipient.chatId !== null },
            {
              kind: "system",
              title: `Auto-buy · ${label} ${signal.side}${rule.mode === "paper" ? " (paper)" : ""}`,
              lines: [rule.name, signal.reason, `Take-profit ${rule.takeProfitPct}% · stop-loss ${rule.stopLossPct}%.`],
              route: "/scout?tab=autobuys",
            },
            delivery,
          );
        } catch {
          report.notes.push(`could not notify ${rule.userId}`);
        }
      } else {
        report.refused += 1;
        firedToday.set(rule.id, Math.max(0, (firedToday.get(rule.id) ?? 1) - 1));
        await db.from("scout_fires").update({ outcome: "refused", reason: `${signal.reason} Not opened: ${outcome.error}` }).eq("id", fireId);
      }
    }
  }
  return report;
}
