import "server-only";

import { randomInt } from "node:crypto";
import { ArenaError, inviteCode } from "@/lib/arena/errors";
import {
  DAY_MS,
  LEAGUE_POOL,
  MAX_LEAGUES,
  MIN_MANAGERS,
  MOVES_PER_ROUND,
  autoPick,
  capacity,
  dayOf,
  draftFits,
  draftRoundOf,
  heldBy,
  levelOnTable,
  lineupFor,
  managerOnClock,
  matchupShare,
  nextUtcMidnight,
  outcomeFor,
  pickDeadline,
  recordText,
  roundAt,
  roundWindow,
  schedule,
  standings,
  teamScore,
  totalPicks,
  validateLeague,
  validateMove,
  validatePick,
  type RosterSlot,
  type SettledMatchup,
  type TeamScore,
} from "@/lib/arena/league";
import type { LeagueMarketScore, LeagueMatchupView, LeagueRoundView, LeagueSide, LeagueSummary, LeagueView } from "@/lib/arena/types";
import { allMids, hyperliquidCandles } from "@/lib/autotrade/hyperliquid";
import { dexOf } from "@/lib/autotrade/rules";
import { num } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";
import type { ArenaLeagueManagerRow, ArenaLeagueMatchupRow, ArenaLeaguePickRow, ArenaLeagueRow, ArenaLeagueSlotRow } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   Leagues, server side: every write a league takes, the read its page
   makes, and the prices both score with. The rules are in
   lib/arena/league.ts; this file applies them to the database.

   A league is visible only to its managers, and a manager is shown only by
   handle — joining needs one, and nobody is ever named by wallet or id.

   Two things happen lazily, on whichever request comes first, so a league
   never waits for the five-minute tick to be right:
     - a pick whose clock has run out is made for its manager (at the moment
       the clock ran out, so the next clock starts from there), and
     - the draft's last pick turns the league active and writes its
       schedule.
   Both are guarded by the database — a pick is unique by number and by
   market, and the league moves on only from 'drafting' — so two requests
   racing each other cannot make a pick twice.

   Joining, dealing the draft and making a pick are each one database
   function (0036): a join cannot land while the slots are dealt or take a
   league past capacity, and a pick is never written without its roster
   slot.

   Settling a round is the tick's alone (lib/arena/leagueEngine.ts), so each
   result is written, and announced, once.
--------------------------------------------------------------------------- */

const MIGRATION = "Leagues need database migration 0036, which has not been applied.";

export interface LeagueBundle {
  league: ArenaLeagueRow;
  managers: ArenaLeagueManagerRow[];
  picks: ArenaLeaguePickRow[];
  slots: ArenaLeagueSlotRow[];
  matchups: ArenaLeagueMatchupRow[];
  recaps: Map<number, string>;
  handles: Map<string, string>;
}

const byPick = (a: ArenaLeaguePickRow, b: ArenaLeaguePickRow) => a.pick - b.pick;

export async function loadLeagues(ids: readonly string[]): Promise<Map<string, LeagueBundle>> {
  const bundles = new Map<string, LeagueBundle>();
  if (ids.length === 0) return bundles;
  const db = serviceClient();
  const wanted = [...new Set(ids)];
  const [leagues, managers, picks, slots, matchups, recaps] = await Promise.all([
    db.from("arena_leagues").select("*").in("id", wanted),
    db.from("arena_league_managers").select("*").in("league_id", wanted),
    db.from("arena_league_picks").select("*").in("league_id", wanted),
    db.from("arena_league_slots").select("*").in("league_id", wanted),
    db.from("arena_league_matchups").select("*").in("league_id", wanted),
    db.from("arena_league_recaps").select("*").in("league_id", wanted),
  ]);
  if (leagues.error !== null || managers.error !== null) throw new ArenaError(MIGRATION, 503);
  const people = [...new Set((managers.data ?? []).map((row) => row.user_id))];
  const profiles = people.length === 0 ? { data: [] } : await db.from("arena_profiles").select("*").in("user_id", people);
  const handles = new Map<string, string>();
  for (const profile of profiles.data ?? []) if (typeof profile.handle === "string") handles.set(profile.user_id, profile.handle);
  for (const league of leagues.data ?? []) {
    bundles.set(league.id, {
      league,
      managers: (managers.data ?? []).filter((row) => row.league_id === league.id),
      picks: (picks.data ?? []).filter((row) => row.league_id === league.id).sort(byPick),
      slots: (slots.data ?? []).filter((row) => row.league_id === league.id),
      matchups: (matchups.data ?? []).filter((row) => row.league_id === league.id),
      recaps: new Map((recaps.data ?? []).filter((row) => row.league_id === league.id).map((row) => [row.round, row.text])),
      handles,
    });
  }
  return bundles;
}

async function memberBundle(userId: string, leagueId: string): Promise<LeagueBundle> {
  const bundle = (await loadLeagues([leagueId])).get(leagueId);
  if (bundle === undefined || !bundle.managers.some((manager) => manager.user_id === userId)) throw new ArenaError("No such league.", 404);
  return bundle;
}

/** A manager's handle; joining needs one, so a missing handle is shown as a role, never as anything that identifies them. */
const handleOf = (bundle: LeagueBundle, userId: string): string => bundle.handles.get(userId) ?? "a manager";

/** Managers in draft order once slots are dealt, otherwise in joining order. */
function draftOrder(bundle: LeagueBundle): string[] {
  return [...bundle.managers]
    .sort((a, b) => (a.draft_slot ?? 99) - (b.draft_slot ?? 99) || a.joined_at.localeCompare(b.joined_at))
    .map((manager) => manager.user_id);
}

const rosterSlots = (bundle: LeagueBundle): RosterSlot[] =>
  bundle.slots.map((slot) => ({ owner: slot.user_id, market: slot.market, fromRound: slot.from_round, toRound: slot.to_round }));

async function handleFor(userId: string): Promise<string | null> {
  const { data } = await serviceClient().from("arena_profiles").select("*").eq("user_id", userId).maybeSingle();
  return data?.handle ?? null;
}

async function leaguesInPlay(userId: string): Promise<number> {
  const db = serviceClient();
  const mine = await db.from("arena_league_managers").select("league_id").eq("user_id", userId);
  const ids = (mine.data ?? []).map((row) => row.league_id);
  if (ids.length === 0) return 0;
  const { data } = await db.from("arena_leagues").select("id, status").in("id", ids);
  return (data ?? []).filter((row) => row.status !== "done").length;
}

const NEEDS_HANDLE = "Choose an Arena handle first — it is how your league sees you.";

/* ---- forming ---- */

export async function createLeague(userId: string, input: Record<string, unknown>): Promise<string> {
  const checked = validateLeague(input);
  if ("error" in checked) throw new ArenaError(checked.error);
  if ((await handleFor(userId)) === null) throw new ArenaError(NEEDS_HANDLE);
  if ((await leaguesInPlay(userId)) >= MAX_LEAGUES) throw new ArenaError(`You can be in ${MAX_LEAGUES} leagues at once.`);
  const { settings } = checked;
  const db = serviceClient();
  /* An invite code collides about once in a trillion; try again rather than fail. */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data, error } = await db
      .from("arena_leagues")
      .insert({
        name: settings.name,
        invite_code: inviteCode(),
        owner_id: userId,
        roster_size: settings.rosterSize,
        rounds: settings.rounds,
        round_days: settings.roundDays,
        pick_seconds: settings.pickSeconds,
        status: "forming",
        draft_started_at: null,
        season_starts_at: null,
        notified_pick: null,
        champion_id: null,
      })
      .select("id")
      .single();
    if (error === null && data !== null) {
      await db.from("arena_league_managers").insert({ league_id: data.id, user_id: userId, draft_slot: null, joined_at: new Date().toISOString() });
      return data.id;
    }
    if (error.code !== "23505") break;
  }
  throw new ArenaError(MIGRATION, 503);
}

export async function joinLeague(userId: string, code: unknown): Promise<string> {
  const text = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (text.length === 0) throw new ArenaError("Enter the league's invite code.");
  const db = serviceClient();
  const { data: league, error } = await db.from("arena_leagues").select("*").eq("invite_code", text).maybeSingle();
  if (error !== null) throw new ArenaError(MIGRATION, 503);
  if (league === null || league === undefined) throw new ArenaError("No league has that invite code.", 404);
  const members = await db.from("arena_league_managers").select("*").eq("league_id", league.id);
  if ((members.data ?? []).some((row) => row.user_id === userId)) return league.id;
  if (league.status !== "forming") throw new ArenaError("That league's draft has started, so it is closed to new managers.");
  if ((await handleFor(userId)) === null) throw new ArenaError(NEEDS_HANDLE);
  if ((members.data ?? []).length >= capacity(league.roster_size)) throw new ArenaError("That league is full.");
  if ((await leaguesInPlay(userId)) >= MAX_LEAGUES) throw new ArenaError(`You can be in ${MAX_LEAGUES} leagues at once.`);
  /* The checks above answer the usual case kindly; the function decides under the league's lock. */
  const joined = await db.rpc("arena_league_join", { p_league: league.id, p_user: userId, p_capacity: capacity(league.roster_size) });
  if (joined.error !== null) throw new ArenaError("You could not join that league just now.", 503);
  if (joined.data === "closed") throw new ArenaError("That league's draft has started, so it is closed to new managers.");
  if (joined.data === "full") throw new ArenaError("That league is full.");
  if (joined.data !== "joined" && joined.data !== "member") throw new ArenaError("No league has that invite code.", 404);
  return league.id;
}

export async function leaveLeague(userId: string, leagueId: string): Promise<"left" | "deleted"> {
  const bundle = await memberBundle(userId, leagueId);
  if (bundle.league.status !== "forming") throw new ArenaError("Once the draft starts, a league plays to the end.");
  const db = serviceClient();
  if (bundle.league.owner_id === userId) {
    await db.from("arena_leagues").delete().eq("id", leagueId).eq("owner_id", userId).eq("status", "forming");
    return "deleted";
  }
  await db.from("arena_league_managers").delete().eq("league_id", leagueId).eq("user_id", userId);
  return "left";
}

export async function startDraft(userId: string, leagueId: string, now: number): Promise<void> {
  /* Someone joining or leaving between the read and the deal makes the function refuse; read again and redraw. */
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bundle = await memberBundle(userId, leagueId);
    const { league } = bundle;
    if (league.owner_id !== userId) throw new ArenaError("Only the league's owner can start the draft.", 403);
    if (league.status !== "forming") throw new ArenaError("The draft has already started.");
    const ids = bundle.managers.map((manager) => manager.user_id);
    if (ids.length < MIN_MANAGERS) throw new ArenaError("A league needs at least two managers to draft. Send the code to a friend.");
    if (!draftFits(ids.length, league.roster_size)) throw new ArenaError("Too many managers for this roster size.");
    /* Fisher–Yates with the platform's randomness: nobody can predict or choose a slot. */
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const other = randomInt(index + 1);
      [ids[index], ids[other]] = [ids[other], ids[index]];
    }
    const started = await serviceClient().rpc("arena_league_start", { p_league: leagueId, p_owner: userId, p_order: ids, p_at: new Date(now).toISOString() });
    if (started.error !== null) throw new ArenaError("The draft could not be started just now.", 503);
    if (started.data === "ok") return;
    if (started.data === "started") throw new ArenaError("The draft has already started.");
    if (started.data === "not_owner") throw new ArenaError("Only the league's owner can start the draft.", 403);
    if (started.data === "missing") throw new ArenaError("No such league.", 404);
  }
  throw new ArenaError("Managers are joining or leaving right now. Start the draft again in a moment.", 409);
}

/* ---- the draft ---- */

/** Writes a pick and its roster slot together; false when the draft is not under way or someone made this pick first. */
async function recordPick(bundle: LeagueBundle, pick: number, userId: string, market: string, auto: boolean, at: number): Promise<boolean> {
  const pickedAt = new Date(at).toISOString();
  const { data: slotId, error } = await serviceClient().rpc("arena_league_pick", {
    p_league: bundle.league.id,
    p_pick: pick,
    p_user: userId,
    p_market: market,
    p_auto: auto,
    p_at: pickedAt,
  });
  if (error !== null || typeof slotId !== "string") return false;
  bundle.picks.push({ league_id: bundle.league.id, pick, user_id: userId, market, auto, picked_at: pickedAt });
  bundle.slots.push({ id: slotId, league_id: bundle.league.id, user_id: userId, market, from_round: 1, to_round: null, via: "draft", created_at: pickedAt });
  return true;
}

/** The last pick made: the league goes active and gets its schedule. Safe to call twice. */
async function finishDraft(bundle: LeagueBundle): Promise<void> {
  const last = bundle.picks.at(-1);
  if (last === undefined) return;
  const seasonStart = nextUtcMidnight(Date.parse(last.picked_at));
  const db = serviceClient();
  await db
    .from("arena_leagues")
    .update({ status: "active", season_starts_at: new Date(seasonStart).toISOString() })
    .eq("id", bundle.league.id)
    .eq("status", "drafting");
  bundle.league = { ...bundle.league, status: "active", season_starts_at: new Date(seasonStart).toISOString() };
  await ensureSchedule(bundle);
}

/**
 * Writes an active league's fixtures if they are missing. Idempotent — the
 * fixtures follow from the draft order alone, and a repeat is ignored by the
 * primary key — so the tick can heal a league whose last pick's request died
 * between going active and writing its schedule.
 */
export async function ensureSchedule(bundle: LeagueBundle): Promise<void> {
  const db = serviceClient();
  const fixtures = schedule(draftOrder(bundle), bundle.league.rounds).map((fixture) => ({
    league_id: bundle.league.id,
    round: fixture.round,
    home_id: fixture.home,
    away_id: fixture.away,
    home_pct: null,
    away_pct: null,
    result: null,
    facts: null,
    settled_at: null,
  }));
  await db.from("arena_league_matchups").upsert(fixtures, { onConflict: "league_id,round,home_id", ignoreDuplicates: true });
  const written = await db.from("arena_league_matchups").select("*").eq("league_id", bundle.league.id);
  bundle.matchups = written.data ?? [];
}

/** Picks made so far by each manager still in the league. */
function picksByManager(bundle: LeagueBundle): Map<string, number> {
  const made = new Map(bundle.managers.map((manager) => [manager.user_id, 0]));
  for (const pick of bundle.picks) {
    const count = made.get(pick.user_id);
    if (count !== undefined) made.set(pick.user_id, count + 1);
  }
  return made;
}

/** Every manager still in the league has a full roster. */
const draftComplete = (bundle: LeagueBundle): boolean => managerOnClock(draftOrder(bundle), picksByManager(bundle), bundle.league.roster_size) === null;

/**
 * The clock for the pick under way, or null once the draft is done or not
 * started. `pick` is the number the next pick is written under — one past
 * the last, so it never collides with a pick already made even when a
 * departed manager's picks have gone — and `made` how many picks have been
 * made, which is what the page counts.
 */
export function clockFor(bundle: LeagueBundle): { pick: number; made: number; userId: string; deadline: number } | null {
  const { league } = bundle;
  if (league.status !== "drafting" || league.draft_started_at === null) return null;
  const counts = picksByManager(bundle);
  const userId = managerOnClock(draftOrder(bundle), counts, league.roster_size);
  if (userId === null) return null;
  const last = bundle.picks.at(-1);
  const started = last === undefined ? Date.parse(league.draft_started_at) : Date.parse(last.picked_at);
  const made = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return { pick: last === undefined ? 0 : last.pick + 1, made, userId, deadline: pickDeadline(started, league.pick_seconds) };
}

/**
 * Makes every pick whose clock has run out, then finishes the draft if it is
 * full. Returns whether anything changed. The bundle is updated in place.
 */
export async function advanceDraft(bundle: LeagueBundle, now: number): Promise<boolean> {
  let changed = false;
  const order = draftOrder(bundle);
  const total = totalPicks(order.length, bundle.league.roster_size);
  for (let guard = 0; guard <= total && bundle.league.status === "drafting"; guard += 1) {
    if (draftComplete(bundle)) {
      await finishDraft(bundle);
      return true;
    }
    const clock = clockFor(bundle);
    if (clock === null || now < clock.deadline) break;
    const market = autoPick(new Set(bundle.picks.map((pick) => pick.market)));
    if (market === null) break;
    if (!(await recordPick(bundle, clock.pick, clock.userId, market, true, clock.deadline))) {
      /* Someone else made this pick first: read the draft again and carry on. */
      const fresh = (await loadLeagues([bundle.league.id])).get(bundle.league.id);
      if (fresh === undefined) break;
      Object.assign(bundle, fresh);
    }
    changed = true;
  }
  return changed;
}

export async function makePick(userId: string, leagueId: string, input: Record<string, unknown>, now: number): Promise<void> {
  const bundle = await memberBundle(userId, leagueId);
  await advanceDraft(bundle, now);
  if (bundle.league.status !== "drafting") throw new ArenaError(bundle.league.status === "forming" ? "The draft has not started." : "The draft is over.");
  const clock = clockFor(bundle);
  if (clock === null) throw new ArenaError("The draft is over.");
  if (clock.userId !== userId) throw new ArenaError(`It is @${handleOf(bundle, clock.userId)}'s pick.`);
  const checked = validatePick(input, new Set(bundle.picks.map((pick) => pick.market)));
  if ("error" in checked) throw new ArenaError(checked.error);
  if (!(await recordPick(bundle, clock.pick, userId, checked.market, false, now))) throw new ArenaError("That pick was just made. Look at the board again.", 409);
  if (draftComplete(bundle)) await finishDraft(bundle);
}

/* ---- the season ---- */

export function currentRound(league: ArenaLeagueRow, now: number): number {
  if (league.season_starts_at === null) return 0;
  return roundAt(now, Date.parse(league.season_starts_at), league.round_days, league.rounds);
}

export async function moveMarket(userId: string, leagueId: string, input: Record<string, unknown>, now: number): Promise<void> {
  const bundle = await memberBundle(userId, leagueId);
  const round = currentRound(bundle.league, now);
  const slots = rosterSlots(bundle);
  const checked = validateMove(input, {
    status: bundle.league.status,
    round,
    rounds: bundle.league.rounds,
    held: heldBy(slots, userId),
    taken: new Set(slots.filter((slot) => slot.toRound === null).map((slot) => slot.market)),
    movesThisRound: movesMade(bundle, userId, round),
  });
  if ("error" in checked) throw new ArenaError(checked.error);
  const db = serviceClient();
  /* Add first: the held-market index refuses it if someone got there first, and nothing has changed yet. */
  const added = await db
    .from("arena_league_slots")
    .insert({ league_id: leagueId, user_id: userId, market: checked.add, from_round: round + 1, to_round: null, via: "free_agent" })
    .select("*")
    .single();
  if (added.error !== null || added.data === null) throw new ArenaError("Someone just added that market.", 409);
  const dropped = await db
    .from("arena_league_slots")
    .update({ to_round: round })
    .eq("league_id", leagueId)
    .eq("user_id", userId)
    .eq("market", checked.drop)
    .is("to_round", null)
    .select("*");
  if ((dropped.data ?? []).length === 0) {
    await db.from("arena_league_slots").delete().eq("id", added.data.id).eq("user_id", userId);
    throw new ArenaError("That market is no longer on your roster.", 409);
  }
}

/** Free-agent moves a manager has made during `round`: each one adds a slot that counts from the next. */
export function movesMade(bundle: LeagueBundle, userId: string, round: number): number {
  return bundle.slots.filter((slot) => slot.user_id === userId && slot.via === "free_agent" && slot.from_round === round + 1).length;
}

/* ---- prices ---- */

const openKey = (market: string, day: string) => `${market}|${day}`;

/**
 * Hyperliquid's daily open for each (market, day) asked for, from the cache
 * or fetched and cached. A day that has not begun has no open yet. `failed`
 * names markets Hyperliquid could not be asked about — a settlement waits for
 * those rather than scoring without them.
 */
export async function dailyOpens(pairs: readonly { market: string; day: string }[], now: number): Promise<{ opens: Map<string, number>; failed: Set<string> }> {
  const opens = new Map<string, number>();
  const failed = new Set<string>();
  const wanted = [...new Map(pairs.map((pair) => [openKey(pair.market, pair.day), pair])).values()];
  if (wanted.length === 0) return { opens, failed };
  const db = serviceClient();
  const markets = [...new Set(wanted.map((pair) => pair.market))];
  const days = [...new Set(wanted.map((pair) => pair.day))];
  const cached = await db.from("arena_market_opens").select("*").in("market", markets).in("day", days);
  for (const row of cached.data ?? []) opens.set(openKey(row.market, String(row.day).slice(0, 10)), num(row.open));

  const missing = wanted.filter((pair) => !opens.has(openKey(pair.market, pair.day)) && Date.parse(`${pair.day}T00:00:00Z`) <= now);
  const byMarket = new Map<string, number[]>();
  for (const pair of missing) byMarket.set(pair.market, [...(byMarket.get(pair.market) ?? []), Date.parse(`${pair.day}T00:00:00Z`)]);
  const fetched = await Promise.all(
    [...byMarket].map(async ([market, starts]) => {
      try {
        const bars = await hyperliquidCandles(market, "1d", Math.min(...starts), Math.max(...starts) + DAY_MS - 1);
        return bars
          .filter((bar) => bar.openTime % DAY_MS === 0 && Number.isFinite(bar.open) && bar.open > 0 && bar.openTime <= now)
          .map((bar) => ({ market, day: dayOf(bar.openTime), open: bar.open }));
      } catch {
        failed.add(market);
        return [];
      }
    }),
  );
  const rows = fetched.flat();
  for (const row of rows) opens.set(openKey(row.market, row.day), row.open);
  if (rows.length > 0) await db.from("arena_market_opens").upsert(rows, { onConflict: "market,day", ignoreDuplicates: true });
  return { opens, failed };
}

let midsCache: { at: number; mids: Map<string, number> } | null = null;
const MIDS_TTL_MS = 15_000;

/** Current mids for the markets asked for: one read per exchange, shared for a few seconds. */
export async function currentMids(markets: readonly string[], now: number = Date.now()): Promise<Map<string, number>> {
  if (midsCache !== null && now - midsCache.at < MIDS_TTL_MS && markets.every((market) => midsCache?.mids.has(market))) return midsCache.mids;
  const dexes = [...new Set(markets.map((market) => dexOf(market)))];
  const answers = await Promise.all(dexes.map((dex) => allMids("mainnet", dex).catch(() => ({}) as Record<string, string>)));
  const mids = new Map<string, number>();
  for (const answer of answers) {
    for (const [coin, value] of Object.entries(answer)) {
      const mid = Number(value);
      if (Number.isFinite(mid) && mid > 0) mids.set(coin, mid);
    }
  }
  midsCache = { at: now, mids };
  return mids;
}

/** Every manager's score for `round`, against the current mid while it is under way, or the closing open once it has ended. */
export async function scoreRound(bundle: LeagueBundle, round: number, now: number): Promise<{ scores: Map<string, TeamScore>; failed: Set<string>; live: boolean }> {
  const seasonStart = Date.parse(bundle.league.season_starts_at as string);
  const window = roundWindow(round, seasonStart, bundle.league.round_days);
  const slots = rosterSlots(bundle);
  const lineups = new Map(bundle.managers.map((manager) => [manager.user_id, lineupFor(slots, manager.user_id, round)]));
  const markets = [...new Set([...lineups.values()].flat())];
  const startDay = dayOf(window.startsAt);
  const endDay = dayOf(window.endsAt);
  const live = now < window.endsAt;
  const { opens, failed } = await dailyOpens(
    markets.flatMap((market) => (live ? [{ market, day: startDay }] : [{ market, day: startDay }, { market, day: endDay }])),
    now,
  );
  const starts = new Map<string, number>();
  const ends = new Map<string, number>();
  for (const market of markets) {
    const start = opens.get(openKey(market, startDay));
    if (start !== undefined) starts.set(market, start);
    const end = live ? undefined : opens.get(openKey(market, endDay));
    if (end !== undefined) ends.set(market, end);
  }
  if (live) for (const [market, mid] of await currentMids(markets, now)) if (markets.includes(market)) ends.set(market, mid);
  return { scores: new Map([...lineups].map(([id, lineup]) => [id, teamScore(lineup, starts, ends)])), failed, live };
}

/* ---- the read ---- */

const toMarkets = (value: unknown): LeagueMarketScore[] =>
  Array.isArray(value)
    ? value
        .filter((entry): entry is { market: string; pct: number | null } => typeof entry === "object" && entry !== null && typeof (entry as { market?: unknown }).market === "string")
        .map((entry) => ({ market: entry.market, pct: typeof entry.pct === "number" ? entry.pct : null }))
    : [];

const settledOf = (row: ArenaLeagueMatchupRow): SettledMatchup => ({
  round: row.round,
  home: row.home_id,
  away: row.away_id,
  homePct: row.home_pct === null ? null : num(row.home_pct),
  awayPct: row.away_pct === null ? null : num(row.away_pct),
  result: row.result,
});

function matchupView(
  bundle: LeagueBundle,
  row: ArenaLeagueMatchupRow,
  viewer: string,
  live: Map<string, TeamScore> | null,
  lineups: Map<string, string[]> | null,
): LeagueMatchupView {
  const facts = (row.facts ?? {}) as { home?: unknown; away?: unknown };
  const side = (userId: string, stored: string | number | null, storedMarkets: unknown): LeagueSide => {
    const score = live?.get(userId);
    if (row.result === null && score !== undefined) {
      return { handle: handleOf(bundle, userId), me: userId === viewer, pct: score.pct, markets: score.markets };
    }
    const markets = row.result === null ? (lineups?.get(userId) ?? []).map((market) => ({ market, pct: null })) : toMarkets(storedMarkets);
    return { handle: handleOf(bundle, userId), me: userId === viewer, pct: stored === null ? null : num(stored), markets };
  };
  return {
    round: row.round,
    home: side(row.home_id, row.home_pct, facts.home),
    away: row.away_id === null ? null : side(row.away_id, row.away_pct, facts.away),
    result: row.result,
    live: row.result === null && live !== null,
  };
}

/** A league as its page shows it. Expired pick clocks are resolved first. */
export async function leagueView(userId: string, leagueId: string, now: number): Promise<LeagueView> {
  const bundle = await memberBundle(userId, leagueId);
  await advanceDraft(bundle, now);
  return buildView(bundle, userId, now);
}

async function buildView(bundle: LeagueBundle, viewer: string, now: number): Promise<LeagueView> {
  const { league } = bundle;
  const order = draftOrder(bundle);
  const slots = rosterSlots(bundle);
  const round = currentRound(league, now);
  const clock = clockFor(bundle);
  const taken = new Set(slots.filter((slot) => slot.toRound === null).map((slot) => slot.market));
  const drafted = new Set(bundle.picks.map((pick) => pick.market));

  /* The round under way is scored live; before the season, round 1's fixtures are shown unscored. */
  const showRound = league.status === "active" ? Math.max(1, Math.min(round, league.rounds)) : null;
  let live: Map<string, TeamScore> | null = null;
  if (league.status === "active" && round >= 1 && round <= league.rounds) {
    live = (await scoreRound(bundle, round, now).catch(() => null))?.scores ?? null;
  }
  const lineupsFor = (r: number) => new Map(order.map((id) => [id, lineupFor(slots, id, r)]));

  const seasonStart = league.season_starts_at === null ? null : Date.parse(league.season_starts_at);
  const rounds = [...new Set(bundle.matchups.map((row) => row.round))].sort((a, b) => a - b);
  const scheduleView: LeagueRoundView[] =
    seasonStart === null
      ? []
      : rounds.map((r) => {
          const window = roundWindow(r, seasonStart, league.round_days);
          const rows = bundle.matchups.filter((row) => row.round === r).sort((a, b) => a.home_id.localeCompare(b.home_id));
          const current = r === showRound;
          return {
            round: r,
            startsAt: new Date(window.startsAt).toISOString(),
            endsAt: new Date(window.endsAt).toISOString(),
            matchups: rows.map((row) => matchupView(bundle, row, viewer, current && round === r ? live : null, current ? lineupsFor(r) : null)),
            recap: bundle.recaps.get(r) ?? null,
          };
        });

  const table = standings(order, bundle.matchups.map(settledOf), (id) => handleOf(bundle, id));
  let rank = 0;
  const standingsView = table.map((row, index) => {
    const previous = table[index - 1];
    if (previous === undefined || !levelOnTable(previous, row)) rank = index + 1;
    /* By handle only: the manager's id stays on the server. */
    return { rank, handle: handleOf(bundle, row.manager), me: row.manager === viewer, wins: row.wins, losses: row.losses, ties: row.ties, played: row.played, pointsFor: row.pointsFor };
  });

  const mineAt = (r: number | null) => scheduleView.find((entry) => entry.round === r)?.matchups.find((m) => m.home.me || m.away?.me) ?? null;
  const lastSettled = [...bundle.matchups]
    .filter((row) => row.result !== null && (row.home_id === viewer || row.away_id === viewer))
    .sort((a, b) => b.round - a.round)[0];
  let share: string | null = null;
  if (lastSettled !== undefined) {
    const home = lastSettled.home_id === viewer;
    const them = home ? lastSettled.away_id : lastSettled.home_id;
    const mine = home ? lastSettled.home_pct : lastSettled.away_pct;
    const theirs = home ? lastSettled.away_pct : lastSettled.home_pct;
    share = matchupShare(
      lastSettled.round,
      handleOf(bundle, viewer),
      them === null ? null : handleOf(bundle, them),
      mine === null ? null : num(mine),
      theirs === null ? null : num(theirs),
      outcomeFor(lastSettled.result, home),
    );
  }

  const lineupRound = Math.max(1, Math.min(round, league.rounds));
  return {
    id: league.id,
    name: league.name,
    inviteCode: league.invite_code,
    owner: league.owner_id === viewer,
    status: league.status,
    rosterSize: league.roster_size,
    rounds: league.rounds,
    roundDays: league.round_days,
    pickSeconds: league.pick_seconds,
    managers: order.map((id) => ({ handle: handleOf(bundle, id), me: id === viewer, owner: id === league.owner_id })),
    draft: {
      total: totalPicks(order.length, league.roster_size),
      /* Counted in order, not by stored number: a departed manager's picks leave gaps in the numbers. */
      picks: bundle.picks.map((pick, index) => ({
        pick: index,
        round: draftRoundOf(index, order.length),
        handle: handleOf(bundle, pick.user_id),
        me: pick.user_id === viewer,
        market: pick.market,
        auto: pick.auto,
      })),
      onClock: clock === null ? null : { handle: handleOf(bundle, clock.userId), me: clock.userId === viewer, deadline: new Date(clock.deadline).toISOString(), pick: clock.made },
      board: LEAGUE_POOL.filter((market) => !drafted.has(market)),
    },
    season: seasonStart === null ? null : { startsAt: new Date(seasonStart).toISOString(), round },
    rosters: order.map((id) => ({
      handle: handleOf(bundle, id),
      me: id === viewer,
      lineup: lineupFor(slots, id, lineupRound),
      held: heldBy(slots, id),
    })),
    freeAgents: league.status === "active" ? LEAGUE_POOL.filter((market) => !taken.has(market)) : [],
    movesLeft: league.status === "active" && round < league.rounds ? Math.max(0, MOVES_PER_ROUND - movesMade(bundle, viewer, round)) : 0,
    schedule: scheduleView,
    standings: standingsView,
    champion: league.champion_id === null ? null : handleOf(bundle, league.champion_id),
    myMatchup: mineAt(showRound),
    share,
  };
}

/** The viewer's leagues for the Arena's front page: where each stands, and this round's score. */
export async function leagueSummaries(userId: string, now: number): Promise<LeagueSummary[]> {
  const db = serviceClient();
  const mine = await db.from("arena_league_managers").select("league_id").eq("user_id", userId);
  if (mine.error !== null) return [];
  const bundles = await loadLeagues((mine.data ?? []).map((row) => row.league_id));
  const summaries: LeagueSummary[] = [];
  for (const bundle of bundles.values()) {
    await advanceDraft(bundle, now).catch(() => false);
    const view = await buildView(bundle, userId, now);
    const me = view.standings.find((row) => row.me) ?? null;
    const matchup = view.myMatchup;
    const home = matchup?.home.me === true;
    const mySide = matchup === null ? null : home ? matchup.home : matchup.away;
    const theirSide = matchup === null ? null : home ? matchup.away : matchup.home;
    summaries.push({
      id: view.id,
      name: view.name,
      status: view.status,
      managers: view.managers.length,
      round: view.season?.round ?? 0,
      rounds: view.rounds,
      roundDays: view.roundDays,
      rank: me === null || view.status === "forming" || view.status === "drafting" ? null : me.rank,
      record: me === null || view.status === "forming" || view.status === "drafting" ? null : recordText(me),
      onClock: view.draft.onClock === null ? null : { handle: view.draft.onClock.handle, me: view.draft.onClock.me, deadline: view.draft.onClock.deadline },
      matchup:
        matchup === null || mySide === null
          ? null
          : {
              opponent: theirSide?.handle ?? null,
              mine: mySide.pct,
              theirs: theirSide?.pct ?? null,
              outcome: outcomeFor(matchup.result, home),
              live: matchup.live,
            },
      champion: view.champion,
    });
  }
  const order = { drafting: 0, active: 1, forming: 2, done: 3 } as const;
  return summaries.sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
}
