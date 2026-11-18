"use client";

import { useId, useMemo, useRef, useState } from "react";
import { formatPct, formatTimestamp, formatUsd } from "@/lib/format";
import type { FundMarkPoint } from "@/lib/funds/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A fund's NAV per unit over its life — one series, so the card's title
   names it and there is no legend. A 2px line in the up/down colour (Sage
   for a fund above its start, Clay below), a recessive dashed baseline at
   100 (where every fund starts), and a crosshair whose readout gives the
   hour's NAV, NAV per unit and return. Text stays in text tokens; only the
   line carries colour. NAV per unit, not NAV, so money moving in or out
   never draws as performance.
--------------------------------------------------------------------------- */

const WIDTH = 600;
const HEIGHT = 180;
const PAD = { top: 10, bottom: 10 };

export function NavChart({ marks, className }: { marks: readonly FundMarkPoint[]; className?: string }) {
  const titleId = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const geometry = useMemo(() => {
    if (marks.length < 2) return null;
    const values = marks.map((mark) => mark.npu);
    const min = Math.min(100, ...values);
    const max = Math.max(100, ...values);
    const pad = (max - min) * 0.08 || 1;
    const lo = min - pad;
    const hi = max + pad;
    const t0 = Date.parse(marks[0].at);
    const t1 = Date.parse(marks[marks.length - 1].at);
    const x = (at: string) => ((Date.parse(at) - t0) / Math.max(1, t1 - t0)) * WIDTH;
    const y = (npu: number) => PAD.top + (1 - (npu - lo) / (hi - lo)) * (HEIGHT - PAD.top - PAD.bottom);
    return {
      points: marks.map((mark) => ({ x: x(mark.at), y: y(mark.npu), mark })),
      baseline: y(100),
      hi: max,
      lo: min,
    };
  }, [marks]);

  if (geometry === null) {
    return (
      <div className={cn("flex h-32 items-center justify-center rounded-card border border-dashed border-border-subtle", className)}>
        <p className="type-label px-4 text-center text-text-muted">The chart starts once the fund has two hourly marks.</p>
      </div>
    );
  }

  const last = marks[marks.length - 1];
  const rising = last.npu >= 100;
  const path = geometry.points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
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
    <figure className={cn("flex flex-col gap-1.5", className)} aria-labelledby={titleId}>
      <figcaption id={titleId} className="sr-only">
        NAV per unit from {formatTimestamp(marks[0].at)} to {formatTimestamp(last.at)}: from {marks[0].npu.toFixed(2)} to {last.npu.toFixed(2)}, high {geometry.hi.toFixed(2)}, low {geometry.lo.toFixed(2)}.
      </figcaption>
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-label text-text-muted">
          {active === null ? (
            <>
              High <span className="type-data-sm text-text-secondary">{geometry.hi.toFixed(2)}</span> · Low{" "}
              <span className="type-data-sm text-text-secondary">{geometry.lo.toFixed(2)}</span>
            </>
          ) : (
            formatTimestamp(active.mark.at)
          )}
        </span>
        {active !== null && (
          <span className="type-data-sm text-text-primary">
            {formatUsd(active.mark.nav)} · {active.mark.npu.toFixed(2)} <span className="text-text-muted">({formatPct(active.mark.npu - 100)})</span>
          </span>
        )}
      </div>
      <div
        ref={frame}
        className="relative h-44 touch-none select-none"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`NAV per unit, now ${last.npu.toFixed(2)}`}
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
        <span className="type-label pointer-events-none absolute right-0 text-text-muted" style={{ top: `calc(${(geometry.baseline / HEIGHT) * 100}% - 1.1rem)` }}>
          100 · start
        </span>
      </div>
      <div className="flex justify-between">
        <span className="type-label text-text-muted">{formatTimestamp(marks[0].at)}</span>
        <span className="type-label text-text-muted">{formatTimestamp(last.at)}</span>
      </div>
    </figure>
  );
}
