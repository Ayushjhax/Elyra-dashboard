/* ---------------------------------------------------------------------------
   Official listing announcements, from the exchanges' own feeds.

   "An exchange has officially announced it will list ABC" is the one claim
   code can check without a model: the exchanges publish their listings.
   Bybit and OKX through documented public APIs, Upbit through the notice
   feed its own site reads. A listing claim in a read is checked against
   these; an auto-buy rule can trigger on them; nothing else is trusted to say
   a listing is official.

   Only crypto counts. Bybit and OKX also list perpetuals on stocks ("TradFi")
   and tokenised shares; those name a company, not a coin, and are kept out
   rather than matched to a ticker that happens to share the letters.

   Pure: the parsers take each feed's JSON and return announcements.
--------------------------------------------------------------------------- */

export type Exchange = "Bybit" | "OKX" | "Upbit";
export type AnnouncementKind = "listing" | "delisting" | "other";

export interface Announcement {
  exchange: Exchange;
  id: string;
  title: string;
  url: string;
  /** When the exchange published it, ms. */
  at: number;
  kind: AnnouncementKind;
  tickers: string[];
}

/** Not a coin: stock perps, tokenised shares and index products. */
const NOT_CRYPTO = /tradfi|stock|equit|shares?\b|exchange os|xstock|\bindex\b|\bETF\b|pre-?market/i;
const QUOTES = "USDT|USDC|USD|KRW|BTC|PERP|EUR";
const IGNORE = new Set(["USDT", "USDC", "USD", "KRW", "BTC", "EUR", "PERP", "UTC", "AM", "PM", "API", "OKX", "NEW", "AND", "FOR", "THE"]);

/** The tickers a title names: "(ABC)", "ABCUSDT", "ABC/USDT", "for ABC, DEF and GHI". */
export function tickersInTitle(title: string): string[] {
  const found: string[] = [];
  const add = (value: string | undefined) => {
    if (value === undefined) return;
    const ticker = value.toUpperCase();
    if (/^[A-Z0-9]{2,12}$/.test(ticker) && !/^\d+$/.test(ticker) && !IGNORE.has(ticker) && !found.includes(ticker)) found.push(ticker);
  };
  for (const match of title.matchAll(/\(([A-Z0-9]{2,12})\)/g)) add(match[1]);
  for (const match of title.matchAll(/\b(?:[Tt]o|[Ww]ill)\s+[Ll]ist\s+([A-Z0-9]{2,12})\b/g)) add(match[1]);
  for (const match of title.matchAll(new RegExp(`\\b([A-Z0-9]{2,12}?)(?:${QUOTES})\\b`, "g"))) add(match[1]);
  for (const match of title.matchAll(new RegExp(`\\b([A-Z0-9]{2,12})\\/(?:${QUOTES})\\b`, "g"))) add(match[1]);
  const list = /\bfor ((?:[A-Z0-9]{2,12})(?:(?:, | and |, and )[A-Z0-9]{2,12})*)\b/.exec(title);
  if (list !== null) for (const part of list[1].split(/, and |, | and /)) add(part);
  return found;
}

export function kindOfTitle(exchange: Exchange, title: string): AnnouncementKind {
  if (NOT_CRYPTO.test(title)) return "other";
  if (exchange === "Upbit") {
    /* "유의 종목" is an investment warning, not a delisting: it is left out rather than mislabelled. */
    if (/거래지원 종료|end of (?:trading )?support|delist/i.test(title)) return "delisting";
    if (/신규 거래지원|디지털 자산 추가|market support for|new digital asset/i.test(title)) return "listing";
    return "other";
  }
  if (/delist/i.test(title)) return "delisting";
  if (/new listing|will list|to list|listing of|launch(?:es)? .*(?:spot|perpetual|trading)/i.test(title)) return "listing";
  return "other";
}

function announcement(exchange: Exchange, id: string, title: string, url: string, at: number): Announcement | null {
  if (title === "" || id === "" || !Number.isFinite(at) || at <= 0) return null;
  const kind = kindOfTitle(exchange, title);
  return { exchange, id, title: title.slice(0, 300), url, at, kind, tickers: kind === "other" ? [] : tickersInTitle(title) };
}

/** Bybit v5 `/announcements/index`. */
export function parseBybit(body: unknown): Announcement[] {
  const list = (body as { result?: { list?: unknown } } | null)?.result?.list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((item) => {
    const row = item as { title?: unknown; url?: unknown; publishTime?: unknown; dateTimestamp?: unknown };
    const url = typeof row.url === "string" && row.url.startsWith("https://announcements.bybit.com/") ? row.url : "";
    const at = Number(row.publishTime ?? row.dateTimestamp);
    const made = announcement("Bybit", url, typeof row.title === "string" ? row.title : "", url, at);
    return made === null ? [] : [made];
  });
}

/** OKX v5 `/support/announcements`. */
export function parseOkx(body: unknown): Announcement[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data.flatMap((page) => {
    const details = (page as { details?: unknown }).details;
    if (!Array.isArray(details)) return [];
    return details.flatMap((item) => {
      const row = item as { title?: unknown; url?: unknown; pTime?: unknown; businessPTime?: unknown };
      const url = typeof row.url === "string" && row.url.startsWith("https://www.okx.com/") ? row.url : "";
      const made = announcement("OKX", url, typeof row.title === "string" ? row.title : "", url, Number(row.pTime ?? row.businessPTime));
      return made === null ? [] : [made];
    });
  });
}

/** Upbit's notice feed, the trade category. */
export function parseUpbit(body: unknown): Announcement[] {
  const notices = (body as { data?: { notices?: unknown } } | null)?.data?.notices;
  if (!Array.isArray(notices)) return [];
  return notices.flatMap((item) => {
    const row = item as { id?: unknown; title?: unknown; first_listed_at?: unknown; listed_at?: unknown };
    const id = typeof row.id === "number" || typeof row.id === "string" ? String(row.id) : "";
    if (!/^\d+$/.test(id)) return [];
    const at = Date.parse(String(row.first_listed_at ?? row.listed_at ?? ""));
    const made = announcement("Upbit", id, typeof row.title === "string" ? row.title : "", `https://upbit.com/service_center/notice?id=${id}`, at);
    return made === null ? [] : [made];
  });
}

/** Exchanges a claim may name, and the name each is read under. */
const NAMED_EXCHANGES: ReadonlyArray<[RegExp, string]> = [
  [/\bbinance\b/i, "Binance"],
  [/\bcoinbase\b/i, "Coinbase"],
  [/\bkraken\b/i, "Kraken"],
  [/\bokx\b/i, "OKX"],
  [/\bbybit\b/i, "Bybit"],
  [/\bupbit\b/i, "Upbit"],
  [/\bbitget\b/i, "Bitget"],
  [/\bkucoin\b/i, "KuCoin"],
  [/\brobinhood\b/i, "Robinhood"],
  [/\bbithumb\b/i, "Bithumb"],
];

/** The exchange a claim names, if exactly one. */
export function exchangeNamed(text: string): string | null {
  const named = NAMED_EXCHANGES.filter(([pattern]) => pattern.test(text)).map(([, name]) => name);
  return named.length === 1 ? named[0] : null;
}

export const READ_FEEDS: readonly Exchange[] = ["Bybit", "OKX", "Upbit"];

/** How long a listing claim looks back for its announcement. */
export const CONFIRM_WINDOW_MS = 21 * 86_400_000;

/** The official listing that confirms a claim about `ticker`, newest first, if any. */
export function confirmingListing(ticker: string, announcements: readonly Announcement[], now: number, exchange: string | null = null): Announcement | null {
  return (
    [...announcements]
      .filter((entry) => entry.kind === "listing" && (exchange === null || entry.exchange === exchange) && entry.tickers.includes(ticker) && now - entry.at <= CONFIRM_WINDOW_MS && entry.at <= now + 60_000)
      .sort((a, b) => b.at - a.at)[0] ?? null
  );
}
