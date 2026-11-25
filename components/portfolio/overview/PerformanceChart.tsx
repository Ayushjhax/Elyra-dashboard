"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatTimestamp } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The performance line: equity, net PnL or return over one window.

   One series in the up/down colour (Sage when it ends at or above where it
   began, Clay below) and, on Return %, the benchmark as a quiet dashed line
   in a text tone, so the two never compete. A dashed baseline at zero for
   PnL and return; equity has none, since its floor is not zero's business.
   The crosshair's readout gives the time and both values. Text stays in text
   tokens; only the line carries colour (NavChart's rule).

   A point whose interval was a gap is drawn — the equity is real — but the
   readout says so, and the PnL and return simply do not move across it.
--------------------------------------------------------------------------- */

const WIDTH = 600;
const HEIGHT = 220;
const PAD = { top: 12, bottom: 12 };

export interface ChartPoint {
  at: string;
  value: number;
  /** False when the interval ending here could not be measured. */
  known?: boolean;
}

export function PerformanceChart({
  series,
  benchmark,
  benchmarkLabel,
  format,
  baseline,
  label,
  empty,
  className,
}: {
  series: readonly ChartPoint[];
  benchmark?: readonly ChartPoint[];
  benchmarkLabel?: string;
  format: (value: number) => string;
  /** Where the dashed line sits; null for none. */
  baseline: number | null;
  /** What the line is, for assistive tech: "Net PnL". */
  label: string;
  /** Shown when there are fewer than two points. */
  empty: string;
  className?: string;
}) {
  const t = useT();
  const titleId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    const bench = benchmark ?? [];
    const values = [...series.map((point) => point.value), ...bench.map((point) => point.value), ...(baseline === null ? [] : [baseline])];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.02 || 1;
    const lo = min - pad;
    const hi = max + pad;
    const t0 = Date.parse(series[0].at);
    const t1 = Date.parse(series[series.length - 1].at);
    const x = (at: string) => ((Date.parse(at) - t0) / Math.max(1, t1 - t0)) * WIDTH;
    const y = (value: number) => PAD.top + (1 - (value - lo) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom);
    const path = (points: readonly ChartPoint[]) =>
      points
        .filter((point) => Date.parse(point.at) >= t0 && Date.parse(point.at) <= t1)
        .map((point, index) => `${index === 0 ? "M" : "L"}${x(point.at).toFixed(1)},${y(point.value).toFixed(1)}`)
        .join(" ");
    return {
      points: series.map((point) => ({ x: x(point.at), y: y(point.value), point })),
      line: path(series),
      bench: bench.length >= 2 ? path(bench) : null,
      baseline: baseline === null ? null : y(baseline),
    };
  }, [series, benchmark, baseline]);

  if (geometry === null) {
    return (
      <div className={cn("flex h-56 items-center justify-center rounded-card border border-dashed border-border-subtle", className)}>
        <p className="type-label max-w-[40ch] px-4 text-center text-text-muted">{empty}</p>
      </div>
    );
  }

  const first = series[0];
  const last = series[series.length - 1];
  const rising = last.value >= (baseline ?? first.value);
  const active = hover === null ? null : geometry.points[hover];
  /* The benchmark's value at the hovered time: its last point at or before it. */
  const benchAt = (at: string): number | null => {
    if (!benchmark || benchmark.length === 0) return null;
    const time = Date.parse(at);
    let found: number | null = null;
    for (const point of benchmark) {
      if (Date.parse(point.at) <= time) found = point.value;
      else break;
    }
    return found;
  };

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

  const hoveredBench = active === null ? null : benchAt(active.point.at);

  return (
    <figure className={cn("flex flex-col gap-1.5", className)} aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        {t("{label} from {from} to {to}: from {start} to {end}.", {
          label,
          from: formatTimestamp(first.at, t.locale),
          to: formatTimestamp(last.at, t.locale),
          start: format(first.value),
          end: format(last.value),
        })}
      </figcaption>
      <div className="flex min-h-5 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="type-label text-text-muted">{active === null ? formatTimestamp(last.at, t.locale) : formatTimestamp(active.point.at, t.locale)}</span>
        <span className="type-data-sm flex flex-wrap items-baseline gap-x-3 text-text-primary">
          <span>
            {format((active ?? geometry.points[geometry.points.length - 1]).point.value)}
            {active !== null && active.point.known === false && <span className="text-text-muted"> · {t("deposits unknown here")}</span>}
          </span>
          {benchmarkLabel !== undefined && (active === null ? benchmark?.at(-1)?.value : hoveredBench) != null && (
            <span className="text-text-muted">
              {benchmarkLabel} {format((active === null ? benchmark?.at(-1)?.value : hoveredBench) as number)}
            </span>
          )}
        </span>
      </div>
      <div
        ref={frame}
        className="relative h-56 touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={t("{label}, now {value}", { label, value: format(last.value) })}
      >
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {geometry.baseline !== null && (
            <line x1={0} x2={WIDTH} y1={geometry.baseline} y2={geometry.baseline} className="stroke-border-strong" strokeWidth={1} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          )}
          {geometry.bench !== null && (
            <path d={geometry.bench} fill="none" className="stroke-text-muted" strokeWidth={1.5} strokeDasharray="4 3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          )}
          <path d={geometry.line} fill="none" className={rising ? "stroke-positive" : "stroke-negative"} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
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
        <span className="type-label text-text-muted">{formatTimestamp(first.at, t.locale)}</span>
        <span className="type-label text-text-muted">{formatTimestamp(last.at, t.locale)}</span>
      </div>
    </figure>
  );
}
