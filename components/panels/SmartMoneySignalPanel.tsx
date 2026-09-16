"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, RefreshCw, Radio, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { formatRelativeTime } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { cn } from "@/lib/utils";
import { parseTrackerSignalList, type TrackerSignal } from "@/lib/tracker/types";

interface FeedState { signals: TrackerSignal[]; disclaimer: string; error: string | null; loading: boolean; fetchedAt: string | null; connection: "live" | "polling" | "offline"; }
const INITIAL: FeedState = { signals: [], disclaimer: "", error: null, loading: true, fetchedAt: null, connection: "polling" };

/* `formatRelativeTime` defaults its `now` to MOCK_NOW — a frozen instant the
   seeded panels use — so live data has to pass the real one. It cannot come
   from `Date.now()` in a render body: that is an impure read, the React
   compiler rejects it, and it is why this file failed lint. It comes from the
   shared minute clock instead, which is null until hydration (there is no
   "now" the server and client would agree on) and ticks on its own after,
   so these ages advance without anything else re-rendering the list. */
function age(iso: string, now: number | null): string {
  return now === null ? "—" : formatRelativeTime(iso, now);
}

/**
 * Whether this row was seeded for a demo rather than observed.
 *
 * `configVersion` names the rule set that produced a signal; the seeding
 * script stamps `seed-…`. Checked in one place so the card badge and the
 * panel banner can never disagree about which rows are real — and so that
 * deleting the seed makes every trace of it disappear at once.
 */
function isSeeded(signal: TrackerSignal): boolean {
  return (signal.configVersion ?? "").startsWith("seed-");
}

function money(value: string | null): string { if (value === null) return "—"; const number = Number(value); return Number.isFinite(number) ? `$${number.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : value; }
function quantity(value: string): string { const number = Number(value); return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : value; }

function SmartMoneyCard({ signal, now }: { signal: TrackerSignal; now: number | null }) {
  const [open, setOpen] = useState(false);
  const positive = signal.side === "LONG" || signal.side === "ACCUMULATING";
  return (
    <li>
      <article className="border-b border-border-subtle px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("type-label rounded-pill px-1.5 py-0.5", positive ? "bg-positive-bg text-positive" : "bg-negative-bg text-negative")}>
            {signal.status}
          </span>
          {isSeeded(signal) && (
            /* On the card, not only in a banner. A reader who scrolls past
               the header, or screenshots one card, must still see that this
               consensus was never observed. */
            <span
              title="Seeded demo row — not observed consensus. Wallets and prices are real; the consensus is not."
              className="type-label flex items-center gap-1 rounded-chip border border-accent-quiet px-1.5 py-0.5 text-accent"
            >
              <FlaskConical size={10} strokeWidth={1.5} aria-hidden />
              DEMO
            </span>
          )}
          <span className="type-label ml-auto text-text-muted">{age(signal.createdAt, now)}</span>
        </div>

        <div className="mt-2 flex items-baseline gap-2">
          <span className="type-data text-text-primary">{signal.symbol}</span>
          <span className={cn("type-data-sm rounded-chip border border-border-subtle px-1.5 py-0.5", positive ? "text-positive" : "text-negative")}>{signal.side}</span>
          <span className="type-label ml-auto text-text-muted">{signal.window}</span>
        </div>

        <dl className="mt-2 grid grid-cols-2 gap-2 rounded-card border border-border-subtle bg-surface-raised p-2.5 sm:grid-cols-4">
          <div><dt className="type-label text-text-muted">Consensus</dt><dd className="type-data-sm text-text-primary">{signal.walletCount} wallets</dd></div>
          <div><dt className="type-label text-text-muted">Score</dt><dd className="type-data-sm text-text-primary">{signal.weightedScore.toFixed(0)}</dd></div>
          <div><dt className="type-label text-text-muted">Diversity</dt><dd className="type-data-sm text-text-primary">{signal.archetypeCount} archetypes</dd></div>
          <div><dt className="type-label text-text-muted">Price</dt><dd className="type-data-sm text-text-primary">{money(signal.currentPxUsd)}</dd></div>
        </dl>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <div><Eyebrow>Wallet performance</Eyebrow><p className="type-data-sm mt-1 text-text-secondary">{signal.participants.slice(0, 3).map((participant) => `${participant.archetype} ${participant.score.toFixed(0)}`).join(" · ") || "No participants"}</p></div>
          <div><Eyebrow>Average cost</Eyebrow><p className="type-data-sm mt-1 text-text-secondary">{money(signal.vwapEntryUsd)} <span className={positive ? "text-positive" : "text-negative"}>{quantity(signal.participants.reduce((total, participant) => total + Number(participant.quantityDelta), 0).toString())}</span></p></div>
        </div>

        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="mt-3 flex min-h-10 w-full items-center justify-between rounded-control border border-border-subtle px-2.5 text-left type-label text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <span>{open ? "Hide participant detail" : "Show participant detail"}</span><ChevronDown size={14} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
        </button>
        {open && <ul className="mt-2 space-y-1.5" aria-label="Signal participants">
          {signal.participants.map((participant) => <li key={participant.wallet} className="flex items-baseline gap-2 type-label"><span className="min-w-0 flex-1 truncate text-text-secondary">{participant.wallet}</span><span className="text-text-muted">{participant.performance.realizedPnlUsd} PnL · {participant.performance.tradeCount} fills</span></li>)}
        </ul>}
      </article>
    </li>
  );
}

export function SmartMoneySignalPanel() {
  const [state, setState] = useState<FeedState>(INITIAL);
  const now = useMinute();
  const load = useCallback(async (): Promise<FeedState> => {
    try {
      const response = await fetch("/api/tracker/signals?limit=50", { cache: "no-store" });
      const payload = parseTrackerSignalList(await response.json() as unknown);
      /* The proxy answers 200 with an empty list when the tracker itself is
         unreachable, and puts the reason in `error`. Reading it is what stops
         this panel from reporting a connection failure as "the engine is
         running, but nothing has cleared the gates" — a claim about the
         market, made when no market was ever consulted. */
      const engineError = payload.error ?? null;
      return { signals: payload.signals, disclaimer: payload.disclaimer, error: engineError, loading: false, fetchedAt: new Date().toISOString(), connection: engineError === null ? "polling" : "offline" };
    } catch (error: unknown) {
      return { signals: [], disclaimer: "", error: error instanceof Error ? error.message : "Could not reach the tracker", loading: false, fetchedAt: new Date().toISOString(), connection: "offline" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => void load().then((next) => { if (!cancelled) setState(next); });
    tick();
    const timer = setInterval(tick, 60_000);
    const stream = new EventSource("/api/tracker/stream");
    stream.addEventListener("snapshot", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as unknown;
        const next = parseTrackerSignalList({ ...parsed as Record<string, unknown>, disclaimer: "Signals are observational consensus data, not financial advice.", count: (parsed as { signals?: unknown[] }).signals?.length ?? 0, generatedAt: new Date().toISOString() });
        setState({ signals: next.signals, disclaimer: next.disclaimer, error: null, loading: false, fetchedAt: next.generatedAt, connection: "live" });
      } catch { /* polling remains the recovery path for malformed stream frames */ }
    });
    stream.addEventListener("error", () => setState((current) => ({ ...current, connection: current.error === null ? "polling" : "offline" })));
    return () => { cancelled = true; clearInterval(timer); stream.close(); };
  }, [load]);

  return <Panel label="Smart money signals"><PanelHeader><Eyebrow>Smart money</Eyebrow><span className="type-label ml-auto flex items-center gap-1.5 text-text-muted"><Radio size={12} aria-hidden className={state.connection === "live" ? "text-positive" : undefined} />{state.connection}</span><button type="button" aria-label="Refresh smart money signals" onClick={() => void load().then(setState)} className="ml-2 min-h-10 min-w-10 rounded-control p-2 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"><RefreshCw size={14} aria-hidden className={cn(state.loading && "animate-spin")} /></button></PanelHeader><PanelBody>
    {state.error !== null && <div role="alert" className="m-3 rounded-card border border-negative/40 bg-negative-bg p-3"><div className="flex items-center gap-2 text-negative"><AlertTriangle size={14} aria-hidden /><p className="type-label">Tracker unavailable</p></div><p className="type-label mt-1 text-text-muted">{state.error}</p><Button className="mt-2" size="sm" variant="quiet" onClick={() => void load().then(setState)}>Try again</Button></div>}
    {state.signals.some(isSeeded) && (
      <div className="m-3 flex flex-col gap-1 rounded-card border border-accent-quiet bg-surface-raised px-2.5 py-2">
        <p className="type-label flex items-center gap-1.5 text-accent">
          <FlaskConical size={11} strokeWidth={1.5} aria-hidden />
          Showing seeded demo signals
        </p>
        <p className="type-label text-text-muted">
          {state.signals.filter(isSeeded).length} of {state.signals.length} rows were
          inserted to demonstrate this panel. Tracked wallets and marks are real; the
          consensus between them is not. Remove with{" "}
          <code className="text-text-secondary">pnpm tracker:seed-demo --remove</code>.
        </p>
      </div>
    )}
    {state.loading && <div className="space-y-2 p-3" aria-label="Loading smart money signals"><div className="h-24 animate-pulse rounded-card bg-surface-raised" /><div className="h-24 animate-pulse rounded-card bg-surface-raised" /></div>}
    {!state.loading && state.error === null && state.signals.length === 0 && <div className="flex flex-col items-center gap-2 px-5 py-10 text-center"><WalletCards size={24} aria-hidden className="text-text-muted" /><p className="type-body-sm text-text-secondary">No consensus signals yet</p><p className="type-label max-w-prose text-text-muted">The tracker answered, and no market has cleared the wallet, score, diversity and confirmation gates.</p></div>}
    <ul className="list-none">{state.signals.map((signal) => <SmartMoneyCard key={signal.id} signal={signal} now={now} />)}</ul>
    {state.fetchedAt !== null && <p className="type-label px-3 py-2 text-text-muted">Updated {age(state.fetchedAt, now)}{state.disclaimer ? ` · ${state.disclaimer}` : ""}</p>}
  </PanelBody></Panel>;
}
