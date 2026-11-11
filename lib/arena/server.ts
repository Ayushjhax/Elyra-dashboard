import "server-only";

import { createHash, randomInt } from "node:crypto";
import {
  WEEKLY_POINTS,
  calibration,
  canonicalStatement,
  isoWeek,
  receiptPayload,
  validateBacking,
  validateCall,
  type CallStatus,
} from "@/lib/arena/calls";
import {
  BOT_CONFIDENCE,
  START_RATING,
  buildPuzzle,
  nextRating,
  nextStreak,
  puzzleNumber,
  puzzleSpec,
  shareText,
  type Bar,
  type UpDown,
} from "@/lib/arena/puzzle";
import { REVIEW_LABELS, type ReviewFacts, type ReviewLabel } from "@/lib/arena/review";
import type { ArenaCallView, ArenaResponse, GroupView, PuzzleView, ReviewView } from "@/lib/arena/types";
import { hyperliquidCandles } from "@/lib/autotrade/hyperliquid";
import { num } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";
import type { ArenaCallRow, ArenaPuzzleDayRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Elyra Arena, server side: what the page reads, and every write it makes.

   Every query is scoped to the verified user. A call is shown to someone
   else only if its owner chose to — to their groups, or publicly under a
   handle — and an author is named by handle or not at all, never by wallet.
--------------------------------------------------------------------------- */

export class ArenaError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ArenaError";
  }
}

export const MAX_GROUPS = 10;
export const MAX_MEMBERS = 50;
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/* ---- the daily puzzle ---- */

/** Today's puzzle, created on first request from real bars; the same row for everyone after that. */
export async function ensurePuzzle(date: string): Promise<ArenaPuzzleDayRow> {
  const db = serviceClient();
  const existing = await db.from("arena_puzzle_days").select("*").eq("puzzle_date", date).maybeSingle();
  if (existing.error !== null) throw new ArenaError("The puzzle could not be read. Arena needs migration 0021.", 503);
  if (existing.data !== null && existing.data !== undefined) return existing.data;

  const spec = puzzleSpec(date);
  const bars = (await hyperliquidCandles(spec.market, "1h", spec.startAt - 2 * 3_600_000, spec.revealUntil + 3_600_000).catch(() => [])) as Bar[];
  const built = buildPuzzle(bars, spec);
  if (built === null) throw new ArenaError("Today's chart could not be loaded. It will be ready shortly.", 503);

  const previous = await db
    .from("arena_puzzle_days")
    .select("bot_rating")
    .lt("puzzle_date", date)
    .order("puzzle_date", { ascending: false })
    .limit(1);
  const botBefore = (previous.data ?? []).length > 0 ? num(previous.data![0].bot_rating) : START_RATING;
  const botCorrect = built.botDirection === built.outcome;
  const row = {
    puzzle_date: date,
    number: puzzleNumber(date),
    market: spec.market,
    interval: "1h",
    ends_at: new Date(spec.endsAt).toISOString(),
    visible: built.visible,
    outcome: built.outcome,
    change_pct: Number(built.changePct.toFixed(4)),
    reveal: built.reveal,
    bot_direction: built.botDirection,
    bot_correct: botCorrect,
    bot_rating: nextRating(botBefore, BOT_CONFIDENCE, botCorrect),
  };
  /* Two first visitors at once: the second insert is ignored, then both read the one row. */
  await db.from("arena_puzzle_days").upsert(row, { onConflict: "puzzle_date", ignoreDuplicates: true });
  const created = await db.from("arena_puzzle_days").select("*").eq("puzzle_date", date).maybeSingle();
  if (created.data === null || created.data === undefined) throw new ArenaError("The puzzle could not be saved.", 503);
  return created.data;
}

async function lastAnswer(userId: string, before?: string) {
  let query = serviceClient().from("arena_puzzle_answers").select("*").eq("user_id", userId);
  if (before !== undefined) query = query.lt("puzzle_date", before);
  const { data } = await query.order("puzzle_date", { ascending: false }).limit(1);
  return (data ?? [])[0] ?? null;
}

function puzzleView(day: ArenaPuzzleDayRow, answer: { direction: UpDown; confidence: number; correct: boolean; rating_before: string | number; rating_after: string | number } | null, rating: number, streak: number, played: number): PuzzleView {
  const ratingBefore = answer === null ? rating : num(answer.rating_before);
  const ratingAfter = answer === null ? rating : num(answer.rating_after);
  return {
    date: day.puzzle_date,
    number: day.number,
    visible: day.visible as Bar[],
    reveal:
      answer === null
        ? null
        : { bars: day.reveal as Bar[], market: day.market, endsAt: day.ends_at, outcome: day.outcome, changePct: num(day.change_pct) },
    answer:
      answer === null
        ? null
        : {
            direction: answer.direction,
            confidence: answer.confidence,
            correct: answer.correct,
            ratingBefore,
            ratingAfter,
            share: shareText({ number: day.number, direction: answer.direction, confidence: answer.confidence, correct: answer.correct, ratingBefore, ratingAfter }),
          },
    rating,
    streak,
    played,
    bots: {
      coinFlip: START_RATING,
      momentum: num(day.bot_rating),
      /* The momentum bot's own answer is shown only once the person has answered. */
      momentumToday: answer === null ? null : { direction: day.bot_direction, confidence: BOT_CONFIDENCE },
    },
  };
}

export async function answerPuzzle(userId: string, date: string, input: Record<string, unknown>): Promise<PuzzleView> {
  if (input.direction !== "up" && input.direction !== "down") throw new ArenaError("Choose up or down.");
  const confidence = input.confidence;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 50 || confidence > 99) {
    throw new ArenaError("Confidence is a whole number from 50 to 99.");
  }
  const day = await ensurePuzzle(date);
  const db = serviceClient();
  const already = await db.from("arena_puzzle_answers").select("*").eq("user_id", userId).eq("puzzle_date", date).maybeSingle();
  if (already.data !== null && already.data !== undefined) throw new ArenaError("Today's puzzle is already answered.");

  const previous = await lastAnswer(userId, date);
  const ratingBefore = previous === null ? START_RATING : num(previous.rating_after);
  const correct = input.direction === day.outcome;
  const ratingAfter = nextRating(ratingBefore, confidence, correct);
  const streak = nextStreak(previous === null ? null : { date: previous.puzzle_date, streak: previous.streak }, date);
  const inserted = await db.from("arena_puzzle_answers").insert({
    user_id: userId,
    puzzle_date: date,
    direction: input.direction,
    confidence,
    correct,
    rating_before: ratingBefore,
    rating_after: ratingAfter,
    streak,
  });
  if (inserted.error !== null) throw new ArenaError("Today's puzzle is already answered.");
  const { count } = await db.from("arena_puzzle_answers").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
  return puzzleView(day, { direction: input.direction, confidence, correct, rating_before: ratingBefore, rating_after: ratingAfter }, ratingAfter, streak, count ?? 1);
}

/* ---- calls ---- */

function toCallView(
  row: ArenaCallRow,
  viewer: string,
  handles: Map<string, string>,
  backings: { call_id: string; user_id: string; stance: "tail" | "fade"; points: number; settled_points: number | null }[],
): ArenaCallView {
  const mine = backings.find((backing) => backing.call_id === row.id && backing.user_id === viewer) ?? null;
  return {
    id: row.id,
    mine: row.user_id === viewer,
    author: handles.get(row.user_id) ?? null,
    market: row.market,
    direction: row.direction,
    price: num(row.price),
    resolvesAt: row.resolves_at,
    confidence: row.confidence,
    visibility: row.visibility,
    statement: row.statement,
    receipt: row.receipt,
    createdAt: row.created_at,
    status: row.status,
    settledPrice: row.settled_price === null ? null : num(row.settled_price),
    settledSource: row.settled_source,
    settledAt: row.settled_at,
    brier: row.brier === null ? null : num(row.brier),
    card: row.card,
    tails: backings.filter((backing) => backing.call_id === row.id && backing.stance === "tail").length,
    fades: backings.filter((backing) => backing.call_id === row.id && backing.stance === "fade").length,
    myBacking: mine === null ? null : { stance: mine.stance, points: mine.points, settledPoints: mine.settled_points },
  };
}

/** Everyone the viewer shares a group with, not counting themselves. */
async function groupmates(userId: string): Promise<string[]> {
  const db = serviceClient();
  const mine = await db.from("arena_group_members").select("group_id").eq("user_id", userId);
  const groupIds = (mine.data ?? []).map((row) => row.group_id);
  if (groupIds.length === 0) return [];
  const members = await db.from("arena_group_members").select("user_id").in("group_id", groupIds);
  return [...new Set((members.data ?? []).map((row) => row.user_id))].filter((id) => id !== userId);
}

/** Whether the viewer may see (and back) a call. */
async function canSee(viewer: string, call: ArenaCallRow): Promise<boolean> {
  if (call.user_id === viewer) return true;
  if (call.visibility === "private") return false;
  if ((await groupmates(viewer)).includes(call.user_id)) return true;
  if (call.visibility !== "public") return false;
  /* A public call is public only while its author is: the same rule the feed applies. */
  const { data: author } = await serviceClient().from("arena_profiles").select("public").eq("user_id", call.user_id).maybeSingle();
  return author?.public === true;
}

export async function createCall(userId: string, input: Record<string, unknown>, now: number): Promise<string> {
  const checked = validateCall(input, now);
  if ("error" in checked) throw new ArenaError(checked.error);
  const call = checked.call;
  const db = serviceClient();
  if (call.visibility === "public") {
    const profile = await db.from("arena_profiles").select("*").eq("user_id", userId).maybeSingle();
    if (profile.data === null || profile.data === undefined || !profile.data.public || profile.data.handle === null) {
      throw new ArenaError("Choose a public handle in Groups before posting a public call.");
    }
  }
  const createdAt = new Date(now).toISOString();
  const statement = canonicalStatement(call);
  const { data, error } = await db
    .from("arena_calls")
    .insert({
      user_id: userId,
      market: call.market,
      direction: call.direction,
      price: call.price,
      resolves_at: call.resolvesAt,
      confidence: call.confidence,
      visibility: call.visibility,
      statement,
      receipt: sha256(receiptPayload(statement, createdAt)),
      created_at: createdAt,
      status: "open",
    })
    .select("id")
    .single();
  if (error !== null || data === null) throw new ArenaError("The call could not be saved. Arena needs migration 0021.", 503);
  return data.id;
}

export async function backCall(userId: string, callId: string, input: Record<string, unknown>, now: number): Promise<void> {
  const db = serviceClient();
  const { data: call } = await db.from("arena_calls").select("*").eq("id", callId).maybeSingle();
  if (call === null || call === undefined || !(await canSee(userId, call))) throw new ArenaError("No such call.", 404);
  const week = isoWeek(now);
  const spent = await db.from("arena_call_backings").select("points").eq("user_id", userId).eq("week", week);
  const checked = validateBacking(input, {
    now,
    resolvesAt: call.resolves_at,
    ownCall: call.user_id === userId,
    status: call.status as CallStatus,
    spentThisWeek: (spent.data ?? []).reduce((sum, row) => sum + row.points, 0),
  });
  if ("error" in checked) throw new ArenaError(checked.error);
  const { error } = await db
    .from("arena_call_backings")
    .insert({ call_id: callId, user_id: userId, stance: checked.stance, points: checked.points, week, settled_points: null });
  if (error !== null) throw new ArenaError("You have already backed this call.");
}

/* ---- groups and profile ---- */

function inviteCode(): string {
  return Array.from({ length: 8 }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join("");
}

export async function createGroup(userId: string, name: unknown): Promise<void> {
  const text = typeof name === "string" ? name.trim().slice(0, 40) : "";
  if (text.length === 0) throw new ArenaError("Name the group.");
  const db = serviceClient();
  const { count } = await db.from("arena_group_members").select("group_id", { count: "exact", head: true }).eq("user_id", userId);
  if ((count ?? 0) >= MAX_GROUPS) throw new ArenaError(`You can be in ${MAX_GROUPS} groups at most.`);
  const { data, error } = await db.from("arena_groups").insert({ name: text, invite_code: inviteCode(), owner_id: userId }).select("id").single();
  if (error !== null || data === null) throw new ArenaError("The group could not be created.", 503);
  await db.from("arena_group_members").insert({ group_id: data.id, user_id: userId });
}

export async function joinGroup(userId: string, code: unknown): Promise<void> {
  const text = typeof code === "string" ? code.trim().toUpperCase() : "";
  const db = serviceClient();
  const { data: group } = await db.from("arena_groups").select("*").eq("invite_code", text).maybeSingle();
  if (group === null || group === undefined) throw new ArenaError("No group has that invite code.", 404);
  const { count: groups } = await db.from("arena_group_members").select("group_id", { count: "exact", head: true }).eq("user_id", userId);
  if ((groups ?? 0) >= MAX_GROUPS) throw new ArenaError(`You can be in ${MAX_GROUPS} groups at most.`);
  const { count: members } = await db.from("arena_group_members").select("user_id", { count: "exact", head: true }).eq("group_id", group.id);
  if ((members ?? 0) >= MAX_MEMBERS) throw new ArenaError("That group is full.");
  /* Already a member: nothing to do, and not an error. */
  await db.from("arena_group_members").upsert({ group_id: group.id, user_id: userId }, { onConflict: "group_id,user_id", ignoreDuplicates: true });
}

export async function setProfile(userId: string, input: Record<string, unknown>): Promise<void> {
  const handle = typeof input.handle === "string" && input.handle.trim().length > 0 ? input.handle.trim().toLowerCase() : null;
  if (handle !== null && !/^[a-z0-9_]{3,20}$/.test(handle)) throw new ArenaError("A handle is 3–20 letters, numbers or underscores.");
  const isPublic = input.public === true;
  if (isPublic && handle === null) throw new ArenaError("Choose a handle to go public.");
  const { error } = await serviceClient()
    .from("arena_profiles")
    .upsert({ user_id: userId, handle, public: isPublic, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error !== null) throw new ArenaError(/duplicate|unique/i.test(error.message ?? "") ? "That handle is taken." : "The profile could not be saved.");
}

/* ---- the page's read ---- */

export async function arenaState(userId: string, now: number, today: string): Promise<ArenaResponse> {
  const db = serviceClient();
  const week = isoWeek(now);

  const [profileRead, membershipRead, myCallsRead, myBackingsRead, reviewsRead, labelRead] = await Promise.all([
    db.from("arena_profiles").select("*").eq("user_id", userId).maybeSingle(),
    db.from("arena_group_members").select("group_id").eq("user_id", userId),
    db.from("arena_calls").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    db.from("arena_call_backings").select("*").eq("user_id", userId),
    db.from("trade_reviews").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    db.from("trade_reviews").select("label").eq("user_id", userId),
  ]);
  if (myCallsRead.error !== null) throw new ArenaError("Arena needs database migration 0021, which has not been applied.", 503);

  /* Groups, with member counts. */
  const groupIds = (membershipRead.data ?? []).map((row) => row.group_id);
  const groupsRead = groupIds.length === 0 ? { data: [] } : await db.from("arena_groups").select("*").in("id", groupIds);
  const membersRead = groupIds.length === 0 ? { data: [] } : await db.from("arena_group_members").select("group_id, user_id").in("group_id", groupIds);
  const groups: GroupView[] = (groupsRead.data ?? []).map((group) => ({
    id: group.id,
    name: group.name,
    inviteCode: group.invite_code,
    members: (membersRead.data ?? []).filter((member) => member.group_id === group.id).length,
    owner: group.owner_id === userId,
  }));

  /* The feed: groupmates' shared calls, and public calls under a public handle. */
  const mates = [...new Set((membersRead.data ?? []).map((member) => member.user_id))].filter((id) => id !== userId);
  const [mateCalls, publicCalls] = await Promise.all([
    mates.length === 0
      ? Promise.resolve({ data: [] as ArenaCallRow[] })
      : db.from("arena_calls").select("*").in("user_id", mates).in("visibility", ["groups", "public"]).order("created_at", { ascending: false }).limit(50),
    db.from("arena_calls").select("*").eq("visibility", "public").order("created_at", { ascending: false }).limit(50),
  ]);
  const feedRows = [...(mateCalls.data ?? []), ...(publicCalls.data ?? [])]
    .filter((row, index, all) => row.user_id !== userId && all.findIndex((other) => other.id === row.id) === index)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 50);

  const authors = [...new Set(feedRows.map((row) => row.user_id))];
  const profilesRead = authors.length === 0 ? { data: [] } : await db.from("arena_profiles").select("*").in("user_id", authors);
  const handles = new Map<string, string>();
  for (const profile of profilesRead.data ?? []) {
    if (profile.handle !== null) handles.set(profile.user_id, profile.handle);
  }
  /* A public call shows only from someone who is public; a group call only to groupmates (already filtered). */
  const publicAuthors = new Set((profilesRead.data ?? []).filter((profile) => profile.public).map((profile) => profile.user_id));
  const visibleFeed = feedRows.filter((row) => mates.includes(row.user_id) || publicAuthors.has(row.user_id));
  if (profileRead.data?.handle) handles.set(userId, profileRead.data.handle);

  const myCalls = myCallsRead.data ?? [];
  const listedIds = [...myCalls.slice(0, 50), ...visibleFeed].map((row) => row.id);
  const backingsRead = listedIds.length === 0 ? { data: [] } : await db.from("arena_call_backings").select("*").in("call_id", listedIds);
  const backings = backingsRead.data ?? [];

  const myBackings = myBackingsRead.data ?? [];
  const reviews: ReviewView[] = (reviewsRead.data ?? []).map((row) => ({
    id: row.id,
    positionId: row.position_id,
    label: row.label as ReviewLabel,
    facts: row.facts as unknown as ReviewFacts,
    coaching: row.coaching,
    createdAt: row.created_at,
  }));
  const labelCounts = Object.fromEntries(REVIEW_LABELS.map((label) => [label, 0])) as Record<ReviewLabel, number>;
  for (const row of labelRead.data ?? []) labelCounts[row.label as ReviewLabel] += 1;

  /* The puzzle: created on first read of the day, from real bars. */
  let puzzle: PuzzleView | null = null;
  let puzzleError: string | null = null;
  try {
    const day = await ensurePuzzle(today);
    const answer = await db.from("arena_puzzle_answers").select("*").eq("user_id", userId).eq("puzzle_date", today).maybeSingle();
    const latest = await lastAnswer(userId);
    const { count } = await db.from("arena_puzzle_answers").select("user_id", { count: "exact", head: true }).eq("user_id", userId);
    const rating = latest === null ? START_RATING : num(latest.rating_after);
    /* The streak survives only if the last puzzle played was today or yesterday. */
    const gap = latest === null ? null : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${latest.puzzle_date}T00:00:00Z`)) / 86_400_000);
    const streak = latest === null || gap === null || gap > 1 ? 0 : latest.streak;
    puzzle = puzzleView(day, answer.data ?? null, rating, streak, count ?? 0);
  } catch (error) {
    puzzleError = error instanceof ArenaError ? error.message : "Today's puzzle is unavailable.";
  }

  return {
    profile: { handle: profileRead.data?.handle ?? null, public: profileRead.data?.public ?? false },
    groups,
    points: {
      week,
      budget: WEEKLY_POINTS,
      spent: myBackings.filter((row) => row.week === week).reduce((sum, row) => sum + row.points, 0),
      seasonNet: myBackings.reduce((sum, row) => sum + (row.settled_points ?? 0), 0),
    },
    puzzle,
    puzzleError,
    myCalls: myCalls.slice(0, 50).map((row) => toCallView(row, userId, handles, backings)),
    feed: visibleFeed.map((row) => toCallView(row, userId, handles, backings)),
    calibration: calibration(myCalls.map((row) => ({ status: row.status, confidence: row.confidence, brier: row.brier === null ? null : num(row.brier) }))),
    reviews,
    labelCounts,
    error: null,
  };
}
