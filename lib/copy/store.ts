import "server-only";

import type { AutotradeInterval } from "@/lib/autotrade/rules";
import { liveEnabled, num, tablesMissing, tradingNetwork } from "@/lib/autotrade/store";
import { getStrategy } from "@/lib/backtest/strategies";
import { backtestLeader } from "@/lib/copy/backtest";
import { HOUSE_DID, HOUSE_SETS, HOUSE_USER_ID } from "@/lib/copy/house";
import { recordOf, returnOnMargin, type ClosedTrade } from "@/lib/copy/rules";
import type { CopyResponse, FollowView, LeaderDetail, LeaderRuleView, LeaderSummary, LeaderTrade, MyRuleView, MySetView } from "@/lib/copy/types";
import { serviceClient } from "@/lib/supabase/server";
import type { CopyFollowRow, TradingPositionRow, TradingRuleRow, TradingRuleSetRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Copy trading, stored. Reads for /api/copy and the pass that copies
   (lib/copy/engine.ts). Every write a person makes is scoped by user_id in
   its route; the house is written only here, from lib/copy/house.ts.
--------------------------------------------------------------------------- */

export const MIGRATION_NOTE = "Copy trading needs database migration 0029, which has not been applied.";

let houseWritten = false;

/**
 * Elyra's own sets and rules, written from lib/copy/house.ts so the code is
 * the one source of what the house trades. Once per server instance; safe to
 * run again. A rule's checks and signals (`last_*`) are left as they are.
 */
export async function ensureHouse(): Promise<string | null> {
  if (houseWritten) return null;
  const db = serviceClient();
  const profile = await db
    .from("profiles")
    .upsert({ id: HOUSE_USER_ID, privy_did: HOUSE_DID, display_name: "Elyra" }, { onConflict: "id", ignoreDuplicates: true });
  if (profile.error !== null) return `house profile: ${profile.error.message}`;
  /* The house holds at most one position per rule, five in all. Paper only. */
  await db
    .from("trading_settings")
    .upsert({ user_id: HOUSE_USER_ID, paused: false, daily_loss_limit_usd: 5000, max_open_positions: 5 }, { onConflict: "user_id" });
  const sets = await db.from("trading_rule_sets").upsert(
    HOUSE_SETS.map((set) => ({ id: set.id, user_id: HOUSE_USER_ID, name: set.name, description: set.description, published: true, house: true })),
    { onConflict: "id" },
  );
  if (sets.error !== null) return tablesMissing(sets.error) ? MIGRATION_NOTE : `house sets: ${sets.error.message}`;
  const rules = await db.from("trading_rules").upsert(
    HOUSE_SETS.flatMap((set) =>
      set.rules.map((rule) => ({
        id: rule.id,
        user_id: HOUSE_USER_ID,
        set_id: set.id,
        name: rule.name,
        side: rule.side,
        coin: rule.coin,
        strategy_id: rule.strategyId,
        params: {},
        interval: rule.interval,
        size_usd: rule.sizeUsd,
        leverage: rule.leverage,
        take_profit_pct: rule.takeProfitPct,
        stop_loss_pct: rule.stopLossPct,
        mode: "paper" as const,
        enabled: true,
      })),
    ),
    { onConflict: "id" },
  );
  if (rules.error !== null) return `house rules: ${rules.error.message}`;
  houseWritten = true;
  return null;
}

/** Arena handles, by owner. */
async function handles(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const { data } = await serviceClient().from("arena_profiles").select("user_id, handle").in("user_id", userIds);
  return new Map((data ?? []).filter((row) => row.handle !== null).map((row) => [row.user_id, row.handle as string]));
}

export async function handleOf(userId: string): Promise<string | null> {
  return (await handles([userId])).get(userId) ?? null;
}

const margin = (row: Pick<TradingPositionRow, "entry_price" | "original_size" | "size" | "leverage">) => {
  const size = row.original_size === null || row.original_size === undefined ? num(row.size) : num(row.original_size);
  return (num(row.entry_price) * size) / Math.max(1, row.leverage ?? 1);
};

const closedTrade = (row: TradingPositionRow): ClosedTrade => ({
  realisedPnlUsd: num(row.realised_pnl_usd),
  marginUsd: margin(row),
  closedAt: Date.parse(row.closed_at ?? row.opened_at),
});

const ruleView = (row: TradingRuleRow): LeaderRuleView => ({
  coin: row.coin,
  side: row.side ?? "long",
  interval: row.interval as AutotradeInterval,
  strategyId: row.strategy_id,
  strategyName: getStrategy(row.strategy_id)?.name ?? row.strategy_id,
  takeProfitPct: num(row.take_profit_pct),
  stopLossPct: num(row.stop_loss_pct),
  leverage: row.leverage,
  mode: row.mode,
});

/**
 * Leaders as summaries: every published set whose owner can be shown — Elyra
 * itself, or a person with an Arena handle. Most-copied first, then the
 * longest record.
 */
async function summaries(sets: TradingRuleSetRow[], viewerId: string | null): Promise<LeaderSummary[]> {
  if (sets.length === 0) return [];
  const db = serviceClient();
  const ids = sets.map((set) => set.id);
  const [rulesRead, positionsRead, followsRead, names] = await Promise.all([
    db.from("trading_rules").select("*").in("set_id", ids),
    db
      .from("trading_positions")
      .select("id, set_id, status, realised_pnl_usd, entry_price, original_size, size, leverage, opened_at, closed_at")
      .in("set_id", ids)
      .in("status", ["open", "closed"])
      .limit(10_000),
    db.from("copy_follows").select("id, set_id, user_id, enabled").in("set_id", ids),
    handles([...new Set(sets.filter((set) => !set.house).map((set) => set.user_id))]),
  ]);
  const rules = rulesRead.data ?? [];
  const positions = (positionsRead.data ?? []) as TradingPositionRow[];
  const follows = followsRead.data ?? [];

  const out: LeaderSummary[] = [];
  for (const set of sets) {
    const handle = set.house ? null : (names.get(set.user_id) ?? null);
    if (!set.house && handle === null) continue;
    const own = rules.filter((rule) => rule.set_id === set.id);
    const held = positions.filter((row) => row.set_id === set.id);
    out.push({
      id: set.id,
      house: set.house,
      name: set.name,
      description: set.description,
      handle,
      rules: own.map(ruleView),
      modes: [...new Set(own.map((rule) => rule.mode))].sort(),
      followers: follows.filter((follow) => follow.set_id === set.id && follow.enabled).length,
      record: recordOf(held.filter((row) => row.status === "closed").map(closedTrade)),
      open: held.filter((row) => row.status === "open").length,
      createdAt: set.created_at,
      mine: viewerId !== null && set.user_id === viewerId,
      followId: viewerId === null ? null : (follows.find((follow) => follow.set_id === set.id && follow.user_id === viewerId)?.id ?? null),
    });
  }
  return out.sort((a, b) => b.followers - a.followers || b.record.trades - a.record.trades || Number(b.house) - Number(a.house));
}

export async function listLeaders(viewerId: string | null): Promise<LeaderSummary[]> {
  const { data, error } = await serviceClient().from("trading_rule_sets").select("*").eq("published", true).order("created_at", { ascending: true });
  if (error !== null) throw new Error(tablesMissing(error) ? MIGRATION_NOTE : error.message);
  return summaries(data ?? [], viewerId);
}

/** One leader: its summary, its recent trades and its backtest. Null when it is not shared or does not exist. */
export async function leaderDetail(id: string, viewerId: string | null): Promise<LeaderDetail | null> {
  const db = serviceClient();
  const { data: set } = await db.from("trading_rule_sets").select("*").eq("id", id).maybeSingle();
  if (set === null || set === undefined) return null;
  /* Its owner sees it before sharing it; nobody else does. */
  if (!set.published && set.user_id !== viewerId) return null;
  const [summary] = await summaries([set], viewerId);
  if (summary === undefined) return null;

  const [openRead, closedRead, rulesRead] = await Promise.all([
    db.from("trading_positions").select("*").eq("set_id", id).eq("status", "open").order("opened_at", { ascending: false }).limit(10),
    db.from("trading_positions").select("*").eq("set_id", id).eq("status", "closed").order("closed_at", { ascending: false }).limit(30),
    db.from("trading_rules").select("*").eq("set_id", id),
  ]);
  const trade = (row: TradingPositionRow): LeaderTrade => ({
    id: row.id,
    coin: row.coin,
    side: row.side ?? "long",
    mode: row.mode,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    entryPrice: num(row.entry_price),
    exitPrice: row.exit_price === null ? null : num(row.exit_price),
    returnPct: row.status === "closed" ? returnOnMargin(closedTrade(row)) : null,
    exitReason: row.exit_reason,
  });
  const backtest = await backtestLeader(id, rulesRead.data ?? []).catch(() => null);
  return { leader: summary, trades: [...(openRead.data ?? []), ...(closedRead.data ?? [])].map(trade), backtest };
}

/** The signed-in person's sets, rules and copies. */
async function mine(userId: string, leaders: LeaderSummary[]): Promise<NonNullable<CopyResponse["mine"]>> {
  const db = serviceClient();
  const [setsRead, rulesRead, followsRead, handle] = await Promise.all([
    db.from("trading_rule_sets").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    db.from("trading_rules").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    db.from("copy_follows").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    handleOf(userId),
  ]);
  const sets = setsRead.data ?? [];
  const rules = rulesRead.data ?? [];
  const follows = (followsRead.data ?? []) as CopyFollowRow[];

  const followerCounts = new Map<string, number>();
  if (sets.length > 0) {
    const { data } = await db.from("copy_follows").select("set_id").in("set_id", sets.map((set) => set.id)).eq("enabled", true);
    for (const row of data ?? []) followerCounts.set(row.set_id, (followerCounts.get(row.set_id) ?? 0) + 1);
  }
  const mySets: MySetView[] = sets.map((set) => ({
    id: set.id,
    name: set.name,
    description: set.description,
    published: set.published,
    ruleIds: rules.filter((rule) => rule.set_id === set.id).map((rule) => rule.id),
    followers: followerCounts.get(set.id) ?? 0,
  }));
  const myRules: MyRuleView[] = rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    coin: rule.coin,
    side: rule.side ?? "long",
    interval: rule.interval as AutotradeInterval,
    mode: rule.mode,
    setId: rule.set_id ?? null,
  }));

  /* A copied set no longer shared is not among the leaders; read its name. */
  const followed = new Map(leaders.map((leader) => [leader.id, leader]));
  const missing = follows.map((follow) => follow.set_id).filter((id) => !followed.has(id));
  const unshared = new Map<string, TradingRuleSetRow>();
  if (missing.length > 0) {
    const { data } = await db.from("trading_rule_sets").select("*").in("id", missing);
    for (const row of data ?? []) unshared.set(row.id, row);
  }
  const copies =
    follows.length === 0
      ? []
      : (((await db.from("trading_positions").select("copy_id, status, realised_pnl_usd").in("copy_id", follows.map((follow) => follow.id))).data ?? []) as Pick<
          TradingPositionRow,
          "copy_id" | "status" | "realised_pnl_usd"
        >[]);
  const followViews: FollowView[] = follows.map((follow) => {
    const leader = followed.get(follow.set_id);
    const own = copies.filter((row) => row.copy_id === follow.id);
    const closed = own.filter((row) => row.status === "closed");
    return {
      id: follow.id,
      leaderId: follow.set_id,
      /* Empty when the set is gone; the page says so in words. */
      leaderName: leader?.name ?? unshared.get(follow.set_id)?.name ?? "",
      leaderHouse: leader?.house ?? unshared.get(follow.set_id)?.house ?? false,
      leaderHandle: leader?.handle ?? null,
      leaderShared: leader !== undefined,
      sizeUsd: num(follow.size_usd),
      maxLeverage: follow.max_leverage,
      mode: follow.mode,
      maxDriftPct: num(follow.max_drift_pct),
      enabled: follow.enabled,
      lastNote: follow.last_note,
      lastCheckedAt: follow.last_checked_at,
      createdAt: follow.created_at,
      openCopies: own.filter((row) => row.status === "open" || row.status === "opening").length,
      closedCopies: closed.length,
      realisedUsd: Math.round(closed.reduce((sum, row) => sum + (num(row.realised_pnl_usd) || 0), 0) * 100) / 100,
    };
  });
  return { handle, sets: mySets, rules: myRules, follows: followViews };
}

export async function copyOverview(viewerId: string | null): Promise<CopyResponse> {
  const live = { enabled: liveEnabled(), network: tradingNetwork() };
  const house = await ensureHouse().catch((error: unknown) => (error instanceof Error ? error.message : "house"));
  try {
    const leaders = await listLeaders(viewerId);
    return { leaders, mine: viewerId === null ? null : await mine(viewerId, leaders), live, error: house === MIGRATION_NOTE ? house : null };
  } catch (error) {
    return { leaders: [], mine: null, live, error: error instanceof Error ? error.message : "Copy trading could not be read." };
  }
}
