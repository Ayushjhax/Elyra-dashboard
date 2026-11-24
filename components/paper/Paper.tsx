"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight, FlaskConical, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/** Switch to a mode, offering the account first when Paper has none yet. Null on success, else the reason. */
async function switchTo(feed: PaperFeed, mode: TradingMode): Promise<string | null> {
  if (mode === feed.mode) return null;
  if (mode === "paper" && feed.account === null) {
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

  const choose = async (mode: TradingMode) => {
    setBusy(true);
    setError(await switchTo(feed, mode));
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
            onClick={() => void choose(mode)}
            className={cn(
              "type-label flex items-center justify-center gap-1.5 rounded-chip px-2.5 transition-colors duration-[var(--dur-fast)] ease-brand disabled:cursor-default",
              on
                ? mode === "paper"
                  ? "bg-surface-active text-text-primary"
                  : "bg-surface-hover text-text-primary"
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

/** The account menu's row: on a phone it is the switch. */
export function PaperMenuRow({ className, onDone }: { className: string; onDone: () => void }) {
  const t = useT();
  const feed = usePaper();
  if (!feed.signedIn) return null;
  const toPaper = feed.mode === "live";
  return (
    <button
      type="button"
      onClick={() => {
        onDone();
        void switchTo(feed, toPaper ? "paper" : "live");
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

function ClaimDialog({ feed }: { feed: PaperFeed }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
      <DialogContent className="w-[min(420px,calc(100vw-24px))] p-0">
        <DialogHeader className="border-b border-border-subtle px-4 py-3">
          <DialogTitle className="type-h2 text-text-primary">{t("Paper trading")}</DialogTitle>
          <DialogDescription className="type-body-sm text-text-secondary">
            {t("Start trading with {amount} in virtual funds. Test everything Elyra can do, with no real money at risk.", { amount: formatUsd(PAPER_STARTING_USD, { decimals: 0 }) })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 p-4">
          <ul className="type-body-sm flex list-disc flex-col gap-1.5 pl-5 text-text-secondary marker:text-text-muted">
            <li>{t("Paper orders fill at Hyperliquid's live prices, less the fees and slippage a live order would pay.")}</li>
            <li>{t("Live and Paper are separate accounts. Switch between them any time in the top bar.")}</li>
            <li>{t("A rule or a copy you set on paper stays on paper until you move it to live yourself.")}</li>
          </ul>
          {error !== null && (
            <p role="alert" className="type-label rounded-card border border-negative/40 bg-negative-bg px-3 py-2 text-negative">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
              {t("Not now")}
            </Button>
            <Button
              size="sm"
              variant="accent"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const failed = await feed.claim();
                setBusy(false);
                if (failed !== null) setError(failed);
                else setOpen(null);
              }}
            >
              {busy ? t("Claiming…") : t("Claim {amount}", { amount: formatUsd(PAPER_STARTING_USD, { decimals: 0 }) })}
            </Button>
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
  if (feed.mode !== "paper" || feed.account === null) return null;
  const funds = feed.account.funds;
  return (
    <div role="status" className="flex shrink-0 items-center gap-x-3 border-b border-border-accent bg-surface-active px-4 py-1.5 compact:gap-x-4 compact:px-[var(--pad-workspace)]">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <FlaskConical size={15} strokeWidth={1.5} aria-hidden className="shrink-0 text-text-primary" />
        <span className="type-body-sm min-w-0 truncate text-text-primary">
          <span className="whitespace-nowrap font-medium">{t("Paper trading.")}</span>{" "}
          <span className="hidden text-text-secondary mid:inline">{t("Practicing with virtual funds — no real money at risk.")}</span>
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
        <Button
          size="sm"
          variant="quiet"
          className="h-7"
          title={error ?? undefined}
          onClick={async () => setError(await feed.setMode("live"))}
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
            onClick={async () => setError(await switchTo(feed, paper ? "live" : "paper"))}
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
