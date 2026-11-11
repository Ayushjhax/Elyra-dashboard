"use client";

import { useState } from "react";
import { ChevronDown, Globe2, LineChart } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { InfoTip } from "@/components/shell/RouteDrawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPct, formatPrice, formatPriceUsd } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { formatDuration, type SessionStatus } from "@/lib/markets/schedule";
import type { BenchmarkQuote, ExchangeView, Quote, RegionView } from "@/lib/markets/types";
import { useExchangeListings, useMarketsBrief, useMarketsOverview } from "@/lib/markets/useMarkets";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The world's stock markets, live: which exchanges are open, how their
   benchmarks and listings are moving, the currencies around them, and a short
   briefing written from those numbers.

   Every price is Pyth's. Where a market's own feeds are not live yet (London,
   Frankfurt, Paris, São Paulo) it is shown through funds that track it and
   its companies listed in New York, and labelled so. Dollar-priced rows can
   be opened on the chart; local-currency rows cannot yet, and show no button.
--------------------------------------------------------------------------- */

const SESSION_TEXT: Record<SessionStatus["kind"], string> = {
  open: "Open",
  pre: "Pre-market",
  post: "After hours",
  break: "Midday break",
  closed: "Closed",
};

const SESSION_TONE: Record<SessionStatus["kind"], string> = {
  open: "border-sage/45 bg-positive-bg text-positive",
  pre: "border-caution/35 bg-caution-bg text-caution",
  post: "border-caution/35 bg-caution-bg text-caution",
  break: "border-caution/35 bg-caution-bg text-caution",
  closed: "border-border-subtle text-text-secondary",
};

function priceText(quote: Quote): string {
  if (quote.price === null) return "—";
  if (quote.currency === "USD" && !quote.pythSymbol.startsWith("FX.")) return formatPriceUsd(quote.price);
  /* FX at its own precision; a share in its local currency to two places, as exchanges quote it. */
  if (quote.pythSymbol.startsWith("FX.")) return formatPrice(quote.price, priceDecimals(quote.price));
  return `${formatPrice(quote.price, 2)} ${quote.currency}`;
}

function Change({ value, className }: { value: number | null; className?: string }) {
  if (value === null) return <span className={cn("type-data-sm text-text-muted", className)}>—</span>;
  return (
    <span className={cn("type-data-sm tabular-nums", value > 0.005 ? "text-positive" : value < -0.005 ? "text-negative" : "text-text-secondary", className)}>
      {formatPct(value)}
    </span>
  );
}

function SessionPill({ session }: { session: SessionStatus | null }) {
  if (session === null) return <span className="type-label text-text-muted">Hours unknown</span>;
  return (
    <span className={cn("type-label inline-flex h-6 shrink-0 items-center rounded-pill border px-2", SESSION_TONE[session.kind])}>
      {SESSION_TEXT[session.kind]}
    </span>
  );
}

function countdown(session: SessionStatus | null): string | null {
  if (session === null) return null;
  if (session.kind === "open" && session.closesInMin !== null) return `closes in ${formatDuration(session.closesInMin)}`;
  if (session.opensInMin !== null) return `opens in ${formatDuration(session.opensInMin)}`;
  return null;
}

function QuoteRow({ quote, label }: { quote: Quote; label?: string }) {
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  return (
    <li className="flex min-w-0 items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="type-body-sm truncate text-text-primary">{label ?? quote.name}</p>
        <p className="type-label truncate text-text-muted">{quote.ticker}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="type-data-sm tabular-nums text-text-primary">{priceText(quote)}</span>
        <Change value={quote.changePct} />
      </div>
      {quote.chartable ? (
        <button
          type="button"
          onClick={() => setSelectedAssetId(quote.feedId)}
          aria-label={`Show ${quote.ticker} on the chart`}
          className="grid size-9 shrink-0 place-items-center rounded-control text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
        >
          <LineChart size={15} strokeWidth={1.5} aria-hidden />
        </button>
      ) : (
        <span aria-hidden className="size-9 shrink-0" />
      )}
    </li>
  );
}

function QuoteList({ title, quotes, labels, tip }: { title: string; quotes: Quote[]; labels?: Map<string, string>; tip?: string }) {
  if (quotes.length === 0) return null;
  return (
    <div className="flex flex-col">
      <h4 className="type-eyebrow flex items-center gap-1.5 text-text-muted">
        {title}
        {tip !== undefined && <InfoTip text={tip} />}
      </h4>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {quotes.map((quote) => (
          <QuoteRow key={quote.pythSymbol} quote={quote} label={labels?.get(quote.pythSymbol)} />
        ))}
      </ul>
    </div>
  );
}

function Breadth({ up, down, flat }: { up: number; down: number; flat: number }) {
  const total = up + down + flat;
  if (total === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <div aria-hidden className="flex h-1.5 overflow-hidden rounded-pill bg-surface-hover">
        <span className="h-full bg-positive" style={{ width: `${(up / total) * 100}%` }} />
        <span className="h-full bg-text-muted" style={{ width: `${(flat / total) * 100}%` }} />
        <span className="h-full bg-negative" style={{ width: `${(down / total) * 100}%` }} />
      </div>
      <p className="type-label text-text-secondary">
        {up} up · {down} down{flat > 0 ? ` · ${flat} unchanged` : ""} on the previous close
      </p>
    </div>
  );
}

function ExchangeDetail({ exchange }: { exchange: ExchangeView }) {
  const feed = useExchangeListings(exchange.id);
  const labels = new Map(exchange.benchmarks.map((benchmark) => [benchmark.pythSymbol, benchmark.label]));
  const listings = feed.data?.listings ?? [];
  const viaNewYork = feed.data?.viaNewYork ?? [];
  return (
    <div className="flex flex-col gap-4 border-t border-border-subtle px-3 pb-3 pt-3">
      <QuoteList
        title="Benchmarks"
        quotes={exchange.benchmarks}
        labels={labels}
        tip="An index is Pyth's price for the index itself. A fund tracks it: one on the market's own exchange in its currency, or one in New York in dollars, which also moves with the currency."
      />
      {exchange.holidays.length > 0 && (
        <p className="type-label text-text-secondary">
          Upcoming:{" "}
          {exchange.holidays
            .slice(0, 3)
            .map((day) => `${day.date} ${day.closed ? "closed" : "shortened"}`)
            .join(" · ")}
        </p>
      )}
      {feed.loading && feed.data === null ? (
        <SkeletonRows rows={4} />
      ) : feed.error !== null && feed.data === null ? (
        <p role="alert" className="type-body-sm text-negative">
          {feed.error}
        </p>
      ) : (
        <>
          {feed.data !== null && <Breadth {...feed.data.breadth} />}
          {/* Leaders and laggards say something only among enough names; with a handful they repeat the list. */}
          {feed.data !== null && listings.length + viaNewYork.length >= 8 && (feed.data.gainers.length > 0 || feed.data.losers.length > 0) && (
            <div className="grid grid-cols-1 gap-3 @[28rem]:grid-cols-2">
              <QuoteList title="Leading" quotes={feed.data.gainers} />
              <QuoteList title="Lagging" quotes={feed.data.losers} />
            </div>
          )}
          <QuoteList title={exchange.id === "us" ? "Largest companies" : "Live listings"} quotes={listings} />
          <QuoteList
            title={`${exchange.city} companies listed in New York`}
            quotes={viaNewYork}
            tip="The same companies' shares in New York, priced in dollars. They trade in New York hours."
          />
          {exchange.comingSoon > 0 && (
            <p className="type-label text-text-muted">
              Pyth publishes {exchange.comingSoon} more {exchange.city} listings that are not live yet. They appear here when they are.
            </p>
          )}
          {listings.length === 0 && viaNewYork.length === 0 && exchange.comingSoon === 0 && (
            <p className="type-label text-text-muted">This market is followed through its benchmarks above.</p>
          )}
        </>
      )}
    </div>
  );
}

function ExchangeRow({ exchange, open, onToggle }: { exchange: ExchangeView; open: boolean; onToggle: () => void }) {
  const lead: BenchmarkQuote | undefined = exchange.benchmarks.find((benchmark) => benchmark.changePct !== null) ?? exchange.benchmarks[0];
  const regionId = `market-${exchange.id}`;
  return (
    <li className="rounded-card border border-border-subtle bg-surface-base">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={onToggle}
        className="flex w-full min-w-0 items-center gap-3 rounded-card px-3 py-2.5 text-left transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="type-body-sm font-medium text-text-primary">{exchange.city}</span>
            <SessionPill session={exchange.session} />
          </div>
          <p className="type-label truncate text-text-muted">
            {exchange.venue}
            {exchange.session !== null && ` · ${exchange.session.localTime} local`}
            {countdown(exchange.session) !== null && ` · ${countdown(exchange.session)}`}
          </p>
        </div>
        {lead !== undefined && (
          <div className="flex min-w-0 max-w-[40%] shrink-0 flex-col items-end">
            <Change value={lead.changePct} />
            {/* "Hong Kong (iShares MSCI fund, New York)" → "Hong Kong"; the full label is in the detail. */}
            <span className="type-label block max-w-full truncate text-right text-text-muted">{lead.label.split(" (")[0]}</span>
          </div>
        )}
        <ChevronDown
          size={15}
          strokeWidth={1.5}
          aria-hidden
          className={cn("shrink-0 text-text-muted transition-transform duration-[var(--dur-fast)] ease-brand motion-reduce:transition-none", open && "rotate-180")}
        />
      </button>
      <div id={regionId} hidden={!open}>
        {open && <ExchangeDetail exchange={exchange} />}
      </div>
    </li>
  );
}

function RegionSection({ region, exchanges, openId, setOpenId }: { region: RegionView; exchanges: ExchangeView[]; openId: string | null; setOpenId: (id: string | null) => void }) {
  const labels = new Map(region.benchmarks.map((benchmark) => [benchmark.pythSymbol, benchmark.label]));
  return (
    <section aria-label={region.label} className="flex flex-col gap-2">
      <h3 className="type-eyebrow flex items-center justify-between px-1 text-text-muted">
        <span>{region.label}</span>
        <span className="normal-case tracking-normal">
          {region.openCount} of {exchanges.length} open
        </span>
      </h3>
      <ul className="flex flex-col gap-2">
        {exchanges.map((exchange) => (
          <ExchangeRow key={exchange.id} exchange={exchange} open={openId === exchange.id} onToggle={() => setOpenId(openId === exchange.id ? null : exchange.id)} />
        ))}
      </ul>
      {(region.benchmarks.length > 0 || region.viaNewYork.length > 0) && (
        <div className="flex flex-col gap-3 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
          <QuoteList title={`${region.label} funds`} quotes={region.benchmarks} labels={labels} />
          <QuoteList
            title={`More ${region.label} companies in New York`}
            quotes={region.viaNewYork}
            tip="Companies from markets not shown above, through their New York listings, in dollars."
          />
        </div>
      )}
    </section>
  );
}

function Brief() {
  const brief = useMarketsBrief();
  return (
    <section aria-label="Briefing" className="flex flex-col gap-2 rounded-panel border border-border-subtle bg-surface-raised p-4">
      <h3 className="type-h2 text-text-primary">Right now</h3>
      {brief.loading && brief.data === null ? (
        <SkeletonRows rows={2} />
      ) : brief.data === null ? (
        <p className="type-body-sm text-text-secondary">The briefing is unavailable; the markets below are live.</p>
      ) : (
        <>
          <p className="type-body-sm text-text-primary">{brief.data.text}</p>
          <p className="type-label text-text-muted">
            {brief.data.model === "fallback" ? "Summarised by Elyra" : "Written by Elyra's AI"} from the prices below, at{" "}
            {brief.data.generatedAt.slice(11, 16)} UTC. Not a recommendation.
          </p>
        </>
      )}
    </section>
  );
}

export function WorldMarketsView() {
  const overview = useMarketsOverview();
  const [openId, setOpenId] = useState<string | null>(null);

  if (overview.loading && overview.data === null) return <SkeletonRows rows={8} />;
  if (overview.data === null) {
    return <EmptyState icon={Globe2} title="World markets are unavailable" body={overview.error ?? "Try again shortly."} />;
  }
  const data = overview.data;
  const fxLabels = new Map(data.fx.map((quote) => [quote.pythSymbol, quote.ticker]));

  return (
    <div className="@container flex flex-col gap-4">
      <Brief />
      {data.error !== null && (
        <p role="alert" className="type-body-sm text-caution">
          {data.error}
        </p>
      )}
      {data.regions.map((region) => (
        <RegionSection
          key={region.region}
          region={region}
          exchanges={data.exchanges.filter((exchange) => region.exchangeIds.includes(exchange.id))}
          openId={openId}
          setOpenId={setOpenId}
        />
      ))}
      <section aria-label="Global and currencies" className="flex flex-col gap-3 rounded-panel border border-border-subtle bg-surface-raised p-4">
        <QuoteList title="Global" quotes={data.global} labels={new Map(data.global.map((benchmark) => [benchmark.pythSymbol, benchmark.label]))} />
        <QuoteList title="Currencies" quotes={data.fx} labels={fxLabels} tip="Pyth's live rates. A move in the yen, won or euro changes what a market's move is worth in dollars." />
      </section>
      <p className="type-label text-center text-text-muted">
        Prices from Pyth. Change against the previous close. London, Frankfurt, Paris and São Paulo are shown through funds and New York listings until Pyth&apos;s local feeds go live.
      </p>
    </div>
  );
}
