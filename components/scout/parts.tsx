"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";
import type { Grade, SourceTier } from "@/lib/scout/grade";
import { cn } from "@/lib/utils";

/* Small pieces Scout's tabs share: grade and tier badges, a signed figure, a notice. */

export const GRADE_LABEL: Record<Grade, string> = {
  confirmed: msg("Confirmed"),
  reported: msg("Reported"),
  unverified: msg("Unverified"),
  speculation: msg("Speculation"),
  opinion: msg("Opinion"),
};

export const GRADE_WHY: Record<Grade, string> = {
  confirmed: msg("The party itself says so, in its own channel."),
  reported: msg("A newsroom states it as fact."),
  unverified: msg("Stated as fact, but not by the party itself or a newsroom."),
  speculation: msg("Framed as possible, rumoured or expected — not as fact."),
  opinion: msg("A view, a forecast or a price call."),
};

const GRADE_TONE: Record<Grade, string> = {
  confirmed: "border-positive text-positive bg-positive-bg",
  reported: "border-accent text-accent bg-accent-quiet",
  unverified: "border-caution text-caution bg-caution-bg",
  speculation: "border-border-strong text-text-secondary bg-surface-base",
  opinion: "border-border-subtle text-text-muted bg-surface-base",
};

export function GradeBadge({ grade }: { grade: Grade }) {
  const t = useT();
  return <span className={cn("type-eyebrow inline-flex h-6 shrink-0 items-center rounded-chip border px-2", GRADE_TONE[grade])}>{t(GRADE_LABEL[grade])}</span>;
}

export const TIER_LABEL: Record<SourceTier, string> = {
  primary: msg("From the party itself"),
  newsroom: msg("Newsroom"),
  unverified: msg("Unverified source"),
};

export function TierBadge({ tier }: { tier: SourceTier }) {
  const t = useT();
  const tone = tier === "primary" ? "text-positive" : tier === "newsroom" ? "text-accent" : "text-caution";
  return <span className={cn("type-label shrink-0", tone)}>{t(TIER_LABEL[tier])}</span>;
}

/** A signed percentage, toned by its sign. */
export function SignedPct({ value, className }: { value: number | null; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("type-data-sm text-text-muted", className)}>—</span>;
  const tone = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-neutral-flat";
  return (
    <span className={cn("type-data-sm tabular-nums", tone, className)}>
      {value > 0 ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

export function Notice({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "caution" | "negative" }) {
  return (
    <p
      className={cn(
        "type-label rounded-control border px-3 py-2",
        tone === "negative" ? "border-negative text-negative" : tone === "caution" ? "border-caution text-caution" : "border-border-subtle text-text-secondary",
      )}
    >
      {children}
    </p>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (next: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-control border border-border-subtle bg-surface-base p-0.5">
      {options.map(([id, text]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn("type-label h-8 rounded-chip px-2.5 transition-colors", value === id ? "bg-surface-raised text-text-primary" : "text-text-muted hover:text-text-primary")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
