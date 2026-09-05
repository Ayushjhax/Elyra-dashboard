/* ---------------------------------------------------------------------------
   Smart-money findings, as the dashboard sees them.

   Mirrors the engine's `SmartMoneyFinding`. Declared again rather than
   imported because the two live in separate workspaces — the same reason
   `lib/signals/types.ts` mirrors the signal DTO — and validated at the
   boundary rather than trusted.

   The important thing this type does NOT have is levels. A finding is
   derived from filings, and filings contain no prices, so there is no entry,
   target or stop and no place to put one. A card built from this type cannot
   accidentally imply a trade setup, because the data to draw one is absent.
--------------------------------------------------------------------------- */

export type FindingKind =
  | "institutional_flow"
  | "earnings_quality"
  | "business_performance"
  | "disclosure_risk";

export interface FindingEdge {
  family: "fundamental" | "flow" | "technical" | "prediction" | "macro";
  key: string;
  label: string;
  score: number;
  confidence: number;
  halfLifeHours: number;
  observedAt: string;
  value: number | string | null;
  source: {
    provider: string;
    endpoint: string;
    fetchedAt: string;
    /** When the datum first became publicly knowable. */
    availableAt: string;
  };
}

export interface FilingRef {
  accession: string;
  form: string;
  filed: string;
  availableAt: string;
  availableAtExact: boolean;
  url: string;
}

export interface SmartMoneyFinding {
  id: string;
  ticker: string;
  cik: string;
  company: string;
  logo: string | null;
  kind: FindingKind;
  direction: "bullish" | "bearish";
  score: number;
  confidence: number;
  headline: string;
  edges: FindingEdge[];
  filings: FilingRef[];
  observedAt: string;
  computedAt: string;
  disclaimer: string;
}

const KINDS: readonly FindingKind[] = [
  "institutional_flow",
  "earnings_quality",
  "business_performance",
  "disclosure_risk",
];

export const KIND_LABEL: Record<FindingKind, string> = {
  institutional_flow: "Institutional flow",
  earnings_quality: "Earnings quality",
  business_performance: "Business performance",
  disclosure_risk: "Disclosure risk",
};

/**
 * Reject a row that is missing anything a card must not render without.
 *
 * Narrow on purpose. This is not a schema validator — it guards the fields
 * whose absence would produce a plausible but dishonest card: a finding with
 * no disclaimer, or one with no filings behind it, which would be an
 * assertion about a company with nothing supporting it.
 */
export function assertFinding(value: unknown): SmartMoneyFinding {
  const row = value as Partial<SmartMoneyFinding> | null;
  if (row === null || typeof row !== "object") {
    throw new Error("finding is not an object");
  }
  if (typeof row.id !== "string" || row.id === "") {
    throw new Error("finding has no id");
  }
  if (typeof row.ticker !== "string" || row.ticker === "") {
    throw new Error(`finding ${row.id} has no ticker`);
  }
  if (typeof row.disclaimer !== "string" || row.disclaimer === "") {
    throw new Error(`finding ${row.id} arrived without a disclaimer`);
  }
  if (!Array.isArray(row.edges) || row.edges.length === 0) {
    throw new Error(`finding ${row.id} has no evidence`);
  }
  if (!Array.isArray(row.filings) || row.filings.length === 0) {
    /* A finding with no filing behind it is an assertion about a company
       with nothing supporting it. */
    throw new Error(`finding ${row.id} cites no filings`);
  }
  if (!KINDS.includes(row.kind as FindingKind)) {
    throw new Error(`finding ${row.id} has unknown kind ${String(row.kind)}`);
  }
  return row as SmartMoneyFinding;
}

/** Postgres row (snake_case) to the client shape. */
export function fromRow(row: Record<string, unknown>): unknown {
  return {
    id: row.id,
    ticker: row.ticker,
    cik: row.cik,
    company: row.company,
    logo: row.logo ?? null,
    kind: row.kind,
    direction: row.direction,
    score: Number(row.score),
    confidence: Number(row.confidence),
    headline: row.headline,
    edges: row.edges,
    filings: row.filings,
    observedAt: row.observed_at,
    computedAt: row.computed_at,
    disclaimer: row.disclaimer,
  };
}
