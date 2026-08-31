import "server-only";

import { loadPortfolioSources } from "@/lib/exchange/accounts";
import type {
  AccountEquity,
  LivePosition,
  PortfolioResult,
  SourceFailure,
  SpotBalance,
} from "@/lib/exchange/types";
import { snapshots } from "@/lib/market/router";
import type { ExchangeId } from "@/lib/supabase/types";

/* ---------------------------------------------------------------------------
   One portfolio, assembled from every venue a user has connected.

   Perps arrive already priced by their venue. Spot balances arrive as bare
   quantities and are valued here, in one batched market request covering
   every symbol held anywhere — which is why the sources return balances
   rather than positions.
--------------------------------------------------------------------------- */

/** Holdings worth less than this bury the real rows without adding anything. */
const DUST_THRESHOLD_USD = 1;

/** Collateral, already counted in account equity. Listing it double-counts. */
const STABLECOINS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "DAI", "TUSD"]);

export async function getPortfolio(
  userId: string,
  sessionWallet: string | null = null,
): Promise<PortfolioResult> {
  const { sources, failures: loadFailures } = await loadPortfolioSources(
    userId,
    sessionWallet,
  );

  const failures: SourceFailure[] = [...loadFailures];
  const positions: LivePosition[] = [];
  const equities: AccountEquity[] = [];
  const balances: Array<{ exchange: ExchangeId; balance: SpotBalance }> = [];

  /* Every venue is read concurrently, and one venue failing must not take
     the others with it — hence allSettled and a recorded failure rather than
     a rejection. */
  const reads = await Promise.allSettled(
    sources.map(async (source) => {
      const [perps, spot, equity] = await Promise.all([
        source.perpPositions(),
        source.spotBalances().catch(() => [] as SpotBalance[]),
        source.equity(),
      ]);
      return { id: source.id, perps, spot, equity };
    }),
  );

  reads.forEach((read, index) => {
    const id = sources[index].id;
    if (read.status === "rejected") {
      failures.push({
        scope: id,
        reason:
          read.reason instanceof Error
            ? read.reason.message
            : "Could not read account",
      });
      return;
    }
    positions.push(...read.value.perps);
    equities.push(read.value.equity);
    for (const balance of read.value.spot) {
      balances.push({ exchange: id, balance });
    }
  });

  /* One market request for every spot symbol held anywhere, rather than one
     per venue or one per symbol. */
  const wanted = [
    ...new Set(
      balances
        .map((entry) => entry.balance.symbol)
        .filter((symbol) => !STABLECOINS.has(symbol)),
    ),
  ];

  if (wanted.length > 0) {
    const priced = await snapshots(wanted).catch(() => []);
    const priceOf = new Map(priced.map((row) => [row.symbol, row.price]));

    for (const { exchange, balance } of balances) {
      if (STABLECOINS.has(balance.symbol)) continue;

      const price = priceOf.get(balance.symbol);
      /* No price means no source lists it. Valuing it at zero would understate
         the portfolio silently, so it is omitted and counted as unpriced. */
      if (price === undefined) continue;

      const notional = balance.size * price;
      if (notional < DUST_THRESHOLD_USD) continue;

      positions.push({
        exchange,
        market: "spot",
        symbol: balance.symbol,
        label: `${balance.symbol}/USD`,
        side: "long",
        size: balance.size,
        /* Spot balances carry no cost basis: the account endpoints report
           holdings, not what they were bought at. Null is honest; deriving
           one from trade history is a much heavier call. */
        entryPrice: null,
        markPrice: price,
        liquidationPrice: null,
        unrealizedPnl: null,
        notional,
        leverage: null,
      });
    }

    const unpriced = wanted.filter((symbol) => !priceOf.has(symbol));
    if (unpriced.length > 0) {
      failures.push({
        scope: "market",
        reason: `No market price found for ${unpriced.join(", ")}; those holdings are omitted`,
      });
    }
  }

  positions.sort((a, b) => b.notional - a.notional);

  return { positions, equities, failures };
}

export interface PortfolioSummary {
  equity: number;
  totalUnrealizedPnl: number;
  /** Absolute notional across every position, long and short. */
  grossExposure: number;
  /** Longs minus shorts. */
  netExposure: number;
  largestPosition: {
    label: string;
    exchange: ExchangeId;
    notional: number;
    shareOfEquityPct: number | null;
  } | null;
  positionCount: number;
  venues: ExchangeId[];
  failures: SourceFailure[];
}

export function summarise(result: PortfolioResult): PortfolioSummary {
  const equity = result.equities.reduce((total, row) => total + row.equity, 0);

  const totalUnrealizedPnl = result.equities.reduce(
    (total, row) => total + (row.unrealizedPnl ?? 0),
    0,
  );

  let gross = 0;
  let net = 0;
  for (const position of result.positions) {
    gross += position.notional;
    net += position.side === "long" ? position.notional : -position.notional;
  }

  const largest = result.positions.reduce<LivePosition | null>(
    (best, position) =>
      best === null || position.notional > best.notional ? position : best,
    null,
  );

  return {
    equity,
    totalUnrealizedPnl,
    grossExposure: gross,
    netExposure: net,
    largestPosition:
      largest === null
        ? null
        : {
            label: largest.label,
            exchange: largest.exchange,
            notional: largest.notional,
            shareOfEquityPct:
              equity > 0 ? (largest.notional / equity) * 100 : null,
          },
    positionCount: result.positions.length,
    venues: result.equities.map((row) => row.exchange),
    failures: result.failures,
  };
}
