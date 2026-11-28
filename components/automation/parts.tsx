"use client";

import { marketFor } from "@/lib/autotrade/rules";
import type { RuleMode } from "@/lib/autotrade/rules";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* ---------------------------------------------------------------------------
   The pieces every view of the Automation drawer is built from, so its six
   views read as one: a field, a pair of fields that stacks where the drawer
   is too narrow to hold both, a subsection heading, a problem, and the
   Paper / Live chip a rule, an order and a trade all carry.
--------------------------------------------------------------------------- */

export const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-3",
  "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
  "aria-[invalid=true]:border-negative",
);

export const marketLabel = (coin: string) => marketFor(coin)?.label ?? coin;

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="type-label text-text-secondary">
      {children}
    </label>
  );
}

/** A labelled control, with its hint or its problem under it. */
export function Field({
  id,
  label,
  hint,
  problem,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  problem?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {problem ? (
        <p id={`${id}-problem`} className="type-label text-negative">
          {problem}
        </p>
      ) : hint ? (
        <p className="type-label text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Two related fields side by side; one above the other where there is too
 * little room for both. Measured on the pair's own width, not the drawer's:
 * a card's padding is what decides whether a label fits. Under 280px — a
 * 320px phone — a label like "Take-profit (% from fill)" would wrap.
 */
export function Pair({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="@container">
      <div className={cn("grid grid-cols-1 gap-x-3 gap-y-3 @[17.5rem]:grid-cols-2", className)}>{children}</div>
    </div>
  );
}

/** A subsection inside a card: its heading and one line saying what it is for. */
export function Subhead({ title, children, id }: { title: string; children?: React.ReactNode; id?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 id={id} className="type-panel-title text-text-primary">
        {title}
      </h3>
      {children !== undefined && <p className="type-label text-text-secondary">{children}</p>}
    </div>
  );
}

export function Divider() {
  return <hr className="border-0 border-t border-border-subtle" />;
}

export function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

/** Paper or live, the same chip wherever a rule, an order or a trade says which. */
export function ModeChip({ mode, network }: { mode: RuleMode; network?: string | null }) {
  const t = useT();
  return (
    <span
      className={cn(
        "type-label inline-flex h-6 shrink-0 items-center rounded-chip border px-2",
        mode === "live" ? "border-accent text-text-primary" : "border-border-subtle text-text-secondary",
      )}
    >
      {mode === "live" ? (network ? t("Live · {network}", { network }) : t("Live")) : t("Paper")}
    </span>
  );
}
