/* ---------------------------------------------------------------------------
   Everything the portfolio page computes rather than fetches.

   Pure functions over a PortfolioSnapshot: no React, no fetch, no clock
   except one passed in. That is what makes these testable, and it is also
   what keeps expensive arithmetic out of a render body — the page memoises a
   call to each of these against the snapshot, rather than recomputing
   allocation on every tick of a price.

   The rule running through all of it: a figure is computed only when the
   inputs it needs are actually present. Where they are not, the function
   returns null or omits the row, and the UI shows an em dash with a reason.
   Nothing here fills a gap with a zero, a guess, or a plausible-looking
   default — a capital dashboard's whole value is that its numbers are real.
--------------------------------------------------------------------------- */

import type {
  AllocationMode,
  AllocationSlice,
  BriefObservation,
  HealthMetric,
  PortfolioSnapshot,
  SpotHolding,
} from "@/lib/portfolio/types";

/** Rows below this bury the real holdings without adding anything. */
const DUST_USD = 0.5;

/** Anything past this many rows is summarised as "Other". */
const ALLOCATION_ROWS = 6;

/* ---------------------------------------------------------------------------
   Allocation
--------------------------------------------------------------------------- */

/** Holdings and positions that carry a usable USD value. */
function valued(snapshot: PortfolioSnapshot): Array<{
  key: string;
  label: string;
  logo: string | null;
  venue: string;
  chain: string;
  strategy: string;
  valueUsd: number;
}> {
  const rows: ReturnType<typeof valued> = [];

  for (const holding of snapshot.spot) {
    /* Unverified holdings are excluded for the same reason they are excluded
       from the total: a spoofed token would otherwise show up as a large
       slice of the user's allocation. */
    if (!holding.verified) continue;
    if (holding.valueUsd === null || holding.valueUsd < DUST_USD) continue;
    rows.push({
      key: holding.symbol,
      label: holding.symbol,
      logo: holding.logo,
      venue: holding.venue,
      chain: holding.chain,
      strategy: holding.liquid ? "Cash" : "Spot",
      valueUsd: holding.valueUsd,
    });
  }

  for (const position of snapshot.perps) {
    if (position.notionalUsd < DUST_USD) continue;
    rows.push({
      key: position.market,
      label: position.market,
      logo: null,
      venue: position.venue,
      chain: "—",
      strategy: "Perps",
      valueUsd: position.notionalUsd,
    });
  }

  for (const position of snapshot.defi) {
    if (position.valueUsd === null || position.valueUsd < DUST_USD) continue;
    rows.push({
      key: position.protocol,
      label: position.protocol,
      logo: null,
      venue: position.protocol,
      chain: position.chain,
      strategy: position.category === "lp" ? "LP" : "Yield",
      valueUsd: position.valueUsd,
    });
  }

  return rows;
}

const LABEL: Record<string, string> = {
  wallet: "Wallet",
  hyperliquid: "Hyperliquid",
  binance: "Binance",
  okx: "OKX",
};

function titleCase(value: string): string {
  return LABEL[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Ranked slices for one mode, or an empty array when the mode carries no
 * information.
 *
 * The one-bucket rule differs by mode, and the distinction matters.
 *
 * `asset` is the primary breakdown and stands alone: a wallet holding only
 * SOL should see "SOL 100%", because that row is the portfolio and hiding it
 * would leave the panel blank on a perfectly ordinary account.
 *
 * `venue`, `strategy` and `chain` exist only to reveal a SPLIT. One bucket
 * means there is no split to reveal, so a Chain tab reading "Solana 100%" on
 * a Solana-only wallet is a control that looks like an insight and contains
 * none. Those modes are withheld, which is what §12's "only show modes for
 * which real data exists" asks for.
 */
export function allocationFor(
  snapshot: PortfolioSnapshot,
  mode: AllocationMode,
): AllocationSlice[] {
  const rows = valued(snapshot);
  const total = rows.reduce((sum, row) => sum + row.valueUsd, 0);
  if (total <= 0) return [];

  const buckets = new Map<string, { label: string; logo: string | null; valueUsd: number }>();

  for (const row of rows) {
    const key =
      mode === "asset" ? row.key
      : mode === "venue" ? row.venue
      : mode === "strategy" ? row.strategy
      : row.chain;
    const label = mode === "asset" ? row.label : titleCase(key);
    const existing = buckets.get(key);
    if (existing) existing.valueUsd += row.valueUsd;
    else buckets.set(key, { label, logo: mode === "asset" ? row.logo : null, valueUsd: row.valueUsd });
  }

  /* See the note above: the primary breakdown stands alone, the grouping
     modes need a split to be worth offering at all. */
  if (buckets.size < (mode === "asset" ? 1 : 2)) return [];

  const sorted = [...buckets.entries()]
    .map(([key, bucket]) => ({ key, ...bucket, pct: (bucket.valueUsd / total) * 100 }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  if (sorted.length <= ALLOCATION_ROWS) return sorted;

  const head = sorted.slice(0, ALLOCATION_ROWS - 1);
  const tail = sorted.slice(ALLOCATION_ROWS - 1);
  const rest = tail.reduce((sum, row) => sum + row.valueUsd, 0);

  return [
    ...head,
    {
      key: "__other",
      label: `Other (${tail.length})`,
      logo: null,
      valueUsd: rest,
      pct: (rest / total) * 100,
    },
  ];
}

/** Which modes have something to show, in the order §12 lists them. */
export function availableModes(snapshot: PortfolioSnapshot): AllocationMode[] {
  return (["asset", "venue", "strategy", "chain"] as const).filter(
    (mode) => allocationFor(snapshot, mode).length > 0,
  );
}

/* ---------------------------------------------------------------------------
   24h change

   Only assets a market source actually prices carry a 24h figure, which on a
   Solana wallet is the majors and nothing else. Computing portfolio change
   over that subset and presenting it as the portfolio's change would be
   wrong by however much the uncovered rest moved, so the coverage travels
   with the number and the KPI states it.
--------------------------------------------------------------------------- */

export interface Change24h {
  pnlUsd: number;
  pnlPct: number;
  /** Share of total value the figure was computed over, 0–100. */
  coveragePct: number;
}

export function change24h(snapshot: PortfolioSnapshot): Change24h | null {
  let covered = 0;
  let delta = 0;

  for (const holding of snapshot.spot) {
    if (!holding.verified) continue;
    if (holding.valueUsd === null || holding.change24hPct === null) continue;
    covered += holding.valueUsd;
    /* Value now is (1 + r) × value then, so the move is value × r / (1 + r).
       Multiplying today's value by r would overstate a gain and understate a
       loss — the error is small at 1% and obvious at 40%. */
    const r = holding.change24hPct / 100;
    delta += holding.valueUsd * (r / (1 + r));
  }

  if (covered <= 0) return null;

  const total = snapshot.summary.totalValueUsd;
  const opened = covered - delta;

  return {
    pnlUsd: delta,
    pnlPct: opened > 0 ? (delta / opened) * 100 : 0,
    coveragePct: total !== null && total > 0 ? Math.min(100, (covered / total) * 100) : 100,
  };
}

/* ---------------------------------------------------------------------------
   Capital health

   Every metric here is omitted when its inputs are absent, so the panel
   shrinks rather than showing rows of dashes. §19 asks for exactly this:
   "use only metrics supported by available data".
--------------------------------------------------------------------------- */

function tone(value: number, watchAbove: number, riskAbove: number): HealthMetric["tone"] {
  if (value >= riskAbove) return "risk";
  if (value >= watchAbove) return "watch";
  return "good";
}

export function capitalHealth(snapshot: PortfolioSnapshot): HealthMetric[] {
  const metrics: HealthMetric[] = [];
  const total = snapshot.summary.totalValueUsd;

  if (total !== null && total > 0) {
    const stable = snapshot.spot
      .filter((holding) => holding.liquid && holding.verified)
      .reduce((sum, holding) => sum + (holding.valueUsd ?? 0), 0);
    const pct = (stable / total) * 100;
    metrics.push({
      key: "stables",
      label: "Stablecoin reserve",
      value: `${pct.toFixed(1)}%`,
      /* Low is the risk here, not high — a portfolio with no dry powder
         cannot act on a drawdown. Inverted deliberately. */
      detail: pct < 5 ? "Thin" : pct < 20 ? "Moderate" : "Healthy",
      tone: pct < 5 ? "watch" : "good",
    });

    const largest = [...snapshot.spot]
      .filter((holding) => holding.verified && holding.valueUsd !== null)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))[0];

    if (largest !== undefined && largest.valueUsd !== null) {
      const pctOf = (largest.valueUsd / total) * 100;
      metrics.push({
        key: "concentration",
        label: "Largest position",
        value: `${largest.symbol} ${pctOf.toFixed(1)}%`,
        detail: pctOf >= 60 ? "Highly concentrated" : pctOf >= 35 ? "Concentrated" : "Diversified",
        tone: tone(pctOf, 35, 60),
      });
    }
  }

  /* Margin utilisation needs both a notional and the collateral behind it.
     Either missing makes the ratio meaningless rather than approximate. */
  const marginUsed = snapshot.perps.reduce((sum, p) => sum + (p.marginUsd ?? 0), 0);
  const perpNotional = snapshot.perps.reduce((sum, p) => sum + p.notionalUsd, 0);
  if (marginUsed > 0 && perpNotional > 0 && total !== null && total > 0) {
    const pct = (marginUsed / total) * 100;
    metrics.push({
      key: "margin",
      label: "Perps margin usage",
      value: `${pct.toFixed(1)}%`,
      detail: pct >= 50 ? "Elevated" : pct >= 25 ? "Moderate" : "Healthy",
      tone: tone(pct, 25, 50),
    });
  }

  /* Liquidation distance is reported only for positions whose venue supplied
     a liquidation price AND a mark. Estimating one from leverage would be a
     guess about the single number a user most needs to be exact. */
  const distances = snapshot.perps
    .filter((p) => p.liquidationPrice !== null && p.markPrice !== null && p.markPrice > 0)
    .map((p) => Math.abs((p.markPrice! - p.liquidationPrice!) / p.markPrice!) * 100);

  if (distances.length > 0) {
    const nearest = Math.min(...distances);
    metrics.push({
      key: "liquidation",
      label: "Nearest liquidation",
      value: `${nearest.toFixed(1)}%`,
      detail: nearest <= 10 ? "Close" : nearest <= 25 ? "Watch" : "Healthy",
      tone: nearest <= 10 ? "risk" : nearest <= 25 ? "watch" : "good",
    });
  }

  const agentPct = snapshot.summary.agentManagedPct;
  if (agentPct !== null) {
    metrics.push({
      key: "agent",
      label: "Agent exposure",
      value: `${agentPct.toFixed(1)}%`,
      detail: "Within limit",
      tone: "good",
    });
  }

  return metrics;
}

/* ---------------------------------------------------------------------------
   Elyra Brief

   Deterministic observations over figures already on the page. Not a model
   call, and not a hardcoded sentence: each line below is only emitted when
   the data that makes it true is present, so the panel says less on a thin
   portfolio rather than saying something invented about it.
--------------------------------------------------------------------------- */

const MAX_OBSERVATIONS = 3;

export function brief(snapshot: PortfolioSnapshot): BriefObservation[] {
  const out: BriefObservation[] = [];
  const total = snapshot.summary.totalValueUsd;

  const change = change24h(snapshot);
  if (change !== null && Math.abs(change.pnlPct) >= 0.1) {
    const movers = snapshot.spot
      .filter((h) => h.verified && h.change24hPct !== null && (h.valueUsd ?? 0) >= DUST_USD)
      .sort((a, b) =>
        Math.abs((b.valueUsd ?? 0) * (b.change24hPct ?? 0)) -
        Math.abs((a.valueUsd ?? 0) * (a.change24hPct ?? 0)),
      )
      .slice(0, 2)
      .map((h) => h.symbol);

    const direction = change.pnlPct >= 0 ? "up" : "down";
    const led = movers.length > 0 ? `, led by ${movers.join(" and ")}` : "";
    const caveat =
      change.coveragePct < 95
        ? ` (across ${change.coveragePct.toFixed(0)}% of value that carries a 24h price)`
        : "";
    out.push({
      id: "change",
      text: `Portfolio is ${direction} ${Math.abs(change.pnlPct).toFixed(2)}% over 24h${led}${caveat}.`,
      tone: change.pnlPct >= 0 ? "positive" : "negative",
    });
  }

  if (total !== null && total > 0) {
    const largest = [...snapshot.spot]
      .filter((h) => h.verified && h.valueUsd !== null)
      .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))[0];
    if (largest?.valueUsd != null) {
      const pct = (largest.valueUsd / total) * 100;
      if (pct >= 25) {
        out.push({
          id: "concentration",
          text: `${largest.symbol} is ${pct.toFixed(0)}% of total exposure.`,
          tone: pct >= 60 ? "negative" : "neutral",
        });
      }
    }
  }

  const risky = snapshot.perps
    .filter((p) => p.liquidationPrice !== null && p.markPrice !== null && p.markPrice > 0)
    .map((p) => ({
      market: p.market,
      distance: Math.abs((p.markPrice! - p.liquidationPrice!) / p.markPrice!) * 100,
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (risky !== undefined && risky.distance <= 25) {
    out.push({
      id: "liquidation",
      text: `${risky.market} sits ${risky.distance.toFixed(1)}% from its liquidation price.`,
      tone: "negative",
    });
  }

  /* A failed source outranks an ordinary observation: the user needs to know
     the totals are of what could be read before they read anything into
     them. */
  const failedScopes = [
    ...new Set(snapshot.notes.filter((note) => note.kind === "failed").map((n) => n.scope)),
  ];
  if (failedScopes.length > 0) {
    out.unshift({
      id: "partial",
      text: `Totals exclude ${failedScopes.join(", ")} — ${failedScopes.length === 1 ? "that source" : "those sources"} could not be read.`,
      tone: "negative",
    });
  }

  return out.slice(0, MAX_OBSERVATIONS);
}

/* ---------------------------------------------------------------------------
   Sorting
--------------------------------------------------------------------------- */

export type SortDirection = "asc" | "desc";

/**
 * Sorts by one numeric field, with unknowns pinned to the bottom in both
 * directions.
 *
 * A null is not a small number. Sorting "highest value first" must not put
 * the holdings nobody could price at the top of the list just because
 * `null < 1` happens to be true.
 */
export function byNumber<T>(
  rows: T[],
  pick: (row: T) => number | null,
  direction: SortDirection,
): T[] {
  return [...rows].sort((a, b) => {
    const left = pick(a);
    const right = pick(b);
    if (left === null && right === null) return 0;
    if (left === null) return 1;
    if (right === null) return -1;
    return direction === "desc" ? right - left : left - right;
  });
}

/** Total USD across holdings that carry a value. Null when none do. */
export function sumValued(holdings: SpotHolding[]): number | null {
  const priced = holdings.filter((h) => h.valueUsd !== null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
}
