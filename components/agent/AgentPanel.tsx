"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ElyraMark } from "@/components/ui/ElyraMark";
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  ChevronRight,
  FileText,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Minus,
  Paperclip,
  SendHorizontal,
  Sparkles,
  Square,
  Volume2,
  Wrench,
  X,
} from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Tip } from "@/components/shell/RouteDrawer";
import { DecisionBrief } from "@/components/agent/DecisionBrief";
import { ElyraSignals } from "@/components/agent/ElyraSignals";
import { PendingActions } from "@/components/agent/PendingActions";
import { SmartMoneyPanel } from "@/components/panels/SmartMoneyPanel";
import { SecResearch } from "@/components/agent/SecResearch";
import { MarketReports } from "@/components/agent/MarketReports";
import { TeamArchitecture, TeamTrace } from "@/components/agent/TeamTrace";
import { VoiceMode } from "@/components/agent/VoiceMode";
import { sendToAgent } from "@/lib/agentChat";
import { ACCEPT, ATTACHMENT_LIMITS, type ComposerAttachment } from "@/lib/attachments";
import { describeSize, readAttachments } from "@/lib/attachments-read";
import { formatClock } from "@/lib/format";
import { useAssets } from "@/lib/market/usePrices";
import { teamWorkingLine } from "@/lib/agent/reply";
import { suggestionChips } from "@/lib/agent/suggestions";
import { isShortcutDraft, matchingShortcuts } from "@/lib/agent/shortcuts";
import { webShortcut, webShortcutMenu } from "@/lib/agent/webShortcuts";
import { analysisFollowUps } from "@/lib/agent/followUps";
import { useElyraStore } from "@/lib/store";
import type { AgentTab, ChatMessage, ToolCall } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useDictation } from "@/lib/voice/useDictation";
import { useVoicePersona } from "@/lib/voice/preferences";
import { speak, stopSpeaking, unlockAudio, useSpeaking } from "@/lib/voice/speaker";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

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
  { value: "ask", label: msg("Ask Elyra") },
  { value: "signals", label: msg("Signals") },
  { value: "research", label: msg("Research") },
];

/**
 * A tool the agent ran. Collapsed it is one row naming the call; expanded it
 * shows the rows the agent actually read, so the answer can be checked
 * against its evidence.
 */
function ToolCallBlock({ call }: { call: ToolCall }) {
  const t = useT();
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
        <span className="type-data-sm min-w-0 flex-1 truncate text-text-secondary">{t(call.label)}</span>
        <span className="type-label shrink-0 text-text-muted">{t("{count} rows", { count: call.rows.length })}</span>
      </button>
      <div id={panelId} hidden={!open} className="overflow-x-auto border-t border-border-subtle">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{t(call.label)}</caption>
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

/** Reads a reply out loud in the chosen voice; pressed again, stops. */
function ReadAloud({ id, text }: { id: string; text: string }) {
  const t = useT();
  const auth = useElyraAuth();
  const persona = useVoicePersona();
  const speaking = useSpeaking() === id;
  return (
    <button
      type="button"
      onClick={() => {
        if (speaking) {
          stopSpeaking();
          return;
        }
        unlockAudio();
        void speak(text, { persona, locale: t.locale, getToken: auth.getAccessToken, key: id, addressWord: t("the address") });
      }}
      aria-pressed={speaking}
      aria-label={speaking ? t("Stop reading aloud") : t("Read aloud as {name}", { name: persona.name })}
      title={speaking ? t("Stop reading aloud") : t("Read aloud as {name}", { name: persona.name })}
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-control transition-colors duration-[var(--dur-fast)] ease-brand",
        speaking ? "bg-accent-quiet text-text-primary" : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
      )}
    >
      {speaking ? <Square size={11} strokeWidth={2} aria-hidden className="fill-current" /> : <Volume2 size={14} strokeWidth={1.5} aria-hidden />}
    </button>
  );
}

function MessageBubble({
  message,
  streaming,
  thinking,
  followUps = [],
  onAsk,
}: {
  message: ChatMessage;
  streaming: boolean;
  /** The request is in flight and this bubble is where the reply will land. */
  thinking: boolean;
  /** Questions to offer next, sent as the person's own words when tapped. */
  followUps?: string[];
  onAsk?: (prompt: string) => void;
}) {
  const t = useT();
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

        {isAgent && message.team && <TeamTrace team={message.team} working={thinking} />}

        {message.attachments && message.attachments.length > 0 && (
          <ul aria-label={t("Attached files")} className="flex list-none flex-wrap justify-end gap-1.5">
            {message.attachments.map((file, index) =>
              file.previewUrl ? (
                <li key={`${file.name}-${index}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local data URL */}
                  <img
                    src={file.previewUrl}
                    alt={file.name}
                    className="max-h-32 max-w-full rounded-control border border-border-subtle object-contain"
                  />
                </li>
              ) : (
                <li
                  key={`${file.name}-${index}`}
                  className="type-label inline-flex max-w-full items-center gap-1.5 rounded-control border border-border-subtle bg-surface-panel px-2 py-1 text-text-secondary"
                >
                  <FileText size={13} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-muted" />
                  <span className="truncate">{file.name}</span>
                </li>
              ),
            )}
          </ul>
        )}

        {thinking ? (
          /* The line that reports the state, and what a screen reader gets. */
          <p aria-live="polite" className="type-body-sm flex items-center gap-2 text-text-secondary">
            <Sparkles size={14} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {message.team
              ? teamWorkingLine(message.team, t)
              : message.activity
                ? t("Reading {activity}…", { activity: message.activity })
                : t("Elyra is working…")}
          </p>
        ) : message.text.length > 0 || isAgent ? (
          <p
            className={cn(
              "type-body-sm whitespace-pre-wrap break-words text-text-primary",
              streaming && "stream-caret",
            )}
          >
            {message.text}
          </p>
        ) : null}

        {!thinking && isAgent && !streaming && message.sources && message.sources.length > 0 && (
          <p className="type-data-sm text-text-muted">
            <span className="text-text-secondary">{t("Sources")}</span> · {message.sources.join(" · ")}
          </p>
        )}

        {!thinking && !streaming && followUps.length > 0 && onAsk !== undefined && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("Ask next")}>
            {followUps.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onAsk(prompt)}
                className="type-label inline-flex min-h-8 items-center gap-1 rounded-control border border-border-subtle px-2 py-1 text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand hover:border-border-strong hover:bg-surface-hover hover:text-text-primary"
              >
                {prompt}
                <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden className="text-text-muted" />
              </button>
            ))}
          </div>
        )}

        {!thinking && (
          <div className={cn("flex items-center gap-2", isAgent ? "justify-between" : "justify-end")}>
            <time dateTime={message.at} className="type-data-sm text-text-muted">
              {t("{at} UTC", { at: formatClock(message.at, t.locale) })}
            </time>
            {isAgent && !streaming && message.text.length > 0 && !message.failed && <ReadAloud id={message.id} text={message.text} />}
          </div>
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
  const t = useT();
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
            <ElyraMark size={44} />
            <div>
              <p className="type-panel-title text-text-primary">{t("Ask Elyra about crypto")}</p>
              <p className="type-body-sm mx-auto mt-1 max-w-[30ch] text-text-secondary">
                {t("Markets, tokens, protocols and on-chain mechanics, with live prices, funding, open interest and your connected accounts. It never places orders.")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onAsk(t("Give me a brief on {symbol} right now.", { symbol: symbol || t("the market") }))}
              className="type-label rounded-control border border-border-strong px-3 py-1.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              {t("Brief me on")}{" "}{symbol || t("the market")}
            </button>
            <TeamArchitecture />
          </div>
        ) : (
          <ul aria-label={t("Conversation")} className="flex list-none flex-col gap-3">
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
                /* Under the latest answer to an analysis question, what to ask next (lib/agent/followUps.ts). */
                followUps={
                  !pending && index === messages.length - 1 && message.role === "agent" && message.failed !== true && messages[index - 1]?.role === "user"
                    ? analysisFollowUps(messages[index - 1].text, t)
                    : []
                }
                onAsk={onAsk}
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
          {t("New messages")}
        </button>
      )}
    </div>
  );
}

/** A staged file: thumbnail or icon, name, size, and a way to take it back. */
function AttachmentChip({ file, onRemove }: { file: ComposerAttachment; onRemove: () => void }) {
  const t = useT();
  return (
    <li className="flex max-w-full items-center gap-2 rounded-control border border-border-subtle bg-surface-panel py-1 pl-1 pr-1.5">
      {file.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local data URL; next/image has nothing to optimise
        <img src={file.previewUrl} alt="" className="size-8 shrink-0 rounded-chip object-cover" />
      ) : (
        <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-chip bg-surface-hover text-text-muted">
          <FileText size={15} strokeWidth={1.5} />
        </span>
      )}
      <span className="min-w-0">
        <span className="type-label block max-w-[11rem] truncate text-text-primary" title={file.name}>
          {file.name}
        </span>
        <span className="type-data-sm block text-text-muted">{describeSize(file)}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("Remove {name}", { name: file.name })}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-chip text-text-muted hover:bg-surface-hover hover:text-text-primary"
      >
        <X size={13} strokeWidth={1.5} aria-hidden />
      </button>
    </li>
  );
}

function Composer({
  cryptoSymbol,
  onAsk,
  onVoice,
  showChips,
}: {
  /** The selected market when it is a crypto asset, for the first suggestion. */
  cryptoSymbol: string;
  onAsk: (prompt: string) => void;
  /** Opens a voice conversation (components/agent/VoiceMode.tsx). */
  onVoice: () => void;
  /** Suggested questions start a conversation: on the Ask tab only, and
      only until the first question is asked — after that they are noise
      under the answers. They return when the conversation is cleared. */
  showChips: boolean;
}) {
  const t = useT();
  const auth = useElyraAuth();
  const draft = useElyraStore((state) => state.composerDraft);
  const setDraft = useElyraStore((state) => state.setComposerDraft);
  const attachments = useElyraStore((state) => state.composerAttachments);
  const addAttachments = useElyraStore((state) => state.addComposerAttachments);
  const removeAttachment = useElyraStore((state) => state.removeComposerAttachment);
  const focusNonce = useElyraStore((state) => state.composerFocusNonce);
  const pending = useElyraStore((state) => state.agentPending);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const composerId = useId();
  const hintId = useId();
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const dictation = useDictation();

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

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setReading(true);
    setNotice(null);
    const { added, errors } = await readAttachments(files, useElyraStore.getState().composerAttachments);
    if (added.length > 0) addAttachments(added);
    setNotice(errors.length > 0 ? errors.join(" ") : null);
    setReading(false);
    inputRef.current?.focus();
  };

  const listening = dictation.status === "listening" || dictation.status === "recording";
  const busyVoice = dictation.status !== "idle";
  const signedOut = auth.available && auth.ready && !auth.authenticated;
  const canSend =
    (draft.trim().length > 0 || attachments.length > 0) && !pending && !reading && dictation.status !== "transcribing";
  /* Two at most, so the brief above keeps its room. A suggestion fills the
     composer rather than sending: the person reads it, edits it, sends it. */
  const chips = showChips ? suggestionChips(cryptoSymbol, t).slice(0, 2) : [];
  const router = useRouter();
  /* "/" then letters: the shortcuts that match, to pick from (lib/agent/webShortcuts.ts). */
  const shortcutMenu = attachments.length === 0 && isShortcutDraft(draft) ? webShortcutMenu(matchingShortcuts(draft)) : [];

  const send = () => {
    if (!canSend) return;
    /* What was heard is already in the draft; anything still arriving
       belongs to a question that has now been asked. */
    if (busyVoice) dictation.cancel();
    setNotice(null);
    const shortcut = attachments.length === 0 ? webShortcut(draft) : null;
    if (shortcut?.kind === "help") {
      setDraft("/");
      inputRef.current?.focus();
      return;
    }
    if (shortcut?.kind === "open") {
      setDraft("");
      router.push(shortcut.href);
      return;
    }
    onAsk(shortcut?.kind === "ask" ? shortcut.prompt : draft);
  };

  /* Recording needs the transcription route, which needs a session. */
  const voiceBlocked = dictation.mode === "record" && signedOut;
  const voiceLabel =
    dictation.mode === null
      ? t("Voice input is not available in this browser")
      : voiceBlocked
        ? t("Sign in to use voice input")
        : listening
          ? t("Stop voice input")
          : dictation.status === "transcribing"
            ? t("Transcribing")
            : t("Speak your question");

  const voiceLine =
    dictation.status === "listening"
      ? t("Listening — speak, then press the microphone to stop.")
      : dictation.status === "recording"
        ? t("Recording {time} — press the microphone to stop.", {
            time: `${Math.floor(dictation.elapsed / 60)}:${String(dictation.elapsed % 60).padStart(2, "0")}`,
          })
        : dictation.status === "transcribing"
          ? t("Transcribing your recording…")
          : null;
  const error = dictation.error ?? notice;

  return (
    <div className="shrink-0 border-t border-border-subtle p-4">
      {chips.length > 0 && (
        <div className="mb-3" role="group" aria-labelledby={`${composerId}-suggested`}>
          <p id={`${composerId}-suggested`} className="type-eyebrow mb-2 flex items-center gap-1.5 text-text-secondary">
            <Sparkles size={13} strokeWidth={1.5} aria-hidden className="text-agent-accent" />
            {t("Suggested prompts")}
          </p>
          <div className="flex flex-wrap gap-2">
            {chips.map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={pending}
                aria-label={t("Put in the composer: {prompt}", { prompt: chip })}
                onClick={() => {
                  setDraft(chip);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "metallic agent-suggestion type-label inline-flex min-h-9 items-center gap-1.5 rounded-control border border-border-subtle px-2.5 py-1.5 text-left",
                  "text-text-secondary transition-colors duration-[var(--dur-fast)] ease-brand",
                  "hover:border-border-strong hover:bg-surface-hover hover:text-text-primary",
                  "disabled:opacity-50",
                )}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        onDragEnter={(event) => {
          if (event.dataTransfer.types.includes("Files")) setDragging(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          setDragging(false);
          void addFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "metallic agent-composer flex flex-col gap-2 rounded-card border bg-surface-raised p-2",
          "transition-colors duration-[var(--dur-fast)] ease-brand",
          dragging ? "border-accent-quiet bg-surface-hover" : "border-border-strong focus-within:border-accent-quiet",
        )}
      >
        {attachments.length > 0 && (
          <ul aria-label={t("Attached files")} className="flex list-none flex-wrap gap-1.5">
            {attachments.map((file) => (
              <AttachmentChip key={file.id} file={file} onRemove={() => removeAttachment(file.id)} />
            ))}
          </ul>
        )}

        {shortcutMenu.length > 0 && (
          <ul aria-label={t("Shortcuts")} className="flex max-h-56 list-none flex-col overflow-y-auto">
            {shortcutMenu.map((entry) => (
              <li key={entry.command}>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(`/${entry.command}${entry.example.length > 0 ? " " : ""}`);
                    inputRef.current?.focus();
                  }}
                  className="flex w-full min-w-0 items-baseline gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover"
                >
                  <span className="type-data-sm shrink-0 text-text-primary">/{entry.command}</span>
                  {entry.example.length > 0 && <span className="type-label shrink-0 text-text-muted">{t(entry.example)}</span>}
                  <span className="type-label min-w-0 truncate text-text-secondary">{t(entry.description)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-end gap-1">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void addFiles(files);
            }}
          />
          <Tip label={t("Attach an image, PDF or text file")}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={reading || attachments.length >= ATTACHMENT_LIMITS.maxFiles}
            aria-label={t("Attach files")}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted",
              "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover hover:text-text-primary",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            {reading ? (
              <Loader2 size={15} strokeWidth={1.5} aria-hidden className="animate-spin" />
            ) : (
              <Paperclip size={15} strokeWidth={1.5} aria-hidden />
            )}
          </button>
          </Tip>

          <label htmlFor={composerId} className="sr-only">
            {t("Ask Elyra")}
          </label>
          <textarea
            id={composerId}
            ref={inputRef}
            rows={1}
            value={draft}
            readOnly={listening}
            aria-describedby={hintId}
            data-composer-input
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && busyVoice) {
                event.preventDefault();
                dictation.stop();
                return;
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            onPaste={(event) => {
              /* A screenshot pasted from the clipboard. Text with an image
                 beside it — a spreadsheet cell — pastes as text. */
              const files = Array.from(event.clipboardData.files);
              if (files.length === 0 || event.clipboardData.types.includes("text/plain")) return;
              event.preventDefault();
              void addFiles(files);
            }}
            placeholder={
              signedOut
                ? t("Sign in to ask Elyra…")
                : pending
                  ? t("Elyra is working…")
                  : listening
                    ? t("Listening…")
                    : t("Ask Elyra anything…")
            }
            className={cn(
              "type-body-sm min-h-8 flex-1 resize-none bg-transparent px-1.5 py-1.5",
              "text-text-primary placeholder:text-text-muted focus:outline-none",
            )}
          />

          <Tip label={voiceLabel}>
          <button
            type="button"
            onClick={() => (listening ? dictation.stop() : dictation.start())}
            disabled={dictation.mode === null || voiceBlocked || dictation.status === "transcribing"}
            aria-pressed={listening}
            aria-label={voiceLabel}
            className={cn(
              "inline-flex size-8 shrink-0 items-center justify-center rounded-control",
              "transition-colors duration-[var(--dur-fast)] ease-brand",
              "disabled:pointer-events-none disabled:opacity-50",
              listening
                ? "bg-accent text-text-on-accent hover:bg-accent-hover"
                : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {dictation.status === "transcribing" ? (
              <Loader2 size={15} strokeWidth={1.5} aria-hidden className="animate-spin" />
            ) : listening ? (
              <Square size={12} strokeWidth={2} aria-hidden className="fill-current" />
            ) : dictation.mode === null ? (
              <MicOff size={15} strokeWidth={1.5} aria-hidden />
            ) : (
              <Mic size={15} strokeWidth={1.5} aria-hidden />
            )}
          </button>
          </Tip>

          {/* With nothing to send, the send button is the way into a voice
              conversation — the composer keeps its width on a narrow column. */}
          {draft.trim().length === 0 && attachments.length === 0 && !listening ? (
            <Tip label={t("Talk to Elyra — a voice conversation")}>
            <button
              type="button"
              onClick={() => {
                if (busyVoice) dictation.cancel();
                unlockAudio();
                onVoice();
              }}
              disabled={pending}
              aria-label={t("Talk to Elyra")}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-control bg-accent text-text-on-accent",
                "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-accent-hover",
                "disabled:pointer-events-none disabled:bg-surface-raised disabled:text-text-muted",
              )}
            >
              <AudioLines size={15} strokeWidth={1.5} aria-hidden />
            </button>
            </Tip>
          ) : (
            <Tip label={t("Send message")}>
            <button
              type="submit"
              aria-label={t("Send message")}
              disabled={!canSend}
              className={cn(
                "inline-flex size-8 shrink-0 items-center justify-center rounded-control",
                "transition-colors duration-[var(--dur-fast)] ease-brand",
                canSend ? "bg-accent text-text-on-accent hover:bg-accent-hover" : "text-text-muted",
              )}
            >
              <SendHorizontal size={15} strokeWidth={1.5} aria-hidden />
            </button>
            </Tip>
          )}
        </div>
      </form>

      {error !== null && (
        <p role="alert" className="type-label mt-2 text-negative">
          {error}
        </p>
      )}
      <p id={hintId} aria-live="polite" className="type-label mt-2 flex items-center gap-2 text-text-muted">
        {voiceLine !== null ? (
          <>
            {listening && <span aria-hidden className="listening-dot" />}
            <span className="text-text-secondary">{voiceLine}</span>
          </>
        ) : dragging ? (
          t("Drop to attach — images, PDFs and text files.")
        ) : (
          t("Enter to send · Shift+Enter for a new line · Attach, drop or paste files")
        )}
      </p>
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
  const t = useT();
  const auth = useElyraAuth();
  const tab = useElyraStore((state) => state.agentTab);
  const setTab = useElyraStore((state) => state.setAgentTab);
  const pending = useElyraStore((state) => state.agentPending);
  /* Any message at all — the question just sent counts, before its answer lands. */
  const conversationStarted = useElyraStore((state) => state.messages.length > 0);
  const selectedAssetId = useElyraStore((state) => state.selectedAssetId);
  const { byId } = useAssets([selectedAssetId]);
  const asset = byId.get(selectedAssetId);
  const symbol = asset?.symbol ?? "";
  const cryptoSymbol = asset?.assetType === "crypto" ? asset.symbol : "";
  const tabsId = useId();
  /* A voice conversation lasts while the panel is open: closing it — or the
     column becoming a drawer — ends the conversation and its microphone.
     What was asked and answered is in the store's conversation either way. */
  const [voiceOpen, setVoiceOpen] = useState(false);

  /* Every way of asking — the composer, a suggestion, the empty state, a
     signal card — goes through here, and lands on the conversation. */
  const ask = (prompt: string) => {
    if (prompt.trim().length === 0 && useElyraStore.getState().composerAttachments.length === 0) return;
    setTab("ask");
    if (!auth.authenticated) {
      useElyraStore.getState().setComposerDraft(prompt);
      if (auth.available) auth.login();
      return;
    }
    void sendToAgent(prompt, auth.getAccessToken);
  };

  const status = pending
    ? { dot: "bg-agent-accent", text: t("Working on your request") }
    : !auth.available
      ? { dot: "bg-text-muted", text: t("Sign-in is not configured") }
      : !auth.authenticated
        ? { dot: "bg-text-muted", text: t("Sign in to ask") }
        : { dot: "bg-positive", text: t("In sync") };

  const control =
    "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary";

  return (
    <section
      aria-label={t("Elyra intelligence")}
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col overflow-hidden rounded-panel border border-border-subtle bg-surface-panel",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3.5">
        <ElyraMark />
        <div className="min-w-0 flex-1">
          <h2 className="type-h2 truncate text-text-primary">{t("Elyra intelligence")}</h2>
          <p aria-live="polite" className="type-label flex min-w-0 items-center gap-1.5 text-text-secondary">
            <span aria-hidden className={cn("size-1.5 shrink-0 rounded-pill", status.dot)} />
            <span className="truncate">
              {status.text}
              {asset ? ` · ${asset.symbol} · ${asset.name}` : ""}
            </span>
          </p>
        </div>
        {onToggleExpand && (
          <Tip label={expanded ? t("Restore Elyra's width") : t("Widen Elyra")}>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-pressed={expanded}
            aria-label={expanded ? t("Restore Elyra's width") : t("Widen Elyra")}
            className={control}
          >
            {expanded ? (
              <Minimize2 size={15} strokeWidth={1.5} aria-hidden />
            ) : (
              <Maximize2 size={15} strokeWidth={1.5} aria-hidden />
            )}
          </button>
          </Tip>
        )}
        <Tip label={t("Minimize Elyra")}>
          <button type="button" onClick={onClose} aria-label={t("Minimize Elyra")} className={control}>
            <Minus size={17} strokeWidth={1.5} aria-hidden />
          </button>
        </Tip>
      </header>

      <div role="tablist" aria-label={t("Elyra views")} className="mt-2.5 flex shrink-0 gap-1 border-b border-border-subtle px-4">
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
              {t(entry.label)}
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
        <MarketReports onAsk={ask} />
        <SecResearch onAsk={ask} />
        <SmartMoneyPanel bare findingsOnly />
        <Link
          href="/research"
          className="type-label flex shrink-0 items-center justify-between border-t border-border-subtle px-4 py-2.5 text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          {t("Reports, backtests, prediction markets and yields")}
          <ArrowUpRight size={13} strokeWidth={1.5} aria-hidden />
        </Link>
      </div>

      <Composer
        cryptoSymbol={cryptoSymbol}
        onAsk={ask}
        onVoice={() => {
          setTab("ask");
          setVoiceOpen(true);
        }}
        showChips={tab === "ask" && !conversationStarted}
      />
      {voiceOpen && <VoiceMode onEnd={() => setVoiceOpen(false)} />}
    </section>
  );
}
