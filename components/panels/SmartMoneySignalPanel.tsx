"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, RefreshCw, Radio } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { formatPrice, formatRelativeTime } from "@/lib/format";
import { priceDecimals } from "@/lib/market/precision";
import { refreshPrices, useAssets, useAssetsBySymbols, usePrices } from "@/lib/market/usePrices";
import type { PriceRow, PythAsset } from "@/lib/market/pyth/types";
import { useMinute } from "@/lib/useClock";
import { useFlash } from "@/lib/useFlash";
import { cn } from "@/lib/utils";
import { parseTrackerSignalList, type TrackerSignal } from "@/lib/tracker/types";

interface FeedState { signals: TrackerSignal[]; disclaimer: string; error: string | null; loading: boolean; fetchedAt: string | null; connection: "live" | "polling" | "offline"; }
const INITIAL: FeedState = { signals: [], disclaimer: "", error: null, loading: true, fetchedAt: null, connection: "polling" };

/**
 * Pyth tickers usually resolve cleanly. META is the exception: the catalogue
 * also carries a MetaDAO token and the app's general resolver prefers crypto
 * on collisions. Pin only that feed so this list means Meta Platforms.
 */
const LIVE_MARKETS = ["SOL", "BTC", "ETH", "NVDA", "META", "AAPL", "MSFT", "TSLA"] as const;
const META_EQUITY_FEED_ID = 1272;

/* `formatRelativeTime` defaults its `now` to MOCK_NOW — a frozen instant the
   seeded panels use — so live data has to pass the real one. It cannot come
   from `Date.now()` in a render body: that is an impure read, the React
   compiler rejects it, and it is why this file failed lint. It comes from the
   shared minute clock instead, which is null until hydration (there is no
   "now" the server and client would agree on) and ticks on its own after,
   so these ages advance without anything else re-rendering the list. */
function age(iso: string, now: number | null): string {
  return now === null ? "—" : formatRelativeTime(iso, now);
}

/**
 * Whether this row was seeded for a demo rather than observed.
 *
 * `configVersion` names the rule set that produced a signal; the seeding
 * script stamps `seed-…`. Checked in one place so the card badge and the
 * panel banner can never disagree about which rows are real — and so that
 * deleting the seed makes every trace of it disappear at once.
 */
function isSeeded(signal: TrackerSignal): boolean {
  return (signal.configVersion ?? "").startsWith("seed-");
}

function money(value: string | null): string { if (value === null) return "—"; const number = Number(value); return Number.isFinite(number) ? `$${number.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : value; }
function quantity(value: string): string { const number = Number(value); return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : value; }

function emaDistance(row: PriceRow): number {
  if (row.emaPrice === 0) return 0;
  return ((row.price - row.emaPrice) / row.emaPrice) * 100;
}

function LiveMarketRow({
  asset,
  row,
  previous,
  seq,
}: {
  asset: PythAsset;
  row: PriceRow;
  previous: number | undefined;
  seq: number;
}) {
  const distance = emaDistance(row);
  const long = distance >= 0;
  const direction = previous === undefined || previous === row.price
    ? "flat"
    : row.price > previous
      ? "up"
      : "down";
  const flash = useFlash(seq, direction);

  return (
    <li>
      <article className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border-subtle px-3 py-2.5">
        <CoinMark symbol={asset.symbol} logo={asset.logo} size={24} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="type-data shrink-0 text-text-primary">{asset.symbol}</span>
            <span className={cn("type-label rounded-chip px-1.5 py-0.5", long ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative")}>
              {long ? "LONG" : "SHORT"}
            </span>
            <span className="type-label min-w-0 truncate text-text-muted">{asset.name}</span>
          </div>
          <p className="type-label mt-0.5 text-text-muted">
            {long ? "Above" : "Below"} EMA by {Math.abs(distance).toFixed(2)}%
            {row.marketSession && row.marketSession !== "regular" ? ` · ${row.marketSession}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("type-data rounded-chip px-1 text-text-primary", flash)}>
            ${formatPrice(row.price, priceDecimals(row.price))}
          </p>
          {row.change24hPct === null ? (
            <span className="type-data-sm text-text-muted">24h —</span>
          ) : (
            <DeltaText value={row.change24hPct} className="type-data-sm" />
          )}
        </div>
      </article>
    </li>
  );
}

function LiveMarketSignals() {
  const lookupSymbols = useMemo(
    () => LIVE_MARKETS.filter((symbol) => symbol !== "META"),
    [],
  );
  const bySymbol = useAssetsBySymbols(lookupSymbols);
  const { byId } = useAssets([META_EQUITY_FEED_ID]);
  const assets = useMemo(
    () => LIVE_MARKETS.flatMap((symbol) => {
      const asset = symbol === "META"
        ? byId.get(META_EQUITY_FEED_ID)
        : bySymbol.get(symbol);
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
  const resolving = assets.length < LIVE_MARKETS.length || (rows.length === 0 && feed.status === "loading");

  return (
    <section aria-labelledby="live-market-signals-title" className="border-b border-border-strong">
      <div className="flex items-center gap-2 border-b border-border-subtle bg-surface-raised px-3 py-2">
        <Eyebrow id="live-market-signals-title">Live market signals</Eyebrow>
        <span className="type-label ml-auto flex items-center gap-1.5 text-text-muted">
          <span className={cn("size-1.5 rounded-pill", feed.status === "live" ? "bg-positive" : feed.status === "error" ? "bg-negative" : "bg-text-muted")} aria-hidden />
          {feed.status === "live" ? "Pyth live" : feed.status === "error" ? "Prices delayed" : "Connecting"}
        </span>
      </div>

      {feed.status === "error" && (
        <div role="alert" className="flex items-center gap-2 border-b border-border-subtle bg-negative-bg px-3 py-2">
          <AlertTriangle size={13} aria-hidden className="shrink-0 text-negative" />
          <p className="type-label min-w-0 flex-1 text-text-secondary">Latest prices could not refresh. Last good prices stay visible.</p>
          <Button size="xs" variant="quiet" onClick={refreshPrices}>Retry</Button>
        </div>
      )}

      {resolving && rows.length === 0 ? (
        <div className="space-y-px" aria-label="Loading live market signals" aria-busy="true">
          {LIVE_MARKETS.slice(0, 5).map((symbol) => (
            <div key={symbol} className="flex h-14 items-center gap-2 border-b border-border-subtle px-3">
              <span className="size-6 animate-pulse rounded-pill bg-surface-raised" />
              <span className="h-3 w-20 animate-pulse rounded-chip bg-surface-raised" />
              <span className="ml-auto h-3 w-16 animate-pulse rounded-chip bg-surface-raised" />
            </div>
          ))}
        </div>
      ) : rows.length > 0 ? (
        <ul className="list-none">
          {rows.map(({ asset, row }) => (
            <LiveMarketRow
              key={asset.id}
              asset={asset}
              row={row}
              previous={feed.previous.get(asset.id)}
              seq={feed.seq}
            />
          ))}
        </ul>
      ) : (
        <div className="px-3 py-5 text-center">
          <p className="type-body-sm text-text-secondary">Live prices are unavailable</p>
          <p className="type-label mt-1 text-text-muted">Check the Pyth connection, then retry.</p>
          <Button className="mt-3" size="sm" variant="quiet" onClick={refreshPrices}>Try again</Button>
        </div>
      )}

      <p className="type-label px-3 py-2 text-text-muted">
        Signals compare live price with Pyth EMA · Prices refresh every 5s · Not financial advice.
      </p>
    </section>
  );
}

function SmartMoneyCard({ signal, now }: { signal: TrackerSignal; now: number | null }) {
  const [open, setOpen] = useState(false);
  const positive = signal.side === "LONG" || signal.side === "ACCUMULATING";
  return (
    <li>
      <article className="border-b border-border-subtle px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("type-label rounded-pill px-1.5 py-0.5", positive ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative")}>
            {signal.status}
          </span>
          {isSeeded(signal) && (
            /* On the card, not only in a banner. A reader who scrolls past
               the header, or screenshots one card, must still see that this
               consensus was never observed. */
            <span
              title="Seeded demo row — not observed consensus. Wallets and prices are real; the consensus is not."
              className="type-label flex items-center gap-1 rounded-chip border border-accent-quiet px-1.5 py-0.5 text-accent"
            >
              <FlaskConical size={10} strokeWidth={1.5} aria-hidden />
              DEMO
            </span>
          )}
          <span className="type-label ml-auto text-text-muted">{age(signal.createdAt, now)}</span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="type-data text-text-primary">{signal.symbol}</span>
          <span className={cn("type-data-sm rounded-chip border border-border-subtle px-1.5 py-0.5", positive ? "text-positive" : "text-negative")}>{signal.side}</span>
          <span className="type-label ml-auto text-text-muted">{signal.window}</span>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-2 rounded-card border border-border-subtle bg-surface-raised p-2.5 sm:grid-cols-4">
          <div><dt className="type-label text-text-muted">Consensus</dt><dd className="type-data-sm text-text-primary">{signal.walletCount} wallets</dd></div>
          <div><dt className="type-label text-text-muted">Score</dt><dd className="type-data-sm text-text-primary">{signal.weightedScore.toFixed(0)}</dd></div>
          <div><dt className="type-label text-text-muted">Diversity</dt><dd className="type-data-sm text-text-primary">{signal.archetypeCount} archetypes</dd></div>
          <div><dt className="type-label text-text-muted">Price</dt><dd className="type-data-sm text-text-primary">{money(signal.currentPxUsd)}</dd></div>
        </dl>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <div><Eyebrow>Wallet performance</Eyebrow><p className="type-data-sm mt-1 text-text-secondary">{signal.participants.slice(0, 3).map((participant) => `${participant.archetype} ${participant.score.toFixed(0)}`).join(" · ") || "No participants"}</p></div>
          <div><Eyebrow>Average cost</Eyebrow><p className="type-data-sm mt-1 text-text-secondary">{money(signal.vwapEntryUsd)} <span className={positive ? "text-positive" : "text-negative"}>{quantity(signal.participants.reduce((total, participant) => total + Number(participant.quantityDelta), 0).toString())}</span></p></div>
        </div>

        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mt-3 flex min-h-10 w-full items-center justify-between rounded-control border border-border-subtle px-2.5 text-left type-label text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>{open ? "Hide participant detail" : "Show participant detail"}</span><ChevronDown size={14} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </button>
        {open && <ul className="mt-2 space-y-1.5" aria-label="Signal participants">
          {signal.participants.map((participant) => <li key={participant.wallet} className="flex items-baseline gap-2 type-label"><span className="min-w-0 flex-1 truncate text-text-secondary">{participant.wallet}</span><span className="text-text-muted">{participant.performance.realizedPnlUsd} PnL · {participant.performance.tradeCount} fills</span></li>)}
        </ul>}
      </article>
    </li>
  );
}

export function SmartMoneySignalPanel() {
  const [state, setState] = useState<FeedState>(INITIAL);
  const now = useMinute();
  const load = useCallback(async (): Promise<FeedState> => {
    try {
      const response = await fetch("/api/tracker/signals?limit=50", { cache: "no-store" });
      const payload = parseTrackerSignalList(await response.json() as unknown);
      /* The proxy answers 200 with an empty list when the tracker itself is
         unreachable, and puts the reason in `error`. Reading it is what stops
         this panel from reporting a connection failure as "the engine is
         running, but nothing has cleared the gates" — a claim about the
         market, made when no market was ever consulted. */
      const engineError = payload.error ?? null;
      return { signals: payload.signals, disclaimer: payload.disclaimer, error: engineError, loading: false, fetchedAt: new Date().toISOString(), connection: engineError === null ? "polling" : "offline" };
    } catch (error: unknown) {
      return { signals: [], disclaimer: "", error: error instanceof Error ? error.message : "Could not reach the tracker", loading: false, fetchedAt: new Date().toISOString(), connection: "offline" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => void load().then((next) => { if (!cancelled) setState(next); });
    tick();
    const timer = setInterval(tick, 60_000);
    const stream = new EventSource("/api/tracker/stream");
    stream.addEventListener("snapshot", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as unknown;
        const next = parseTrackerSignalList({ ...parsed as Record<string, unknown>, disclaimer: "Signals are observational consensus data, not financial advice.", count: (parsed as { signals?: unknown[] }).signals?.length ?? 0, generatedAt: new Date().toISOString() });
        setState({ signals: next.signals, disclaimer: next.disclaimer, error: null, loading: false, fetchedAt: next.generatedAt, connection: "live" });
      } catch { /* polling remains the recovery path for malformed stream frames */ }
    });
    stream.addEventListener("error", () => setState((current) => ({ ...current, connection: current.error === null ? "polling" : "offline" })));
    return () => { cancelled = true; clearInterval(timer); stream.close(); };
  }, [load]);

  return <Panel label="Smart money signals"><PanelHeader><Eyebrow>Smart money live</Eyebrow><span className="type-label ml-auto flex items-center gap-1.5 text-text-muted"><Radio size={12} aria-hidden className={state.connection === "live" ? "text-positive" : undefined} />{state.connection}</span><button type="button" aria-label="Refresh smart money signals" onClick={() => void load().then(setState)} className="ml-2 min-h-10 min-w-10 rounded-control p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><RefreshCw size={14} aria-hidden className={cn(state.loading && "animate-spin")} /></button></PanelHeader><PanelBody>
    <LiveMarketSignals />
    {state.error !== null && <div role="alert" className="m-3 rounded-card border border-negative/40 bg-negative-bg p-3"><div className="flex items-center gap-2 text-negative"><AlertTriangle size={14} aria-hidden /><p className="type-label">Tracker unavailable</p></div><p className="type-label mt-1 text-text-muted">{state.error}</p><Button className="mt-2" size="sm" variant="quiet" onClick={() => void load().then(setState)}>Try again</Button></div>}
    {state.signals.some(isSeeded) && (
      <div className="m-3 flex flex-col gap-1 rounded-card border border-accent-quiet bg-surface-raised px-2.5 py-2">
        <p className="type-label flex items-center gap-1.5 text-accent">
          <FlaskConical size={11} strokeWidth={1.5} aria-hidden />
          Showing seeded demo signals
        </p>
        <p className="type-label text-text-muted">
          {state.signals.filter(isSeeded).length} of {state.signals.length} rows were
          inserted to demonstrate this panel. Tracked wallets and marks are real; the
          consensus between them is not. Remove with{" "}
          <code className="text-text-secondary">pnpm tracker:seed-demo --remove</code>.
        </p>
      </div>
    )}
    {state.loading && <div className="space-y-2 p-3" aria-label="Loading smart money signals"><div className="h-24 animate-pulse rounded-card bg-surface-raised" /><div className="h-24 animate-pulse rounded-card bg-surface-raised" /></div>}
    <ul className="list-none">{state.signals.map((signal) => <SmartMoneyCard key={signal.id} signal={signal} now={now} />)}</ul>
    {state.signals.length > 0 && state.fetchedAt !== null && <p className="type-label px-3 py-2 text-text-muted">Wallet consensus updated {age(state.fetchedAt, now)}{state.disclaimer ? ` · ${state.disclaimer}` : ""}</p>}
  </PanelBody></Panel>;
}
