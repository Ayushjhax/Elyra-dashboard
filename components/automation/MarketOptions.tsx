"use client";

import { MARKET_GROUP_LABEL, PERP_MARKETS, type MarketGroup } from "@/lib/autotrade/rules";

/* Every market Elyra trades and settles on, grouped for a <select>: crypto, memecoins, Nasdaq stocks on trade[XYZ]. */

const GROUPS: readonly MarketGroup[] = ["crypto", "meme", "nasdaq"];

export function MarketOptions() {
  return (
    <>
      {GROUPS.map((group) => (
        <optgroup key={group} label={MARKET_GROUP_LABEL[group]}>
          {PERP_MARKETS.filter((market) => market.group === group).map((market) => (
            <option key={market.coin} value={market.coin}>
              {market.label}
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}
