import { MIN_RATED } from "@/lib/arena/calls";

/* ---------------------------------------------------------------------------
   The ladders. Pure.

   Two tables, both scored on judgment, never on volume, size or profit:

     - Puzzle: the daily puzzle's rating, highest first. Ranked after
       `MIN_PUZZLES_RANKED` answers, so a lucky first day is not a title.
     - Calls: the mean Brier score of settled calls, lowest first (0 is
       perfect; always saying 50% scores 0.25). Ranked after `MIN_RATED`
       settled calls.

   A person appears by handle only. On the everyone ladder, only people who
   made their profile public; on a group's, the group's members who chose a
   handle. Every row shows the sample it rests on.
--------------------------------------------------------------------------- */

export const MIN_PUZZLES_RANKED = 5;
export const LADDER_LENGTH = 25;

export interface LadderEntrant {
  userId: string;
  handle: string | null;
  puzzleRating: number | null;
  puzzlePlayed: number;
  callsSettled: number;
  callsBrier: number | null;
}

export interface LadderRow {
  rank: number;
  handle: string;
  /** The rating, or the Brier score. */
  value: number;
  /** Puzzles answered, or calls settled. */
  sample: number;
  me: boolean;
}

export type LadderKind = "puzzle" | "calls";

export function qualifies(entrant: LadderEntrant, kind: LadderKind): boolean {
  if (entrant.handle === null) return false;
  return kind === "puzzle"
    ? entrant.puzzleRating !== null && entrant.puzzlePlayed >= MIN_PUZZLES_RANKED
    : entrant.callsBrier !== null && entrant.callsSettled >= MIN_RATED;
}

/**
 * The top of a ladder, plus the viewer's own row if they rank below it.
 * Equal values share a rank ("1, 2, 2, 4"); ties order by sample, then handle.
 */
export function rankLadder(entrants: readonly LadderEntrant[], kind: LadderKind, viewer: string, length = LADDER_LENGTH): LadderRow[] {
  const value = (entrant: LadderEntrant) => (kind === "puzzle" ? (entrant.puzzleRating as number) : (entrant.callsBrier as number));
  const sample = (entrant: LadderEntrant) => (kind === "puzzle" ? entrant.puzzlePlayed : entrant.callsSettled);
  const unique = [...new Map(entrants.map((entrant) => [entrant.userId, entrant])).values()];
  const sorted = unique
    .filter((entrant) => qualifies(entrant, kind))
    .sort((a, b) => {
      const byValue = kind === "puzzle" ? value(b) - value(a) : value(a) - value(b);
      return byValue || sample(b) - sample(a) || (a.handle as string).localeCompare(b.handle as string);
    });
  const rows: LadderRow[] = [];
  let rank = 0;
  sorted.forEach((entrant, index) => {
    /* Compared as shown: a rating to the point, a Brier score to three places. */
    const shown = (e: LadderEntrant) => (kind === "puzzle" ? Math.round(value(e)) : Math.round(value(e) * 1000));
    if (index === 0 || shown(entrant) !== shown(sorted[index - 1])) rank = index + 1;
    rows.push({ rank, handle: entrant.handle as string, value: value(entrant), sample: sample(entrant), me: entrant.userId === viewer });
  });
  const top = rows.slice(0, length);
  const mine = rows.find((row) => row.me);
  return mine !== undefined && !top.includes(mine) ? [...top, mine] : top;
}
