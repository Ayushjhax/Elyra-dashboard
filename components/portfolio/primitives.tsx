"use client";

import { useId, useState } from "react";
import { Info } from "lucide-react";
import { formatPct, formatUsd } from "@/lib/format";
import { useElyraStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The pieces every portfolio surface is built from.

   Three ideas live here rather than in each component, because getting any
   of them wrong in one place and right in another is worse than getting it
   wrong everywhere:

   1. A missing number renders as an em dash WITH a reason. `<Money value={null}
      reason="…" />` is the only way to draw an absent figure, so no surface
      can quietly show 0.00 for something nobody could read.

   2. Privacy masks figures and nothing else. The mask is applied here, so a
      component added later cannot forget it.

   3. Positive is Sage and negative is Clay — never lime. Lime is scarce and
      means interaction: a selected period, the active tab, a focus ring. A
      page where every gain glows lime has spent the one colour that was
      supposed to mean "you can press this".
--------------------------------------------------------------------------- */

/** ▒ repeated. Fixed width so masking does not reflow the row. */
const MASK = "▒▒▒▒▒▒";

export function useBalancesHidden(): boolean {
  return useElyraStore((state) => state.balancesHidden);
}

/**
 * A USD figure, or an explained absence.
 *
 * `reason` is required whenever the value can be null — the type does not
 * enforce it, but every call site in this directory passes one, and a review
 * that finds a bare dash should ask for it.
 */
export function Money({
  value,
  reason,
  sign = false,
  compact = false,
  decimals = 2,
  className,
}: {
  value: number | null;
  reason?: string;
  sign?: boolean;
  compact?: boolean;
  decimals?: number;
  className?: string;
}) {
  const hidden = useBalancesHidden();

  if (value === null) {
    return (
      <span
        className={cn("text-text-muted", className)}
        title={reason}
        aria-label={reason ? `Unavailable: ${reason}` : "Unavailable"}
      >
        —
      </span>
    );
  }

  if (hidden) {
    return (
      <span className={cn("text-text-muted", className)} aria-label="Hidden">
        {MASK}
      </span>
    );
  }

  /* A balance worth less than the smallest step shown is not zero, and
     printing "$0.00" for it says it is. */
  const step = 10 ** -decimals;
  const text =
    value !== 0 && Math.abs(value) < step
      ? `${value < 0 ? "-" : sign ? "+" : ""}<$${step.toFixed(decimals)}`
      : compact
        ? `${value < 0 ? "-" : sign ? "+" : ""}$${Math.abs(value).toLocaleString("en-US", {
            notation: "compact",
            maximumFractionDigits: 1,
          })}`
        : formatUsd(value, { decimals, sign });

  return <span className={cn("tabular-nums", className)}>{text}</span>;
}

/** A token quantity. Precision rises for small balances, never past 8. */
export function Quantity({ value, className }: { value: number; className?: string }) {
  const hidden = useBalancesHidden();
  if (hidden) return <span className={cn("text-text-muted", className)}>{MASK}</span>;

  const abs = Math.abs(value);
  const decimals = abs === 0 ? 2 : abs >= 1000 ? 2 : abs >= 1 ? 4 : abs >= 0.0001 ? 6 : 8;
  return (
    <span className={cn("tabular-nums", className)}>
      {value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}

/**
 * A signed percentage, coloured by direction.
 *
 * `label` carries the direction for anyone who cannot use the colour — §40
 * and §16 both require that positive and negative never rest on hue alone.
 * The sign in front of the number does that job here, which is why it is
 * never suppressed.
 */
export function Delta({
  pct,
  usd,
  reason,
  className,
}: {
  pct: number | null;
  usd?: number | null;
  reason?: string;
  className?: string;
}) {
  const hidden = useBalancesHidden();

  if (pct === null && (usd === null || usd === undefined)) {
    return (
      <span className={cn("text-text-muted", className)} title={reason}>
        —
      </span>
    );
  }

  const direction = (pct ?? usd ?? 0) >= 0;

  return (
    <span
      className={cn(
        "tabular-nums",
        direction ? "text-positive" : "text-negative",
        className,
      )}
    >
      {usd !== undefined && usd !== null && !hidden && (
        <>{formatUsd(usd, { sign: true })} </>
      )}
      {pct !== null && formatPct(pct)}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Surfaces
--------------------------------------------------------------------------- */

/**
 * A portfolio card.
 *
 * `--surface-panel` on `--border-subtle` at `--radius-card`, which is the
 * shell's own card and not a new one. No shadow: §34 asks for almost none,
 * and the hairline already separates a card from the ground.
 */
export function Card({
  className,
  children,
  ...props
}: React.ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col rounded-card border border-border-subtle bg-surface-panel",
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHead({
  title,
  sub,
  right,
  className,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex items-start justify-between gap-2 border-b border-border-subtle px-3 py-2.5",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 className="type-panel-title truncate text-text-primary">{title}</h2>
        {sub !== undefined && (
          <p className="type-label truncate text-text-muted">{sub}</p>
        )}
      </div>
      {right !== undefined && <div className="flex shrink-0 items-center gap-1">{right}</div>}
    </header>
  );
}

/**
 * A segmented control: period tabs, allocation modes, workspace tabs.
 *
 * The selected item carries the lime underline the rest of the shell uses for
 * an active tab, so this reads as the same control the terminal already has.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex items-stretch gap-0.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "type-label relative rounded-chip px-2 py-1 whitespace-nowrap",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              active
                ? "bg-surface-hover text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {option.label}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-1.5 -bottom-px h-px rounded-pill bg-accent"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A thin share bar. Decorative: the percentage beside it carries the value. */
export function ShareBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("h-0.5 w-full overflow-hidden rounded-pill bg-surface-hover", className)}
    >
      <div
        className="h-full rounded-pill bg-accent-quiet"
        style={{ width: `${Math.max(1, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

/**
 * A compact explanation of why a surface is empty.
 *
 * Distinguishes a source that failed from one that does not exist yet, which
 * is the whole reason `SourceNote.kind` is carried through the model. A retry
 * is offered only for the first: there is nothing to retry about a feature
 * that has not been built.
 */
export function Unavailable({
  title,
  body,
  onRetry,
  tone = "neutral",
}: {
  title: string;
  body: string;
  onRetry?: () => void;
  tone?: "neutral" | "warning";
}) {
  return (
    <div
      className={cn(
        "m-3 flex flex-col gap-1 rounded-chip border px-2.5 py-2",
        tone === "warning"
          ? "border-negative/40 bg-negative-bg"
          : "border-border-subtle bg-surface-raised",
      )}
      role={tone === "warning" ? "alert" : undefined}
    >
      <p className={cn("type-label", tone === "warning" ? "text-negative" : "text-text-secondary")}>
        {title}
      </p>
      <p className="type-label text-text-muted">{body}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className={cn(
            "type-label mt-1 self-start rounded-chip border border-border-subtle px-2 py-0.5",
            "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          )}
        >
          Retry
        </button>
      )}
    </div>
  );
}

/** A keyboard-reachable definition for a metric label. */
export function Hint({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label="What this means"
        aria-describedby={open ? id : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className={cn(
          "text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand",
          "hover:text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          "rounded-chip",
        )}
      >
        <Info size={11} strokeWidth={1.5} aria-hidden />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "type-label absolute bottom-full left-1/2 z-30 mb-1 w-44 -translate-x-1/2",
            "rounded-chip border border-border-subtle bg-surface-raised px-2 py-1.5",
            "text-text-secondary shadow-none",
          )}
        >
          {text}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------------
   Loading

   Skeletons hold the exact geometry of what replaces them, so nothing on the
   page moves when data lands. §29: no whole-page spinner, no layout jump.
--------------------------------------------------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-chip", className)} />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col", className)} aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex h-[var(--row-h)] items-center gap-2 border-b border-border-subtle px-2 last:border-b-0"
        >
          <Skeleton className="size-4 rounded-pill" />
          <Skeleton className="h-2.5 w-16" />
          <Skeleton className="ml-auto h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}
