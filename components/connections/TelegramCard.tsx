"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, Copy, ExternalLink, RefreshCw, Send, TimerOff } from "lucide-react";
import {
  CardRule,
  ConfirmAction,
  ConnectionCard,
  Disclosure,
  InlineError,
  InlineNote,
  MarkTile,
  StatusBadge,
  primaryAction,
  quietAction,
  readJson,
  textAction,
  useAccountFetch,
} from "@/components/connections/primitives";
import {
  LINK_POLL_MS,
  codeDeadline,
  formatCountdown,
  remainingMs,
  type ConnectionStatus,
} from "@/lib/connections/state";
import { useCopy } from "@/lib/clipboard";
import { formatRelativeTime } from "@/lib/format";
import { useMinute, useSecond } from "@/lib/useClock";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Telegram: a second surface onto the same agent.

   Linking is a code issued here and sent to the bot there. The code is a row
   (app/api/telegram/link), good for one use inside its window, and the only
   thing that crosses between the two surfaces.

   Nothing pushes "linked" back to the web, so while a live code is on screen
   the card asks — every few seconds, only while the tab is visible, and
   never once the code has expired, the chat is linked or the drawer is
   closed. An expired code is taken off screen rather than left looking
   usable, and a new code revokes the one it replaces on the server.

   Unlinking works from here as well as from the chat, for someone who no
   longer has the chat to send /unlink from.
--------------------------------------------------------------------------- */

interface LinkStatus {
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  botUsername: string | null;
  /** Set when the link table could not be read: "not linked" is then unknown. */
  unavailable?: string;
}

interface IssuedResponse {
  code: string;
  issuedAt: string;
  expiresAt: string;
  deepLink: string | null;
  botUsername: string | null;
  error: string;
}

interface IssuedCode {
  code: string;
  deepLink: string | null;
  /** When it stops working, on this device's clock. */
  deadline: number;
  /** Its whole window, for "works once, for ten minutes". */
  lifetimeMs: number;
}

type Read = { phase: "loading" } | { phase: "failed" } | { phase: "ready"; status: LinkStatus };

export function TelegramCard() {
  const accountFetch = useAccountFetch();
  const [read, setRead] = useState<Read>({ phase: "loading" });
  const [code, setCode] = useState<IssuedCode | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* A live code was swapped for a new one, which revoked it. */
  const [replaced, setReplaced] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  /* A second click before the first render lands must not issue twice. */
  const inFlight = useRef(false);
  /* Focus follows the code in, but only when what held it has gone. */
  const focusCode = useRef(false);
  const codeRegion = useRef<HTMLDivElement>(null);
  const now = useSecond();

  const fetchStatus = useCallback(
    async (signal?: AbortSignal): Promise<LinkStatus | null> => {
      try {
        const response = await accountFetch("/api/telegram/link", { signal, cache: "no-store" });
        if (!response.ok) return null;
        return (await response.json()) as LinkStatus;
      } catch {
        return null;
      }
    },
    [accountFetch],
  );

  useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal).then((status) => {
      if (controller.signal.aborted) return;
      setRead(status === null ? { phase: "failed" } : { phase: "ready", status });
    });
    return () => controller.abort();
  }, [fetchStatus]);

  const retry = async () => {
    setRead({ phase: "loading" });
    const status = await fetchStatus();
    setRead(status === null ? { phase: "failed" } : { phase: "ready", status });
  };

  const status = read.phase === "ready" ? read.status : null;
  const linked = status?.linked === true;
  /* Held to the code's own window: the shared clock can trail the moment the
     code arrived by up to a second, which would otherwise read 10:01. */
  const left = code === null || now === null ? null : Math.min(code.lifetimeMs, remainingMs(code.deadline, now));
  const expired = code !== null && left === 0;
  const awaiting = code !== null && !expired && !linked;

  /* Is the code redeemed yet? Asked only while one is live and visible. */
  useEffect(() => {
    if (!awaiting) return;
    const controller = new AbortController();
    let timer: number | null = null;
    let running = false;

    const tick = async () => {
      timer = null;
      if (document.visibilityState !== "visible") return;
      running = true;
      const next = await fetchStatus(controller.signal);
      running = false;
      if (controller.signal.aborted) return;
      if (next?.linked === true) {
        setRead({ phase: "ready", status: next });
        setCode(null);
        return;
      }
      timer = window.setTimeout(() => void tick(), LINK_POLL_MS);
    };

    /* Back from Telegram: ask at once rather than at the next tick. */
    const onVisible = () => {
      if (document.visibilityState !== "visible" || running) return;
      if (timer !== null) window.clearTimeout(timer);
      void tick();
    };

    timer = window.setTimeout(() => void tick(), LINK_POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [awaiting, fetchStatus]);

  const issue = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    focusCode.current = code === null || expired;
    const replacing = code !== null && !expired;
    setIssuing(true);
    setError(null);
    try {
      const response = await accountFetch("/api/telegram/link", { method: "POST" });
      const body = await readJson<IssuedResponse>(response);
      if (!response.ok || typeof body.code !== "string" || typeof body.expiresAt !== "string") {
        setError(body.error ?? "Could not generate a code. Try again.");
        return;
      }
      const receivedAt = Date.now();
      const deadline = codeDeadline(body.issuedAt, body.expiresAt, receivedAt);
      setCode({
        code: body.code,
        deepLink: body.deepLink ?? null,
        deadline,
        lifetimeMs: deadline - receivedAt,
      });
      setReplaced(replacing);
    } catch {
      setError("Could not reach Elyra to generate a code. Check your connection and try again.");
    } finally {
      inFlight.current = false;
      setIssuing(false);
    }
  };

  const unlink = async () => {
    if (inFlight.current || status === null) return;
    inFlight.current = true;
    setUnlinking(true);
    setError(null);
    try {
      const response = await accountFetch("/api/telegram/link", { method: "DELETE" });
      if (!response.ok) {
        const body = await readJson<{ error: string }>(response);
        setError(body.error ?? "Could not unlink Telegram. The chat is still linked.");
        return;
      }
      setCode(null);
      setReplaced(false);
      setRead({ phase: "ready", status: { ...status, linked: false, username: null, linkedAt: null } });
    } catch {
      setError("Could not reach Elyra to unlink. The chat is still linked.");
    } finally {
      inFlight.current = false;
      setUnlinking(false);
    }
  };

  const codeValue = code?.code ?? null;
  useEffect(() => {
    if (codeValue === null || !focusCode.current) return;
    focusCode.current = false;
    codeRegion.current?.focus();
  }, [codeValue]);

  const unconfigured = status !== null && !linked && status.botUsername === null;
  const unknown = read.phase === "failed" || (status !== null && !linked && status.unavailable !== undefined);

  const [badge, label]: [ConnectionStatus, string] =
    read.phase === "loading"
      ? ["checking", "Checking"]
      : linked
        ? ["connected", "Connected"]
        : unknown
          ? ["attention", "Couldn't check"]
          : unconfigured
            ? ["unavailable", "Unavailable"]
            : expired
              ? ["expired", "Code expired"]
              : code !== null
                ? ["awaiting", "Awaiting link"]
                : issuing
                  ? ["connecting", "Connecting"]
                  : ["not-connected", "Not linked"];

  return (
    <ConnectionCard
      mark={<MarkTile icon={Send} />}
      title="Telegram"
      subtitle="Your Elyra agent, wherever you are"
      status={<StatusBadge name="Telegram" status={badge} label={label} />}
    >
      {read.phase === "loading" ? (
        <p className="type-body-sm text-text-muted">Checking your Telegram link…</p>
      ) : linked && status !== null ? (
        <LinkedSummary status={status} unlinking={unlinking} onUnlink={() => void unlink()} />
      ) : unknown ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <InlineError className="min-w-0 flex-1">
            {status?.unavailable ?? "Could not check whether Telegram is linked."}
          </InlineError>
          <button type="button" onClick={() => void retry()} className={textAction}>
            Try again
          </button>
        </div>
      ) : unconfigured ? (
        <InlineNote>Telegram is not set up on this deployment, so there is no bot to link.</InlineNote>
      ) : code === null ? (
        <>
          <p className="type-body-sm text-text-secondary">Same agent, accounts and preferences.</p>
          <button type="button" onClick={() => void issue()} disabled={issuing} className={cn(primaryAction, "w-full")}>
            <Send size={15} strokeWidth={1.5} aria-hidden />
            {issuing ? "Generating a code…" : "Connect Telegram"}
          </button>
        </>
      ) : expired ? (
        <>
          <div
            ref={codeRegion}
            tabIndex={-1}
            className="flex items-start gap-3 rounded-card border border-dashed border-border-strong bg-surface-base p-3"
          >
            <TimerOff size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-negative" />
            <p className="type-body-sm text-text-secondary">
              That code expired and no longer works. Codes are single use and last{" "}
              {minutes(code.lifetimeMs)}.
            </p>
          </div>
          <button type="button" onClick={() => void issue()} disabled={issuing} className={cn(primaryAction, "w-full")}>
            <RefreshCw size={15} strokeWidth={1.5} aria-hidden />
            {issuing ? "Generating a code…" : "Generate a new code"}
          </button>
        </>
      ) : (
        <>
          <CodeBlock regionRef={codeRegion} code={code} left={left} />
          {replaced && <InlineNote>Your previous code no longer works.</InlineNote>}
          {code.deepLink === null ? (
            <InlineNote>
              Send <code className="type-mono-addr text-text-primary">/link {code.code}</code> to the Elyra bot in
              Telegram.
            </InlineNote>
          ) : (
            <a href={code.deepLink} target="_blank" rel="noopener noreferrer" className={cn(primaryAction, "w-full")}>
              <Send size={15} strokeWidth={1.5} aria-hidden />
              Open Telegram to link
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
          <button type="button" onClick={() => void issue()} disabled={issuing} className={cn(textAction, "self-center")}>
            <RefreshCw size={13} strokeWidth={1.5} aria-hidden />
            {issuing ? "Generating…" : "Generate a new code"}
          </button>
        </>
      )}

      {error !== null && <InlineError>{error}</InlineError>}
    </ConnectionCard>
  );
}

function minutes(ms: number): string {
  const count = Math.max(1, Math.round(ms / 60_000));
  return `${count} minute${count === 1 ? "" : "s"}`;
}

/** The live code: read off a screen, typed into a phone, so it is set large and spaced. */
function CodeBlock({
  code,
  left,
  regionRef,
}: {
  code: IssuedCode;
  left: number | null;
  regionRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { state, copy } = useCopy();

  return (
    <div
      ref={regionRef}
      tabIndex={-1}
      role="group"
      aria-label="Linking code"
      className="rounded-card border border-border-strong bg-surface-base p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="type-eyebrow text-text-muted">Linking code</span>
        {left !== null && (
          <span className="type-data-sm text-text-secondary">
            Expires in <span className="tabular-nums text-text-primary">{formatCountdown(left)}</span>
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3">
        <span
          translate="no"
          className="min-w-0 select-all font-mono text-[20px] font-semibold leading-[26px] tracking-[0.3em] text-text-primary"
        >
          {code.code}
        </span>
        <button
          type="button"
          onClick={() => void copy(code.code)}
          aria-label="Copy the linking code"
          className={cn(
            "type-label inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control border px-2.5",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:bg-surface-hover",
            state === "copied"
              ? "border-sage/45 text-positive"
              : state === "failed"
                ? "border-negative/40 text-negative"
                : "border-border-strong text-text-primary",
          )}
        >
          {state === "copied" ? (
            <Check size={14} strokeWidth={1.75} aria-hidden />
          ) : (
            <Copy size={14} strokeWidth={1.5} aria-hidden />
          )}
          {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy" : "Copy"}
        </button>
      </div>

      <p className="type-label mt-2 text-text-muted">
        Single use · valid for {minutes(code.lifetimeMs)}
      </p>
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? "Copied the linking code" : state === "failed" ? "Could not copy the code. Select it instead." : ""}
      </span>
    </div>
  );
}

/** Linked: who to, a way back to the chat, what it may send unprompted, and the way out. */
function LinkedSummary({
  status,
  unlinking,
  onUnlink,
}: {
  status: LinkStatus;
  unlinking: boolean;
  onUnlink: () => void;
}) {
  const now = useMinute();
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="type-body truncate font-medium text-text-primary">
            {status.username === null ? "A Telegram chat" : `@${status.username}`}
          </p>
          {status.linkedAt !== null && now !== null && (
            <p className="type-label text-text-muted">Linked {formatRelativeTime(status.linkedAt, now)}</p>
          )}
        </div>
        {status.botUsername !== null && (
          <a
            href={`https://t.me/${status.botUsername}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(quietAction, "h-9 px-3")}
          >
            Open chat
            <ExternalLink size={14} strokeWidth={1.5} aria-hidden />
            <span className="sr-only">(opens Telegram in a new tab)</span>
          </a>
        )}
      </div>

      <CardRule />

      <Disclosure open={open} onOpenChange={setOpen} icon={Bell} label="What Elyra sends you">
        <NotificationToggles />
      </Disclosure>

      <CardRule />

      <ConfirmAction
        trigger="Unlink"
        question="Unlink Telegram? The chat stops answering for this account."
        confirm="Unlink"
        pendingLabel="Unlinking…"
        pending={unlinking}
        onConfirm={onUnlink}
      />
    </>
  );
}

/* --- Notifications ---------------------------------------------------------- */

interface Preferences {
  priceAlerts: boolean;
  liquidationAlerts: boolean;
  largeMoves: boolean;
  dailySummary: boolean;
  moveThresholdPct: number;
}

const TOGGLES: Array<{ key: keyof Preferences; label: string; hint: string }> = [
  {
    key: "liquidationAlerts",
    label: "Liquidation warnings",
    hint: "When a DeFi position approaches its published liquidation threshold.",
  },
  { key: "largeMoves", label: "Large moves", hint: "When something you hold moves more than your threshold." },
  { key: "priceAlerts", label: "Price alerts", hint: "Levels you set on the chart." },
  { key: "dailySummary", label: "Daily summary", hint: "One message a day with where your capital stands." },
];

/**
 * What Elyra is allowed to send, unprompted, into a Telegram chat.
 *
 * Everything starts off. Linking a chat is consent to ASK questions; it is not
 * consent to be told things, and an unsolicited message containing a balance
 * is a disclosure nobody agreed to. Each switch is written immediately rather
 * than behind a Save, because a half-applied notification setting is worse
 * than either state.
 */
function NotificationToggles() {
  const accountFetch = useAccountFetch();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await accountFetch("/api/telegram/notifications", { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const body = (await response.json()) as Preferences;
        if (!controller.signal.aborted) setPreferences(body);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    })();
    return () => controller.abort();
  }, [accountFetch]);

  const toggle = async (key: keyof Preferences, next: boolean) => {
    setPending(key);
    setError(null);
    try {
      const response = await accountFetch("/api/telegram/notifications", {
        method: "PATCH",
        body: JSON.stringify({ [key]: next }),
      });
      if (!response.ok) {
        const body = await readJson<{ error: string }>(response);
        setError(body.error ?? "Could not save that. Nothing was changed.");
        return;
      }
      /* The server's answer, not the optimistic value. A switch that shows
         on while the row says off is a promise the product will not keep. */
      setPreferences((await response.json()) as Preferences);
    } catch {
      setError("Could not save that. Nothing was changed.");
    } finally {
      setPending(null);
    }
  };

  if (failed) return <InlineError>Could not read your notification settings.</InlineError>;
  if (preferences === null) return <p className="type-body-sm text-text-muted">Loading…</p>;

  return (
    <div className="flex flex-col gap-1">
      {TOGGLES.map((item) => (
        <label key={item.key} className="flex cursor-pointer items-start justify-between gap-3 py-1.5">
          <span className="flex min-w-0 flex-col">
            <span className="type-body-sm text-text-primary">{item.label}</span>
            <span className="type-label text-text-muted">{item.hint}</span>
          </span>
          <input
            type="checkbox"
            checked={preferences[item.key] === true}
            disabled={pending === item.key}
            onChange={(event) => void toggle(item.key, event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]"
          />
        </label>
      ))}
      {error !== null && <InlineError>{error}</InlineError>}
    </div>
  );
}
