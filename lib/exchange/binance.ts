import "server-only";

import { signedGet } from "@/lib/exchange/sign";
import type {
  AccountEquity,
  LivePosition,
  PortfolioSource,
  SpotBalance,
} from "@/lib/exchange/types";

/* ---------------------------------------------------------------------------
   Binance private reads.

   Two signed GET endpoints and nothing else:
     /fapi/v3/account   — futures balances and open positions
     /api/v3/account    — spot balances

   Both are read-only. No order endpoint appears here. See lib/exchange/types.
--------------------------------------------------------------------------- */

const SPOT = "https://api.binance.com";
const FUTURES = "https://fapi.binance.com";

interface FuturesPosition {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
}

interface FuturesAccount {
  totalMarginBalance: string;
  totalUnrealizedProfit: string;
  availableBalance: string;
  positions: FuturesPosition[];
}

interface SpotAccount {
  balances: Array<{ asset: string; free: string; locked: string }>;
}

const num = (value: string) => Number(value);

/** SOLUSDT to SOL. Leaves anything not quoted in USDT alone. */
function toTicker(pair: string): string {
  for (const quote of ["USDT", "USDC", "BUSD", "FDUSD"]) {
    if (pair.endsWith(quote)) return pair.slice(0, -quote.length);
  }
  return pair;
}

export function binancePortfolio(
  apiKey: string,
  apiSecret: string,
): PortfolioSource {
  const credentials = { apiKey, apiSecret };

  async function futures(): Promise<FuturesAccount> {
    return signedGet<FuturesAccount>({
      baseUrl: FUTURES,
      path: "/fapi/v3/account",
      ...credentials,
    });
  }

  return {
    id: "binance",

    async perpPositions() {
      const perps = await futures();
      const rows: LivePosition[] = [];

      for (const position of perps.positions) {
        const amount = num(position.positionAmt);
        /* Binance returns a row for every symbol the account has ever had a
           position in, most of them zero. Only open ones are positions. */
        if (amount === 0) continue;

        const mark = num(position.markPrice);
        const liquidation = num(position.liquidationPrice);
        const symbol = toTicker(position.symbol);

        rows.push({
          exchange: "binance",
          market: "perp",
          symbol,
          label: `${symbol}-PERP`,
          side: amount > 0 ? "long" : "short",
          size: Math.abs(amount),
          entryPrice: num(position.entryPrice),
          markPrice: mark,
          /* Zero means no liquidation price, not a price of zero. */
          liquidationPrice: liquidation > 0 ? liquidation : null,
          unrealizedPnl: num(position.unRealizedProfit),
          notional: Math.abs(amount) * mark,
          leverage: num(position.leverage) || null,
        });
      }

      return rows;
    },

    async spotBalances(): Promise<SpotBalance[]> {
      const spot = await signedGet<SpotAccount>({
        baseUrl: SPOT,
        path: "/api/v3/account",
        ...credentials,
      });

      return spot.balances.flatMap((balance) => {
        const total = num(balance.free) + num(balance.locked);
        if (total === 0) return [];
        return [{ symbol: balance.asset.toUpperCase(), size: total }];
      });
    },

    async equity(): Promise<AccountEquity> {
      const account = await futures();
      return {
        exchange: "binance",
        equity: num(account.totalMarginBalance),
        unrealizedPnl: num(account.totalUnrealizedProfit),
        available: num(account.availableBalance),
      };
    },
  };
}
