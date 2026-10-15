"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Clock3,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  SendHorizontal,
  SlidersHorizontal,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import { Tip } from "@/components/shell/RouteDrawer";
import { Popover } from "@/components/ui/Popover";
import { ACCEPT, type ComposerAttachment } from "@/lib/attachments";
import { describeSize, readAttachments } from "@/lib/attachments-read";
import { CHIP_SOURCE, usable, type SourceKey, type SourceStatus } from "@/lib/personalized/sources";
import { CONTEXT_SOURCES, type ContextSource } from "@/lib/personalized/types";
import type { Dictation } from "@/lib/voice/useDictation";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The composer: what to ask, and what it may read.

   The strip along the top is the question's context, not navigation. Each
   chip is a switch — on, it is sent with the next question; off, the server
   withholds it and tells the model it was withheld (lib/personalized/
   context.ts). A source that cannot be read right now still shows, marked,
   so turning it on is never mistaken for it working.

   Files and dictation are the agent panel's own: the same reader, limits and
   checks for attachments, the same recogniser for speech. Dictation only
   fills the box — nothing spoken is sent without the person pressing send.
--------------------------------------------------------------------------- */

export const SOURCE_META: Record<ContextSource, { label: string; icon: LucideIcon; reads: string }> = {
  portfolio: { label: "Portfolio", icon: BarChart3, reads: "balances, equity and allocation" },
  positions: { label: "Positions", icon: BriefcaseBusiness, reads: "open perps, DeFi and prediction markets" },
  activity: { label: "Activity", icon: Clock3, reads: "your recent wallet transactions" },
  memory: { label: "Memory", icon: BookOpen, reads: "the preferences you've saved" },
};

const MAX_INPUT_PX = 200;

function chipState(on: boolean, status: SourceStatus): "on" | "off" | "unavailable" | "loading" {
  if (!on) return "off";
  if (status.state === "loading") return "loading";
  return usable(status) ? "on" : "unavailable";
}

function chipTip(source: ContextSource, state: ReturnType<typeof chipState>, status: SourceStatus): string {
  const { label, reads } = SOURCE_META[source];
  if (state === "off") return `${label} is left out — Elyra won't read ${reads}. Select to include it.`;
  if (state === "unavailable") return `${label} is on, but can't be read right now (${status.label.toLowerCase()}).`;
  return `Elyra may read ${reads}. Select to leave it out.`;
}

function SourceChip({
  source,
  on,
  status,
  onToggle,
}: {
  source: ContextSource;
  on: boolean;
  status: SourceStatus;
  onToggle: () => void;
}) {
  const { label, icon: Icon } = SOURCE_META[source];
  const state = chipState(on, status);
  return (
    <Tip label={chipTip(source, state, status)}>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className={cn(
          "type-label inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border px-2.5",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
          state === "off"
            ? "border-dashed border-border-subtle text-text-muted"
            : "border-border-subtle bg-surface-raised text-text-primary",
        )}
      >
        <Icon size={14} strokeWidth={1.5} aria-hidden className={state === "off" ? "text-text-muted" : "text-text-secondary"} />
        <span className={cn(state === "off" && "line-through decoration-text-muted/60")}>{label}</span>
        {state === "unavailable" && <span aria-hidden className="size-1.5 rounded-pill bg-caution" />}
        <span className="sr-only">
          {state === "off" ? "(left out)" : state === "unavailable" ? `(${status.label})` : "(included)"}
        </span>
      </button>
    </Tip>
  );
}

function ContextSettings({
  selected,
  statuses,
  onChange,
}: {
  selected: readonly ContextSource[];
  statuses: Record<SourceKey, SourceStatus>;
  onChange: (next: ContextSource[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const all = selected.length === CONTEXT_SOURCES.length;
  return (
    <Popover
      id={id}
      open={open}
      onOpenChange={setOpen}
      label="Context for your questions"
      side="top"
      align="end"
      className="w-[min(300px,calc(100vw-48px))]"
      trigger={
        <Tip label="Context settings">
          <button
            type="button"
            aria-label="Context settings"
            aria-expanded={open}
            aria-controls={id}
            onClick={() => setOpen((value) => !value)}
            className="grid size-8 shrink-0 place-items-center rounded-control text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
          >
            <SlidersHorizontal size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </Tip>
      }
    >
      <div className="flex flex-col gap-1 p-3">
        <p className="type-body-sm font-medium text-text-primary">What Elyra may read</p>
        <p className="type-label mb-1 text-text-muted">For each question, until you change it. Left-out sources are never sent.</p>
        {CONTEXT_SOURCES.map((source) => {
          const meta = SOURCE_META[source];
          const status = statuses[CHIP_SOURCE[source]];
          const on = selected.includes(source);
          return (
            <label
              key={source}
              className="flex cursor-pointer items-center gap-2.5 rounded-control px-1.5 py-1.5 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => onChange(on ? selected.filter((entry) => entry !== source) : [...selected, source])}
                className="size-4 shrink-0 accent-[var(--accent)]"
              />
              <meta.icon size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1">
                <span className="type-body-sm block text-text-primary">{meta.label}</span>
                <span className="type-label block text-text-muted">{meta.reads}</span>
              </span>
              <span
                className={cn(
                  "type-label shrink-0",
                  status.state === "failed" ? "text-negative" : status.state === "unavailable" ? "text-caution" : "text-text-muted",
                )}
              >
                {status.label}
              </span>
            </label>
          );
        })}
        <button
          type="button"
          onClick={() => onChange(all ? [] : [...CONTEXT_SOURCES])}
          className="type-label mt-1 self-start rounded-chip px-1.5 py-1 text-text-secondary hover:text-text-primary"
        >
          {all ? "Leave everything out" : "Include everything"}
        </button>
      </div>
    </Popover>
  );
}

function AttachmentChip({ file, onRemove }: { file: ComposerAttachment; onRemove: () => void }) {
  return (
    <li className="flex max-w-56 items-center gap-2 rounded-control border border-border-subtle bg-surface-raised py-1 pl-1 pr-1">
      {file.previewUrl !== null ? (
        /* eslint-disable-next-line @next/next/no-img-element -- a local data URL thumbnail */
        <img src={file.previewUrl} alt="" className="size-8 shrink-0 rounded-chip object-cover" />
      ) : (
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-chip bg-surface-base text-text-secondary">
          {file.kind === "image" ? <ImageIcon size={15} strokeWidth={1.5} /> : <FileText size={15} strokeWidth={1.5} />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="type-label block truncate text-text-primary" title={file.name}>
          {file.name}
        </span>
        <span className="type-label block text-text-muted">{describeSize(file)}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${file.name}`}
        className="grid size-7 shrink-0 place-items-center rounded-chip text-text-muted hover:bg-surface-hover hover:text-text-primary"
      >
        <X size={13} strokeWidth={1.75} aria-hidden />
      </button>
    </li>
  );
}

export function Composer({
  draft,
  onDraftChange,
  attachments,
  onAttachmentsChange,
  selected,
  onSelectedChange,
  statuses,
  pending,
  canSend,
  onSend,
  onStop,
  error,
  dictation,
  inputRef,
}: {
  draft: string;
  onDraftChange: (draft: string) => void;
  attachments: ComposerAttachment[];
  onAttachmentsChange: (next: ComposerAttachment[]) => void;
  selected: readonly ContextSource[];
  onSelectedChange: (next: ContextSource[]) => void;
  statuses: Record<SourceKey, SourceStatus>;
  pending: boolean;
  /** Signed in, with somewhere to send it. */
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
  /** Why the last question was refused, or a file was not added. */
  error: string | null;
  dictation: Dictation;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const ready = canSend && !pending && (draft.trim().length > 0 || attachments.length > 0);
  const listening = dictation.status === "listening" || dictation.status === "recording";

  /* Grows with what is written, up to a cap, then scrolls inside. */
  useEffect(() => {
    const node = inputRef.current;
    if (node === null) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, MAX_INPUT_PX)}px`;
  }, [draft, inputRef]);

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const { added, errors } = await readAttachments(files, attachments);
    setFileErrors(errors);
    if (added.length > 0) onAttachmentsChange([...attachments, ...added]);
  };

  const submit = () => {
    if (!ready) return;
    if (listening) dictation.stop();
    setFileErrors([]);
    onSend();
  };

  const messages = [...(error === null ? [] : [error]), ...fileErrors, ...(dictation.error === null ? [] : [dictation.error])];

  return (
    <div className="shrink-0 px-4 pb-3 pt-2 compact:px-6 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        className={cn(
          "mx-auto w-full max-w-[880px] rounded-panel border border-border-subtle bg-surface-raised",
          "transition-colors duration-[var(--dur-fast)] ease-brand focus-within:border-border-strong",
        )}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          void addFiles([...event.dataTransfer.files]);
        }}
      >
        <div className="flex items-start gap-1.5 border-b border-border-subtle px-3 py-2">
          <span className="type-label flex h-8 shrink-0 items-center pr-1 text-text-secondary">Using</span>
          {/* Wraps onto a second line on a narrow screen; nothing overlaps
              and nothing hides off the edge. */}
          <div role="group" aria-label="Context for the next question" className="flex min-w-0 flex-1 flex-wrap gap-1.5">
            {CONTEXT_SOURCES.map((source) => (
              <SourceChip
                key={source}
                source={source}
                on={selected.includes(source)}
                status={statuses[CHIP_SOURCE[source]]}
                onToggle={() =>
                  onSelectedChange(
                    selected.includes(source) ? selected.filter((entry) => entry !== source) : [...selected, source],
                  )
                }
              />
            ))}
          </div>
          <ContextSettings selected={selected} statuses={statuses} onChange={onSelectedChange} />
        </div>

        {attachments.length > 0 && (
          <ul aria-label="Attached files" className="flex list-none flex-wrap gap-1.5 px-3 pt-3">
            {attachments.map((file) => (
              <AttachmentChip
                key={file.id}
                file={file}
                onRemove={() => onAttachmentsChange(attachments.filter((entry) => entry.id !== file.id))}
              />
            ))}
          </ul>
        )}

        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            /* Enter sends; Shift+Enter is a new line; Enter that confirms an
               IME composition (Japanese, Chinese, Korean input) is neither. */
            if (event.key !== "Enter" || event.shiftKey) return;
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
            event.preventDefault();
            submit();
          }}
          onPaste={(event) => {
            const files = [...event.clipboardData.files];
            if (files.length === 0) return;
            event.preventDefault();
            void addFiles(files);
          }}
          placeholder={listening ? "Listening…" : "Ask Elyra about your capital…"}
          aria-label="Ask Elyra about your capital"
          className={cn(
            "type-body block w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-text-primary",
            "placeholder:text-text-muted focus-visible:outline-none",
          )}
          style={{ maxHeight: MAX_INPUT_PX }}
        />

        <div className="flex flex-wrap items-center gap-1 px-2.5 pb-2.5 pt-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              void addFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
          <Tip label="Attach images, PDFs or text files">
            <button
              type="button"
              aria-label="Attach files"
              onClick={() => fileRef.current?.click()}
              className="grid size-9 place-items-center rounded-control text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
            >
              <Paperclip size={18} strokeWidth={1.5} aria-hidden />
            </button>
          </Tip>
          {dictation.mode !== null && (
            <Tip label={listening ? "Stop dictating" : dictation.status === "transcribing" ? "Writing it out…" : "Dictate — words go into the box, nothing is sent"}>
              <button
                type="button"
                aria-label={listening ? "Stop dictating" : "Dictate your question"}
                aria-pressed={listening}
                disabled={dictation.status === "transcribing"}
                onClick={() => (listening ? dictation.stop() : dictation.start())}
                className={cn(
                  "grid size-9 place-items-center rounded-control transition-colors duration-[var(--dur-fast)] ease-brand disabled:opacity-60",
                  listening ? "bg-surface-hover text-accent" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <Mic size={18} strokeWidth={1.5} aria-hidden className={cn(listening && "motion-safe:animate-pulse")} />
              </button>
            </Tip>
          )}
          {dictation.status === "recording" && (
            <span className="type-label tabular-nums text-text-muted" aria-live="polite">
              Recording {dictation.elapsed}s
            </span>
          )}

          <span aria-hidden className="flex-1" />
          <span className="type-label hidden pr-2 text-text-muted compact:inline">
            {pending ? "Answering…" : "Enter to send"}
          </span>
          {pending ? (
            <Tip label="Stop generating">
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                className="grid size-9 place-items-center rounded-control border border-border-strong text-text-primary transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
              >
                <Square size={13} strokeWidth={2} aria-hidden className="fill-current" />
              </button>
            </Tip>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!ready}
              aria-label="Send"
              className={cn(
                "grid size-9 place-items-center rounded-control transition-colors duration-[var(--dur-fast)] ease-brand",
                ready
                  ? "bg-accent text-text-on-accent hover:bg-accent-hover"
                  : "bg-surface-hover text-text-muted",
              )}
            >
              <SendHorizontal size={17} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {messages.length > 0 ? (
        <ul role="alert" className="mx-auto mt-1.5 flex w-full max-w-[880px] list-none flex-col gap-0.5">
          {messages.map((message) => (
            <li key={message} className="type-label text-negative">
              {message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-label mx-auto mt-1.5 w-full max-w-[880px] text-center text-text-muted">
          Grounded in connected data and preferences you save.
        </p>
      )}
    </div>
  );
}
