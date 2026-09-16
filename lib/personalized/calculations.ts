/* ---------------------------------------------------------------------------
   Every number Personalized states, computed here.

   Pure functions over a `PortfolioSnapshot`. No React, no fetch, no model.
   That boundary is the product: the LLM's job is to EXPLAIN these figures,
   never to produce them. A model asked to compute a concentration percentage
   will produce a confident, plausible, slightly wrong one, and the operator
   has no way to tell. So the arithmetic happens in code that can be tested,
   and the prompt hands the model finished numbers with instructions not to
   recompute them.

   Two rules, both carried from the portfolio layer:

   Unverified tokens never count. Airdropping a token named "USDC" at a wallet
   costs cents; if it counted toward equity, an attacker could set what this
   assistant tells its user they are worth.

   A figure whose inputs are absent is null, not zero. "I could not read
   Hyperliquid" and "Hyperliquid is empty" are different sentences, and only
   one of them is true at a time.
--------------------------------------------------------------------------- */

import type { PerpPosition, PortfolioSnapshot, SpotHolding } from "@/lib/portfolio/types";
import type {
  ExposureRow,
  PersonalizedMemory,
  RiskMetric,
  TodayRow,
} from "@/lib/personalized/types";

/** Holdings below this are noise in an analysis. */
const DUST_USD = 0.5;

/** Counted as deployable at face value. */
const STABLES = new Set(["USDC", "USDT", "PYUSD", "USDE", "DAI", "FDUSD", "USDS"]);

/** A perp market's underlying symbol: "SOL-PERP" and "SOL/USD" are both SOL. */
export function underlyingSymbol(market: string): string {
  return market
    .toUpperCase()
    .replace(/[-/](PERP|USDC?|USDT|PERPETUAL)$/u, "")
    .replace(/^K/, "")
    .trim();
}

function counted(snapshot: PortfolioSnapshot): SpotHolding[] {
  return snapshot.spot.filter(
    (holding) =>
      holding.verified && holding.valueUsd !== null && holding.valueUsd >= DUST_USD,
  );
}

/* ---------------------------------------------------------------------------
   Equity and capital
--------------------------------------------------------------------------- */

export function totalEquityUsd(snapshot: PortfolioSnapshot): number | null {
  return snapshot.summary.totalValueUsd;
}

/**
 * Capital that could be deployed without selling anything.
 *
 * Stablecoins held plus free venue collateral. A non-stable spot holding is
 * not "available" — turning it into capital means a trade, which is a
 * decision rather than a balance.
 */
export function availableCapitalUsd(snapshot: PortfolioSnapshot): number | null {
  const stable = counted(snapshot)
    .filter((holding) => STABLES.has(holding.symbol.toUpperCase()))
    .reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);

  const venue = snapshot.summary.availableCapitalUsd;
  if (venue === null && stable === 0) return null;
  /* `availableCapitalUsd` on the summary already folds wallet stables in —
     see composePortfolio — so it is preferred when present. */
  return venue ?? stable;
}

export function stablecoinRatioPct(snapshot: PortfolioSnapshot): number | null {
  const total = totalEquityUsd(snapshot);
  if (total === null || total <= 0) return null;
  const stable = counted(snapshot)
    .filter((holding) => STABLES.has(holding.symbol.toUpperCase()))
    .reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
  return (stable / total) * 100;
}

/* ---------------------------------------------------------------------------
   Exposure

   Exposure is per SYMBOL and spans venues: SOL held in the wallet and a
   SOL-PERP on Hyperliquid are the same bet, and reporting them separately is
   how a 38% concentration reads as two comfortable 19% ones.

   Perps contribute their MARGIN, not their notional. A 5x SOL long on $220
   is $220 of the operator's capital riding on SOL — counting $1,100 would
   overstate concentration against an equity denominator that never contained
   it, and the percentages would not sum to anything meaningful.
--------------------------------------------------------------------------- */

export function exposures(snapshot: PortfolioSnapshot): ExposureRow[] {
  const total = totalEquityUsd(snapshot);
  if (total === null || total <= 0) return [];

  const buckets = new Map<string, { valueUsd: number; venues: Set<string> }>();

  const add = (symbol: string, valueUsd: number, venue: string): void => {
    if (valueUsd < DUST_USD) return;
    const existing = buckets.get(symbol);
    if (existing) {
      existing.valueUsd += valueUsd;
      existing.venues.add(venue);
    } else {
      buckets.set(symbol, { valueUsd, venues: new Set([venue]) });
    }
  };

  for (const holding of counted(snapshot)) {
    add(holding.symbol.toUpperCase(), holding.valueUsd ?? 0, "Spot");
  }

  for (const position of snapshot.perps) {
    const committed = (position.marginUsd ?? 0) + (position.unrealizedPnlUsd ?? 0);
    if (committed <= 0) continue;
    add(underlyingSymbol(position.market), committed, "Hyperliquid");
  }

  return [...buckets.entries()]
    .map(([symbol, bucket]) => ({
      symbol,
      valueUsd: bucket.valueUsd,
      pct: (bucket.valueUsd / total) * 100,
      venues: [...bucket.venues],
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
}

export function largestExposure(snapshot: PortfolioSnapshot): ExposureRow | null {
  return exposures(snapshot)[0] ?? null;
}

/** Exposure to one symbol across every venue. Null when it is not held. */
export function exposureTo(
  snapshot: PortfolioSnapshot,
  symbol: string,
): ExposureRow | null {
  const wanted = symbol.toUpperCase();
  return exposures(snapshot).find((row) => row.symbol === wanted) ?? null;
}

/* ---------------------------------------------------------------------------
   24h change and attribution

   The `r / (1 + r)` is load-bearing: a holding worth 110 after a +10% day
   gained 10, not 11. Multiplying today's value by the rate overstates every
   gain and understates every loss — small at 1%, obvious at 40%.

   Coverage travels with the figure because only assets a market source
   prices carry a 24h number. On a Solana wallet that is the majors and
   nothing else, and quoting a portfolio-wide move computed over a third of
   the portfolio is the kind of wrong that reads as precise.
--------------------------------------------------------------------------- */

export interface Change24h {
  usdChange: number;
  pctChange: number;
  coveragePct: number;
}

export function change24h(snapshot: PortfolioSnapshot): Change24h | null {
  let covered = 0;
  let delta = 0;
  let total = 0;

  for (const holding of counted(snapshot)) {
    total += holding.valueUsd ?? 0;
    if (holding.change24hPct === null) continue;
    covered += holding.valueUsd ?? 0;
    const r = holding.change24hPct / 100;
    delta += (holding.valueUsd ?? 0) * (r / (1 + r));
  }

  if (covered <= 0) return null;
  const opened = covered - delta;

  return {
    usdChange: delta,
    pctChange: opened > 0 ? (delta / opened) * 100 : 0,
    coveragePct: total > 0 ? Math.min(100, (covered / total) * 100) : 100,
  };
}

export interface Contribution {
  symbol: string;
  usdChange: number;
  pctOfPortfolio: number;
  assetChangePct: number;
}

/**
 * Who moved the portfolio, ranked by absolute dollar effect.
 *
 * This is the answer to "why am I down today": not the asset that fell
 * furthest, but the one whose fall cost the most, which is a function of how
 * much was held.
 */
export function contributions(snapshot: PortfolioSnapshot): Contribution[] {
  const total = totalEquityUsd(snapshot);

  return counted(snapshot)
    .filter((holding) => holding.change24hPct !== null)
    .map((holding) => {
      const r = (holding.change24hPct ?? 0) / 100;
      const usdChange = (holding.valueUsd ?? 0) * (r / (1 + r));
      return {
        symbol: holding.symbol.toUpperCase(),
        usdChange,
        pctOfPortfolio:
          total !== null && total > 0 ? ((holding.valueUsd ?? 0) / total) * 100 : 0,
        assetChangePct: holding.change24hPct ?? 0,
      };
    })
    .sort((a, b) => Math.abs(b.usdChange) - Math.abs(a.usdChange));
}

/** Open perp PnL, which offsets or compounds the spot move. */
export function perpPnlUsd(snapshot: PortfolioSnapshot): number | null {
  const withPnl = snapshot.perps.filter((position) => position.unrealizedPnlUsd !== null);
  if (withPnl.length === 0) return null;
  return withPnl.reduce((sum, position) => sum + (position.unrealizedPnlUsd ?? 0), 0);
}

/* ---------------------------------------------------------------------------
   Risk

   Every metric is omitted when its inputs are absent, and each one states the
   saved preference it was measured against. A risk panel of dashes teaches
   its reader to ignore the panel.

   There is deliberately no composite "risk score". A single number blending
   concentration, leverage and buffer is not derivable from these inputs in
   any defensible way, and inventing one would be the exact fabrication this
   whole module exists to prevent.
--------------------------------------------------------------------------- */

function memoryNumber(memories: PersonalizedMemory[], type: string): number | null {
  const found = memories.find((memory) => memory.type === type);
  const value = found?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function riskMetrics(
  snapshot: PortfolioSnapshot,
  memories: PersonalizedMemory[],
): RiskMetric[] {
  const metrics: RiskMetric[] = [];
  const total = totalEquityUsd(snapshot);

  const concentrationLimit = memoryNumber(memories, "concentration_limit");
  const largest = largestExposure(snapshot);
  if (largest !== null) {
    const breached = concentrationLimit !== null && largest.pct > concentrationLimit;
    metrics.push({
      key: "concentration",
      label: "Largest exposure",
      value: `${largest.symbol} ${largest.pct.toFixed(1)}%`,
      limit: concentrationLimit === null ? null : `${concentrationLimit}%`,
      breached,
      detail: breached
        ? `Above your saved ${concentrationLimit}% single-asset limit.`
        : largest.venues.length > 1
          ? `Across ${largest.venues.join(" and ")}.`
          : `Held in ${largest.venues[0] ?? "one account"}.`,
    });
  }

  const bufferLimit = memoryNumber(memories, "stablecoin_buffer");
  const stables = stablecoinRatioPct(snapshot);
  if (stables !== null) {
    const breached = bufferLimit !== null && stables < bufferLimit;
    metrics.push({
      key: "buffer",
      label: "Stablecoin reserve",
      value: `${stables.toFixed(1)}%`,
      limit: bufferLimit === null ? null : `${bufferLimit}%`,
      breached,
      detail: breached
        ? `Below the ${bufferLimit}% buffer you asked to keep.`
        : stables < 5
          ? "Thin — little dry powder for a drawdown."
          : "Healthy.",
    });
  }

  /* Margin utilisation needs both the committed margin and an equity figure
     to measure it against; either missing makes the ratio meaningless. */
  const margin = snapshot.perps.reduce((sum, p) => sum + (p.marginUsd ?? 0), 0);
  if (margin > 0 && total !== null && total > 0) {
    const pct = (margin / total) * 100;
    metrics.push({
      key: "margin",
      label: "Margin committed",
      value: `${pct.toFixed(1)}%`,
      limit: null,
      breached: pct >= 50,
      detail:
        pct >= 50 ? "Over half of equity is posted as margin." : "Within a normal range.",
    });
  }

  /* Liquidation distance, only where the venue supplied both a mark and a
     liquidation price. Deriving one from leverage would be a guess about the
     single number a leveraged operator cannot afford to see wrong. */
  const distances = snapshot.perps
    .filter((p) => p.liquidationPrice !== null && p.markPrice !== null && p.markPrice > 0)
    .map((p) => ({
      market: p.market,
      pct: Math.abs((p.markPrice! - p.liquidationPrice!) / p.markPrice!) * 100,
    }))
    .sort((a, b) => a.pct - b.pct);

  const nearest = distances[0];
  if (nearest !== undefined) {
    metrics.push({
      key: "liquidation",
      label: "Nearest liquidation",
      value: `${nearest.pct.toFixed(1)}%`,
      limit: null,
      breached: nearest.pct <= 15,
      detail: `${nearest.market} is ${nearest.pct.toFixed(1)}% from its liquidation price.`,
    });
  }

  return metrics;
}

/* ---------------------------------------------------------------------------
   Today
--------------------------------------------------------------------------- */

export function todayRows(snapshot: PortfolioSnapshot): TodayRow[] {
  const rows: TodayRow[] = [];
  const change = change24h(snapshot);

  if (change !== null) {
    rows.push({
      label: "Portfolio 24h",
      value: `${change.pctChange >= 0 ? "+" : ""}${change.pctChange.toFixed(2)}%`,
      tone: change.pctChange >= 0 ? "positive" : "negative",
      detail:
        change.coveragePct < 95
          ? `Over ${change.coveragePct.toFixed(0)}% of value that carries a 24h price.`
          : null,
    });

    const ranked = contributions(snapshot);
    const mover = ranked[0];
    if (mover !== undefined && Math.abs(mover.usdChange) >= 0.01) {
      rows.push({
        label: "Largest mover",
        value: `${mover.symbol} ${mover.assetChangePct >= 0 ? "+" : ""}${mover.assetChangePct.toFixed(2)}%`,
        tone: mover.usdChange >= 0 ? "positive" : "negative",
        detail: `${mover.pctOfPortfolio.toFixed(1)}% of equity.`,
      });
    }
  }

  const perp = perpPnlUsd(snapshot);
  if (perp !== null) {
    rows.push({
      label: "Open position PnL",
      value: `${perp >= 0 ? "+" : "-"}$${Math.abs(perp).toFixed(2)}`,
      tone: perp >= 0 ? "positive" : "negative",
      detail: `${snapshot.perps.length} open position${snapshot.perps.length === 1 ? "" : "s"}.`,
    });
  }

  return rows;
}

/* ---------------------------------------------------------------------------
   Position helpers, for action planning
--------------------------------------------------------------------------- */

/** The riskiest open position by liquidation proximity. Null when unknowable. */
export function riskiestPosition(snapshot: PortfolioSnapshot): PerpPosition | null {
  const rated = snapshot.perps
    .filter((p) => p.liquidationPrice !== null && p.markPrice !== null && p.markPrice > 0)
    .map((p) => ({
      position: p,
      distance: Math.abs((p.markPrice! - p.liquidationPrice!) / p.markPrice!) * 100,
    }))
    .sort((a, b) => a.distance - b.distance);
  return rated[0]?.position ?? null;
}

/** A holding by symbol, for resolving "sell half my SOL" against real state. */
export function holdingFor(
  snapshot: PortfolioSnapshot,
  symbol: string,
): SpotHolding | null {
  const wanted = symbol.toUpperCase();
  return (
    counted(snapshot).find((holding) => holding.symbol.toUpperCase() === wanted) ?? null
  );
}
