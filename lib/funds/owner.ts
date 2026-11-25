import "server-only";

import { AgentKeyError, createAgentKey, revokeAgentKey } from "@/lib/agentApi/keys";
import { closeTrade } from "@/lib/autotrade/close";
import { accountValue } from "@/lib/autotrade/hyperliquid";
import { liveRefusal } from "@/lib/autotrade/liveGate";
import { dexOf } from "@/lib/autotrade/rules";
import { readAgent, tradingNetwork } from "@/lib/autotrade/store";
import { unitsFor, utcDay, withdrawable } from "@/lib/funds/accounting";
import { closeOut, flatten, fundRoute, writeMark } from "@/lib/funds/lifecycle";
import { actionsFor, charterChanges, editable, FUND_LIMITS, graduationCheck, validateCharter } from "@/lib/funds/policy";
import { charterColumns, FUND_EXIT, FUND_MIGRATION, n, readFund, snapshot, tablesMissing, toCharter } from "@/lib/funds/store";
import type { FundAction, FundCharter } from "@/lib/funds/types";
import { notifyOwner } from "@/lib/rails/notify";
import { appendLedger } from "@/lib/rails/store";
import { serviceClient } from "@/lib/supabase/server";
import type { AiFundRow, TradingPositionRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   The person's side of a fund — the investor and the board in one: launch
   it, write and change its charter, put capital in and take it out, choose
   its manager, pause it, resume it, wind it down, and graduate it from
   paper to live. Each change is written to the ledger with what it was
   before, so the record shows not only what the manager did but what it was
   allowed to do at the time.

   Capital is an allocation, never a transfer. A paper fund's is virtual. A
   live fund's is a slice of the person's own Hyperliquid account, and the
   live funds together may not claim more than that account holds; the
   money never leaves it, and Elyra's key there cannot withdraw.
--------------------------------------------------------------------------- */

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: string; status: number };

const fail = (error: string, status = 400): { ok: false; error: string; status: number } => ({ ok: false, error, status });
const usd = (value: number) => `$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const OPEN_STATUSES = ["active", "paused", "halted", "winding_down"] as const;

const amountOf = (value: unknown): number | null => {
  const amount = typeof value === "string" ? Number(value.replace(/[$,\s]/g, "")) : value;
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? Number(amount.toFixed(2)) : null;
};

/** A key the person owns, live, and free to manage this fund. */
async function managerKey(userId: string, keyId: unknown, fundId: string | null): Promise<{ ok: true; keyId: string } | { ok: false; error: string; status: number }> {
  if (typeof keyId !== "string" || !/^[0-9a-f-]{36}$/i.test(keyId)) return fail("Choose one of your agent keys.");
  const db = serviceClient();
  const { data: key } = await db.from("agent_keys").select("id").eq("id", keyId).eq("user_id", userId).is("revoked_at", null).maybeSingle();
  if (key === null || key === undefined) return fail("That agent key is not one of yours, or it was revoked.");
  const { data: busy } = await db.from("ai_funds").select("id, name").eq("user_id", userId).eq("key_id", keyId).in("status", [...OPEN_STATUSES]);
  const other = ((busy ?? []) as { id: string; name: string }[]).find((fund) => fund.id !== fundId);
  if (other !== undefined) return fail(`That key already manages ${other.name}. A key manages one fund at a time.`);
  return { ok: true, keyId };
}

/** What the live funds already claim of the Hyperliquid account, and what it holds. Fails closed. */
async function liveRoom(userId: string, markets: readonly string[], except: string | null): Promise<{ ok: true; freeUsd: number } | { ok: false; error: string; status: number }> {
  const refusal = await liveRefusal(userId);
  if (refusal !== null) return fail(refusal);
  const agent = await readAgent(userId);
  if (agent === null) return fail("Approve Elyra's trading key on Hyperliquid first.");
  const dexes = [...new Set(markets.map((coin) => dexOf(coin)).filter((dex): dex is string => dex !== null))];
  const value = await accountValue(tradingNetwork(), agent.accountAddress, dexes);
  if (value === null) return fail("Your Hyperliquid account could not be read, so live capital cannot be checked. Try again shortly.", 503);
  const { data } = await serviceClient().from("ai_funds").select("id, last_nav").eq("user_id", userId).eq("mode", "live").in("status", [...OPEN_STATUSES]);
  const claimed = ((data ?? []) as { id: string; last_nav: string | number | null }[])
    .filter((fund) => fund.id !== except)
    .reduce((sum, fund) => sum + Math.max(0, n(fund.last_nav) || 0), 0);
  return { ok: true, freeUsd: Math.max(0, value - claimed) };
}

/** Writes a new fund with its first units and first mark. */
async function insertFund(
  userId: string,
  charter: FundCharter,
  mode: "paper" | "live",
  capital: number,
  extra: { key_id?: string | null; predecessor_id?: string | null },
  now: number,
): Promise<AiFundRow | null> {
  const db = serviceClient();
  const at = new Date(now).toISOString();
  const { data, error } = await db
    .from("ai_funds")
    .insert({
      user_id: userId,
      ...charterColumns(charter),
      mode,
      status: "active",
      key_id: extra.key_id ?? null,
      predecessor_id: extra.predecessor_id ?? null,
      hwm_npu: FUND_LIMITS.startingNpu,
      day_start_npu: FUND_LIMITS.startingNpu,
      day_start_on: utcDay(now),
      last_nav: capital,
      last_npu: FUND_LIMITS.startingNpu,
      marked_at: at,
      created_at: at,
      updated_at: at,
    })
    .select("*")
    .single();
  if (error !== null || data === null) return null;
  const fund = data as AiFundRow;
  await db.from("ai_fund_flows").insert({
    fund_id: fund.id,
    user_id: userId,
    kind: "subscribe",
    amount_usd: capital,
    npu: FUND_LIMITS.startingNpu,
    units: unitsFor(capital, FUND_LIMITS.startingNpu),
    created_at: at,
  });
  await writeMark(
    fund,
    {
      navUsd: capital,
      cashUsd: capital,
      unrealisedUsd: 0,
      realisedUsd: 0,
      contributedUsd: capital,
      withdrawnUsd: 0,
      units: unitsFor(capital, FUND_LIMITS.startingNpu),
      npu: FUND_LIMITS.startingNpu,
      grossUsd: 0,
      marginUsd: 0,
      openPositions: 0,
      stale: false,
    },
    now,
  );
  return fund;
}

/* ---------------------------------------------------------------------------
   Launch
--------------------------------------------------------------------------- */

/**
 * Launches a fund on paper. Its manager is an existing key, a new key made
 * for it (shown once, here), or none yet.
 */
export async function launchFund(userId: string, input: Record<string, unknown>, now: number = Date.now()): Promise<Outcome<{ fund: AiFundRow; key: string | null }>> {
  const validated = validateCharter(input);
  if ("error" in validated) return fail(validated.error);
  const charter = validated.charter;
  const capital = amountOf(input.capitalUsd);
  if (capital === null || capital < FUND_LIMITS.minCapitalUsd || capital > FUND_LIMITS.maxPaperCapitalUsd) {
    return fail(`Starting capital must be ${usd(FUND_LIMITS.minCapitalUsd)} to ${usd(FUND_LIMITS.maxPaperCapitalUsd)}. Every fund starts on paper.`);
  }

  const db = serviceClient();
  const open = await db.from("ai_funds").select("id").eq("user_id", userId).in("status", [...OPEN_STATUSES]);
  if (open.error !== null) return fail(tablesMissing(open.error) ? FUND_MIGRATION : "Funds could not be read.", 503);
  if ((open.data ?? []).length >= FUND_LIMITS.maxOpenFunds) {
    return fail(`You can run ${FUND_LIMITS.maxOpenFunds} funds at once. Wind one down first.`);
  }

  let keyId: string | null = null;
  let newKey: string | null = null;
  if (typeof input.newKeyName === "string" && input.newKeyName.trim().length > 0) {
    try {
      const created = await createAgentKey(userId, { name: input.newKeyName, account: false });
      keyId = created.view.id;
      newKey = created.key;
    } catch (error) {
      return fail(error instanceof AgentKeyError ? error.message : "The manager's key could not be made.", error instanceof AgentKeyError ? error.status : 503);
    }
  } else if (input.keyId !== undefined && input.keyId !== null && input.keyId !== "") {
    const key = await managerKey(userId, input.keyId, null);
    if (!key.ok) return key;
    keyId = key.keyId;
  }

  const fund = await insertFund(userId, charter, "paper", capital, { key_id: keyId }, now);
  if (fund === null) {
    /* A key made for a fund that never existed is revoked, not left lying around. */
    if (newKey !== null && keyId !== null) await revokeAgentKey(userId, keyId).catch(() => undefined);
    return fail("The fund could not be saved.", 503);
  }
  await appendLedger(userId, {
    actor: "person",
    event: "fund.launched",
    subjectId: fund.id,
    body: { name: charter.name, mode: "paper", capitalUsd: capital, managerKeyId: keyId, charter: { ...charter, objective: `${charter.objective.length} characters` } },
  });
  return { ok: true, value: { fund, key: newKey } };
}

/* ---------------------------------------------------------------------------
   The charter, the manager, capital
--------------------------------------------------------------------------- */

export async function updateCharter(userId: string, id: string, input: Record<string, unknown>): Promise<Outcome<AiFundRow>> {
  const fund = await readFund(userId, id);
  if (fund === null) return fail("No such fund.", 404);
  if (!editable(fund.status)) return fail("A closing or closed fund's charter is fixed.");
  const before = toCharter(fund);
  const validated = validateCharter({ ...before, ...input });
  if ("error" in validated) return fail(validated.error);
  const changes = charterChanges(before, validated.charter);
  if (Object.keys(changes).length === 0) return { ok: true, value: fund };
  const { data } = await serviceClient()
    .from("ai_funds")
    .update({ ...charterColumns(validated.charter), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", ["active", "paused", "halted"])
    .select("*")
    .maybeSingle();
  if (data === null || data === undefined) return fail("The charter could not be saved.", 503);
  await appendLedger(userId, { actor: "person", event: "fund.charter_changed", subjectId: id, body: { changes } });
  return { ok: true, value: data as AiFundRow };
}

export async function setManager(userId: string, id: string, keyId: unknown): Promise<Outcome<AiFundRow>> {
  const fund = await readFund(userId, id);
  if (fund === null) return fail("No such fund.", 404);
  if (fund.status === "closed") return fail("A closed fund has no manager to change.");
  let next: string | null = null;
  if (keyId !== null && keyId !== undefined && keyId !== "") {
    const key = await managerKey(userId, keyId, id);
    if (!key.ok) return key;
    next = key.keyId;
  }
  if (next === fund.key_id) return { ok: true, value: fund };
  const previous = fund.key_id;
  const { data, error } = await serviceClient()
    .from("ai_funds")
    .update({ key_id: next, manager_seen_at: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .neq("status", "closed")
    .select("*")
    .maybeSingle();
  if (error !== null) return fail(error.code === "23505" ? "That key already manages another fund." : "The manager could not be changed.", error.code === "23505" ? 409 : 503);
  if (data === null || data === undefined) return fail("The manager could not be changed.", 503);
  await appendLedger(userId, { actor: "person", event: "fund.manager_changed", subjectId: id, body: { from: previous, to: next } });
  return { ok: true, value: data as AiFundRow };
}

export async function moveCapital(userId: string, id: string, input: Record<string, unknown>, now: number = Date.now()): Promise<Outcome<AiFundRow>> {
  const fund = await readFund(userId, id);
  if (fund === null) return fail("No such fund.", 404);
  if (!editable(fund.status)) return fail("Capital cannot move while a fund is closing or closed.");
  const direction = input.direction === "withdraw" ? "withdraw" : input.direction === "add" ? "add" : null;
  if (direction === null) return fail("Say whether to add or withdraw.");
  const amount = amountOf(input.amountUsd);
  if (amount === null || amount < FUND_LIMITS.minFlowUsd) return fail(`Move at least ${usd(FUND_LIMITS.minFlowUsd)}.`);

  const snap = await snapshot(fund, now);
  if (snap === null) return fail("The fund's book could not be read just now.", 503);
  if (snap.book.stale) return fail("A position has no live price, so the units cannot be priced fairly. Try again shortly.", 503);
  const npu = snap.book.npu;

  if (direction === "add") {
    if (fund.mode === "paper" && snap.book.navUsd + amount > FUND_LIMITS.maxPaperCapitalUsd) {
      return fail(`A paper fund holds at most ${usd(FUND_LIMITS.maxPaperCapitalUsd)}.`);
    }
    if (fund.mode === "live") {
      const room = await liveRoom(userId, snap.charter.markets, fund.id);
      if (!room.ok) return room;
      const free = room.freeUsd - Math.max(0, snap.book.navUsd);
      if (amount > free) return fail(`Your Hyperliquid account has ${usd(Math.max(0, free))} not already allocated to a live fund.`);
    }
  } else {
    const most = withdrawable(snap.book, snap.charter);
    if (amount > most + 1e-6) {
      return fail(
        most <= 0
          ? "Nothing can come out while the fund holds these positions at this size. Close some, or wind the fund down."
          : `At most ${usd(most)} can come out now: the fund keeps ${usd(FUND_LIMITS.minCapitalUsd)} and the margin and exposure its positions need. To take everything, wind it down.`,
      );
    }
  }

  const units = unitsFor(amount, npu);
  const db = serviceClient();
  const inserted = await db
    .from("ai_fund_flows")
    .insert({ fund_id: id, user_id: userId, kind: direction === "add" ? "subscribe" : "redeem", amount_usd: amount, npu: Number(npu.toFixed(6)), units })
    .select("id")
    .single();
  if (inserted.error !== null) return fail("The capital could not be recorded.", 503);
  const nav = snap.book.navUsd + (direction === "add" ? amount : -amount);
  const { data } = await db
    .from("ai_funds")
    .update({ last_nav: Number(nav.toFixed(4)), last_npu: Number(npu.toFixed(6)), marked_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();
  await appendLedger(userId, {
    actor: "person",
    event: direction === "add" ? "fund.capital_added" : "fund.capital_withdrawn",
    subjectId: id,
    body: { amountUsd: amount, npu: Number(npu.toFixed(4)), units: Number(units.toFixed(6)), navAfterUsd: Number(nav.toFixed(2)) },
  });
  return { ok: true, value: (data as AiFundRow | null) ?? fund };
}

/** The person closes one of the fund's positions — an override of the manager. */
export async function ownerClosePosition(userId: string, id: string, positionId: string): Promise<Outcome<AiFundRow>> {
  const fund = await readFund(userId, id);
  if (fund === null) return fail("No such fund.", 404);
  if (!/^[0-9a-f-]{36}$/i.test(positionId)) return fail("No such position.", 404);
  const { data } = await serviceClient().from("trading_positions").select("*").eq("id", positionId).eq("user_id", userId).eq("fund_id", id).maybeSingle();
  const row = (data as TradingPositionRow | null) ?? null;
  if (row === null) return fail("No such position in this fund.", 404);
  const outcome = await closeTrade(userId, row, FUND_EXIT.owner);
  if (!outcome.ok) return fail(outcome.error, outcome.status);
  await appendLedger(userId, {
    actor: "person",
    event: "fund.position_closed",
    subjectId: id,
    body: { positionId, coin: row.coin, side: row.side, exitPrice: outcome.position.exitPrice, realisedUsd: outcome.position.realisedPnlUsd, reason: FUND_EXIT.owner },
  });
  return { ok: true, value: fund };
}

/* ---------------------------------------------------------------------------
   The lifecycle
--------------------------------------------------------------------------- */

async function transition(fund: AiFundRow, to: AiFundRow["status"], extra: Record<string, unknown> = {}): Promise<AiFundRow | null> {
  const { data } = await serviceClient()
    .from("ai_funds")
    .update({ status: to, updated_at: new Date().toISOString(), ...extra })
    .eq("id", fund.id)
    .eq("user_id", fund.user_id)
    .eq("status", fund.status)
    .select("*")
    .maybeSingle();
  return (data as AiFundRow | null) ?? null;
}

export async function fundAction(userId: string, id: string, action: unknown, input: Record<string, unknown>, now: number = Date.now()): Promise<Outcome<{ fund: AiFundRow; successor: AiFundRow | null; notes: string[] }>> {
  const fund = await readFund(userId, id);
  if (fund === null) return fail("No such fund.", 404);
  const allowed = actionsFor(fund.status, fund.mode);
  if (typeof action !== "string" || !(allowed as string[]).includes(action)) {
    return fail(fund.status === "closed" ? "The fund is closed." : `A fund that is ${fund.status.replace("_", " ")} cannot do that.`);
  }
  const done = (value: AiFundRow, notes: string[] = [], successor: AiFundRow | null = null): Outcome<{ fund: AiFundRow; successor: AiFundRow | null; notes: string[] }> => ({
    ok: true,
    value: { fund: value, successor, notes },
  });

  switch (action as FundAction) {
    case "pause": {
      const next = await transition(fund, "paused");
      if (next === null) return fail("The fund changed a moment ago. Refresh and try again.", 409);
      await appendLedger(userId, { actor: "person", event: "fund.paused", subjectId: id, body: {} });
      return done(next, ["Paused: the manager opens nothing new. Open positions keep their take-profit and stop-loss."]);
    }
    case "resume": {
      const snap = await snapshot(fund, now);
      if (snap === null) return fail("The fund's book could not be read just now.", 503);
      /* Out of a halt, the drawdown and the day's loss are measured from
         here: otherwise the fund would be halted again on the next check,
         or blocked until midnight, by the loss the person just reviewed. */
      const reset = fund.status === "halted";
      const previousHigh = n(fund.hwm_npu);
      const npu = Number(snap.book.npu.toFixed(6));
      const next = await transition(
        fund,
        "active",
        reset ? { hwm_npu: npu, day_start_npu: npu, day_start_on: utcDay(now), last_npu: npu, halt_reason: null } : {},
      );
      if (next === null) return fail("The fund changed a moment ago. Refresh and try again.", 409);
      await appendLedger(userId, {
        actor: "person",
        event: "fund.resumed",
        subjectId: id,
        body: reset ? { fromHalt: true, highWaterMarkFrom: previousHigh, highWaterMarkTo: Number(snap.book.npu.toFixed(4)) } : {},
      });
      return done(next, reset ? ["Resumed. Its high-water mark and today's loss restart at the current NAV per unit, so both limits count from here."] : []);
    }
    case "wind_down": {
      const next = await transition(fund, "winding_down");
      if (next === null) return fail("The fund changed a moment ago. Refresh and try again.", 409);
      await appendLedger(userId, { actor: "person", event: "fund.winding_down", subjectId: id, body: {} });
      const snap = await snapshot(next, now);
      const notes: string[] = [];
      if (snap !== null && snap.open.length > 0) {
        const result = await flatten(snap, FUND_EXIT.windDown);
        if (result.failed.length > 0) notes.push(`Still open: ${result.failed.join(" ")} Elyra tries again every five minutes.`);
      }
      const closed = await closeOut(next, "wound_down", ["winding_down"], now);
      return done(closed ?? next, closed === null ? notes : ["Every position is closed and the fund is closed out."]);
    }
    case "graduate":
      return graduate(fund, input, now);
  }
}

/**
 * Paper → live. The paper fund closes with its record frozen; a live fund
 * opens with the same charter and manager and the capital the person
 * allocates from their own Hyperliquid account — so a live record never
 * starts with a paper one in it.
 */
async function graduate(fund: AiFundRow, input: Record<string, unknown>, now: number): Promise<Outcome<{ fund: AiFundRow; successor: AiFundRow | null; notes: string[] }>> {
  const userId = fund.user_id;
  const snap = await snapshot(fund, now);
  if (snap === null) return fail("The fund's book could not be read just now.", 503);
  const check = graduationCheck({ mode: fund.mode, status: fund.status, createdAt: fund.created_at, closedTrades: snap.closed.length, openPositions: snap.open.length, now });
  if (!check.ready) return fail(check.reasons.join(" "));
  const capital = amountOf(input.capitalUsd);
  if (capital === null || capital < FUND_LIMITS.minCapitalUsd) return fail(`Live capital must be at least ${usd(FUND_LIMITS.minCapitalUsd)}.`);
  const room = await liveRoom(userId, snap.charter.markets, null);
  if (!room.ok) return room;
  if (capital > room.freeUsd) return fail(`Your Hyperliquid account has ${usd(room.freeUsd)} not already allocated to a live fund.`);

  if (snap.open.length > 0) {
    const result = await flatten(snap, FUND_EXIT.graduate);
    if (result.failed.length > 0) return fail(`The paper positions could not all be closed: ${result.failed.join(" ")}`, 503);
  }

  /* Live fund first, without a manager: the key moves only once the paper
     fund has closed, since a key manages one open fund at a time. */
  const live = await insertFund(userId, snap.charter, "live", capital, { predecessor_id: fund.id }, now);
  if (live === null) return fail("The live fund could not be saved. The paper fund is still open, without positions.", 503);
  const closed = await closeOut(fund, "graduated", ["active", "paused"], now);
  if (closed === null) {
    /* Nothing has traded in it and nothing in the ledger names it yet. */
    await serviceClient().from("ai_funds").delete().eq("id", live.id).eq("user_id", userId);
    return fail("The paper fund changed a moment ago, so it did not graduate. Try again.", 409);
  }
  let successor = live;
  if (fund.key_id !== null) {
    const { data } = await serviceClient().from("ai_funds").update({ key_id: fund.key_id }).eq("id", live.id).eq("user_id", userId).select("*").maybeSingle();
    successor = (data as AiFundRow | null) ?? live;
  }
  const report = (closed.final_report ?? {}) as Record<string, unknown>;
  await appendLedger(userId, {
    actor: "person",
    event: "fund.graduated",
    subjectId: fund.id,
    body: { successorId: live.id, incubatedDays: check.incubatedDays, paperReturnPct: report.returnPct ?? null, trades: snap.closed.length },
  });
  await appendLedger(userId, {
    actor: "person",
    event: "fund.launched",
    subjectId: live.id,
    body: { name: snap.charter.name, mode: "live", capitalUsd: capital, managerKeyId: fund.key_id, predecessorId: fund.id, network: tradingNetwork() },
  });
  await notifyOwner(
    userId,
    `${snap.charter.name} is live`,
    [`It graduated from paper after ${check.incubatedDays} days and ${snap.closed.length} trades.`, `It now trades ${usd(capital)} of your Hyperliquid account on ${tradingNetwork()}.`],
    fundRoute(live.id),
  );
  return { ok: true, value: { fund: closed, successor, notes: [`Live on Hyperliquid ${tradingNetwork()} with ${usd(capital)}.`] } };
}
