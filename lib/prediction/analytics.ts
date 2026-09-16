import type {
  PredictionPosition,
  PredictionPositionStatus,
} from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Prediction-market arithmetic.

   Every figure a model reports about prediction positions is computed here
   first. A language model asked to total a column of dollar values will
   usually get it right and occasionally get it wrong, and there is no way to
   tell which from the output. So the model explains these numbers; it never
   produces them.

   Pure — no `server-only`, no I/O, no clock beyond what the caller passes —
   so every rule below is directly testable.

   ── The one thing that makes prediction positions different ────────────

   Downside is BOUNDED AND KNOWN. A share settles at exactly $1 or exactly
   $0, so:

     max loss    = what the position is worth now       (it can go to zero)
     max payout  = share count × $1                      (every share wins)
     max profit  = max payout − current value

   Those are arithmetic, not forecasts. That is why they can be stated as
   facts where a spot position's "maximum loss" could only ever be a guess.

   Note that max loss is measured from CURRENT value, not cost basis: money
   already lost is not still at risk, and counting it again would overstate
   what is actually exposed today.
--------------------------------------------------------------------------- */

export interface PredictionExposure {
  /** What the open positions are worth now. */
  currentValueUsd: number;
  /** What was paid for them. */
  costBasisUsd: number;
  /** Current value minus cost. Only over positions that reported both. */
  unrealisedPnlUsd: number;
  /** The most that can still be lost — every open position going to zero. */
  maxLossUsd: number;
  /** The most that can still be received — every open share settling at $1. */
  maxPayoutUsd: number;
  /** Payout minus current value: profit still on the table. */
  maxProfitUsd: number;
  openCount: number;
  /** Settled in the user's favour, not yet claimed. */
  claimableCount: number;
  claimableValueUsd: number;
  /** Positions whose figures were incomplete and are excluded from the sums. */
  unvaluedCount: number;
}

const LIVE: readonly PredictionPositionStatus[] = ["open", "claimable"];

function isLive(position: PredictionPosition): boolean {
  return LIVE.includes(position.status);
}

/**
 * The totals for a set of positions.
 *
 * A position missing the figure a sum needs is COUNTED SEPARATELY rather than
 * treated as zero. Silently dropping it understates exposure; treating a null
 * as 0 does the same thing while looking complete.
 */
export function exposureOf(positions: PredictionPosition[]): PredictionExposure {
  const live = positions.filter(isLive);

  let currentValueUsd = 0;
  let costBasisUsd = 0;
  let maxPayoutUsd = 0;
  let claimableValueUsd = 0;
  let claimableCount = 0;
  let unvaluedCount = 0;

  for (const position of live) {
    const value = position.currentValueUsd;
    const cost = position.costBasisUsd;
    const shares = position.quantity;

    if (value === null) {
      unvaluedCount += 1;
    } else {
      currentValueUsd += value;
      if (position.status === "claimable") {
        claimableValueUsd += value;
      }
    }

    if (cost !== null) costBasisUsd += cost;

    /* Every share pays $1 if it wins. Shares, not dollars — a position of 500
       shares at 20¢ is worth $100 now and pays $500 if it resolves. */
    if (shares !== null) maxPayoutUsd += shares;

    if (position.status === "claimable") claimableCount += 1;
  }

  return {
    currentValueUsd,
    costBasisUsd,
    unrealisedPnlUsd: currentValueUsd - costBasisUsd,
    /* The whole current value is at risk: shares settle at zero or one. */
    maxLossUsd: currentValueUsd,
    maxPayoutUsd,
    maxProfitUsd: Math.max(0, maxPayoutUsd - currentValueUsd),
    openCount: live.length,
    claimableCount,
    claimableValueUsd,
    unvaluedCount,
  };
}

/** Per-position max loss and payout, for a preview or a table. */
export function boundsOf(position: PredictionPosition): {
  maxLossUsd: number | null;
  maxPayoutUsd: number | null;
  maxProfitUsd: number | null;
} {
  const value = position.currentValueUsd;
  const shares = position.quantity;

  return {
    maxLossUsd: value,
    maxPayoutUsd: shares,
    maxProfitUsd: value === null || shares === null ? null : Math.max(0, shares - value),
  };
}

/* ---------------------------------------------------------------------------
   Ranking
--------------------------------------------------------------------------- */

export function largestPosition(positions: PredictionPosition[]): PredictionPosition | null {
  const valued = positions.filter((p) => isLive(p) && p.currentValueUsd !== null);
  if (valued.length === 0) return null;
  return valued.reduce((best, p) =>
    (p.currentValueUsd ?? 0) > (best.currentValueUsd ?? 0) ? p : best,
  );
}

export function bestPerformer(positions: PredictionPosition[]): PredictionPosition | null {
  const valued = positions.filter((p) => isLive(p) && p.pnlUsd !== null);
  if (valued.length === 0) return null;
  const top = valued.reduce((best, p) => ((p.pnlUsd ?? 0) > (best.pnlUsd ?? 0) ? p : best));
  /* A "best performer" that is losing money is not a winner. Null is the
     honest answer when nothing is up. */
  return (top.pnlUsd ?? 0) > 0 ? top : null;
}

export function worstPerformer(positions: PredictionPosition[]): PredictionPosition | null {
  const valued = positions.filter((p) => isLive(p) && p.pnlUsd !== null);
  if (valued.length === 0) return null;
  const bottom = valued.reduce((worst, p) => ((p.pnlUsd ?? 0) < (worst.pnlUsd ?? 0) ? p : worst));
  return (bottom.pnlUsd ?? 0) < 0 ? bottom : null;
}

/**
 * Positions resolving inside a window.
 *
 * Soonest first, because the only reason to ask is to know what needs
 * attention next.
 */
export function resolvingWithin(
  positions: PredictionPosition[],
  hours: number,
  now: number = Date.now(),
): PredictionPosition[] {
  const cutoff = now + hours * 3_600_000;

  return positions
    .filter((position) => {
      if (position.status !== "open" || position.endsAt === null) return false;
      const ends = Date.parse(position.endsAt);
      /* An unparseable date is not "soon" — it is unknown, and guessing
         either way would either alarm or reassure without cause. */
      return Number.isFinite(ends) && ends >= now && ends <= cutoff;
    })
    .sort((a, b) => Date.parse(a.endsAt ?? "") - Date.parse(b.endsAt ?? ""));
}

export function nextResolution(
  positions: PredictionPosition[],
  now: number = Date.now(),
): PredictionPosition | null {
  const upcoming = positions
    .filter((p) => p.status === "open" && p.endsAt !== null)
    .filter((p) => Number.isFinite(Date.parse(p.endsAt ?? "")) && Date.parse(p.endsAt!) >= now)
    .sort((a, b) => Date.parse(a.endsAt!) - Date.parse(b.endsAt!));

  return upcoming[0] ?? null;
}

/* ---------------------------------------------------------------------------
   Concentration
--------------------------------------------------------------------------- */

export interface ConcentrationSlice {
  key: string;
  label: string;
  valueUsd: number;
  /** Share of prediction exposure, 0–100. Null when there is nothing to divide by. */
  pctOfPrediction: number | null;
  positionCount: number;
}

function group(
  positions: PredictionPosition[],
  keyOf: (position: PredictionPosition) => { key: string; label: string } | null,
): ConcentrationSlice[] {
  const buckets = new Map<string, { label: string; valueUsd: number; count: number }>();
  let total = 0;

  for (const position of positions) {
    if (!isLive(position) || position.currentValueUsd === null) continue;
    const bucket = keyOf(position);
    if (bucket === null) continue;

    const existing = buckets.get(bucket.key) ?? {
      label: bucket.label,
      valueUsd: 0,
      count: 0,
    };
    existing.valueUsd += position.currentValueUsd;
    existing.count += 1;
    buckets.set(bucket.key, existing);
    total += position.currentValueUsd;
  }

  return [...buckets.entries()]
    .map(([key, bucket]) => ({
      key,
      label: bucket.label,
      valueUsd: bucket.valueUsd,
      pctOfPrediction: total > 0 ? (bucket.valueUsd / total) * 100 : null,
      positionCount: bucket.count,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

/**
 * Exposure grouped by EVENT.
 *
 * The grouping that actually measures risk. Three positions across one
 * event's outcomes is one bet on one question, not three independent ones,
 * and a by-market view would report it as diversified.
 */
export function byEvent(positions: PredictionPosition[]): ConcentrationSlice[] {
  return group(positions, (position) =>
    position.eventId === null || position.eventId === undefined
      ? /* No event id: treat the market as its own event rather than lumping
           every ungrouped position into one fake bucket. */
        { key: `market:${position.marketId}`, label: position.marketTitle }
      : { key: `event:${position.eventId}`, label: position.marketTitle },
  );
}

/** Exposure grouped by outcome label — how much rides on "Yes" overall. */
export function byOutcome(positions: PredictionPosition[]): ConcentrationSlice[] {
  return group(positions, (position) => ({
    key: position.outcome.toLowerCase(),
    label: position.outcome,
  }));
}

/* ---------------------------------------------------------------------------
   Portfolio share
--------------------------------------------------------------------------- */

/**
 * Prediction exposure as a share of total portfolio equity.
 *
 * Null when equity is unknown or non-positive rather than zero or one
 * hundred. A percentage of an unknown denominator is not a small number; it
 * is not a number.
 */
export function shareOfPortfolio(
  predictionValueUsd: number,
  totalEquityUsd: number | null,
): number | null {
  if (totalEquityUsd === null || totalEquityUsd <= 0) return null;
  return (predictionValueUsd / totalEquityUsd) * 100;
}

/* ---------------------------------------------------------------------------
   Probability movement
--------------------------------------------------------------------------- */

/**
 * A probability change in PERCENTAGE POINTS.
 *
 * 54% → 64% is a 10-POINT move and an 18.5% relative move. People mean the
 * first when they say "tell me if it moves 10%", and an alert built on the
 * second fires roughly twice as often as asked. Points is the unit
 * everywhere prediction probabilities are compared.
 */
export function moveInPoints(from: number, to: number): number {
  return (to - from) * 100;
}

/** Positions whose linked asset is named in a symbol list. */
export function matchingSymbol(
  positions: PredictionPosition[],
  symbol: string,
): PredictionPosition[] {
  /* Strip before the length check, not inside the pattern. "$$" clears a
     check on the raw string but leaves nothing to match on, and an empty
     needle compiles to /\b\b/ — which matches every title containing a word
     and would report the whole book as exposure to it. Stripping first also
     lets "$BTC" reach the alias table below. */
  const needle = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (needle.length < 2) return [];

  /* Word-boundary match on the market title. A substring search would match
     "ETH" inside "whETHer" and report an unrelated market as BTC exposure. */
  const pattern = new RegExp(`\\b${needle}\\b`, "i");

  const ALIASES: Record<string, string[]> = {
    BTC: ["BITCOIN"],
    ETH: ["ETHEREUM"],
    SOL: ["SOLANA"],
    DOGE: ["DOGECOIN"],
  };

  const alternates = (ALIASES[needle] ?? []).map(
    (alias) => new RegExp(`\\b${alias}\\b`, "i"),
  );

  return positions.filter(
    (position) =>
      pattern.test(position.marketTitle) ||
      alternates.some((alternate) => alternate.test(position.marketTitle)),
  );
}
