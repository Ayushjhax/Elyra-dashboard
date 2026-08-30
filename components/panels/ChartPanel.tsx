"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CandlestickChart } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Panel } from "@/components/ui/Panel";
import { TRADINGVIEW_SYMBOLS } from "@/lib/mock/assets";
import { useElyraStore } from "@/lib/store";
import type { Interval } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * TradingView's free widget, in its `tv.js` form.
 *
 * The newer `embed-widget-advanced-chart.js` accepts `backgroundColor` and
 * `gridColor` but silently drops `overrides`, which leaves the candles in
 * TradingView's default teal/red — a direct contradiction of the brand's
 * market semantics. `tv.js` honours all four, so the chart can be Sage up and
 * Clay down like every other price in the product.
 */
const TV_SCRIPT = "https://s3.tradingview.com/tv.js";

const INTERVALS: Interval[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

const TV_INTERVAL: Record<Interval, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1H": "60",
  "4H": "240",
  "1D": "D",
  "1W": "W",
};

type TradingViewGlobal = {
  widget: new (config: Record<string, unknown>) => unknown;
};

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

/** Loaded once for the life of the page, however often the chart remounts. */
let scriptPromise: Promise<TradingViewGlobal> | null = null;

function loadTradingView(): Promise<TradingViewGlobal> {
  if (window.TradingView) return Promise.resolve(window.TradingView);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TV_SCRIPT;
    script.async = true;
    script.onload = () =>
      window.TradingView
        ? resolve(window.TradingView)
        : reject(new Error("tv.js loaded without a widget constructor"));
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("tv.js failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** Widget colours come out of the stylesheet, not out of this file. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type Status = "loading" | "ready" | "error";

function IntervalRow() {
  const interval = useElyraStore((state) => state.interval);
  const setInterval = useElyraStore((state) => state.setInterval);

  return (
    <div
      role="group"
      aria-label="Chart interval"
      className="flex shrink-0 items-center gap-1 border-b border-border-subtle px-3 py-1.5"
    >
      {INTERVALS.map((value) => {
        const active = value === interval;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setInterval(value)}
            className={cn(
              "type-data-sm h-6 rounded-pill px-2.5",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              active
                ? "bg-accent text-text-on-accent"
                : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {value}
          </button>
        );
      })}
    </div>
  );
}

export function ChartPanel() {
  const symbol = useElyraStore((state) => state.selectedSymbol);
  const interval = useElyraStore((state) => state.interval);
  const [status, setStatus] = useState<Status>("loading");
  const hostRef = useRef<HTMLDivElement>(null);
  const rawId = useId();
  const containerId = `tv-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;

  const tvSymbol = TRADINGVIEW_SYMBOLS[symbol];
  const mount = `${symbol}-${interval}`;

  /* Reset to the skeleton during render when the chart is about to be rebuilt,
     so the effect only ever reports the outcome. */
  const [mountedFor, setMountedFor] = useState(mount);
  if (mountedFor !== mount) {
    setMountedFor(mount);
    setStatus("loading");
  }

  /* A symbol with no TradingView mapping can never load. */
  const shownStatus: Status = tvSymbol ? status : "error";

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !tvSymbol) return;

    let cancelled = false;
    host.replaceChildren();

    const mountPoint = document.createElement("div");
    mountPoint.id = containerId;
    mountPoint.style.height = "100%";
    mountPoint.style.width = "100%";
    host.appendChild(mountPoint);

    const background = token("--surface-panel");
    const grid = token("--border-subtle");
    const up = token("--positive");
    const down = token("--negative");
    const axisText = token("--text-secondary");

    /* The script loading is not the same as the chart existing — wait for the
       iframe the widget injects, and give up after 10 seconds. The iframe also
       gets tabindex -1 there: the wrapper alone would not stop the embed from
       taking a tab stop and swallowing the keyboard. */
    let settled = false;
    const finish = (next: Status) => {
      if (settled || cancelled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      setStatus(next);
    };

    const observer = new MutationObserver(() => {
      const frame = host.querySelector("iframe");
      if (!frame) return;
      frame.setAttribute("tabindex", "-1");
      frame.setAttribute("title", `${symbol} chart`);
      finish("ready");
    });
    observer.observe(host, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => finish("error"), 10_000);

    loadTradingView()
      .then((TradingView) => {
        if (cancelled) return;
        new TradingView.widget({
          container_id: containerId,
          autosize: true,
          symbol: tvSymbol,
          interval: TV_INTERVAL[interval],
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          backgroundColor: background,
          gridColor: grid,
          toolbar_bg: background,
          hide_top_toolbar: true,
          hide_side_toolbar: true,
          allow_symbol_change: false,
          save_image: false,
          withdateranges: false,
          overrides: {
            "paneProperties.backgroundType": "solid",
            "paneProperties.background": background,
            "paneProperties.vertGridProperties.color": grid,
            "paneProperties.horzGridProperties.color": grid,
            "scalesProperties.backgroundColor": background,
            "scalesProperties.lineColor": grid,
            "scalesProperties.textColor": axisText,
            "mainSeriesProperties.candleStyle.upColor": up,
            "mainSeriesProperties.candleStyle.downColor": down,
            "mainSeriesProperties.candleStyle.borderUpColor": up,
            "mainSeriesProperties.candleStyle.borderDownColor": down,
            "mainSeriesProperties.candleStyle.wickUpColor": up,
            "mainSeriesProperties.candleStyle.wickDownColor": down,
          },
          /* The volume study is a separate colour space from the candles. */
          studies_overrides: {
            "volume.volume.color.0": down,
            "volume.volume.color.1": up,
            "volume.volume.transparency": 62,
          },
        });
      })
      .catch(() => finish("error"));

    return () => {
      cancelled = true;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeout);
      host.replaceChildren();
    };
  }, [tvSymbol, interval, symbol, containerId]);

  return (
    <Panel label={`${symbol} price chart`} className="min-h-0 flex-[1.15_1_0]">
      <IntervalRow />

      <div className="relative min-h-0 flex-1">
        {/* tabindex -1 so the embed never becomes a keyboard trap. */}
        <div
          key={mount}
          ref={hostRef}
          tabIndex={-1}
          aria-label={`${symbol} candlestick chart, ${interval}`}
          role="img"
          className={cn(
            "tradingview-widget-container size-full",
            shownStatus === "ready" ? "opacity-100" : "opacity-0",
          )}
        />

        {shownStatus === "loading" && (
          <div aria-hidden className="absolute inset-0 flex flex-col gap-2 p-4">
            <div className="h-3 w-24 rounded-chip bg-surface-raised" />
            <div className="min-h-0 flex-1 rounded-card border border-border-subtle bg-surface-raised" />
            <div className="flex gap-2">
              <div className="h-3 w-16 rounded-chip bg-surface-raised" />
              <div className="h-3 w-16 rounded-chip bg-surface-raised" />
              <div className="h-3 w-16 rounded-chip bg-surface-raised" />
            </div>
          </div>
        )}

        {shownStatus === "error" && (
          <div className="absolute inset-0">
            <EmptyState
              icon={CandlestickChart}
              title="Chart unavailable"
              body={`The ${symbol} chart did not load. Check the connection and reselect the market, or switch interval to retry.`}
            />
          </div>
        )}
      </div>
    </Panel>
  );
}
