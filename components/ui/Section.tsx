"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   A card that folds to its header.

   Every module in the workspace is one of these: the three widgets on the
   left, and Trading activity and Automation under the chart. The header is
   always reachable — it is the toggle, and it is where each module's own
   controls live — and folding hides the body without unmounting it, so a
   search half typed into the watchlist or a scroll position in Activity is
   still there when the card opens again.
--------------------------------------------------------------------------- */

export function Section({
  title,
  icon,
  meta,
  actions,
  open,
  onOpenChange,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  /** A count or a status beside the title. Short. */
  meta?: React.ReactNode;
  /** Controls on the right of the header. Not inside the toggle. */
  actions?: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const bodyId = useId();
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-col rounded-panel border border-border-subtle bg-surface-panel",
        className,
      )}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 pl-2 pr-2">
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            id={titleId}
            aria-expanded={open}
            aria-controls={bodyId}
            onClick={() => onOpenChange(!open)}
            className={cn(
              "metallic flex h-9 w-full min-w-0 items-center gap-2 rounded-control px-1.5 text-left",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
            )}
          >
            {icon && <span className="shrink-0 text-text-muted">{icon}</span>}
            <span className="type-panel-title truncate text-text-primary">{title}</span>
            {meta !== undefined && meta !== null && (
              <span className="type-label shrink-0 text-text-muted">{meta}</span>
            )}
            <ChevronDown
              size={16}
              strokeWidth={1.5}
              aria-hidden
              className={cn(
                "ml-auto shrink-0 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
                !open && "-rotate-90",
              )}
            />
          </button>
        </h2>
        {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
      </header>

      <div
        id={bodyId}
        hidden={!open}
        className={cn("min-h-0 border-t border-border-subtle", bodyClassName)}
      >
        {children}
      </div>
    </section>
  );
}

/** A small square control for a section header: move, add, close. */
export function SectionControl({
  label,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "metallic inline-flex size-8 items-center justify-center rounded-control text-text-muted",
        "transition-colors duration-[var(--dur-fast)] ease-brand",
        "hover:bg-surface-hover hover:text-text-primary",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
