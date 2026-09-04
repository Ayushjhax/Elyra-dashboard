import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A label that floats over a surface rather than sitting in it.

   The frosted plane is reserved for things that are genuinely above the grid —
   a status marker over the hero mark, a tooltip, a sheet header. A pill inside
   a panel is a chip and uses --surface-raised like every other chip; making
   that one translucent too would only blur the rows underneath it.
--------------------------------------------------------------------------- */

export type PillTone = "neutral" | "agent" | "positive" | "negative";

const DOT: Record<PillTone, string> = {
  neutral: "bg-text-muted",
  agent: "bg-agent-accent",
  positive: "bg-positive",
  negative: "bg-negative",
};

const TEXT: Record<PillTone, string> = {
  neutral: "text-text-secondary",
  agent: "text-agent-accent",
  positive: "text-positive",
  negative: "text-negative",
};

const LIFT: Record<PillTone, string> = {
  neutral: "shadow-pop",
  agent: "shadow-lift-agent",
  positive: "shadow-pop",
  negative: "shadow-lift-negative",
};

export function GlassPill({
  tone = "neutral",
  dot = false,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: PillTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-1.5 whitespace-nowrap",
        "glass-raised rounded-pill border px-2.5 py-1",
        TEXT[tone],
        LIFT[tone],
        className,
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("inline-block size-1.5 shrink-0 rounded-pill", DOT[tone])}
        />
      )}
      {children}
    </span>
  );
}
