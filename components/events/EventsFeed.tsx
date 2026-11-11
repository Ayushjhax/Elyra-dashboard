"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ExternalLink, Heart, History, Link2, Newspaper, ShieldAlert } from "lucide-react";
import { SkeletonRows } from "@/components/portfolio/primitives";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { ElyraMark } from "@/components/ui/ElyraMark";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCopy } from "@/lib/clipboard";
import { formatAmountUsd } from "@/lib/events/feed";
import { CATEGORY_LABEL, FILTERS, type EventFilter, type EventItem, type EventsPage } from "@/lib/events/types";
import { formatRelativeTime } from "@/lib/format";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Events: crypto's history and what is happening now, as a feed.

   Only Elyra's AI posts here, and only from time to time — a hack as soon
   as DefiLlama records it, a large one-day move in BTC, ETH or SOL, and
   "on this day". Beneath that is the history: every recorded hack of $5
   million or more since 2011 (DefiLlama's record) and the collapses,
   upgrades, halvings, ETFs and laws that shaped the market. People like,
   save and share; nobody else posts, so there is nothing to moderate.
--------------------------------------------------------------------------- */

const SOURCE_LINE: Record<EventItem["source"], string> = {
  ai: "Elyra",
  defillama: "Hack record",
  history: "Elyra history",
};

const CATEGORY_TONE: Partial<Record<EventItem["category"], string>> = {
  hack: "border-negative/40 text-negative",
  collapse: "border-negative/40 text-negative",
  upgrade: "border-sage/45 text-positive",
  halving: "border-sage/45 text-positive",
  etf: "border-accent-quiet text-text-primary",
  regulation: "border-accent-quiet text-text-primary",
};

const dateOf = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function Avatar({ item }: { item: EventItem }) {
  if (item.source === "ai") return <ElyraMark size={36} className="size-9 self-start rounded-pill" />;
  const Icon = item.source === "defillama" ? ShieldAlert : History;
  return (
    <span aria-hidden className="grid size-9 shrink-0 self-start place-items-center rounded-pill border border-border-subtle bg-surface-base text-text-secondary">
      <Icon size={16} strokeWidth={1.5} />
    </span>
  );
}

function Post({
  item,
  now,
  onMark,
}: {
  item: EventItem;
  now: number | null;
  onMark: (item: EventItem, mark: "like" | "save") => void;
}) {
  const { state, copy } = useCopy();
  const shareText = `${item.title} — ${dateOf(item.at)}${item.link !== null ? ` ${item.link.url}` : ""}`;
  return (
    <article id={item.key.replace(":", "-")} aria-labelledby={`${item.key}-title`} className="flex gap-3 rounded-panel border border-border-subtle bg-surface-raised p-4">
      <Avatar item={item} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="type-body-sm font-medium text-text-primary">{SOURCE_LINE[item.source]}</span>
          {item.source === "ai" && (
            <span className="type-label rounded-chip border border-accent-quiet px-1.5 text-text-secondary" title={item.model === "fallback" ? "Written by Elyra's code from the facts" : "Written by Elyra's AI from the facts"}>
              AI
            </span>
          )}
          <span className="type-label text-text-muted">
            ·{" "}
            {item.source === "ai" && now !== null ? (
              <time dateTime={item.at}>{formatRelativeTime(item.at, now)}</time>
            ) : (
              <time dateTime={item.at}>{dateOf(item.at)}</time>
            )}
          </span>
          <span className={cn("type-label ml-auto rounded-chip border px-1.5", CATEGORY_TONE[item.category] ?? "border-border-subtle text-text-secondary")}>
            {CATEGORY_LABEL[item.category]}
          </span>
        </header>
        <h3 id={`${item.key}-title`} className="type-body font-medium text-text-primary">
          {item.title}
        </h3>
        <p className="type-body-sm whitespace-pre-line text-text-secondary">{item.body}</p>
        {(item.amountUsd !== null || item.chains.length > 0 || item.detail !== null) && (
          <dl className="flex flex-wrap gap-x-4 gap-y-1">
            {item.amountUsd !== null && (
              <div className="flex gap-1.5">
                <dt className="type-label text-text-muted">{item.category === "hack" ? "Taken" : "Amount"}</dt>
                <dd className="type-data-sm text-text-primary">{formatAmountUsd(item.amountUsd)}</dd>
              </div>
            )}
            {item.returnedUsd !== null && (
              <div className="flex gap-1.5">
                <dt className="type-label text-text-muted">Returned</dt>
                <dd className="type-data-sm text-positive">{formatAmountUsd(item.returnedUsd)}</dd>
              </div>
            )}
            {item.detail !== null && (
              <div className="flex min-w-0 gap-1.5">
                <dt className="type-label text-text-muted">How</dt>
                <dd className="type-label min-w-0 text-text-secondary">{item.detail}</dd>
              </div>
            )}
            {item.chains.length > 0 && (
              <div className="flex min-w-0 gap-1.5">
                <dt className="type-label text-text-muted">{item.chains.length === 1 ? "Chain" : "Chains"}</dt>
                <dd className="type-label min-w-0 text-text-secondary">{item.chains.slice(0, 6).join(", ")}</dd>
              </div>
            )}
          </dl>
        )}
        {item.link !== null && (
          <a
            href={item.link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="type-label inline-flex w-fit items-center gap-1 text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Source: {item.link.label}
            <ExternalLink size={12} strokeWidth={1.5} aria-hidden />
          </a>
        )}
        <footer className="-ml-2 flex items-center gap-1">
          <button
            type="button"
            aria-pressed={item.liked}
            aria-label={`${item.liked ? "Unlike" : "Like"}: ${item.title}`}
            onClick={() => onMark(item, "like")}
            className={cn(
              "type-label inline-flex h-9 items-center gap-1.5 rounded-control px-2 transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
              item.liked ? "text-negative" : "text-text-muted hover:text-text-primary",
            )}
          >
            <Heart size={15} strokeWidth={1.5} aria-hidden className={cn(item.liked && "fill-current")} />
            {item.likes > 0 && <span className="tabular-nums">{item.likes}</span>}
          </button>
          <button
            type="button"
            aria-pressed={item.saved}
            aria-label={`${item.saved ? "Remove from saved" : "Save"}: ${item.title}`}
            onClick={() => onMark(item, "save")}
            className={cn(
              "type-label inline-flex h-9 items-center gap-1.5 rounded-control px-2 transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
              item.saved ? "text-accent" : "text-text-muted hover:text-text-primary",
            )}
          >
            <Bookmark size={15} strokeWidth={1.5} aria-hidden className={cn(item.saved && "fill-current")} />
            {item.saved ? "Saved" : "Save"}
          </button>
          <button
            type="button"
            aria-label={`Copy: ${item.title}`}
            onClick={() => void copy(shareText)}
            className="type-label inline-flex h-9 items-center gap-1.5 rounded-control px-2 text-text-muted transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary"
          >
            <Link2 size={15} strokeWidth={1.5} aria-hidden />
            {state === "copied" ? "Copied" : "Share"}
          </button>
        </footer>
      </div>
    </article>
  );
}

export function EventsFeed() {
  const auth = useElyraAuth();
  const authedFetch = useAuthedFetch();
  const now = useMinute();
  const [filter, setFilter] = useState<EventFilter>("all");
  const [items, setItems] = useState<EventItem[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  /* Only the newest request's answer is kept; a slow earlier one is dropped. */
  const ticket = useRef(0);

  const read = useCallback(
    async (wanted: EventFilter, before: string | null): Promise<EventsPage | null> => {
      try {
        const params = new URLSearchParams({ filter: wanted });
        if (before !== null) params.set("before", before);
        const response = await authedFetch(`/api/events?${params.toString()}`, { cache: "no-store" });
        const body = (await response.json().catch(() => null)) as EventsPage | null;
        return body !== null && Array.isArray(body.items) ? body : null;
      } catch {
        return null;
      }
    },
    [authedFetch],
  );

  useEffect(() => {
    const mine = ++ticket.current;
    void read(filter, null).then((page) => {
      if (mine !== ticket.current) return;
      if (page === null) {
        setState("failed");
        return;
      }
      setItems(page.items);
      setNext(page.next);
      setError(page.error);
      setState("ready");
    });
  }, [filter, read, auth.authenticated]);

  const loadOlder = async () => {
    if (next === null) return;
    setMore(true);
    const mine = ticket.current;
    const page = await read(filter, next);
    setMore(false);
    if (page === null || mine !== ticket.current) return;
    setItems((current) => [...current, ...page.items.filter((item) => !current.some((existing) => existing.key === item.key))]);
    setNext(page.next);
  };

  const mark = async (item: EventItem, kind: "like" | "save") => {
    if (!auth.authenticated) {
      setNotice(kind === "like" ? "Sign in to like posts." : "Sign in to save posts.");
      return;
    }
    const on = kind === "like" ? !item.liked : !item.saved;
    const apply = (value: boolean) =>
      setItems((current) =>
        current.map((candidate) =>
          candidate.key !== item.key
            ? candidate
            : kind === "like"
              ? { ...candidate, liked: value, likes: Math.max(0, candidate.likes + (value ? 1 : -1)) }
              : { ...candidate, saved: value },
        ),
      );
    apply(on);
    setNotice(null);
    const response = await authedFetch("/api/events/marks", { method: "POST", body: JSON.stringify({ itemKey: item.key, mark: kind, on }) }).catch(() => null);
    if (response === null || !response.ok) {
      apply(!on);
      setNotice("That could not be saved. Try again.");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="type-label text-text-secondary">
        Elyra&apos;s AI posts here when something happens — a hack as it is recorded, a large move in BTC, ETH or SOL, and on this day in crypto. Below
        is the history.
      </p>
      <div role="group" aria-label="Show" className="flex flex-wrap gap-1.5">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filter === option.id}
            onClick={() => {
              if (option.id === filter) return;
              setState("loading");
              setFilter(option.id);
            }}
            className={cn(
              "type-label h-8 rounded-pill border px-3 transition-colors duration-[var(--dur-fast)] ease-brand",
              filter === option.id ? "border-accent bg-accent text-text-on-accent" : "border-border-subtle text-text-secondary hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {notice !== null && (
        <p role="status" className="type-body-sm flex flex-wrap items-center gap-2 text-text-secondary">
          {notice}
          {!auth.authenticated && auth.available && (
            <Button size="xs" variant="accent" onClick={auth.login}>
              Sign in
            </Button>
          )}
        </p>
      )}
      {error !== null && state === "ready" && <p className="type-label text-caution">{error}</p>}

      {state === "loading" ? (
        <SkeletonRows rows={6} />
      ) : state === "failed" ? (
        <EmptyState icon={Newspaper} title="The feed is unavailable" body="It could not be read just now. Try again shortly." />
      ) : items.length === 0 ? (
        filter === "saved" ? (
          <EmptyState
            icon={Bookmark}
            title={auth.authenticated ? "Nothing saved yet" : "Sign in to see what you saved"}
            body={auth.authenticated ? "Save a post and it appears here." : "Saved posts follow your account."}
            action={
              !auth.authenticated && auth.available ? (
                <Button size="sm" variant="accent" onClick={auth.login}>
                  Sign in
                </Button>
              ) : undefined
            }
          />
        ) : (
          <EmptyState icon={Newspaper} title="Nothing here yet" body="No events in this view." />
        )
      ) : (
        <>
          <ol className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item.key}>
                <Post item={item} now={now} onMark={(target, kind) => void mark(target, kind)} />
              </li>
            ))}
          </ol>
          {next !== null && (
            <Button variant="quiet" onClick={() => void loadOlder()} disabled={more} className="self-center">
              {more ? "Loading…" : "Older events"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
