import "server-only";

import { fail, ok, type ToolResult } from "@/lib/providers/types";
import {
  bareAccession,
  padCik,
  SEC_TTL,
  secJson,
  secText,
} from "@/lib/research/sec/client";

/* ---------------------------------------------------------------------------
   Finding the filings a question is actually about.

   ── The period problem ─────────────────────────────────────────────────

   "The latest earnings" is not "the newest document". A 10-Q filed in August
   reports a quarter that ended in July, an 8-K announcing those results was
   filed the same week, and an amendment filed in October may restate the
   whole thing. Picking by filing date alone answers a different question from
   the one asked.

   So filings carry BOTH dates — `filedAt` and `periodEnd` — and selection is
   explicit about which one it is ordering by.

   ── Amendments are not duplicates ──────────────────────────────────────

   A 10-K/A supersedes part of a 10-K without replacing it. Treating the two
   as the same form makes the newest one win and quietly drops the original;
   treating the amendment as unrelated reports superseded figures as current.
   Both are returned, related, and labelled.
--------------------------------------------------------------------------- */

export type SecFormKind = "10-K" | "10-Q" | "8-K";

export interface SecFiling {
  accession: string;
  /** "10-Q", or "10-Q/A" for an amendment. */
  form: string;
  /** The base form, with any amendment suffix stripped. */
  formKind: string;
  isAmendment: boolean;
  filedAt: string;
  /** The period the filing REPORTS ON. Often months before `filedAt`. */
  periodEnd: string | null;
  /** 8-K item numbers, e.g. ["2.02", "9.01"]. Empty for other forms. */
  items: string[];
  primaryDocument: string | null;
  /** Absolute URL of the filing's own index page. */
  indexUrl: string;
  /** Absolute URL of the primary document, when there is one. */
  documentUrl: string | null;
  cik: string;
}

interface RecentFilings {
  accessionNumber?: string[];
  filingDate?: string[];
  reportDate?: string[];
  form?: string[];
  items?: string[];
  primaryDocument?: string[];
}

interface Submissions {
  cik?: string;
  name?: string;
  fiscalYearEnd?: string;
  exchanges?: string[];
  filings?: { recent?: RecentFilings };
}

export interface CompanySubmissions {
  cik: string;
  name: string;
  /** "0131" for a January fiscal year end. */
  fiscalYearEnd: string | null;
  exchanges: string[];
  filings: SecFiling[];
}

function archiveBase(cik: string, accession: string): string {
  /* The archive path uses the CIK with leading zeros stripped and the
     accession with its dashes removed. Neither is the form used elsewhere. */
  return `https://www.sec.gov/Archives/edgar/data/${Number.parseInt(cik, 10)}/${bareAccession(accession)}`;
}

/** Every filing the SEC lists as recent for a registrant. */
export async function companySubmissions(
  cik: string,
): Promise<ToolResult<CompanySubmissions>> {
  const padded = padCik(cik);

  const result = await secJson<Submissions>(
    `/submissions/CIK${padded}.json`,
    SEC_TTL.submissions,
  );

  if (!result.ok || result.data === undefined) {
    return fail<CompanySubmissions>(
      "sec",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "SEC submissions could not be read.",
    );
  }

  const recent = result.data.filings?.recent;
  if (recent?.accessionNumber === undefined || recent.form === undefined) {
    return fail<CompanySubmissions>(
      "sec",
      "UPSTREAM_UNAVAILABLE",
      "The SEC returned submissions in an unexpected shape.",
    );
  }

  const filings: SecFiling[] = [];
  for (let index = 0; index < recent.accessionNumber.length; index += 1) {
    const accession = recent.accessionNumber[index];
    const form = recent.form[index];
    if (accession === undefined || form === undefined) continue;

    const primary = recent.primaryDocument?.[index] ?? null;
    const base = archiveBase(padded, accession);
    const period = recent.reportDate?.[index] ?? null;

    filings.push({
      accession,
      form,
      /* "/A" is the amendment marker. Stripped so a caller asking for 10-Q
         can find 10-Q/A without knowing the convention. */
      formKind: form.replace(/\/A$/, ""),
      isAmendment: form.endsWith("/A"),
      filedAt: recent.filingDate?.[index] ?? "",
      periodEnd: period !== null && period.length > 0 ? period : null,
      items:
        recent.items?.[index] === undefined || recent.items[index].length === 0
          ? []
          : recent.items[index].split(",").map((item) => item.trim()),
      primaryDocument: primary,
      indexUrl: `${base}/${accession}-index.htm`,
      documentUrl: primary === null ? null : `${base}/${primary}`,
      cik: padded,
    });
  }

  return ok(
    {
      cik: padded,
      name: result.data.name ?? "",
      fiscalYearEnd: result.data.fiscalYearEnd ?? null,
      exchanges: result.data.exchanges ?? [],
      filings,
    },
    "sec",
    { asOf: result.asOf },
  );
}

/* ---------------------------------------------------------------------------
   Selection
--------------------------------------------------------------------------- */

export interface FilingQuery {
  /** Include amendments. Default true — a restatement is usually the answer. */
  includeAmendments?: boolean;
  /** Only 8-Ks carrying one of these item numbers. */
  items?: string[];
  limit?: number;
}

/** Filings of a kind, newest reported period first. */
export function selectFilings(
  filings: SecFiling[],
  kind: string,
  query: FilingQuery = {},
): SecFiling[] {
  const includeAmendments = query.includeAmendments ?? true;

  const matched = filings.filter((filing) => {
    if (filing.formKind !== kind) return false;
    if (!includeAmendments && filing.isAmendment) return false;
    if (query.items !== undefined && query.items.length > 0) {
      if (!query.items.some((item) => filing.items.includes(item))) return false;
    }
    return true;
  });

  /* Ordered by the period REPORTED ON, falling back to the filing date when a
     form carries no period. Ordering by filing date alone would rank an
     amendment to an old quarter above the current one. */
  return [...matched]
    .sort((a, b) => {
      const left = a.periodEnd ?? a.filedAt;
      const right = b.periodEnd ?? b.filedAt;
      if (left !== right) return right.localeCompare(left);
      /* Same period: the amendment is the later word on it. */
      return b.filedAt.localeCompare(a.filedAt);
    })
    .slice(0, query.limit ?? 50);
}

export function latestFiling(
  filings: SecFiling[],
  kind: string,
  query: FilingQuery = {},
): SecFiling | null {
  return selectFilings(filings, kind, { ...query, limit: 1 })[0] ?? null;
}

/* ---------------------------------------------------------------------------
   Earnings
--------------------------------------------------------------------------- */

/**
 * Item 2.02 — "Results of Operations and Financial Condition".
 *
 * This is the item number a company uses when it announces results, and it is
 * how an earnings 8-K is identified. Searching filing text for the word
 * "earnings" would also match a dozen unrelated 8-Ks; the item number is a
 * structured field the registrant itself set.
 */
export const EARNINGS_ITEM = "2.02";

/** Item 9.01 — "Financial Statements and Exhibits". Usually accompanies 2.02. */
export const EXHIBIT_ITEM = "9.01";

export interface EarningsFilings {
  /** The periodic report covering the quarter or year. */
  periodicReport: SecFiling | null;
  /** The 8-K announcing the results, when one exists. */
  announcement: SecFiling | null;
  /** The period both are understood to describe. */
  periodEnd: string | null;
  /** Everything read, for the evidence appendix. */
  considered: SecFiling[];
}

/**
 * The filings that together constitute "the latest earnings".
 *
 * Not one document. A quarter's results live in a 10-Q, were announced in an
 * 8-K a few days earlier, and are tagged in XBRL against both. A report built
 * from any one of them alone is missing either the numbers, the commentary,
 * or the announcement.
 *
 * The periodic report leads because it is the audited-or-reviewed filing; the
 * 8-K is matched to it BY PERIOD rather than by recency, so an announcement
 * for a quarter whose 10-Q has not landed yet is not paired with the previous
 * quarter's report.
 */
export function findEarningsFilings(filings: SecFiling[]): EarningsFilings {
  const quarterly = latestFiling(filings, "10-Q");
  const annual = latestFiling(filings, "10-K");

  /* Whichever covers the more recent period. A company that just filed its
     10-K has no newer 10-Q, and vice versa. */
  const periodic =
    quarterly === null
      ? annual
      : annual === null
        ? quarterly
        : (quarterly.periodEnd ?? quarterly.filedAt) >= (annual.periodEnd ?? annual.filedAt)
          ? quarterly
          : annual;

  const announcements = selectFilings(filings, "8-K", { items: [EARNINGS_ITEM] });

  let announcement: SecFiling | null = null;

  if (periodic !== null && periodic.periodEnd !== null) {
    /* An earnings 8-K is filed within a few weeks after the period closes and
       carries the period itself in `reportDate` only sometimes — so match on
       filing date falling in a window after the period end. */
    const periodEnd = Date.parse(periodic.periodEnd);
    announcement =
      announcements.find((filing) => {
        const filed = Date.parse(filing.filedAt);
        if (!Number.isFinite(filed) || !Number.isFinite(periodEnd)) return false;
        const days = (filed - periodEnd) / 86_400_000;
        return days >= 0 && days <= 120;
      }) ?? null;
  } else {
    announcement = announcements[0] ?? null;
  }

  return {
    periodicReport: periodic,
    announcement,
    periodEnd: periodic?.periodEnd ?? announcement?.periodEnd ?? null,
    considered: [
      ...(periodic === null ? [] : [periodic]),
      ...(announcement === null ? [] : [announcement]),
    ],
  };
}

/* ---------------------------------------------------------------------------
   Exhibits
--------------------------------------------------------------------------- */

export interface SecExhibit {
  /** "EX-99.1", "EX-99.2" — as the filing itself labels it. */
  type: string;
  description: string;
  fileName: string;
  url: string;
}

/**
 * The documents attached to a filing.
 *
 * Read from the filing's INDEX PAGE, not from `index.json`. That JSON exists
 * and looks like the obvious source, but its `type` field is an icon hint —
 * every document comes back as `text.gif` or `image2.gif`. Scoring exhibits
 * on it finds nothing, silently, while appearing to work.
 *
 * The index page carries the registrant's own document types: `EX-99.1`,
 * `EX-99.2`, `GRAPHIC`. Verified against a live NVIDIA earnings 8-K, where
 * the press release is EX-99.1 and a CFO commentary is EX-99.2.
 */
export async function filingExhibits(
  filing: SecFiling,
): Promise<ToolResult<SecExhibit[]>> {
  const cikPath = Number.parseInt(filing.cik, 10);
  const base = archiveBase(filing.cik, filing.accession);

  const result = await secText(
    `/Archives/edgar/data/${cikPath}/${bareAccession(filing.accession)}/${filing.accession}-index.html`,
  );

  if (!result.ok || result.data === undefined) {
    return fail<SecExhibit[]>(
      "sec",
      result.error?.code ?? "UPSTREAM_UNAVAILABLE",
      result.error?.message ?? "The filing index could not be read.",
    );
  }

  const exhibits: SecExhibit[] = [];

  for (const row of result.data.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map((cell) =>
      cell
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .trim(),
    );

    /* Seq | Description | Document | Type | Size */
    if (cells.length < 4 || !/^\d+$/.test(cells[0])) continue;

    const description = cells[1];
    const type = cells[3];

    /* The document cell carries the filename plus padding. */
    const fileName = cells[2].split(/\s+/)[0];
    if (fileName.length === 0) continue;

    /* XBRL sidecars and images are attachments, not exhibits anyone reads. */
    if (/^EX-101/i.test(type) || type === "GRAPHIC" || type === "XML") continue;

    exhibits.push({
      type,
      description,
      fileName,
      url: `${base}/${fileName}`,
    });
  }

  return ok(exhibits, "sec", { asOf: result.asOf });
}

/**
 * The exhibit most likely to be the earnings press release.
 *
 * Ranked rather than assumed: an exhibit typed EX-99.1 is the conventional
 * answer, but the type field is what decides, and the caller gets null rather
 * than a guess when nothing in the filing looks like a release.
 */
export function earningsExhibit(exhibits: SecExhibit[]): SecExhibit | null {
  const scored = exhibits
    .map((exhibit) => {
      const type = exhibit.type.toUpperCase();
      let score = 0;
      if (/^EX-99/.test(type)) score += 10;
      if (type === "EX-99.1") score += 5;
      if (/PRESS|RELEASE|EARNINGS|RESULTS/i.test(exhibit.description)) score += 8;
      return { exhibit, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.exhibit ?? null;
}
