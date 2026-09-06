"use client";

import { Clock as ClockIcon } from "lucide-react";
import { formatClock12 } from "@/lib/format";
import { useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The wall clock.

   `useSecond` rather than `useState` + `setInterval`, for two reasons. One
   timer serves every mounted clock instead of one each. And its server
   snapshot is null, so the server renders a placeholder and only the browser
   renders a time — a clock rendered on the server would hydrate against a
   different second and mismatch on every load.

   It ticks every second though only the minute is shown: the alternative is
   computing the delay to the next minute boundary, which drifts when the tab
   is throttled and is a lot of machinery to save 59 assignments a minute.
--------------------------------------------------------------------------- */

export function Clock({ className }: { className?: string }) {
  const at = useSecond();

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <ClockIcon size={16} strokeWidth={1.5} aria-hidden className="text-accent-quiet" />
      {at === null ? (
        /* Exactly the width the time will occupy — 7 tabular characters — so
           the group does not shift when the clock arrives. */
        <span className="skeleton h-4 w-[7ch]" aria-hidden />
      ) : (
        <time
          /* Machine-readable value, so the string a screen reader announces
             is not the only record of what this said. */
          dateTime={new Date(at).toISOString()}
          className="type-mono-addr tabular-nums text-text-secondary"
        >
          {formatClock12(at)}
        </time>
      )}
    </div>
  );
}
