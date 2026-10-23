"use client";

import { useMemo, useState } from "react";
import { MessageSquare, RefreshCw, Search, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatRelativeTime } from "@/lib/format";
import { usePersonalizedConversations } from "@/lib/personalized/client";
import type { PersonalizedConversation } from "@/lib/personalized/types";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Past conversations, from the same store every turn is written to.

   Read when the drawer opens rather than kept polling: the list only changes
   when the person talks, and they are not talking while it is open. Search
   filters what was read — titles are the first line of each conversation.
--------------------------------------------------------------------------- */

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function HistoryDrawer({
  open,
  onOpenChange,
  activeId,
  onOpenConversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeId: string | null;
  onOpenConversation: (conversation: PersonalizedConversation) => void;
}) {
  const feed = usePersonalizedConversations(open);
  const now = useMinute();
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle.length === 0
      ? feed.conversations
      : feed.conversations.filter((conversation) => conversation.title.toLowerCase().includes(needle));
  }, [feed.conversations, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent side="right" surface="panel" className="w-[min(380px,calc(100vw-24px))] p-0">
        <DialogHeader className="border-b border-border-subtle px-4 py-3">
          <DialogTitle className="type-h2 text-text-primary">History</DialogTitle>
          <DialogDescription className="type-body-sm text-text-secondary">Your Capital Intelligence conversations.</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border-subtle px-4 py-3">
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search size={15} strokeWidth={1.5} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search conversations"
              className={cn(
                "type-body-sm h-9 w-full rounded-control border border-border-subtle bg-surface-base pl-9 pr-3 text-text-primary",
                "placeholder:text-text-muted hover:border-border-strong focus-visible:border-accent-quiet",
              )}
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2" aria-busy={feed.loading}>
          {feed.loading && feed.conversations.length === 0 ? (
            <ul aria-label="Loading conversations" className="flex list-none flex-col gap-1">
              {[0, 1, 2, 3].map((index) => (
                <li key={index} aria-hidden className="flex flex-col gap-1.5 px-2 py-2.5">
                  <span className="skeleton h-3.5 w-3/4" />
                  <span className="skeleton h-3 w-20" />
                </li>
              ))}
            </ul>
          ) : feed.error !== null ? (
            <div role="alert" className="flex flex-col items-start gap-2 px-2 py-4">
              <p className="type-body-sm text-negative">{feed.error}</p>
              <button
                type="button"
                onClick={feed.refetch}
                className="type-body-sm inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong px-3 text-text-primary hover:bg-surface-hover"
              >
                <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
                Try again
              </button>
            </div>
          ) : feed.conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <MessageSquare size={20} strokeWidth={1.5} aria-hidden className="text-text-muted" />
              <p className="type-body-sm mt-1 text-text-primary">No conversations yet</p>
              <p className="type-label text-text-muted">What you ask Elyra here is kept, so you can pick a thread back up.</p>
            </div>
          ) : shown.length === 0 ? (
            <p className="type-body-sm px-2 py-6 text-center text-text-muted">Nothing matches &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            <ul className="flex list-none flex-col gap-0.5">
              {shown.map((conversation) => {
                const active = conversation.id === activeId;
                return (
                  <li key={conversation.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => {
                        onOpenConversation(conversation);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-control border px-2.5 py-2 text-left",
                        "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
                        active ? "border-accent-quiet bg-surface-hover" : "border-transparent",
                      )}
                    >
                      <span className="type-body-sm w-full truncate text-text-primary">{conversation.title}</span>
                      <time dateTime={conversation.updatedAt} title={when(conversation.updatedAt)} className="type-label text-text-muted">
                        {now === null ? when(conversation.updatedAt) : formatRelativeTime(conversation.updatedAt, now)}
                      </time>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete “${conversation.title}”`}
                      disabled={removing === conversation.id}
                      onClick={() => {
                        setRemoving(conversation.id);
                        void feed.remove(conversation.id).finally(() => setRemoving(null));
                      }}
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-control text-text-muted",
                        "opacity-60 transition-[opacity,color,background-color] duration-[var(--dur-fast)] ease-brand",
                        "hover:bg-negative-bg hover:text-negative group-hover:opacity-100 focus-visible:opacity-100 disabled:opacity-40",
                      )}
                    >
                      <Trash2 size={14} strokeWidth={1.5} aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
