import { AmbientGlow, type GlowTone } from "@/components/ui/Glow";
import { cn } from "@/lib/utils";

/**
 * Every panel in the terminal: --surface-panel, 1px --border-subtle,
 * --radius-panel, and a column layout whose body scrolls on its own so the
 * page itself never does.
 *
 * The luminance layer (1.6) adds two things on top of that. Every panel gets
 * `rim` — a hairline of Ivory across its top edge, so a column of panels reads
 * as lit from above instead of as flat cut-outs. Passing `glow` adds a bloom
 * of that tone behind the panel's own surface, which is reserved for panels
 * that are mostly empty or mostly agent output; a dense table gets the rim and
 * nothing else.
 */
export function Panel({
  label,
  glow,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { label: string; glow?: GlowTone }) {
  return (
    <section
      role="region"
      aria-label={label}
      className={cn(
        "relative isolate flex min-h-0 min-w-0 flex-col overflow-hidden",
        "rim rounded-panel border border-border-subtle bg-surface-panel",
        className,
      )}
      {...props}
    >
      {glow && (
        <AmbientGlow
          tone={glow}
          breathe
          /* Bottom-anchored, wider than the panel and mostly below it. How far
             below is a contrast decision, not a taste one: 1.5's floor is
             --text-muted on --surface-panel, and a bloom lightens the surface
             under it. At this offset the tail crossing the bottom edge peaks
             near alpha 0.045, which holds muted text at 4.5:1. Moving the core
             up brightens the wash and breaks that. */
          className="-bottom-[60%] left-1/2 h-[80%] w-[120%] -translate-x-1/2"
        />
      )}
      {children}
    </section>
  );
}

/**
 * Sticky panel header. Sits above the panel's own scroll area, so it stays put
 * while the body moves under it.
 */
export function PanelHeader({
  className,
  children,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "sticky top-0 z-10 flex shrink-0 items-center justify-between gap-2",
        "h-11 border-b border-border-subtle bg-surface-panel px-3",
        className,
      )}
      {...props}
    >
      {children}
    </header>
  );
}

/** The scrolling region of a panel. */
export function PanelBody({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden", className)}
      {...props}
    >
      {children}
    </div>
  );
}
