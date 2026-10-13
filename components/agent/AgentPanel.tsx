"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  ChevronRight,
  Maximize2,
  Minimize2,
  Minus,
  SendHorizontal,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { DecisionBrief } from "@/components/agent/DecisionBrief";
import { ElyraSignals } from "@/components/agent/ElyraSignals";
import { PendingActions } from "@/components/agent/PendingActions";
import { SmartMoneyPanel } from "@/components/panels/SmartMoneyPanel";
import { sendToAgent } from "@/lib/agentChat";
import { formatClock } from "@/lib/format";
import { useAssets } from "@/lib/market/usePrices";
import { suggestionChips } from "@/lib/agent/suggestions";
import { useElyraStore } from "@/lib/store";
import type { AgentTab, ChatMessage, ToolCall } from "@/lib/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Elyra — the agent panel.

   One component for the column (from 1280px) and the drawer (below it). It
   holds no conversation state of its own: messages, the request in flight
   and the half-typed draft are all in the store, and the request itself runs
   in lib/agentChat.ts. So the panel can be closed, resized or swapped between
   column and drawer mid-answer and lose nothing.

   Its height is the parent's — the column measures itself to the viewport, the
   drawer is the viewport — and inside it the header and composer are fixed
   while the view between them scrolls on its own (`min-h-0` all the way
   down), so no amount of conversation can push the composer off screen.
--------------------------------------------------------------------------- */

/** Roughly five lines of body type before the composer starts scrolling. */
const COMPOSER_MAX_HEIGHT = 120;

/** Within this many px of the end counts as "at the bottom". */
const BOTTOM_SLOP = 72;

const TABS: Array<{ value: AgentTab; label: string }> = [
  { value: "ask", label: "Ask Elyra" },
  { value: "signals", label: "Signals" },
  { value: "research", label: "Research" },
];

/**
 * A tool the agent ran. Collapsed it is one row naming the call; expanded it
 * shows the rows the agent actually read, so the answer can be checked
 * against its evidence.
 */
function ToolCallBlock({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="overflow-hidden rounded-control border border-border-subtle bg-surface-panel">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
      >
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn("shrink-0 text-text-muted transition-transform", open && "rotate-90")}
        />
        <Wrench size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
        <span className="type-data-sm min-w-0 flex-1 truncate text-text-secondary">{call.label}</span>
        <span className="type-label shrink-0 text-text-muted">{call.rows.length} rows</span>
      </button>
      <div id={panelId} hidden={!open} className="overflow-x-auto border-t border-border-subtle">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{call.label}</caption>
          <thead>
            <tr>
              {call.columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={cn(
                    "type-label h-7 whitespace-nowrap border-b border-border-subtle px-2 font-medium text-text-muted",
                    index === 0 ? "text-left" : "text-right",
                  )}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {call.rows.map((row, rowIndex) => (
              <tr key={`${call.id}-${rowIndex}`} className="border-b border-border-subtle last:border-b-0">
                {row.map((cell, cellIndex) => (
                  <td
                    key={`${call.id}-${rowIndex}-${cellIndex}`}
                    className={cn(
                      "type-data-sm h-[var(--row-h-sm)] whitespace-nowrap px-2 text-text-secondary",
                      cellIndex === 0 ? "text-left" : "text-right",
                    )}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {call.note && (
          <p className="type-label border-t border-border-subtle px-2 py-1.5 text-text-muted">{call.note}</p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  thinking,
}: {
  message: ChatMessage;
  streaming: boolean;
  /** The request is in flight and this bubble is where the reply will land. */
  thinking: boolean;
}) {
  const isAgent = message.role === "agent";

  return (
    <li className={cn("flex", isAgent ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-card px-3 py-2.5",
          /* The signature rule: what the machine wrote carries the lime rail. */
          isAgent ? "agent-rail w-full rounded-l-none bg-surface-raised" : "max-w-[85%] bg-surface-hover",
        )}
      >
        {isAgent && message.toolCall && <ToolCallBlock call={message.toolCall} />}

        {thinking ? (
          /* The line that reports the state, and what a screen reader gets. */
          <p aria-live="polite" className="type-body-sm flex items-center gap-2 text-text-secondary">
            <Sparkles size={14} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {message.activity ? `Reading ${message.activity}…` : "Elyra is working…"}
          </p>
        ) : (
          <p
            className={cn(
              "type-body-sm whitespace-pre-wrap break-words text-text-primary",
              streaming && "stream-caret",
            )}
          >
            {message.text}
          </p>
        )}

        {!thinking && isAgent && !streaming && message.sources && message.sources.length > 0 && (
          <p className="type-data-sm text-text-muted">
            <span className="text-text-secondary">Sources</span> · {message.sources.join(" · ")}
          </p>
        )}

        {!thinking && (
          <time
            dateTime={message.at}
            className={cn("type-data-sm text-text-muted", isAgent ? "text-left" : "text-right")}
          >
            {formatClock(message.at)} UTC
          </time>
        )}
      </div>
    </li>
  );
}

function Conversation({
  symbol,
  onAsk,
  lead,
}: {
  symbol: string;
  onAsk: (prompt: string) => void;
  /** Shown above the messages and scrolled with them: the decision brief and
      anything awaiting review. */
  lead?: React.ReactNode;
}) {
  const messages = useElyraStore((state) => state.messages);
  const pending = useElyraStore((state) => state.agentPending);
  const streamingId = useElyraStore((state) => state.streamingId);
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Where the reader is. Written only from the scroll handler, so following
     the conversation never needs a setState inside an effect. */
  const [atBottom, setAtBottom] = useState(true);
  const last = messages.at(-1);
  const key = `${messages.length}:${last?.id ?? ""}:${last?.text.length ?? 0}`;
  const [seenKey, setSeenKey] = useState(key);

  /* Follow the conversation only when the reader is already at the end of
     it. Someone who scrolled up to read an older answer keeps their place,
     and is offered a way back instead. */
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node && atBottom) node.scrollTop = node.scrollHeight;
  }, [key, atBottom]);

  const onScroll = () => {
    const node = scrollRef.current;
    if (!node) return;
    const bottom = node.scrollHeight - node.scrollTop - node.clientHeight < BOTTOM_SLOP;
    setAtBottom(bottom);
    if (bottom) setSeenKey(key);
  };

  const jump = () => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  };

  const unseen = !atBottom && seenKey !== key;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4"
      >
        {lead && <div className="mb-4 flex flex-col gap-3">{lead}</div>}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <span className="inline-flex size-11 items-center justify-center rounded-card bg-surface-active text-agent-accent">
              <Sparkles size={20} strokeWidth={1.5} aria-hidden />
            </span>
            <div>
              <p className="type-panel-title text-text-primary">Ask about {symbol || "a market"}</p>
              <p className="type-body-sm mx-auto mt-1 max-w-[30ch] text-text-secondary">
                Elyra reads live prices, funding and open interest, and your connected
                accounts. It never places orders.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAsk(`Give me a brief on ${symbol || "the market"} right now.`)}
              className="type-label rounded-control border border-border-strong px-3 py-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              Brief me on {symbol || "the market"}
            </button>
          </div>
        ) : (
          <ul aria-label="Conversation" className="flex list-none flex-col gap-3">
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                streaming={message.id === streamingId}
                /* `sendToAgent` appends the reply empty and fills it when the
                   answer lands, so the empty one at the end is being waited on. */
                thinking={
                  pending &&
                  index === messages.length - 1 &&
                  message.role === "agent" &&
                  message.text.length === 0
                }
              />
            ))}
          </ul>
        )}
      </div>

      {unseen && (
        <button
          type="button"
          onClick={jump}
          className={cn(
            "type-label absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-pill",
            "border border-border-strong bg-surface-raised px-3 py-1.5 text-text-primary shadow-pop",
            "transition-colors hover:bg-surface-hover",
          )}
        >
          <ArrowDown size={14} strokeWidth={1.5} aria-hidden />
          New messages
        </button>
      )}
    </div>
  );
}

function Composer({
  symbol,
  onAsk,
  showChips,
}: {
  symbol: string;
  onAsk: (prompt: string) => void;
  /** Suggested questions belong to the conversation; the other views get
      their height back. */
  showChips: boolean;
}) {
  const auth = useElyraAuth();
  const draft = useElyraStore((state) => state.composerDraft);
  const setDraft = useElyraStore((state) => state.setComposerDraft);
  const focusNonce = useElyraStore((state) => state.composerFocusNonce);
  const pending = useElyraStore((state) => state.agentPending);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const composerId = useId();

  /* Another surface asked for the composer. */
  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus();
  }, [focusNonce]);

  /* Grow to five lines, then scroll. */
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  const signedOut = auth.available && auth.ready && !auth.authenticated;
  const canSend = draft.trim().length > 0 && !pending;
  const chips = symbol && showChips ? suggestionChips(symbol) : [];

  return (
    <div className="shrink-0 border-t border-border-subtle p-4">
      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Suggested questions" role="group">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={pending}
              onClick={() => onAsk(chip)}
              className={cn(
                "type-label inline-flex items-center gap-1.5 rounded-control border border-border-subtle px-2.5 py-1.5",
                "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
                "hover:border-border-strong hover:bg-surface-hover hover:text-text-primary",
                "disabled:opacity-50",
              )}
            >
              {chip}
              <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden className="text-text-muted" />
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          onAsk(draft);
        }}
        className={cn(
          "flex items-end gap-2 rounded-card border border-border-strong bg-surface-raised p-2",
          "focus-within:border-accent-quiet",
        )}
      >
        <label htmlFor={composerId} className="sr-only">
          Ask Elyra
        </label>
        <textarea
          id={composerId}
          ref={inputRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onAsk(draft);
            }
          }}
          placeholder={signedOut ? "Sign in to ask Elyra…" : pending ? "Elyra is working…" : "Ask Elyra anything…"}
          className={cn(
            "type-body-sm min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5",
            "text-text-primary placeholder:text-text-muted focus:outline-none",
          )}
        />
        <button
          type="submit"
          aria-label="Send message"
          disabled={!canSend}
          className={cn(
            "inline-flex size-8 shrink-0 items-center justify-center rounded-control",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            canSend ? "bg-accent text-text-on-accent hover:bg-accent-hover" : "text-text-muted",
          )}
        >
          <SendHorizontal size={15} strokeWidth={1.5} aria-hidden />
        </button>
      </form>
      <p className="type-label mt-2 text-text-muted">Enter to send · Shift+Enter for a new line</p>
    </div>
  );
}

export function AgentPanel({
  onClose,
  className,
  expanded,
  onToggleExpand,
}: {
  /** Minimize: the column folds away, or the drawer closes. */
  onClose: () => void;
  className?: string;
  /** The column is at its widest. Absent in the drawer, which has no width. */
  expanded?: boolean;
  onToggleExpand?: () => void;
}) {
  const auth = useElyraAuth();
  const tab = useElyraStore((state) => state.agentTab);
  const setTab = useElyraStore((state) => state.setAgentTab);
  const pending = useElyraStore((state) => state.agentPending);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const asset = byId.get(selectedAssetId);
  const symbol = asset?.symbol ?? "";
  const tabsId = useId();

  /* Every way of asking — the composer, a suggestion, the empty state, a
     signal card — goes through here, and lands on the conversation. */
  const ask = (prompt: string) => {
    if (prompt.trim().length === 0) return;
    setTab("ask");
    if (!auth.authenticated) {
      useElyraStore.getState().setComposerDraft(prompt);
      if (auth.available) auth.login();
      return;
    }
    void sendToAgent(prompt, auth.getAccessToken);
  };

  const status = pending
    ? { dot: "bg-agent-accent", text: "Working on your request" }
    : !auth.available
      ? { dot: "bg-text-muted", text: "Sign-in is not configured" }
      : !auth.authenticated
        ? { dot: "bg-text-muted", text: "Sign in to ask" }
        : { dot: "bg-positive", text: "In sync" };

  const control =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary";

  return (
    <section
      aria-label="Elyra intelligence"
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-border-subtle bg-surface-panel",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3.5">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-card bg-surface-active text-agent-accent">
          <Sparkles size={17} strokeWidth={1.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="type-h2 truncate text-text-primary">Elyra intelligence</h2>
          <p aria-live="polite" className="type-label flex min-w-0 items-center gap-1.5 text-text-secondary">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", status.dot)} />
            <span className="truncate">
              {status.text}
              {asset ? ` · ${asset.symbol} · ${asset.name}` : ""}
            </span>
          </p>
        </div>
        {onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-pressed={expanded}
            aria-label={expanded ? "Restore Elyra's width" : "Widen Elyra"}
            title={expanded ? "Restore width" : "Widen"}
            className={control}
          >
            {expanded ? (
              <Minimize2 size={15} strokeWidth={1.5} aria-hidden />
            ) : (
              <Maximize2 size={15} strokeWidth={1.5} aria-hidden />
            )}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Minimize Elyra" title="Minimize" className={control}>
          <Minus size={17} strokeWidth={1.5} aria-hidden />
        </button>
      </header>

      <div role="tablist" aria-label="Elyra views" className="mt-2.5 flex shrink-0 gap-1 border-b border-border-subtle px-4">
        {TABS.map((entry) => {
          const active = entry.value === tab;
          return (
            <button
              key={entry.value}
              type="button"
              role="tab"
              id={`${tabsId}-${entry.value}`}
              aria-selected={active}
              aria-controls={`${tabsId}-${entry.value}-panel`}
              onClick={() => setTab(entry.value)}
              className={cn(
                "type-label -mb-px flex h-10 items-center gap-1.5 border-b-2 px-2",
                "transition-colors duration-[var(--dur-fast)] ease-brand",
                active
                  ? "border-accent text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* Views stay mounted so switching keeps each one's scroll position. */}
      <div
        role="tabpanel"
        id={`${tabsId}-ask-panel`}
        aria-labelledby={`${tabsId}-ask`}
        hidden={tab !== "ask"}
        className={cn("min-h-0 flex-1 flex-col", tab === "ask" ? "flex" : "hidden")}
      >
        <Conversation
          symbol={symbol}
          onAsk={ask}
          lead={
            <>
              <DecisionBrief />
              <PendingActions />
            </>
          }
        />
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-signals-panel`}
        aria-labelledby={`${tabsId}-signals`}
        hidden={tab !== "signals"}
        className={cn("min-h-0 flex-1 flex-col", tab === "signals" ? "flex" : "hidden")}
      >
        <ElyraSignals onAsk={ask} />
      </div>
      <div
        role="tabpanel"
        id={`${tabsId}-research-panel`}
        aria-labelledby={`${tabsId}-research`}
        hidden={tab !== "research"}
        className={cn("min-h-0 flex-1 flex-col", tab === "research" ? "flex" : "hidden")}
      >
        <SmartMoneyPanel bare />
        <Link
          href="/research"
          className="type-label flex shrink-0 items-center justify-between border-t border-border-subtle px-4 py-2.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          Reports, backtests, prediction markets and yields
          <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
        </Link>
      </div>

      <Composer symbol={symbol} onAsk={ask} showChips={tab === "ask"} />
    </section>
  );
}
