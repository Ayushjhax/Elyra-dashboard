"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  History,
  Plus,
  Square,
  Trash2,
} from "lucide-react";
import { AssistantTurn, UserTurn } from "@/components/personalized/AnswerBlocks";
import { Skeleton } from "@/components/portfolio/primitives";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { usePersonalizedConversations, type ChatFeed } from "@/lib/personalized/client";
import { formatRelativeTime } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The conversation column.

   The first screen is never blank. Before anything is asked, it states what
   Elyra already knows — equity, largest exposure, open positions — and offers
   prompts generated from that state rather than a fixed list. A suggestion
   that would answer "you have no positions" is not shown, because advertising
   a capability and then demonstrating emptiness is worse than staying quiet.
--------------------------------------------------------------------------- */

function StatusLine({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1 rounded-pill bg-accent-quiet motion-safe:animate-pulse"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      {/* High-level progress only — never the model's reasoning. */}
      <span className="type-label text-text-muted">{status}</span>
    </div>
  );
}

function Welcome({
  lines,
  prompts,
  onPrompt,
  loading,
}: {
  lines: string[];
  prompts: string[];
  onPrompt: (prompt: string) => void;
  loading: boolean;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";

  if (loading) {
    return (
      <div className="flex flex-col gap-2 px-4 py-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-72" />
        <Skeleton className="h-3 w-56" />
        <div className="mt-2 flex gap-1.5">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-6 w-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-6">
      <div className="flex flex-col gap-1">
        <h2 className="type-panel-title text-text-primary">{greeting}</h2>
        {lines.length === 0 ? (
          <p className="type-body-sm max-w-prose text-text-secondary">
            I&rsquo;m ready to personalize around your capital once you fund or connect
            an account. I can still explain how Elyra works in the meantime.
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {lines.map((line) => (
              <p key={line} className="type-body-sm text-text-secondary">
                {line}
              </p>
            ))}
          </div>
        )}
      </div>

      {prompts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="type-body-sm text-text-primary">What do you want to look at?</p>
          <div className="flex flex-wrap gap-1.5">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onPrompt(prompt)}
                className={cn(
                  "type-label rounded-chip border border-border-subtle px-2 py-1 text-text-secondary",
                  "transition-colors duration-[var(--dur-fast)] ease-brand",
                  "hover:border-border-strong hover:bg-surface-hover hover:text-text-primary",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                )}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   History — a drawer, not a second permanent sidebar
--------------------------------------------------------------------------- */

function HistoryDrawer({
  open,
  onOpenChange,
  onOpenConversation,
  nonce,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenConversation: (id: string) => void;
  nonce: number;
}) {
  const { conversations, remove } = usePersonalizedConversations(nonce);
  const now = useMinute();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" surface="panel" className="p-0">
        <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
          <DialogTitle asChild>
            <Eyebrow>Conversations</Eyebrow>
          </DialogTitle>
          <DialogDescription className="sr-only">
            Your recent Personalized conversations.
          </DialogDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="type-label px-3 py-6 text-center text-text-muted">
              No conversations yet.
            </p>
          ) : (
            <ul className="flex list-none flex-col">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group flex items-center gap-1 px-2">
                  <button
                    type="button"
                    onClick={() => {
                      onOpenConversation(conversation.id);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-chip px-2 py-2 text-left",
                      "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                    )}
                  >
                    <span className="type-data-sm w-full truncate text-text-primary">
                      {conversation.title}
                    </span>
                    <span className="type-label text-text-muted">
                      {now === null ? "" : formatRelativeTime(conversation.updatedAt, now)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${conversation.title}`}
                    onClick={() => void remove(conversation.id)}
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-chip text-text-muted opacity-0",
                      "transition-[opacity,color] duration-[var(--dur-fast)] ease-brand",
                      "group-hover:opacity-100 hover:text-negative",
                      "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                    )}
                  >
                    <Trash2 size={11} strokeWidth={1.5} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
   Composer
--------------------------------------------------------------------------- */

function Composer({
  onSend,
  onStop,
  pending,
}: {
  onSend: (message: string) => void;
  onStop: () => void;
  pending: boolean;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Grows with the content up to a cap, so a long question is visible while
     being written without the composer eating the transcript. */
  useEffect(() => {
    const node = inputRef.current;
    if (node === null) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  function submit(): void {
    if (draft.trim().length === 0 || pending) return;
    onSend(draft);
    setDraft("");
  }

  return (
    <div className="shrink-0 border-t border-border-subtle p-3">
      <div
        className={cn(
          "flex items-end gap-2 rounded-card border border-border-subtle bg-surface-panel p-2",
          "transition-colors duration-[var(--dur-fast)] ease-brand focus-within:border-border-strong",
        )}
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Ask Elyra anything about your capital…"
          aria-label="Ask Elyra anything about your capital"
          className={cn(
            "type-body-sm max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1 py-1",
            "text-text-primary placeholder:text-text-muted focus-visible:outline-none",
          )}
        />

        {pending ? (
          <Button size="sm" variant="quiet" onClick={onStop} aria-label="Stop generating">
            <Square size={11} strokeWidth={2} aria-hidden />
            Stop
          </Button>
        ) : (
          <Button
            size="icon"
            variant="accent"
            onClick={submit}
            disabled={draft.trim().length === 0}
            aria-label="Send"
          >
            <ArrowUp size={14} strokeWidth={2} aria-hidden />
          </Button>
        )}
      </div>

      {/* Grounding, stated rather than hidden. These name what the assistant
          reads — they are not clickable prompts and expose no internal text. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="type-label text-text-muted">Grounded in</span>
        {["Portfolio", "Positions", "Activity", "Memory"].map((chip) => (
          <span
            key={chip}
            className="type-label rounded-chip border border-border-subtle px-1.5 py-0.5 text-text-muted"
          >
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The column
--------------------------------------------------------------------------- */

export function Conversation({
  chat,
  welcome,
  prompts,
  contextLoading,
}: {
  chat: ChatFeed;
  welcome: string[];
  prompts: string[];
  contextLoading: boolean;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyNonce, setHistoryNonce] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  /* Follow the transcript as it grows, but never yank the view while the
     operator is reading something further up. */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.turns.length, chat.status]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <Eyebrow>Conversation</Eyebrow>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="New conversation"
            title="New conversation"
            onClick={() => {
              chat.reset();
              setHistoryNonce((value) => value + 1);
            }}
            className={cn(
              "grid size-6 place-items-center rounded-chip text-text-muted",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            )}
          >
            <Plus size={13} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Conversation history"
            title="Conversation history"
            onClick={() => {
              setHistoryNonce((value) => value + 1);
              setHistoryOpen(true);
            }}
            className={cn(
              "grid size-6 place-items-center rounded-chip text-text-muted",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            )}
          >
            <History size={13} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto @container">
        {chat.turns.length === 0 ? (
          <Welcome
            lines={welcome}
            prompts={prompts}
            onPrompt={chat.send}
            loading={contextLoading}
          />
        ) : (
          <div className="flex flex-col gap-5 px-4 py-4">
            {chat.turns.map((turn) =>
              turn.role === "user" ? (
                <UserTurn key={turn.id} content={turn.content} />
              ) : (
                <AssistantTurn
                  key={turn.id}
                  answer={turn.answer}
                  content={turn.content}
                  onPrompt={chat.send}
                />
              ),
            )}
          </div>
        )}

        {chat.status !== null && (
          <div className="px-4 pb-4">
            <StatusLine status={chat.status} />
          </div>
        )}

        {chat.error !== null && (
          <div className="mx-4 mb-4 flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-3 py-2">
            <AlertTriangle
              size={13}
              strokeWidth={1.5}
              aria-hidden
              className="mt-0.5 shrink-0 text-negative"
            />
            <p className="type-label text-text-secondary">{chat.error}</p>
          </div>
        )}

        <div ref={endRef} />
      </div>

      <Composer onSend={chat.send} onStop={chat.stop} pending={chat.pending} />

      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onOpenConversation={chat.open}
        nonce={historyNonce}
      />
    </div>
  );
}
