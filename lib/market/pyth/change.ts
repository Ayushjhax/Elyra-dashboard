import "server-only";

import { TTL, cached } from "@/lib/market/cache";
import * as router from "@/lib/market/router";
import type { PythAsset } from "@/lib/market/pyth/types";

/* ---------------------------------------------------------------------------
   24h change.

   Pyth's price endpoint publishes the current price, a confidence interval
   and an EMA — it has no 24h window, and the historical channel this key can
   reach returns nothing. So the change figure comes from the exchange sources
   this app already talks to (Binance, OKX, Hyperliquid), which publish a real
   24h ticker.

   Price and change therefore have different origins, which is only sound
   because they agree: spot-checked against Pyth at the same moment, Binance
   was within 0.05% on both SOL and BTC. The change is a percentage over a
   window, so a difference that small does not move it meaningfully.

   Everything Pyth carries that those exchanges do not list — equities,
   metals, FX, commodities — gets null, and the UI shows a dash. That is the
   "24h change if available" case, and it is reported honestly rather than
   computed from a price this app has not actually observed for 24 hours.
--------------------------------------------------------------------------- */

/** Only crypto is listed on the exchange sources; asking for the rest wastes a call. */
function eligible(asset: PythAsset): boolean {
  return asset.assetType === "crypto";
}

/**
 * 24h change per feed id. Never throws: a source outage costs the change
 * column, not the prices beside it.
 */
export async function changesForAssets(
  assets: PythAsset[],
): Promise<Map<number, number>> {
  const wanted = assets.filter(eligible);
  if (wanted.length === 0) return new Map();

  const symbols = [...new Set(wanted.map((a) => a.symbol))].sort();
  const key = `change24h:${symbols.join(",")}`;

  try {
    const result = await cached(key, TTL.price, () => router.snapshots(symbols));

    const bySymbol = new Map<string, number>();
    for (const row of result.value) bySymbol.set(row.symbol, row.change24hPct);

    const byId = new Map<number, number>();
    for (const asset of wanted) {
      const change = bySymbol.get(asset.symbol);
      if (change !== undefined) byId.set(asset.id, change);
    }
    return byId;
  } catch {
    /* Every exchange refused. Prices still render; the change column shows a
       dash, which is accurate — this app does not know the figure. */
    return new Map();
  }
}
