import "server-only";

import {
  SETTLE_AFTER_MS,
  DAY_MS,
  fallbackRecap,
  marketName,
  matchupResult,
  matchupShare,
  outcomeFor,
  pctText,
  recapFacts,
  roundWindow,
  standings,
  totalPicks,
  type RecapInput,
} from "@/lib/arena/league";
import { advanceDraft, clockFor, ensureSchedule, loadLeagues, scoreRound, type LeagueBundle } from "@/lib/arena/leagues";
import { writeFromFacts } from "@/lib/arena/writer";
import { num } from "@/lib/autotrade/store";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Leagues' part of Arena's tick:

     1. drafts: make the picks whose clocks ran out (so a slow draft moves
        even when nobody has the page open), tell the manager on the clock
        once per pick in a slow draft, and tell every manager when the draft
        is done;
     2. rounds: settle each round once it has ended and the next daily bar
        has opened — one round per league per run, at most
        `LEAGUE_SETTLE_CAP` a run — then tell each manager their result and
        write the commentator's recap from the computed facts;
     3. the last round settled: the league is done, and the top of the table
        is its champion.

   A settlement waits while Hyperliquid cannot be reached, for up to a day;
   after that a market with no price is left out of its team's score, and a
   team with no price at all makes its matchup void. Never guessed.

   Every live league is looked at on every run, in batches of `LOAD_BATCH`
   oldest first, so none is left out however many there are. Each notice is
   a compare-and-set on `notified_pick`, so two overlapping runs send it
   once.
--------------------------------------------------------------------------- */

export const LEAGUE_SETTLE_CAP = 4;
/** Leagues read together; small enough that the id list stays a short request. */
const LOAD_BATCH = 40;
const ID_PAGE = 1_000;
/** A pick clock this long or longer is a slow draft: its managers are told when they are up. */
const SLOW_DRAFT_SECONDS = 3_600;
/** `notified_pick` once everyone has been told the draft is done. */
const DRAFT_DONE = -1;

export type Notify = (userId: string, title: string, lines: string[]) => Promise<void>;

export interface LeagueReport {
  autoPicks: number;
  roundsSettled: number;
  recaps: number;
  finished: number;
  notes: string[];
}

const handle = (bundle: LeagueBundle, userId: string) => `@${bundle.handles.get(userId) ?? "a manager"}`;

const clockText = (deadline: number) => `${new Date(deadline).toISOString().slice(11, 16)} UTC on ${new Date(deadline).toISOString().slice(0, 10)}`;

/** Every league drafting or under way, oldest first; null when they cannot be read. */
async function liveLeagueIds(): Promise<string[] | null> {
  const db = serviceClient();
  const ids: string[] = [];
  for (let from = 0; ; from += ID_PAGE) {
    const page = await db
      .from("arena_leagues")
      .select("id")
      .in("status", ["drafting", "active"])
      .order("created_at", { ascending: true })
      .range(from, from + ID_PAGE - 1);
    if (page.error !== null) return from === 0 ? null : ids;
    const rows = page.data ?? [];
    ids.push(...rows.map((row) => row.id));
    if (rows.length < ID_PAGE) return ids;
  }
}

/** Claims a notice by moving `notified_pick` from the value read to `to`; only one run gets the row back. */
async function claimNotice(bundle: LeagueBundle, to: number, status: "drafting" | "active"): Promise<boolean> {
  const from = bundle.league.notified_pick;
  const update = serviceClient().from("arena_leagues").update({ notified_pick: to }).eq("id", bundle.league.id).eq("status", status);
  const claimed = await (from === null ? update.is("notified_pick", null) : update.eq("notified_pick", from)).select("id");
  if ((claimed.data ?? []).length === 0) return false;
  bundle.league.notified_pick = to;
  return true;
}

export async function runLeagues(now: number, notify: Notify): Promise<LeagueReport> {
  const report: LeagueReport = { autoPicks: 0, roundsSettled: 0, recaps: 0, finished: 0, notes: [] };
  const ids = await liveLeagueIds();
  if (ids === null) return report;
  const settled = { count: 0 };
  for (let start = 0; start < ids.length; start += LOAD_BATCH) {
    const bundles = await loadLeagues(ids.slice(start, start + LOAD_BATCH));
    await runBatch(bundles, now, notify, report, settled);
  }
  return report;
}

async function runBatch(bundles: Map<string, LeagueBundle>, now: number, notify: Notify, report: LeagueReport, settled: { count: number }): Promise<void> {
  const db = serviceClient();

  /* ---- 1. drafts ---- */
  for (const bundle of bundles.values()) {
    if (bundle.league.status !== "drafting") continue;
    try {
      const autoBefore = bundle.picks.filter((pick) => pick.auto).length;
      await advanceDraft(bundle, now);
      report.autoPicks += bundle.picks.filter((pick) => pick.auto).length - autoBefore;
      const clock = clockFor(bundle);
      if (clock !== null && bundle.league.pick_seconds >= SLOW_DRAFT_SECONDS && bundle.league.notified_pick !== clock.pick && (await claimNotice(bundle, clock.pick, "drafting"))) {
        await notify(clock.userId, `Your pick in ${bundle.league.name}`, [
          `Pick ${clock.made + 1} of ${totalPicks(bundle.managers.length, bundle.league.roster_size)} is yours.`,
          `The clock runs out at ${clockText(clock.deadline)}; then the first market on the board is picked for you.`,
        ]);
      }
    } catch (error) {
      report.notes.push(`draft ${bundle.league.id}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  /* ---- 1b. drafts that finished (here, or on someone's last pick): tell everyone once ---- */
  for (const bundle of bundles.values()) {
    if (bundle.league.status !== "active" || bundle.league.season_starts_at === null) continue;
    /* "Done" is written as -1: a pick number is never negative, so it cannot be mistaken for one. */
    if (bundle.league.notified_pick === DRAFT_DONE) continue;
    if (!(await claimNotice(bundle, DRAFT_DONE, "active"))) continue;
    const starts = Date.parse(bundle.league.season_starts_at);
    if (now >= starts + DAY_MS) continue;
    for (const manager of bundle.managers) {
      const roster = bundle.slots.filter((slot) => slot.user_id === manager.user_id).map((slot) => marketName(slot.market));
      await notify(manager.user_id, `${bundle.league.name}: the draft is done`, [
        `Your roster: ${roster.join(", ")}.`,
        `Round 1 starts at ${clockText(starts)}.`,
      ]);
    }
  }

  /* ---- 2. rounds ---- */
  for (const bundle of bundles.values()) {
    if (settled.count >= LEAGUE_SETTLE_CAP) break;
    const { league } = bundle;
    if (league.status !== "active" || league.season_starts_at === null) continue;
    const seasonStart = Date.parse(league.season_starts_at);
    if (bundle.matchups.length === 0) await ensureSchedule(bundle);
    const open = bundle.matchups.filter((row) => row.result === null).map((row) => row.round);
    if (open.length === 0) {
      if (bundle.matchups.length > 0) await finish(bundle, notify, report);
      continue;
    }
    const round = Math.min(...open);
    const window = roundWindow(round, seasonStart, league.round_days);
    if (now < window.endsAt + SETTLE_AFTER_MS) continue;
    try {
      const { scores, failed } = await scoreRound(bundle, round, now);
      if (failed.size > 0 && now < window.endsAt + DAY_MS) {
        report.notes.push(`league ${league.id} round ${round}: waiting on ${[...failed].join(", ")}`);
        continue;
      }
      settled.count += 1;
      const recap: RecapInput = { league: league.name, round, rounds: league.rounds, matchups: [], markets: [] };
      for (const row of bundle.matchups.filter((matchup) => matchup.round === round)) {
        const home = scores.get(row.home_id) ?? { pct: null, markets: [] };
        const away = row.away_id === null ? null : (scores.get(row.away_id) ?? { pct: null, markets: [] });
        const result = away === null ? "void" : matchupResult(home.pct, away.pct);
        const write = await db
          .from("arena_league_matchups")
          .update({
            home_pct: home.pct === null ? null : Number(home.pct.toFixed(4)),
            away_pct: away === null || away.pct === null ? null : Number(away.pct.toFixed(4)),
            result,
            facts: { home: home.markets, away: away?.markets ?? [], source: "Hyperliquid daily opens" },
            settled_at: new Date(now).toISOString(),
          })
          .eq("league_id", league.id)
          .eq("round", round)
          .eq("home_id", row.home_id)
          .is("result", null)
          .select("*");
        if ((write.data ?? []).length === 0) continue;
        Object.assign(row, write.data?.[0] ?? {});
        recap.matchups.push({
          home: bundle.handles.get(row.home_id) ?? "a manager",
          away: row.away_id === null ? null : (bundle.handles.get(row.away_id) ?? "a manager"),
          homePct: home.pct,
          awayPct: away?.pct ?? null,
          result: row.away_id === null ? null : result,
        });
        for (const [userId, side] of [[row.home_id, home], [row.away_id, away]] as const) {
          if (userId === null || side === null) continue;
          for (const entry of side.markets) {
            if (entry.pct !== null) recap.markets.push({ market: entry.market, manager: bundle.handles.get(userId) ?? "a manager", pct: entry.pct });
          }
        }
        await tellResult(bundle, row.round, row.home_id, row.away_id, home.pct, away?.pct ?? null, result, notify);
      }
      report.roundsSettled += 1;
      if (recap.matchups.length > 0) {
        const facts = recapFacts(recap);
        const text = await writeFromFacts(
          "Write a short, dry round recap for this league of friends: who beat whom and which market carried or sank a team. Gentle ribbing is welcome; advice is not.",
          facts,
          fallbackRecap(recap),
        );
        const inserted = await db.from("arena_league_recaps").insert({ league_id: league.id, round, text: text.text, model: text.model, facts });
        if (inserted.error === null) {
          report.recaps += 1;
          bundle.recaps.set(round, text.text);
        }
      }
      if (bundle.matchups.every((row) => row.result !== null)) await finish(bundle, notify, report);
    } catch (error) {
      report.notes.push(`league ${league.id} round ${round}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }
}

async function tellResult(
  bundle: LeagueBundle,
  round: number,
  homeId: string,
  awayId: string | null,
  homePct: number | null,
  awayPct: number | null,
  result: ReturnType<typeof matchupResult>,
  notify: Notify,
): Promise<void> {
  const name = bundle.league.name;
  if (awayId === null) {
    await notify(homeId, `${name}: round ${round}`, [`You had a bye. Your markets moved ${pctText(homePct)}, which does not count.`]);
    return;
  }
  for (const [me, them, mine, theirs, home] of [
    [homeId, awayId, homePct, awayPct, true],
    [awayId, homeId, awayPct, homePct, false],
  ] as const) {
    const outcome = outcomeFor(result, home);
    const verb = outcome === "won" ? "You won" : outcome === "lost" ? "You lost" : outcome === "tied" ? "You tied" : "No result";
    await notify(me, `${name}: round ${round}`, [
      `${verb} against ${handle(bundle, them)}, ${pctText(mine)} to ${pctText(theirs)}.`,
      matchupShare(round, bundle.handles.get(me) ?? "a manager", bundle.handles.get(them) ?? "a manager", mine, theirs, outcome),
    ]);
  }
}

/** Every round settled: the league is done, and the top of the table is its champion. */
async function finish(bundle: LeagueBundle, notify: Notify, report: LeagueReport): Promise<void> {
  const order = bundle.managers.map((manager) => manager.user_id);
  const table = standings(
    order,
    bundle.matchups.map((row) => ({
      round: row.round,
      home: row.home_id,
      away: row.away_id,
      homePct: row.home_pct === null ? null : num(row.home_pct),
      awayPct: row.away_pct === null ? null : num(row.away_pct),
      result: row.result,
    })),
    (id) => bundle.handles.get(id) ?? id,
  );
  const champion = table[0]?.manager ?? null;
  const done = await serviceClient()
    .from("arena_leagues")
    .update({ status: "done", champion_id: champion })
    .eq("id", bundle.league.id)
    .eq("status", "active")
    .select("id");
  if ((done.data ?? []).length === 0) return;
  bundle.league.status = "done";
  report.finished += 1;
  if (champion === null) return;
  const top = table[0];
  for (const manager of order) {
    await notify(manager, `${bundle.league.name}: the season is over`, [
      manager === champion
        ? `You are the champion, ${top.wins}–${top.losses}${top.ties > 0 ? `–${top.ties}` : ""}.`
        : `${handle(bundle, champion)} is the champion, ${top.wins}–${top.losses}${top.ties > 0 ? `–${top.ties}` : ""}.`,
    ]);
  }
}
