"use client";

import { useEffect, useRef, useState } from "react";
import { AudioLines, Check, ChevronDown, Mic, MicOff, Play, Square, X } from "lucide-react";
import { SwapDialog } from "@/components/assets/SwapDialog";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { validateMarketOrder } from "@/lib/autotrade/orders";
import type { TradeView } from "@/lib/autotrade/types";
import { useAutomation } from "@/lib/autotrade/useAutomation";
import { formatPriceUsd, formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import type { Translator } from "@/lib/i18n/translate";
import { cn } from "@/lib/utils";
import { completePerp, marketLabel, type VoiceCommand } from "@/lib/voice/command";
import { VOICE_PERSONAS, type VoicePersona } from "@/lib/voice/personas";
import { choosePersona, useVoicePersona } from "@/lib/voice/preferences";
import { speak, stopSpeaking, unlockAudio, useSpeaking } from "@/lib/voice/speaker";
import { useVoiceMode, type VoicePhase } from "@/lib/voice/useVoiceMode";

/* ---------------------------------------------------------------------------
   Talking to Elyra: a voice conversation over the agent panel, in the voice
   the person chose.

   Questions are answered out loud by Elyra's agent. An order — "long BTC a
   hundred dollars three x", "close half my ETH", "buy fifty dollars of
   SOL" — is understood by code (lib/voice/command.ts), never by the model,
   and becomes a ticket on screen that Elyra reads back. Nothing is placed
   until the person confirms it:

   - a paper perp order may be confirmed by saying "confirm";
   - a live order needs a tap on Confirm — a misheard word must never be
     enough to send real money;
   - a swap opens the wallet's swap dialog, prefilled, and is signed there.

   Every order goes through the same routes as the chart's ticket:
   POST /api/automation/trade, DELETE /api/automation/positions/[id], and
   the swap dialog's own path. The conversation lives in this component and
   ends when the panel closes, so no microphone stays open behind it; what
   was asked and answered stays in the chat.
--------------------------------------------------------------------------- */

type PerpOrder = ReturnType<typeof completePerp>["order"];

type Ticket =
  | { kind: "perp"; order: PerpOrder; defaulted: boolean; error: string | null; result: string | null }
  | { kind: "close"; coin: string; fraction: 0.25 | 0.5 | 0.75 | 1; positions: TradeView[]; error: string | null; result: string | null };

function perpLine(order: PerpOrder, t: Translator): string {
  const values = {
    market: marketLabel(order.coin),
    size: formatUsd(order.sizeUsd, { decimals: order.sizeUsd % 1 === 0 ? 0 : 2 }),
    leverage: order.leverage,
    tp: order.takeProfitPct,
    sl: order.stopLossPct,
  };
  if (order.mode === "live") {
    return order.side === "long"
      ? t("Long {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, live on Hyperliquid.", values)
      : t("Short {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, live on Hyperliquid.", values);
  }
  return order.side === "long"
    ? t("Long {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, on paper.", values)
    : t("Short {market}, {size} at {leverage}x, take-profit {tp}%, stop-loss {sl}%, on paper.", values);
}

function closeLine(coin: string, fraction: number, t: Translator): string {
  const market = marketLabel(coin);
  return fraction === 0.5
    ? t("Close half your {market} position at the market.", { market })
    : fraction === 0.25
      ? t("Close a quarter of your {market} position at the market.", { market })
      : fraction === 0.75
        ? t("Close three quarters of your {market} position at the market.", { market })
        : t("Close your {market} position at the market.", { market });
}

/* ---- the orb ---- */

function Orb({ phase, onPress, label }: { phase: VoicePhase; onPress: () => void; label: string }) {
  const listening = phase === "listening";
  const speaking = phase === "speaking";
  const working = phase === "thinking" || phase === "transcribing";
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={label}
      className="relative flex size-36 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      {(listening || speaking) && (
        <span aria-hidden className={cn("absolute inset-0 rounded-full border-2 motion-safe:animate-ping", listening ? "border-accent" : "border-agent-accent")} />
      )}
      <span
        aria-hidden
        className={cn(
          "absolute inset-3 rounded-full border transition-colors duration-[var(--dur-fast)] ease-brand",
          working ? "border-dashed border-border-strong motion-safe:animate-spin [animation-duration:4s]" : "border-border-subtle",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "flex size-24 items-center justify-center rounded-full transition-colors duration-[var(--dur-fast)] ease-brand",
          listening ? "bg-accent text-text-on-accent" : speaking ? "bg-agent-accent text-text-on-accent" : "bg-surface-raised text-text-secondary",
        )}
      >
        {phase === "paused" || phase === "off" ? (
          <MicOff size={30} strokeWidth={1.5} />
        ) : speaking ? (
          <AudioLines size={32} strokeWidth={1.5} />
        ) : (
          <Mic size={30} strokeWidth={1.5} />
        )}
      </span>
    </button>
  );
}

/* ---- choosing a voice ---- */

function PersonaPicker({ persona, onClose }: { persona: VoicePersona; onClose: () => void }) {
  const t = useT();
  const auth = useElyraAuth();
  const speakingKey = useSpeaking();

  const preview = (entry: VoicePersona) => {
    unlockAudio();
    if (speakingKey === `preview:${entry.id}`) {
      stopSpeaking();
      return;
    }
    void speak(t("Hi, I'm {name}. Ask me anything about the markets, or tell me a trade.", { name: entry.name }), {
      persona: entry,
      locale: t.locale,
      getToken: auth.getAccessToken,
      key: `preview:${entry.id}`,
    });
  };

  return (
    <div role="radiogroup" aria-label={t("Elyra's voice")} className="flex flex-col gap-1.5">
      {VOICE_PERSONAS.map((entry) => {
        const selected = entry.id === persona.id;
        const previewing = speakingKey === `preview:${entry.id}`;
        return (
          <div
            key={entry.id}
            className={cn(
              "flex items-center gap-2 rounded-card border px-3 py-2",
              selected ? "border-border-accent bg-accent-quiet" : "border-border-subtle bg-surface-raised",
            )}
          >
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                choosePersona(entry.id);
                onClose();
              }}
              className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none"
            >
              <span className="type-body-sm flex items-center gap-1.5 font-medium text-text-primary">
                {entry.name}
                {selected && <Check size={13} strokeWidth={2} aria-hidden className="text-accent" />}
              </span>
              <span className="type-label text-text-muted">{t(entry.tagline)}</span>
            </button>
            <button
              type="button"
              onClick={() => preview(entry)}
              aria-label={previewing ? t("Stop the preview") : t("Hear {name}", { name: entry.name })}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
            >
              {previewing ? <Square size={12} strokeWidth={2} aria-hidden className="fill-current" /> : <Play size={14} strokeWidth={1.5} aria-hidden />}
            </button>
          </div>
        );
      })}
      <p className="type-label px-1 text-text-muted">{t("A voice changes how Elyra sounds and how briefly it speaks, never what it knows or can do.")}</p>
    </div>
  );
}

/* ---- the ticket ---- */

function TicketCard({
  ticket,
  busy,
  onConfirm,
  onCancel,
  onCloseOne,
}: {
  ticket: Ticket;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onCloseOne: (position: TradeView) => void;
}) {
  const t = useT();
  const live = ticket.kind === "perp" && ticket.order.mode === "live";
  return (
    <section aria-label={t("Order ticket")} className={cn("flex flex-col gap-2 rounded-card border bg-surface-raised p-3", live ? "border-border-accent" : "border-border-strong")}>
      <div className="flex items-center justify-between gap-2">
        <span className="type-eyebrow text-text-muted">{t("Heard as an order")}</span>
        {ticket.kind === "perp" && (
          <span className={cn("type-eyebrow rounded-chip border px-1.5", live ? "border-border-accent text-accent" : "border-border-subtle text-text-muted")}>
            {live ? t("Live") : t("Paper")}
          </span>
        )}
      </div>
      {ticket.kind === "perp" ? (
        <>
          <p className="type-body-sm font-medium text-text-primary">
            <span className={ticket.order.side === "long" ? "text-positive" : "text-negative"}>{ticket.order.side === "long" ? t("Long") : t("Short")}</span>{" "}
            {marketLabel(ticket.order.coin)}
          </p>
          <dl className="grid grid-cols-4 gap-2">
            {[
              [t("Size"), formatUsd(ticket.order.sizeUsd)],
              [t("Leverage"), `${ticket.order.leverage}x`],
              [t("Take-profit"), `${ticket.order.takeProfitPct}%`],
              [t("Stop-loss"), `${ticket.order.stopLossPct}%`],
            ].map(([term, value]) => (
              <div key={term} className="min-w-0">
                <dt className="type-label truncate text-text-muted">{term}</dt>
                <dd className="type-data-sm text-text-primary">{value}</dd>
              </div>
            ))}
          </dl>
          {ticket.defaulted && <p className="type-label text-text-muted">{t("Anything you did not say is the ticket's default. Say the order again to change it.")}</p>}
        </>
      ) : (
        <>
          <p className="type-body-sm font-medium text-text-primary">{closeLine(ticket.coin, ticket.fraction, t)}</p>
          {ticket.positions.length > 1 && (
            <ul className="flex flex-col gap-1.5">
              {ticket.positions.map((position) => (
                <li key={position.id} className="flex items-center justify-between gap-2 rounded-control border border-border-subtle px-2.5 py-1.5">
                  <span className="type-label min-w-0 truncate text-text-secondary">
                    {position.side === "long" ? t("Long") : t("Short")} · {formatPriceUsd(position.entryPrice)} · {position.ruleName} · {position.mode === "live" ? t("Live") : t("Paper")}
                  </span>
                  <Button size="xs" variant="quiet" disabled={busy || ticket.result !== null} onClick={() => onCloseOne(position)}>
                    {t("Close this")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {ticket.error !== null && (
        <p role="alert" className="type-label text-negative">
          {ticket.error}
        </p>
      )}
      {ticket.result !== null && <p className="type-label text-positive">{ticket.result}</p>}
      {ticket.result === null && (
        <div className="flex flex-wrap items-center gap-2">
          {ticket.error === null && (ticket.kind === "perp" || ticket.positions.length === 1) && (
            <Button size="sm" variant="accent" disabled={busy} onClick={onConfirm}>
              {busy ? t("Placing") : ticket.kind === "close" ? t("Confirm close") : live ? t("Confirm live order") : t("Confirm")}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
            {t("Cancel")}
          </Button>
          {ticket.error === null && (
            <span className="type-label text-text-muted">
              {live || (ticket.kind === "close" && ticket.positions.some((position) => position.mode === "live"))
                ? t("Live money: tap to confirm.")
                : t("Or say “confirm”.")}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/* ---- the conversation ---- */

export function VoiceMode({ onEnd }: { onEnd: () => void }) {
  const t = useT();
  const auth = useElyraAuth();
  const automation = useAutomation();
  const persona = useVoicePersona();
  const [choosing, setChoosing] = useState(false);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [busy, setBusy] = useState(false);
  const [swap, setSwap] = useState<{ from: string; to: string; amount: string } | null>(null);
  const [swapSymbols, setSwapSymbols] = useState<string[]>([]);
  const ticketRef = useRef<Ticket | null>(null);
  const automationRef = useRef(automation);
  useEffect(() => {
    ticketRef.current = ticket;
    automationRef.current = automation;
  });

  /* The swap list is served, never copied into the client (lib/trade.ts is server-only). */
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/swap/tokens")
      .then((response) => response.json() as Promise<{ groups?: Array<{ symbols?: string[] }> }>)
      .then((payload) => {
        if (!cancelled) setSwapSymbols((payload.groups ?? []).flatMap((group) => group.symbols ?? []));
      })
      .catch(() => {
        /* Without it, tokens are still heard by name. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showTicket = (next: Ticket | null) => {
    ticketRef.current = next;
    setTicket(next);
  };

  /** Places the ticket through the chart ticket's own routes. Returns what to say. */
  const place = async (position?: TradeView): Promise<string> => {
    const current = ticketRef.current;
    if (current === null) return t("There is nothing waiting to confirm.");
    setBusy(true);
    try {
      if (current.kind === "perp") {
        const sent = await automationRef.current.write("/api/automation/trade", "POST", current.order);
        if (sent.error !== null) {
          showTicket({ ...current, error: sent.error });
          return t("That did not go through. The reason is on screen.");
        }
        const done = current.order.mode === "live" ? t("Done. The position is open on Hyperliquid.") : t("Done. The position is open on paper.");
        showTicket({ ...current, result: done });
        return done;
      }
      const target = position ?? (current.positions.length === 1 ? current.positions[0] : null);
      if (target === null) return t("Tap the position to close on screen.");
      const sent = await automationRef.current.write(`/api/automation/positions/${target.id}?fraction=${current.fraction}`, "DELETE");
      if (sent.error !== null) {
        showTicket({ ...current, error: sent.error });
        return t("That did not go through. The reason is on screen.");
      }
      const done = current.fraction === 1 ? t("Done. The position is closed.") : t("Done. That part of the position is closed.");
      showTicket({ ...current, result: done });
      return done;
    } finally {
      setBusy(false);
    }
  };

  const voice = useVoiceMode({
    persona,
    locale: t.locale,
    getToken: auth.getAccessToken,
    swapSymbols,
    errors: {
      blocked: t("Microphone access is blocked. Allow it for this site in your browser's settings."),
      noMic: t("No microphone was found."),
      failed: t("Listening stopped unexpectedly. Tap the microphone to try again."),
    },
    handlers: {
      hasTicket: () => ticketRef.current !== null && ticketRef.current.result === null,
      noAnswer: t("I have no answer for that one."),
      busy: t("I'm still working on the last question. Ask again in a moment."),
      pausedLine: t("I didn't hear anything, so I've stopped listening. Tap the microphone when you want to talk."),
      onCancel: () => {
        showTicket(null);
        return t("Cancelled. Nothing was placed.");
      },
      onConfirm: async () => {
        const current = ticketRef.current;
        if (current === null) return t("There is nothing waiting to confirm.");
        if (current.error !== null) return t("That order cannot be placed as it is. The reason is on screen.");
        /* Spoken "confirm" places paper only (`voiceMayConfirm`); live money needs a tap. */
        const spokenOk = current.kind === "perp" ? current.order.mode === "paper" : current.positions.length === 1 && current.positions[0].mode === "paper";
        if (!spokenOk) {
          return current.kind === "close" && current.positions.length > 1
            ? t("Tap the position to close on screen.")
            : t("It's live money, so it needs a tap. Press Confirm on screen, or say cancel.");
        }
        return place();
      },
      onOrder: (command: Exclude<VoiceCommand, { kind: "confirm" | "cancel" | "none" }>) => {
        const say = (text: string) => ({ say: text, listen: true });
        if (!auth.authenticated) return say(t("Sign in to trade by voice."));
        if (command.kind === "swap") {
          /* A swap is signed in the wallet, so it goes straight to the wallet's own dialog. */
          showTicket(null);
          setSwap({ from: command.from, to: command.to, amount: command.amount ?? "" });
          return {
            say:
              command.amount === null
                ? t("Swap {from} for {to}. It is open on screen: enter the amount, check it, then sign in your wallet.", { from: command.from, to: command.to })
                : t("Swap {amount} {from} for {to}. It is open on screen: check it, then sign in your wallet.", { amount: command.amount, from: command.from, to: command.to }),
            listen: false,
          };
        }
        if (command.kind === "perp") {
          const { order, defaulted } = completePerp(command);
          const checked = validateMarketOrder({ ...order });
          const data = automationRef.current.data;
          const liveBlocked = order.mode === "live" && !(data?.live.enabled === true && data.agent?.approved === true);
          const error =
            "error" in checked
              ? checked.error
              : liveBlocked
                ? t("Live trading is not set up for you here, so this can only be a paper order. Say it again without “live”.")
                : null;
          showTicket({ kind: "perp", order, defaulted: defaulted.length > 0, error, result: null });
          if (error !== null) return say(t("That order cannot be placed as it is. The reason is on screen."));
          const follow = order.mode === "live" ? t("It's live money, so it needs a tap. Press Confirm on screen, or say cancel.") : t("Say confirm to place it, or cancel.");
          return say(`${perpLine(order, t)} ${defaulted.length > 0 ? `${t("Anything you did not say is the ticket's default.")} ` : ""}${follow}`);
        }
        const positions = (automationRef.current.data?.trades ?? []).filter((trade) => trade.coin === command.coin && trade.status === "open");
        if (positions.length === 0) {
          showTicket(null);
          return say(t("You have no open {market} position.", { market: marketLabel(command.coin) }));
        }
        showTicket({ kind: "close", coin: command.coin, fraction: command.fraction, positions, error: null, result: null });
        if (positions.length > 1) return say(t("You have more than one {market} position open. Tap the one to close.", { market: marketLabel(command.coin) }));
        return say(
          `${closeLine(command.coin, command.fraction, t)} ${
            positions[0].mode === "live" ? t("It's live money, so it needs a tap. Press Confirm on screen, or say cancel.") : t("Say confirm to place it, or cancel.")
          }`,
        );
      },
    },
  });

  /* The conversation starts with the panel, from the click that opened it. */
  useEffect(() => {
    if (auth.authenticated) voice.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const end = () => {
    voice.end();
    onEnd();
  };

  const statusLine =
    voice.phase === "listening"
      ? t("Listening…")
      : voice.phase === "transcribing"
        ? t("Writing out what you said…")
        : voice.phase === "thinking"
          ? t("Thinking…")
          : voice.phase === "speaking"
            ? t("{name} is speaking — tap to interrupt", { name: persona.name })
            : voice.phase === "paused"
              ? t("Paused — tap to talk")
              : t("Starting…");

  const pressOrb = () => {
    if (voice.phase === "speaking" || voice.phase === "paused") voice.resume();
    else if (voice.phase === "listening") voice.pause();
  };

  if (!auth.authenticated) {
    return (
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface-panel p-6 text-center">
        <p className="type-body-sm text-text-secondary">{t("Sign in to talk to Elyra.")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="accent" onClick={auth.login} disabled={!auth.available}>
            {t("Sign in")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onEnd}>
            {t("Close")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div role="dialog" aria-label={t("Voice conversation with Elyra")} className="absolute inset-0 z-20 flex flex-col bg-surface-panel">
      <header className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={() => setChoosing((open) => !open)}
          aria-expanded={choosing}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-control px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
        >
          <AudioLines size={16} strokeWidth={1.5} aria-hidden className="shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="type-body-sm block truncate font-medium text-text-primary">{persona.name}</span>
            <span className="type-label block truncate text-text-muted">{t(persona.tagline)}</span>
          </span>
          <ChevronDown size={14} strokeWidth={1.5} aria-hidden className={cn("shrink-0 text-text-muted transition-transform", choosing && "rotate-180")} />
        </button>
        <Button size="sm" variant="quiet" onClick={end}>
          <X size={14} aria-hidden /> {t("End")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {choosing ? (
          <PersonaPicker persona={persona} onClose={() => setChoosing(false)} />
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 pt-2">
              <Orb phase={voice.phase} onPress={pressOrb} label={statusLine} />
              <p aria-live="polite" className="type-body-sm text-center text-text-secondary">
                {statusLine}
              </p>
            </div>

            {(voice.interim.length > 0 || voice.heard.length > 0) && (
              <p className="type-body-sm rounded-card bg-surface-hover px-3 py-2 text-text-primary">
                <span className="type-label block text-text-muted">{t("You")}</span>
                {voice.interim.length > 0 ? voice.interim : voice.heard}
              </p>
            )}

            {ticket !== null && (
              <TicketCard
                ticket={ticket}
                busy={busy}
                onConfirm={() => {
                  unlockAudio();
                  void place().then((line) => voice.say(line));
                }}
                onCancel={() => {
                  showTicket(null);
                  voice.say(t("Cancelled. Nothing was placed."));
                }}
                onCloseOne={(position) => {
                  unlockAudio();
                  void place(position).then((line) => voice.say(line));
                }}
              />
            )}

            {voice.said.length > 0 && (
              <p className="agent-rail type-body-sm rounded-card rounded-l-none bg-surface-raised px-3 py-2 text-text-primary">
                <span className="type-label block text-text-muted">{persona.name}</span>
                {voice.said}
              </p>
            )}

            {voice.error !== null && (
              <p role="alert" className="type-label text-negative">
                {voice.error}
              </p>
            )}
          </>
        )}
      </div>

      <footer className="shrink-0 border-t border-border-subtle px-4 py-3">
        <p className="type-label text-text-muted">
          {t("Ask anything, or say an order — “long BTC 100 dollars 3x”, “close half my ETH”, “buy 50 dollars of SOL”. Orders are read back and wait for you to confirm.")}
        </p>
      </footer>

      {swap !== null && (
        <SwapDialog
          address={auth.solanaAddress}
          initialFrom={swap.from}
          initialTo={swap.to}
          initialAmount={swap.amount}
          onClose={() => {
            setSwap(null);
            voice.resume();
          }}
        />
      )}
    </div>
  );
}
