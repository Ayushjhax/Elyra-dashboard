"use client";

import { useMemo, useRef, useState } from "react";
import { LineChart } from "lucide-react";
import { Card, CardHead, Money, Segmented, Skeleton } from "@/components/portfolio/primitives";
import { usePortfolioHistory } from "@/lib/portfolio/useHistory";
import { formatPct, formatUsd } from "@/lib/format";
import type { PortfolioHistoryPoint } from "@/lib/portfolio/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Net asset value over time.

   Drawn as inline SVG rather than with a charting library. Nothing in the
   repo ships one — the market chart is a TradingView embed — and §"do not
   install large new dependencies" applies: one area path, one axis and a
   crosshair is less code than the adapter around a library would be.

   The series has two possible sources and this panel always says which one
   it drew, because they answer different questions:

   RECORDED — real snapshots of what the portfolio was worth, written on
   every read. True history, including assets since sold. Empty until the
   page has been open a while.

   RECONSTRUCTED — today's holdings valued backwards through real candles.
   This is NOT the user's past balance: it ignores every trade, deposit and
   withdrawal, so it answers "how would what I hold now have moved?". It is
   built from real prices, and it is labelled wherever it appears — the
   caption under the chart says so in plain words rather than in a footnote.

   The third option — interpolating a line from one current balance, or
   synthesising a series from 24h change — is deliberately not implemented.
   A picture of performance that never happened is the most misleading thing
   this page could show.
--------------------------------------------------------------------------- */

const RANGES = [
  { value: "1D", label: "1D" },
  { value: "1W", label: "1W" },
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "1Y", label: "1Y" },
  { value: "ALL", label: "ALL" },
] as const;

type Range = (typeof RANGES)[number]["value"];

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_Y = 12;

interface Plotted {
  x: number;
  y: number;
  point: PortfolioHistoryPoint;
}

function plot(points: PortfolioHistoryPoint[]): {
  path: string;
  area: string;
  plotted: Plotted[];
} {
  if (points.length < 2) return { path: "", area: "", plotted: [] };

  const values = points.map((p) => p.totalValueUsd);
  const min = Math.min(...values);
  const max = Math.max(...values);
  /* A flat series has no range to scale against; centre it rather than
     dividing by zero and drawing a line off the top of the box. */
  const span = max - min || Math.abs(max) || 1;

  const plotted = points.map((point, index) => ({
    x: (index / (points.length - 1)) * VIEW_W,
    y:
      VIEW_H - PAD_Y -
      ((point.totalValueUsd - min) / span) * (VIEW_H - PAD_Y * 2),
    point,
  }));

  const path = plotted
    .map((p, index) => `${index === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(" ");

  return {
    path,
    area: `${path} L${VIEW_W} ${VIEW_H} L0 ${VIEW_H} Z`,
    plotted,
  };
}

function Chart({ points }: { points: PortfolioHistoryPoint[] }) {
  const { path, area, plotted } = useMemo(() => plot(points), [points]);
  const [hover, setHover] = useState<Plotted | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const first = points[0]?.totalValueUsd ?? 0;
  const active = hover ?? plotted[plotted.length - 1] ?? null;
  const delta = active === null ? 0 : active.point.totalValueUsd - first;

  function onMove(event: React.PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (svg === null || plotted.length === 0) return;
    const box = svg.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    const index = Math.round(ratio * (plotted.length - 1));
    setHover(plotted[Math.max(0, Math.min(plotted.length - 1, index))] ?? null);
  }

  return (
    <div className="relative px-3 pb-2 pt-3">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        className="h-32 w-full touch-none"
        role="img"
        /* §40: a chart needs a textual summary. This is the whole series in
           one sentence, which is what a screen reader can actually use. */
        aria-label={`Net asset value, ${points.length} points, from ${formatUsd(first)} to ${formatUsd(points[points.length - 1]?.totalValueUsd ?? first)}.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="elyra-nav-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1="0"
            x2={VIEW_W}
            y1={VIEW_H * fraction}
            y2={VIEW_H * fraction}
            stroke="var(--border-subtle)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        ))}

        <path d={area} fill="url(#elyra-nav-fill)" />
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover !== null && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1="0"
              y2={VIEW_H}
              stroke="var(--border-strong)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={hover.x} cy={hover.y} r="3" fill="var(--accent)" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {active !== null && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="type-label text-text-muted">
            {new Date(active.point.at).toLocaleString("en-GB", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: "UTC",
            })}
          </span>
          <Money value={active.point.totalValueUsd} className="type-data text-text-primary" />
          <span
            className={cn(
              "type-label tabular-nums",
              delta >= 0 ? "text-positive" : "text-negative",
            )}
          >
            {formatUsd(delta, { sign: true })} ({formatPct(first === 0 ? 0 : (delta / first) * 100)})
          </span>
          {active.point.netFlowUsd !== null && active.point.netFlowUsd !== 0 && (
            <span className="type-label text-text-muted">
              Net flow {formatUsd(active.point.netFlowUsd, { sign: true })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function PerformanceCardSkeleton() {
  return (
    <Card>
      <CardHead title="Portfolio Performance" sub="Net asset value across connected accounts" />
      <div className="px-3 pb-3 pt-3">
        <Skeleton className="h-32 w-full rounded-card" />
      </div>
    </Card>
  );
}

export function PerformanceCard({ currentValueUsd }: { currentValueUsd: number | null }) {
  const [range, setRange] = useState<Range>("1M");
  const history = usePortfolioHistory(range);

  const drawable = history.points.length >= 2;

  return (
    <Card className="min-w-0">
      <CardHead
        title="Portfolio Performance"
        sub="Net asset value across connected accounts"
        right={
          <Segmented
            label="Chart period"
            options={RANGES}
            value={range}
            onChange={setRange}
          />
        }
      />

      {history.loading && !drawable ? (
        <div className="px-3 pb-3 pt-3">
          <Skeleton className="h-32 w-full rounded-card" />
        </div>
      ) : drawable ? (
        <>
          <Chart points={history.points} />

          {/* The caption is not a footnote. A reconstruction looks exactly
              like real history, so what it is has to sit under the line
              itself, in words, every time. */}
          <p className="type-label border-t border-border-subtle px-3 py-2 text-text-muted">
            {history.basis === "recorded" ? (
              <>Recorded net asset value, from snapshots taken as you use Elyra.</>
            ) : (
              <>
                <span className="text-accent">Indexed to today&rsquo;s holdings</span> — real
                prices, but this is how what you hold <em>now</em> would have moved. It is not
                your past balance: trades, deposits and withdrawals are not reflected.
                {history.coveragePct > 0 && history.coveragePct < 99 && (
                  <> Covers {history.coveragePct.toFixed(0)}% of portfolio value.</>
                )}
                {history.uncovered.length > 0 && (
                  <> No price history for {history.uncovered.slice(0, 3).join(", ")}.</>
                )}
              </>
            )}
          </p>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <LineChart size={20} strokeWidth={1.5} aria-hidden className="text-text-muted" />
          <p className="type-body-sm text-text-secondary">
            {history.error === null ? "No performance history yet" : "History unavailable"}
          </p>
          <p className="type-label max-w-[40ch] text-balance text-text-muted">
            {history.error ??
              "Nothing held has enough price history to chart over this period, and no balance snapshots have been recorded yet."}
          </p>
          {/* §11: render the current balance as a starting point, so the
              panel still says something true rather than nothing at all. */}
          {currentValueUsd !== null && (
            <p className="type-label mt-1 text-text-muted">
              Starting point ·{" "}
              <Money value={currentValueUsd} className="text-text-secondary" />
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
