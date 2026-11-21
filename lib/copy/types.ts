import type { AutotradeInterval, RuleMode, Side } from "@/lib/autotrade/rules";
import type { LeaderRecord } from "@/lib/copy/rules";

/* ---------------------------------------------------------------------------
   /api/copy, as the website reads it. Pure.

   A leader is shown by its owner's Arena handle or as Elyra's own, never by
   a wallet, and its record is in returns on margin, never in dollars: what a
   leader trades with is theirs.
--------------------------------------------------------------------------- */

export interface LeaderRuleView {
  coin: string;
  side: Side;
  interval: AutotradeInterval;
  strategyId: string;
  /** English; the page translates it. */
  strategyName: string;
  takeProfitPct: number;
  stopLossPct: number;
  leverage: number;
  mode: RuleMode;
}

export interface LeaderSummary {
  id: string;
  /** One of Elyra's own sets (lib/copy/house.ts). */
  house: boolean;
  name: string;
  description: string;
  /** The owner's Arena handle; null for Elyra's own. */
  handle: string | null;
  rules: LeaderRuleView[];
  /** Whether its rules trade on paper, live, or some of each. */
  modes: RuleMode[];
  /** People copying it now. */
  followers: number;
  /** Its closed trades since it was made. */
  record: LeaderRecord;
  /** Positions it holds now. */
  open: number;
  createdAt: string;
  /** The signed-in person owns it. */
  mine: boolean;
  /** The signed-in person's copy of it, if any. */
  followId: string | null;
}

export interface LeaderTrade {
  id: string;
  coin: string;
  side: Side;
  mode: RuleMode;
  openedAt: string;
  closedAt: string | null;
  entryPrice: number;
  exitPrice: number | null;
  /** The result over its own margin, in percent; null while open. */
  returnPct: number | null;
  exitReason: string | null;
}

/** A leader's rules replayed on Hyperliquid's past bars. Hypothetical; labelled so. */
export interface BacktestView {
  /** The longest window any of its rules was replayed over, in days. */
  days: number;
  record: LeaderRecord;
  perRule: { coin: string; side: Side; interval: AutotradeInterval; days: number; trades: number; totalReturnPct: number }[];
  computedAt: string;
}

export interface LeaderDetail {
  leader: LeaderSummary;
  /** Open positions first, then the latest closed ones. */
  trades: LeaderTrade[];
  backtest: BacktestView | null;
}

export interface FollowView {
  id: string;
  leaderId: string;
  leaderName: string;
  leaderHouse: boolean;
  leaderHandle: string | null;
  /** The leader still shares the set, so new entries are still copied. */
  leaderShared: boolean;
  sizeUsd: number;
  maxLeverage: number;
  mode: RuleMode;
  maxDriftPct: number;
  enabled: boolean;
  lastNote: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  openCopies: number;
  closedCopies: number;
  /** The copies' result after fees, closed ones only. */
  realisedUsd: number;
}

export interface MySetView {
  id: string;
  name: string;
  description: string;
  published: boolean;
  ruleIds: string[];
  followers: number;
}

export interface MyRuleView {
  id: string;
  name: string;
  coin: string;
  side: Side;
  interval: AutotradeInterval;
  mode: RuleMode;
  setId: string | null;
}

export interface CopyResponse {
  leaders: LeaderSummary[];
  /** The signed-in person's side of it; null when signed out. */
  mine: {
    /** Their Arena handle: sharing a set needs one. */
    handle: string | null;
    sets: MySetView[];
    rules: MyRuleView[];
    follows: FollowView[];
  } | null;
  /** Whether this deployment sends live orders, and to which network. */
  live: { enabled: boolean; network: "mainnet" | "testnet" };
  error: string | null;
}
