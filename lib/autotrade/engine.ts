import "server-only";

import { closePosition, fillsSince, hyperliquidCandles, midPrice, openPosition as openOnHyperliquid, orderStatus, positionSize } from "@/lib/autotrade/hyperliquid";
import { paperLimitFill } from "@/lib/autotrade/orders";
import {
  INTERVAL_MINUTES,
  closedBars,
  decide,
  exitPrices,
  mirrorCandles,
  netPnl,
  paperExit,
  paperFill,
  type AutotradeInterval,
  type Side,
} from "@/lib/autotrade/rules";
import { liveEnabled, num, readSettings, tablesMissing, toPosition, toRule, tradingNetwork } from "@/lib/autotrade/store";
import type { Candle } from "@/lib/backtest/intervals";
import { getStrategy } from "@/lib/backtest/strategies";
import { decryptSecret } from "@/lib/crypto/credentials";
import { recipientFor, send, type DeliveryReport, type Recipient } from "@/lib/notifications/deliver";
import { serviceClient } from "@/lib/supabase/server";
import type { TradingAgentRow, TradingOrderRow, TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The automation pass. Run by the five-minute scheduler, before delivery, so
   what it does reaches the person in the same tick (/api/notifications/deliver).

   1. Open positions first. Paper ones are checked against the bars since
      they opened for their take-profit and stop-loss. Live ones are asked of
      Hyperliquid: a position that is gone was closed by its exits (or by the
      person), and its result is read from the account's own fills.
   2. Then every enabled rule, on its latest closed bar (lib/autotrade/rules
      `decide`) — Hyperliquid's own bars, the market the rule trades. A short
      rule reads the mirrored chart. An entry writes its position row BEFORE
      any order is sent, under unique (rule_id, signal_at), so two
      overlapping ticks cannot both enter, and a tick that dies mid-order
      leaves a row to reconcile.

   Paper fills pay slippage and the taker fee (`PAPER_COSTS`), so a paper
   record is one a live account could have matched.

   Every entry, exit and failure is sent through the same channels as an
   alert — inbox, push, the linked Telegram chat — and is NOT subject to the
   alert preferences: it is money a rule the person set has just moved, as
   an order fill is. Every decision is also written to the rule
   (`last_note`), so the page says what Elyra saw on each check.
--------------------------------------------------------------------------- */

export interface AutotradeReport {
  rules: number;
  entered: number;
  exited: number;
  failed: number;
  notified: number;
  notes: string[];
}

const STALE_OPENING_MS = 10 * 60_000;

const usd = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const px = (value: number) => `$${Number(value.toPrecision(6))}`;

export async function runAutotrade(now: number = Date.now()): Promise<AutotradeReport> {
  const report: AutotradeReport = { rules: 0, entered: 0, exited: 0, failed: 0, notified: 0, notes: [] };
  const db = serviceClient();

  const [rulesRead, openRead, ordersRead] = await Promise.all([
    db.from("trading_rules").select("*").eq("enabled", true),
    db.from("trading_positions").select("*").in("status", ["opening", "open"]),
    db.from("trading_orders").select("*").eq("status", "open"),
  ]);
  if (rulesRead.error !== null || openRead.error !== null) {
    report.notes.push(tablesMissing(rulesRead.error ?? openRead.error) ? "Migration 0018 is not applied; automation is idle." : "Could not read rules.");
    return report;
  }

  const rules = (rulesRead.data ?? []).map((row) => ({ userId: row.user_id, ...toRule(row) }));
  const open = openRead.data ?? [];
  /* Missing before migration 0020: limit orders then simply do not exist. */
  const orders: TradingOrderRow[] = ordersRead.error === null ? (ordersRead.data ?? []) : [];
  report.rules = rules.length;
  if (rules.length === 0 && open.length === 0 && orders.length === 0) return report;

  const users = [...new Set([...rules.map((rule) => rule.userId), ...open.map((row) => row.user_id), ...orders.map((row) => row.user_id)])];
  const network = tradingNetwork();
  const live = liveEnabled();

  const agentsRead = await db.from("trading_agents").select("*").in("user_id", users);
  const agents = new Map<string, TradingAgentRow>((agentsRead.data ?? []).map((row) => [row.user_id, row]));
  const keyFor = (userId: string): `0x${string}` | null => {
    const agent = agents.get(userId);
    if (agent === undefined || agent.approved_at === null || agent.network !== network) return null;
    try {
      return decryptSecret(agent.agent_key, "api_secret") as `0x${string}`;
    } catch {
      return null;
    }
  };

  /* ---- telling the person ---- */
  const recipients = new Map<string, Promise<Recipient>>();
  const delivery: DeliveryReport = { scanned: 0, sent: 0, skipped: 0, errors: 0 };
  const notify = async (userId: string, title: string, lines: string[]) => {
    try {
      if (!recipients.has(userId)) recipients.set(userId, recipientFor(userId));
      const recipient = await (recipients.get(userId) as Promise<Recipient>);
      const channels = {
        inbox: true,
        push: recipient.devices.some((device) => device.disabled_at === null),
        telegram: recipient.chatId !== null,
      };
      await send(recipient, channels, { kind: "system", title, lines, route: "/notifications" }, delivery);
      report.notified += 1;
    } catch {
      report.notes.push(`could not notify ${userId}`);
    }
  };

  /* Candles from Hyperliquid, fetched once per coin, timeframe and length. */
  const candleCache = new Map<string, Promise<Candle[]>>();
  const candles = (coin: string, interval: AutotradeInterval, bars: number): Promise<Candle[]> => {
    const key = `${coin}:${interval}:${bars}`;
    if (!candleCache.has(key)) {
      const span = INTERVAL_MINUTES[interval] * 60_000;
      candleCache.set(
        key,
        hyperliquidCandles(coin, interval, now - bars * span, now).then(
          (rows) => closedBars(rows, now),
          () => [],
        ),
      );
    }
    return candleCache.get(key) as Promise<Candle[]>;
  };

  const sideOf = (row: TradingPositionRow): Side => (row.side === "short" ? "short" : "long");

  const close = async (row: TradingPositionRow, exitPrice: number, reason: string, pnl: number) => {
    await db
      .from("trading_positions")
      .update({ status: "closed", exit_price: exitPrice, exit_reason: reason, realised_pnl_usd: pnl, closed_at: new Date(now).toISOString() })
      .eq("id", row.id);
    report.exited += 1;
    const label = reason === "take_profit" ? "Take-profit hit" : reason === "stop_loss" ? "Stop-loss hit" : "Position closed";
    await notify(row.user_id, `${label} · ${row.coin}`, [
      `${row.rule_name} (${row.mode}, ${sideOf(row)}): closed at ${px(exitPrice)}.`,
      `Result ${usd(pnl)} after fees.`,
    ]);
  };

  /* ---- 0. limit orders ----
     A fill becomes a position row, which step 1 and later ticks then manage
     like any other: paper TP/SL against bars, live exits on Hyperliquid. */
  for (const order of orders) {
    try {
      const side: Side = order.side === "short" ? "short" : "long";
      const price = num(order.limit_price);
      const label = `Limit ${side} · ${order.coin}`;
      const record = async (fill: { entry: number; size: number; at: number; signalAt: string; network: string | null; cloids: { tp: string | null; sl: string | null } }) => {
        const inserted = await db
          .from("trading_positions")
          .insert({
            user_id: order.user_id,
            rule_id: null,
            rule_name: label,
            mode: order.mode,
            network: fill.network,
            side,
            coin: order.coin,
            size: Number(fill.size.toPrecision(8)),
            entry_price: fill.entry,
            take_profit: num(order.take_profit),
            stop_loss: num(order.stop_loss),
            signal_at: fill.signalAt,
            entry_reason: `Limit ${side} at ${px(price)} reached.`,
            tp_cloid: fill.cloids.tp,
            sl_cloid: fill.cloids.sl,
            status: "open",
            opened_at: new Date(fill.at).toISOString(),
            leverage: order.leverage,
            origin: "order",
          })
          .select("id")
          .single();
        await db
          .from("trading_orders")
          .update({ status: "filled", filled_at: new Date(fill.at).toISOString(), position_id: inserted.data?.id ?? null })
          .eq("id", order.id);
        report.entered += 1;
        await notify(order.user_id, `Limit order filled · ${order.coin}`, [
          `${side === "long" ? "Bought" : "Sold short"} at ${px(fill.entry)} (${order.mode}).`,
          `TP ${px(num(order.take_profit))}, SL ${px(num(order.stop_loss))}${order.mode === "live" ? " are on Hyperliquid" : ""}.`,
        ]);
      };

      if (order.mode === "paper") {
        const createdAt = Date.parse(order.created_at);
        const bar = paperLimitFill({ side, price, createdAt }, await candles(order.coin, "15m", 960));
        if (bar !== null) {
          await record({
            entry: price,
            size: num(order.size_usd) / price,
            at: Math.max(createdAt, bar.openTime),
            signalAt: new Date(bar.closeTime).toISOString(),
            network: null,
            cloids: { tp: null, sl: null },
          });
        }
        continue;
      }

      const agent = agents.get(order.user_id);
      const orderNetwork = (order.network ?? network) as typeof network;
      if (agent === undefined || order.entry_cloid === null) continue;
      const status = await orderStatus(orderNetwork, agent.account_address, order.entry_cloid);
      if (status.status === "filled") {
        await record({
          entry: status.limitPrice ?? price,
          size: status.filledSize ?? num(order.size_usd) / price,
          at: now,
          signalAt: new Date(now).toISOString(),
          network: orderNetwork,
          cloids: { tp: order.tp_cloid, sl: order.sl_cloid },
        });
      } else if (/canceled|rejected/i.test(status.status)) {
        await db
          .from("trading_orders")
          .update({ status: "cancelled", cancelled_at: new Date(now).toISOString(), error: `Hyperliquid reports it ${status.status}.` })
          .eq("id", order.id);
        await notify(order.user_id, `Limit order ended · ${order.coin}`, [`Hyperliquid reports the order ${status.status}. Nothing was opened.`]);
      }
    } catch (error) {
      report.notes.push(`order ${order.id}: ${error instanceof Error ? error.message : "check failed"}`);
    }
  }

  /* ---- 1. open positions ---- */
  for (const row of open) {
    const view = toPosition(row);
    const side = sideOf(row);
    try {
      if (row.status === "opening") {
        if (now - Date.parse(row.opened_at) > STALE_OPENING_MS) {
          await db
            .from("trading_positions")
            .update({ status: "failed", error: "The check stopped before Hyperliquid answered. Look at your Hyperliquid account to see whether it filled." })
            .eq("id", row.id);
          report.failed += 1;
          await notify(row.user_id, `Entry unconfirmed · ${row.coin}`, [`${row.rule_name}: Elyra could not confirm whether the order filled.`, "Check your Hyperliquid account."]);
        }
        continue;
      }
      if (row.mode === "paper") {
        const bars = await candles(row.coin, "15m", 960);
        const hit = paperExit(
          { side, entryPrice: view.entryPrice, takeProfit: view.takeProfit, stopLoss: view.stopLoss, openedAt: Date.parse(row.opened_at) },
          bars,
        );
        if (hit !== null) {
          const fill = paperFill(side, "exit", hit.price);
          await close(row, fill, hit.reason, netPnl(side, view.size, view.entryPrice, fill));
        }
        continue;
      }
      const agent = agents.get(row.user_id);
      const positionNetwork = (row.network ?? network) as typeof network;
      if (agent === undefined) continue;
      const size = await positionSize(positionNetwork, agent.account_address, row.coin);
      if (side === "long" ? size > 0 : size < 0) continue;
      /* A long is closed by sales ("A"), a short by buys ("B"). */
      const closing = side === "long" ? "A" : "B";
      const fills = (await fillsSince(positionNetwork, agent.account_address, Date.parse(row.opened_at))).filter(
        (fill) => fill.coin === row.coin && fill.side === closing,
      );
      const traded = fills.reduce((sum, fill) => sum + Number(fill.sz), 0);
      const exitPrice = traded > 0 ? fills.reduce((sum, fill) => sum + Number(fill.px) * Number(fill.sz), 0) / traded : view.entryPrice;
      const pnl = fills.reduce((sum, fill) => sum + Number(fill.closedPnl) - Number(fill.fee), 0);
      const reason =
        traded === 0 ? "closed_outside_elyra" : Math.abs(exitPrice - view.takeProfit) < Math.abs(exitPrice - view.stopLoss) ? "take_profit" : "stop_loss";
      await close(row, Number(exitPrice.toPrecision(6)), reason, pnl);
    } catch (error) {
      report.notes.push(`position ${row.id}: ${error instanceof Error ? error.message : "check failed"}`);
    }
  }

  /* ---- 2. rules ---- */
  const accounts = new Map<string, Awaited<ReturnType<typeof accountState>>>();
  async function accountState(userId: string) {
    const startOfDay = new Date(now);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [settings, today, openNow] = await Promise.all([
      readSettings(userId),
      db.from("trading_positions").select("realised_pnl_usd").eq("user_id", userId).gte("closed_at", startOfDay.toISOString()),
      db.from("trading_positions").select("id, rule_id, coin, mode, status").eq("user_id", userId).in("status", ["opening", "open"]),
    ]);
    const realisedTodayUsd = (today.data ?? []).reduce((sum, entry) => sum + (num(entry.realised_pnl_usd) || 0), 0);
    /* Resting live limit orders, by coin: Hyperliquid nets one position per
       coin, so a rule must not enter where an order may fill. */
    const liveOrderCoins = new Set(orders.filter((order) => order.user_id === userId && order.mode === "live").map((order) => order.coin));
    return { ...settings, realisedTodayUsd, openRows: openNow.data ?? [], liveOrderCoins };
  }

  for (const rule of rules) {
    const note = async (text: string, extra: Record<string, unknown> = {}) => {
      await db.from("trading_rules").update({ last_checked_at: new Date(now).toISOString(), last_note: text, ...extra }).eq("id", rule.id);
    };
    try {
      const strategy = getStrategy(rule.strategyId);
      if (strategy === null) {
        await note("Its strategy is no longer in the catalogue; it cannot run.");
        continue;
      }
      if (!accounts.has(rule.userId)) accounts.set(rule.userId, await accountState(rule.userId));
      const account = accounts.get(rule.userId)!;

      const warmup = Math.min(1_000, strategy.warmupFor(rule.params) + 50);
      const bars = await candles(rule.coin, rule.interval, warmup);
      if (bars.length === 0 || bars.length < strategy.warmupFor(rule.params)) {
        await note("Not enough price history was available on this check.");
        continue;
      }
      const signals = strategy.evaluate(rule.side === "short" ? mirrorCandles(bars) : bars, rule.params);
      const openRow = account.openRows.find((entry) => entry.rule_id === rule.id);
      const openPosition = openRow === undefined ? null : (open.find((row) => row.id === openRow.id) ?? null);

      const decision = decide({
        rule,
        bars,
        signals,
        open:
          openPosition === null
            ? null
            : {
                side: sideOf(openPosition),
                entryPrice: num(openPosition.entry_price),
                takeProfit: num(openPosition.take_profit),
                stopLoss: num(openPosition.stop_loss),
                openedAt: Date.parse(openPosition.opened_at),
              },
        account: {
          paused: account.paused,
          dailyLossLimitUsd: account.dailyLossLimitUsd,
          maxOpenPositions: account.maxOpenPositions,
          realisedTodayUsd: account.realisedTodayUsd,
          openPositions: account.openRows.length,
        },
      });

      if (decision.kind === "hold") {
        await note(decision.reason);
        continue;
      }

      if (decision.kind === "exit" && openPosition !== null) {
        const view = toPosition(openPosition);
        const side = sideOf(openPosition);
        if (view.mode === "paper") {
          const fill = paperFill(side, "exit", (await midPrice("mainnet", rule.coin)) ?? bars[bars.length - 1].close);
          await close(openPosition, fill, "exit_rule", netPnl(side, view.size, view.entryPrice, fill));
        } else {
          const key = keyFor(rule.userId);
          if (key === null) {
            await note("The exit rule fired, but Elyra's trading key is not approved on this network. Close it on Hyperliquid.");
            continue;
          }
          const result = await closePosition({ network, key, side, coin: rule.coin, size: view.size, cloids: { tp: openPosition.tp_cloid, sl: openPosition.sl_cloid } });
          if (result.ok) await close(openPosition, result.exitPrice, "exit_rule", netPnl(side, view.size, view.entryPrice, result.exitPrice));
          else {
            await note(`The exit rule fired but the closing order failed: ${result.error}`);
            continue;
          }
        }
        await note(decision.reason);
        continue;
      }

      if (decision.kind !== "enter") continue;

      /* ---- entering ---- */
      let key: `0x${string}` | null = null;
      if (rule.mode === "live") {
        if (!live) {
          await note("Signal on the latest bar, but live trading is switched off on this server. Nothing was sent.");
          continue;
        }
        key = keyFor(rule.userId);
        if (key === null) {
          await note(`Signal on the latest bar, but Elyra's trading key is not approved on Hyperliquid ${network}. Nothing was sent.`);
          continue;
        }
        /* Hyperliquid keeps one position per coin per account: two rules on
           one coin would share it, and one's stop would close the other's. */
        if (account.openRows.some((entry) => entry.mode === "live" && entry.coin === rule.coin)) {
          await note(`Another rule already holds ${rule.coin} live; Hyperliquid keeps one position per coin.`);
          continue;
        }
        if (account.liveOrderCoins.has(rule.coin)) {
          await note(`A live limit order on ${rule.coin} is resting; Hyperliquid keeps one position per coin, so this rule waits.`);
          continue;
        }
      }

      const mid = (await midPrice("mainnet", rule.coin)) ?? bars[bars.length - 1].close;
      const price = rule.mode === "paper" ? paperFill(rule.side, "entry", mid) : mid;
      const planned = exitPrices(rule.side, price, rule.takeProfitPct, rule.stopLossPct);
      const inserted = await db
        .from("trading_positions")
        .insert({
          user_id: rule.userId,
          rule_id: rule.id,
          rule_name: rule.name,
          mode: rule.mode,
          network: rule.mode === "live" ? network : null,
          side: rule.side,
          coin: rule.coin,
          size: Number((rule.sizeUsd / price).toPrecision(8)),
          entry_price: Number(price.toPrecision(8)),
          take_profit: Number(planned.takeProfit.toPrecision(8)),
          stop_loss: Number(planned.stopLoss.toPrecision(8)),
          signal_at: decision.barCloseAt,
          entry_reason: decision.reason,
          status: rule.mode === "live" ? "opening" : "open",
          opened_at: new Date(now).toISOString(),
          leverage: rule.leverage,
          origin: "rule",
        })
        .select("*")
        .single();
      if (inserted.error !== null || inserted.data === null) {
        await note("Already entered on this bar.", { last_signal_at: decision.barCloseAt });
        continue;
      }
      await note(decision.reason, { last_signal_at: decision.barCloseAt });
      account.openRows.push({ id: inserted.data.id, rule_id: rule.id, coin: rule.coin, mode: rule.mode, status: inserted.data.status });

      const verb = rule.side === "long" ? "Bought" : "Sold short";
      if (rule.mode === "paper") {
        report.entered += 1;
        await notify(rule.userId, `Paper entry · ${rule.coin} ${rule.side}`, [
          `${rule.name}: ${verb.toLowerCase()} ${usd(rule.sizeUsd)} at ${px(price)}.`,
          `TP ${px(planned.takeProfit)}, SL ${px(planned.stopLoss)}.`,
          decision.reason,
        ]);
        continue;
      }

      const result = await openOnHyperliquid({
        network,
        key: key as `0x${string}`,
        side: rule.side,
        coin: rule.coin,
        sizeUsd: rule.sizeUsd,
        leverage: rule.leverage,
        takeProfitPct: rule.takeProfitPct,
        stopLossPct: rule.stopLossPct,
        seed: `${rule.id}:${decision.barCloseAt}`,
      });
      if (result.ok) {
        await db
          .from("trading_positions")
          .update({
            status: "open",
            size: result.size,
            entry_price: result.entryPrice,
            take_profit: result.takeProfit,
            stop_loss: result.stopLoss,
            entry_cloid: result.cloids.entry,
            tp_cloid: result.cloids.tp,
            sl_cloid: result.cloids.sl,
          })
          .eq("id", inserted.data.id);
        report.entered += 1;
        await notify(rule.userId, `${verb} ${rule.coin}`, [
          `${rule.name}: ${result.size} ${rule.coin} at ${px(result.entryPrice)}, ${rule.leverage}x isolated.`,
          `TP ${px(result.takeProfit)} and SL ${px(result.stopLoss)} are on Hyperliquid.`,
        ]);
      } else {
        await db.from("trading_positions").update({ status: "failed", error: result.error }).eq("id", inserted.data.id);
        report.failed += 1;
        await notify(rule.userId, `Entry failed · ${rule.coin}`, [`${rule.name}: ${result.error}`, "Nothing is open."]);
      }
    } catch (error) {
      report.notes.push(`rule ${rule.id}: ${error instanceof Error ? error.message : "failed"}`);
      await note("This check failed; it will try again in five minutes.").catch(() => null);
    }
  }

  return report;
}
