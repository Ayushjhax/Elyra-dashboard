/* ---------------------------------------------------------------------------
   The daily chart puzzle. Pure.

   One real historical chart per UTC day, the same for everyone, chosen from
   the date alone: a market, a moment between 20 and 180 days back, 72 hourly
   bars up to it. The next 12 bars are hidden. The player says up or down,
   with a confidence, and the chart is revealed.

   The market and the date stay hidden until the answer is in, and prices are
   rebased so the first close is 100 — otherwise the answer is a search away.

   ── The rating: Elo-style, scored on calibration ──────────────────────

     q      = the confidence put on what actually happened (p if right,
              1 − p if wrong)
     score  = 1 − (1 − q)²        (one minus the Brier score)
     rating += K × (score − 0.75)  with K = 32

   0.75 is what a 50/50 answer scores, so a coin-flip never moves the rating;
   confidence that turns out right gains a little (at most +8), confidence
   that turns out wrong costs a lot (up to about −23). Saying 90% only pays
   if you are right about nine times in ten. Ratings start at 1500.

   ── Beat the bot ──────────────────────────────────────────────────────

   Coin-flip bot: always 50% — its rating is 1500 forever, by the formula.
   Momentum bot: says the chart continues the way its last 12 bars went, at
   60%. Its rating evolves puzzle by puzzle like anyone's.
--------------------------------------------------------------------------- */

export const PUZZLE_MARKETS = ["BTC", "ETH", "SOL", "HYPE", "BNB", "XRP", "AVAX", "LINK", "SUI", "DOGE"] as const;
export const VISIBLE_BARS = 72;
export const HIDDEN_BARS = 12;
export const INTERVAL = "1h";
export const START_RATING = 1500;
export const K_FACTOR = 32;
export const NEUTRAL_SCORE = 0.75;
export const BOT_CONFIDENCE = 60;
/** Puzzle #1 was 11 November 2026. */
export const FIRST_PUZZLE = "2026-11-11";

export type UpDown = "up" | "down";

export interface Bar {
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

/** FNV-1a: a small, stable hash, so a date always picks the same puzzle. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function puzzleNumber(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${FIRST_PUZZLE}T00:00:00Z`)) / 86_400_000) + 1;
}

/** The UTC date of a moment, as YYYY-MM-DD. */
export function utcDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Which market and which moment a date's puzzle uses. */
export function puzzleSpec(date: string): { market: string; endsAt: number; startAt: number; revealUntil: number } {
  const seed = fnv1a(`elyra-puzzle:${date}`);
  const market = PUZZLE_MARKETS[seed % PUZZLE_MARKETS.length];
  const daysBack = 20 + ((seed >>> 8) % 161);
  const hour = (seed >>> 16) % 24;
  const endsAt = Date.parse(`${date}T00:00:00Z`) - daysBack * 86_400_000 + hour * 3_600_000;
  return {
    market,
    endsAt,
    startAt: endsAt - VISIBLE_BARS * 3_600_000,
    revealUntil: endsAt + HIDDEN_BARS * 3_600_000,
  };
}

/** Bars rebased so the first visible close is 100. */
export function rebase(bars: readonly Bar[], base: number): Bar[] {
  const scale = (value: number) => Number(((value / base) * 100).toFixed(4));
  return bars.map((bar) => ({ ...bar, open: scale(bar.open), high: scale(bar.high), low: scale(bar.low), close: scale(bar.close) }));
}

export interface BuiltPuzzle {
  visible: Bar[];
  reveal: Bar[];
  outcome: UpDown;
  changePct: number;
  botDirection: UpDown;
}

/**
 * Splits fetched bars into what is shown and what is hidden. Null when there
 * are not enough bars to make a fair puzzle.
 */
export function buildPuzzle(bars: readonly Bar[], spec: { endsAt: number }): BuiltPuzzle | null {
  const sorted = [...bars].sort((a, b) => a.openTime - b.openTime);
  const visibleRaw = sorted.filter((bar) => bar.closeTime <= spec.endsAt).slice(-VISIBLE_BARS);
  const hiddenRaw = sorted.filter((bar) => bar.openTime >= spec.endsAt - 1).slice(0, HIDDEN_BARS);
  if (visibleRaw.length < VISIBLE_BARS || hiddenRaw.length < HIDDEN_BARS) return null;
  const base = visibleRaw[0].close;
  const last = visibleRaw[visibleRaw.length - 1].close;
  const final = hiddenRaw[hiddenRaw.length - 1].close;
  const lookback = visibleRaw[visibleRaw.length - 1 - HIDDEN_BARS].close;
  return {
    visible: rebase(visibleRaw, base),
    reveal: rebase(hiddenRaw, base),
    /* Up only if strictly higher; an exact tie counts as down. */
    outcome: final > last ? "up" : "down",
    changePct: ((final - last) / last) * 100,
    botDirection: last > lookback ? "up" : "down",
  };
}

export function ratingScore(confidence: number, correct: boolean): number {
  const p = confidence / 100;
  const q = correct ? p : 1 - p;
  return 1 - (1 - q) ** 2;
}

export function nextRating(rating: number, confidence: number, correct: boolean): number {
  return Number((rating + K_FACTOR * (ratingScore(confidence, correct) - NEUTRAL_SCORE)).toFixed(2));
}

/** Days in a row played, given the last day played before today. */
export function nextStreak(previous: { date: string; streak: number } | null, today: string): number {
  if (previous === null) return 1;
  const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${previous.date}T00:00:00Z`)) / 86_400_000);
  return gap === 1 ? previous.streak + 1 : gap === 0 ? previous.streak : 1;
}

/** Wordle-style, without emoji: "Elyra Puzzle #41 · Up 70% · Correct · Rating 1,512 (+14)". */
export function shareText(input: { number: number; direction: UpDown; confidence: number; correct: boolean; ratingAfter: number; ratingBefore: number }): string {
  const delta = Math.round(input.ratingAfter - input.ratingBefore);
  return `Elyra Puzzle #${input.number} · ${input.direction === "up" ? "Up" : "Down"} ${input.confidence}% · ${input.correct ? "Correct" : "Wrong"} · Rating ${Math.round(input.ratingAfter).toLocaleString("en-US")} (${delta >= 0 ? "+" : ""}${delta})`;
}
