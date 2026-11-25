import "server-only";

import { createHash } from "node:crypto";
import type { AgentAuth } from "@/lib/agentApi/keys";
import { closeTrade } from "@/lib/autotrade/close";
import { validateMarketOrder } from "@/lib/autotrade/orders";
import { marketFor } from "@/lib/autotrade/rules";
import { openMarketTrade } from "@/lib/autotrade/trade";
import { fundRoute } from "@/lib/funds/lifecycle";
import { checkOrder, FUND_LIMITS, STATUS_WORD } from "@/lib/funds/policy";
import { FUND_EXIT, fundForKey, n, snapshot, toTrade, type FundSnapshot } from "@/lib/funds/store";
import { oneAtATime } from "@/lib/queue";
import { notifyOwner } from "@/lib/rails/notify";
import { appendLedger, type Actor } from "@/lib/rails/store";
import { serviceClient } from "@/lib/supabase/server";
import type { AiFundRow, TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The manager's side of a fund: what an AI agent may do with the key that
   manages it. It reads the book, opens and closes positions, and keeps a
   journal — nothing else. It cannot add or remove capital, change the
   charter, choose paper or live, or touch any other fund or account.

   Every open is held to the charter (`checkOrder`) on a fresh mark, then to
   the trading limits (`validateMarketOrder`) and the account's own
   (`accountGate`, inside `openMarketTrade`), and goes out through the same
   order path as a trade by hand, with its take-profit and stop-loss in the
   same request. One fund's orders run one at a time on an instance, and
   the database holds one open position per coin per fund.

   Every decision — refusals included — goes into the owner's ledger, and
   the receipt the manager gets back is that event's hash. Its words (a
   thesis, a note) are stored as its words: shown as text, attributed to
   it, never acted on and never put in a notice.
--------------------------------------------------------------------------- */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const usd = (value: number) => `${value < 0 ? "-" : ""}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const px = (value: number) => `$${Number(value.toPrecision(6))}`;
const round = (value: number, places = 2) => Number(value.toFixed(places));

const NO_FUND = "This key manages no open fund. Its owner assigns it one in Elyra → Funds.";

async function managed(auth: AgentAuth, now: number): Promise<AiFundRow | null> {
  const fund = await fundForKey(auth.userId, auth.keyId);
  if (fund !== null && (fund.manager_seen_at === null || now - Date.parse(fund.manager_seen_at) > 60_000)) {
    /* A hint for the owner — "last checked in" — at most once a minute. */
    await serviceClient().from("ai_funds").update({ manager_seen_at: new Date(now).toISOString() }).eq("id", fund.id).eq("user_id", fund.user_id);
  }
  return fund;
}

const actor = (auth: AgentAuth): Actor => `agent:${auth.keyId}`;

async function saveNote(fund: AiFundRow, auth: AgentAuth, body: string, positionId: string | null): Promise<{ id: string; receipt: string | null } | null> {
  const { data } = await serviceClient()
    .from("ai_fund_notes")
    .insert({ fund_id: fund.id, user_id: fund.user_id, key_id: auth.keyId, position_id: positionId, body })
    .select("id")
    .single();
  const id = (data as { id: string } | null)?.id;
  if (id === undefined) return null;
  /* The ledger seals the note's hash, not its words: the record proves what
     was written and when without repeating an agent's text. */
  const receipt = await appendLedger(fund.user_id, {
    actor: actor(auth),
    event: "fund.note",
    subjectId: fund.id,
    body: { noteId: id, positionId, sha256: createHash("sha256").update(body, "utf8").digest("hex"), chars: body.length },
  });
  return { id, receipt };
}

function noteText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length === 0 ? null : text.slice(0, FUND_LIMITS.maxNoteChars);
}

/** The book, as the manager reads it. */
export function overview(snap: FundSnapshot) {
  const { fund, charter, book, risk } = snap;
  return {
    fund: {
      id: fund.id,
      name: fund.name,
      status: fund.status,
      statusWords: STATUS_WORD[fund.status],
      mode: fund.mode,
      haltReason: fund.halt_reason,
      launchedAt: fund.created_at,
    },
    ownersBrief: fund.objective,
    charter: {
      markets: charter.markets,
      allowShorts: charter.allowShorts,
      maxPositionPctOfNav: charter.maxPositionPct,
      maxGrossExposureTimesNav: charter.maxGrossExposure,
      maxLeverage: charter.maxLeverage,
      maxOpenPositions: charter.maxPositions,
      haltAtDrawdownPct: charter.maxDrawdownPct,
      dailyLossLimitPct: charter.dailyLossPct,
    },
    book: {
      navUsd: round(book.navUsd),
      cashUsd: round(book.cashUsd),
      unrealisedUsd: round(book.unrealisedUsd),
      realisedUsd: round(book.realisedUsd),
      navPerUnit: round(book.npu, 4),
      highWaterMark: round(risk.highWaterMark, 4),
      returnSinceLaunchPct: round((book.npu / FUND_LIMITS.startingNpu - 1) * 100),
      drawdownPct: round(risk.drawdownPct),
      todayPct: round(risk.todayPct),
      grossExposureTimesNav: round(risk.grossExposure, 3),
      freeMarginUsd: round(Math.max(0, book.navUsd - book.marginUsd)),
      marksAreStale: book.stale,
    },
    canOpen: risk.blockers.length === 0,
    blockers: risk.blockers,
    maxNewPositionUsd: round(risk.maxNewPositionUsd),
    positions: snap.positions.map((position) => ({
      positionId: position.id,
      coin: position.coin,
      side: position.side,
      status: position.status,
      size: position.size,
      entryPrice: position.entryPrice,
      mark: position.mark,
      notionalUsd: round(position.notionalUsd),
      unrealisedUsd: round(position.unrealisedUsd),
      takeProfit: position.takeProfit,
      stopLoss: position.stopLoss,
      leverage: position.leverage,
      openedAt: position.openedAt,
    })),
    recentTrades: snap.closed.slice(0, 10).map((row) => {
      const trade = toTrade(row);
      return { coin: trade.coin, side: trade.side, entryPrice: trade.entryPrice, exitPrice: trade.exitPrice, realisedUsd: round(trade.realisedUsd), how: trade.exitReason, closedAt: trade.closedAt };
    }),
    rules:
      "Every position is a market order with a take-profit and a stop-loss, held to the charter, Elyra's trading limits ($12–$5,000, 1–5x, isolated) and the owner's account limits. " +
      `Elyra halts the fund and closes everything at a ${charter.maxDrawdownPct}% drawdown from its high. ` +
      (fund.mode === "paper" ? "This fund trades on paper at Hyperliquid's prices, after fees and slippage." : "This fund trades real money in the owner's own Hyperliquid account."),
  };
}

export async function fundOverview(auth: AgentAuth, now: number = Date.now()): Promise<Result<ReturnType<typeof overview>>> {
  const fund = await managed(auth, now);
  if (fund === null) return { ok: false, error: NO_FUND };
  const snap = await snapshot(fund, now);
  if (snap === null) return { ok: false, error: "The fund's book could not be read just now." };
  return { ok: true, value: overview(snap) };
}

export interface OpenOutcome {
  status: "opened" | "refused" | "failed";
  reasons: string[];
  position: { positionId: string; coin: string; side: string; size: number; entryPrice: number; takeProfit: number; stopLoss: number; mode: string } | null;
  receipt: string | null;
}

export function openFundPosition(auth: AgentAuth, args: Record<string, unknown>, now: number = Date.now()): Promise<Result<OpenOutcome>> {
  return oneAtATime(`fund-key:${auth.keyId}`, () => open(auth, args, now));
}

async function open(auth: AgentAuth, args: Record<string, unknown>, now: number): Promise<Result<OpenOutcome>> {
  const fund = await managed(auth, now);
  if (fund === null) return { ok: false, error: NO_FUND };

  const refuse = async (reasons: string[], order: Record<string, unknown>): Promise<Result<OpenOutcome>> => {
    const receipt = await appendLedger(fund.user_id, { actor: actor(auth), event: "fund.order_refused", subjectId: fund.id, body: { order, reasons } });
    return { ok: true, value: { status: "refused", reasons, position: null, receipt } };
  };

  /* The fund decides paper or live, never the manager. */
  const validated = validateMarketOrder({ ...args, mode: fund.mode });
  const asked = { coin: args.coin, side: args.side, sizeUsd: args.sizeUsd, leverage: args.leverage, takeProfitPct: args.takeProfitPct, stopLossPct: args.stopLossPct };
  if ("error" in validated) return refuse([validated.error], asked);
  const order = validated.order;

  const snap = await snapshot(fund, now);
  if (snap === null) return { ok: false, error: "The fund's book could not be read just now, so nothing was sent." };
  if (snap.book.stale) return refuse(["A position in the fund has no live price, so the book cannot be marked; nothing new until it can."], { ...order });
  const decision = checkOrder(snap.context, order);
  if (!decision.ok) return refuse(decision.reasons, { ...order });

  const outcome = await openMarketTrade(fund.user_id, order, {
    ruleName: fund.name,
    reason: "Opened by the fund's AI manager, inside its charter.",
    fundId: fund.id,
  });
  if (!outcome.ok) {
    const receipt = await appendLedger(fund.user_id, { actor: "elyra", event: "fund.order_failed", subjectId: fund.id, body: { order: { ...order }, error: outcome.error } });
    return { ok: true, value: { status: "failed", reasons: [outcome.error], position: null, receipt } };
  }

  const position = outcome.position;
  const receipt = await appendLedger(fund.user_id, {
    actor: actor(auth),
    event: "fund.position_opened",
    subjectId: fund.id,
    body: {
      positionId: position.id,
      coin: order.coin,
      side: order.side,
      sizeUsd: order.sizeUsd,
      leverage: order.leverage,
      entryPrice: position.entryPrice,
      takeProfit: position.takeProfit,
      stopLoss: position.stopLoss,
      mode: order.mode,
      navUsd: round(snap.book.navUsd),
    },
  });
  const thesis = noteText(args.thesis);
  if (thesis !== null) await saveNote(fund, auth, thesis, position.id);

  const label = marketFor(order.coin)?.label ?? order.coin;
  await notifyOwner(
    fund.user_id,
    `${fund.name} · ${order.side === "long" ? "Bought" : "Sold short"} ${label}`,
    [
      `${usd(order.sizeUsd)} at ${px(position.entryPrice)}, ${order.leverage}x (${order.mode}).`,
      `TP ${px(position.takeProfit)}, SL ${px(position.stopLoss)}.`,
    ],
    fundRoute(fund.id),
  );
  return {
    ok: true,
    value: {
      status: "opened",
      reasons: [],
      position: {
        positionId: position.id,
        coin: position.coin,
        side: position.side,
        size: position.size,
        entryPrice: position.entryPrice,
        takeProfit: position.takeProfit,
        stopLoss: position.stopLoss,
        mode: position.mode,
      },
      receipt,
    },
  };
}

export function closeFundPosition(auth: AgentAuth, args: Record<string, unknown>, now: number = Date.now()) {
  return oneAtATime(`fund-key:${auth.keyId}`, () => close(auth, args, now));
}

async function close(auth: AgentAuth, args: Record<string, unknown>, now: number): Promise<Result<{ closed: boolean; realisedUsd: number | null; exitPrice: number | null; receipt: string | null }>> {
  const fund = await managed(auth, now);
  if (fund === null) return { ok: false, error: NO_FUND };
  const id = typeof args.positionId === "string" ? args.positionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "`positionId` is not a position id. fund_overview lists them." };
  const { data } = await serviceClient().from("trading_positions").select("*").eq("id", id).eq("user_id", fund.user_id).eq("fund_id", fund.id).maybeSingle();
  const row = (data as TradingPositionRow | null) ?? null;
  if (row === null) return { ok: false, error: "This fund has no position with that id." };

  const outcome = await closeTrade(fund.user_id, row, FUND_EXIT.manager);
  if (!outcome.ok) return { ok: false, error: outcome.error };
  const receipt = await appendLedger(fund.user_id, {
    actor: actor(auth),
    event: "fund.position_closed",
    subjectId: fund.id,
    body: { positionId: row.id, coin: row.coin, side: row.side, exitPrice: outcome.position.exitPrice, realisedUsd: outcome.position.realisedPnlUsd, reason: FUND_EXIT.manager },
  });
  const reason = noteText(args.reason);
  if (reason !== null) await saveNote(fund, auth, reason, row.id);
  const pnl = outcome.position.realisedPnlUsd ?? 0;
  await notifyOwner(
    fund.user_id,
    `${fund.name} · Closed ${marketFor(row.coin)?.label ?? row.coin}`,
    [`The manager closed the ${row.side} at ${px(outcome.position.exitPrice ?? n(row.entry_price))}.`, `Result ${usd(pnl)} after fees.`],
    fundRoute(fund.id),
  );
  return { ok: true, value: { closed: true, realisedUsd: outcome.position.realisedPnlUsd, exitPrice: outcome.position.exitPrice, receipt } };
}

export async function writeFundNote(auth: AgentAuth, args: Record<string, unknown>, now: number = Date.now()): Promise<Result<{ noteId: string; receipt: string | null }>> {
  const fund = await managed(auth, now);
  if (fund === null) return { ok: false, error: NO_FUND };
  const text = noteText(args.text);
  if (text === null) return { ok: false, error: "Write the note in `text`." };
  const saved = await saveNote(fund, auth, text, null);
  if (saved === null) return { ok: false, error: "The note could not be saved just now." };
  return { ok: true, value: { noteId: saved.id, receipt: saved.receipt } };
}
