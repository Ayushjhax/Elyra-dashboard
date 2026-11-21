import "server-only";

import { binanceFunding, binanceTicker } from "@/lib/providers/binance-public";
import { hyperliquidMarkets } from "@/lib/providers/hyperliquid-public";
import { arbitrageRow, rankArbitrage, type ArbitrageRow } from "@/lib/research/arbitrageMath";

/* ---------------------------------------------------------------------------
   The arbitrage scan: Hyperliquid's most traded perps, each against
   Binance's spot and Binance's perp, read live and cached by the providers.
   The maths is lib/research/arbitrageMath.ts; this only gathers.

   The universe is Hyperliquid's liquid markets that Binance also lists —
   the twenty-four by volume, so one scan is a bounded number of reads.
--------------------------------------------------------------------------- */

const UNIVERSE = 24;
const MIN_VOLUME_USD = 5_000_000;

export interface ArbitrageScan {
  rows: ArbitrageRow[];
  asOf: string;
  notes: string[];
}

export async function arbitrageScan(): Promise<ArbitrageScan> {
  const notes: string[] = [];
  const markets = await hyperliquidMarkets();
  if (!markets.ok || markets.data === undefined) {
    return { rows: [], asOf: new Date().toISOString(), notes: ["Hyperliquid did not answer."] };
  }
  const liquid = markets.data
    .filter((market) => !market.delisted && !market.symbol.includes(":") && (market.volume24hUsd ?? 0) >= MIN_VOLUME_USD && market.markPrice !== null)
    .sort((a, b) => (b.volume24hUsd ?? 0) - (a.volume24hUsd ?? 0))
    .slice(0, UNIVERSE);

  const rows = await Promise.all(
    liquid.map(async (market) => {
      /* kPEPE and friends are quoted per thousand on Hyperliquid; Binance quotes one. */
      const thousand = /^k[A-Z]/.test(market.symbol);
      const base = thousand ? market.symbol.slice(1) : market.symbol;
      const [spot, perp] = await Promise.all([binanceTicker(base).catch(() => null), binanceFunding(base).catch(() => null)]);
      const scale = thousand ? 1000 : 1;
      return arbitrageRow({
        symbol: market.symbol,
        hyperliquid: { mark: market.markPrice, fundingRate: market.fundingRate, fundingIntervalHours: market.fundingIntervalHours ?? 1, volume24hUsd: market.volume24hUsd },
        binanceSpot: spot?.ok && spot.data ? spot.data.lastPrice * scale : null,
        binanceSpotVolumeUsd: spot?.ok && spot.data ? spot.data.volume24hQuote : null,
        binancePerp: {
          mark: perp?.ok && perp.data?.markPrice ? perp.data.markPrice * scale : null,
          fundingRate: perp?.ok ? (perp.data?.fundingRate ?? null) : null,
          fundingIntervalHours: perp?.ok ? (perp.data?.fundingIntervalHours ?? 8) : null,
        },
      });
    }),
  );
  const compared = rows.filter((row) => row.binanceSpot !== null || row.binanceFundingApr !== null);
  if (compared.length < rows.length) notes.push("Markets Binance does not list are left out.");
  if (rows.some((row) => row.excluded)) {
    notes.push("Where Binance's price is too far from Hyperliquid's to be the same asset, or its pair has stopped trading, that comparison is left out.");
  }
  return { rows: rankArbitrage(compared), asOf: new Date().toISOString(), notes };
}
