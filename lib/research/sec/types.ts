import type { AlphaBoard, InsiderMove } from "@/lib/research/sec/alpha-build";

/* ---------------------------------------------------------------------------
   SEC EDGAR, as the /api/sec routes return it — company search, a company's
   record, its insiders, the live filing feed and the alpha board — apart
   from the modules that read EDGAR, which are server-only, so the website
   and the Android app read one definition of each.
--------------------------------------------------------------------------- */

export type MetricId =
  | "revenue"
  | "grossProfit"
  | "operatingIncome"
  | "netIncome"
  | "dilutedEps"
  | "cash"
  | "totalAssets"
  | "totalDebt"
  | "operatingCashFlow"
  | "capex";

export interface SecEntity {
  /** Ten digits, zero-padded, as the JSON APIs want it. */
  cik: string;
  ticker: string;
  companyName: string;
}

export interface EdgarFiling {
  accession: string;
  form: string;
  label: string;
  company: string;
  cik: string;
  ticker: string | null;
  /** Who filed it about the company: the insider on a Form 4, the holder on a 13D/G. */
  filer: string | null;
  /** 8-K items as "2.02 Results of operations". */
  items: Array<{ code: string; label: string }>;
  filedAt: string;
  url: string;
}

export interface LatestFilings {
  filings: EdgarFiling[];
  /** Forms that could not be read, by name. */
  errors: string[];
  asOf: string;
}

export interface Fundamental {
  id: MetricId | "shares";
  label: string;
  value: number;
  unit: "USD" | "USD/shares" | "shares";
  /** "Q2 FY2026", or "Period ended 2026-06-30". */
  period: string;
  /** Change against the same period a year earlier, percent. Null without one. */
  yoyPct: number | null;
}

export interface CompanyFiling {
  accession: string;
  form: string;
  label: string;
  items: Array<{ code: string; label: string }>;
  filedAt: string;
  periodEnd: string | null;
  url: string;
}

export interface CompanyProfile {
  cik: string;
  name: string;
  ticker: string;
  tickers: string[];
  exchanges: string[];
  industry: string | null;
  category: string | null;
  state: string | null;
  fiscalYearEnd: string | null;
  fundamentals: Fundamental[];
  /** Why there are none, when there are none. */
  fundamentalsNote: string | null;
  filings: CompanyFiling[];
  edgarUrl: string;
}

export interface AlphaResponse extends AlphaBoard {
  /** Filings read so far, and still to read, of the latest window. */
  read: number;
  pending: number;
  /** The oldest insider filing in the window, so the board can say what "latest" means. */
  since: string | null;
  errors: string[];
  asOf: string;
  configured: boolean;
}

export interface CompanyInsiders {
  ticker: string | null;
  company: string | null;
  moves: InsiderMove[];
  /** Form 4s still to read; the client asks again. */
  pending: number;
  /** How many of the company's recent Form 4s these come from. */
  filings: number;
  since: string | null;
  summary: { buys: number; buyValue: number; sells: number; sellValue: number; buyers: number; sellers: number };
}

export interface CompanyResponse {
  company: CompanyProfile | null;
  error: string | null;
}

export interface LatestResponse extends LatestFilings {
  configured: boolean;
}

/** /api/sec/insiders. */
export interface InsidersResponse {
  insiders: CompanyInsiders | null;
  error: string | null;
}

/** /api/sec/search. */
export interface SecSearchResponse {
  results: SecEntity[];
}
