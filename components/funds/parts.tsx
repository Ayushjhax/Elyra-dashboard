"use client";

import { StatusDot } from "@/components/shell/RouteDrawer";
import { STATUS_WORD } from "@/lib/funds/policy";
import type { FundMode, FundStatus } from "@/lib/funds/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/client";

/* Small pieces the Funds pages share. Every colour is a brand token. */

/* Inputs take --border-strong (brand doc 1.3). Focus is the global
   :focus-visible ring (app/globals.css), which a utility cannot override —
   a ring here as well would draw two. */
export const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-strong bg-surface-base px-3",
  "text-text-primary placeholder:text-text-muted",
);

export function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

export function Notice({ text }: { text: string | null }) {
  if (text === null) return null;
  return <p className="type-label rounded-card border border-border-subtle bg-surface-base px-3 py-2 text-text-secondary">{text}</p>;
}

const TONE: Record<FundStatus, "positive" | "accent" | "caution" | "negative" | "muted"> = {
  active: "positive",
  paused: "caution",
  halted: "negative",
  winding_down: "caution",
  closed: "muted",
};

export function FundStatusTag({ status, closedReason }: { status: FundStatus; closedReason?: "wound_down" | "graduated" | null }) {
  const t = useT();
  return <StatusDot tone={TONE[status]}>{status === "closed" && closedReason === "graduated" ? t("Graduated") : STATUS_WORD[status]}</StatusDot>;
}

export function ModeTag({ mode }: { mode: FundMode }) {
  const t = useT();
  return (
    <span
      className={cn(
        "type-eyebrow inline-flex h-5 items-center rounded-chip border px-1.5",
        mode === "live" ? "border-border-accent text-accent" : "border-border-subtle text-text-muted",
      )}
    >
      {mode === "live" ? t("Live") : t("Paper")}
    </span>
  );
}

/** A week of NAV per unit as a line; the label beside it says what it is. */
export function Spark({ values, className }: { values: readonly number[]; className?: string }) {
  if (values.length < 2) return <span aria-hidden className={cn("inline-block h-6 w-20", className)} />;
  const width = 80;
  const height = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${((index / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((value - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const rising = values[values.length - 1] >= values[0];
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden className={cn("shrink-0 overflow-visible", rising ? "text-positive" : "text-negative", className)}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** How much of a limit is used: a bar, the value, and the limit. Caution from 75%, negative at 100%. */
export function Meter({ label, used, limit, value, of }: { label: string; used: number; limit: number; value: string; of: string }) {
  const share = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-label text-text-secondary">{label}</span>
        <span className="type-data-sm text-text-primary">
          {value} <span className="text-text-muted">/ {of}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-pill bg-surface-hover" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)}>
        <div className={cn("h-full rounded-pill", share >= 1 ? "bg-negative" : share >= 0.75 ? "bg-caution" : "bg-accent")} style={{ width: `${(share * 100).toFixed(1)}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
      <span className="type-label text-text-muted">{label}</span>
      <span className="type-data min-w-0 truncate text-text-primary">{children}</span>
    </div>
  );
}

export const plainPct = (value: number | null, decimals = 2) => (value === null || !Number.isFinite(value) ? "—" : `${value.toFixed(decimals)}%`);
