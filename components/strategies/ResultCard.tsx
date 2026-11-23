"use client";

import { useId, useMemo, useRef, useState } from "react";
import { DeltaText } from "@/components/ui/DeltaText";
import { formatPriceUsd, formatTimestamp, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { DesignResult } from "@/lib/strategies/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A design's backtest, shown: the equity curve, the figures that matter
   beside buy-and-hold, what the engine thinks of the sample, and the
   recent trades. Every figure is the engine's; none is the AI's.

   The chart is one series, so the card's title names it and there is no
   legend: a 2px line in the up/down colour, a recessive dashed baseline at
   the starting capital, and a crosshair whose readout gives the bar's date
   and equity. Text stays in text tokens.
--------------------------------------------------------------------------- */

const WIDTH = 600;
const HEIGHT = 160;

function EquityChart({ equity, start }: { equity: DesignResult["equity"]; start: number }) {
  const t = useT();
  const titleId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const geometry = useMemo(() => {
    if (equity.length < 2) return null;
    const values = equity.map((point) => point.equity);
    const min = Math.min(start, ...values);
    const max = Math.max(start, ...values);
    const pad = (max - min) * 0.08 || 1;
    const t0 = equity[0].time;
    const t1 = equity[equity.length - 1].time;
    const x = (time: number) => ((time - t0) / Math.max(1, t1 - t0)) * WIDTH;
    const y = (value: number) => 8 + (1 - (value - (min - pad)) / (max - min + 2 * pad)) * (HEIGHT - 16);
    return { points: equity.map((point) => ({ x: x(point.time), y: y(point.equity), point })), baseline: y(start) };
  }, [equity, start]);

  if (geometry === null) return null;
  const last = equity[equity.length - 1];
  const rising = last.equity >= start;
  const path = geometry.points.map((entry, index) => `${index === 0 ? "M" : "L"}${entry.x.toFixed(1)},${entry.y.toFixed(1)}`).join(" ");
  const active = hover === null ? null : geometry.points[hover];

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (box === undefined || box.width === 0) return;
    const at = ((event.clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let index = 1; index < geometry.points.length; index += 1) {
      if (Math.abs(geometry.points[index].x - at) < Math.abs(geometry.points[best].x - at)) best = index;
    }
    setHover(best);
  };

  return (
    <figure className="flex flex-col gap-1" aria-labelledby={titleId}>
      <figcaption id={titleId} className="flex items-baseline justify-between gap-2">
        <span className="type-label text-text-muted">{active === null ? t("Equity, from {start}", { start: formatUsd(start, { decimals: 0 }) }) : formatTimestamp(new Date(active.point.time).toISOString())}</span>
        {active !== null && <span className="type-data-sm text-text-primary">{formatUsd(active.point.equity)}</span>}
      </figcaption>
      <div
        ref={frame}
        role="img"
        aria-label={t("Equity from {start} to {end}", { start: formatUsd(start, { decimals: 0 }), end: formatUsd(last.equity, { decimals: 0 }) })}
        className="relative h-40 touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <line x1={0} x2={WIDTH} y1={geometry.baseline} y2={geometry.baseline} className="stroke-border-strong" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <path d={path} fill="none" className={rising ? "stroke-positive" : "stroke-negative"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {active !== null && <line x1={active.x} x2={active.x} y1={0} y2={HEIGHT} className="stroke-border-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {active !== null && (
          <span
            aria-hidden
            className={cn("pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface-raised", rising ? "bg-positive" : "bg-negative")}
            style={{ left: `${(active.x / WIDTH) * 100}%`, top: `${(active.y / HEIGHT) * 100}%` }}
          />
        )}
      </div>
      <div className="flex justify-between">
        <span className="type-label text-text-muted">{formatTimestamp(new Date(equity[0].time).toISOString())}</span>
        <span className="type-label text-text-muted">{formatTimestamp(new Date(last.time).toISOString())}</span>
      </div>
    </figure>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-card border border-border-subtle bg-surface-base px-2.5 py-2">
      <span className="type-label truncate text-text-muted">{label}</span>
      <span className="type-data min-w-0 truncate text-text-primary">{children}</span>
    </div>
  );
}

const pct = (value: number | null, decimals = 1) => (value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}%`);

/** The few figures that say how a test went, in one line — for lists. */
export function ResultLine({ result }: { result: DesignResult }) {
  const t = useT();
  const { metrics } = result;
  return (
    <span className="type-label flex flex-wrap items-baseline gap-x-2 text-text-muted">
      <DeltaText value={metrics.totalReturnPct} decimals={1} className="type-data-sm" />
      {metrics.benchmarkReturnPct !== null && <span>{t("hold {pct}", { pct: `${metrics.benchmarkReturnPct >= 0 ? "+" : ""}${metrics.benchmarkReturnPct.toFixed(1)}%` })}</span>}
      <span>{t("max drawdown {pct}", { pct: pct(metrics.maxDrawdownPct) })}</span>
      <span>{t("{count} trades", { count: metrics.trades })}</span>
      <span>
        {result.symbol} · {result.timeframe}
      </span>
    </span>
  );
}

export function ResultCard({ result }: { result: DesignResult }) {
  const t = useT();
  const { metrics } = result;
  const thin = result.quality.level === "insufficient_trades" || result.quality.level === "insufficient_data";
  return (
    <section aria-label={t("Backtest result")} className="flex flex-col gap-3 rounded-card border border-border-strong bg-surface-raised p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-body-sm font-medium text-text-primary">
          {t("{symbol} · {timeframe} · last {days} days", { symbol: result.symbol, timeframe: result.timeframe, days: result.days })}
        </span>
        <DeltaText value={metrics.totalReturnPct} decimals={1} className="type-data" />
      </div>
      <EquityChart equity={result.equity} start={result.initialCapitalUsd} />
      <div className="grid grid-cols-4 gap-2 @max-[440px]:grid-cols-2">
        <Stat label={t("Return")}>
          <DeltaText value={metrics.totalReturnPct} decimals={1} />
        </Stat>
        <Stat label={t("Buy and hold")}>{metrics.benchmarkReturnPct === null ? "—" : <DeltaText value={metrics.benchmarkReturnPct} decimals={1} />}</Stat>
        <Stat label={t("Max drawdown")}>{pct(metrics.maxDrawdownPct)}</Stat>
        <Stat label={t("Sharpe")}>{metrics.sharpe === null ? "—" : metrics.sharpe.toFixed(2)}</Stat>
        <Stat label={t("Trades")}>{String(metrics.trades)}</Stat>
        <Stat label={t("Win rate")}>{pct(metrics.winRatePct, 0)}</Stat>
        <Stat label={t("Profit factor")}>{metrics.profitFactor === null ? "—" : metrics.profitFactor.toFixed(2)}</Stat>
        <Stat label={t("Time in market")}>{pct(metrics.exposurePct, 0)}</Stat>
      </div>
      {thin && <p className="type-label text-caution">{t("Too few trades to judge: treat this result as noise.")}</p>}
      {result.quality.issues.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {result.quality.issues.map((issue) => (
            <li key={issue} className="type-label text-caution">
              {issue}
            </li>
          ))}
        </ul>
      )}
      {result.trades.length > 0 && (
        <details className="group rounded-card border border-border-subtle">
          <summary className="type-label cursor-pointer list-none px-2.5 py-2 text-text-secondary hover:text-text-primary">
            {t("Recent trades ({count})", { count: result.trades.length })}
          </summary>
          <ul className="flex flex-col divide-y divide-border-subtle border-t border-border-subtle">
            {result.trades.slice(0, 15).map((trade) => (
              <li key={`${trade.entryTime}-${trade.exitTime}`} className="flex flex-col gap-0.5 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="type-data-sm text-text-primary">
                    {formatPriceUsd(trade.entryPrice)} → {formatPriceUsd(trade.exitPrice)}
                  </span>
                  <DeltaText value={trade.returnPct} decimals={1} className="type-data-sm" />
                </div>
                <span className="type-label truncate text-text-muted">
                  {formatTimestamp(new Date(trade.entryTime).toISOString())} · {trade.exitReason}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="type-label text-text-muted">
        {t("Hypothetical: Binance spot history, long only, signals acted on at the next bar's open, 0.1% fees and 0.1% slippage each way, stops and targets inside the bar. Past results do not predict future ones.")}
      </p>
    </section>
  );
}
