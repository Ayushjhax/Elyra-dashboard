"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Brain,
  Eye,
  Plus,
  ShieldAlert,
  Sparkles,
  Sun,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { Money, Skeleton } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import { formatPct } from "@/lib/format";
import type { MemoryFeed } from "@/lib/personalized/client";
import type { PersonalizedContext } from "@/lib/personalized/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The right rail: what Elyra already knows, before anything is asked.

   Five sections, each backed by a deterministic figure rather than by model
   output. This is the half of the page that makes the chat credible: an
   assistant that claims to know your exposure is more believable sitting
   beside a panel that shows it.

   Every section hides itself when its inputs are absent. A rail of "—" rows
   teaches its reader to stop looking at the rail.
--------------------------------------------------------------------------- */

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof Sun;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3 last:border-b-0">
      <header className="flex items-center gap-1.5">
        <Icon size={12} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
        <h2 className="type-label uppercase tracking-[0.08em] text-text-secondary">{title}</h2>
        {action !== undefined && <div className="ml-auto">{action}</div>}
      </header>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  detail?: string | null;
  tone?: "positive" | "negative" | "neutral" | "risk";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="type-label min-w-0 truncate text-text-muted">{label}</span>
        <span
          className={cn(
            "type-data-sm shrink-0 tabular-nums",
            tone === "positive"
              ? "text-positive"
              : tone === "negative"
                ? "text-negative"
                : tone === "risk"
                  ? "text-accent"
                  : "text-text-primary",
          )}
        >
          {value}
        </span>
      </div>
      {detail != null && <p className="type-label text-text-muted">{detail}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Memory — the one interactive section
--------------------------------------------------------------------------- */

const ADDABLE = [
  { type: "concentration_limit", label: "Max single-asset %", placeholder: "25", suffix: "%" },
  { type: "stablecoin_buffer", label: "Min stablecoin %", placeholder: "20", suffix: "%" },
  { type: "leverage_limit", label: "Max leverage", placeholder: "3", suffix: "×" },
] as const;

function MemorySection({ memory }: { memory: MemoryFeed }) {
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<string>(ADDABLE[0].type);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const field = ADDABLE.find((entry) => entry.type === type) ?? ADDABLE[0];

  async function submit(): Promise<void> {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      setError("Enter a number.");
      return;
    }
    const failure = await memory.save(type, parsed);
    if (failure !== null) {
      setError(failure);
      return;
    }
    setValue("");
    setError(null);
    setAdding(false);
  }

  return (
    <Section
      icon={Brain}
      title="Memory"
      action={
        <button
          type="button"
          aria-label={adding ? "Cancel" : "Add a preference"}
          onClick={() => {
            setAdding((open) => !open);
            setError(null);
          }}
          className={cn(
            "grid size-5 place-items-center rounded-chip text-text-muted",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          )}
        >
          {adding ? (
            <X size={11} strokeWidth={1.5} aria-hidden />
          ) : (
            <Plus size={11} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      }
    >
      {adding && (
        <div className="flex flex-col gap-1.5 rounded-card border border-border-subtle bg-surface-raised p-2">
          <label className="type-label text-text-muted">
            <span className="sr-only">Preference</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
              className="w-full rounded-chip border border-border-subtle bg-surface-panel px-1.5 py-1 text-text-primary"
            >
              {ADDABLE.map((entry) => (
                <option key={entry.type} value={entry.type}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1.5">
            <input
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void submit();
              }}
              inputMode="decimal"
              placeholder={field.placeholder}
              aria-label={field.label}
              className={cn(
                "type-label min-w-0 flex-1 rounded-chip border border-border-subtle bg-surface-panel px-2 py-1",
                "text-text-primary placeholder:text-text-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              )}
            />
            <span className="type-label text-text-muted">{field.suffix}</span>
            <Button size="xs" variant="accent" onClick={() => void submit()}>
              Save
            </Button>
          </div>
          {error !== null && <p className="type-label text-negative">{error}</p>}
        </div>
      )}

      {memory.loading ? (
        <Skeleton className="h-3 w-32" />
      ) : memory.memories.length === 0 ? (
        <p className="type-label text-text-muted">
          Nothing saved yet. Tell Elyra a limit — &ldquo;never more than 25% in one
          asset&rdquo; — or add one here.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-1">
          {memory.memories.map((entry) => (
            <li key={entry.id} className="group flex items-center gap-1.5">
              <span className="type-label min-w-0 flex-1 truncate text-text-secondary">
                {entry.label}
              </span>
              {entry.source === "inferred" && (
                <span className="type-label shrink-0 rounded-chip border border-border-subtle px-1 text-text-muted">
                  inferred
                </span>
              )}
              <button
                type="button"
                aria-label={`Remove: ${entry.label}`}
                onClick={() => void memory.remove(entry.id)}
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-chip text-text-muted opacity-0",
                  "transition-[opacity,color] duration-[var(--dur-fast)] ease-brand",
                  "group-hover:opacity-100 hover:text-negative",
                  "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              >
                <Trash2 size={10} strokeWidth={1.5} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ---------------------------------------------------------------------------
   The rail
--------------------------------------------------------------------------- */

export function ContextRail({
  context,
  memory,
  loading,
}: {
  context: PersonalizedContext | null;
  memory: MemoryFeed;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3 p-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {context !== null && context.today.length > 0 && (
        <Section icon={Sun} title="Today">
          <div className="flex flex-col gap-2">
            {context.today.map((row) => (
              <Row
                key={row.label}
                label={row.label}
                value={row.value}
                detail={row.detail}
                tone={row.tone}
              />
            ))}
          </div>
        </Section>
      )}

      {context !== null && (
        <Section
          icon={Wallet}
          title="Portfolio"
          action={
            <Link
              href="/portfolio"
              className={cn(
                "type-label flex items-center gap-0.5 rounded-chip text-text-muted",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              )}
            >
              Open
              <ArrowUpRight size={10} strokeWidth={1.5} aria-hidden />
            </Link>
          }
        >
          <div className="flex flex-col gap-2">
            <Row
              label="Total equity"
              value={
                <Money
                  value={context.totalEquityUsd}
                  reason="Nothing could be totalled."
                />
              }
            />
            <Row
              label="Available"
              value={
                <Money
                  value={context.availableCapitalUsd}
                  reason="No stablecoin or venue collateral was readable."
                />
              }
            />
            {context.largestExposure !== null && (
              <Row
                label="Largest exposure"
                value={`${context.largestExposure.symbol} ${context.largestExposure.pct.toFixed(1)}%`}
                detail={context.largestExposure.venues.join(" + ")}
              />
            )}
            {context.change24h !== null && (
              <Row
                label="24h"
                value={formatPct(context.change24h.pctChange)}
                tone={context.change24h.pctChange >= 0 ? "positive" : "negative"}
                detail={
                  context.change24h.coveragePct < 95
                    ? `Over ${context.change24h.coveragePct.toFixed(0)}% of value`
                    : null
                }
              />
            )}
          </div>
        </Section>
      )}

      {context !== null && context.risk.length > 0 && (
        <Section icon={ShieldAlert} title="Risk">
          <div className="flex flex-col gap-2">
            {context.risk.map((metric) => (
              <Row
                key={metric.key}
                label={metric.label}
                value={metric.value}
                tone={metric.breached ? "risk" : "neutral"}
                detail={
                  metric.limit === null ? metric.detail : `${metric.detail} (limit ${metric.limit})`
                }
              />
            ))}
          </div>
        </Section>
      )}

      {context !== null && context.exposures.length > 0 && (
        <Section icon={Eye} title="Watching">
          <ul className="flex list-none flex-col gap-1">
            {context.exposures.slice(0, 5).map((row) => (
              <li key={row.symbol} className="flex items-baseline justify-between gap-2">
                <span className="type-label min-w-0 truncate text-text-secondary">
                  {row.symbol}
                </span>
                <span className="type-data-sm shrink-0 tabular-nums text-text-muted">
                  {row.pct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <MemorySection memory={memory} />

      {context !== null && context.unavailable.length > 0 && (
        <Section icon={Sparkles} title="Partial data">
          <ul className="flex list-none flex-col gap-1">
            {/* Keyed on scope AND reason: one scope can report several
                distinct failures — a protocol that left two sections
                unindexed produces two "defi" rows, and both are worth
                showing. The scope alone stopped being unique the moment a
                provider could fail partially. */}
            {context.unavailable.map((entry) => (
              <li
                key={`${entry.scope}:${entry.reason}`}
                className="type-label text-negative"
              >
                {entry.scope}: <span className="text-text-muted">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
