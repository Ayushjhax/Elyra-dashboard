"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChevronRight, SendHorizontal, Wrench } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelHeader } from "@/components/ui/Panel";
import { suggestionChips } from "@/lib/mock/chat";
import { formatRelativeTime } from "@/lib/format";
import { useAssets } from "@/lib/market/usePrices";
import {
  nextMessageId,
  nowIso,
  useElyraStore,
} from "@/lib/store";
import type { ChatMessage, ToolCall } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Roughly four lines of `body` type before the composer starts scrolling. */
const COMPOSER_MAX_HEIGHT = 96;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * A tool the agent ran. Collapsed it is one row naming the call; expanded it
 * shows the rows the agent actually read, so the answer above can be checked
 * against its evidence.
 */
function ToolCallBlock({ call }: { call: ToolCall }) {
  const [open, setOpen] = useState(false);
  /* useId, not the call id: this panel is mounted twice below 1280px, once in
     the column and once in the drawer. */
  const panelId = useId();

  return (
    <div className="overflow-hidden rounded-card border border-border-subtle bg-surface-panel">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-1.5 px-2 py-1.5 text-left",
          "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
        )}
      >
        <ChevronRight
          size={14}
          strokeWidth={1.5}
          aria-hidden
          className={cn(
            "shrink-0 text-text-muted transition-transform duration-[var(--dur-base)] ease-brand",
            open && "rotate-90",
          )}
        />
        <Wrench size={14} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
        <span className="type-data-sm min-w-0 flex-1 truncate text-text-secondary">
          {call.label}
        </span>
        <span className="type-label shrink-0 text-text-muted">
          {call.rows.length} rows
        </span>
      </button>

      <div id={panelId} hidden={!open}>
        <div className="overflow-x-auto border-t border-border-subtle">
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">{call.label}</caption>
            <thead>
              <tr>
                {call.columns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn(
                      "type-label h-7 whitespace-nowrap border-b border-border-subtle px-2",
                      "font-medium text-text-muted",
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
                <tr
                  key={`${call.id}-${rowIndex}`}
                  className="border-b border-border-subtle last:border-b-0"
                >
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
        </div>
        {call.note && (
          <p className="type-label border-t border-border-subtle px-2 py-1.5 text-text-muted">
            {call.note}
          </p>
        )}
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  const isAgent = message.role === "agent";

  return (
    <li className={cn("flex", isAgent ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "flex flex-col gap-2 rounded-card px-2.5 py-2",
          isAgent
            ? "agent-rail w-[94%] rounded-l-none bg-surface-raised"
            : "max-w-[80%] bg-surface-hover",
        )}
      >
        {isAgent && message.toolCall && <ToolCallBlock call={message.toolCall} />}

        <p
          className={cn(
            "type-body-sm whitespace-pre-wrap text-text-primary",
            streaming && "stream-caret",
          )}
        >
          {message.text}
        </p>

        <time
          dateTime={message.at}
          className={cn(
            "type-label text-text-muted",
            isAgent ? "text-left" : "text-right",
          )}
        >
          {formatRelativeTime(message.at)}
        </time>
      </div>
    </li>
  );
}

export function AgentChatPanel() {
  const messages = useElyraStore((state) => state.messages);
  const draft = useElyraStore((state) => state.composerDraft);
  const setDraft = useElyraStore((state) => state.setComposerDraft);
  const focusNonce = useElyraStore((state) => state.composerFocusNonce);
  const appendMessage = useElyraStore((state) => state.appendMessage);
  const patchMessage = useElyraStore((state) => state.patchMessage);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const symbol = byId.get(selectedAssetId)?.symbol ?? "";

  const auth = useElyraAuth();
  const composerId = useId();
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const streamTimer = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Keep the newest message in view as it streams. */
  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages]);

  /* Another panel asked for the composer. */
  useEffect(() => {
    if (focusNonce > 0) inputRef.current?.focus();
  }, [focusNonce]);

  /* Grow to four lines, then scroll. */
  useLayoutEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, COMPOSER_MAX_HEIGHT)}px`;
  }, [draft]);

  useEffect(() => {
    return () => {
      if (streamTimer.current !== null) window.clearInterval(streamTimer.current);
    };
  }, []);

  /* Paints `text` into an existing message, typewriter style. The route
     returns one payload rather than a stream — the panel only ever simulated
     streaming, so there is nothing to preserve on the wire — but the caret
     and the reveal are how this panel has always read, so they stay. */
  const reveal = useCallback(
    (id: string, text: string) => {
      if (prefersReducedMotion()) {
        patchMessage(id, { text });
        setStreamingId(null);
        return;
      }

      setStreamingId(id);
      let cursor = 0;
      streamTimer.current = window.setInterval(() => {
        cursor += 2;
        patchMessage(id, { text: text.slice(0, cursor) });
        if (cursor >= text.length) {
          if (streamTimer.current !== null) {
            window.clearInterval(streamTimer.current);
            streamTimer.current = null;
          }
          setStreamingId(null);
        }
      }, 16);
    },
    [patchMessage],
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || pending) return;

      if (!auth.authenticated) {
        auth.login();
        return;
      }

      appendMessage({
        id: nextMessageId("user"),
        role: "user",
        text,
        at: nowIso(),
      });
      setDraft("");

      const agentId = nextMessageId("agent");
      appendMessage({ id: agentId, role: "agent", text: "", at: nowIso() });
      setPending(true);

      try {
        const token = await auth.getAccessToken();
        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            /* Sent explicitly rather than relying on Privy's cookie, so this
               works regardless of how cookies are configured for the app. */
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          /* No user identifier here. The route derives it from the token and
             ignores anything the body claims. */
          body: JSON.stringify({ message: text }),
        });

        const payload = (await response.json().catch(() => null)) as
          | { reply?: string; error?: string }
          | null;

        if (!response.ok) {
          reveal(
            agentId,
            payload?.error ??
              "The agent could not complete that request.",
          );
          return;
        }

        reveal(agentId, payload?.reply ?? "No reply came back.");
      } catch {
        reveal(agentId, "Could not reach the agent. Check your connection.");
      } finally {
        setPending(false);
      }
    },
    [appendMessage, auth, pending, reveal, setDraft],
  );

  const chips = suggestionChips(symbol);

  return (
    <Panel label="Agentic chat">
      <PanelHeader>
        <Eyebrow>Agentic chat</Eyebrow>
        <span className="type-label text-text-muted">{symbol}</span>
      </PanelHeader>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3"
      >
        <ul className="flex list-none flex-col gap-3">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              streaming={message.id === streamingId}
            />
          ))}
        </ul>
      </div>

      <div className="shrink-0 border-t border-border-subtle p-2.5">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              /* Prefill, not send: the operator gets to edit the question
                 before spending a run on it. */
              onClick={() => {
                setDraft(chip);
                inputRef.current?.focus();
              }}
              className={cn(
                "type-label rounded-pill border border-border-subtle bg-surface-raised px-2 py-1",
                "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
                "hover:bg-surface-hover hover:text-text-primary",
              )}
            >
              {chip}
            </button>
          ))}
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
          className={cn(
            "flex items-end gap-1.5 rounded-control border border-border-strong bg-surface-raised p-1.5",
            "focus-within:border-accent-quiet",
          )}
        >
          <label htmlFor={composerId} className="sr-only">
            Ask Elyra about {symbol}
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
                void send(draft);
              }
            }}
            placeholder={
              auth.available && !auth.authenticated
                ? "Sign in to ask Elyra…"
                : pending
                  ? "Elyra is working…"
                  : "Ask Elyra…"
            }
            className={cn(
              "type-body-sm min-h-6 flex-1 resize-none bg-transparent px-1.5 py-1",
              "text-text-primary placeholder:text-text-muted focus:outline-none",
            )}
          />
          <button
            type="submit"
            aria-label="Send message"
            disabled={draft.trim().length === 0 || pending}
            className={cn(
              "inline-flex size-7 shrink-0 items-center justify-center rounded-chip",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              draft.trim().length === 0 || pending
                ? "text-text-muted"
                : "bg-accent text-text-on-accent hover:bg-accent-hover",
            )}
          >
            <SendHorizontal size={14} strokeWidth={1.5} aria-hidden />
          </button>
        </form>
      </div>
    </Panel>
  );
}
