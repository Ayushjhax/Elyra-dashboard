"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Landmark, RefreshCw, Search, Sparkles } from "lucide-react";
import type { CompanyResponse } from "@/app/api/sec/company/route";
import type { LatestResponse } from "@/app/api/sec/latest/route";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { CompanyMark } from "@/components/ui/CompanyMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { formatCompactUsd, formatDayGroup, formatRelativeTime } from "@/lib/format";
import { useAssets } from "@/lib/market/usePrices";
import type { CompanyFiling, CompanyProfile, Fundamental } from "@/lib/research/sec/company";
import type { EdgarFiling } from "@/lib/research/sec/current";
import type { SecEntity } from "@/lib/research/sec/entities";
import { CATEGORIES, MAJOR_ITEMS, inCategory, type EdgarCategory } from "@/lib/research/sec/forms";
import { useElyraStore } from "@/lib/store";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   SEC EDGAR, for the whole US market.

   Two views in one scroll:

   - THE MARKET. What every registrant is filing right now — material events,
     insider trades, earnings reports, 5% stakes, IPOs, planned insider
     sales — from EDGAR's live feed, newest first, grouped by day.
   - A COMPANY. Any SEC registrant by ticker, name or CIK: its record (industry,
     exchange, filer category), its latest quarter from XBRL against the same
     quarter a year earlier, and its own filings by kind.

   Documents, not opinions. Each row links to the filing itself, and a figure
   EDGAR could not resolve is absent rather than estimated.
--------------------------------------------------------------------------- */

const REFRESH_MS = 2 * 60_000;
const QUICK_PICKS = ["NVDA", "AAPL", "MSFT", "TSLA", "AMZN", "META", "GOOGL", "COIN", "MSTR", "JPM"];

/* ---------------------------------------------------------------------------
   Pieces
--------------------------------------------------------------------------- */

function Mark({ ticker, name, size }: { ticker: string | null; name: string; size: number }) {
  return ticker ? <CompanyMark ticker={ticker} size={size} /> : <CoinMark symbol={name} size={size} />;
}

function CategoryChips({
  value,
  onChange,
  label,
}: {
  value: EdgarCategory;
  onChange: (category: EdgarCategory) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
      {CATEGORIES.map((category) => {
        const active = category.id === value;
        return (
          <button
            key={category.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(category.id)}
            className={cn(
              "type-label h-7 shrink-0 whitespace-nowrap rounded-pill border px-2.5",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              active
                ? "border-accent-quiet bg-surface-active text-text-primary"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {category.label}
          </button>
        );
      })}
    </div>
  );
}

function ItemTags({ items }: { items: Array<{ code: string; label: string }> }) {
  if (items.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {items.slice(0, 4).map((item) => (
        <span
          key={item.code}
          title={`Item ${item.code}`}
          className={cn(
            "type-label rounded-chip px-1.5",
            MAJOR_ITEMS.has(item.code) ? "bg-surface-active text-text-primary" : "bg-surface-hover text-text-secondary",
          )}
        >
          {item.label}
        </span>
      ))}
      {items.length > 4 && <span className="type-label text-text-muted">+{items.length - 4}</span>}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   The market feed
--------------------------------------------------------------------------- */

function FeedRow({
  filing,
  now,
  onOpen,
}: {
  filing: EdgarFiling;
  now: number;
  onOpen: (query: string) => void;
}) {
  return (
    <li className="flex items-start gap-3 border-t border-border-subtle px-4 py-2.5">
      <button
        type="button"
        onClick={() => onOpen(filing.ticker ?? filing.cik)}
        aria-label={`Open ${filing.company}`}
        className="mt-0.5 shrink-0 rounded-pill"
      >
        <Mark ticker={filing.ticker} name={filing.company} size={30} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5">
          <button
            type="button"
            onClick={() => onOpen(filing.ticker ?? filing.cik)}
            className="type-data shrink-0 text-text-primary hover:underline"
          >
            {filing.ticker ?? "Unlisted"}
          </button>
          <span className="type-body-sm min-w-0 truncate text-text-primary">{filing.label}</span>
          <span className="type-data-sm shrink-0 text-text-muted">{filing.form}</span>
        </p>
        <p className="type-label truncate text-text-secondary">
          {filing.company}
          {filing.filer ? <span className="text-text-muted"> · by {filing.filer}</span> : null}
        </p>
        <ItemTags items={filing.items} />
      </div>
      <a
        href={filing.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open the ${filing.form} filing on EDGAR`}
        className="flex shrink-0 items-center gap-1 rounded-control px-1 py-0.5 text-text-muted hover:text-text-primary"
      >
        <time dateTime={filing.filedAt} className="type-data-sm">
          {formatRelativeTime(filing.filedAt, now)}
        </time>
        <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
      </a>
    </li>
  );
}

type FeedState = { category: EdgarCategory; data: LatestResponse | null; error: string | null };

function MarketFeed({ onOpen }: { onOpen: (query: string) => void }) {
  const [category, setCategory] = useState<EdgarCategory>("all");
  const [state, setState] = useState<FeedState>({ category: "all", data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const now = useMinute();

  const load = useCallback(async (wanted: EdgarCategory): Promise<FeedState> => {
    try {
      const response = await fetch(`/api/sec/latest?category=${wanted}`);
      return { category: wanted, data: (await response.json()) as LatestResponse, error: null };
    } catch {
      return { category: wanted, data: null, error: "EDGAR could not be reached." };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      void load(category).then((next) => {
        if (!cancelled) setState(next);
      });
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [category, load]);

  /* Derived: a category switch shows a skeleton, never the last category's rows. */
  const current = state.category === category ? state : null;
  const filings = useMemo(() => current?.data?.filings ?? [], [current]);

  const groups = useMemo(() => {
    if (now === null) return [];
    const out: Array<{ label: string; rows: EdgarFiling[] }> = [];
    for (const filing of filings) {
      const label = formatDayGroup(filing.filedAt, now);
      const last = out.at(-1);
      if (last?.label === label) last.rows.push(filing);
      else out.push({ label, rows: [filing] });
    }
    return out;
  }, [filings, now]);

  return (
    <section aria-label="Latest filings across the US market">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        <p className="type-eyebrow text-text-muted">Filing now · all US registrants</p>
        <button
          type="button"
          aria-label="Refresh filings"
          onClick={() => {
            setRefreshing(true);
            void load(category)
              .then(setState)
              .finally(() => setRefreshing(false));
          }}
          className="inline-flex size-7 items-center justify-center rounded-control text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <RefreshCw size={13} strokeWidth={1.5} aria-hidden className={cn((refreshing || current === null) && "animate-spin")} />
        </button>
      </div>
      <div className="px-4 pb-2 pt-2">
        <CategoryChips value={category} onChange={setCategory} label="Kind of filing" />
      </div>

      {current === null ? (
        <ul aria-busy="true" aria-label="Loading filings" className="list-none space-y-2 px-4 py-2">
          {[0, 1, 2, 3, 4].map((row) => (
            <li key={row} className="skeleton h-14 rounded-control" />
          ))}
        </ul>
      ) : current.error !== null || current.data === null ? (
        <div className="px-4 py-6 text-center">
          <p className="type-body-sm text-text-secondary">EDGAR could not be reached.</p>
          <Button className="mt-3" size="sm" variant="quiet" onClick={() => void load(category).then(setState)}>
            Try again
          </Button>
        </div>
      ) : !current.data.configured ? (
        <p className="type-body-sm px-4 py-6 text-center text-text-secondary">{current.data.errors[0]}</p>
      ) : filings.length === 0 ? (
        <p className="type-body-sm px-4 py-6 text-center text-text-secondary">Nothing of this kind filed in the latest window.</p>
      ) : (
        <>
          {groups.map((group) => (
            <div key={group.label}>
              <h3 className="type-eyebrow sticky top-0 z-[1] border-t border-border-subtle bg-surface-panel px-4 py-1.5 text-text-muted">
                {group.label}
              </h3>
              <ul className="list-none">
                {group.rows.map((filing) => (
                  <FeedRow key={filing.accession} filing={filing} now={now ?? Date.now()} onOpen={onOpen} />
                ))}
              </ul>
            </div>
          ))}
          {current.data.errors.length > 0 && (
            <p className="type-label px-4 py-2 text-text-muted">Not read this time: {current.data.errors.join(", ")}.</p>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   One company
--------------------------------------------------------------------------- */

function fundamentalValue(entry: Fundamental): string {
  if (entry.unit === "USD/shares") return `${entry.value < 0 ? "-" : ""}$${Math.abs(entry.value).toFixed(2)}`;
  if (entry.unit === "shares") return formatCompactUsd(entry.value).replace("$", "");
  return formatCompactUsd(entry.value);
}

function dateLabel(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return iso;
  return new Date(parsed).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

function CompanyFilingRow({ filing }: { filing: CompanyFiling }) {
  return (
    <li className="border-t border-border-subtle">
      <a
        href={filing.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
      >
        <span className="type-data-sm mt-0.5 w-14 shrink-0 text-text-muted">{filing.form}</span>
        <span className="min-w-0 flex-1">
          <span className="type-body-sm block text-text-primary">{filing.label}</span>
          {filing.periodEnd && <span className="type-label block text-text-muted">Period {dateLabel(filing.periodEnd)}</span>}
          <ItemTags items={filing.items} />
        </span>
        <span className="flex shrink-0 items-center gap-1 text-text-muted">
          <time dateTime={filing.filedAt} className="type-data-sm">
            {dateLabel(filing.filedAt)}
          </time>
          <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
        </span>
      </a>
    </li>
  );
}

function CompanyView({
  query,
  onBack,
  onAsk,
}: {
  query: string;
  onBack: () => void;
  onAsk: (prompt: string) => void;
}) {
  const [state, setState] = useState<{ query: string; data: CompanyResponse | null }>({ query: "", data: null });
  const [category, setCategory] = useState<EdgarCategory>("all");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sec/company?q=${encodeURIComponent(query)}`)
      .then((response) => response.json() as Promise<CompanyResponse>)
      .catch((): CompanyResponse => ({ company: null, error: "EDGAR could not be reached." }))
      .then((data) => {
        if (!cancelled) setState({ query, data });
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const data = state.query === query ? state.data : null;
  const company: CompanyProfile | null = data?.company ?? null;
  const filings = (company?.filings ?? []).filter((filing) => inCategory(filing.form, category));
  const quarter = company?.fundamentals.find((entry) => entry.yoyPct !== null || entry.id === "revenue")?.period ?? null;

  return (
    <section aria-label={company ? `${company.name} on EDGAR` : "Company on EDGAR"}>
      <div className="px-4 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="type-label inline-flex items-center gap-1.5 rounded-control px-1 py-1 text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={13} strokeWidth={1.5} aria-hidden />
          Market feed
        </button>
      </div>

      {data === null ? (
        <div aria-busy="true" aria-label="Loading company" className="space-y-2 px-4 py-3">
          <div className="skeleton h-12 rounded-control" />
          <div className="skeleton h-28 rounded-control" />
          <div className="skeleton h-40 rounded-control" />
        </div>
      ) : company === null ? (
        <p className="type-body-sm px-4 py-6 text-center text-text-secondary">{data.error}</p>
      ) : (
        <>
          <div className="flex items-start gap-3 px-4 pt-2">
            <CompanyMark ticker={company.ticker} size={44} />
            <div className="min-w-0 flex-1">
              <h3 className="type-panel-title text-text-primary">{company.name}</h3>
              <p className="type-data-sm text-text-secondary">
                {company.tickers.join(" · ")}
                {company.exchanges.length > 0 ? ` · ${company.exchanges.join(", ")}` : ""}
                <span className="text-text-muted"> · CIK {Number(company.cik)}</span>
              </p>
              <p className="type-label mt-0.5 text-text-muted">
                {[company.industry, company.category, company.state ? `Inc. ${company.state}` : null, company.fiscalYearEnd ? `FY ends ${company.fiscalYearEnd.slice(2)}/${company.fiscalYearEnd.slice(0, 2)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 px-4 pt-3">
            <a
              href={company.edgarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="type-label inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong px-2.5 text-text-primary hover:bg-surface-hover"
            >
              <Landmark size={13} strokeWidth={1.5} aria-hidden />
              Open on EDGAR
              <ExternalLink size={11} strokeWidth={1.5} aria-hidden className="text-text-muted" />
            </a>
            <button
              type="button"
              onClick={() =>
                onAsk(
                  `Summarise ${company.name} (${company.ticker}) from its SEC filings: the latest quarter, what changed against a year ago, and anything material it filed recently.`,
                )
              }
              className="type-label inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-text-secondary hover:bg-surface-hover hover:text-text-primary"
            >
              <Sparkles size={13} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
              Ask Elyra about {company.ticker}
            </button>
          </div>

          <div className="mx-4 mt-4 rounded-card border border-border-subtle bg-surface-raised">
            <p className="type-eyebrow flex items-center justify-between gap-2 border-b border-border-subtle px-3 py-2 text-text-muted">
              <span>Reported figures</span>
              {quarter && <span className="normal-case tracking-normal text-text-secondary">{quarter} · XBRL</span>}
            </p>
            {company.fundamentals.length === 0 ? (
              <p className="type-body-sm px-3 py-3 text-text-secondary">{company.fundamentalsNote}</p>
            ) : (
              <dl className="grid grid-cols-2">
                {company.fundamentals.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={cn(
                      "px-3 py-2.5",
                      index % 2 === 1 && "border-l border-border-subtle",
                      index >= 2 && "border-t border-border-subtle",
                    )}
                  >
                    <dt className="type-label text-text-muted">{entry.label}</dt>
                    <dd className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="type-data text-text-primary">{fundamentalValue(entry)}</span>
                      {entry.yoyPct !== null && <DeltaText value={entry.yoyPct} decimals={1} className="type-data-sm" />}
                    </dd>
                    <dd className="type-label text-text-muted">{entry.yoyPct !== null ? "vs a year earlier" : entry.period}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="px-4 pb-2 pt-4">
            <p className="type-eyebrow mb-2 text-text-muted">Filings · {company.filings.length} most recent</p>
            <CategoryChips value={category} onChange={setCategory} label="Kind of filing" />
          </div>
          {filings.length === 0 ? (
            <p className="type-body-sm px-4 py-4 text-text-secondary">None of this kind among its recent filings.</p>
          ) : (
            <ul className="list-none">
              {filings.slice(0, 40).map((filing) => (
                <CompanyFilingRow key={filing.accession} filing={filing} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------------------
   Search
--------------------------------------------------------------------------- */

function CompanySearch({ onOpen }: { onOpen: (query: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ for: string; rows: SecEntity[] }>({ for: "", rows: [] });
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const wanted = query.trim();
    if (timer.current !== null) window.clearTimeout(timer.current);
    if (wanted.length === 0) return;
    let cancelled = false;
    timer.current = window.setTimeout(() => {
      void fetch(`/api/sec/search?q=${encodeURIComponent(wanted)}`)
        .then((response) => response.json() as Promise<{ results: SecEntity[] }>)
        .then((body) => {
          if (!cancelled) setResults({ for: wanted, rows: body.results });
        })
        .catch(() => {});
    }, 180);
    return () => {
      cancelled = true;
    };
  }, [query]);

  const rows = results.for === query.trim() ? results.rows : [];
  const showList = open && query.trim().length > 0 && rows.length > 0;

  const choose = (value: string) => {
    onOpen(value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative px-4 pt-4">
      <label className="flex h-10 items-center gap-2 rounded-control border border-border-strong bg-surface-raised px-3 focus-within:border-accent-quiet">
        <Search size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
        <span className="sr-only">Search any company that files with the SEC</span>
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, rows.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const row = rows[active];
              if (row) choose(row.ticker);
              else if (query.trim().length > 0) choose(query.trim());
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Any US company — ticker, name or CIK"
          className="type-body-sm min-w-0 flex-1 bg-transparent text-text-primary placeholder:text-text-muted focus:outline-none"
        />
      </label>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Companies"
          className="absolute inset-x-4 top-full z-20 mt-1 list-none overflow-hidden rounded-card border border-border-strong bg-surface-raised py-1 shadow-pop"
        >
          {rows.map((row, index) => (
            <li
              key={row.cik}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onPointerDown={(event) => {
                event.preventDefault();
                choose(row.ticker);
              }}
              onPointerMove={() => setActive(index)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 px-3 py-1.5",
                index === active ? "bg-surface-hover" : "",
              )}
            >
              <CompanyMark ticker={row.ticker} size={22} />
              <span className="type-data w-14 shrink-0 text-text-primary">{row.ticker}</span>
              <span className="type-label min-w-0 truncate text-text-secondary">{row.companyName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The view
--------------------------------------------------------------------------- */

export function SecResearch({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [company, setCompany] = useState<string | null>(null);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const selected = byId.get(selectedAssetId);
  const onChart = selected?.assetType === "equity" ? selected.symbol.toUpperCase() : null;
  const picks = onChart ? [onChart, ...QUICK_PICKS.filter((ticker) => ticker !== onChart)] : QUICK_PICKS;
  const scrollRef = useRef<HTMLDivElement>(null);

  const open = (query: string) => {
    setCompany(query);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Landmark size={14} strokeWidth={1.5} aria-hidden className="text-text-muted" />
        <p className="type-eyebrow text-text-muted">SEC EDGAR · US market</p>
        <span className="type-label ml-auto flex items-center gap-1.5 text-text-secondary">
          <span aria-hidden className="size-1.5 rounded-pill bg-positive" />
          Live
        </span>
      </div>

      <CompanySearch onOpen={open} />

      <div role="group" aria-label="Companies" className="-mx-0 flex gap-1.5 overflow-x-auto px-4 pb-1 pt-2.5">
        {picks.map((ticker) => (
          <button
            key={ticker}
            type="button"
            onClick={() => open(ticker)}
            aria-pressed={company === ticker}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-pill border py-1 pl-1 pr-2.5",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              company === ticker
                ? "border-accent-quiet bg-surface-active"
                : "border-border-subtle bg-surface-raised hover:bg-surface-hover",
            )}
          >
            <CompanyMark ticker={ticker} size={18} />
            <span className="type-data-sm text-text-secondary">{ticker}</span>
            {ticker === onChart && <span className="type-label text-text-muted">· chart</span>}
          </button>
        ))}
      </div>

      {company === null ? (
        <MarketFeed onOpen={open} />
      ) : (
        <CompanyView key={company} query={company} onBack={() => setCompany(null)} onAsk={onAsk} />
      )}

      <p className="type-label px-4 pt-4 text-text-muted">
        Straight from SEC EDGAR: the filings as filed, and figures as tagged in XBRL. Not advice.
      </p>
    </div>
  );
}
