import { marketFor } from "@/lib/autotrade/rules";

/* ---------------------------------------------------------------------------
   Calls with receipts. Pure.

   A call is a statement and a probability: "{market} closes above $X at T,
   70% confident". It is scored by the Brier score — the squared distance
   between the confidence and what happened — so a person who says 70% and
   is right 70% of the time scores better than one who says 99% on
   everything. A rating ranks only after `MIN_RATED` settled calls, and
   always shows how many it rests on.

   Tail and fade are points only, from a fixed weekly budget nobody can buy.
--------------------------------------------------------------------------- */

export type Direction = "above" | "below";
export type Visibility = "private" | "groups" | "public";
export type CallStatus = "open" | "hit" | "miss" | "void";

export const MIN_RATED = 10;
export const WEEKLY_POINTS = 100;
export const MIN_HORIZON_MS = 60 * 60_000;
export const MAX_HORIZON_MS = 30 * 24 * 60 * 60_000;
/** Backing closes this long before a call resolves, so nobody backs the last minute. */
export const BACKING_CUTOFF_MS = 60 * 60_000;

export interface CallInput {
  market: string;
  direction: Direction;
  price: number;
  resolvesAt: string;
  confidence: number;
  visibility: Visibility;
}

export function validateCall(input: Record<string, unknown>, now: number): { call: CallInput } | { error: string } {
  const market = marketFor(input.market);
  if (market === null) return { error: "Choose one of Elyra's markets." };
  if (input.direction !== "above" && input.direction !== "below") return { error: "Choose above or below." };
  const price = input.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return { error: "Enter a price." };
  const at = typeof input.resolvesAt === "string" ? Date.parse(input.resolvesAt) : NaN;
  if (!Number.isFinite(at)) return { error: "Choose when the call resolves." };
  if (at - now < MIN_HORIZON_MS) return { error: "A call must resolve at least an hour from now." };
  if (at - now > MAX_HORIZON_MS) return { error: "A call can look at most 30 days ahead." };
  const confidence = input.confidence;
  if (typeof confidence !== "number" || !Number.isInteger(confidence) || confidence < 50 || confidence > 99) {
    return { error: "Confidence is a whole number from 50 to 99." };
  }
  const visibility = input.visibility === "groups" || input.visibility === "public" ? input.visibility : "private";
  /* Resolution on the minute: the settling bar is a one-minute close. */
  const resolvesAt = new Date(Math.floor(at / 60_000) * 60_000).toISOString();
  return { call: { market: market.coin, direction: input.direction, price, resolvesAt, confidence, visibility } };
}

/** The exact text a receipt is computed over. Changing it changes every receipt, so it never changes. */
export function canonicalStatement(call: Pick<CallInput, "market" | "direction" | "price" | "resolvesAt" | "confidence">): string {
  const label = marketFor(call.market)?.label ?? call.market;
  return `${label} closes ${call.direction} $${call.price} at ${call.resolvesAt}, ${call.confidence}% confident`;
}

/** The payload a receipt hashes: the statement and the server's timestamp. */
export function receiptPayload(statement: string, createdAt: string): string {
  return `${statement}|${createdAt}`;
}

export function settleCall(call: { direction: Direction; price: number }, settlingPrice: number): "hit" | "miss" {
  return (call.direction === "above" ? settlingPrice > call.price : settlingPrice < call.price) ? "hit" : "miss";
}

/** (confidence − outcome)². 0 is perfect; a 50% call always scores 0.25. */
export function brierScore(confidence: number, hit: boolean): number {
  const p = confidence / 100;
  return (p - (hit ? 1 : 0)) ** 2;
}

export interface CalibrationBucket {
  label: string;
  calls: number;
  /** What the person said, on average, percent. */
  saidPct: number | null;
  /** How often those calls hit, percent. */
  hitPct: number | null;
}

export interface Calibration {
  settled: number;
  hits: number;
  /** Mean Brier score; lower is better. Null with nothing settled. */
  brier: number | null;
  /** True once there are enough settled calls to rank. */
  rated: boolean;
  buckets: CalibrationBucket[];
}

const BUCKETS: readonly [number, number][] = [
  [50, 59],
  [60, 69],
  [70, 79],
  [80, 89],
  [90, 99],
];

export function calibration(calls: readonly { status: CallStatus; confidence: number; brier: number | null }[]): Calibration {
  const settled = calls.filter((call) => call.status === "hit" || call.status === "miss");
  const scores = settled.map((call) => call.brier ?? brierScore(call.confidence, call.status === "hit"));
  return {
    settled: settled.length,
    hits: settled.filter((call) => call.status === "hit").length,
    brier: scores.length === 0 ? null : scores.reduce((sum, score) => sum + score, 0) / scores.length,
    rated: settled.length >= MIN_RATED,
    buckets: BUCKETS.map(([low, high]) => {
      const inBucket = settled.filter((call) => call.confidence >= low && call.confidence <= high);
      return {
        label: `${low}–${high}%`,
        calls: inBucket.length,
        saidPct: inBucket.length === 0 ? null : inBucket.reduce((sum, call) => sum + call.confidence, 0) / inBucket.length,
        hitPct: inBucket.length === 0 ? null : (inBucket.filter((call) => call.status === "hit").length / inBucket.length) * 100,
      };
    }),
  };
}

/** The ISO week a moment falls in, e.g. "2026-W46" — the points budget's period. */
export function isoWeek(at: number): string {
  const source = new Date(at);
  /* The week belongs to the year its Thursday falls in (ISO 8601). */
  const date = new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), source.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** A backing's points once its call settles: won if the stance matched, lost otherwise, nothing if void. */
export function settleBacking(stance: "tail" | "fade", points: number, status: CallStatus): number {
  if (status === "void" || status === "open") return 0;
  const won = (stance === "tail") === (status === "hit");
  return won ? points : -points;
}

export function validateBacking(
  input: Record<string, unknown>,
  context: { now: number; resolvesAt: string; ownCall: boolean; status: CallStatus; spentThisWeek: number },
): { stance: "tail" | "fade"; points: number } | { error: string } {
  if (context.ownCall) return { error: "You cannot back your own call." };
  if (context.status !== "open") return { error: "That call has settled." };
  if (Date.parse(context.resolvesAt) - context.now < BACKING_CUTOFF_MS) return { error: "Backing closes an hour before a call resolves." };
  if (input.stance !== "tail" && input.stance !== "fade") return { error: "Choose tail or fade." };
  const points = input.points;
  const left = WEEKLY_POINTS - context.spentThisWeek;
  if (typeof points !== "number" || !Number.isInteger(points) || points < 1) return { error: "Back with a whole number of points." };
  if (points > left) return { error: `You have ${left} of this week's ${WEEKLY_POINTS} points left.` };
  return { stance: input.stance, points };
}
