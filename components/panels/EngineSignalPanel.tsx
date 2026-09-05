"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { EngineSignalCard } from "@/components/panels/EngineSignalCard";
import { formatRelativeTime } from "@/lib/format";
import { isClosed, type SignalDto } from "@/lib/signals/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The signal feed.

   The important behaviour here is what happens when there is nothing to show,
   because with one measured rule at eight fires that is the normal case.

   An empty feed is a result, not a failure, and the panel says which kind of
   empty it is: the engine answered and had nothing (every candidate was
   rejected by a gate), or the engine could not be reached. Those are
   different facts and collapsing them into one "No signals" would hide a
   dead service behind a plausible-looking quiet market.

   It never falls back to mock data. A card that cannot be traced to the
   engine that produced it is the thing this pipeline exists to prevent.
--------------------------------------------------------------------------- */

interface FeedState {
  signals: SignalDto[];
  disclaimer: string;
  engineError: string | null;
  rejected: string[];
  loading: boolean;
  fetchedAt: string | null;
}

const INITIAL: FeedState = {
  signals: [],
  disclaimer: "",
  engineError: null,
  rejected: [],
  loading: true,
  fetchedAt: null,
};

const REFRESH_MS = 60_000;

export function EngineSignalPanel() {
  const [state, setState] = useState<FeedState>(INITIAL);
  const [openSignal, setOpenSignal] = useState<SignalDto | null>(null);

  /*
   * Pure fetch, no setState of its own — see ConnectionsPanel.tsx for the
   * same shape. A version of this that called setState as its first
   * statement, before any await, made the effect below trip
   * react-hooks/set-state-in-effect: the compiler traces synchronously
   * through a function called directly from an effect body, and a setState
   * call reachable before the first await counts as happening "in" the
   * effect regardless of which function it is textually written in. Moving
   * every setState call into a .then() — a genuine asynchronous boundary —
   * is what actually satisfies the rule, not where the code is indented.
   */
  const load = useCallback(async (): Promise<FeedState> => {
    try {
      const response = await fetch("/api/signals", { cache: "no-store" });
      const payload = (await response.json()) as {
        signals: SignalDto[];
        disclaimer: string;
        engineError: string | null;
        rejected: string[];
      };
      return {
        signals: payload.signals,
        disclaimer: payload.disclaimer,
        engineError: payload.engineError,
        rejected: payload.rejected,
        loading: false,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      return {
        signals: [],
        disclaimer: "",
        engineError: error instanceof Error ? error.message : "request failed",
        rejected: [],
        loading: false,
        fetchedAt: new Date().toISOString(),
      };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void load().then((next) => {
        if (!cancelled) setState(next);
      });
    };
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load]);

  /* Open signals first; closed ones stay below as a record. */
  const ordered = [...state.signals].sort((a, b) => {
    const aClosed = isClosed(a.status);
    const bClosed = isClosed(b.status);
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });

  const open = state.signals.filter((s) => !isClosed(s.status)).length;

  return (
    <Panel label="Signal suggestion">
      <PanelHeader>
        <Eyebrow>Signals</Eyebrow>
        <span className="type-label ml-auto text-text-muted">
          {open} open · {state.signals.length}
        </span>
        <button
          type="button"
          onClick={() => void load().then(setState)}
          aria-label="Refresh signals"
          className={cn(
            "ml-2 rounded-control p-1 text-text-muted",
            "transition-colors duration-[var(--dur-fast)] ease-brand hover:text-text-primary",
          )}
        >
          <RefreshCw
            size={13}
            strokeWidth={1.5}
            aria-hidden
            className={cn(state.loading && "animate-spin")}
          />
        </button>
      </PanelHeader>

      <PanelBody>
        {state.engineError !== null && (
          <div
            role="alert"
            className="m-3 flex items-start gap-2 rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2"
          >
            <AlertTriangle
              size={14}
              strokeWidth={1.5}
              aria-hidden
              className="mt-0.5 shrink-0 text-negative"
            />
            <div className="min-w-0">
              <p className="type-label text-negative">Engine unreachable</p>
              <p className="type-label mt-0.5 break-words text-text-muted">
                {state.engineError}
              </p>
              <p className="type-label mt-1 text-text-muted">
                No signals are shown. This panel does not substitute placeholder
                data when the engine is down.
              </p>
            </div>
          </div>
        )}

        {state.rejected.length > 0 && (
          <div className="mx-3 mt-3 rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2">
            <p className="type-label text-negative">
              {state.rejected.length} signal
              {state.rejected.length === 1 ? "" : "s"} dropped at the boundary
            </p>
            <ul className="mt-0.5 list-none">
              {state.rejected.map((reason) => (
                <li key={reason} className="type-label text-text-muted">
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!state.loading && state.engineError === null && ordered.length === 0 && (
          <div className="px-3 py-6">
            <p className="type-body-sm text-text-secondary">
              No signals right now.
            </p>
            <p className="type-label mt-1 text-text-muted">
              The engine answered and had nothing to publish. Every candidate
              was rejected by a gate — most often too few backtested fires to
              clear the twenty-fire floor. An empty feed is a result, not a
              fault.
            </p>
          </div>
        )}

        <ul className="list-none">
          {ordered.map((signal) => (
            <EngineSignalCard
              key={signal.id}
              signal={signal}
              onViewSetup={setOpenSignal}
            />
          ))}
        </ul>

        {state.fetchedAt !== null && (
          <p className="type-label px-3 py-2 text-text-muted">
            Updated {formatRelativeTime(state.fetchedAt)}
          </p>
        )}
      </PanelBody>

      <Dialog
        open={openSignal !== null}
        onOpenChange={(isOpen) => !isOpen && setOpenSignal(null)}
      >
        <DialogContent aria-describedby="signal-setup-help">
          <DialogHeader>
            <DialogTitle>{openSignal?.thesis ?? ""}</DialogTitle>
            <DialogDescription id="signal-setup-help">
              {openSignal
                ? `${openSignal.backtest.ruleId} · ${openSignal.symbol} · raised ${formatRelativeTime(openSignal.createdAt)}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {openSignal && (
              <div className="flex flex-col gap-4 px-4 py-4">
                <section>
                  <Eyebrow className="mb-1">Invalidation</Eyebrow>
                  <p className="type-body-sm text-text-secondary">
                    {openSignal.levels.invalidation}
                  </p>
                  <p className="type-label mt-1 text-text-muted">
                    Expires {formatRelativeTime(openSignal.expiresAt)} · chase
                    limit {openSignal.levels.maxChasePct}% past entry
                  </p>
                </section>

                <section>
                  <Eyebrow className="mb-1">Evidence</Eyebrow>
                  <ul className="flex list-none flex-col gap-1">
                    {openSignal.edges.map((edge) => (
                      <li key={edge.key} className="flex items-baseline gap-2">
                        <span className="type-label min-w-0 flex-1 truncate text-text-muted">
                          {edge.label}
                          <span className="ml-1 opacity-70">({edge.family})</span>
                        </span>
                        <span
                          className={cn(
                            "type-data-sm shrink-0",
                            edge.score > 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {edge.score > 0 ? "+" : ""}
                          {edge.score.toFixed(0)}
                        </span>
                        <span className="type-label shrink-0 text-text-muted">
                          conf {edge.confidence.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section>
                  <Eyebrow className="mb-1">Statistics</Eyebrow>
                  <dl className="flex flex-col gap-1">
                    {[
                      ["Origin", openSignal.backtest.statisticsAreMeasured ? "measured" : "FIXTURE — not a measurement"],
                      ["Win rate", openSignal.backtest.winRateText],
                      ["Expectancy", `${openSignal.backtest.expectancyR >= 0 ? "+" : ""}${openSignal.backtest.expectancyR.toFixed(4)}R`],
                      ["Out of sample", `${openSignal.backtest.oosFires} fires`],
                      ["Deflated Sharpe", openSignal.backtest.deflatedSharpe?.toFixed(4) ?? "—"],
                      ["Trials", String(openSignal.backtest.trials)],
                      ["Tie-broken fires", String(openSignal.backtest.ambiguousFires)],
                      ["Universe coverage", openSignal.backtest.survivorshipCoverage === null ? "—" : `${(openSignal.backtest.survivorshipCoverage * 100).toFixed(0)}%`],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-baseline gap-2">
                        <dt className="type-label min-w-0 flex-1 text-text-muted">
                          {label}
                        </dt>
                        <dd
                          className={cn(
                            "type-data-sm shrink-0 text-text-secondary",
                            label === "Origin" &&
                              !openSignal.backtest.statisticsAreMeasured &&
                              "text-negative",
                          )}
                        >
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>

                <p className="type-label text-text-muted">
                  {openSignal.disclaimer}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="quiet" onClick={() => setOpenSignal(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
