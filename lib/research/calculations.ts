/* ---------------------------------------------------------------------------
   Financial arithmetic, done here so a model never does it.

   A language model asked to compute year-over-year growth from two figures
   will usually be right. "Usually" is the problem: the output carries no
   signal about which time it was, and a wrong growth rate in a report with a
   source appendix is more dangerous than one in a chat reply, because the
   citations make it look checked.

   So every derived number in a research report comes from this file, and the
   models are given the results to explain.

   Pure — no I/O, no clock, no `server-only` — so each rule below is directly
   testable.

   ── Null is a real answer here ─────────────────────────────────────────

   Every function returns null rather than a plausible number when the inputs
   cannot support one. A margin on zero revenue, growth from a prior period of
   zero, a ratio with a missing operand: all of these have a conventional
   "answer" that is either infinite or meaningless, and printing it is worse
   than leaving the cell empty.
--------------------------------------------------------------------------- */

/**
 * Change between two periods, as a percentage.
 *
 * Null when the base is zero or negative. Growth "from zero" is not a
 * percentage — it is division by zero wearing a suit — and growth from a
 * negative base inverts its own sign: a loss narrowing from -100 to -50 is an
 * improvement, but (−50 − −100)/−100 reports −50%, which reads as a decline.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null;
  if (previous < 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Year-over-year growth. The same arithmetic, named for how it is read. */
export const yearOverYear = percentChange;

/** Quarter-over-quarter growth. */
export const quarterOverQuarter = percentChange;

/**
 * A margin, as a percentage of revenue.
 *
 * Null on non-positive revenue. A company with no revenue has no margin, and
 * a negative denominator produces a sign-flipped figure.
 */
export function margin(component: number, revenue: number): number | null {
  if (!Number.isFinite(component) || !Number.isFinite(revenue)) return null;
  if (revenue <= 0) return null;
  return (component / revenue) * 100;
}

/**
 * A change in margin, in PERCENTAGE POINTS.
 *
 * Margins are compared in points, never in percent. A move from 60% to 75% is
 * fifteen points and a 25% relative increase; reporting the second as "margin
 * rose 25%" is the single most common way a financial summary misleads.
 */
export function marginChangePoints(
  current: number | null,
  previous: number | null,
): number | null {
  if (current === null || previous === null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

/**
 * Free cash flow: operating cash flow less capital expenditure.
 *
 * Capex is reported as a positive outflow by some issuers and a negative one
 * by others, so its magnitude is used. FCF has no single authoritative
 * definition — this is the common one and the report says which it used.
 */
export function freeCashFlow(
  operatingCashFlow: number | null,
  capitalExpenditure: number | null,
): number | null {
  if (operatingCashFlow === null || capitalExpenditure === null) return null;
  if (!Number.isFinite(operatingCashFlow) || !Number.isFinite(capitalExpenditure)) {
    return null;
  }
  return operatingCashFlow - Math.abs(capitalExpenditure);
}

/** The midpoint of a guidance range. */
export function guidanceMidpoint(low: number | null, high: number | null): number | null {
  if (low === null || high === null) return null;
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (high < low) return null;
  return (low + high) / 2;
}

/**
 * Whether two figures agree once rounding is allowed for.
 *
 * Cross-referencing a filing against a press release routinely finds
 * $96,221M against $96.2B — the same number to the precision each source
 * chose to publish. Flagging that as a conflict would bury the real conflicts
 * in noise; ignoring the difference entirely would hide a genuine
 * restatement.
 */
export function agreesWithinRounding(
  a: number,
  b: number,
  tolerancePct = 0.5,
): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return (Math.abs(a - b) / scale) * 100 <= tolerancePct;
}

export type AgreementStatus =
  | "confirmed"
  | "minor_rounding_difference"
  | "conflict"
  | "single_source"
  | "unavailable";

/**
 * How a set of independently sourced values for one fact relate.
 *
 * `single_source` is deliberately its own status rather than being folded
 * into `confirmed`. One source agreeing with itself is not corroboration, and
 * a report that renders both the same way tells the reader a figure was
 * checked when it was not.
 */
export function agreementOf(values: number[], tolerancePct = 0.5): AgreementStatus {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return "unavailable";
  if (usable.length === 1) return "single_source";

  const [first, ...rest] = usable;

  if (rest.every((value) => value === first)) return "confirmed";
  if (rest.every((value) => agreesWithinRounding(first, value, tolerancePct))) {
    return "minor_rounding_difference";
  }
  return "conflict";
}

/* ---------------------------------------------------------------------------
   Supply events
--------------------------------------------------------------------------- */

/** An unlock as a share of circulating supply, percent. */
export function supplyRatio(
  unlockAmount: number | null,
  circulatingSupply: number | null,
): number | null {
  if (unlockAmount === null || circulatingSupply === null) return null;
  if (!Number.isFinite(unlockAmount) || !Number.isFinite(circulatingSupply)) return null;
  if (circulatingSupply <= 0) return null;
  return (unlockAmount / circulatingSupply) * 100;
}

/* ---------------------------------------------------------------------------
   Markets
--------------------------------------------------------------------------- */

/**
 * The gap between two venues' prices, in basis points of the midpoint.
 *
 * Basis points of the MIDPOINT rather than of either leg, so the figure does
 * not depend on which venue is named first. Quoting it against one side makes
 * the same divergence two different numbers depending on direction.
 */
export function divergenceBps(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const mid = (a + b) / 2;
  if (mid <= 0) return null;
  return ((a - b) / mid) * 10_000;
}

/** A simple return between two prices, percent. */
export function priceReturn(from: number, to: number): number | null {
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  if (from <= 0) return null;
  return ((to - from) / from) * 100;
}
