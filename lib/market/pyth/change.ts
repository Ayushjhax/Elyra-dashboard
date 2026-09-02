import "server-only";

import { TTL, cached } from "@/lib/market/cache";
import { changeFor, yahooSymbol } from "@/lib/market/pyth/yahoo";
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

   Everything else — equities, metals, FX, commodities — comes from Yahoo's
   chart endpoint, against the previous close, which is what "change" means
   for an instrument whose market closes overnight.

   Anything neither source covers stays null and shows a dash. That is the
   "24h change if available" case, reported honestly rather than computed from
   a price this app has not actually observed for 24 hours.
--------------------------------------------------------------------------- */

/** Crypto goes to the exchanges, which publish a true rolling 24h window. */
function isCrypto(asset: PythAsset): boolean {
  return asset.assetType === "crypto";
}

/** Longer than the price TTL: a previous close does not move intraday. */
const NON_CRYPTO_TTL_SECONDS = 300;

/** Yahoo takes one symbol per request, so these run concurrently and cache. */
async function nonCryptoChanges(assets: PythAsset[]): Promise<Map<number, number>> {
  const targets: Array<{ id: number; yahoo: string }> = [];
  for (const asset of assets) {
    const yahoo = yahooSymbol(asset);
    if (yahoo) targets.push({ id: asset.id, yahoo });
  }
  if (targets.length === 0) return new Map();

  const settled = await Promise.allSettled(
    targets.map(async (target) => {
      const result = await cached(
        `change:yahoo:${target.yahoo}`,
        NON_CRYPTO_TTL_SECONDS,
        () => changeFor(target.yahoo),
      );
      return { id: target.id, change: result.value };
    }),
  );

  const byId = new Map<number, number>();
  for (const outcome of settled) {
    if (outcome.status !== "fulfilled") continue;
    /* One symbol Yahoo does not know must not cost the others theirs. */
    if (outcome.value.change === null) continue;
    byId.set(outcome.value.id, outcome.value.change);
  }
  return byId;
}

/**
 * 24h change per feed id. Never throws: a source outage costs the change
 * column, not the prices beside it.
 */
export async function changesForAssets(
  assets: PythAsset[],
): Promise<Map<number, number>> {
  const crypto = assets.filter(isCrypto);
  const rest = assets.filter((asset) => !isCrypto(asset));

  const cryptoChanges = (async () => {
    if (crypto.length === 0) return new Map<number, number>();
    const symbols = [...new Set(crypto.map((asset) => asset.symbol))].sort();

    try {
      const result = await cached(`change24h:${symbols.join(",")}`, TTL.price, () =>
        router.snapshots(symbols),
      );
      const bySymbol = new Map<string, number>();
      for (const row of result.value) bySymbol.set(row.symbol, row.change24hPct);

      const byId = new Map<number, number>();
      for (const asset of crypto) {
        const change = bySymbol.get(asset.symbol);
        if (change !== undefined) byId.set(asset.id, change);
      }
      return byId;
    } catch {
      /* Every exchange refused. Prices still render; the change column shows
         a dash, which is accurate — this app does not know the figure. */
      return new Map<number, number>();
    }
  })();

  /* The two sources are independent: one being down must not blank the other
     half of the watchlist. */
  const [fromExchanges, fromYahoo] = await Promise.all([
    cryptoChanges,
    nonCryptoChanges(rest).catch(() => new Map<number, number>()),
  ]);

  return new Map([...fromExchanges, ...fromYahoo]);
}
