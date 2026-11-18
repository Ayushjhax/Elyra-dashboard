"use client";

import { useId, useState } from "react";
import {
  Check,
  ChevronRight,
  Circle,
  Loader2,
  Minus,
  ShieldCheck,
  TriangleAlert,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { InfoTip } from "@/components/shell/RouteDrawer";
import type { TeamReview, TeamStage, TeamStageStatus, TeamTrace as Trace } from "@/lib/agent/events";
import { TEAM_AGENTS, teamAgentName } from "@/lib/agent/reply";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The team behind an answer.

   Above a reply the website's team wrote (lib/agent/team): who the
   orchestrator gave the question to, what each member is doing or found,
   the shared board they worked from — the person's saved rules and recent
   outcomes — and the code's check on the figures in the answer.

   Open while the team works, so the person watches the hand-offs; folded to
   one line once the answer starts, and opened again on a tap. Members'
   notes are model-written and labelled so: the answer is the reply below.
--------------------------------------------------------------------------- */

const STATUS: Record<TeamStageStatus, { label: string; icon: LucideIcon; tone: string }> = {
  queued: { label: "Queued", icon: Circle, tone: "text-text-muted" },
  working: { label: "Working", icon: Loader2, tone: "animate-spin text-agent-accent" },
  done: { label: "Done", icon: Check, tone: "text-positive" },
  skipped: { label: "Sat out", icon: Minus, tone: "text-text-muted" },
  failed: { label: "Did not finish", icon: X, tone: "text-negative" },
};

const REVIEW_EXPLAINED =
  "After the team answers, code checks every figure in the reply against what the tools " +
  "returned and your account context. A figure that matches nothing may be honest arithmetic " +
  "or a mistake, so check it before you rely on it.";

function StageRow({ stage }: { stage: TeamStage }) {
  const [open, setOpen] = useState(false);
  const notesId = useId();
  const status = STATUS[stage.status];
  const Icon = status.icon;
  const line = stage.status === "working" && stage.activity ? `Reading ${stage.activity}…` : stage.task;

  return (
    <li className="flex gap-2">
      <Icon size={14} strokeWidth={1.5} aria-hidden className={cn("mt-0.5 shrink-0", status.tone)} />
      <div className="min-w-0 flex-1">
        <p className="type-label flex items-baseline gap-1.5">
          <span className="text-text-primary">{teamAgentName(stage.id)}</span>
          <span className="text-text-muted">{status.label}</span>
        </p>
        <p
          className={cn(
            "type-body-sm break-words",
            stage.status === "skipped" ? "text-text-muted" : "text-text-secondary",
          )}
        >
          {line}
        </p>
        {stage.brief && (
          <>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={notesId}
              onClick={() => setOpen((value) => !value)}
              className={cn(
                "type-label relative mt-1 inline-flex items-center gap-1 text-text-muted transition-colors hover:text-text-primary",
                /* A comfortable hit area without moving the line. */
                "after:absolute after:-inset-x-1 after:-inset-y-2",
              )}
            >
              <ChevronRight
                size={12}
                strokeWidth={1.5}
                aria-hidden
                className={cn("transition-transform", open && "rotate-90")}
              />
              {open ? "Hide notes" : "Show notes"}
            </button>
            <div
              id={notesId}
              hidden={!open}
              className="mt-1.5 rounded-control border border-border-subtle bg-surface-raised px-2.5 py-2"
            >
              <p className="type-label text-text-muted">Model-written notes, checked by the next member</p>
              <p className="type-body-sm mt-1 whitespace-pre-wrap break-words text-text-secondary">
                {stage.brief}
              </p>
            </div>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * The header's verdict on the figures, as an icon and a count so the
 * members' names keep the room in a narrow column; the words are for screen
 * readers, and the open board says it in full. Not interactive: it sits in
 * a button.
 */
function ReviewBadge({ review }: { review: TeamReview }) {
  const count = review.untraced.length;
  if (count > 0) {
    return (
      <span className="type-label inline-flex shrink-0 items-center gap-1 text-caution">
        <TriangleAlert size={12} strokeWidth={1.5} aria-hidden />
        {count}
        <span className="sr-only"> {count === 1 ? "figure" : "figures"} not traced</span>
      </span>
    );
  }
  if (review.checked === 0) return null;
  return (
    <span className="inline-flex shrink-0 items-center text-positive">
      <ShieldCheck size={12} strokeWidth={1.5} aria-hidden />
      <span className="sr-only">Every figure traced</span>
    </span>
  );
}

function figuresLine(review: TeamReview): string {
  if (review.checked === 0) return "The answer cites no figures to trace.";
  if (review.untraced.length === 0) {
    return review.checked === 1
      ? "The one figure in the answer traces to a tool result or your account."
      : `All ${review.checked} figures in the answer trace to a tool result or your account.`;
  }
  return (
    `${review.untraced.length} of ${review.checked} figures do not trace to a tool result or ` +
    `your account: ${review.untraced.join(", ")}. Check them before relying on them.`
  );
}

function ListOrNone({ items, none }: { items: readonly string[]; none: string }) {
  if (items.length === 0) return <p className="type-body-sm text-text-muted">{none}</p>;
  return (
    <ul className="flex list-none flex-col gap-0.5">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="type-body-sm break-words text-text-secondary">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function TeamTrace({ team, working }: { team: Trace; working: boolean }) {
  /* The person's own choice wins; until they make one it follows the work. */
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? working;
  const panelId = useId();

  const ran = team.stages.filter((stage) => stage.status !== "skipped" && stage.status !== "queued");
  const summary =
    ran.length === 0
      ? "Allocating the question"
      : ran.length === 1 && team.stages.every((stage) => stage.id === ran[0].id || stage.status === "skipped")
        ? `${teamAgentName(ran[0].id)} alone`
        : ran.map((stage) => teamAgentName(stage.id)).join(" → ");
  const review = team.review;

  return (
    <section
      aria-label="How the team answered"
      className="overflow-hidden rounded-control border border-border-subtle bg-surface-panel"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setChoice(!open)}
        className="flex w-full flex-col gap-0.5 px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
      >
        <span className="flex w-full items-center gap-2">
          <Workflow size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-agent-accent" />
          <span className="type-eyebrow min-w-0 flex-1 text-text-muted">Team</span>
          {review && <ReviewBadge review={review} />}
          <ChevronRight
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-90")}
          />
        </span>
        {/* Its own line, under the label, and free to wrap: the hand-off
            chain is the point of the header, and a narrow column cut it short. */}
        <span className="type-label w-full break-words pl-[22px] text-text-secondary">{summary}</span>
      </button>

      <div id={panelId} hidden={!open} className="flex flex-col gap-3 border-t border-border-subtle px-2.5 py-2.5">
        {team.objective && (
          <p className="type-body-sm break-words text-text-secondary">
            <span className="type-label text-text-muted">Objective </span>
            {team.objective}
          </p>
        )}

        <ol aria-label="Members" className="flex list-none flex-col gap-2.5">
          {team.stages.map((stage) => (
            <StageRow key={stage.id} stage={stage} />
          ))}
        </ol>

        <div className="flex flex-col gap-2 border-t border-border-subtle pt-2.5">
          <div className="min-w-0">
            <p className="type-label text-text-muted">Your saved rules</p>
            <ListOrNone items={team.constraints} none="None saved." />
          </div>
          <div className="min-w-0">
            <p className="type-label text-text-muted">Recent outcomes</p>
            <ListOrNone items={team.outcomes} none="None recorded yet." />
          </div>
        </div>

        {review && (
          <div className="border-t border-border-subtle pt-2.5">
            <p className="type-label flex items-center gap-1.5 text-text-muted">
              Review
              <InfoTip text={REVIEW_EXPLAINED} />
            </p>
            <p
              className={cn(
                "type-body-sm mt-0.5 break-words",
                review.untraced.length > 0 ? "text-caution" : "text-text-secondary",
              )}
            >
              {figuresLine(review)}
            </p>
            {review.notes.length > 0 && (
              <ul className="mt-1 flex list-none flex-col gap-0.5">
                {review.notes.map((note, index) => (
                  <li key={`${index}-${note}`} className="type-body-sm break-words text-text-secondary">
                    {note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * How a question is answered, for the empty conversation: the orchestration
 * layer over three members, and the outcomes that feed back into it.
 */
export function TeamArchitecture() {
  return (
    <figure className="w-full max-w-[22rem]">
      <figcaption className="type-eyebrow text-text-muted">Coordinated intelligence</figcaption>

      <div className="mt-2 rounded-control border border-border-subtle bg-surface-panel px-3 py-2 text-left">
        <p className="type-label text-text-primary">Orchestration</p>
        <p className="type-label text-text-muted">
          Shared objective, saved rules and memory. Allocates each question.
        </p>
      </div>

      <div aria-hidden className="mx-auto h-3 w-px bg-border-strong" />

      <ol aria-label="The team" className="grid list-none grid-cols-3 gap-1.5">
        {TEAM_AGENTS.map((agent) => (
          <li
            key={agent.id}
            className="min-w-0 rounded-control border border-border-subtle bg-surface-raised px-1.5 py-2"
          >
            <p className="type-label truncate text-text-primary">{agent.name}</p>
            <p className="type-label text-text-muted">{agent.short}</p>
          </li>
        ))}
      </ol>

      <div aria-hidden className="mx-auto h-3 w-px bg-border-strong" />

      <div className="rounded-control border border-border-subtle bg-surface-panel px-3 py-2 text-left">
        <p className="type-label text-text-primary">Shared outcomes and feedback</p>
        <p className="type-label text-text-muted">Your recent actions, read back to the team.</p>
      </div>

      <p className="type-body-sm mx-auto mt-2 max-w-[32ch] text-text-secondary">
        They share context, review each other&apos;s work and answer as one. None of them can move money.
      </p>
    </figure>
  );
}
