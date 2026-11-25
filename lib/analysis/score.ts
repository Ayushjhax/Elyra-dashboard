/* ---------------------------------------------------------------------------
   The two scores a token analysis gives, computed by code from facts the
   person can see. Pure.

   Elyra's rule is that a number made of other numbers must not hide which
   one moved (lib/research/sentimentMath.ts). So neither score stands alone:
   each comes with every deduction or contribution that made it, in words,
   with the source of the fact behind it — the score is a summary of a list
   the reply also shows, not a verdict.
--------------------------------------------------------------------------- */

/* ---------------------------------------------------------------------------
   Safety
--------------------------------------------------------------------------- */

export interface SafetyInput {
  /** The mint's controls as read on-chain (the Asset Passport's `mintControls`). */
  controls: ReadonlyArray<{ id: string; live: boolean }> | null;
  /** Jupiter's audit, used only when the chain could not be read. */
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  /** The top holders' share of supply, percent. */
  topHoldersPct: number | null;
  liquidityUsd: number | null;
  holderCount: number | null;
  /** On Jupiter's verified list. */
  verified: boolean | null;
  /** A stablecoin or tokenized security on Elyra's list: its issuer keeps authorities by design. */
  issuerRun: boolean;
}

export interface Deduction {
  points: number;
  reason: string;
  source: "chain" | "jupiter";
}

export interface SafetyReport {
  /** 0–100; higher is safer. */
  score: number;
  risk: "low" | "medium" | "high";
  deductions: Deduction[];
  /** What could not be checked, and context a holder should read with the score. */
  notes: string[];
}

/** What each live on-chain control costs, and why. */
const CONTROL_COST: Record<string, [number, string]> = {
  mint: [25, "A mint authority exists: supply can be increased."],
  freeze: [20, "A freeze authority exists: holders' accounts can be frozen."],
  permanentDelegate: [30, "A permanent delegate can move or burn any holder's tokens."],
  pausableConfig: [15, "Transfers can be paused by an authority."],
  defaultAccountState: [15, "New holders' accounts start frozen."],
  nonTransferable: [30, "The token cannot be transferred."],
  transferHook: [10, "Every transfer runs a program that can refuse it."],
  transferFeeConfig: [10, "Transfers pay a fee to an authority."],
};

export function safetyReport(input: SafetyInput): SafetyReport {
  const deductions: Deduction[] = [];
  const notes: string[] = [];

  if (input.controls !== null) {
    for (const control of input.controls) {
      const cost = CONTROL_COST[control.id];
      if (control.live && cost !== undefined) deductions.push({ points: cost[0], reason: cost[1], source: "chain" });
    }
  } else {
    notes.push("The mint account could not be read on-chain; mint and freeze authority come from Jupiter's audit instead.");
    if (input.mintAuthorityDisabled === false) deductions.push({ points: CONTROL_COST.mint[0], reason: CONTROL_COST.mint[1], source: "jupiter" });
    if (input.freezeAuthorityDisabled === false) deductions.push({ points: CONTROL_COST.freeze[0], reason: CONTROL_COST.freeze[1], source: "jupiter" });
    if (input.mintAuthorityDisabled === null && input.freezeAuthorityDisabled === null) notes.push("Neither source said whether mint or freeze authority is live.");
  }

  const top = input.topHoldersPct;
  if (top === null) notes.push("The top holders' share is not known.");
  else if (top > 50) deductions.push({ points: 20, reason: `The top holders hold ${top.toFixed(1)}% of supply.`, source: "jupiter" });
  else if (top > 30) deductions.push({ points: 10, reason: `The top holders hold ${top.toFixed(1)}% of supply.`, source: "jupiter" });

  const liquidity = input.liquidityUsd;
  if (liquidity === null) notes.push("On-chain liquidity is not known.");
  else if (liquidity < 10_000) deductions.push({ points: 25, reason: "Under $10,000 of on-chain liquidity: a sale of any size moves the price.", source: "jupiter" });
  else if (liquidity < 100_000) deductions.push({ points: 12, reason: "Under $100,000 of on-chain liquidity.", source: "jupiter" });

  const holders = input.holderCount;
  if (holders !== null && holders < 500) deductions.push({ points: 10, reason: `Only ${holders} holders.`, source: "jupiter" });
  else if (holders !== null && holders < 5_000) deductions.push({ points: 5, reason: `Fewer than 5,000 holders (${holders}).`, source: "jupiter" });

  if (input.verified === false) deductions.push({ points: 5, reason: "Not on Jupiter's verified list.", source: "jupiter" });

  if (input.issuerRun) {
    notes.push(
      "This is an issuer-run token (a stablecoin or a tokenized security on Elyra's list). Its issuer keeps mint and freeze authority by design, so those deductions describe what the issuer can do, not a sign of a scam.",
    );
  }

  const score = Math.max(0, 100 - deductions.reduce((sum, deduction) => sum + deduction.points, 0));
  return { score, risk: score >= 80 ? "low" : score >= 50 ? "medium" : "high", deductions, notes };
}

/* ---------------------------------------------------------------------------
   Sentiment
--------------------------------------------------------------------------- */

export interface SentimentInput {
  /** The Crypto Fear & Greed Index, 0–100. */
  fearGreed: number | null;
  /** The coin's perp funding on Hyperliquid, annualised percent: positive is longs paying shorts. */
  fundingAprPct: number | null;
  /** The coin's 24h change, and the median 24h change of Hyperliquid's liquid perps. */
  change24hPct: number | null;
  marketMedianChangePct: number | null;
  /** Buy and sell volume over 24h on Solana, USD — for a Solana token. */
  buyVolumeUsd: number | null;
  sellVolumeUsd: number | null;
}

export interface Contribution {
  name: "fear_greed" | "positioning" | "relative_strength" | "flows";
  /** −1 (bearish) to +1 (bullish). */
  value: number;
  reading: string;
}

export interface SentimentScore {
  /** 0–100; 50 is neutral. Null with nothing to read. */
  score: number | null;
  label: "bearish" | "leaning bearish" | "neutral" | "leaning bullish" | "bullish" | null;
  contributions: Contribution[];
}

const clamp = (value: number): number => Math.max(-1, Math.min(1, value));
const pct = (value: number, digits = 1): string => `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;

/**
 * Up to four readings, each scaled to −1…+1 and averaged with equal weight:
 * the market's mood (Fear & Greed), how the coin's perp traders are
 * positioned (funding: +30% a year or more counts fully bullish), how it is
 * doing against the market today (10 points ahead counts fully), and, for a
 * Solana token, whether buyers or sellers had the day's volume.
 */
export function sentimentScore(input: SentimentInput): SentimentScore {
  const contributions: Contribution[] = [];
  if (input.fearGreed !== null) {
    contributions.push({ name: "fear_greed", value: clamp((input.fearGreed - 50) / 50), reading: `Fear & Greed Index at ${input.fearGreed}` });
  }
  if (input.fundingAprPct !== null) {
    contributions.push({
      name: "positioning",
      value: clamp(input.fundingAprPct / 30),
      reading: `Perp funding ${pct(input.fundingAprPct)} a year (${input.fundingAprPct >= 0 ? "longs pay shorts" : "shorts pay longs"})`,
    });
  }
  if (input.change24hPct !== null && input.marketMedianChangePct !== null) {
    const gap = input.change24hPct - input.marketMedianChangePct;
    contributions.push({ name: "relative_strength", value: clamp(gap / 10), reading: `${pct(input.change24hPct, 2)} on the day against the market's ${pct(input.marketMedianChangePct, 2)}` });
  }
  if (input.buyVolumeUsd !== null && input.sellVolumeUsd !== null && input.buyVolumeUsd + input.sellVolumeUsd > 0) {
    const share = input.buyVolumeUsd / (input.buyVolumeUsd + input.sellVolumeUsd);
    contributions.push({ name: "flows", value: clamp((share - 0.5) * 2), reading: `Buyers took ${(share * 100).toFixed(0)}% of the day's on-chain volume` });
  }
  if (contributions.length === 0) return { score: null, label: null, contributions };
  const mean = contributions.reduce((sum, entry) => sum + entry.value, 0) / contributions.length;
  const score = Math.round(50 + 50 * mean);
  const label = score >= 65 ? "bullish" : score >= 55 ? "leaning bullish" : score > 45 ? "neutral" : score > 35 ? "leaning bearish" : "bearish";
  return { score, label, contributions };
}

/** The VIX by the conventional reading of its level. */
export function vixRegime(level: number): "calm" | "normal" | "elevated" | "high fear" {
  return level < 15 ? "calm" : level < 20 ? "normal" : level < 30 ? "elevated" : "high fear";
}
