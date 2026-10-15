"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Database,
  MessageSquare,
  Search,
  Settings,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { AssistantTurn, UserTurn } from "@/components/personalized/AnswerBlocks";
import { Money } from "@/components/portfolio/primitives";
import { ElyraMark } from "@/components/ui/ElyraMark";
import type { ChatFeed } from "@/lib/personalized/client";
import type { SourceStatus } from "@/lib/personalized/sources";
import type { DrawerView } from "@/lib/portfolio/drawer";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The conversation panel.

   Before the first question: a welcome and four ways to start. None of them
   asks anything on its own — three write an editable question into the
   composer, one opens the preference editor — so nothing about money runs
   without the person reading it and pressing send.

   After it: the transcript, scrolling on its own above a composer that never
   moves. The view follows a reply while the reader is at the bottom; once
   they scroll up it stays where they are and offers a way back down.
--------------------------------------------------------------------------- */

export type Starter = "portfolio" | "research" | "preferences" | "deposit";

const STARTERS: Array<{ id: Starter; title: string; body: string; icon: LucideIcon }> = [
  { id: "portfolio", title: "Review my portfolio", body: "Understand balances and allocation", icon: BarChart3 },
  { id: "research", title: "Research an asset", body: "Explore a market before you act", icon: Search },
  { id: "preferences", title: "Set my preferences", body: "Save the limits you choose", icon: Settings },
  { id: "deposit", title: "Plan my first deposit", body: "See how to get started", icon: WalletCards },
];

function greeting(now: number): string {
  const hour = new Date(now).getHours();
  return hour < 5 ? "Good evening." : hour < 12 ? "Good morning." : hour < 18 ? "Good afternoon." : "Good evening.";
}

/** One line on the wallet, saying only what the loaded data says. */
function WalletLine({ wallet, view, portfolioLoading }: { wallet: SourceStatus; view: DrawerView | null; portfolioLoading: boolean }) {
  let detail: React.ReactNode = null;
  if (view !== null) {
    if (view.unfunded) detail = "No assets yet";
    else if (view.totalUsd !== null) {
      const assets = view.holdings.filter((holding) => holding.verified).length;
      detail = (
        <>
          <Money value={view.totalUsd} className="text-text-primary" /> across {assets} {assets === 1 ? "asset" : "assets"}
        </>
      );
    }
  } else if (portfolioLoading) {
    detail = "Reading balances…";
  }

  const label =
    wallet.state === "connected"
      ? "Wallet connected"
      : wallet.state === "loading"
        ? "Checking your wallet…"
        : wallet.state === "failed"
          ? "Wallet unreachable"
          : wallet.label === "No wallet"
            ? "No wallet linked"
            : "Wallet unavailable";

  return (
    <div className="type-body-sm flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-text-secondary">
      <span className="inline-flex items-center gap-2">
        <WalletCards size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
        {label}
        {detail !== null && (
          <>
            <span aria-hidden>·</span>
            <span>{detail}</span>
          </>
        )}
      </span>
      <span aria-hidden className="hidden h-4 w-px bg-border-subtle compact:block" />
      <Link href="/portfolio" className="inline-flex items-center gap-1 rounded-chip font-medium text-accent transition-colors duration-[var(--dur-fast)] ease-brand hover:text-accent-hover">
        View portfolio
        <ArrowUpRight size={14} strokeWidth={1.75} aria-hidden />
      </Link>
    </div>
  );
}

function Welcome({
  onStarter,
  wallet,
  view,
  portfolioLoading,
}: {
  onStarter: (starter: Starter) => void;
  wallet: SourceStatus;
  view: DrawerView | null;
  portfolioLoading: boolean;
}) {
  const now = useMinute();
  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col items-center px-4 py-8 text-center compact:px-6">
      <ElyraMark size={56} className="rounded-pill" />
      {/* The clock is null until hydration; the line keeps its height. */}
      <p className="type-h2 mt-3 min-h-[22px] font-normal text-text-secondary">{now === null ? "" : greeting(now)}</p>
      <h2 className="type-display mt-1 text-balance text-text-primary">What&rsquo;s your next move?</h2>
      <p className="type-h2 mt-2 max-w-xl text-balance font-normal text-text-secondary">
        Understand your capital, explore a market, or think through a decision.
      </p>

      <ul className="mt-7 grid w-full list-none grid-cols-1 gap-3 @[34rem]:grid-cols-2">
        {STARTERS.map(({ id, title, body, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => onStarter(id)}
              className={cn(
                "group flex min-h-[88px] w-full items-center gap-4 rounded-panel border border-border-subtle bg-surface-panel px-5 py-4 text-left",
                "transition-colors duration-[var(--dur-fast)] ease-brand",
                "hover:border-accent-quiet hover:bg-surface-raised focus-visible:border-accent-quiet focus-visible:bg-surface-raised",
              )}
            >
              <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-control bg-surface-hover text-text-primary">
                <Icon size={20} strokeWidth={1.5} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="type-h2 block font-sans text-text-primary">{title}</span>
                <span className="type-body-sm block text-text-secondary">{body}</span>
              </span>
              <ArrowRight
                size={18}
                strokeWidth={1.5}
                aria-hidden
                className="shrink-0 text-text-secondary transition-colors duration-[var(--dur-fast)] group-hover:text-text-primary"
              />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <WalletLine wallet={wallet} view={view} portfolioLoading={portfolioLoading} />
      </div>
    </div>
  );
}

function Thinking({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-2" aria-live="polite">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-1.5 rounded-pill bg-accent-quiet motion-safe:animate-pulse"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      {/* High-level progress only — never the model's reasoning. */}
      <span className="type-body-sm text-text-muted">{status}</span>
    </div>
  );
}

/** Within this many pixels of the bottom counts as following the reply. */
const FOLLOW_SLACK = 80;

export function ConversationPanel({
  chat,
  contextOn,
  onStarter,
  onPrompt,
  wallet,
  view,
  portfolioLoading,
  composer,
}: {
  chat: ChatFeed;
  contextOn: boolean;
  onStarter: (starter: Starter) => void;
  /** A suggested follow-up, written into the composer — never sent on its own. */
  onPrompt: (prompt: string) => void;
  wallet: SourceStatus;
  view: DrawerView | null;
  portfolioLoading: boolean;
  composer: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const active = chat.turns.length > 0 || chat.opening || chat.openError !== null;

  const toBottom = useCallback((smooth: boolean) => {
    const node = scroller.current;
    if (node === null) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollTo({ top: node.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
  }, []);

  /* A new turn, a status change, an answer landing: follow it if the reader
     is following, otherwise leave them where they are. */
  useLayoutEffect(() => {
    if (active && following.current) toBottom(false);
  }, [active, chat.turns, chat.status, chat.opening, toBottom]);

  /* A fresh or reopened conversation starts at its end. */
  useEffect(() => {
    following.current = true;
  }, [chat.conversationId]);

  const title = chat.title ?? "New conversation";

  return (
    <section aria-label="Conversation" className="flex min-h-0 min-w-0 flex-col rounded-panel border border-border-subtle bg-surface-panel">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border-subtle px-4 compact:px-5">
        <MessageSquare size={18} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-secondary" />
        <h2 className="type-body min-w-0 flex-1 truncate font-medium text-text-primary" title={title}>
          {title}
        </h2>
        <span
          className={cn("type-label inline-flex shrink-0 items-center gap-2", contextOn ? "text-text-secondary" : "text-text-muted")}
          title={contextOn ? "Questions read the sources switched on in the composer" : "No account sources are switched on"}
        >
          <Database size={15} strokeWidth={1.5} aria-hidden className="text-text-muted" />
          <span aria-hidden className={cn("size-2 rounded-pill", contextOn ? "bg-sage" : "bg-text-muted")} />
          <span className="hidden compact:inline">{contextOn ? "Account context on" : "Account context off"}</span>
          <span className="sr-only compact:hidden">{contextOn ? "Account context on" : "Account context off"}</span>
        </span>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onScroll={(event) => {
            const node = event.currentTarget;
            const atBottom = node.scrollHeight - node.scrollTop - node.clientHeight < FOLLOW_SLACK;
            following.current = atBottom;
            setShowJump(!atBottom && active);
          }}
          className="h-full overflow-y-auto overflow-x-hidden @container"
        >
          {!active ? (
            <Welcome onStarter={onStarter} wallet={wallet} view={view} portfolioLoading={portfolioLoading} />
          ) : (
            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-6 compact:px-6">
              {chat.opening && (
                <div aria-busy="true" aria-label="Opening conversation" className="flex flex-col gap-4">
                  <span className="skeleton ml-auto h-10 w-2/3 rounded-panel" />
                  <span className="skeleton h-4 w-full" />
                  <span className="skeleton h-4 w-5/6" />
                  <span className="skeleton h-4 w-3/5" />
                </div>
              )}
              {chat.openError !== null && (
                <p role="alert" className="type-body-sm rounded-control border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
                  {chat.openError}
                </p>
              )}
              {chat.turns.map((turn) =>
                turn.role === "user" ? (
                  <UserTurn
                    key={turn.id}
                    turn={turn}
                    canRetry={!chat.pending}
                    onRetry={turn.outcome !== undefined && turn.request !== undefined ? () => chat.retry(turn.id) : undefined}
                  />
                ) : (
                  <AssistantTurn key={turn.id} answer={turn.answer} content={turn.content} onPrompt={onPrompt} />
                ),
              )}
              {chat.status !== null && <Thinking status={chat.status} />}
            </div>
          )}
        </div>

        {showJump && (
          <button
            type="button"
            onClick={() => {
              following.current = true;
              setShowJump(false);
              toBottom(true);
            }}
            className={cn(
              "type-label absolute bottom-3 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-pill border border-border-strong",
              "bg-surface-raised px-3 text-text-primary shadow-pop transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
            )}
          >
            <ArrowDown size={13} strokeWidth={1.75} aria-hidden />
            Jump to latest
          </button>
        )}
      </div>

      {composer}
    </section>
  );
}
