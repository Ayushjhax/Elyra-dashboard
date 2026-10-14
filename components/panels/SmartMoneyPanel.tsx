"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import { LiveFilings } from "@/components/agent/LiveFilings";
import { CompanyMark } from "@/components/ui/CompanyMark";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";
import { formatRelativeTime } from "@/lib/format";
import { useMinute } from "@/lib/useClock";
import { KIND_LABEL, type SmartMoneyFinding } from "@/lib/smartmoney/types";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   Smart money.

   What SEC filings say that nobody read, surfaced as findings.

   These are NOT trade setups and the panel is built so it cannot be mistaken
   for one. There is no entry, no target, no stop and no win rate anywhere,
   because filings contain no prices and none of those can be computed from
   what is here. The header says so once, in the panel's own voice, rather
   than relying on a disclaimer nobody reads at the bottom of a card.

   What each card does carry is the evidence and a link to the filing it came
   from — the whole point being that the source is one click away rather than
   buried in a document nobody opens.
--------------------------------------------------------------------------- */

interface FeedState {
  findings: SmartMoneyFinding[];
  error: string | null;
  needsMigration: boolean;
  /** The project did not answer at all — see the route's own note. */
  unreachable: boolean;
  rejected: string[];
  lastScanAt: string | null;
  loading: boolean;
}

const INITIAL: FeedState = {
  findings: [],
  error: null,
  needsMigration: false,
  unreachable: false,
  rejected: [],
  lastScanAt: null,
  loading: true,
};

/** Findings arrive from a scheduled scan; polling faster than it runs is noise. */
const REFRESH_MS = 5 * 60_000;

function ScoreBar({ score }: { score: number }) {
  const magnitude = Math.min(100, Math.abs(score));
  const bullish = score >= 0;
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-14 overflow-hidden rounded-pill bg-surface-hover">
        <div
          className={cn("h-full rounded-pill", bullish ? "bg-positive" : "bg-negative")}
          style={{ width: `${magnitude}%` }}
        />
      </div>
      <span
        className={cn(
          "type-data-sm tabular-nums",
          bullish ? "text-positive" : "text-negative",
        )}
      >
        {score > 0 ? "+" : ""}
        {score.toFixed(0)}
      </span>
    </div>
  );
}

function FindingCard({ finding, now }: { finding: SmartMoneyFinding; now: number | null }) {
  const [open, setOpen] = useState(false);
  const risk = finding.kind === "disclosure_risk";

  return (
    <li>
      <article className="flex flex-col gap-2 border-b border-border-subtle px-3 py-3">
        <div className="flex items-center gap-2">
          {/* Ticker-keyed logo. A 404 falls back to the lettered chip, which
              is the same place an unknown symbol lands. */}
          <CompanyMark ticker={finding.ticker} logo={finding.logo} size={24} />
          <span className="type-data truncate text-text-primary">{finding.ticker}</span>
          <span className="type-label min-w-0 flex-1 truncate text-text-muted">
            {finding.company}
          </span>
          <ScoreBar score={finding.score} />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "type-label rounded-chip border px-1.5 py-0.5",
              risk
                ? "border-negative/40 bg-negative-bg text-negative"
                : "border-border-subtle text-text-muted",
            )}
          >
            {KIND_LABEL[finding.kind]}
          </span>
          <span className="type-label text-text-muted">
            evidence knowable {now === null ? "—" : formatRelativeTime(finding.observedAt, now)}
          </span>
          <span className="type-label ml-auto text-text-muted">
            confidence {finding.confidence.toFixed(2)}
          </span>
        </div>

        <p className="type-body-sm text-text-primary">{finding.headline}</p>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "type-label flex w-full items-center justify-between rounded-control px-2 py-1.5",
            "border border-border-subtle text-text-secondary",
            "transition-colors duration-[var(--dur-fast)] ease-brand",
            "hover:bg-surface-hover hover:text-text-primary",
          )}
        >
          Evidence and filings
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            aria-hidden
            className={cn(
              "transition-transform duration-[var(--dur-base)] ease-brand",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <div className="flex flex-col gap-2 px-2">
            <div>
              <Eyebrow className="mb-1">Evidence</Eyebrow>
              <ul className="flex list-none flex-col gap-0.5">
                {finding.edges.map((edge) => (
                  <li key={edge.key} className="flex items-baseline gap-2">
                    <span className="type-label min-w-0 flex-1 truncate text-text-muted">
                      {edge.label}
                      <span className="ml-1 opacity-70">({edge.family})</span>
                    </span>
                    <span className="type-data-sm shrink-0 text-text-secondary">
                      {edge.value === null ? "—" : String(edge.value)}
                    </span>
                    <span
                      className={cn(
                        "type-data-sm w-10 shrink-0 text-right tabular-nums",
                        edge.score >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {edge.score > 0 ? "+" : ""}
                      {edge.score.toFixed(0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <Eyebrow className="mb-1">Filings</Eyebrow>
              <ul className="flex list-none flex-col gap-0.5">
                {finding.filings.map((filing) => (
                  <li key={filing.accession}>
                    <a
                      href={filing.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "type-label flex items-baseline gap-1.5 text-text-muted",
                        "transition-colors duration-[var(--dur-fast)] ease-brand",
                        "hover:text-text-primary",
                      )}
                    >
                      <span className="shrink-0 font-medium">{filing.form}</span>
                      <span className="shrink-0">{filing.filed}</span>
                      {/* An inferred timestamp is a weaker claim about when
                          this became public, and says so rather than being
                          silently equivalent. */}
                      {!filing.availableAtExact && (
                        <span className="shrink-0 opacity-70">(time inferred)</span>
                      )}
                      <span className="min-w-0 flex-1 truncate opacity-70">
                        {filing.accession}
                      </span>
                      <ExternalLink size={11} strokeWidth={1.5} aria-hidden className="shrink-0" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <p className="type-label text-text-muted">{finding.disclaimer}</p>
          </div>
        )}
      </article>
    </li>
  );
}

export function SmartMoneyPanel({
  bare = false,
  findingsOnly = false,
}: {
  bare?: boolean;
  /** Render only when the scan has findings — for a view that already shows
      the live filings itself, where this panel's fallback would repeat them. */
  findingsOnly?: boolean;
}) {
  const [state, setState] = useState<FeedState>(INITIAL);
  const now = useMinute();

  /* Pure fetch, no setState of its own: a setState call reachable before
     the effect's first await trips react-hooks/set-state-in-effect
     regardless of which function it is textually written in, so every
     setState here lives behind a real .then() boundary instead. */
  const load = useCallback(async (): Promise<FeedState> => {
    try {
      const response = await fetch("/api/smart-money?limit=50", { cache: "no-store" });
      const payload = (await response.json()) as Omit<FeedState, "loading">;
      return { ...payload, loading: false };
    } catch (error: unknown) {
      return {
        findings: [], error: error instanceof Error ? error.message : "request failed",
        needsMigration: false, unreachable: false, rejected: [], lastScanAt: null,
        loading: false,
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

  const findingsUnavailable =
    state.unreachable || state.needsMigration || state.error !== null;
  /* No findings to show — unavailable, or the scan has written none yet — so
     the filings themselves stand in. */
  const showLive = !state.loading && (findingsUnavailable || state.findings.length === 0);

  /* `bare` drops the panel's own frame, for when it is one view inside the
     agent panel and a second border would sit inside the first. */
  const Frame = bare ? BareFrame : Panel;

  if (findingsOnly && state.findings.length === 0) return null;

  return (
    <Frame label="Smart money">
      <PanelHeader>
        <Eyebrow>Filings</Eyebrow>
        <span className="type-label ml-auto text-text-muted">
          {/* "0 findings" is a statement about the filings. It must not be
              shown when no filing was ever consulted — so while the scan's
              store is down this names what IS shown instead. */}
          {showLive ? "Live from EDGAR" : `${state.findings.length} findings`}
        </span>
        <button
          type="button"
          onClick={() => void load().then(setState)}
          aria-label="Refresh findings"
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
        {/* Said once, in the panel's own voice, rather than only in a
            disclaimer at the bottom of each card. */}
        <p className="type-label border-b border-border-subtle px-3 py-2 text-text-muted">
          Findings from SEC filings — what the documents say. No entry, target
          or stop: filings contain no prices, so those cannot be computed here.
        </p>

        {/* When the scan's findings cannot be shown, say why in a line and
            show the filings themselves instead — live from EDGAR, which needs
            no database. The technical reason is one click away. */}
        {findingsUnavailable && (
          <details className="mx-4 mt-3 rounded-control border border-border-subtle bg-surface-raised px-3 py-2">
            <summary className="type-label cursor-pointer text-text-secondary">
              {state.needsMigration
                ? "Findings need a database table that has not been created."
                : "Findings need the database, which can't be reached — showing live filings instead."}
            </summary>
            <p className="type-label mt-1.5 break-words text-text-muted">
              {state.needsMigration ? (
                <>
                  Run <code>elyra-signals/migrations/0002_smart_money.sql</code> in the
                  Supabase SQL editor, then run the scan.
                </>
              ) : (
                state.error
              )}
            </p>
          </details>
        )}

        {state.rejected.length > 0 && (
          <div className="mx-3 mt-3 rounded-card border border-negative/40 bg-negative-bg px-2.5 py-2">
            <p className="type-label text-negative">
              {state.rejected.length} finding
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

        {showLive && <LiveFilings />}

        <ul className="list-none">
          {state.findings.map((finding) => (
            <FindingCard key={finding.id} finding={finding} now={now} />
          ))}
        </ul>

        {state.lastScanAt !== null && (
          <p className="type-label px-3 py-2 text-text-muted">
            Last scan {now === null ? "—" : formatRelativeTime(state.lastScanAt, now)}
          </p>
        )}
      </PanelBody>
    </Frame>
  );
}

function BareFrame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="region" aria-label={label} className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}
