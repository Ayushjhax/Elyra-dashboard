/* ---------------------------------------------------------------------------
   What a research question is asking for.

   Produces a typed TASK SPEC, not a label. "Latest NVDA earnings" and "make
   me an NVIDIA 10-K" differ in more than category: they need different
   filings, different periods, different report templates and different
   capabilities. A classifier that returns only `earnings_report` pushes all
   of that back onto whatever runs next, which is where it gets guessed.

   Deterministic and testable. A model is not asked to classify this, because
   the classification decides which SEC documents get fetched and a wrong
   branch produces a confident report about the wrong thing.

   Pure — no `server-only` — so the whole table below is directly testable.
--------------------------------------------------------------------------- */

export type ResearchIntent =
  | "company_10k_report"
  | "company_10q_report"
  | "earnings_report"
  | "filing_question"
  | "market_recap"
  | "asset_research"
  | "price_monitor"
  | "cross_venue_compare"
  | "signal_request"
  | "yield_discovery"
  | "token_unlocks"
  | "custom_research";

export type ResearchSubject =
  /** An SEC registrant: a ticker, a name, or a CIK. */
  | { kind: "registrant"; query: string }
  /** A crypto asset. */
  | { kind: "crypto"; symbol: string }
  /** No specific subject — "what happened today". */
  | { kind: "none" };

export interface ResearchTask {
  intent: ResearchIntent;
  subject: ResearchSubject;
  /** Venues named in the question, for a cross-venue comparison. */
  venues: string[];
  /** Window in hours, where the question implies one. */
  windowHours: number | null;
  /** Capabilities this task cannot run without. */
  requires: string[];
  /** Capabilities that improve the answer but are not required. */
  optional: string[];
  /** Why this classification. For the run log, never shown to the user. */
  reason: string;
}

/* ---------------------------------------------------------------------------
   Vocabulary
--------------------------------------------------------------------------- */

const TEN_K = /\b(10-?k|annual report|annual filing|full[- ]year report)\b/i;
const TEN_Q = /\b(10-?q|quarterly (?:report|filing))\b/i;
const EARNINGS = /\b(earnings|results|quarter(?:ly)? results|eps|income statement)\b/i;
const FILING = /\b(8-?k|filing|filed|sec|risk factors?|md&a|proxy|prospectus)\b/i;
const RECAP = /\b(recap|wrap|summary of (?:the )?day|after (?:the )?(?:market|close)|post[- ]market|what happened (?:today|tonight)|overnight)\b/i;
const YIELD = /\b(yield|apy|apr|lending rate|earn|supply rate|kamino)\b/i;
const UNLOCKS = /\b(unlock|unlocks|vesting|cliff|token release|emission schedule)\b/i;
const SIGNALS = /\b(signal|signals|setup|momentum|what should i watch|worth watching)\b/i;
const COMPARE = /\b(compare|versus|vs\.?|spread between|difference between|across venues?|arb(?:itrage)?)\b/i;
const MONITOR = /\b(watch|monitor|alert me|notify me|track)\b/i;

/** Venue names the provider layer can actually read. */
const VENUES = [
  "binance",
  "jupiter",
  "hyperliquid",
  "birdeye",
  "raydium",
  "polymarket",
  "kamino",
  "dflow",
];

/**
 * Crypto symbols the product already resolves.
 *
 * A closed list on purpose: an open-ended "any uppercase token is a symbol"
 * rule reads NVDA as a crypto asset and sends an earnings question down the
 * market-data path.
 */
const CRYPTO = [
  "BTC", "ETH", "SOL", "USDC", "USDT", "JUP", "BONK", "DOGE",
  "AVAX", "MATIC", "ARB", "OP", "SUI", "APT", "LINK", "JITOSOL", "JLP",
];

const CRYPTO_NAMES: Record<string, string> = {
  BITCOIN: "BTC",
  ETHEREUM: "ETH",
  SOLANA: "SOL",
  DOGECOIN: "DOGE",
};

/* ---------------------------------------------------------------------------
   Extraction
--------------------------------------------------------------------------- */

/** Words that look like tickers but are ordinary English. */
const STOPWORDS = new Set([
  "A", "I", "AI", "AN", "AND", "ARE", "AS", "AT", "BE", "BY", "DO", "FOR", "GET",
  "HOW", "IN", "IS", "IT", "ME", "MY", "OF", "ON", "OR", "SO", "THE", "TO", "UP",
  "US", "WAS", "WHAT", "WHEN", "WHY", "CEO", "CFO", "EPS", "GAAP", "SEC", "USD",
  "PDF", "API", "NOW", "NEW", "OLD", "ALL", "ANY", "CAN", "YOU", "Q1", "Q2",
  "Q3", "Q4", "FY", "YOY", "QOQ", "TVL", "APY", "APR",
]);

function cryptoSymbol(message: string): string | null {
  const upper = message.toUpperCase();

  for (const [name, symbol] of Object.entries(CRYPTO_NAMES)) {
    if (new RegExp(`\\b${name}\\b`).test(upper)) return symbol;
  }
  for (const symbol of CRYPTO) {
    if (new RegExp(`\\b${symbol}\\b`).test(upper)) return symbol;
  }
  return null;
}

/**
 * A probable SEC registrant reference.
 *
 * Returns the raw string for the resolver to look up — never a CIK, and never
 * a company it decided on. This step only says "something here looks like a
 * company"; deciding WHICH company is the resolver's job against the SEC's
 * own mapping.
 */
function registrantQuery(message: string): string | null {
  /* A quoted or capitalised multi-word name, e.g. "NVIDIA Corporation". */
  const proper = /\b([A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,}){0,3})\b/.exec(message);

  /* A bare 1-5 letter ticker, which is the common case. */
  const tokens = message.toUpperCase().match(/\b[A-Z]{1,5}\b/g) ?? [];
  const ticker = tokens.find((token) => !STOPWORDS.has(token) && !CRYPTO.includes(token));

  if (ticker !== undefined) return ticker;

  if (proper !== null) {
    const candidate = proper[1].trim();
    if (!STOPWORDS.has(candidate.toUpperCase())) return candidate;
  }

  return null;
}

function namedVenues(message: string): string[] {
  const lower = message.toLowerCase();
  return VENUES.filter((venue) => new RegExp(`\\b${venue}\\b`).test(lower));
}

function windowHours(message: string): number | null {
  const lower = message.toLowerCase();
  if (/\b(24h|today|tonight|overnight|past day)\b/.test(lower)) return 24;
  if (/\b(7d|this week|past week|next week|coming week)\b/.test(lower)) return 24 * 7;
  if (/\b(30d|this month|past month|next month)\b/.test(lower)) return 24 * 30;
  const explicit = /\b(\d{1,3})\s*(h|hour|hours|d|day|days)\b/.exec(lower);
  if (explicit !== null) {
    const value = Number.parseInt(explicit[1], 10);
    if (!Number.isFinite(value)) return null;
    return explicit[2].startsWith("h") ? value : value * 24;
  }
  return null;
}

/* ---------------------------------------------------------------------------
   Classification
--------------------------------------------------------------------------- */

const SEC_CAPABILITIES = [
  "sec.resolve_company",
  "sec.fetch_submissions",
  "sec.fetch_xbrl",
  "sec.fetch_filing",
];

function task(
  intent: ResearchIntent,
  subject: ResearchSubject,
  reason: string,
  extra: Partial<ResearchTask> = {},
): ResearchTask {
  return {
    intent,
    subject,
    venues: [],
    windowHours: null,
    requires: [],
    optional: [],
    reason,
    ...extra,
  };
}

/**
 * Classifies a research question.
 *
 * Ordered most-specific first. The narrow intents — unlocks, yield, recap —
 * are tested before the company ones because they carry distinctive
 * vocabulary, while "NVDA" appears in almost any question about NVDA.
 */
export function parseResearchIntent(message: string): ResearchTask {
  const text = message.trim();
  const hours = windowHours(text);
  const venues = namedVenues(text);
  const crypto = cryptoSymbol(text);

  if (UNLOCKS.test(text)) {
    return task(
      "token_unlocks",
      crypto === null ? { kind: "none" } : { kind: "crypto", symbol: crypto },
      "unlock vocabulary",
      {
        windowHours: hours ?? 24 * 7,
        requires: ["unlocks.calendar"],
        optional: ["market.crypto_price"],
      },
    );
  }

  if (YIELD.test(text)) {
    return task(
      "yield_discovery",
      crypto === null ? { kind: "none" } : { kind: "crypto", symbol: crypto },
      "yield vocabulary",
      { requires: ["yield.kamino"], optional: ["market.crypto_price"] },
    );
  }

  if (RECAP.test(text)) {
    return task("market_recap", { kind: "none" }, "recap vocabulary", {
      windowHours: hours ?? 24,
      requires: ["market.crypto_price"],
      /* Equities are optional: no equity provider is configured, and the
         recap must still produce a crypto section rather than refusing. */
      optional: ["market.equity_price", "perps.data", "prediction.data", "unlocks.calendar"],
    });
  }

  /* Comparison before signals: "compare SOL across venues" contains neither
     signal vocabulary nor a filing reference, and is a distinct pipeline. */
  if (COMPARE.test(text) && (crypto !== null || venues.length > 0)) {
    return task(
      "cross_venue_compare",
      crypto === null ? { kind: "none" } : { kind: "crypto", symbol: crypto },
      "comparison vocabulary with a crypto subject",
      { venues, requires: ["market.crypto_price"], optional: ["perps.data"] },
    );
  }

  if (SIGNALS.test(text)) {
    return task(
      "signal_request",
      crypto === null ? { kind: "none" } : { kind: "crypto", symbol: crypto },
      "signal vocabulary",
      {
        requires: ["market.crypto_price"],
        optional: ["perps.data", "prediction.data", "unlocks.calendar", "yield.kamino"],
      },
    );
  }

  if (MONITOR.test(text) && crypto !== null) {
    return task("price_monitor", { kind: "crypto", symbol: crypto }, "monitoring vocabulary", {
      requires: ["market.crypto_price"],
    });
  }

  /* ---- SEC-backed intents ----

     Form references are checked before the generic earnings words: "NVDA 10-K"
     and "NVDA earnings" want different documents and different templates, and
     an explicitly named form is the least ambiguous request a user can make. */

  const registrant = registrantQuery(text);

  if (TEN_K.test(text)) {
    return task(
      "company_10k_report",
      registrant === null ? { kind: "none" } : { kind: "registrant", query: registrant },
      "10-K named explicitly",
      { requires: SEC_CAPABILITIES, optional: ["report.pdf", "market.equity_price"] },
    );
  }

  if (TEN_Q.test(text)) {
    return task(
      "company_10q_report",
      registrant === null ? { kind: "none" } : { kind: "registrant", query: registrant },
      "10-Q named explicitly",
      { requires: SEC_CAPABILITIES, optional: ["report.pdf", "market.equity_price"] },
    );
  }

  if (EARNINGS.test(text) && registrant !== null && crypto === null) {
    return task(
      "earnings_report",
      { kind: "registrant", query: registrant },
      "earnings vocabulary with a registrant",
      {
        requires: SEC_CAPABILITIES,
        optional: [
          "sec.fetch_earnings_materials",
          "company_ir.fetch",
          "market.equity_price",
          "report.pdf",
        ],
      },
    );
  }

  if (FILING.test(text) && registrant !== null) {
    return task(
      "filing_question",
      { kind: "registrant", query: registrant },
      "filing vocabulary with a registrant",
      { requires: SEC_CAPABILITIES },
    );
  }

  if (crypto !== null) {
    return task("asset_research", { kind: "crypto", symbol: crypto }, "a crypto subject", {
      requires: ["market.crypto_price"],
      optional: ["perps.data", "prediction.data", "yield.kamino", "unlocks.calendar"],
    });
  }

  /* Nothing matched. Deliberately NOT routed to an SEC pipeline on the
     strength of a capitalised word — fetching filings for a company nobody
     asked about is worse than saying the question was not understood. */
  return task("custom_research", { kind: "none" }, "no specific intent matched", {
    windowHours: hours,
    venues,
  });
}
