import "server-only";

import { SEC_TTL, padCik, secJson } from "@/lib/research/sec/client";
import { resolveEntity } from "@/lib/research/sec/entities";
import { companySubmissions } from "@/lib/research/sec/filings";
import { ITEM_LABELS, formLabel } from "@/lib/research/sec/forms";
import {
  companyFacts,
  fiscalLabelFor,
  resolveMetric,
  resolvePriorYear,
  type MetricId,
} from "@/lib/research/sec/xbrl";
import type { CompanyFiling, CompanyProfile, Fundamental } from "@/lib/research/sec/types";

export type { CompanyFiling, CompanyProfile, Fundamental };

/* ---------------------------------------------------------------------------
   One company, as EDGAR describes it.

   Who it is (the SEC's own record: industry, exchange, filer category, state
   and fiscal year), what it reported (the latest quarter's figures from its
   XBRL facts, each against the same quarter a year earlier) and what it has
   filed (its recent filings, labelled).

   Every figure carries the period it covers, and a figure that could not be
   resolved is absent rather than estimated — `resolveMetric` returns nothing
   before it would return the wrong period.
--------------------------------------------------------------------------- */

interface SubmissionsExtra {
  tickers?: string[];
  exchanges?: string[];
  sicDescription?: string;
  category?: string;
  stateOfIncorporation?: string;
}

const FLOWS: MetricId[] = ["revenue", "netIncome", "dilutedEps", "operatingIncome"];
const BALANCES: MetricId[] = ["cash", "totalAssets", "totalDebt"];

/** Shares outstanding, from the cover page every 10-K and 10-Q carries. */
function sharesOutstanding(raw: unknown): Fundamental | null {
  const facts = (raw as { facts?: Record<string, Record<string, { units?: Record<string, Array<{ val?: number; end?: string; filed?: string }>> }>> })
    .facts;
  const rows = facts?.dei?.EntityCommonStockSharesOutstanding?.units?.shares ?? [];
  const latest = [...rows]
    .filter((row) => typeof row.val === "number" && typeof row.end === "string")
    .sort((a, b) => (b.end ?? "").localeCompare(a.end ?? "") || (b.filed ?? "").localeCompare(a.filed ?? ""))[0];
  if (!latest) return null;
  return {
    id: "shares",
    label: "Shares outstanding",
    value: latest.val as number,
    unit: "shares",
    period: `As of ${latest.end}`,
    yoyPct: null,
  };
}

async function fundamentalsFor(cik: string): Promise<{ list: Fundamental[]; note: string | null }> {
  const facts = await companyFacts(cik);
  if (!facts.ok || facts.data === undefined) {
    return {
      list: [],
      note:
        facts.error?.code === "NOT_FOUND"
          ? "This company files no XBRL financial data — common for funds, trusts and foreign issuers."
          : "Financial data could not be read from EDGAR right now.",
    };
  }
  const raw = facts.data.raw;
  const list: Fundamental[] = [];

  for (const metric of [...FLOWS, ...BALANCES]) {
    const resolved = resolveMetric(raw, metric, { period: FLOWS.includes(metric) ? "quarter" : "any" });
    if (resolved === null) continue;
    const prior = FLOWS.includes(metric) ? resolvePriorYear(raw, metric, resolved.fact) : null;
    const yoy =
      prior !== null && prior.fact.value !== 0
        ? ((resolved.fact.value - prior.fact.value) / Math.abs(prior.fact.value)) * 100
        : null;
    list.push({
      id: metric,
      label: resolved.label,
      value: resolved.fact.value,
      unit: metric === "dilutedEps" ? "USD/shares" : "USD",
      period: FLOWS.includes(metric) ? fiscalLabelFor(raw, metric, resolved.fact) : `As of ${resolved.fact.end}`,
      yoyPct: yoy !== null && Number.isFinite(yoy) ? yoy : null,
    });
  }

  const shares = sharesOutstanding(raw);
  if (shares !== null) list.push(shares);

  return {
    list,
    note: list.length === 0 ? "EDGAR has no recent quarterly figures for this company." : null,
  };
}

/** A company by ticker, name or CIK. Null when EDGAR has no such registrant. */
export async function companyProfile(query: string): Promise<CompanyProfile | null> {
  const resolved = await resolveEntity(query);
  if (!resolved.ok || resolved.data === undefined) return null;
  const { entity } = resolved.data;

  const [submissions, extra, fundamentals] = await Promise.all([
    companySubmissions(entity.cik),
    secJson<SubmissionsExtra>(`/submissions/CIK${padCik(entity.cik)}.json`, SEC_TTL.submissions),
    fundamentalsFor(entity.cik),
  ]);

  const filings: CompanyFiling[] = (submissions.data?.filings ?? []).slice(0, 80).map((filing) => ({
    accession: filing.accession,
    form: filing.form,
    label: formLabel(filing.form),
    items:
      filing.formKind === "8-K"
        ? filing.items
            .filter((code) => code !== "9.01")
            .map((code) => ({ code, label: ITEM_LABELS[code] ?? `Item ${code}` }))
        : [],
    filedAt: filing.filedAt,
    periodEnd: filing.periodEnd,
    url: filing.documentUrl ?? filing.indexUrl,
  }));

  return {
    cik: entity.cik,
    name: submissions.data?.name || entity.companyName,
    ticker: entity.ticker,
    tickers: extra.data?.tickers ?? [entity.ticker],
    exchanges: extra.data?.exchanges ?? submissions.data?.exchanges ?? [],
    industry: extra.data?.sicDescription || null,
    category: extra.data?.category || null,
    state: extra.data?.stateOfIncorporation || null,
    fiscalYearEnd: submissions.data?.fiscalYearEnd ?? null,
    fundamentals: fundamentals.list,
    fundamentalsNote: fundamentals.note,
    filings,
    edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${entity.cik}&owner=include&count=40`,
  };
}
