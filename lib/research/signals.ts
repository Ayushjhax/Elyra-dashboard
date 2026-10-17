import "server-only";

import {
  annualisedFundingPct,
  binanceTicker,
} from "@/lib/providers/binance-public";
import { hyperliquidMarket } from "@/lib/providers/hyperliquid-public";
import { routePrices } from "@/lib/providers/router";
import { SIGNAL_CRITERIA } from "@/lib/research/signalCriteria";
import { divergenceBps } from "@/lib/research/calculations";
import { ok, type ToolResult } from "@/lib/providers/types";

/* ---------------------------------------------------------------------------
   Signals — evidence-backed observations, not recommendations.

   ── What a signal is here ──────────────────────────────────────────────

   A named thing the data shows, with the readings that show it attached.
   "SOL is up 6% on the day, confirmed across two venues, with funding
   crowded long" is a signal. "BUY SOL" is not — it is an instruction whose
   basis nobody can inspect, and it is what every one of these systems drifts
   towards if allowed.

   So there is no `direction: "buy"`. There is a direction the PRICE moved and
   a strength that reflects how much independent data agrees.

   ── Strength is earned, not asserted ───────────────────────────────────

   `high` requires corroboration from more than one venue and data fresh
   enough to act on. A single stale reading can never produce a high-strength
   signal no matter how large the move, because the move may already be over.

   Contradictions REDUCE strength and are listed. A momentum signal on an
   asset whose funding is crowded in the same direction is a weaker signal
   than one without that, and hiding the contradiction would make it look
   stronger than it is.

   ── No invented confidence numbers ─────────────────────────────────────

   Three levels, decided by rules. A "confidence: 0.83" would be a number with
   no method behind it, and its precision would imply one.
--------------------------------------------------------------------------- */

export type EvaluationState =
  "evaluated" | "unavailable" | "stale" | "unsupported";
export interface SignalEvaluation {
  price: EvaluationState;
  funding: EvaluationState;
  divergence: EvaluationState;
  generatedAt: string;
}

export type SignalType =
  | "price_momentum"
  | "volatility_expansion"
  | "volume_confirmation"
  | "funding_dislocation"
  | "spot_perp_basis"
  | "cross_venue_divergence";

export type SignalStrength = "low" | "medium" | "high";
export type SignalDirection = "positive" | "negative" | "neutral";

export interface SignalEvidence {
  /** Where the reading came from. */
  source: string;
  label: string;
  value: string;
  /** When this reading was taken. Staleness is visible, not implied. */
  asOf: string;
}

export interface MarketSignal {
  instrumentId: string;
  symbol: string;
  type: SignalType;
  direction: SignalDirection;
  strength: SignalStrength;
  title: string;
  summary: string;
  evidence: SignalEvidence[];
  /** Independent readings that agree. */
  confirmationCount: number;
  /** Readings that point the other way. Listed, never suppressed. */
  contradictions: string[];
  generatedAt: string;
  /** Oldest reading used, so a caller can judge freshness. */
  dataFreshness: string;
}

/** Beyond this, a reading describes a market that may have moved on. */
const STALE_MS = SIGNAL_CRITERIA.staleMs;

function freshEnough(asOf: string, now: number): boolean {
  const at = Date.parse(asOf);
  return Number.isFinite(at) && now - at <= STALE_MS;
}

/**
 * Resolves the final strength from what was actually observed.
 *
 * The only place strength is decided, so the rules cannot drift between
 * signal types.
 */
function strengthFrom(input: {
  magnitude: number;
  confirmations: number;
  contradictions: number;
  stale: boolean;
}): SignalStrength {
  /* Stale data caps everything. A large move on a five-minute-old reading may
     already have reversed, and calling that high-strength invites someone to
     act on history. */
  if (input.stale) return "low";

  /* One venue is not confirmation. */
  if (input.confirmations < 2) return "low";

  if (input.magnitude >= 5 && input.contradictions === 0) return "high";
  if (input.magnitude >= 2) return input.contradictions > 0 ? "low" : "medium";
  return "low";
}

const MINTS: Record<string, string> = {
  SOL: "So11111111111111111111111111111111111111112",
  JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
};

/**
 * Signals for one asset, from whatever venues can be read.
 *
 * Returns an empty list rather than a manufactured one when nothing crosses a
 * threshold. "Nothing notable" is a real and useful answer; a product that
 * always finds a signal is a product whose signals mean nothing.
 */
export async function signalsFor(
  symbol: string,
): Promise<ToolResult<MarketSignal[]> & { evaluation: SignalEvaluation }> {
  const asset = symbol.trim().toUpperCase();
  const now = Date.now();
  const generatedAt = new Date(now).toISOString();

  const [spot, perp, onchain] = await Promise.all([
    binanceTicker(asset),
    hyperliquidMarket(asset),
    MINTS[asset] === undefined
      ? Promise.resolve(null)
      : routePrices([MINTS[asset]]),
  ]);

  const signals: MarketSignal[] = [];
  const evidence: SignalEvidence[] = [];
  const timestamps: string[] = [];

  const spotPrice = spot.ok ? (spot.data?.lastPrice ?? null) : null;
  const change = spot.ok ? (spot.data?.change24hPct ?? null) : null;

  if (spotPrice !== null) {
    evidence.push({
      source: "binance",
      label: "Spot",
      value: `$${spotPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
      asOf: spot.asOf,
    });
    timestamps.push(spot.asOf);
  }

  const perpMark = perp.ok ? (perp.data?.markPrice ?? null) : null;
  if (perpMark !== null) {
    evidence.push({
      source: "hyperliquid",
      label: "Perp mark",
      value: `$${perpMark.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
      asOf: perp.asOf,
    });
    timestamps.push(perp.asOf);
  }

  const onchainPrice =
    onchain !== null && onchain.ok
      ? (onchain.data?.[0]?.usdPrice ?? null)
      : null;
  if (onchainPrice !== null && onchain !== null) {
    evidence.push({
      source: "jupiter",
      label: "On-chain",
      value: `$${onchainPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}`,
      asOf: onchain.asOf,
    });
    timestamps.push(onchain.asOf);
  }

  const oldest = timestamps.sort()[0] ?? generatedAt;
  const stale = !freshEnough(oldest, now);
  const venues = [spotPrice, perpMark, onchainPrice].filter(
    (p) => p !== null,
  ).length;

  /* ---- Momentum ---- */
  if (change !== null && Math.abs(change) >= SIGNAL_CRITERIA.priceChangePct) {
    const fundingPct =
      perp.ok && perp.data !== null && perp.data !== undefined
        ? annualisedFundingPct(perp.data)
        : null;

    const contradictions: string[] = [];

    /* Funding crowded in the direction of the move means the trade is already
       consensus. That does not invalidate the momentum — it means the easy
       part may be behind it, which is worth saying rather than burying. */
    if (
      fundingPct !== null &&
      Math.abs(fundingPct) > SIGNAL_CRITERIA.crowdedFundingPct
    ) {
      const crowdedLong = fundingPct > 0 && change > 0;
      const crowdedShort = fundingPct < 0 && change < 0;
      if (crowdedLong || crowdedShort) {
        contradictions.push(
          `Funding is ${fundingPct.toFixed(1)}% annualised — positioning is already crowded in this direction.`,
        );
      }
    }

    if (fundingPct !== null) {
      evidence.push({
        source: "hyperliquid",
        label: "Funding (annualised)",
        value: `${fundingPct.toFixed(2)}%`,
        asOf: perp.asOf,
      });
    }

    signals.push({
      instrumentId: `crypto:${asset}`,
      symbol: asset,
      type: "price_momentum",
      direction: change > 0 ? "positive" : "negative",
      strength: strengthFrom({
        magnitude: Math.abs(change),
        confirmations: venues,
        contradictions: contradictions.length,
        stale,
      }),
      title: `${asset} ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% over 24h`,
      summary:
        `${asset} has moved ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% ` +
        `over the last 24 hours, observed across ${venues} venue${venues === 1 ? "" : "s"}.`,
      evidence,
      confirmationCount: venues,
      contradictions,
      generatedAt,
      dataFreshness: oldest,
    });
  }

  /* ---- Cross-venue divergence ----

     Deliberately NOT called arbitrage. A price gap is not an executable
     trade: it survives fees, slippage, the bid/ask, chain transfer time and
     latency, and none of that is measured here. */
  if (spotPrice !== null && onchainPrice !== null) {
    const bps = divergenceBps(onchainPrice, spotPrice);
    if (bps !== null && Math.abs(bps) >= SIGNAL_CRITERIA.divergenceBps) {
      signals.push({
        instrumentId: `crypto:${asset}`,
        symbol: asset,
        type: "cross_venue_divergence",
        direction: "neutral",
        strength: strengthFrom({
          magnitude: Math.abs(bps) / 10,
          confirmations: 2,
          contradictions: 0,
          stale,
        }),
        title: `${asset} prices differ by ${Math.abs(bps).toFixed(0)} bps across venues`,
        summary:
          `On-chain and centralised prices differ by ${Math.abs(bps).toFixed(0)} basis points. ` +
          "This is a divergence, not a confirmed arbitrage — it does not account for " +
          "spread, fees, slippage, transfer time or latency.",
        evidence,
        confirmationCount: 2,
        contradictions: [],
        generatedAt,
        dataFreshness: oldest,
      });
    }
  }

  /* ---- Funding dislocation ---- */
  if (perp.ok && perp.data !== null && perp.data !== undefined) {
    const fundingPct = annualisedFundingPct(perp.data);
    if (
      fundingPct !== null &&
      Math.abs(fundingPct) >= SIGNAL_CRITERIA.fundingPct
    ) {
      signals.push({
        instrumentId: `crypto:${asset}`,
        symbol: asset,
        type: "funding_dislocation",
        direction: fundingPct > 0 ? "negative" : "positive",
        strength: stale ? "low" : "medium",
        title: `${asset} funding at ${fundingPct.toFixed(0)}% annualised`,
        summary:
          `Perpetual funding is ${fundingPct.toFixed(1)}% annualised, meaning ` +
          `${fundingPct > 0 ? "longs are paying shorts" : "shorts are paying longs"} ` +
          "heavily. Crowded positioning, not a direction.",
        evidence,
        confirmationCount: 1,
        contradictions: [],
        generatedAt,
        dataFreshness: oldest,
      });
    }
  }

  const reading = (
    available: boolean,
    timestamps: string[],
  ): EvaluationState =>
    !available
      ? "unavailable"
      : timestamps.some((at) => !freshEnough(at, now))
        ? "stale"
        : "evaluated";
  const funding = perp.ok && perp.data ? annualisedFundingPct(perp.data) : null;
  return {
    ...ok(signals, "binance", {
      asOf: oldest,
      warnings: stale
        ? [
            "Readings are more than five minutes old; strength is capped at low.",
          ]
        : [],
    }),
    evaluation: {
      price: reading(change !== null, [spot.asOf]),
      funding: reading(funding !== null, [perp.asOf]),
      divergence:
        MINTS[asset] === undefined
          ? "unsupported"
          : reading(spotPrice !== null && onchainPrice !== null, [
              spot.asOf,
              onchain?.asOf ?? generatedAt,
            ]),
      generatedAt,
    },
  };
}

/** A compact line per signal, for chat surfaces. */
export function describeSignal(signal: MarketSignal): string {
  const arrow =
    signal.direction === "positive"
      ? "▲"
      : signal.direction === "negative"
        ? "▼"
        : "·";
  return `${arrow} ${signal.title} — ${signal.strength} strength, ${signal.confirmationCount} venue(s)`;
}
