/* ---------------------------------------------------------------------------
   The world's stock markets, as Elyra can see them live. Pure.

   Every price on the markets page is a Pyth feed. Pyth is live today for the
   US, Japan, Hong Kong, mainland China, Korea, Taiwan and India; its London,
   Frankfurt, Paris and São Paulo listings are published but not yet live.
   Until they are, those markets are shown through what is live:
   funds that track them and companies of theirs listed in New York — always
   labelled as such, never passed off as the local index. The day Pyth turns
   a region on, its listings appear (lib/markets/server.ts reads them from the
   catalogue by region and state) without a change here.

   Session hours come from the schedule Pyth publishes for one feed of each
   exchange (`scheduleFrom`), holidays included, so the hours are the venue's
   and not a table kept here.
--------------------------------------------------------------------------- */

export type MarketRegion = "americas" | "europe" | "asia";

export type BenchmarkKind =
  /** Pyth's own price for the index itself. */
  | "index"
  /** A fund on the exchange's own market that tracks its index. */
  | "local-fund"
  /** A New York-listed fund that tracks the market, priced in dollars. */
  | "us-fund";

export interface Benchmark {
  pythSymbol: string;
  label: string;
  kind: BenchmarkKind;
}

export interface ExchangeDef {
  id: string;
  city: string;
  venue: string;
  /** ISO 3166-1 alpha-2. */
  country: string;
  region: MarketRegion;
  currency: string;
  /** The feed whose published schedule is this exchange's trading day. */
  scheduleFrom: string;
  /** Pyth's region code for this market's own listings, e.g. "JP". */
  pythRegion: string;
  benchmarks: Benchmark[];
  /** Companies of this market listed in New York — live while the local feeds are not. */
  viaNewYork: string[];
  /** For the US: the names shown, since Pyth lists over a thousand. Empty means every live listing. */
  featured?: string[];
}

export const REGION_LABEL: Record<MarketRegion, string> = {
  americas: "Americas",
  europe: "Europe",
  asia: "Asia-Pacific",
};

export const EXCHANGES: ExchangeDef[] = [
  {
    id: "us",
    city: "New York",
    venue: "NYSE · Nasdaq",
    country: "US",
    region: "americas",
    currency: "USD",
    scheduleFrom: "Equity.US.AAPL/USD",
    pythRegion: "US",
    benchmarks: [
      { pythSymbol: "Equity.Index.US500/USD", label: "S&P 500", kind: "index" },
      { pythSymbol: "Equity.Index.US100/USD", label: "Nasdaq 100", kind: "index" },
      { pythSymbol: "Equity.Index.US30/USD", label: "Dow Jones 30", kind: "index" },
      { pythSymbol: "Equity.US.IWM/USD", label: "Russell 2000 (iShares fund)", kind: "local-fund" },
    ],
    viaNewYork: [],
    featured: [
      "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AVGO", "TSLA", "JPM", "LLY", "V", "XOM", "UNH", "WMT", "MA",
      "JNJ", "PG", "HD", "COST", "ORCL", "NFLX", "AMD", "CRM", "BAC", "KO", "PEP", "MRK", "CVX", "ADBE", "PLTR",
      "COIN", "MSTR", "HOOD", "IBM", "INTC", "QCOM", "DIS", "NKE", "BA",
    ],
  },
  {
    id: "br",
    city: "São Paulo",
    venue: "B3",
    country: "BR",
    region: "americas",
    currency: "BRL",
    scheduleFrom: "Equity.BR.BOVA11/BRL",
    pythRegion: "BR",
    benchmarks: [{ pythSymbol: "Equity.US.EWZ/USD", label: "Brazil (iShares MSCI fund, New York)", kind: "us-fund" }],
    viaNewYork: [],
  },
  {
    id: "gb",
    city: "London",
    venue: "London Stock Exchange",
    country: "GB",
    region: "europe",
    currency: "GBP",
    scheduleFrom: "Equity.GB.ISF/GBP",
    pythRegion: "GB",
    benchmarks: [],
    viaNewYork: ["AZN", "RIO", "ARM", "VOD", "CCEP"],
  },
  {
    id: "de",
    city: "Frankfurt",
    venue: "Xetra",
    country: "DE",
    region: "europe",
    currency: "EUR",
    scheduleFrom: "Equity.DE.SAP/EUR",
    pythRegion: "DE",
    benchmarks: [{ pythSymbol: "Equity.US.EWG/USD", label: "Germany (iShares MSCI fund, New York)", kind: "us-fund" }],
    viaNewYork: ["SAP"],
  },
  {
    id: "fr",
    city: "Paris",
    venue: "Euronext Paris",
    country: "FR",
    region: "europe",
    currency: "EUR",
    scheduleFrom: "Equity.FR.MC/EUR",
    pythRegion: "FR",
    benchmarks: [{ pythSymbol: "Equity.US.EZU/USD", label: "Eurozone (iShares MSCI fund, New York)", kind: "us-fund" }],
    viaNewYork: ["SNY", "STM"],
  },
  {
    id: "jp",
    city: "Tokyo",
    venue: "Tokyo Stock Exchange",
    country: "JP",
    region: "asia",
    currency: "JPY",
    scheduleFrom: "Equity.JP.1321/JPY",
    pythRegion: "JP",
    benchmarks: [
      { pythSymbol: "Equity.Index.JP225/JPY", label: "Nikkei 225", kind: "index" },
      { pythSymbol: "Equity.JP.1321/JPY", label: "Nikkei 225 (Nomura fund, Tokyo)", kind: "local-fund" },
      { pythSymbol: "Equity.US.EWJ/USD", label: "Japan (iShares MSCI fund, New York)", kind: "us-fund" },
    ],
    viaNewYork: [],
  },
  {
    id: "hk",
    city: "Hong Kong",
    venue: "HKEX",
    country: "HK",
    region: "asia",
    currency: "HKD",
    scheduleFrom: "Equity.HK.0700/HKD",
    pythRegion: "HK",
    benchmarks: [
      { pythSymbol: "Equity.US.EWH/USD", label: "Hong Kong (iShares MSCI fund, New York)", kind: "us-fund" },
      { pythSymbol: "Equity.HK.3188/HKD", label: "CSI 300 (ChinaAMC fund, Hong Kong)", kind: "local-fund" },
    ],
    viaNewYork: [],
  },
  {
    id: "cn",
    city: "Shanghai · Shenzhen",
    venue: "SSE · SZSE",
    country: "CN",
    region: "asia",
    currency: "CNY",
    scheduleFrom: "Equity.CN.600519/CNY",
    pythRegion: "CN",
    benchmarks: [
      { pythSymbol: "Equity.US.FXI/USD", label: "China large caps (iShares fund, New York)", kind: "us-fund" },
      { pythSymbol: "Equity.US.MCHI/USD", label: "China (iShares MSCI fund, New York)", kind: "us-fund" },
      { pythSymbol: "Equity.US.KWEB/USD", label: "China internet (KraneShares fund, New York)", kind: "us-fund" },
    ],
    viaNewYork: [],
  },
  {
    id: "kr",
    city: "Seoul",
    venue: "Korea Exchange",
    country: "KR",
    region: "asia",
    currency: "KRW",
    scheduleFrom: "Equity.KR.005930/KRW",
    pythRegion: "KR",
    benchmarks: [
      { pythSymbol: "Equity.Index.KR200/KRW", label: "KOSPI 200", kind: "index" },
      { pythSymbol: "Equity.KR.069500/KRW", label: "KOSPI 200 (Samsung KODEX fund, Seoul)", kind: "local-fund" },
      { pythSymbol: "Equity.US.EWY/USD", label: "Korea (iShares MSCI fund, New York)", kind: "us-fund" },
    ],
    viaNewYork: [],
  },
  {
    id: "tw",
    city: "Taipei",
    venue: "Taiwan Stock Exchange",
    country: "TW",
    region: "asia",
    currency: "TWD",
    scheduleFrom: "Equity.TW.2330/TWD",
    pythRegion: "TW",
    benchmarks: [{ pythSymbol: "Equity.US.EWT/USD", label: "Taiwan (iShares MSCI fund, New York)", kind: "us-fund" }],
    viaNewYork: [],
  },
  {
    id: "in",
    city: "Mumbai",
    venue: "National Stock Exchange",
    country: "IN",
    region: "asia",
    currency: "INR",
    scheduleFrom: "Equity.IN.NIFTYBEES/INR",
    pythRegion: "IN",
    benchmarks: [
      { pythSymbol: "Equity.IN.NIFTYBEES/INR", label: "Nifty 50 (Nippon India fund, Mumbai)", kind: "local-fund" },
      { pythSymbol: "Equity.US.INDA/USD", label: "India (iShares MSCI fund, New York)", kind: "us-fund" },
    ],
    viaNewYork: [],
  },
];

/** Region-wide funds, and Europe's New York listings that belong to no exchange above. */
export const REGION_EXTRAS: Record<MarketRegion, { benchmarks: Benchmark[]; viaNewYork: string[] }> = {
  americas: { benchmarks: [], viaNewYork: [] },
  europe: {
    benchmarks: [
      { pythSymbol: "Equity.US.VGK/USD", label: "Europe (Vanguard FTSE fund, New York)", kind: "us-fund" },
      { pythSymbol: "Equity.US.IEUR/USD", label: "Europe (iShares Core MSCI fund, New York)", kind: "us-fund" },
    ],
    /* Netherlands, Denmark, Sweden, Finland and Switzerland, all in New York. */
    viaNewYork: ["ASML", "NVO", "SPOT", "ERIC", "NOK", "LOGI"],
  },
  asia: {
    benchmarks: [{ pythSymbol: "Equity.US.EIDO/USD", label: "Indonesia (iShares MSCI fund, New York)", kind: "us-fund" }],
    viaNewYork: [],
  },
};

export const GLOBAL_BENCHMARKS: Benchmark[] = [
  { pythSymbol: "Equity.US.ACWI/USD", label: "All world (iShares MSCI ACWI)", kind: "us-fund" },
  { pythSymbol: "Equity.US.VEA/USD", label: "Developed markets outside the US (Vanguard)", kind: "us-fund" },
  { pythSymbol: "Equity.US.VWO/USD", label: "Emerging markets (Vanguard)", kind: "us-fund" },
];

export const FX_PAIRS = [
  "FX.EUR/USD",
  "FX.GBP/USD",
  "FX.USD/JPY",
  "FX.USD/CNH",
  "FX.USD/HKD",
  "FX.USD/KRW",
  "FX.USD/TWD",
  "FX.USD/INR",
  "FX.USD/BRL",
  "FX.USD/CHF",
  "FX.AUD/USD",
] as const;

export const usSymbol = (ticker: string) => `Equity.US.${ticker}/USD`;

/** Parts of `Equity.JP.7203/JPY` or `FX.USD/JPY`. */
export function parsePythSymbol(pythSymbol: string): { klass: string; region: string | null; base: string; quote: string } | null {
  const slash = pythSymbol.lastIndexOf("/");
  if (slash < 0) return null;
  const quote = pythSymbol.slice(slash + 1);
  const head = pythSymbol.slice(0, slash).split(".");
  if (head.length < 2) return null;
  const klass = head[0];
  if (klass === "FX") return { klass, region: null, base: head.slice(1).join("."), quote };
  if (head.length < 3) return null;
  return { klass, region: head[1], base: head.slice(2).join("."), quote };
}

const YAHOO_INDEX: Record<string, string> = {
  US500: "^GSPC",
  US100: "^NDX",
  US30: "^DJI",
  JP225: "^N225",
  KR200: "^KS200",
};

/**
 * The Yahoo symbols that give a feed's previous close, in the order to try.
 * Empty when there is no dependable one — the change then shows as a dash.
 */
export function yahooCandidates(pythSymbol: string): string[] {
  const parts = parsePythSymbol(pythSymbol);
  if (parts === null) return [];
  const { klass, region, base, quote } = parts;
  if (klass === "FX") return /^[A-Z]{3}$/.test(base) && /^[A-Z]{3}$/.test(quote) ? [`${base}${quote}=X`] : [];
  if (klass !== "Equity") return [];
  switch (region) {
    case "Index":
      return YAHOO_INDEX[base] === undefined ? [] : [YAHOO_INDEX[base]];
    case "US":
      return [base.replace(".", "-")];
    case "JP":
      return /^[0-9A-Z]{4}$/.test(base) ? [`${base}.T`] : [];
    case "HK":
      return /^\d{4}$/.test(base) ? [`${base}.HK`] : [];
    case "KR":
      /* KOSPI first; a KOSDAQ listing answers on the second. */
      return /^\d{6}$/.test(base) ? [`${base}.KS`, `${base}.KQ`] : [];
    case "CN":
      if (!/^\d{6}$/.test(base)) return [];
      /* 6xxxxx and 5xxxxx funds list in Shanghai; 0, 1, 2 and 3 in Shenzhen. */
      return [/^[56]/.test(base) ? `${base}.SS` : `${base}.SZ`];
    case "TW":
      return /^\d{4}$/.test(base) ? [`${base}.TW`] : [];
    case "IN":
      return /^[A-Z0-9]+$/.test(base) ? [`${base}.NS`] : [];
    default:
      return [];
  }
}

/** Every feed the overview prices: benchmarks, region funds and FX. */
export function overviewSymbols(): string[] {
  const symbols = new Set<string>();
  for (const exchange of EXCHANGES) for (const benchmark of exchange.benchmarks) symbols.add(benchmark.pythSymbol);
  for (const extra of Object.values(REGION_EXTRAS)) for (const benchmark of extra.benchmarks) symbols.add(benchmark.pythSymbol);
  for (const benchmark of GLOBAL_BENCHMARKS) symbols.add(benchmark.pythSymbol);
  for (const pair of FX_PAIRS) symbols.add(pair);
  return [...symbols];
}

/** Words that stay in capitals whatever their vowels. */
const ACRONYMS = new Set(["ADR", "ETF", "ETN", "MSCI", "CSI", "PLC", "NV", "SA", "SE", "AG", "AB", "ASA", "OYJ", "ACWI", "FTSE", "KODEX", "BEES", "TOPIX", "NIFTY", "LG", "SK", "NH", "HD", "NTT", "UFJ", "USD"]);

/** "TOYOTA MOTOR CORPORATION / JAPANESE YEN" → "Toyota Motor Corporation". */
export function displayName(description: string | null | undefined, fallback: string): string {
  let head = (description ?? "").split(" / ")[0].replace(/\s+/g, " ").trim();
  /* Pyth's own index and 24-hour feeds: "PYTH PRICE IN JPY FOR JP225 24/7" → "JP225". */
  const wrapped = /^PYTH PRICE IN [A-Z]{3} FOR\s+(.+?)(?:\s+24\/[57])?$/i.exec(head);
  if (wrapped !== null) head = wrapped[1].trim();
  if (head.length === 0) return fallback;
  const word = (text: string): string => {
    const upper = text.toUpperCase();
    /* Acronyms and tickers stay capitals: "ETF", "LG", "NTT", "SK". */
    if (ACRONYMS.has(upper) || /\d/.test(text) || (text.length <= 3 && !/[aeiou]/i.test(text))) return upper;
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  };
  return head
    .split(" ")
    .map((part) => part.split("-").map(word).join("-"))
    .join(" ");
}

/** A move this small, in percent, counts as unchanged. */
export const FLAT_PCT = 0.005;

/** Gainers, losers and breadth among quotes with a known change. */
export function movers<T extends { changePct: number | null }>(quotes: readonly T[], count = 3) {
  const known = quotes.filter((quote) => quote.changePct !== null && Number.isFinite(quote.changePct));
  const sorted = [...known].sort((a, b) => (b.changePct as number) - (a.changePct as number));
  return {
    gainers: sorted.filter((quote) => (quote.changePct as number) > FLAT_PCT).slice(0, count),
    losers: sorted.filter((quote) => (quote.changePct as number) < -FLAT_PCT).reverse().slice(0, count),
    breadth: {
      up: known.filter((quote) => (quote.changePct as number) > FLAT_PCT).length,
      down: known.filter((quote) => (quote.changePct as number) < -FLAT_PCT).length,
      flat: known.filter((quote) => Math.abs(quote.changePct as number) <= FLAT_PCT).length,
      unknown: quotes.length - known.length,
    },
  };
}
