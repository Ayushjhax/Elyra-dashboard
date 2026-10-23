import { cn } from "@/lib/utils";

/**
 * Every panel in the terminal: --surface-panel, 1px --border-subtle,
 * --radius-panel, and a column layout whose body scrolls on its own.
 *
 * Flat, as section 3 of the brand doc asks: elevation is surface value plus a
 * border, never light or shadow.
 */
export function Panel({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { label: string }) {
  return (
    <section
      role="region"
      aria-label={label}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        "rounded-panel border border-border-subtle bg-surface-panel",
        className,
      )}
      {...props}
    >
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
        "h-12 border-b border-border-subtle bg-surface-panel px-4",
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
