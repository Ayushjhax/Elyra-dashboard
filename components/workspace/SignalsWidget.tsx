"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, Radio, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { Section, SectionControl } from "@/components/ui/Section";
import type { WidgetProps } from "@/components/workspace/WidgetColumn";
import { formatCompactUsd, formatPrice, formatPriceUsd, formatRelativeTime } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { refreshPrices, useAssets, useAssetsBySymbols, usePrices } from "@/lib/market/usePrices";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import { parseTrackerSignalList, type TrackerSignal } from "@/lib/tracker/types";
import { useMinute } from "@/lib/useClock";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Smart money and market signals — two feeds, kept apart.

   Smart money is wallet consensus from the tracker service: what tracked
   wallets are doing together, streamed when the service is up and polled
   when the stream drops. Market signals are arithmetic on the live Pyth feed:
   where each market's price sits against its EMA. They answer different
   questions with different evidence, so they are two views with their own
   status rather than one list that blurs which is which.
--------------------------------------------------------------------------- */

type View = "smart" | "market";
type FeedHealth = "live" | "stale" | "disconnected" | "loading";

/** The feed polls every minute; three missed polls is stale. */
const STALE_AFTER_MS = 3 * 60_000;

const HEALTH_TONE: Record<FeedHealth, "positive" | "negative" | "muted"> = {
  live: "positive",
  stale: "muted",
  disconnected: "negative",
  loading: "muted",
};
type Connection = "live" | "polling" | "offline";

interface FeedState {
  signals: TrackerSignal[];
  /** Who produced the list — the tracker, or Elyra's own Hyperliquid read. */
  origin: "tracker" | "hyperliquid" | null;
  notice: string | null;
  disclaimer: string;
  error: string | null;
  loading: boolean;
  fetchedAt: string | null;
  connection: Connection;
}

const INITIAL: FeedState = {
  signals: [],
  origin: null,
  notice: null,
  disclaimer: "",
  error: null,
  loading: true,
  fetchedAt: null,
  connection: "polling",
};

/**
 * Pyth tickers usually resolve cleanly. META is the exception: the catalogue
 * also carries a MetaDAO token and the app's general resolver prefers crypto
 * on collisions. Pin only that feed so this list means Meta Platforms.
 */
const LIVE_MARKETS = ["SOL", "BTC", "ETH", "NVDA", "META", "AAPL", "MSFT", "TSLA"] as const;
const META_EQUITY_FEED_ID = 1272;

/* Ages come from the shared minute clock, which is null until hydration
   (there is no "now" the server and client would agree on) and ticks on its
   own after. */
function age(iso: string, now: number | null): string {
  return now === null ? "—" : formatRelativeTime(iso, now);
}

/**
 * Whether this row was seeded for a demo rather than observed. The seeding
 * script stamps `configVersion` with `seed-…`; checked in one place so the
 * card badge and the banner can never disagree about which rows are real.
 */
function isSeeded(signal: TrackerSignal): boolean {
  return (signal.configVersion ?? "").startsWith("seed-");
}

/** A price from the feed, at the instrument's precision — never $0.00 for a
    small token. Strings, because the tracker sends decimals as strings. */
function money(value: string | null): string {
  if (value === null) return "—";
  const number = Number(value);
  return Number.isFinite(number) ? formatPriceUsd(number) : value;
}

/** A position's size in dollars. */
function size(value: string): string {
  const number = Number(value);
  return Number.isFinite(number) ? formatCompactUsd(number) : value;
}

function quantity(value: string): string {
  const number = Number(value);
  return Number.isFinite(number)
    ? `${number > 0 ? "+" : ""}${number.toLocaleString("en-US", { maximumFractionDigits: 4 })}`
    : value;
}

function emaDistance(row: PriceRow): number {
  if (row.emaPrice === 0) return 0;
  return ((row.price - row.emaPrice) / row.emaPrice) * 100;
}

function Dot({ tone }: { tone: "positive" | "negative" | "muted" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-pill",
        tone === "positive" ? "bg-positive" : tone === "negative" ? "bg-negative" : "bg-text-muted",
      )}
    />
  );
}

/* --- market signals ------------------------------------------------------ */

function MarketRow({
  asset,
  row,
  previous,
  seq,
  now,
}: {
  asset: PythAsset;
  row: PriceRow;
  previous: number | undefined;
  seq: number;
  now: number | null;
}) {
  const distance = emaDistance(row);
  const above = distance >= 0;
  const direction =
    previous === undefined || previous === row.price ? "flat" : row.price > previous ? "up" : "down";
  const flash = useFlash(seq, direction);

  return (
    <li className="flex items-center gap-2.5 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
      <CoinMark symbol={asset.symbol} logo={asset.logo} size={28} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="type-data text-text-primary">{asset.symbol}</span>
          <span
            className={cn(
              "type-label rounded-chip px-1.5",
              above ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative",
            )}
          >
            {above ? "Long" : "Short"}
          </span>
        </div>
        <p className="type-label mt-0.5 truncate text-text-muted">
          {above ? "Above" : "Below"} EMA by {Math.abs(distance).toFixed(2)}%
          {row.marketSession && row.marketSession !== "regular" ? ` · ${row.marketSession}` : ""}
          {` · ${age(row.publishedAt, now)}`}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("type-data rounded-chip px-1 text-text-primary", flash)}>
          ${formatPrice(row.price, priceDecimals(row.price))}
        </p>
        {row.change24hPct === null ? (
          <span className="type-data-sm px-1 text-text-muted">24h —</span>
        ) : (
          <DeltaText value={row.change24hPct} className="type-data-sm px-1" />
        )}
      </div>
    </li>
  );
}

function useMarketSignals() {
  const lookupSymbols = useMemo(() => LIVE_MARKETS.filter((symbol) => symbol !== "META"), []);
  const bySymbol = useAssetsBySymbols(lookupSymbols);
  const { byId } = useAssets([META_EQUITY_FEED_ID]);
  const assets = useMemo(
    () =>
      LIVE_MARKETS.flatMap((symbol) => {
        const asset = symbol === "META" ? byId.get(META_EQUITY_FEED_ID) : bySymbol.get(symbol);
        return asset ? [asset] : [];
      }),
    [byId, bySymbol],
  );
  const ids = useMemo(() => assets.map((asset) => asset.id), [assets]);
  const feed = usePrices(ids);
  const rows = assets.flatMap((asset) => {
    const row = feed.rows.get(asset.id);
    return row ? [{ asset, row }] : [];
  });
  const resolving =
    assets.length < LIVE_MARKETS.length || (rows.length === 0 && feed.status === "loading");
  return { feed, rows, resolving };
}

function MarketSignals({
  feed,
  rows,
  resolving,
  now,
}: ReturnType<typeof useMarketSignals> & { now: number | null }) {
  return (
    <>
      {feed.status === "error" && (
        <div role="alert" className="flex items-center gap-2 border-b border-border-subtle bg-negative-bg px-3 py-2">
          <AlertTriangle size={13} aria-hidden className="shrink-0 text-negative" />
          <p className="type-label min-w-0 flex-1 text-text-secondary">
            Latest prices could not refresh. Last good prices stay visible.
          </p>
          <Button size="xs" variant="quiet" onClick={refreshPrices}>
            Retry
          </Button>
        </div>
      )}

      {resolving && rows.length === 0 ? (
        <ul aria-busy="true" aria-label="Loading market signals" className="list-none">
          {LIVE_MARKETS.slice(0, 5).map((symbol) => (
            <li key={symbol} className="flex h-14 items-center gap-2 border-b border-border-subtle px-3">
              <span className="skeleton size-7 rounded-pill" />
              <span className="skeleton h-3 w-20" />
              <span className="skeleton ml-auto h-3 w-16" />
            </li>
          ))}
        </ul>
      ) : rows.length > 0 ? (
        <ul className="list-none">
          {rows.map(({ asset, row }) => (
            <MarketRow
              key={asset.id}
              asset={asset}
              row={row}
              previous={feed.previous.get(asset.id)}
              seq={feed.seq}
              now={now}
            />
          ))}
        </ul>
      ) : (
        <div className="px-3 py-6 text-center">
          <p className="type-body-sm text-text-secondary">Live prices are unavailable</p>
          <p className="type-label mt-1 text-text-muted">Check the Pyth connection, then retry.</p>
          <Button className="mt-3" size="sm" variant="quiet" onClick={refreshPrices}>
            Try again
          </Button>
        </div>
      )}

      <p className="type-label border-t border-border-subtle px-3 py-2 text-text-muted">
        Live price against Pyth EMA · refreshes every 5s · not financial advice.
      </p>
    </>
  );
}

/* --- smart money --------------------------------------------------------- */

function SmartMoneyCard({ signal, now }: { signal: TrackerSignal; now: number | null }) {
  const [open, setOpen] = useState(false);
  const positive = signal.side === "LONG" || signal.side === "ACCUMULATING";
  /* Elyra's own Hyperliquid read rather than the tracker: its score is a
     share of value, and its wallets carry 30-day returns, not archetypes. */
  const inApp = signal.source === "hyperliquid";
  const net = signal.participants
    .reduce((total, participant) => total + Number(participant.quantityDelta), 0)
    .toString();

  return (
    <li className="border-b border-border-subtle px-3 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="type-data text-text-primary">{signal.symbol}</span>
        <span
          className={cn(
            "type-label rounded-chip px-1.5",
            positive ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative",
          )}
        >
          {signal.side}
        </span>
        {isSeeded(signal) && (
          /* On the card, not only in a banner. A reader who scrolls past the
             header, or screenshots one card, must still see that this
             consensus was never observed. */
          <span
            title="Seeded demo row — not observed consensus. Wallets and prices are real; the consensus is not."
            className="type-label flex items-center gap-1 rounded-chip border border-accent-quiet px-1.5 text-accent"
          >
            <FlaskConical size={10} strokeWidth={1.5} aria-hidden />
            Demo
          </span>
        )}
        <time dateTime={signal.createdAt} className="type-data-sm ml-auto text-text-muted">
          {age(signal.createdAt, now)}
        </time>
      </div>

      <p className="type-label mt-1 text-text-muted">
        {signal.status} · {signal.window}
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-control border border-border-subtle bg-surface-raised p-2.5">
        <div>
          <dt className="type-label text-text-muted">Consensus</dt>
          <dd className="type-data-sm text-text-primary">{signal.walletCount} wallets</dd>
        </div>
        <div>
          <dt className="type-label text-text-muted">{inApp ? "Of the money" : "Score"}</dt>
          <dd className="type-data-sm text-text-primary">
            {inApp ? `${signal.weightedScore}%` : signal.weightedScore.toFixed(0)}
          </dd>
        </div>
        <div>
          <dt className="type-label text-text-muted">Price</dt>
          <dd className="type-data-sm text-text-primary">{money(signal.currentPxUsd)}</dd>
        </div>
        <div>
          <dt className="type-label text-text-muted">Avg. entry</dt>
          <dd className="type-data-sm text-text-primary">
            {money(signal.vwapEntryUsd)}
            {!inApp && (
              <>
                {" "}
                <span className={positive ? "text-positive" : "text-negative"}>{quantity(net)}</span>
              </>
            )}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="type-label mt-2 flex h-8 w-full items-center justify-between rounded-control px-1 text-left text-text-secondary transition-colors hover:text-text-primary"
      >
        <span>
          {open ? "Hide" : "Show"} {signal.participants.length} wallets
          {inApp ? "" : ` · ${signal.archetypeCount} archetypes`}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn("transition-transform duration-[var(--dur-base)] ease-brand", open && "rotate-180")}
        />
      </button>
      {open && (
        <ul className="mt-1 list-none space-y-1.5" aria-label={`${signal.symbol} participants`}>
          {signal.participants.map((participant) => (
            <li key={participant.wallet} className="type-label flex items-baseline gap-2">
              <span className="type-mono-addr min-w-0 flex-1 truncate text-text-secondary">
                {participant.wallet}
              </span>
              <span className="shrink-0 text-text-muted">
                {inApp
                  ? `${participant.performance.roiPct}% 30d · ${size(participant.magnitudeUsd)}`
                  : `${participant.archetype} ${participant.score.toFixed(0)} · ${participant.performance.tradeCount} fills`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SmartMoney({
  state,
  now,
  reload,
}: {
  state: FeedState;
  now: number | null;
  reload: () => void;
}) {
  const seeded = state.signals.filter(isSeeded).length;

  return (
    <>
      {state.error !== null && (
        <div role="alert" className="m-3 rounded-card border border-negative/40 bg-negative-bg p-3">
          <p className="type-label flex items-center gap-2 text-negative">
            <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
            Tracker unavailable
          </p>
          <p className="type-label mt-1 break-words text-text-muted">{state.error}</p>
          <Button className="mt-2" size="sm" variant="quiet" onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {seeded > 0 && (
        <div className="m-3 rounded-card border border-accent-quiet bg-surface-raised px-2.5 py-2">
          <p className="type-label flex items-center gap-1.5 text-accent">
            <FlaskConical size={11} strokeWidth={1.5} aria-hidden />
            Showing seeded demo signals
          </p>
          <p className="type-label mt-1 text-text-muted">
            {seeded} of {state.signals.length} rows were inserted to demonstrate this feed.
            Tracked wallets and marks are real; the consensus between them is not.
          </p>
        </div>
      )}

      {state.loading ? (
        <div aria-busy="true" aria-label="Loading smart money" className="space-y-2 p-3">
          <div className="skeleton h-24 rounded-card" />
          <div className="skeleton h-24 rounded-card" />
        </div>
      ) : state.signals.length > 0 ? (
        <ul className="list-none">
          {state.signals.map((signal) => (
            <SmartMoneyCard key={signal.id} signal={signal} now={now} />
          ))}
        </ul>
      ) : (
        state.error === null && (
          /* Only said when the tracker answered: "nothing has fired" is a
             claim about the market, and it cannot be made on the strength
             of a connection failure. */
          <p className="type-body-sm px-4 py-6 text-center text-text-secondary">
            No wallet consensus has cleared the tracker&rsquo;s gates yet.
          </p>
        )
      )}

      {state.fetchedAt !== null && state.error === null && (
        <p className="type-label border-t border-border-subtle px-3 py-2 text-text-muted">
          Updated {age(state.fetchedAt, now)}
          {state.notice ? ` · ${state.notice}` : ""}
          {state.disclaimer ? ` ${state.disclaimer}` : ""}
        </p>
      )}
    </>
  );
}

/** Which state a feed is in and how old its last reading is, in words. */
function FeedLine({
  state,
  at,
  now,
  source,
}: {
  state: FeedHealth;
  at: string | null;
  now: number | null;
  source: string | null;
}) {
  const words: Record<FeedHealth, string> = {
    live: "Live",
    stale: "Stale",
    disconnected: "Disconnected",
    loading: "Loading",
  };
  return (
    <p
      title={source ?? undefined}
      className="type-label flex min-w-0 items-center gap-1.5 overflow-hidden border-b border-border-subtle px-3 py-1.5 text-text-muted"
    >
      <Dot tone={HEALTH_TONE[state]} />
      <span className={cn("shrink-0", state === "disconnected" ? "text-negative" : "text-text-secondary")}>
        {words[state]}
      </span>
      {at !== null && now !== null && (
        <span className="shrink-0 whitespace-nowrap">· {age(at, now)}</span>
      )}
      {source && <span className="min-w-0 truncate whitespace-nowrap">· {source}</span>}
    </p>
  );
}

/* --- the widget ----------------------------------------------------------- */

export function SignalsWidget({ open, onOpenChange, controls }: WidgetProps) {
  const [view, setView] = useState<View>("smart");
  const [state, setState] = useState<FeedState>(INITIAL);
  const now = useMinute();
  const market = useMarketSignals();

  /* Pure fetch with no setState of its own, so every write below sits behind
     a real `.then()` — see react-hooks/set-state-in-effect. */
  const load = useCallback(async (): Promise<FeedState> => {
    try {
      const response = await fetch("/api/tracker/signals?limit=50", { cache: "no-store" });
      const payload = parseTrackerSignalList((await response.json()) as unknown);
      /* The proxy answers 200 with an empty list when the tracker is
         unreachable and puts the reason in `error`. Reading it is what stops
         a connection failure from being reported as a quiet market. */
      const engineError = payload.error ?? null;
      return {
        signals: payload.signals,
        origin: payload.origin ?? null,
        notice: payload.notice ?? null,
        disclaimer: payload.disclaimer,
        error: engineError,
        loading: false,
        fetchedAt: new Date().toISOString(),
        connection: engineError === null ? "polling" : "offline",
      };
    } catch (error: unknown) {
      return {
        signals: [],
        origin: null,
        notice: null,
        disclaimer: "",
        error: error instanceof Error ? error.message : "Could not reach the tracker",
        loading: false,
        fetchedAt: new Date().toISOString(),
        connection: "offline",
      };
    }
  }, []);

  const reload = useCallback(() => {
    void load().then(setState);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      void load().then((next) => {
        if (!cancelled) setState(next);
      });
    tick();
    const timer = setInterval(tick, 60_000);
    const stream = new EventSource("/api/tracker/stream");
    stream.addEventListener("snapshot", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
        const next = parseTrackerSignalList({
          ...parsed,
          disclaimer: "Signals are observational consensus data, not financial advice.",
          count: (parsed as { signals?: unknown[] }).signals?.length ?? 0,
          generatedAt: new Date().toISOString(),
        });
        setState({
          signals: next.signals,
          origin: "tracker",
          notice: null,
          disclaimer: next.disclaimer,
          error: null,
          loading: false,
          fetchedAt: next.generatedAt,
          connection: "live",
        });
      } catch {
        /* Polling remains the recovery path for malformed stream frames. */
      }
    });
    stream.addEventListener("error", () =>
      setState((current) => ({
        ...current,
        connection: current.error === null ? "polling" : "offline",
      })),
    );
    return () => {
      cancelled = true;
      clearInterval(timer);
      stream.close();
    };
  }, [load]);

  /* Four states, each said in words as well as colour. Live: the last read
     is fresh. Stale: it answered, but not recently — polls have been failing
     quietly or the tab slept. Disconnected: nothing could be read. Loading:
     no answer yet. */
  const smartAge = state.fetchedAt === null || now === null ? null : now - Date.parse(state.fetchedAt);
  const smartState: FeedHealth = state.error !== null
    ? "disconnected"
    : state.loading
      ? "loading"
      : smartAge !== null && smartAge > STALE_AFTER_MS
        ? "stale"
        : "live";
  const smartTone = HEALTH_TONE[smartState];
  const marketState: FeedHealth =
    market.feed.status === "live"
      ? "live"
      : market.feed.status === "error"
        ? market.rows.length > 0
          ? "stale"
          : "disconnected"
        : "loading";
  const marketTone = HEALTH_TONE[marketState];
  const marketLabel = marketState;

  return (
    <Section
      title="Live signals"
      icon={<Radio size={16} strokeWidth={1.5} />}
      /* A dot rather than a word: the column is narrow, the title must not
         truncate, and the tabs below spell each feed's state out. */
      meta={
        <span className="flex items-center">
          <Dot tone={smartTone} />
          <span className="sr-only">{smartState}</span>
        </span>
      }
      open={open}
      onOpenChange={onOpenChange}
      actions={controls}
    >
      <div className="flex items-center gap-1 border-b border-border-subtle pl-3 pr-2">
      <div role="tablist" aria-label="Signal feed" className="flex min-w-0 flex-1 gap-1">
        {(
          [
            ["smart", "Smart money", smartTone, smartState],
            ["market", "Market", marketTone, marketLabel],
          ] as const
        ).map(([value, label, tone, status]) => {
          const active = view === value;
          return (
            <button
              key={value}
              type="button"
              role="tab"
              id={`signals-tab-${value}`}
              aria-selected={active}
              aria-controls={`signals-panel-${value}`}
              onClick={() => setView(value)}
              className={cn(
                "-mb-px flex h-10 items-center gap-1.5 border-b-2 px-2",
                "transition-colors duration-[var(--dur-fast)] ease-brand",
                active
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              <span className="type-label whitespace-nowrap">{label}</span>
              <Dot tone={tone} />
              <span className="sr-only">{status}</span>
            </button>
          );
        })}
      </div>
        {/* Here rather than in the header: the column is narrow, and the
            header's room belongs to the title. It refreshes both feeds. */}
        <SectionControl
          label="Refresh signals"
          onClick={() => {
            reload();
            refreshPrices();
          }}
          className="size-7 shrink-0"
        >
          <RefreshCw
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn(state.loading && "animate-spin")}
          />
        </SectionControl>
      </div>

      <div className="max-h-[440px] overflow-y-auto">
        <div
          role="tabpanel"
          id="signals-panel-smart"
          aria-labelledby="signals-tab-smart"
          hidden={view !== "smart"}
        >
          <FeedLine state={smartState} at={state.fetchedAt} now={now} source={state.origin === "hyperliquid" ? "Elyra's Hyperliquid read" : state.origin === "tracker" ? "Smart-money tracker" : null} />
          <SmartMoney state={state} now={now} reload={reload} />
        </div>
        <div
          role="tabpanel"
          id="signals-panel-market"
          aria-labelledby="signals-tab-market"
          hidden={view !== "market"}
        >
          <FeedLine state={marketState} at={market.feed.fetchedAt} now={now} source="Pyth" />
          <MarketSignals {...market} now={now} />
        </div>
      </div>
    </Section>
  );
}
