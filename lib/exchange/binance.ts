import "server-only";

import { signedGet } from "@/lib/exchange/sign";
import { UpstreamError } from "@/lib/market/http";
import type {
  AccountEquity,
  LivePosition,
  PortfolioSource,
  SpotBalance,
} from "@/lib/exchange/types";

/* ---------------------------------------------------------------------------
   Binance private reads.

   Three signed GET endpoints and nothing else:
     /fapi/v3/account                 — futures balances and open positions
     /api/v3/account                  — spot balances
     /sapi/v1/account/apiRestrictions — what a key is permitted to do

   All are read-only. No order endpoint appears here. See lib/exchange/types.
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

/* ---------------------------------------------------------------------------
   Checking a key before it is stored.

   The connection is read-only because nothing here calls an order endpoint —
   but a key that CAN trade or withdraw is still that key, sitting encrypted
   in a database. So a key is read back from Binance before it is saved, and
   one with any write permission is refused rather than trusted on the
   strength of the form having asked for read-only.

   The verdict is computed by a pure function so the rule can be tested
   without a network.
--------------------------------------------------------------------------- */

/** `GET /sapi/v1/account/apiRestrictions`, the fields this reads. */
export interface ApiRestrictions {
  ipRestrict?: boolean;
  enableReading?: boolean;
  enableWithdrawals?: boolean;
  enableInternalTransfer?: boolean;
  permitsUniversalTransfer?: boolean;
  enableMargin?: boolean;
  enableFutures?: boolean;
  enableVanillaOptions?: boolean;
  enableSpotAndMarginTrading?: boolean;
  enablePortfolioMarginTrading?: boolean;
  enableFixApiTrade?: boolean;
}

export type KeyCheck =
  | { ok: true; ipRestricted: boolean }
  | { ok: false; reason: "rejected" | "unreachable" | "cannot_read" | "can_write"; message: string };

/** Each write permission, as Binance's API-management page names it. */
const WRITE_PERMISSIONS: Array<[keyof ApiRestrictions, string]> = [
  ["enableWithdrawals", "withdrawals"],
  ["enableInternalTransfer", "internal transfer"],
  ["permitsUniversalTransfer", "universal transfer"],
  ["enableSpotAndMarginTrading", "spot and margin trading"],
  ["enableMargin", "margin loan, repay and transfer"],
  ["enableFutures", "futures"],
  ["enableVanillaOptions", "European options"],
  ["enablePortfolioMarginTrading", "portfolio margin trading"],
  ["enableFixApiTrade", "FIX API trading"],
];

/** Whether a key's reported permissions make it safe to store. */
export function assessRestrictions(restrictions: ApiRestrictions): KeyCheck {
  if (restrictions.enableReading !== true) {
    return {
      ok: false,
      reason: "cannot_read",
      message: "This key does not have Enable Reading turned on, so Elyra could not read the account.",
    };
  }

  const writes = WRITE_PERMISSIONS.filter(([field]) => restrictions[field] === true).map(([, name]) => name);
  if (writes.length > 0) {
    return {
      ok: false,
      reason: "can_write",
      message:
        `This key can do more than read (${writes.join(", ")}). ` +
        "Create a key with only Enable Reading turned on. Nothing was saved.",
    };
  }

  return { ok: true, ipRestricted: restrictions.ipRestrict === true };
}

/**
 * Reads a key's permissions from Binance. Never throws, and never puts the
 * key or the secret into a message — the caller may show it to the person.
 */
export async function checkBinanceKey(apiKey: string, apiSecret: string): Promise<KeyCheck> {
  try {
    const restrictions = await signedGet<ApiRestrictions>({
      baseUrl: SPOT,
      path: "/sapi/v1/account/apiRestrictions",
      apiKey,
      apiSecret,
      timeoutMs: 8_000,
    });
    return assessRestrictions(restrictions);
  } catch (error) {
    /* 4xx is Binance refusing this key: a wrong key or secret, a key from
       another account type, or an IP allowlist that does not include this
       server. Anything else is Binance being unreachable, which says nothing
       about the key either way — so nothing is saved on it. */
    const status = error instanceof UpstreamError ? error.status : null;
    /* 418 and 429 are rate limits, not a verdict on the key. */
    if (status !== null && status >= 400 && status < 500 && status !== 418 && status !== 429) {
      return {
        ok: false,
        reason: "rejected",
        message:
          "Binance did not accept this key and secret. Check both were copied in full, " +
          "and that any IP allowlist on the key includes Elyra's server.",
      };
    }
    return {
      ok: false,
      reason: "unreachable",
      message: "Could not reach Binance to check the key. Nothing was saved — try again in a moment.",
    };
  }
}
