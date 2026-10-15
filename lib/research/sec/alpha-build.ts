import type { Form144, Form4, Schedule13 } from "@/lib/research/sec/parse";
import { filerName, holderType, personName, roleOf } from "@/lib/research/sec/parse";

/* ---------------------------------------------------------------------------
   What is worth a second look in today's filings.

   EDGAR files a few thousand documents a day, nearly all routine: grants,
   tax withholding, scheduled sales, amendments. This picks out the ones
   people who read filings for a living look for, and says why:

   - INSIDER BUYING. An open-market purchase (Form 4, code P) is an insider
     spending their own money on their own company's stock. Sales happen for
     many reasons; purchases rarely do. Several insiders buying the same
     company at once — a cluster — is the stronger version.
   - ACTIVIST STAKES. A Schedule 13D is filed by someone crossing 5% who may
     try to influence the company, and its Item 4 says what they intend.
   - RED FLAGS. 8-K items that tend to precede trouble: financials that can
     no longer be relied on, an auditor change, a bankruptcy, a listing
     notice, an accelerated debt.
   - CATALYSTS. 8-K items that change the story: a material agreement, an
     acquisition, a change of control, results.
   - PLANNED SALES. Form 144: an affiliate's notice of intent to sell, with
     its size against the shares outstanding.
   - IPO PIPELINE. New S-1 registrations.

   Ranked by size, never by a score the filings do not support. Pure: fed
   parsed documents, so every ranking rule is tested.
--------------------------------------------------------------------------- */

export interface DocMeta {
  accession: string;
  cik: string;
  company: string;
  ticker: string | null;
  filedAt: string;
  url: string;
}

export interface InsiderMove extends DocMeta {
  kind: "buy" | "sell";
  insider: string;
  role: string;
  shares: number;
  /** Shares times price across the priced rows. Null when no price was reported. */
  value: number | null;
  avgPrice: number | null;
  ownedAfter: number | null;
  /** Holdings change in percent: +24 means the stake grew by a quarter. */
  changePct: number | null;
  /** A buyer with no shares before this purchase. */
  newPosition: boolean;
  /** A seller left with nothing. */
  soldAll: boolean;
  /** Made under a Rule 10b5-1 plan — scheduled in advance, so less telling. */
  planned: boolean;
  tradeDate: string | null;
}

export interface Cluster {
  cik: string;
  company: string;
  ticker: string | null;
  insiders: Array<{ name: string; role: string; value: number | null }>;
  value: number;
  latest: string;
  url: string;
}

export interface Stake extends DocMeta {
  form: string;
  amended: boolean;
  holder: string;
  holderType: string | null;
  /** Other reporting persons in the same filing — a group, or the same position reported by each. */
  others: number;
  percent: number | null;
  shares: number | null;
  purpose: string | null;
}

export interface PlannedSale extends DocMeta {
  seller: string;
  relationship: string | null;
  value: number | null;
  units: number | null;
  pctOutstanding: number | null;
  saleDate: string | null;
  acquiredHow: string | null;
}

/** Leadership changes (8-K item 5.02) are their own kind: as often an appointment as a departure. */
export type EventSeverity = "critical" | "warning" | "catalyst" | "people";

export interface EventFlag extends DocMeta {
  form: string;
  severity: EventSeverity;
  /** The most important item, in words: "Says past financials can no longer be relied on". */
  headline: string;
  items: Array<{ code: string; label: string }>;
}

export interface Ipo extends DocMeta {
  form: string;
}

/* ---- Insider trades ---- */

export function insiderMoves(form: Form4, meta: DocMeta): InsiderMove[] {
  const owner = form.owners[0];
  if (owner === undefined) return [];
  const lead = filerName(owner.name);
  const insider = form.owners.length > 1 ? `${lead} +${form.owners.length - 1}` : lead;
  const moves: InsiderMove[] = [];

  for (const [code, kind] of [["P", "buy"], ["S", "sell"]] as const) {
    const rows = form.transactions.filter((row) => row.code === code && (row.shares ?? 0) > 0);
    if (rows.length === 0) continue;
    const shares = rows.reduce((sum, row) => sum + (row.shares ?? 0), 0);
    const priced = rows.filter((row) => (row.price ?? 0) > 0);
    const value = priced.length === 0 ? null : priced.reduce((sum, row) => sum + (row.shares ?? 0) * (row.price ?? 0), 0);
    const pricedShares = priced.reduce((sum, row) => sum + (row.shares ?? 0), 0);
    const ownedAfter = rows.at(-1)?.ownedAfter ?? null;

    let changePct: number | null = null;
    let newPosition = false;
    let soldAll = false;
    if (ownedAfter !== null) {
      if (kind === "buy") {
        const before = ownedAfter - shares;
        if (before > 0) changePct = (shares / before) * 100;
        else if (before === 0) newPosition = true;
      } else {
        const before = ownedAfter + shares;
        if (before > 0) changePct = -(shares / before) * 100;
        soldAll = ownedAfter === 0;
      }
    }

    moves.push({
      ...meta,
      kind,
      insider,
      role: roleOf(owner),
      shares,
      value,
      avgPrice: value !== null && pricedShares > 0 ? value / pricedShares : null,
      ownedAfter,
      changePct,
      newPosition,
      soldAll,
      planned: form.planned,
      tradeDate: rows.map((row) => row.date).filter((date): date is string => date !== null).sort().at(-1) ?? null,
    });
  }
  return moves;
}

/** Largest first; a trade with no reported price after every priced one. */
export function byValue<T extends { value: number | null; filedAt: string }>(a: T, b: T): number {
  if (a.value === null && b.value === null) return b.filedAt.localeCompare(a.filedAt);
  if (a.value === null) return 1;
  if (b.value === null) return -1;
  return b.value - a.value;
}

/** Two or more different insiders buying the same company in the window. */
export function clusters(buys: readonly InsiderMove[]): Cluster[] {
  const byCompany = new Map<string, InsiderMove[]>();
  for (const buy of buys) byCompany.set(buy.cik, [...(byCompany.get(buy.cik) ?? []), buy]);
  const out: Cluster[] = [];
  for (const moves of byCompany.values()) {
    const names = new Set(moves.map((move) => move.insider));
    if (names.size < 2) continue;
    const latest = [...moves].sort((a, b) => b.filedAt.localeCompare(a.filedAt))[0];
    out.push({
      cik: latest.cik,
      company: latest.company,
      ticker: latest.ticker,
      insiders: moves.map((move) => ({ name: move.insider, role: move.role, value: move.value })),
      value: moves.reduce((sum, move) => sum + (move.value ?? 0), 0),
      latest: latest.filedAt,
      url: latest.url,
    });
  }
  return out.sort((a, b) => b.insiders.length - a.insiders.length || b.value - a.value);
}

/* ---- Stakes and planned sales ---- */

export function stakeFrom(doc: Schedule13, meta: DocMeta): Stake | null {
  const lead = [...doc.holders].sort((a, b) => (b.percent ?? -1) - (a.percent ?? -1))[0];
  if (lead === undefined) return null;
  return {
    ...meta,
    form: doc.form,
    amended: doc.form.endsWith("/A"),
    holder: lead.type === "IN" ? personName(lead.name) : filerName(lead.name),
    holderType: holderType(lead.type),
    others: doc.holders.length - 1,
    percent: lead.percent,
    shares: lead.shares,
    purpose: doc.purpose,
  };
}

/** New stakes first, then the largest. */
export function byStake(a: Stake, b: Stake): number {
  if (a.amended !== b.amended) return a.amended ? 1 : -1;
  return (b.percent ?? -1) - (a.percent ?? -1);
}

export function plannedSaleFrom(doc: Form144, meta: DocMeta): PlannedSale | null {
  if (doc.seller === null) return null;
  return {
    ...meta,
    seller: filerName(doc.seller),
    relationship: doc.relationship,
    value: doc.value,
    units: doc.units,
    pctOutstanding: doc.units !== null && doc.outstanding ? (doc.units / doc.outstanding) * 100 : null,
    saleDate: doc.saleDate,
    acquiredHow: doc.acquiredHow,
  };
}

/* ---- 8-K events ---- */

const EVENT_RULES: Array<{ code: string; severity: EventSeverity; headline: string }> = [
  { code: "4.02", severity: "critical", headline: "Says past financial statements can no longer be relied on" },
  { code: "1.03", severity: "critical", headline: "Bankruptcy or receivership" },
  { code: "2.04", severity: "critical", headline: "A debt obligation was accelerated" },
  { code: "3.01", severity: "warning", headline: "Notice of a failed listing rule or delisting" },
  { code: "4.01", severity: "warning", headline: "Changed its auditor" },
  { code: "1.05", severity: "warning", headline: "Disclosed a material cybersecurity incident" },
  { code: "2.06", severity: "warning", headline: "Took a material impairment" },
  { code: "2.05", severity: "warning", headline: "Announced restructuring or exit costs" },
  { code: "1.02", severity: "warning", headline: "A material agreement was terminated" },
  { code: "3.02", severity: "warning", headline: "Sold unregistered shares" },
  { code: "5.02", severity: "people", headline: "A director or officer is leaving or joining" },
  { code: "5.01", severity: "catalyst", headline: "Change in control of the company" },
  { code: "2.01", severity: "catalyst", headline: "Completed an acquisition or a sale of assets" },
  { code: "1.01", severity: "catalyst", headline: "Signed a material agreement" },
  { code: "2.03", severity: "catalyst", headline: "Took on new financing" },
  { code: "2.02", severity: "catalyst", headline: "Reported results" },
];

/** The most important item an 8-K carries, or null when it is routine (7.01, 8.01 alone). */
export function eventFlag(
  filing: { form: string; items: Array<{ code: string; label: string }> },
  meta: DocMeta,
): EventFlag | null {
  const codes = new Set(filing.items.map((item) => item.code));
  const rule = EVENT_RULES.find((candidate) => codes.has(candidate.code));
  if (rule === undefined) return null;
  return { ...meta, form: filing.form, severity: rule.severity, headline: rule.headline, items: filing.items };
}

const SEVERITY_RANK: Record<EventSeverity, number> = { critical: 0, warning: 1, catalyst: 2, people: 3 };

export function byEvent(a: EventFlag, b: EventFlag): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.filedAt.localeCompare(a.filedAt);
}

/* ---- The board ---- */

export interface AlphaSummary {
  insiderBuys: number;
  buyValue: number;
  clusters: number;
  insiderSells: number;
  sellValue: number;
  activists: number;
  newActivists: number;
  redFlags: number;
  catalysts: number;
  leadership: number;
  plannedSales: number;
  plannedValue: number;
  ipos: number;
}

export interface AlphaBoard {
  summary: AlphaSummary;
  buys: InsiderMove[];
  sells: InsiderMove[];
  clusters: Cluster[];
  activists: Stake[];
  redFlags: EventFlag[];
  catalysts: EventFlag[];
  leadership: EventFlag[];
  plannedSales: PlannedSale[];
  ipos: Ipo[];
}

export function buildBoard(input: {
  moves: InsiderMove[];
  stakes: Stake[];
  sales: PlannedSale[];
  events: EventFlag[];
  ipos: Ipo[];
}): AlphaBoard {
  const buys = input.moves.filter((move) => move.kind === "buy").sort(byValue);
  const sells = input.moves.filter((move) => move.kind === "sell").sort(byValue);
  const activists = input.stakes.filter((stake) => /13D/.test(stake.form)).sort(byStake);
  const redFlags = input.events.filter((event) => event.severity === "critical" || event.severity === "warning").sort(byEvent);
  const catalysts = input.events.filter((event) => event.severity === "catalyst").sort(byEvent);
  const leadership = input.events.filter((event) => event.severity === "people").sort(byEvent);
  const plannedSales = [...input.sales].sort(byValue);
  const ipos = [...input.ipos].sort((a, b) => b.filedAt.localeCompare(a.filedAt));
  const sum = (list: Array<{ value: number | null }>) => list.reduce((total, entry) => total + (entry.value ?? 0), 0);
  const groups = clusters(buys);

  return {
    summary: {
      insiderBuys: buys.length,
      buyValue: sum(buys),
      clusters: groups.length,
      insiderSells: sells.length,
      sellValue: sum(sells),
      activists: activists.length,
      newActivists: activists.filter((stake) => !stake.amended).length,
      redFlags: redFlags.length,
      catalysts: catalysts.length,
      leadership: leadership.length,
      plannedSales: plannedSales.length,
      plannedValue: sum(plannedSales),
      ipos: ipos.length,
    },
    buys,
    sells,
    clusters: groups,
    activists,
    redFlags,
    catalysts,
    leadership,
    plannedSales,
    ipos,
  };
}

/** How big a 5%+ stake is, in words. */
export function stakeSize(percent: number | null): "Majority" | "Large" | "Activist" | null {
  if (percent === null) return null;
  if (percent >= 50) return "Majority";
  if (percent >= 20) return "Large";
  return "Activist";
}
