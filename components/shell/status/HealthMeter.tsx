"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Health } from "@/lib/wallet/health";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The health bars.

   Four stacked bars of increasing height, filled in proportion to the score,
   with the figure beside them. The tooltip names the weakest upstream, which
   is the part that makes the indicator worth having: "82%" tells you
   something is wrong, "Solana RPC is slow to answer (940ms)" tells you what.

   The score comes from `lib/wallet/health.ts` and is computed, never assumed.
--------------------------------------------------------------------------- */

const BARS = 4;

/** Tallest last, so the meter reads left to right as "more". */
const HEIGHTS = ["h-1.5", "h-2", "h-2.5", "h-3"] as const;

const TONE = {
  positive: { fill: "bg-positive", text: "text-positive" },
  warning: { fill: "bg-accent", text: "text-accent" },
  negative: { fill: "bg-negative", text: "text-negative" },
  /* Nothing has reported. The bars are drawn empty rather than coloured,
     because an unknown state is not a healthy one and not a failed one. */
  unknown: { fill: "bg-text-muted", text: "text-text-muted" },
} as const;

export function HealthMeter({ health, className }: { health: Health; className?: string }) {
  const { score, tone, reason } = health;
  const toneClass = TONE[tone];

  /* Bars light up in whole units — a bar is on when the score reaches its
     share of 100. Ceil rather than round so any non-zero score lights at
     least one bar: "3%" with four dark bars reads as "no data", which is a
     different and much less alarming claim than the one being made. */
  const lit = score === null ? 0 : Math.min(BARS, Math.ceil((score / 100) * BARS));

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn("flex items-end gap-1.5", className)}
          role="meter"
          aria-valuenow={score ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`System health: ${reason}`}
        >
          <div aria-hidden className="flex items-end gap-0.5">
            {HEIGHTS.map((height, index) => (
              <span
                key={height}
                className={cn(
                  "w-1 rounded-[1px] transition-colors duration-[var(--dur-base)] ease-brand",
                  height,
                  index < lit ? toneClass.fill : "bg-surface-hover",
                )}
              />
            ))}
          </div>
          {score === null ? (
            /* Same width as "100%", so nothing shifts when the score lands. */
            <span className="skeleton h-4 w-[4ch]" aria-hidden />
          ) : (
            <span className={cn("type-mono-addr tabular-nums", toneClass.text)}>
              {score}%
            </span>
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{reason}</TooltipContent>
    </Tooltip>
  );
}
