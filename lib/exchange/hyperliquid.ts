import "server-only";

import { fetchJson } from "@/lib/market/http";
import type {
  AccountEquity,
  LivePosition,
  PortfolioSource,
  SpotBalance,
} from "@/lib/exchange/types";

/* ---------------------------------------------------------------------------
   Hyperliquid private reads — which need no key at all.

   The /info endpoint is public and keyed by wallet address, so a connected
   Hyperliquid account stores an address and no secret. By default that is
   the verified Privy session's EVM wallet. A person may instead name another
   address (Connections → Hyperliquid), and because a typed address could be
   anyone's, it is read and shown to them first and only stored when they
   confirm it — the same check-then-save rule as a Polymarket address.

   /info is read-only by construction. Order placement is a different host
   path entirely (/exchange) and appears nowhere in this codebase.
--------------------------------------------------------------------------- */

const INFO = "https://api.hyperliquid.xyz/info";

interface ClearinghouseState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
  };
  withdrawable: string;
  assetPositions: Array<{
    position: {
      coin: string;
      szi: string;
      entryPx: string | null;
      positionValue: string;
      unrealizedPnl: string;
      liquidationPx: string | null;
      leverage: { type: string; value: number } | null;
    };
  }>;
}

interface SpotState {
  balances: Array<{ coin: string; total: string; hold: string }>;
}

const num = (value: string | null) => (value === null ? 0 : Number(value));

function info<T>(body: Record<string, unknown>): Promise<T> {
  return fetchJson<T>({
    source: "hyperliquid",
    url: INFO,
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function hyperliquidPortfolio(address: string): PortfolioSource {
  const user = address.toLowerCase();

  return {
    id: "hyperliquid",

    async perpPositions() {
      const perps = await info<ClearinghouseState>({
        type: "clearinghouseState",
        user,
      });

      const rows: LivePosition[] = [];

      for (const entry of perps.assetPositions) {
        const position = entry.position;
        /* szi is signed: negative is short. Zero rows are not returned here,
           unlike Binance, but guard anyway. */
        const signed = num(position.szi);
        if (signed === 0) continue;

        const size = Math.abs(signed);
        const notional = Math.abs(num(position.positionValue));
        const symbol = position.coin.toUpperCase();

        rows.push({
          exchange: "hyperliquid",
          market: "perp",
          symbol,
          label: `${symbol}-PERP`,
          side: signed > 0 ? "long" : "short",
          size,
          entryPrice: position.entryPx === null ? null : num(position.entryPx),
          /* The state gives position value rather than a mark, so derive it.
             A zero size would have been skipped above. */
          markPrice: notional / size,
          liquidationPrice:
            position.liquidationPx === null ? null : num(position.liquidationPx),
          unrealizedPnl: num(position.unrealizedPnl),
          notional,
          leverage: position.leverage?.value ?? null,
        });
      }

      return rows;
    },

    async spotBalances(): Promise<SpotBalance[]> {
      const spot = await info<SpotState>({
        type: "spotClearinghouseState",
        user,
      });

      return spot.balances.flatMap((balance) => {
        const total = num(balance.total);
        if (total === 0) return [];
        return [{ symbol: balance.coin.toUpperCase(), size: total }];
      });
    },

    async equity(): Promise<AccountEquity> {
      const state = await info<ClearinghouseState>({
        type: "clearinghouseState",
        user,
      });

      const positions = state.assetPositions.reduce(
        (total, entry) => total + num(entry.position.unrealizedPnl),
        0,
      );

      return {
        exchange: "hyperliquid",
        equity: num(state.marginSummary.accountValue),
        unrealizedPnl: positions,
        available: num(state.withdrawable),
      };
    },
  };
}

/** What is at an address, for a person to recognise before saving it. */
export interface HyperliquidAccountCheck {
  address: string;
  /** Perp account value: margin plus unrealised PnL. */
  accountValueUsd: number;
  positionCount: number;
  spotBalanceCount: number;
}

/**
 * Reads an address without storing anything.
 *
 * A failed read is reported as a failure, never as an empty account — saving
 * on the strength of a read that did not happen is how a typo becomes a
 * permanent wrong link.
 */
export async function inspectHyperliquidAccount(
  address: string,
): Promise<{ ok: true; found: HyperliquidAccountCheck } | { ok: false; error: string }> {
  const user = address.toLowerCase();
  try {
    const [perps, spot] = await Promise.all([
      info<ClearinghouseState>({ type: "clearinghouseState", user }),
      info<SpotState>({ type: "spotClearinghouseState", user }),
    ]);
    return {
      ok: true,
      found: {
        address: user,
        accountValueUsd: num(perps.marginSummary.accountValue),
        positionCount: perps.assetPositions.filter((entry) => num(entry.position.szi) !== 0).length,
        spotBalanceCount: spot.balances.filter((balance) => num(balance.total) !== 0).length,
      },
    };
  } catch {
    return { ok: false, error: "Could not reach Hyperliquid to read that address. Nothing was saved." };
  }
}
