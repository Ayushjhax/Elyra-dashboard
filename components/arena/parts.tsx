"use client";

import { Copy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCopy } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/* The Arena's small parts, shared by every tab: fields, cards, a problem line, a copy button. */

/* 16px on a touch screen comes from the app's own rule for fields (app/globals.css). */
export const field = cn(
  "type-data h-[var(--control-h)] w-full min-w-0 rounded-control border border-border-subtle bg-surface-base px-3",
  "text-text-primary outline-none placeholder:text-text-muted focus-visible:ring-2 focus-visible:ring-focus-ring",
);

export function Label({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="type-label text-text-secondary">
      {children}
    </label>
  );
}

export function Problem({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
      {text}
    </p>
  );
}

export function Done({ text }: { text: string | null }) {
  if (text === null) return null;
  return (
    <p role="status" className="type-label text-positive">
      {text}
    </p>
  );
}

export function Card({ title, right, children, className }: { title: string; right?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex min-w-0 flex-col gap-3 rounded-panel border border-border-subtle bg-surface-raised p-4", className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="type-h2 min-w-0 text-text-primary">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const { state, copy } = useCopy();
  return (
    <Button size="xs" variant="quiet" onClick={() => void copy(text)} aria-label={label}>
      <Copy size={12} aria-hidden />
      {state === "copied" ? "Copied" : "Copy"}
    </Button>
  );
}

/** A line of text to share, with its copy button. */
export function ShareLine({ text, label }: { text: string; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
      <span className="type-data-sm min-w-0 flex-1 text-text-primary">{text}</span>
      <CopyButton text={text} label={label} />
    </div>
  );
}

export function Stats({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <dl className="grid grid-cols-3 gap-2">
      {items.map(([label, value]) => (
        <div key={label} className="flex min-w-0 flex-col gap-0.5 rounded-control border border-border-subtle bg-surface-base px-2.5 py-2">
          <dt className="type-label truncate text-text-muted">{label}</dt>
          <dd className="type-data truncate text-text-primary">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const rating = (value: number) => Math.round(value).toLocaleString("en-US");

/** The tone of a percentage: gain, loss, or nothing yet. */
export const pctTone = (value: number | null) => (value === null ? "text-text-muted" : Math.round(value * 100) > 0 ? "text-positive" : Math.round(value * 100) < 0 ? "text-negative" : "text-text-secondary");
