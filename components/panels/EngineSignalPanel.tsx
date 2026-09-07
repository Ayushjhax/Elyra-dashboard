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
import type { EngineDiagnostics } from "@/app/api/signals/route";
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
  /** The engine's account of its last build cycle. Null when unavailable. */
  diagnostics: EngineDiagnostics | null;
  loading: boolean;
  fetchedAt: string | null;
}

const INITIAL: FeedState = {
  signals: [],
  disclaimer: "",
  engineError: null,
  rejected: [],
  diagnostics: null,
  loading: true,
  fetchedAt: null,
};

/** Reasons listed in the empty state before the rest are counted. */
const REASONS_SHOWN = 6;

/**
 * What a rejection stage means, in the reader's terms.
 *
 * The engine's stage names are precise and internal; a trader looking at an
 * empty feed needs to know whether the market was quiet or the service was
 * broken, and those are different stages.
 */
const STAGE_LABEL: Record<string, string> = {
  source: "upstream data unavailable",
  scan: "no setup in the live window",
  levels: "no target far enough away to clear the risk floor",
  firing: "failed a firing gate",
  leg: "a pipeline leg failed",
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
        diagnostics: EngineDiagnostics | null;
      };
      return {
        signals: payload.signals,
        disclaimer: payload.disclaimer,
        engineError: payload.engineError,
        rejected: payload.rejected,
        diagnostics: payload.diagnostics,
        loading: false,
        fetchedAt: new Date().toISOString(),
      };
    } catch (error: unknown) {
      return {
        signals: [],
        disclaimer: "",
        engineError: error instanceof Error ? error.message : "request failed",
        rejected: [],
        diagnostics: null,
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

            {/* The engine's own reasons, not a guess made here. An earlier
                version of this panel asserted the cause was too few
                backtested fires, which stopped being true the moment the
                pipeline started measuring live history — a hardcoded
                explanation of someone else's behaviour goes stale silently. */}
            {state.diagnostics === null ? (
              <p className="type-label mt-1 text-text-muted">
                The engine answered and had nothing to publish. It serves no
                per-cycle diagnostics, so the reason each candidate was
                rejected is not available here. An empty feed is a result, not
                a fault.
              </p>
            ) : !state.diagnostics.ran ? (
              <p className="type-label mt-1 text-text-muted">
                The engine is up but has not finished its first build cycle.
                The first one is slow: it fetches years of candles per market
                and a full XBRL history per issuer before it measures anything.
              </p>
            ) : (
              <>
                <p className="type-label mt-1 text-text-muted">
                  The engine ran{" "}
                  {state.diagnostics.startedAt !== null
                    ? formatRelativeTime(state.diagnostics.startedAt)
                    : "recently"}{" "}
                  and rejected every candidate. An empty feed is a result, not a
                  fault — these are the gates that stopped them.
                </p>

                <ul className="mt-2 flex list-none flex-col gap-1">
                  {Object.entries(state.diagnostics.byStage)
                    .sort((a, b) => b[1] - a[1])
                    .map(([stage, count]) => (
                      <li key={stage} className="flex items-baseline gap-2">
                        <span className="type-data-sm shrink-0 tabular-nums text-text-secondary">
                          {count}
                        </span>
                        <span className="type-label min-w-0 flex-1 text-text-muted">
                          {STAGE_LABEL[stage] ?? stage}
                        </span>
                      </li>
                    ))}
                </ul>

                <ul className="mt-2 flex list-none flex-col gap-1 border-t border-border-subtle pt-2">
                  {state.diagnostics.rejections
                    .slice(0, REASONS_SHOWN)
                    .map((rejection) => (
                      <li
                        key={`${rejection.id}:${rejection.stage}`}
                        className="type-label break-words text-text-muted"
                      >
                        <span className="text-text-secondary">
                          {rejection.id.split(":").slice(0, 2).join(" ")}
                        </span>{" "}
                        — {rejection.detail}
                      </li>
                    ))}
                </ul>

                {state.diagnostics.rejections.length > REASONS_SHOWN && (
                  <p className="type-label mt-1 text-text-muted">
                    and {state.diagnostics.rejections.length - REASONS_SHOWN}{" "}
                    more
                  </p>
                )}

                {state.diagnostics.legs.some((leg) => leg.failed) && (
                  <p className="type-label mt-2 text-negative">
                    {state.diagnostics.legs
                      .filter((leg) => leg.failed)
                      .map((leg) => leg.name)
                      .join(", ")}{" "}
                    failed outright — this is a fault, not a quiet market.
                  </p>
                )}
              </>
            )}
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
