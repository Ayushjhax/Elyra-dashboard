import "server-only";

import { resolveEntity } from "@/lib/research/sec/entities";
import { companySubmissions } from "@/lib/research/sec/filings";
import { secConfigured } from "@/lib/research/sec/client";

/* ---------------------------------------------------------------------------
   Live filings, straight from SEC EDGAR.

   The smart-money findings are rows a scheduled scan writes to the database,
   so without the database the Filings view had nothing. EDGAR itself needs no
   database: this reads the latest filings of the public companies with the
   most crypto exposure — and of the selected market, when it is a listed
   company — and returns them as they were filed, newest first.

   These are documents, not findings. No score, no direction: a Form 4 says an
   insider traded, a 13G says someone crossed 5%, an 8-K names its items, and
   the row links to the filing itself. The findings scan is the layer that
   reads them; this is what it reads.
--------------------------------------------------------------------------- */

/** Listed companies whose filings move with crypto: an exchange, a treasury
    company, a broker and the two largest listed miners. */
export const CRYPTO_FILERS = ["COIN", "MSTR", "HOOD", "MARA", "RIOT"] as const;

/** The forms that say who holds what, who traded, and what happened. */
const FORMS: Record<string, string> = {
  "4": "Insider transaction",
  "144": "Proposed insider sale",
  "SC 13D": "Activist 5%+ stake",
  "SC 13D/A": "Activist stake, amended",
  "SC 13G": "Passive 5%+ stake",
  "SC 13G/A": "Passive stake, amended",
  "13F-HR": "Institutional holdings",
  "8-K": "Material event",
  "10-Q": "Quarterly report",
  "10-K": "Annual report",
};

/** 8-K items, by the number the SEC assigns them. */
const ITEMS: Record<string, string> = {
  "1.01": "material agreement",
  "1.02": "agreement terminated",
  "2.01": "acquisition or disposal",
  "2.02": "results of operations",
  "2.03": "new financial obligation",
  "3.02": "unregistered equity sale",
  "5.02": "officer or director change",
  "5.05": "code of ethics change",
  "5.07": "shareholder vote",
  "7.01": "Regulation FD disclosure",
  "8.01": "other events",
};

const LIMIT = 30;

export interface FeedFiling {
  ticker: string;
  company: string;
  form: string;
  /** What the form is, in words. */
  label: string;
  /** For an 8-K, what it reports. Empty otherwise. */
  items: string[];
  filedAt: string;
  url: string;
}

export interface FilingsFeed {
  filings: FeedFiling[];
  companies: string[];
  /** Companies that could not be read, with the reason. */
  errors: string[];
  configured: boolean;
}

async function filingsFor(ticker: string): Promise<{ filings: FeedFiling[]; error: string | null }> {
  const resolved = await resolveEntity(ticker);
  if (!resolved.ok || resolved.data === undefined) {
    return { filings: [], error: `${ticker}: ${resolved.error?.message ?? "not found at the SEC"}` };
  }
  const { entity } = resolved.data;
  const submissions = await companySubmissions(entity.cik);
  if (!submissions.ok || submissions.data === undefined) {
    return { filings: [], error: `${ticker}: ${submissions.error?.message ?? "filings unavailable"}` };
  }

  const filings = submissions.data.filings
    .filter((filing) => filing.form in FORMS)
    .slice(0, LIMIT)
    .map((filing) => ({
      ticker: entity.ticker,
      company: submissions.data?.name || entity.companyName,
      form: filing.form,
      label: FORMS[filing.form],
      items:
        filing.formKind === "8-K"
          ? filing.items.filter((item) => item !== "9.01").map((item) => ITEMS[item] ?? `item ${item}`)
          : [],
      filedAt: filing.filedAt,
      url: filing.documentUrl ?? filing.indexUrl,
    }));
  return { filings, error: null };
}

/**
 * The latest filings across the crypto-exposed filers, plus `extra` when it
 * names a listed company. Never throws: a company that cannot be read is
 * reported in `errors` and the rest still arrive.
 */
export async function recentFilings(extra: string | null): Promise<FilingsFeed> {
  if (!secConfigured()) {
    return {
      filings: [],
      companies: [],
      errors: ["SEC_USER_AGENT is not set, so EDGAR cannot be read."],
      configured: false,
    };
  }

  const tickers = [...new Set([...(extra ? [extra] : []), ...CRYPTO_FILERS])];
  const results = await Promise.all(tickers.map(filingsFor));

  const filings = results
    .flatMap((result) => result.filings)
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt))
    .slice(0, LIMIT);

  return {
    filings,
    companies: tickers.filter((_, index) => results[index].error === null),
    /* The extra ticker not being a listed company is expected — SOL, BTC —
       and not an error worth showing. */
    errors: results
      .map((result, index) => (tickers[index] === extra ? null : result.error))
      .filter((error): error is string => error !== null),
    configured: true,
  };
}
