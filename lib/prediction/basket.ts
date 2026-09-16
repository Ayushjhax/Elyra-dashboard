import { ageMs, isCrossed, isTwoSided, type NormalizedBook } from "@/lib/prediction/book";
import { microprice } from "@/lib/prediction/book-analytics";
import type { PredictionTrade } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   The Elyra Probability Basket.

   A weighted blend of the observable prices for one outcome. It is an
   ANALYTICAL REFERENCE and it is not the probability of the event. Nothing in
   this codebase may call it that, and the label travels with the number.

   ── What is genuinely independent, and what only looks it ──────────────

   Four inputs carry information here:

     midpoint      where the quotes bracket
     microprice    where the SIZE at the touch leans
     last trade    where someone actually transacted
     recent VWAP   where size has been transacting

   A fifth is routinely proposed and is arithmetically empty. On Polymarket a
   NO share is the complement of a YES share in the same order book: verified
   live across twelve markets, every level mirrors exactly, so

       NO_ask ≡ 1 − YES_bid        NO_bid ≡ 1 − YES_ask

   Therefore yes / (yes + no) with no = 1 − yes returns yes, always. Adding
   the "YES/NO normalised probability" as a component would be averaging a
   number with itself and reporting the agreement as corroboration — the
   confidence would rise while the information stayed flat. It is computed
   below as `complementCheck` and weighted ZERO.

   That check is not wasted. When the mirror breaks, something is true and
   worth saying: one side is stale, the book is crossed, or an arbitrage is
   genuinely open. All three are reported as warnings.

   ── Why weights are fixed and declared ─────────────────────────────────

   Fitted weights would need a training set, and the honest training set here
   is "did the basket predict the next print", which is a different question
   from "is this a good probability". Fixed, stated weights can be argued with
   by a reader; fitted ones cannot be audited by anyone.

   Client-safe: pure functions over plain objects.
--------------------------------------------------------------------------- */

/** Beyond this, a component is too old to contribute. */
export const COMPONENT_MAX_AGE_MS = 120_000;

/** A trade older than this does not count toward the recent VWAP. */
export const VWAP_WINDOW_MS = 15 * 60_000;

/** Minimum prints before a VWAP is meaningful rather than anecdotal. */
export const VWAP_MIN_TRADES = 3;

/**
 * Component weights.
 *
 * Midpoint and microprice lead because they reflect current resting
 * intent on both sides. The last trade is a single print and can be a small
 * order at a stale price, so it is weighted lightest. VWAP sits between:
 * size-weighted and multi-print, but backward-looking.
 *
 * These are re-normalised over whichever components are actually present, so
 * a market with no recent tape still produces a basket from the quotes rather
 * than silently weighting an absent input as zero and biasing the result.
 */
export const BASKET_WEIGHTS = {
  midpoint: 0.35,
  microprice: 0.35,
  recentVwap: 0.2,
  lastTrade: 0.1,
} as const;

export type BasketComponentSource = keyof typeof BASKET_WEIGHTS;

export interface BasketComponent {
  source: BasketComponentSource;
  label: string;
  value: number;
  /** Weight after renormalisation over present components. */
  weight: number;
  timestamp: string;
  ageMs: number;
}

export interface ProbabilityBasket {
  marketId: string;
  tokenId: string;
  outcomeLabel: string | null;

  /* Observed, untouched. These are prices, reported as the venue shows them. */
  observedMidpoint: number | null;
  observedLastTrade: number | null;
  microprice: number | null;
  recentVwap: number | null;

  /**
   * yes / (yes + no) from the two books.
   *
   * An INTEGRITY CHECK, not a component. On a healthy Polymarket binary book
   * this equals the midpoint by construction. Weighted zero.
   */
  complementCheck: number | null;
  /** How far the complement check strayed from the midpoint, in points. */
  complementDeviationPoints: number | null;

  /** The blend. Null when nothing fresh enough was available. */
  basketProbability: number | null;

  components: BasketComponent[];
  confidence: "low" | "medium" | "high";
  warnings: string[];

  /** Basket minus the price a buyer would actually pay. Positive = cheap. */
  deviationFromAskPoints: number | null;
  /** Neutral wording. A deviation is not automatically a mispricing. */
  reading: "market_above_basket" | "market_below_basket" | "aligned" | null;

  asOf: string;
  /** Age of the freshest input that fed the basket. */
  dataFreshnessMs: number;
}

/**
 * Size-weighted average price of recent prints for one outcome token.
 *
 * Filtered to the token, not the market: a binary market's tape carries both
 * outcomes, and averaging YES prints at 0.11 with NO prints at 0.89 produces
 * a number near 0.5 that describes nothing.
 */
export function recentVwapOf(
  trades: PredictionTrade[],
  tokenId: string,
  now = Date.now(),
  windowMs = VWAP_WINDOW_MS,
): { value: number | null; sampleSize: number; newestAt: string | null } {
  let shares = 0;
  let notional = 0;
  let sampleSize = 0;
  let newest = 0;

  for (const trade of trades) {
    if (trade.tokenId !== tokenId) continue;
    const at = Date.parse(trade.at);
    if (!Number.isFinite(at) || now - at > windowMs) continue;
    if (trade.size <= 0) continue;

    shares += trade.size;
    notional += trade.size * trade.price;
    sampleSize += 1;
    if (at > newest) newest = at;
  }

  if (sampleSize < VWAP_MIN_TRADES || shares <= 0) {
    return { value: null, sampleSize, newestAt: null };
  }

  return {
    value: notional / shares,
    sampleSize,
    newestAt: new Date(newest).toISOString(),
  };
}

/**
 * The most recent print for ONE outcome token.
 *
 * ── Why this is not read off the book ──────────────────────────────────
 *
 * `book.lastTradePrice` is MARKET-level. Verified live: both outcome books
 * of a binary market carry the identical value — whichever outcome traded
 * most recently, in that outcome's own terms. A YES book quoting 11/12
 * routinely reports 0.89 there, because the last print was a NO buy.
 *
 * Feeding that into a YES basket is not a rounding error. Observed on a live
 * Fed market: midpoint 0.115, microprice 0.115, VWAP 0.110, and a
 * "last trade" of 0.88 dragged the blend to 0.19 — manufacturing a seven-point
 * edge against an ask of 0.12 and firing a basket-convergence signal that had
 * no edge at all behind it.
 *
 * The tape carries `asset`, so filtering on the token gives the real figure.
 */
export function lastTradeOf(
  trades: PredictionTrade[],
  tokenId: string,
  now = Date.now(),
  maxAgeMs = COMPONENT_MAX_AGE_MS,
): { value: number | null; at: string | null } {
  let newest = 0;
  let value: number | null = null;

  for (const trade of trades) {
    if (trade.tokenId !== tokenId) continue;
    const at = Date.parse(trade.at);
    if (!Number.isFinite(at) || at <= newest) continue;
    if (now - at > maxAgeMs) continue;
    newest = at;
    value = trade.price;
  }

  return { value, at: newest > 0 ? new Date(newest).toISOString() : null };
}

export interface BasketInput {
  /** The book for the outcome being priced. */
  book: NormalizedBook;
  /**
   * The complementary outcome's book, for the integrity check.
   *
   * Binary markets only. Omitted on multi-outcome markets, where no single
   * complement exists — see the negative-risk note in `signal-engine.ts`.
   */
  complementBook?: NormalizedBook | null;
  /** The market's trade tape. Filtered to this token internally. */
  trades?: PredictionTrade[];
  outcomeLabel?: string | null;
  now?: number;
}

/**
 * Blends the observable prices for one outcome.
 *
 * Every component carries its own age, and anything past
 * `COMPONENT_MAX_AGE_MS` is dropped rather than down-weighted: a fifteen
 * minute old print is not weak evidence of the current price, it is evidence
 * of a different moment.
 */
export function buildBasket(input: BasketInput): ProbabilityBasket {
  const { book } = input;
  const now = input.now ?? Date.now();
  const warnings: string[] = [];

  const bookAge = ageMs(book, now);
  const crossed = isCrossed(book);
  const twoSided = isTwoSided(book);

  if (crossed) {
    warnings.push(
      "The book is crossed — the best bid is at or above the best ask. Quote-derived inputs were dropped.",
    );
  }
  if (!twoSided) {
    warnings.push("Only one side of the book has resting orders.");
  }

  const observedMidpoint = twoSided && !crossed ? book.midpoint : null;
  const micro = microprice(book);

  /* From the TAPE, filtered to this token — never from `book.lastTradePrice`,
     which is market-level and is the complement roughly a third of the time. */
  const lastTrade = lastTradeOf(input.trades ?? [], book.tokenId, now);
  const observedLastTrade = lastTrade.value;

  const vwap = recentVwapOf(input.trades ?? [], book.tokenId, now);
  if (vwap.value === null && (input.trades?.length ?? 0) > 0) {
    warnings.push(
      `Fewer than ${VWAP_MIN_TRADES} prints for this outcome in the last ${Math.round(VWAP_WINDOW_MS / 60_000)} minutes — no recent VWAP.`,
    );
  }

  /* ---- Components, before renormalisation ---- */

  const candidates: Array<{
    source: BasketComponentSource;
    label: string;
    value: number | null;
    ageMs: number;
    timestamp: string;
  }> = [
    {
      source: "midpoint",
      label: "Bid/ask midpoint",
      value: observedMidpoint,
      ageMs: bookAge,
      timestamp: book.timestamp,
    },
    {
      source: "microprice",
      label: "Size-weighted microprice",
      value: micro,
      ageMs: bookAge,
      timestamp: book.timestamp,
    },
    {
      source: "recentVwap",
      label: `Recent VWAP (${vwap.sampleSize} prints)`,
      value: vwap.value,
      ageMs: vwap.newestAt === null ? Infinity : now - Date.parse(vwap.newestAt),
      timestamp: vwap.newestAt ?? new Date(now).toISOString(),
    },
    {
      source: "lastTrade",
      label: "Last trade (this outcome)",
      value: observedLastTrade,
      /* The tape stamps every print, so this is the print's real age rather
         than the age of the book that happened to mention it. */
      ageMs: lastTrade.at === null ? Infinity : now - Date.parse(lastTrade.at),
      timestamp: lastTrade.at ?? new Date(now).toISOString(),
    },
  ];

  const present = candidates.filter(
    (candidate): candidate is typeof candidate & { value: number } =>
      candidate.value !== null &&
      Number.isFinite(candidate.value) &&
      candidate.value > 0 &&
      candidate.value < 1 &&
      candidate.ageMs <= COMPONENT_MAX_AGE_MS,
  );

  const dropped = candidates.length - present.length;
  if (dropped > 0 && present.length > 0) {
    warnings.push(`${dropped} of ${candidates.length} basket inputs were unavailable or stale.`);
  }

  const rawTotal = present.reduce(
    (total, candidate) => total + BASKET_WEIGHTS[candidate.source],
    0,
  );

  const components: BasketComponent[] = present.map((candidate) => ({
    source: candidate.source,
    label: candidate.label,
    value: candidate.value,
    /* Renormalised over what is present, so a missing VWAP redistributes its
       weight proportionally rather than shrinking the basket toward zero. */
    weight: rawTotal > 0 ? BASKET_WEIGHTS[candidate.source] / rawTotal : 0,
    timestamp: candidate.timestamp,
    ageMs: candidate.ageMs,
  }));

  const basketProbability =
    components.length > 0
      ? clamp01(components.reduce((total, part) => total + part.value * part.weight, 0))
      : null;

  /* ---- The complement integrity check ---- */

  let complementCheck: number | null = null;
  let complementDeviationPoints: number | null = null;

  const complement = input.complementBook ?? null;
  if (complement !== null && observedMidpoint !== null) {
    const complementMid =
      isTwoSided(complement) && !isCrossed(complement) ? complement.midpoint : null;

    if (complementMid !== null) {
      const total = observedMidpoint + complementMid;
      if (total > 0) {
        complementCheck = clamp01(observedMidpoint / total);
        complementDeviationPoints = (complementCheck - observedMidpoint) * 100;

        /* On a healthy Polymarket binary book this is exactly zero, because
           the two books are one book. Anything above a tick means one side
           was read at a different moment, the market is crossed, or a real
           arbitrage is open — and the basket should not be trusted to the
           usual degree until it is known which. */
        if (Math.abs(complementDeviationPoints) > 1) {
          warnings.push(
            `YES and NO books disagree by ${complementDeviationPoints.toFixed(1)} points. ` +
              "They are normally exact complements, so one side is stale, crossed, or genuinely dislocated.",
          );
        }
      }
    }
  }

  /* ---- Confidence ---- */

  const freshest = components.length > 0
    ? Math.min(...components.map((part) => part.ageMs))
    : Infinity;

  const confidence = confidenceOf({
    componentCount: components.length,
    crossed,
    twoSided,
    freshestMs: freshest,
    transport: book.transport,
    complementDeviationPoints,
  });

  /* ---- Deviation against what a buyer would actually pay ---- */

  const executableAsk = book.bestAsk;
  const deviationFromAskPoints =
    basketProbability !== null && executableAsk !== null
      ? (basketProbability - executableAsk) * 100
      : null;

  let reading: ProbabilityBasket["reading"] = null;
  if (deviationFromAskPoints !== null) {
    /* One tick is noise, not a reading. Below that the honest answer is that
       the market and the basket agree. */
    const tick = (book.tickSize ?? 0.01) * 100;
    reading =
      Math.abs(deviationFromAskPoints) <= tick
        ? "aligned"
        : deviationFromAskPoints > 0
          ? "market_below_basket"
          : "market_above_basket";
  }

  if (book.transport === "rest_snapshot") {
    warnings.push(
      "Built from a REST snapshot rather than the live feed — correct as of its timestamp, with no update stream behind it.",
    );
  }

  return {
    marketId: book.marketId,
    tokenId: book.tokenId,
    outcomeLabel: input.outcomeLabel ?? book.outcomeLabel,

    observedMidpoint,
    observedLastTrade,
    microprice: micro,
    recentVwap: vwap.value,

    complementCheck,
    complementDeviationPoints,

    basketProbability,
    components,
    confidence,
    warnings,

    deviationFromAskPoints,
    reading,

    asOf: new Date(now).toISOString(),
    dataFreshnessMs: Number.isFinite(freshest) ? freshest : bookAge,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function confidenceOf(input: {
  componentCount: number;
  crossed: boolean;
  twoSided: boolean;
  freshestMs: number;
  transport: NormalizedBook["transport"];
  complementDeviationPoints: number | null;
}): "low" | "medium" | "high" {
  if (input.componentCount === 0 || input.crossed || !input.twoSided) return "low";

  const deviation = input.complementDeviationPoints;
  if (deviation !== null && Math.abs(deviation) > 1) return "low";

  /* High requires everything: all four inputs, a live feed, and a book read
     within the last five seconds. Anything less is medium — which is an
     honest description of a blend built from three of four inputs over a
     thirty-second-old snapshot. */
  if (
    input.componentCount >= 4 &&
    input.transport === "realtime" &&
    input.freshestMs <= 5_000
  ) {
    return "high";
  }

  if (input.componentCount >= 2 && input.freshestMs <= 30_000) return "medium";

  return "low";
}
