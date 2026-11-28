"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChartNoAxesColumnIncreasing, ChevronDown, ChevronRight, FlaskConical, Layers, LoaderCircle, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { PAPER_STARTING_USD } from "@/lib/paper/funds";
import { usePaper, type PaperFeed, type TradingMode } from "@/lib/paper/usePaper";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Live and Paper: two accounts side by side.

   Live trades the funds in the person's own Hyperliquid account; Paper
   trades virtual equity at Hyperliquid's live prices and never touches
   their money. The switch is in the header on every page (in the account
   menu on a phone); the first switch to Paper offers the account. While
   Paper is on, a band under the header says so, with the balance. Nothing
   else changes: the same chart, the same ticket, the same Automation forms
   — only the account behind the order.

   The band is Elyra Green (--surface-active, the brand's "selected"
   surface): a mode that is on, not a warning (Caution is for degraded
   infrastructure) and not the agent's lime.
--------------------------------------------------------------------------- */

/* Which paper dialog is open, shared by the header, the menu and the band. */
type Open = "claim" | "account" | null;
let open: Open = null;
const openListeners = new Set<() => void>();
function setOpen(next: Open) {
  open = next;
  for (const listener of openListeners) listener();
}
function useOpen(): Open {
  return useSyncExternalStore(
    (listener) => {
      openListeners.add(listener);
      return () => openListeners.delete(listener);
    },
    () => open,
    () => null,
  );
}

/* The control that opened the setup dialog, to take focus back when it
   closes. Radix returns focus only to a DialogTrigger, and this dialog is
   opened from several places, none of them one. */
let returnFocus: HTMLElement | null = null;

/**
 * Switch to a mode, offering the account first when Paper has none yet.
 * `from` is the control that asked, for focus to return to. Null on
 * success, else the reason.
 */
async function switchTo(feed: PaperFeed, mode: TradingMode, from?: HTMLElement | null): Promise<string | null> {
  if (mode === feed.mode) return null;
  if (mode === "paper" && feed.account === null) {
    returnFocus = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setOpen("claim");
    return null;
  }
  return feed.setMode(mode);
}

/** The header's Live / Paper switch. Hidden signed out and on a phone, where the account menu has it. */
export function ModeSwitch({ className }: { className?: string }) {
  const t = useT();
  const feed = usePaper();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!feed.signedIn) return null;

  const choose = async (mode: TradingMode, from: HTMLElement) => {
    setBusy(true);
    setError(await switchTo(feed, mode, from));
    setBusy(false);
  };

  return (
    <div
      role="radiogroup"
      aria-label={t("Trading account")}
      title={error ?? undefined}
      className={cn("grid h-9 grid-cols-2 gap-0.5 rounded-control border border-border-subtle bg-surface-panel p-0.5", className)}
    >
      {(["live", "paper"] as const).map((mode) => {
        const on = feed.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={busy || feed.loading}
            onClick={(event) => void choose(mode, event.currentTarget)}
            className={cn(
              "type-label flex items-center justify-center gap-1.5 rounded-chip px-2.5 transition-colors duration-[var(--dur-fast)] ease-brand disabled:cursor-default",
              /* The account orders go to is the active state. Paper is lit in
                 Elyra Green with a Khaki edge, the colour of the band under the
                 header, so the two read as one mode; Live keeps the lime of
                 every other active control. */
              on
                ? mode === "paper"
                  ? "bg-surface-active font-semibold text-text-primary shadow-[inset_0_0_0_1px_var(--border-accent)]"
                  : "bg-accent font-semibold text-text-on-accent"
                : "text-text-muted hover:bg-surface-hover hover:text-text-primary",
            )}
          >
            {mode === "live" ? <Zap size={13} strokeWidth={1.5} aria-hidden /> : <FlaskConical size={13} strokeWidth={1.5} aria-hidden />}
            {mode === "live" ? t("Live") : t("Paper")}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The account an order goes to, repeated where the order is made — the
 * chart's ticket — so nobody has to look back at the header to know.
 */
export function ModeBadge({ paperOnly = false, className }: { paperOnly?: boolean; className?: string }) {
  const t = useT();
  const feed = usePaper();
  if (!feed.signedIn && !paperOnly) return null;
  const paper = paperOnly || feed.mode === "paper";
  return (
    <span
      className={cn(
        "type-label inline-flex h-6 shrink-0 items-center gap-1 rounded-pill border px-2 text-text-primary",
        paper ? "border-transparent bg-surface-active" : "border-accent-quiet",
        className,
      )}
    >
      {paper ? <FlaskConical size={12} strokeWidth={1.5} aria-hidden /> : <Zap size={12} strokeWidth={1.5} aria-hidden />}
      {paper ? t("Paper") : t("Live")}
    </span>
  );
}

/** The account menu's row: on a phone it is the switch. */
export function PaperMenuRow({ className, onDone }: { className: string; onDone: () => void }) {
  const t = useT();
  const feed = usePaper();
  if (!feed.signedIn) return null;
  const toPaper = feed.mode === "live";
  return (
    <button
      type="button"
      onClick={(event) => {
        /* The menu closes as the setup dialog opens, so focus goes back to
           the button that opened the menu, not to this row. */
        const menu = event.currentTarget.closest<HTMLElement>("[role='dialog'][id]");
        const opener = menu === null ? null : document.querySelector<HTMLElement>(`[aria-controls="${menu.id}"]`);
        onDone();
        void switchTo(feed, toPaper ? "paper" : "live", opener);
      }}
      className={className}
    >
      {toPaper ? (
        <FlaskConical size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
      ) : (
        <Zap size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
      )}
      <span className="flex-1">{toPaper ? t("Paper trading") : t("Go live")}</span>
      <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
    </button>
  );
}

/* The flask, as lucide draws it on a 24px grid, for the plaque to etch. */
const FLASK_PATHS = [
  "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2",
  "M6.453 15h11.094",
  "M8.5 2h7",
];

/**
 * The balance card's illustration: a tilted pane of glass, a second one
 * behind it, and the flask etched into the front — a dark line under a
 * light one. Decorative; every colour is a `paper-plaque-*` class.
 */
function FlaskPlaque({ className }: { className?: string }) {
  const sheen = useId();
  return (
    <svg viewBox="0 0 120 100" aria-hidden focusable="false" className={className}>
      <defs>
        <linearGradient id={sheen} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="paper-plaque-sheen-hi" />
          <stop offset="1" className="paper-plaque-sheen-lo" />
        </linearGradient>
      </defs>
      <rect x="44" y="16" width="70" height="76" rx="13" transform="skewX(-14)" strokeWidth="1" className="paper-plaque-back" />
      <rect x="34" y="6" width="70" height="76" rx="13" transform="skewX(-14)" strokeWidth="1" fill={`url(#${sheen})`} className="paper-plaque-face" />
      <g transform="translate(37.5 22) scale(1.75)" fill="none" strokeWidth="0.85" strokeLinecap="round" strokeLinejoin="round">
        {FLASK_PATHS.map((d) => (
          <path key={`shade-${d}`} d={d} transform="translate(0 0.45)" className="paper-plaque-etch-shade" />
        ))}
        {FLASK_PATHS.map((d) => (
          <path key={d} d={d} className="paper-plaque-etch" />
        ))}
      </g>
    </svg>
  );
}

/**
 * Setting up the paper account, the first time someone picks Paper.
 *
 * Graphite glass (`.graphite-glass` in app/globals.css), shared only with
 * the chart's order ticket — a documented deviation (README, CLAUDE.md). Starting calls the
 * claim, which makes the account with the starting funds and switches to
 * it in one write, so the mode changes only once the server has done both.
 * While that is in flight the dialog cannot be dismissed — the server's
 * switch cannot be called back — and a failure keeps it open with the
 * reason. Its controls stay focusable while busy (aria-disabled, not
 * disabled), so focus is never dropped mid-request.
 */
function ClaimDialog({ feed }: { feed: PaperFeed }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* A ref as well as state: a second press in the same frame is refused before React re-renders. */
  const pending = useRef(false);
  const startRef = useRef<HTMLButtonElement>(null);
  const amount = formatUsd(PAPER_STARTING_USD, { decimals: 0 });

  const dismiss = () => {
    if (!pending.current) setOpen(null);
  };

  const start = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    const failed = await feed.claim();
    pending.current = false;
    setBusy(false);
    if (failed === null) setOpen(null);
    else setError(failed);
  };

  return (
    <Dialog open onOpenChange={(next) => !next && dismiss()}>
      <DialogContent
        showClose={false}
        overlayClassName="graphite-glass-overlay"
        className="graphite-glass w-[min(520px,calc(100vw-32px))] max-h-[calc(100dvh-32px)]"
        aria-busy={busy}
        onOpenAutoFocus={(event) => {
          /* The person just chose Paper: the step that does it is where focus starts. */
          event.preventDefault();
          startRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocus;
          returnFocus = null;
          if (target !== null && target.isConnected) {
            event.preventDefault();
            target.focus();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (pending.current) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (pending.current) event.preventDefault();
        }}
      >
        <div className="flex min-h-0 flex-col overflow-y-auto p-5 compact:px-8 compact:pb-7 compact:pt-7">
          <DialogHeader className="gap-3 border-0 p-0">
            <div className="flex items-center gap-3">
              <FlaskConical size={26} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-primary" />
              <DialogTitle className="type-h1 min-w-0 flex-1 text-text-primary">{t("Paper trading")}</DialogTitle>
              <DialogClose
                aria-label={t("Close")}
                aria-disabled={busy || undefined}
                className="graphite-glass-close inline-flex size-8 shrink-0 items-center justify-center"
              >
                <X size={16} strokeWidth={1.5} aria-hidden />
              </DialogClose>
            </div>
            <DialogDescription className="type-body text-text-secondary">{t("Practice trading with virtual funds.")}</DialogDescription>
          </DialogHeader>

          <div className="graphite-glass-card mt-5 flex items-center justify-between gap-3 py-5 pl-5 pr-3 compact:py-6 compact:pl-7 compact:pr-4">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="type-body text-text-secondary">{t("Virtual balance")}</span>
              {/* Not tabular: Fustat's tabular comma is a full digit wide, and this figure does not tick. */}
              <span className="type-display text-text-primary">{amount}</span>
            </div>
            <FlaskPlaque className="h-auto w-[84px] shrink-0 compact:w-[116px]" />
          </div>

          <ul className="mt-6 flex flex-col gap-3.5">
            <li className="type-body flex items-start gap-3 text-text-primary">
              <ChartNoAxesColumnIncreasing size={18} strokeWidth={1.5} aria-hidden className="mt-px shrink-0 text-text-secondary" />
              <span>{t("Simulated fills use Hyperliquid's live prices.")}</span>
            </li>
            <li className="type-body flex items-start gap-3 text-text-primary">
              <Layers size={18} strokeWidth={1.5} aria-hidden className="mt-px shrink-0 text-text-secondary" />
              <span>{t("Paper and Live use separate accounts.")}</span>
            </li>
          </ul>

          {/* The rules the two lines above shorten, kept word for word. */}
          <details className="group mt-4">
            <summary className="type-label inline-flex cursor-pointer items-center gap-1 text-text-secondary hover:text-text-primary">
              <ChevronRight size={14} strokeWidth={1.5} aria-hidden className="transition-transform duration-[var(--dur-fast)] ease-brand group-open:rotate-90" />
              {t("How paper trading works")}
            </summary>
            <ul className="type-body-sm mt-2 flex list-disc flex-col gap-1.5 pl-9 text-text-secondary marker:text-text-muted">
              <li>{t("Paper orders fill at Hyperliquid's live prices, less the fees and slippage a live order would pay.")}</li>
              <li>{t("Live and Paper are separate accounts. Switch between them any time in the top bar.")}</li>
              <li>{t("A rule or a copy you set on paper stays on paper until you move it to live yourself.")}</li>
            </ul>
          </details>

          {error !== null && (
            <p role="alert" className="type-label mt-4 rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
              {t(error)}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              aria-disabled={busy || undefined}
              onClick={dismiss}
              className="graphite-glass-quiet type-body h-11 px-4 font-medium"
            >
              {t("Not now")}
            </button>
            <button
              ref={startRef}
              type="button"
              aria-disabled={busy || undefined}
              onClick={() => void start()}
              className="graphite-glass-cta type-body inline-flex h-11 items-center gap-2 px-6 font-semibold"
            >
              {busy && <LoaderCircle size={16} strokeWidth={2} aria-hidden className="motion-safe:animate-spin" />}
              {busy ? t("Setting up…") : t("Start paper trading")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Figure({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="type-label text-text-muted">{label}</span>
      <span className={cn("type-data text-text-primary", tone && (value > 0 ? "text-positive" : value < 0 ? "text-negative" : undefined))}>
        {formatUsd(value, { sign: tone })}
      </span>
    </div>
  );
}

function AccountDialog({ feed }: { feed: PaperFeed }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const account = feed.account;
  if (account === null) return null;
  const funds = account.funds;
  const started = new Date(account.startedAt).toLocaleDateString(t.locale, { year: "numeric", month: "short", day: "numeric" });

  return (
    <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
      <DialogContent className="w-[min(440px,calc(100vw-24px))] p-0">
        <DialogHeader className="border-b border-border-subtle px-4 py-3">
          <DialogTitle className="type-h2 text-text-primary">{t("Paper account")}</DialogTitle>
          <DialogDescription className="type-body-sm text-text-secondary">
            {account.resets === 0 ? t("Started with {amount} on {date}.", { amount: formatUsd(account.startingUsd, { decimals: 0 }), date: started }) : t("Reset to {amount} on {date}.", { amount: formatUsd(account.startingUsd, { decimals: 0 }), date: started })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 p-4">
          <div className="grid grid-cols-2 gap-3 compact:grid-cols-3">
            <Figure label={t("Equity")} value={funds.equityUsd} />
            <Figure label={t("Balance")} value={funds.balanceUsd} />
            <Figure label={t("Available")} value={funds.availableUsd} />
            <Figure label={t("Open result")} value={funds.unrealisedUsd} tone />
            <Figure label={t("Closed result")} value={funds.realisedUsd} tone />
            <Figure label={t("Margin in use")} value={funds.marginUsd} />
          </div>
          <p className="type-label text-text-muted">
            {t("{positions} open on paper · {orders} resting orders.", { positions: funds.openPositions, orders: funds.restingOrders })}{" "}
            {funds.unmarked > 0 && t("{count} could not be priced just now and count as flat.", { count: funds.unmarked })}{" "}
            <Link href="/automation" onClick={() => setOpen(null)} className="text-accent hover:text-accent-hover">
              {t("See paper trades")}
            </Link>
          </p>
          <p className="type-label text-text-muted">
            {t("The balance is the starting funds plus the result of every paper trade since then, after fees. Equity marks open positions to the mid now; a new paper order needs its margin from what is available.")}
          </p>
          {confirming ? (
            <div className="flex flex-col gap-2 rounded-card border border-border-subtle bg-surface-base p-3">
              <p className="type-label text-text-secondary">
                {t("Start the paper account again at {amount}? Past paper trades stay in your history; they no longer count toward the balance. Close or cancel anything open on paper first.", { amount: formatUsd(PAPER_STARTING_USD, { decimals: 0 }) })}
              </p>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                  {t("Keep it")}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const failed = await feed.resetAccount();
                    setBusy(false);
                    setError(failed);
                    if (failed === null) setConfirming(false);
                  }}
                >
                  {t("Reset to {amount}", { amount: formatUsd(PAPER_STARTING_USD, { decimals: 0 }) })}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirming(true)}>
                {t("Reset balance")}
              </Button>
              {feed.mode === "paper" ? (
                <Button
                  size="sm"
                  variant="quiet"
                  onClick={async () => {
                    const failed = await feed.setMode("live");
                    setError(failed);
                    if (failed === null) setOpen(null);
                  }}
                >
                  <Zap size={14} aria-hidden />
                  {t("Go live")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="accent"
                  onClick={async () => {
                    const failed = await feed.setMode("paper");
                    setError(failed);
                    if (failed === null) setOpen(null);
                  }}
                >
                  <FlaskConical size={14} aria-hidden />
                  {t("Switch to paper")}
                </Button>
              )}
            </div>
          )}
          {error !== null && (
            <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The band under the header while Paper is on, on every page. */
export function PaperBanner() {
  const t = useT();
  const feed = usePaper();
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  if (feed.mode !== "paper" || feed.account === null) return null;
  const funds = feed.account.funds;
  return (
    <div
      role="status"
      aria-label={t("Paper trading")}
      className="flex shrink-0 items-center gap-x-3 border-b border-border-accent bg-surface-active px-4 py-1.5 compact:gap-x-4 compact:px-[var(--pad-workspace)]"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <FlaskConical size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-primary" />
        <span className="type-body-sm min-w-0 truncate text-text-primary">
          <span className="whitespace-nowrap font-semibold">{t("Virtual funds")}</span>{" "}
          <span className="hidden text-text-secondary full:inline">{t("No real money at risk.")}</span>
        </span>
      </span>
      {/* The figures open the account; from 640px there is an Account button as well. */}
      <button type="button" onClick={() => setOpen("account")} className="type-data-sm shrink-0 whitespace-nowrap rounded-chip text-text-primary hover:text-accent-hover">
        {t("Equity {equity}", { equity: formatUsd(funds.equityUsd) })}
        <span className="hidden text-text-secondary compact:inline"> · {t("Available {available}", { available: formatUsd(funds.availableUsd) })}</span>
      </button>
      <span className="flex shrink-0 items-center gap-1">
        <Button size="sm" variant="ghost" className="hidden h-7 text-text-primary compact:inline-flex" onClick={() => setOpen("account")}>
          {t("Account")}
        </Button>
        {/* The header's own switch, never an order: going live changes only
            which account the next order goes to. */}
        <Button
          size="sm"
          variant="quiet"
          className="h-7"
          title={error ?? undefined}
          disabled={leaving}
          onClick={async (event) => {
            setLeaving(true);
            setError(await switchTo(feed, "live", event.currentTarget));
            setLeaving(false);
          }}
        >
          <Zap size={13} aria-hidden />
          {t("Go live")}
        </Button>
      </span>
    </div>
  );
}

/** The paper dialogs, mounted once by the shell. */
export function PaperDialogs() {
  const feed = usePaper();
  const which = useOpen();
  if (!feed.signedIn) return null;
  if (which === "claim") return <ClaimDialog feed={feed} />;
  if (which === "account") return <AccountDialog feed={feed} />;
  return null;
}

/** Opens the paper account's details from anywhere — the chart's ticket, a form. */
export function openPaperAccount() {
  setOpen("account");
}

/**
 * Which account an order goes to, for a form: the account and what it has
 * available, and a way to switch — the same switch as the header's, so a
 * form never sends to an account other than the one the header shows.
 */
export function OrderAccount({ liveReady, liveNote, paperOnly = false }: { liveReady: boolean; liveNote: string; paperOnly?: boolean }) {
  const t = useT();
  const feed = usePaper();
  const [error, setError] = useState<string | null>(null);
  const paper = paperOnly || feed.mode === "paper";
  /* Before the account exists, its first paper order makes it with the starting funds. */
  const available = feed.account?.funds.availableUsd ?? PAPER_STARTING_USD;
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border-subtle bg-surface-base px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-label flex items-center gap-1.5 text-text-secondary">
          {paper ? <FlaskConical size={13} aria-hidden className="text-text-primary" /> : <Zap size={13} aria-hidden className="text-text-primary" />}
          <span className="text-text-primary">{paper ? t("Paper account") : t("Live account")}</span>
          {paper && <span>· {t("{available} available", { available: formatUsd(available) })}</span>}
        </span>
        {!paperOnly && (
          <button
            type="button"
            onClick={async (event) => setError(await switchTo(feed, paper ? "live" : "paper", event.currentTarget))}
            className="type-label rounded-chip px-1 text-accent hover:text-accent-hover"
          >
            {paper ? t("Switch to live") : t("Switch to paper")}
          </button>
        )}
      </div>
      {paperOnly && feed.mode === "live" && <p className="type-label text-text-muted">{t("A paper trade: it goes to the paper account, whatever the top bar shows.")}</p>}
      {!paper && !liveReady && <p className="type-label text-text-muted">{liveNote}</p>}
      {error !== null && <p className="type-label text-negative">{error}</p>}
    </div>
  );
}

/**
 * The order ticket's account row: which account the order goes to and,
 * on paper, what it has available. Choosing the other account is the
 * header's own switch (`switchTo`) — the first Paper still offers the
 * account, and nothing is ever sent by switching. A signal's Paper trade is
 * fixed to paper, whatever the header shows.
 *
 * A native select lies invisibly over the row, so it reads as the design
 * and opens the platform's own picker on a phone.
 */
export function TicketAccount({ liveReady, liveNote, paperOnly = false }: { liveReady: boolean; liveNote: string; paperOnly?: boolean }) {
  const t = useT();
  const feed = usePaper();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const paper = paperOnly || feed.mode === "paper";
  /* Before the account exists, its first paper order makes it with the starting funds. */
  const available = feed.account?.funds.availableUsd ?? PAPER_STARTING_USD;
  const fixed = paperOnly || feed.loading || busy;
  return (
    <div className="flex flex-col gap-1.5">
      <label className="graphite-inset graphite-picker relative flex h-12 items-center gap-2.5 px-3.5">
        {paper ? (
          <FlaskConical size={17} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-primary" />
        ) : (
          <Zap size={17} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-primary" />
        )}
        <span className="type-body min-w-0 truncate font-medium text-text-primary">{paper ? t("Paper account") : t("Live account")}</span>
        {paper && <span className="type-data tabular-nums text-text-secondary">{formatUsd(available)}</span>}
        {!paperOnly && <ChevronDown size={16} strokeWidth={1.5} aria-hidden className="ml-auto shrink-0 text-text-secondary" />}
        <select
          aria-label={t("Trading account")}
          value={paper ? "paper" : "live"}
          disabled={fixed}
          onChange={async (event) => {
            const select = event.currentTarget;
            setBusy(true);
            setError(await switchTo(feed, event.target.value === "paper" ? "paper" : "live", select));
            setBusy(false);
          }}
          className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
        >
          <option value="paper">{t("Paper account")}</option>
          <option value="live">{t("Live account")}</option>
        </select>
      </label>
      {paperOnly && feed.mode === "live" && <p className="type-label text-text-muted">{t("A paper trade: it goes to the paper account, whatever the top bar shows.")}</p>}
      {!paper && !liveReady && <p className="type-label text-text-muted">{liveNote}</p>}
      {error !== null && (
        <p role="alert" className="type-label text-negative">
          {t(error)}
        </p>
      )}
    </div>
  );
}
