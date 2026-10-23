/* ---------------------------------------------------------------------------
   What EDGAR's forms are, in words.

   Client-safe: the Research view filters and labels with these, and the
   server parses with them. A form not listed here is still shown — by its
   own name — because EDGAR files more kinds of document than any table
   will name.

   Beneficial-ownership filings changed name on EDGAR in December 2024:
   "SC 13D" and "SC 13G" became "SCHEDULE 13D" and "SCHEDULE 13G". Both are
   kept, so older filings in a company's history still read correctly.
--------------------------------------------------------------------------- */

export const FORM_LABELS: Record<string, string> = {
  "8-K": "Material event",
  "6-K": "Foreign issuer report",
  "10-K": "Annual report",
  "10-KT": "Transition annual report",
  "10-Q": "Quarterly report",
  "20-F": "Foreign annual report",
  "40-F": "Canadian annual report",
  "4": "Insider transaction",
  "3": "New insider",
  "5": "Annual insider summary",
  "144": "Proposed insider sale",
  "SCHEDULE 13D": "Activist 5%+ stake",
  "SCHEDULE 13G": "Passive 5%+ stake",
  "SC 13D": "Activist 5%+ stake",
  "SC 13G": "Passive 5%+ stake",
  "13F-HR": "Institutional holdings",
  "S-1": "IPO registration",
  "F-1": "Foreign IPO registration",
  "S-3": "Shelf registration",
  "S-4": "Merger registration",
  "424B4": "IPO prospectus",
  "DEF 14A": "Proxy statement",
  "DEFM14A": "Merger proxy",
  "SC TO-T": "Tender offer",
  "SC 14D9": "Tender offer response",
  "25-NSE": "Delisting",
  "15-12G": "Deregistration",
};

/** "SCHEDULE 13D/A" → "Activist 5%+ stake, amended". */
export function formLabel(form: string): string {
  const amended = form.endsWith("/A");
  const base = amended ? form.slice(0, -2) : form;
  const label = FORM_LABELS[base] ?? form;
  return amended ? `${label}, amended` : label;
}

/** 8-K items, by the number the SEC assigns them. */
export const ITEM_LABELS: Record<string, string> = {
  "1.01": "Material agreement",
  "1.02": "Agreement terminated",
  "1.03": "Bankruptcy or receivership",
  "1.05": "Cybersecurity incident",
  "2.01": "Acquisition or disposal",
  "2.02": "Results of operations",
  "2.03": "New financial obligation",
  "2.04": "Obligation accelerated",
  "2.05": "Exit or restructuring costs",
  "2.06": "Material impairment",
  "3.01": "Listing rule notice",
  "3.02": "Unregistered equity sale",
  "3.03": "Shareholder rights modified",
  "4.01": "Auditor changed",
  "4.02": "Prior financials unreliable",
  "5.01": "Change of control",
  "5.02": "Officer or director change",
  "5.03": "Charter or bylaws amended",
  "5.07": "Shareholder vote",
  "7.01": "Regulation FD disclosure",
  "8.01": "Other events",
};

/** Items that carry most of a filing's weight, for highlighting. */
export const MAJOR_ITEMS = new Set(["1.01", "1.03", "1.05", "2.01", "2.02", "2.06", "4.01", "4.02", "5.01", "5.02"]);

export type EdgarCategory = "all" | "events" | "insiders" | "reports" | "ownership" | "offerings" | "sales";

export const CATEGORIES: Array<{ id: EdgarCategory; label: string; forms: string[] }> = [
  { id: "all", label: "All", forms: [] },
  { id: "events", label: "Material events", forms: ["8-K"] },
  { id: "insiders", label: "Insider trades", forms: ["4"] },
  { id: "reports", label: "Earnings reports", forms: ["10-K", "10-Q"] },
  { id: "ownership", label: "5% stakes", forms: ["SCHEDULE 13D", "SCHEDULE 13G"] },
  { id: "offerings", label: "IPOs & offerings", forms: ["S-1"] },
  { id: "sales", label: "Planned sales", forms: ["144"] },
];

/** Whether a form belongs under a category, amendments included. */
export function inCategory(form: string, category: EdgarCategory): boolean {
  if (category === "all") return true;
  const base = form.replace(/\/A$/, "").replace(/^SC 13/, "SCHEDULE 13");
  const entry = CATEGORIES.find((candidate) => candidate.id === category);
  return entry !== undefined && entry.forms.some((wanted) => base === wanted || (wanted === "10-K" && base === "10-KT"));
}

export function isCategory(value: unknown): value is EdgarCategory {
  return typeof value === "string" && CATEGORIES.some((entry) => entry.id === value);
}
