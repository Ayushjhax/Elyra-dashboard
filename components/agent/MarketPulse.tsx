"use client";

import { useEffect, useMemo, useState } from "react";
import type { PulseResponse } from "@/app/api/market/pulse/route";
import { CoinMark } from "@/components/ui/CoinMark";
import { DeltaText } from "@/components/ui/DeltaText";
import { formatCompactUsd, formatPct, formatPriceUsd } from "@/lib/format";
import type { PulseRow } from "@/lib/market/pulse";
import { useTickerLogos } from "@/lib/market/tickerLogos";
import { useAssets, useAssetsBySymbols, usePrices } from "@/lib/market/usePrices";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   What the market is doing, for the Signals view.

   - YOUR WATCHLIST: every market on it, live from Pyth — price, the day's
     move, where it sits in its 24h range, and how far it is from its EMA.
   - THE HYPERLIQUID BOARD: every perpetual on the venue, ranked five ways —
     what moved, where funding is stretched, where the open interest and the
     volume are (lib/market/pulse.ts).

   Picking a row puts that market on the chart, where Elyra knows it.
--------------------------------------------------------------------------- */

const REFRESH_MS = 30_000;

/* ---- Watchlist ---- */

export function WatchlistPulse() {
  const watchlist = useElyraStore((state) => state.watchlist);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);
  const { assets } = useAssets(watchlist);
  const ids = useMemo(() => assets.map((asset) => asset.id), [assets]);
  const feed = usePrices(ids);

  if (assets.length === 0) return null;

  return (
    <section aria-label="Your watchlist, live" className="mt-5">
      <p className="type-eyebrow text-text-muted">Your watchlist · live</p>
      <ul className="mt-2 list-none overflow-hidden rounded-card border border-border-subtle">
        {assets.map((asset) => {
          const row = feed.rows.get(asset.id);
          const range =
            row && row.high24h !== null && row.low24h !== null && row.high24h > row.low24h
              ? Math.min(Math.max((row.price - row.low24h) / (row.high24h - row.low24h), 0), 1)
              : null;
          const ema = row && row.emaPrice > 0 ? ((row.price - row.emaPrice) / row.emaPrice) * 100 : null;
          return (
            <li key={asset.id} className="border-t border-border-subtle first:border-t-0">
              <button
                type="button"
                onClick={() => setSelectedAssetId(asset.id)}
                aria-current={asset.id === selectedAssetId ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                  "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                  asset.id === selectedAssetId && "bg-surface-raised",
                )}
              >
                <CoinMark symbol={asset.symbol} logo={asset.logo} size={26} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="type-data text-text-primary">{asset.symbol}</span>
                    <span className="type-data text-text-primary">{row ? formatPriceUsd(row.price) : "—"}</span>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    {/* Where the price sits between today's low and high. */}
                    <span
                      aria-label={range === null ? "24h range unavailable" : `${Math.round(range * 100)}% up its 24h range`}
                      className="relative h-1 flex-1 rounded-pill bg-surface-hover"
                    >
                      {range !== null && (
                        <span
                          aria-hidden
                          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-pill bg-text-primary"
                          style={{ left: `${range * 100}%` }}
                        />
                      )}
                    </span>
                    {row?.change24hPct != null ? (
                      <DeltaText value={row.change24hPct} className="type-data-sm w-14 shrink-0 text-right" />
                    ) : (
                      <span className="type-data-sm w-14 shrink-0 text-right text-text-muted">—</span>
                    )}
                  </span>
                  {ema !== null && (
                    <span className="type-label mt-0.5 block text-text-muted">
                      {formatPct(Math.abs(ema), { sign: false })} {ema >= 0 ? "above" : "below"} its EMA
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ---- Hyperliquid board ---- */

type BoardView = "gainers" | "losers" | "funding" | "openInterest" | "volume";

const VIEWS: Array<{ id: BoardView; label: string }> = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "funding", label: "Funding" },
  { id: "openInterest", label: "Open interest" },
  { id: "volume", label: "Volume" },
];

function metric(view: BoardView, row: PulseRow): number {
  switch (view) {
    case "gainers":
    case "losers":
      return row.change24hPct ?? 0;
    case "funding":
      return row.fundingAprPct ?? 0;
    case "openInterest":
      return row.openInterestUsd ?? 0;
    case "volume":
      return row.volume24hUsd ?? 0;
  }
}

function metricText(view: BoardView, row: PulseRow): string {
  switch (view) {
    case "gainers":
    case "losers":
      return formatPct(row.change24hPct ?? 0, { decimals: 1 });
    case "funding":
      return `${formatPct(row.fundingAprPct ?? 0, { decimals: 1 })} APR`;
    case "openInterest":
      return formatCompactUsd(row.openInterestUsd ?? 0);
    case "volume":
      return formatCompactUsd(row.volume24hUsd ?? 0);
  }
}

export function PulseBoard({ onAsk }: { onAsk: (prompt: string) => void }) {
  const [view, setView] = useState<BoardView>("gainers");
  const [state, setState] = useState<{ data: PulseResponse | null; failed: boolean }>({ data: null, failed: false });
  const setSelectedAssetId = useElyraStore((state) => state.setSelectedAssetId);

  useEffect(() => {
    let cancelled = false;
    const tick = () =>
      void fetch("/api/market/pulse")
        .then((response) => response.json() as Promise<PulseResponse>)
        .then((data) => {
          if (!cancelled) setState({ data, failed: data.pulse === null });
        })
        .catch(() => {
          if (!cancelled) setState((current) => ({ ...current, failed: true }));
        });
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const pulse = state.data?.pulse ?? null;
  const rows = useMemo(() => {
    if (pulse === null) return [];
    if (view === "funding") return [...pulse.fundingHigh.slice(0, 5), ...pulse.fundingLow.slice(0, 5)];
    return pulse[view];
  }, [pulse, view]);

  const symbols = useMemo(() => (pulse ? [...new Set(Object.values(pulse).flatMap((value) => (Array.isArray(value) ? value.map((row) => row.symbol) : [])))] : []), [pulse]);
  const logoFor = useTickerLogos(symbols);
  const assets = useAssetsBySymbols(symbols);
  const max = Math.max(1e-9, ...rows.map((row) => Math.abs(metric(view, row))));
  /* In the funding view the list is two lists: who pays most each way. */
  const firstShortPays = view === "funding" ? rows.findIndex((row) => (row.fundingAprPct ?? 0) < 0) : -1;

  return (
    <section aria-label="Hyperliquid board" className="mt-5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="type-eyebrow text-text-muted">Hyperliquid board</p>
        {pulse && (
          <span className="type-label truncate text-text-muted">
            {pulse.markets} perps · {formatCompactUsd(pulse.totalOpenInterestUsd)} OI · {formatCompactUsd(pulse.totalVolumeUsd)} 24h
          </span>
        )}
      </div>

      <div role="radiogroup" aria-label="Rank by" className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="radio"
            aria-checked={view === entry.id}
            onClick={() => setView(entry.id)}
            className={cn(
              "type-label h-7 shrink-0 whitespace-nowrap rounded-pill border px-2.5",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              view === entry.id
                ? "border-accent-quiet bg-surface-active text-text-primary"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {pulse === null ? (
        state.failed ? (
          <p className="type-body-sm mt-2 text-text-secondary">Hyperliquid could not be read just now.</p>
        ) : (
          <div aria-busy="true" aria-label="Loading the board" className="mt-2 space-y-1.5">
            {[0, 1, 2, 3, 4].map((row) => (
              <div key={row} className="skeleton h-10 rounded-control" />
            ))}
          </div>
        )
      ) : rows.length === 0 ? (
        <p className="type-body-sm mt-2 text-text-secondary">Nothing stretched right now — every liquid market is near the resting rate.</p>
      ) : (
        <ol className="mt-1.5 list-none overflow-hidden rounded-card border border-border-subtle">
          {rows.map((row, index) => {
            const value = metric(view, row);
            const tone =
              view === "openInterest" || view === "volume" ? "neutral" : value >= 0 ? "positive" : "negative";
            const asset = assets.get(row.symbol.toUpperCase());
            const mark = logoFor(row.symbol);
            return (
              <li key={`${view}-${row.symbol}`} className="border-t border-border-subtle first:border-t-0">
                {view === "funding" && index === 0 && (row.fundingAprPct ?? 0) > 0 && (
                  <p className="type-label bg-surface-raised px-3 py-1 text-text-muted">Longs paying most</p>
                )}
                {index === firstShortPays && (
                  <p className="type-label bg-surface-raised px-3 py-1 text-text-muted">Shorts paying most</p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    asset
                      ? setSelectedAssetId(asset.id)
                      : onAsk(`What is driving ${row.symbol} on Hyperliquid right now?`)
                  }
                  title={asset ? `Show ${row.symbol} on the chart` : `Ask Elyra about ${row.symbol}`}
                  className="relative flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
                >
                  {/* The row's share of the list's largest value, as a fill. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-y-0 left-0",
                      tone === "positive" ? "bg-positive-bg" : tone === "negative" ? "bg-negative-bg" : "bg-surface-raised",
                    )}
                    style={{ width: `${(Math.abs(value) / max) * 100}%` }}
                  />
                  <span className="type-data-sm relative w-4 shrink-0 text-text-muted">{index + 1}</span>
                  <CoinMark symbol={row.symbol} logo={mark.logo} fallbackLogo={mark.fallbackLogo} size={24} className="relative" />
                  <span className="relative min-w-0 flex-1">
                    <span className="type-data block text-text-primary">{row.symbol}</span>
                    <span className="type-label block truncate text-text-muted">
                      {formatPriceUsd(row.markPrice)}
                      {view !== "gainers" && view !== "losers" && row.change24hPct !== null
                        ? ` · ${formatPct(row.change24hPct, { decimals: 1 })} 24h`
                        : ""}
                      {row.maxLeverage ? ` · ${row.maxLeverage}x` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "type-data relative shrink-0",
                      tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-text-primary",
                    )}
                  >
                    {metricText(view, row)}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <p className="type-label mt-1.5 text-text-muted">
        Movers and funding rank markets with over $1M of 24h volume. Funding is annualised from Hyperliquid&rsquo;s hourly rate.
      </p>
    </section>
  );
}
