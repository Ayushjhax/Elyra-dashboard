import "server-only";

import { toPulseRow } from "@/lib/market/pulse";
import { hyperliquidMarkets } from "@/lib/providers/hyperliquid-public";
import { parseFearGreed, positioning, type Sentiment } from "@/lib/research/sentimentMath";

/* ---------------------------------------------------------------------------
   The sentiment read: alternative.me's Fear & Greed Index and Hyperliquid's
   perps, read live. The maths is lib/research/sentimentMath.ts.
--------------------------------------------------------------------------- */

const FEAR_GREED_URL = "https://api.alternative.me/fng/?limit=8";

export async function sentimentRead(): Promise<Sentiment> {
  const notes: string[] = [];
  const [fear, markets] = await Promise.all([
    fetch(FEAR_GREED_URL, { headers: { "user-agent": "elyra-server/1.0" }, signal: AbortSignal.timeout(8_000), cache: "no-store" })
      .then(async (response) => (response.ok ? parseFearGreed(await response.json()) : null))
      .catch(() => null),
    hyperliquidMarkets().catch(() => null),
  ]);
  if (fear === null) notes.push("The Fear & Greed Index did not answer.");
  const rows = markets?.ok && markets.data ? markets.data.map(toPulseRow).filter((row) => row !== null) : [];
  if (rows.length === 0) notes.push("Hyperliquid did not answer.");
  return {
    fearGreed: fear,
    positioning: positioning(
      rows.map((row) => ({
        symbol: row.symbol,
        change24hPct: row.change24hPct,
        fundingAprPct: row.fundingAprPct,
        openInterestUsd: row.openInterestUsd,
        volume24hUsd: row.volume24hUsd,
      })),
    ),
    asOf: new Date().toISOString(),
    notes,
  };
}
