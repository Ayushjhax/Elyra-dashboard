"use client";

import type { Bar } from "@/lib/arena/puzzle";
import { HIDDEN_BARS } from "@/lib/arena/puzzle";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   The puzzle's chart: candles on a rebased scale (first close = 100), with
   the hidden bars shown as an empty, labelled region until the answer is in
   — then drawn, behind a divider, so the reveal reads as what came next.
   Plain SVG with the brand's colour tokens; no chart library.
--------------------------------------------------------------------------- */

const STEP = 10;
const HEIGHT = 170;
const PAD = 6;

export function PuzzleChart({ visible, reveal }: { visible: Bar[]; reveal: Bar[] | null }) {
  const t = useT();
  const shown = reveal === null ? visible : [...visible, ...reveal];
  const slots = visible.length + (reveal?.length ?? HIDDEN_BARS);
  const lows = shown.map((bar) => bar.low);
  const highs = shown.map((bar) => bar.high);
  const min = Math.min(...lows);
  const max = Math.max(...highs);
  const span = max - min || 1;
  const y = (value: number) => PAD + ((max - value) / span) * (HEIGHT - PAD * 2);
  const width = slots * STEP;
  const divider = visible.length * STEP;
  const last = visible[visible.length - 1]?.close ?? 100;

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={
        reveal === null
          ? t("A chart of {count} hourly bars, rebased to 100, ending at {last}. The next {HIDDEN_BARS} bars are hidden.", { count: visible.length, last: last.toFixed(2), HIDDEN_BARS })
          : t("The same chart with the next {count} bars revealed, ending at {value}.", { count: reveal.length, value: (reveal[reveal.length - 1]?.close ?? last).toFixed(2) })
      }
      className="h-44 w-full rounded-card border border-border-subtle bg-surface-base"
    >
      {reveal === null && <rect x={divider} y={0} width={width - divider} height={HEIGHT} className="fill-surface-hover" />}
      <line x1={divider} x2={divider} y1={0} y2={HEIGHT} className="stroke-border-strong" strokeDasharray="3 3" strokeWidth={1} />
      {shown.map((bar, index) => {
        const up = bar.close >= bar.open;
        const x = index * STEP + STEP / 2;
        const top = y(Math.max(bar.open, bar.close));
        const bottom = y(Math.min(bar.open, bar.close));
        const revealed = index >= visible.length;
        return (
          <g key={bar.openTime} className={cn(up ? "fill-positive stroke-positive" : "fill-negative stroke-negative", revealed && "opacity-80")}>
            <line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} strokeWidth={1} />
            <rect x={x - STEP * 0.3} y={top} width={STEP * 0.6} height={Math.max(1, bottom - top)} />
          </g>
        );
      })}
    </svg>
  );
}
