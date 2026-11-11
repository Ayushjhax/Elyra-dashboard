import "server-only";

import { writeFromFacts } from "@/lib/arena/writer";
import { cached } from "@/lib/market/cache";
import { pythApiKey, pythBaseUrl } from "@/lib/market/pyth/catalog";
import { pricesForLabelledIds } from "@/lib/market/pyth/client";
import { changeFor } from "@/lib/market/pyth/yahoo";
import type { PythPrice } from "@/lib/market/pyth/types";
import {
  EXCHANGES,
  FX_PAIRS,
  GLOBAL_BENCHMARKS,
  REGION_EXTRAS,
  REGION_LABEL,
  displayName,
  movers,
  overviewSymbols,
  parsePythSymbol,
  usSymbol,
  yahooCandidates,
  type Benchmark,
  type ExchangeDef,
  type MarketRegion,
} from "@/lib/markets/exchanges";
import { formatDuration, parseSchedule, sessionAt, upcomingHolidays, type SessionStatus } from "@/lib/markets/schedule";
import type { BenchmarkQuote, ExchangeListings, ExchangeView, MarketsBrief, MarketsOverview, Quote, RegionView } from "@/lib/markets/types";

/* ---------------------------------------------------------------------------
   The world markets page, server side.

   Elyra's main Pyth catalogue keeps only dollar-quoted feeds (it prices a
   Solana terminal), so this module reads Pyth's symbol list itself for the
   world's equities in their own currencies, their FX crosses and the session
   schedules — cached for six hours, as the list changes on the order of days.

   Prices are Pyth's. The change is against the previous session's close, from
   Yahoo (lib/market/pyth/yahoo.ts), and is null — a dash — wherever Yahoo has
   nothing dependable. Nothing is estimated to fill a gap.
--------------------------------------------------------------------------- */

const CATALOGUE_TTL_SECONDS = 6 * 60 * 60;
const CHANGE_TTL_SECONDS = 300;
const BRIEF_TTL_SECONDS = 30 * 60;
/** Concurrent Yahoo requests; it answers a burst of hundreds with refusals. */
const YAHOO_CONCURRENCY = 12;

interface RawEntry {
  pyth_lazer_id: number;
  symbol: string | null;
  description: string | null;
  asset_type: string | null;
  state: string | null;
  quote_currency: string | null;
  market_session_schedule?: { regular?: string; pre_market?: string; post_market?: string } | null;
  schedule?: string | null;
}

export interface WorldFeed {
  id: number;
  pythSymbol: string;
  ticker: string;
  name: string;
  region: string | null;
  currency: string;
  live: boolean;
  regular: string | null;
  pre: string | null;
  post: string | null;
}

export interface WorldCatalogue {
  bySymbol: Record<string, WorldFeed>;
  /** Live listings per Pyth region code, excluding funds already shown as benchmarks. */
  liveByRegion: Record<string, string[]>;
  comingSoonByRegion: Record<string, number>;
}

const WANTED_REGIONS = new Set(EXCHANGES.map((exchange) => exchange.pythRegion).concat("Index"));

/** Every feed this page names, so they are kept whatever their region. */
function namedSymbols(): Set<string> {
  const names = new Set(overviewSymbols());
  for (const exchange of EXCHANGES) {
    names.add(exchange.scheduleFrom);
    for (const ticker of [...exchange.viaNewYork, ...(exchange.featured ?? [])]) names.add(usSymbol(ticker));
  }
  for (const extra of Object.values(REGION_EXTRAS)) for (const ticker of extra.viaNewYork) names.add(usSymbol(ticker));
  return names;
}

/** Pure: the raw symbol list → what the page needs. Exported for tests. */
export function buildWorldCatalogue(raw: readonly RawEntry[]): WorldCatalogue {
  const named = namedSymbols();
  const bySymbol: Record<string, WorldFeed> = {};
  const liveByRegion: Record<string, string[]> = {};
  const comingSoonByRegion: Record<string, number> = {};

  for (const entry of raw) {
    if (typeof entry.symbol !== "string" || !Number.isInteger(entry.pyth_lazer_id)) continue;
    const parts = parsePythSymbol(entry.symbol);
    if (parts === null) continue;
    const isEquity = entry.asset_type === "equity" && parts.klass === "Equity";
    const live = entry.state === "stable" && !/DEPRECATED/i.test(entry.description ?? "");
    const regionKnown = isEquity && parts.region !== null && WANTED_REGIONS.has(parts.region);

    if (regionKnown && parts.region !== "US" && parts.region !== "Index") {
      if (live) (liveByRegion[parts.region as string] ??= []).push(entry.symbol);
      else if (entry.state === "coming_soon") comingSoonByRegion[parts.region as string] = (comingSoonByRegion[parts.region as string] ?? 0) + 1;
    }
    const keep = named.has(entry.symbol) || (regionKnown && live && parts.region !== "US");
    if (!keep) continue;

    const schedules = entry.market_session_schedule ?? {};
    bySymbol[entry.symbol] = {
      id: entry.pyth_lazer_id,
      pythSymbol: entry.symbol,
      ticker: parts.klass === "FX" ? `${parts.base}/${parts.quote}` : parts.base,
      name: parts.klass === "FX" ? `${parts.base}/${parts.quote}` : displayName(entry.description, parts.base),
      region: parts.region,
      currency: entry.quote_currency ?? parts.quote,
      live,
      regular: schedules.regular ?? entry.schedule ?? null,
      pre: schedules.pre_market ?? null,
      post: schedules.post_market ?? null,
    };
  }

  /* A region's funds already shown as its benchmarks are not listed twice. */
  const benchmarkSymbols = new Set(overviewSymbols());
  for (const region of Object.keys(liveByRegion)) {
    liveByRegion[region] = liveByRegion[region].filter((symbol) => !benchmarkSymbols.has(symbol)).sort();
  }
  return { bySymbol, liveByRegion, comingSoonByRegion };
}

async function fetchRawSymbols(): Promise<RawEntry[]> {
  const response = await fetch(`${pythBaseUrl()}/v1/symbols`, {
    headers: { authorization: `Bearer ${pythApiKey()}` },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Pyth's symbol list returned ${response.status}`);
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) throw new Error("Pyth's symbol list was not a list");
  return body as RawEntry[];
}

/* In-process memo, as lib/market/pyth/catalog.ts has: the shared cache spares
   Pyth, this spares re-reading and re-parsing the list on every request. */
let memo: { at: number; value: Promise<WorldCatalogue> } | null = null;

export async function worldCatalogue(): Promise<WorldCatalogue> {
  if (memo !== null && Date.now() - memo.at < CATALOGUE_TTL_SECONDS * 1000) return memo.value;
  const value = cached("markets:catalogue:v1", CATALOGUE_TTL_SECONDS, async () => buildWorldCatalogue(await fetchRawSymbols()))
    .then((result) => result.value)
    .catch((error: unknown) => {
      /* A failed read must not be served until the memo expires. */
      memo = null;
      throw error;
    });
  memo = { at: Date.now(), value };
  return value;
}

/** Test seam. Nothing in the app calls this. */
export function resetWorldCatalogue(): void {
  memo = null;
}

/** Runs `work` over `items` with at most `limit` in flight. */
async function pool<T, R>(items: readonly T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        out[index] = await work(items[index]);
      }
    }),
  );
  return out;
}

async function changeForSymbol(pythSymbol: string): Promise<number | null> {
  for (const candidate of yahooCandidates(pythSymbol)) {
    const result = await cached(`markets:change:${candidate}`, CHANGE_TTL_SECONDS, () => changeFor(candidate).catch(() => null)).catch(() => null);
    if (result !== null && result.value !== null && Number.isFinite(result.value)) return result.value;
  }
  return null;
}

/** Live quotes for feeds in the world catalogue; a feed Pyth or Yahoo cannot answer for keeps nulls. */
export async function quotesFor(symbols: readonly string[], catalogue: WorldCatalogue): Promise<Map<string, Quote>> {
  const feeds = symbols.map((symbol) => catalogue.bySymbol[symbol]).filter((feed): feed is WorldFeed => feed !== undefined && feed.live);
  const labels = new Map(feeds.map((feed) => [feed.id, feed.pythSymbol]));
  const [prices, changes] = await Promise.all([
    pricesForLabelledIds(labels).catch((): PythPrice[] => []),
    pool(feeds, YAHOO_CONCURRENCY, (feed) => changeForSymbol(feed.pythSymbol)),
  ]);
  const priceBySymbol = new Map(prices.map((price) => [price.symbol, price]));
  const out = new Map<string, Quote>();
  feeds.forEach((feed, index) => {
    const price = priceBySymbol.get(feed.pythSymbol);
    out.set(feed.pythSymbol, {
      pythSymbol: feed.pythSymbol,
      feedId: feed.id,
      ticker: feed.ticker,
      name: feed.name,
      currency: feed.currency,
      price: price?.price ?? null,
      changePct: changes[index],
      publishedAt: price?.publishedAt ?? null,
      chartable: feed.currency === "USD" && feed.pythSymbol.startsWith("Equity."),
    });
  });
  return out;
}

function benchmarkQuotes(benchmarks: readonly Benchmark[], quotes: Map<string, Quote>): BenchmarkQuote[] {
  return benchmarks.flatMap((benchmark) => {
    const quote = quotes.get(benchmark.pythSymbol);
    return quote === undefined ? [] : [{ ...quote, label: benchmark.label, kind: benchmark.kind }];
  });
}

export function sessionFor(exchange: ExchangeDef, catalogue: WorldCatalogue, now: number): { session: SessionStatus | null; holidays: Array<{ date: string; closed: boolean }> } {
  const feed = catalogue.bySymbol[exchange.scheduleFrom];
  const regular = parseSchedule(feed?.regular);
  if (regular === null) return { session: null, holidays: [] };
  return {
    session: sessionAt(now, regular, { pre: parseSchedule(feed?.pre), post: parseSchedule(feed?.post) }),
    holidays: upcomingHolidays(now, regular, 30),
  };
}

export async function marketsOverview(now: number): Promise<MarketsOverview> {
  const catalogue = await worldCatalogue();
  const regionNewYork = Object.values(REGION_EXTRAS).flatMap((extra) => extra.viaNewYork.map(usSymbol));
  const quotes = await quotesFor([...overviewSymbols(), ...regionNewYork], catalogue);

  const exchanges: ExchangeView[] = EXCHANGES.map((exchange) => ({
    id: exchange.id,
    city: exchange.city,
    venue: exchange.venue,
    country: exchange.country,
    region: exchange.region,
    currency: exchange.currency,
    ...sessionFor(exchange, catalogue, now),
    benchmarks: benchmarkQuotes(exchange.benchmarks, quotes),
    liveListings:
      exchange.pythRegion === "US" ? (exchange.featured ?? []).length : (catalogue.liveByRegion[exchange.pythRegion] ?? []).length,
    comingSoon: catalogue.comingSoonByRegion[exchange.pythRegion] ?? 0,
  }));

  const regions: RegionView[] = (["asia", "europe", "americas"] as MarketRegion[]).map((region) => {
    const members = exchanges.filter((exchange) => exchange.region === region);
    return {
      region,
      label: REGION_LABEL[region],
      openCount: members.filter((exchange) => exchange.session?.kind === "open").length,
      exchangeIds: members.map((exchange) => exchange.id),
      benchmarks: benchmarkQuotes(REGION_EXTRAS[region].benchmarks, quotes),
      viaNewYork: REGION_EXTRAS[region].viaNewYork.flatMap((ticker) => {
        const quote = quotes.get(usSymbol(ticker));
        return quote === undefined ? [] : [quote];
      }),
    };
  });

  return {
    generatedAt: new Date(now).toISOString(),
    exchanges,
    regions,
    global: benchmarkQuotes(GLOBAL_BENCHMARKS, quotes),
    fx: FX_PAIRS.flatMap((pair) => {
      const quote = quotes.get(pair);
      return quote === undefined ? [] : [quote];
    }),
    error: quotes.size === 0 ? "Live prices are unavailable right now." : null,
  };
}

export class MarketsError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export async function exchangeListings(exchangeId: string, now: number): Promise<ExchangeListings> {
  const exchange = EXCHANGES.find((candidate) => candidate.id === exchangeId);
  if (exchange === undefined) throw new MarketsError("No such market.", 404);
  const catalogue = await worldCatalogue();
  const own = exchange.pythRegion === "US" ? (exchange.featured ?? []).map(usSymbol) : (catalogue.liveByRegion[exchange.pythRegion] ?? []);
  const viaNewYork = exchange.viaNewYork.map(usSymbol);
  const quotes = await quotesFor([...own, ...viaNewYork], catalogue);
  const listings = own.flatMap((symbol) => (quotes.has(symbol) ? [quotes.get(symbol) as Quote] : []));
  const ny = viaNewYork.flatMap((symbol) => (quotes.has(symbol) ? [quotes.get(symbol) as Quote] : []));
  const { gainers, losers, breadth } = movers([...listings, ...ny]);
  return {
    exchangeId,
    generatedAt: new Date(now).toISOString(),
    listings,
    viaNewYork: ny,
    breadth,
    gainers,
    losers,
    comingSoon: catalogue.comingSoonByRegion[exchange.pythRegion] ?? 0,
    error: own.length + viaNewYork.length > 0 && quotes.size === 0 ? "Live prices are unavailable right now." : null,
  };
}

const pct = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

/** The facts a brief is written from, as lines; pure given the overview. */
export function briefFacts(overview: MarketsOverview): string[] {
  const lines: string[] = [];
  for (const exchange of overview.exchanges) {
    const session = exchange.session;
    const state =
      session === null
        ? "hours unknown"
        : session.kind === "open"
          ? `open, closes in ${formatDuration(session.closesInMin ?? 0)}`
          : session.kind === "break"
            ? "on its midday break"
            : session.kind === "pre"
              ? "in pre-market trading"
              : session.kind === "post"
                ? "in after-hours trading"
                : session.opensInMin === null
                  ? "closed"
                  : `closed, opens in ${formatDuration(session.opensInMin)}`;
    const lead = exchange.benchmarks.find((benchmark) => benchmark.changePct !== null);
    lines.push(`${exchange.city} (${exchange.venue}): ${state}${lead === undefined ? "" : `; ${lead.label} ${pct(lead.changePct as number)}`}`);
  }
  for (const region of overview.regions) {
    for (const benchmark of region.benchmarks) if (benchmark.changePct !== null) lines.push(`${benchmark.label}: ${pct(benchmark.changePct)}`);
  }
  for (const benchmark of overview.global) if (benchmark.changePct !== null) lines.push(`${benchmark.label}: ${pct(benchmark.changePct)}`);
  for (const pair of overview.fx) if (pair.changePct !== null) lines.push(`${pair.ticker}: ${pct(pair.changePct)}`);
  return lines;
}

/** The code's own brief, used when the model is unavailable or strays from the facts. */
export function fallbackBrief(overview: MarketsOverview): string {
  const open = overview.exchanges.filter((exchange) => exchange.session?.kind === "open").map((exchange) => exchange.city);
  const moves = [...overview.exchanges.flatMap((exchange) => exchange.benchmarks), ...overview.global]
    .filter((benchmark) => benchmark.changePct !== null)
    .sort((a, b) => Math.abs(b.changePct as number) - Math.abs(a.changePct as number));
  const biggest = moves[0];
  const openText = open.length === 0 ? "No major stock market is open right now." : `Open now: ${open.join(", ")}.`;
  return biggest === undefined ? openText : `${openText} The largest move among the benchmarks is ${biggest.label}, ${pct(biggest.changePct as number)} on the previous close.`;
}

const BRIEF_SYSTEM = [
  "You write a short briefing on the world's stock markets for Elyra, a trading app, from facts you are given.",
  "Use only those facts. Repeat a number only exactly as it appears in them; never compute, round or introduce a new one.",
  "Say which markets are open, where the notable moves are, and what the currency moves add. Three to four plain sentences.",
  "Do not predict prices and do not tell the reader what to buy, sell or trade. No exclamation marks, no emoji, no hype.",
].join(" ");

export async function marketsBrief(now: number): Promise<MarketsBrief> {
  /* Keyed by the half hour, so every visitor in a window shares one model call. */
  const window = Math.floor(now / (BRIEF_TTL_SECONDS * 1000));
  const result = await cached(`markets:brief:${window}`, BRIEF_TTL_SECONDS, async () => {
    const overview = await marketsOverview(now);
    const facts = briefFacts(overview);
    const written = await writeFromFacts("Write the world markets briefing for right now.", facts, fallbackBrief(overview), {
      system: BRIEF_SYSTEM,
      maxTokens: 260,
    });
    return { generatedAt: new Date(now).toISOString(), text: written.text, model: written.model, facts };
  });
  return result.value;
}
