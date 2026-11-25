/* ---------------------------------------------------------------------------
   Market sentiment, from what traders are doing rather than what anyone
   says. Pure.

   - The Crypto Fear & Greed Index (alternative.me), its reading now and a
     day and a week ago — a published composite of volatility, momentum,
     volume, social and dominance.
   - Positioning on Hyperliquid's liquid perps: how many pay positive
     funding (longs paying shorts — the crowd leaning long), the funding
     on the majors, open interest.
   - Breadth: how many of those markets are up on the day, and the median
     move.

   Each part is shown as it is, side by side. There is no blended score: a
   number made of other numbers hides which one moved.
--------------------------------------------------------------------------- */

export interface FearGreed {
  value: number;
  classification: string;
  yesterday: number | null;
  weekAgo: number | null;
  asOf: string;
}

export interface PerpReading {
  symbol: string;
  change24hPct: number | null;
  fundingAprPct: number | null;
  openInterestUsd: number | null;
  volume24hUsd: number | null;
}

export interface Positioning {
  markets: number;
  /** Share of liquid markets whose funding is positive, percent. */
  positiveFundingPct: number;
  /** Open-interest-weighted funding, annualised percent. */
  weightedFundingApr: number | null;
  /** Share up on the day, percent. */
  upPct: number;
  medianChangePct: number | null;
  totalOpenInterestUsd: number;
  majors: PerpReading[];
}

export interface Sentiment {
  fearGreed: FearGreed | null;
  positioning: Positioning | null;
  asOf: string;
  notes: string[];
}

export const MAJORS = ["BTC", "ETH", "SOL"] as const;
export const LIQUID_USD = 1_000_000;

/** alternative.me's `/fng/?limit=8`: newest first, values as strings. */
export function parseFearGreed(body: unknown): FearGreed | null {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const read = (index: number) => {
    const value = Number((data[index] as { value?: unknown } | undefined)?.value);
    return Number.isFinite(value) ? value : null;
  };
  const now = read(0);
  const entry = data[0] as { value_classification?: unknown; timestamp?: unknown };
  if (now === null || typeof entry.value_classification !== "string") return null;
  const stamp = Number(entry.timestamp);
  return {
    value: now,
    classification: entry.value_classification,
    yesterday: read(1),
    weekAgo: read(7),
    asOf: new Date(Number.isFinite(stamp) ? stamp * 1000 : Date.now()).toISOString(),
  };
}

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
};

export function positioning(readings: readonly PerpReading[]): Positioning | null {
  const liquid = readings.filter((reading) => (reading.volume24hUsd ?? 0) >= LIQUID_USD);
  if (liquid.length === 0) return null;
  const funded = liquid.filter((reading) => reading.fundingAprPct !== null);
  const positive = funded.filter((reading) => (reading.fundingAprPct as number) > 0).length;
  const weights = funded.filter((reading) => (reading.openInterestUsd ?? 0) > 0);
  const totalWeight = weights.reduce((sum, reading) => sum + (reading.openInterestUsd as number), 0);
  const changes = liquid.map((reading) => reading.change24hPct).filter((value): value is number => value !== null);
  return {
    markets: liquid.length,
    positiveFundingPct: funded.length === 0 ? 0 : (positive / funded.length) * 100,
    weightedFundingApr:
      totalWeight === 0 ? null : weights.reduce((sum, reading) => sum + (reading.fundingAprPct as number) * (reading.openInterestUsd as number), 0) / totalWeight,
    upPct: changes.length === 0 ? 0 : (changes.filter((change) => change > 0).length / changes.length) * 100,
    medianChangePct: median(changes),
    totalOpenInterestUsd: readings.reduce((sum, reading) => sum + (reading.openInterestUsd ?? 0), 0),
    majors: MAJORS.map((symbol) => readings.find((reading) => reading.symbol === symbol)).filter((reading): reading is PerpReading => reading !== undefined),
  };
}

/** How the crowd leans, in one of five words the page translates, from funding alone. */
export function leaning(position: Positioning): "crowded long" | "leaning long" | "balanced" | "leaning short" | "crowded short" {
  const apr = position.weightedFundingApr ?? 0;
  if (apr >= 30 || position.positiveFundingPct >= 85) return "crowded long";
  if (apr >= 8 || position.positiveFundingPct >= 65) return "leaning long";
  if (apr <= -15 || position.positiveFundingPct <= 20) return "crowded short";
  if (apr < 0 || position.positiveFundingPct <= 40) return "leaning short";
  return "balanced";
}
