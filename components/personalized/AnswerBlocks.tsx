"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Info,
  RotateCcw,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Markdown } from "@/components/ui/Markdown";
import type { SentAttachment } from "@/lib/attachments";
import type { ChatTurn } from "@/lib/personalized/client";
import { cn } from "@/lib/utils";
import type {
  AnswerInsight,
  AnswerMetric,
  InsightTone,
  PersonalizedAnswer,
  PreparedAction,
} from "@/lib/personalized/types";

/* ---------------------------------------------------------------------------
   How an answer is drawn.

   Not chat bubbles. A bubble is the right shape for conversation and the
   wrong one for a figure someone is about to act on: it centres the words and
   makes every number the same weight as the sentence around it.

   So an assistant turn is a block of prose with typed structures under it —
   metrics in a row, insights as rows with a tone, an action as a bordered
   preview. The operator's own turn stays compact and right-aligned, because
   it is context for the answer rather than the thing being read.
--------------------------------------------------------------------------- */

const TONE_STYLE: Record<InsightTone, { icon: typeof Info; className: string }> = {
  positive: { icon: TrendingUp, className: "text-positive" },
  negative: { icon: TrendingDown, className: "text-negative" },
  risk: { icon: ShieldAlert, className: "text-accent" },
  neutral: { icon: Info, className: "text-text-muted" },
};

function MetricRow({ metrics }: { metrics: AnswerMetric[] }) {
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border-subtle bg-border-subtle @[30rem]:grid-cols-4">
      {metrics.map((metric) => (
        <div key={metric.label} className="flex flex-col gap-0.5 bg-surface-panel px-3 py-2">
          <span className="type-label truncate uppercase tracking-[0.08em] text-text-muted">
            {metric.label}
          </span>
          <span className="type-data truncate tabular-nums text-text-primary">
            {metric.value}
          </span>
          {metric.delta !== undefined && (
            <span
              className={cn(
                "type-label tabular-nums",
                metric.tone === "positive"
                  ? "text-positive"
                  : metric.tone === "negative"
                    ? "text-negative"
                    : "text-text-muted",
              )}
            >
              {metric.delta}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function InsightRows({ insights }: { insights: AnswerInsight[] }) {
  return (
    <ul className="flex list-none flex-col gap-1.5">
      {insights.map((insight) => {
        const style = TONE_STYLE[insight.type];
        const Icon = style.icon;
        return (
          <li
            key={insight.title}
            className="flex items-start gap-2 rounded-card border border-border-subtle bg-surface-panel px-3 py-2"
          >
            <Icon
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className={cn("mt-0.5 shrink-0", style.className)}
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="type-data-sm text-text-primary">{insight.title}</span>
              <span className="type-label text-text-secondary">{insight.detail}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ---------------------------------------------------------------------------
   Prepared action

   The confirmation boundary, drawn. Every field is server-resolved; the
   `derived` flag is what the small check mark means. Confirm is enabled only
   when the server said `ready`, which today is never — see the note in
   lib/personalized/actions.ts.
--------------------------------------------------------------------------- */

export function ActionPreview({
  action,
  onConfirm,
}: {
  action: PreparedAction;
  onConfirm?: (action: PreparedAction) => void;
}) {
  const ready = action.readiness === "ready";
  const rejected = action.readiness === "rejected";

  return (
    <section
      aria-label={`Prepared action: ${action.summary}`}
      className={cn(
        "flex flex-col overflow-hidden rounded-card border",
        rejected ? "border-negative/40" : "border-accent-quiet",
      )}
    >
      <header className="flex items-center gap-2 border-b border-border-subtle bg-surface-raised px-3 py-2">
        <span className="type-label uppercase tracking-[0.08em] text-text-muted">
          Prepared action
        </span>
        <span className="type-data-sm ml-auto min-w-0 truncate text-text-primary">
          {action.summary}
        </span>
      </header>

      {action.fields.length > 0 && (
        <dl className="flex flex-col divide-y divide-border-subtle px-3">
          {action.fields.map((field) => (
            <div key={field.label} className="flex items-baseline justify-between gap-3 py-1.5">
              <dt className="type-label flex items-center gap-1 text-text-muted">
                {field.label}
                {field.derived && (
                  <Check
                    size={9}
                    strokeWidth={2.5}
                    aria-label="Resolved from your live balance"
                    className="text-positive"
                  />
                )}
              </dt>
              <dd className="type-data-sm min-w-0 truncate tabular-nums text-text-primary">
                {field.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {action.warnings.length > 0 && (
        <ul className="flex list-none flex-col gap-1 px-3 py-2">
          {action.warnings.map((warning) => (
            <li key={warning} className="type-label flex items-start gap-1.5 text-accent">
              <AlertTriangle size={10} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              {warning}
            </li>
          ))}
        </ul>
      )}

      {action.reason !== null && (
        <p
          className={cn(
            "type-label border-t border-border-subtle px-3 py-2",
            rejected ? "text-negative" : "text-text-muted",
          )}
        >
          {action.reason}
        </p>
      )}

      <footer className="flex items-center justify-end gap-2 border-t border-border-subtle px-3 py-2">
        <Button
          size="sm"
          variant="accent"
          disabled={!ready}
          title={ready ? undefined : (action.reason ?? "Not available")}
          onClick={() => onConfirm?.(action)}
        >
          Confirm
        </Button>
      </footer>
    </section>
  );
}

/* ---------------------------------------------------------------------------
   The turn
--------------------------------------------------------------------------- */

function SentFiles({ files }: { files: SentAttachment[] }) {
  return (
    <ul aria-label="Attached" className="flex list-none flex-wrap justify-end gap-1.5">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${index}`}
          className="type-label flex max-w-56 items-center gap-1.5 rounded-control border border-border-subtle bg-surface-raised px-2 py-1 text-text-secondary"
        >
          {file.previewUrl !== null ? (
            /* eslint-disable-next-line @next/next/no-img-element -- a local data URL thumbnail */
            <img src={file.previewUrl} alt="" className="size-6 shrink-0 rounded-chip object-cover" />
          ) : file.kind === "image" ? (
            <ImageIcon size={13} strokeWidth={1.5} aria-hidden className="shrink-0" />
          ) : (
            <FileText size={13} strokeWidth={1.5} aria-hidden className="shrink-0" />
          )}
          <span className="truncate">{file.name}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The person's own turn: compact, right-aligned, and — when it did not end in
 * an answer — saying so, with a Retry that re-asks it in place.
 */
export function UserTurn({
  turn,
  onRetry,
  canRetry,
}: {
  turn: Pick<ChatTurn, "content" | "attachments" | "outcome">;
  onRetry?: () => void;
  canRetry?: boolean;
}) {
  return (
    <div className="flex flex-col items-end gap-1.5">
      {turn.attachments !== undefined && turn.attachments.length > 0 && <SentFiles files={turn.attachments} />}
      {turn.content.length > 0 && (
        <p className="type-body max-w-[min(80%,560px)] whitespace-pre-wrap break-words rounded-panel border border-border-subtle bg-surface-raised px-4 py-2.5 text-text-primary">
          {turn.content}
        </p>
      )}
      {turn.outcome !== undefined && (
        <div
          role={turn.outcome.state === "failed" ? "alert" : undefined}
          className="flex max-w-[min(80%,560px)] flex-wrap items-center justify-end gap-x-2 gap-y-1"
        >
          <span className={cn("type-label inline-flex items-center gap-1.5", turn.outcome.state === "failed" ? "text-negative" : "text-text-muted")}>
            {turn.outcome.state === "failed" && <AlertTriangle size={12} strokeWidth={1.75} aria-hidden className="shrink-0" />}
            {turn.outcome.state === "failed" ? (turn.outcome.error ?? "That didn't finish.") : "Stopped before an answer."}
          </span>
          {onRetry !== undefined && (
            <button
              type="button"
              onClick={onRetry}
              disabled={canRetry === false}
              className="type-label inline-flex h-7 items-center gap-1 rounded-control border border-border-strong px-2 text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover disabled:opacity-50"
            >
              <RotateCcw size={12} strokeWidth={1.75} aria-hidden />
              Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function AssistantTurn({
  answer,
  content,
  onPrompt,
}: {
  answer: PersonalizedAnswer | null;
  content: string;
  onPrompt?: (prompt: string) => void;
}) {
  const [showContext, setShowContext] = useState(false);

  return (
    <article className="flex flex-col gap-2.5">
      {answer?.headline !== undefined && (
        <h3 className="type-h2 text-balance text-text-primary">{answer.headline}</h3>
      )}

      {/* Markdown, rendered as elements (components/ui/Markdown) — lists,
          tables and links as the model wrote them, never as raw HTML. */}
      <Markdown source={answer?.message ?? content} />

      {answer?.metrics !== undefined && <MetricRow metrics={answer.metrics} />}
      {answer?.insights !== undefined && <InsightRows insights={answer.insights} />}
      {answer?.preparedAction !== undefined && (
        <ActionPreview action={answer.preparedAction} />
      )}

      {answer?.suggestedPrompts !== undefined && onPrompt !== undefined && (
        <div className="flex flex-wrap gap-1.5">
          {answer.suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPrompt(prompt)}
              className={cn(
                "type-label flex items-center gap-1 rounded-chip border border-border-subtle px-2 py-1",
                "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
                "hover:border-border-strong hover:bg-surface-hover hover:text-text-primary",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              )}
            >
              {prompt}
              <ArrowRight size={10} strokeWidth={1.5} aria-hidden />
            </button>
          ))}
        </div>
      )}

      {/* What the answer actually read. The honesty surface: a reply claiming
          to know positions while this says only equity was loaded is a bug
          that is otherwise invisible. */}
      {answer?.contextUsed !== undefined && answer.contextUsed.length > 0 && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setShowContext((value) => !value)}
            aria-expanded={showContext}
            className={cn(
              "type-label flex w-fit items-center gap-1 rounded-chip text-text-muted",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-secondary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            )}
          >
            Grounded in {answer.contextUsed.length} source
            {answer.contextUsed.length === 1 ? "" : "s"}
            <ChevronDown
              size={10}
              strokeWidth={1.5}
              aria-hidden
              className={cn(
                "transition-transform duration-[var(--dur-base)] ease-brand",
                showContext && "rotate-180",
              )}
            />
          </button>
          {showContext && (
            <div className="flex flex-wrap gap-1">
              {answer.contextUsed.map((source) => (
                <span
                  key={source}
                  className="type-label rounded-chip border border-border-subtle px-1.5 py-0.5 text-text-muted"
                >
                  {source}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
