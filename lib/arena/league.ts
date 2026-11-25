import { PERP_MARKETS, marketFor } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Leagues — fantasy sport, played with markets. Pure.

   Friends join a league by code and snake-draft markets: once someone picks
   a market, nobody else in the league can hold it. Then the season runs as a
   string of head-to-head rounds, a day or a week each. A team scores the
   average move of the markets in its lineup over the round; the higher
   score wins. A table ranks the managers, and the top of it at the end of
   the last round is the champion.

   Points and paper only. Nothing here holds, moves or promises money, and
   nothing rewards trading more: a roster is a judgment about which markets
   will do well, made at the draft and changed at most `MOVES_PER_ROUND`
   times a round.

   ── The draft ─────────────────────────────────────────────────────────

   Slots are dealt at random when the owner starts the draft. The order
   snakes: slot 1 picks first in odd rounds and last in even ones. Each pick
   has a clock — two minutes for a live draft night, an hour or eight for a
   slow one — and when it runs out the pick is made for the manager: the
   first market still on the board, in the order `LEAGUE_POOL` lists them.

   ── The season ────────────────────────────────────────────────────────

   The season starts at the first 00:00 UTC after the last pick. Round k
   runs for `roundDays` days from `seasonStart + (k − 1) × roundDays`.

   A round is scored on Hyperliquid's daily bars, which open at 00:00 UTC
   where the previous bar closed: a market's move is the open of the day
   after the round ends over the open of the round's first day, minus one.
   Live, before the round ends, the current mid stands in for the end. A
   team's score is the mean of its markets' moves, in percent. A market with
   no price for the round is left out of the mean; a team with no price at
   all scores nothing, and that matchup is void rather than guessed.

   Scores are compared at two decimals — what the page shows — so a win is
   never invisible. Equal at two decimals is a tie.

   ── Lineups ───────────────────────────────────────────────────────────

   A lineup locks when its round starts. A free-agent move made during round
   k takes effect from round k + 1: the dropped market still counts for k
   and is free for anyone from k + 1. Each roster slot therefore carries the
   first and last round it counts for, and the lineup for any round is read
   from those — no snapshot to take on time.

   ── The table ─────────────────────────────────────────────────────────

   A win is worth 1, a tie ½, a loss 0. Ties on the table break on the sum
   of round scores ("points for", at the two decimals shown), then on fewer
   rounds played (a bye week should not cost a place), then by handle so the
   order is stable. Rows level on all three share a rank.
--------------------------------------------------------------------------- */

export const DAY_MS = 86_400_000;

/** The markets a league drafts from, in auto-pick order: every market Elyra settles on. */
export const LEAGUE_POOL: readonly string[] = PERP_MARKETS.map((market) => market.coin);

export const MIN_MANAGERS = 2;
export const MAX_MANAGERS = 10;
export const ROSTER_SIZES = [3, 4, 5, 6] as const;
export const MIN_ROUNDS = 3;
export const MAX_ROUNDS = 12;
export const ROUND_LENGTHS = [1, 7] as const;
/** Two minutes (a live draft night), an hour, eight hours. */
export const PICK_CLOCKS = [120, 3_600, 28_800] as const;
export const MOVES_PER_ROUND = 2;
/** Leagues a person can be in at once, not counting finished ones. */
export const MAX_LEAGUES = 5;
/** A round is settled this long after it ends, once the next daily bar has opened. */
export const SETTLE_AFTER_MS = 10 * 60_000;

export type LeagueStatus = "forming" | "drafting" | "active" | "done";
export type MatchupResult = "home" | "away" | "tie" | "void";

export interface LeagueSettings {
  name: string;
  rosterSize: number;
  rounds: number;
  roundDays: number;
  pickSeconds: number;
}

const isOneOf = (value: unknown, options: readonly number[]): value is number => typeof value === "number" && options.includes(value);

export function validateLeague(input: Record<string, unknown>): { settings: LeagueSettings } | { error: string } {
  const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
  if (name.length === 0) return { error: "Name the league." };
  if (name.length > 40) return { error: "A league name is at most 40 characters." };
  if (!isOneOf(input.rosterSize, ROSTER_SIZES)) return { error: `A roster holds ${ROSTER_SIZES[0]} to ${ROSTER_SIZES.at(-1)} markets.` };
  const rounds = input.rounds;
  if (typeof rounds !== "number" || !Number.isInteger(rounds) || rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    return { error: `A season is ${MIN_ROUNDS} to ${MAX_ROUNDS} rounds.` };
  }
  if (!isOneOf(input.roundDays, ROUND_LENGTHS)) return { error: "A round is a day or a week." };
  if (!isOneOf(input.pickSeconds, PICK_CLOCKS)) return { error: "Choose a pick clock." };
  return { settings: { name, rosterSize: input.rosterSize, rounds, roundDays: input.roundDays, pickSeconds: input.pickSeconds } };
}

/** How many managers a league of this roster size holds: the board must fill every roster. */
export function capacity(rosterSize: number): number {
  return Math.min(MAX_MANAGERS, Math.floor(LEAGUE_POOL.length / rosterSize));
}

/** Whether a draft of this size can start. */
export function draftFits(managers: number, rosterSize: number): boolean {
  return managers >= MIN_MANAGERS && managers <= capacity(rosterSize);
}

export const totalPicks = (managers: number, rosterSize: number): number => managers * rosterSize;

/** The draft round (1-based) of overall pick `pick` (0-based). */
export const draftRoundOf = (pick: number, managers: number): number => Math.floor(pick / managers) + 1;

/** The slot (0-based) on the clock at overall pick `pick`: a snake. */
export function slotOnClock(pick: number, managers: number): number {
  const round = Math.floor(pick / managers);
  const within = pick % managers;
  return round % 2 === 0 ? within : managers - 1 - within;
}

/**
 * Who is on the clock: the snake, from the number of picks made, skipping
 * anyone whose roster is already full. Null once every roster is full.
 *
 * The skip matters only after a manager has left mid-draft — a deleted
 * account takes its picks with it — when the snake carries on over the
 * managers who are left and nobody drafts more than a roster.
 */
export function managerOnClock(order: readonly string[], made: ReadonlyMap<string, number>, rosterSize: number): string | null {
  const count = (id: string) => made.get(id) ?? 0;
  const total = order.reduce((sum, id) => sum + count(id), 0);
  if (total >= totalPicks(order.length, rosterSize)) return null;
  /* Two laps of the snake from here pass every manager at least twice. */
  for (let step = 0; step < order.length * 2; step += 1) {
    const id = order[slotOnClock(total + step, order.length)];
    if (count(id) < rosterSize) return id;
  }
  return null;
}

/** When pick `pick` runs out of time: the clock starts at the previous pick, or at the draft's start. */
export function pickDeadline(clockStartedAt: number, pickSeconds: number): number {
  return clockStartedAt + pickSeconds * 1000;
}

/** The pick made for a manager whose clock ran out: the first market still on the board. */
export function autoPick(taken: ReadonlySet<string>): string | null {
  return LEAGUE_POOL.find((coin) => !taken.has(coin)) ?? null;
}

/** The first 00:00 UTC strictly after `at`. */
export function nextUtcMidnight(at: number): number {
  return (Math.floor(at / DAY_MS) + 1) * DAY_MS;
}

/** The UTC date of a moment, YYYY-MM-DD. */
export const dayOf = (at: number): string => new Date(at).toISOString().slice(0, 10);

/**
 * Which round is under way: 0 before the season starts, 1…rounds during it,
 * rounds + 1 once the last round has ended.
 */
export function roundAt(now: number, seasonStart: number, roundDays: number, rounds: number): number {
  if (now < seasonStart) return 0;
  return Math.min(rounds + 1, Math.floor((now - seasonStart) / (roundDays * DAY_MS)) + 1);
}

export function roundWindow(round: number, seasonStart: number, roundDays: number): { startsAt: number; endsAt: number } {
  const startsAt = seasonStart + (round - 1) * roundDays * DAY_MS;
  return { startsAt, endsAt: startsAt + roundDays * DAY_MS };
}

export interface Fixture {
  round: number;
  home: string;
  /** Null is a bye. */
  away: string | null;
}

/**
 * A round-robin by the circle method, cycled if the season is longer than
 * one full turn. `managers` is in draft-slot order; with an odd count, one
 * manager sits out each round. Home and away alternate so nobody is always
 * listed first.
 */
export function schedule(managers: readonly string[], rounds: number): Fixture[] {
  const seats: (string | null)[] = [...managers];
  if (seats.length % 2 === 1) seats.push(null);
  const n = seats.length;
  if (n < 2) return [];
  const fixtures: Fixture[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const turn = (round - 1) % (n - 1);
    /* Seat 0 stays; the rest rotate by `turn`. */
    const order = [seats[0], ...seats.slice(1).map((_, index, rest) => rest[(index + turn) % rest.length])];
    for (let index = 0; index < n / 2; index += 1) {
      let a = order[index];
      let b = order[n - 1 - index];
      if ((round + index) % 2 === 0) [a, b] = [b, a];
      if (a === null && b === null) continue;
      if (a === null) fixtures.push({ round, home: b as string, away: null });
      else fixtures.push({ round, home: a, away: b });
    }
  }
  return fixtures;
}

export interface RosterSlot {
  owner: string;
  market: string;
  fromRound: number;
  /** The last round it counts for; null while still held. */
  toRound: number | null;
}

/** The markets that count for `owner` in `round`. */
export function lineupFor(slots: readonly RosterSlot[], owner: string, round: number): string[] {
  return slots
    .filter((slot) => slot.owner === owner && slot.fromRound <= round && (slot.toRound === null || slot.toRound >= round))
    .map((slot) => slot.market);
}

/** What a manager holds now — the roster they can change. */
export function heldBy(slots: readonly RosterSlot[], owner: string): string[] {
  return slots.filter((slot) => slot.owner === owner && slot.toRound === null).map((slot) => slot.market);
}

/** A market's move between two prices, in percent; null without two good prices. */
export function movePct(start: number | undefined, end: number | undefined): number | null {
  if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end) || start <= 0 || end <= 0) return null;
  return (end / start - 1) * 100;
}

export interface TeamScore {
  /** Mean move of the scored markets, percent; null when none could be scored. */
  pct: number | null;
  markets: { market: string; pct: number | null }[];
}

export function teamScore(lineup: readonly string[], starts: ReadonlyMap<string, number>, ends: ReadonlyMap<string, number>): TeamScore {
  const markets = lineup.map((market) => ({ market, pct: movePct(starts.get(market), ends.get(market)) }));
  const scored = markets.filter((entry): entry is { market: string; pct: number } => entry.pct !== null);
  return { pct: scored.length === 0 ? null : scored.reduce((sum, entry) => sum + entry.pct, 0) / scored.length, markets };
}

const twoDecimals = (value: number): number => Math.round(value * 100);

export function matchupResult(home: number | null, away: number | null): MatchupResult {
  if (home === null || away === null) return "void";
  const a = twoDecimals(home);
  const b = twoDecimals(away);
  return a === b ? "tie" : a > b ? "home" : "away";
}

export interface SettledMatchup {
  round: number;
  home: string;
  away: string | null;
  homePct: number | null;
  awayPct: number | null;
  result: MatchupResult | null;
}

export interface StandingRow {
  manager: string;
  wins: number;
  losses: number;
  ties: number;
  played: number;
  /** Sum of round scores, percent. */
  pointsFor: number;
}

/** The table. `nameOf` gives each manager's handle, the last tie-break; the id breaks a tie only between equal handles. */
export function standings(managers: readonly string[], matchups: readonly SettledMatchup[], nameOf: (manager: string) => string = (manager) => manager): StandingRow[] {
  const rows = new Map(managers.map((manager) => [manager, { manager, wins: 0, losses: 0, ties: 0, played: 0, pointsFor: 0 }]));
  for (const matchup of matchups) {
    if (matchup.away === null || matchup.result === null || matchup.result === "void") continue;
    const home = rows.get(matchup.home);
    const away = rows.get(matchup.away);
    if (home === undefined || away === undefined) continue;
    home.played += 1;
    away.played += 1;
    home.pointsFor += matchup.homePct ?? 0;
    away.pointsFor += matchup.awayPct ?? 0;
    if (matchup.result === "tie") {
      home.ties += 1;
      away.ties += 1;
    } else if (matchup.result === "home") {
      home.wins += 1;
      away.losses += 1;
    } else {
      away.wins += 1;
      home.losses += 1;
    }
  }
  return [...rows.values()].sort(
    (a, b) =>
      tableScore(b) - tableScore(a) ||
      tablePoints(b) - tablePoints(a) ||
      a.played - b.played ||
      nameOf(a.manager).localeCompare(nameOf(b.manager)) ||
      a.manager.localeCompare(b.manager),
  );
}

const tableScore = (row: StandingRow) => row.wins + row.ties / 2;
/* Points for, at the two decimals the table shows: a place is never decided by a difference nobody can see. */
const tablePoints = (row: StandingRow) => Math.round(row.pointsFor * 100);

/** Two rows level on everything but the handle: they share a rank. */
export const levelOnTable = (a: StandingRow, b: StandingRow): boolean =>
  tableScore(a) === tableScore(b) && tablePoints(a) === tablePoints(b) && a.played === b.played;

export const recordText = (row: Pick<StandingRow, "wins" | "losses" | "ties">): string =>
  row.ties > 0 ? `${row.wins}–${row.losses}–${row.ties}` : `${row.wins}–${row.losses}`;

/** "+3.21%" / "−0.40%", the way every league score is written. */
export function pctText(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 100) / 100;
  if (rounded === 0) return "0.00%";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}%`;
}

export interface MoveContext {
  status: LeagueStatus;
  /** The round under way now (0 before the season). */
  round: number;
  rounds: number;
  held: readonly string[];
  /** Every market any manager holds now. */
  taken: ReadonlySet<string>;
  movesThisRound: number;
}

/** A free-agent move: drop one market, add one nobody holds. Takes effect next round. */
export function validateMove(input: Record<string, unknown>, context: MoveContext): { drop: string; add: string } | { error: string } {
  if (context.status !== "active") return { error: context.status === "done" ? "The season is over." : "Moves open once the draft is done." };
  if (context.round >= context.rounds) return { error: "The last round is under way; a move now would never count." };
  if (context.movesThisRound >= MOVES_PER_ROUND) return { error: `You have made this round's ${MOVES_PER_ROUND} moves.` };
  const drop = marketFor(input.drop)?.coin;
  const add = marketFor(input.add)?.coin;
  if (drop === undefined || !context.held.includes(drop)) return { error: "Choose a market on your roster to drop." };
  if (add === undefined || !LEAGUE_POOL.includes(add)) return { error: "Choose a market to add." };
  if (context.taken.has(add)) return { error: "Someone in the league already holds that market." };
  return { drop, add };
}

export function validatePick(input: Record<string, unknown>, taken: ReadonlySet<string>): { market: string } | { error: string } {
  const market = marketFor(input.market)?.coin;
  if (market === undefined || !LEAGUE_POOL.includes(market)) return { error: "Choose one of the league's markets." };
  if (taken.has(market)) return { error: "That market is already drafted." };
  return { market };
}

export const marketName = (coin: string): string => marketFor(coin)?.label ?? coin;

/* ---- the round recap: facts for the commentator, and the code's own words ---- */

export interface RecapInput {
  league: string;
  round: number;
  rounds: number;
  matchups: { home: string; away: string | null; homePct: number | null; awayPct: number | null; result: MatchupResult | null }[];
  /** Every scored market this round and who started it. */
  markets: { market: string; manager: string; pct: number }[];
}

export function recapFacts(input: RecapInput): string[] {
  const lines = [`League: ${input.league}`, `Round ${input.round} of ${input.rounds}`];
  for (const m of input.matchups) {
    if (m.away === null) {
      lines.push(`@${m.home} had a bye`);
      continue;
    }
    if (m.result === "void" || m.result === null) {
      lines.push(`@${m.home} against @${m.away}: no prices, no result`);
      continue;
    }
    const [winner, loser, wPct, lPct] =
      m.result === "away" ? [m.away, m.home, m.awayPct, m.homePct] : [m.home, m.away, m.homePct, m.awayPct];
    lines.push(m.result === "tie" ? `@${m.home} ${pctText(m.homePct)} tied @${m.away} ${pctText(m.awayPct)}` : `@${winner} ${pctText(wPct)} beat @${loser} ${pctText(lPct)}`);
  }
  const ranked = [...input.markets].sort((a, b) => b.pct - a.pct);
  const best = ranked[0];
  const worst = ranked.at(-1);
  if (best !== undefined) lines.push(`Best market started: ${marketName(best.market)} ${pctText(best.pct)}, for @${best.manager}`);
  if (worst !== undefined && worst !== best) lines.push(`Worst market started: ${marketName(worst.market)} ${pctText(worst.pct)}, for @${worst.manager}`);
  return lines;
}

export function fallbackRecap(input: RecapInput): string {
  const decided = input.matchups.filter((m) => m.away !== null && (m.result === "home" || m.result === "away"));
  const widest = [...decided].sort(
    (a, b) => Math.abs((b.homePct ?? 0) - (b.awayPct ?? 0)) - Math.abs((a.homePct ?? 0) - (a.awayPct ?? 0)),
  )[0];
  const ranked = [...input.markets].sort((a, b) => b.pct - a.pct);
  const parts = [`Round ${input.round} of ${input.rounds} is in the books.`];
  if (widest !== undefined) {
    const homeWon = widest.result === "home";
    parts.push(
      `@${homeWon ? widest.home : widest.away} beat @${homeWon ? widest.away : widest.home}, ${pctText(homeWon ? widest.homePct : widest.awayPct)} to ${pctText(homeWon ? widest.awayPct : widest.homePct)}.`,
    );
  }
  if (ranked.length > 0) parts.push(`${marketName(ranked[0].market)} carried @${ranked[0].manager} at ${pctText(ranked[0].pct)}.`);
  return parts.join(" ");
}

/** A matchup from one manager's side. "pending" until the round is settled. */
export type Outcome = "won" | "lost" | "tied" | "void" | "pending";

export function outcomeFor(result: MatchupResult | null, home: boolean): Outcome {
  if (result === null) return "pending";
  if (result === "void") return "void";
  if (result === "tie") return "tied";
  return (result === "home") === home ? "won" : "lost";
}

/** "Elyra League · Round 3 · @ana +3.21% beat @ben −0.40%" — no emoji, like the puzzle's. */
export function matchupShare(round: number, me: string, them: string | null, mine: number | null, theirs: number | null, outcome: Outcome): string {
  const head = `Elyra League · Round ${round}`;
  if (them === null) return `${head} · @${me} had a bye`;
  if (outcome === "won") return `${head} · @${me} ${pctText(mine)} beat @${them} ${pctText(theirs)}`;
  if (outcome === "lost") return `${head} · @${them} ${pctText(theirs)} beat @${me} ${pctText(mine)}`;
  if (outcome === "tied") return `${head} · @${me} ${pctText(mine)} tied @${them} ${pctText(theirs)}`;
  return `${head} · @${me} ${pctText(mine)} against @${them} ${pctText(theirs)}`;
}
