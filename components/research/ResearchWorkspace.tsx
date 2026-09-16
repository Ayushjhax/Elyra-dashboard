"use client";

import { useCallback, useEffect, useState } from "react";
import { FileSearch, Loader2 } from "lucide-react";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Button } from "@/components/ui/Button";
import { BacktestsTab } from "@/components/research/BacktestsTab";
import { PredictionMarketsTab } from "@/components/research/PredictionMarketsTab";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Research workspace.

   Five tabs over the same backend the Telegram commands read, so a figure
   here and a figure in a chat cannot disagree.

   ── Every panel has three states, not two ──────────────────────────────

   Loading, content, and UNAVAILABLE-WITH-A-REASON. The third is the one that
   matters: unlocks have no provider configured and equities have no price
   feed, and a panel that renders empty for those reads as "nothing is
   happening" rather than "this is not connected". Each one says which.
--------------------------------------------------------------------------- */

type Tab =
  | "reports"
  | "backtests"
  | "prediction"
  | "recap"
  | "signals"
  | "yield"
  | "unlocks";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "reports", label: "Reports" },
  { id: "backtests", label: "Backtests" },
  { id: "prediction", label: "Prediction Markets" },
  { id: "recap", label: "Market Recap" },
  { id: "signals", label: "Signals" },
  { id: "yield", label: "Yield" },
  { id: "unlocks", label: "Unlocks" },
];

const SUGGESTIONS = [
  "NVDA latest earnings",
  "Generate NVDA 10-Q",
  "MSFT 10-K",
];

const money = (value: unknown, digits = 2): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
};

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
      {children}
    </div>
  );
}

/** A stated absence. Visually distinct from an empty list. */
function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-base p-4">
      <p className="type-body-sm text-text-secondary">{reason}</p>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 py-6 text-text-muted">
      <Loader2 size={14} className="animate-spin" aria-hidden />
      <span className="type-label">{label}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Reports
--------------------------------------------------------------------------- */

interface ReportRow {
  id: string;
  query: string;
  subjectName: string | null;
  periodLabel: string | null;
  status: string;
  statusDetail: string | null;
  quality: string | null;
  hasPdf: boolean;
  error: string | null;
  createdAt: string;
}

const QUALITY_LABEL: Record<string, string> = {
  verified: "Verified",
  verified_with_warnings: "Verified with warnings",
  incomplete: "Incomplete",
};

function ReportsTab() {
  const authedFetch = useAuthedFetch();
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authedFetch("/api/research/reports");
      if (!response.ok) return;
      const body = (await response.json()) as { reports: ReportRow[] };
      setReports(body.reports);
    } catch {
      /* Leave the previous list rather than blanking it on one failed poll. */
    }
  }, [authedFetch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch("/api/research/reports");
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { reports: ReportRow[] };
        if (!cancelled) setReports(body.reports);
      } catch {
        if (!cancelled) setReports([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  /* A running report finishes in seconds. Polled only while one is actually
     running, so an idle tab makes no requests. */
  const running = (reports ?? []).some(
    (report) => report.status !== "complete" && report.status !== "failed",
  );

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), 2500);
    return () => clearInterval(timer);
  }, [running, load]);

  const submit = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (value.length === 0) return;
      setBusy(true);
      setError(null);
      try {
        const response = await authedFetch("/api/research/reports", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: value }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setError(body.error ?? "Could not start that report.");
          return;
        }
        setQuery("");
        await load();
      } catch {
        setError("Could not start that report.");
      } finally {
        setBusy(false);
      }
    },
    [authedFetch, load],
  );

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <p className="type-label mb-2 text-text-muted">New report</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit(query);
            }}
            placeholder="Ask Elyra to research anything…"
            className={cn(
              "type-body-sm min-w-0 flex-1 rounded-control border border-border-subtle",
              "bg-surface-base px-3 py-2 text-text-primary",
              "placeholder:text-text-muted focus:border-border-strong focus:outline-none",
            )}
          />
          <Button variant="accent" size="sm" onClick={() => void submit(query)} disabled={busy}>
            {busy ? "Starting…" : "Research"}
          </Button>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => void submit(suggestion)}
              disabled={busy}
              className={cn(
                "type-label rounded-control border border-border-subtle px-2 py-1",
                "text-text-secondary transition-colors hover:bg-surface-hover",
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>

        {error !== null && <p className="type-label mt-2 text-negative">{error}</p>}
        <p className="type-label mt-2 text-text-muted">
          Built from SEC filings and XBRL company facts. Public companies only.
        </p>
      </Panel>

      {reports === null ? (
        <Spinner label="Loading reports…" />
      ) : reports.length === 0 ? (
        <Unavailable reason="No reports yet. Ask for a company's latest earnings to generate one." />
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((report) => (
            <Panel key={report.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="type-body-sm text-text-primary">
                    {report.subjectName ?? report.query}
                    {report.periodLabel === null ? "" : ` · ${report.periodLabel}`}
                  </p>
                  <p className="type-label text-text-muted">
                    {report.status === "complete"
                      ? (QUALITY_LABEL[report.quality ?? ""] ?? "Complete")
                      : report.status === "failed"
                        ? (report.error ?? "Failed")
                        : (report.statusDetail ?? report.status)}
                  </p>
                </div>

                {report.status === "complete" && report.hasPdf && (
                  <a
                    href={`/api/research/reports/${report.id}/download`}
                    className={cn(
                      "type-label shrink-0 rounded-control border border-border-strong",
                      "bg-surface-raised px-3 py-1.5 text-text-primary hover:bg-surface-hover",
                    )}
                  >
                    Download PDF
                  </a>
                )}
                {report.status !== "complete" && report.status !== "failed" && (
                  <Loader2 size={14} className="mt-1 shrink-0 animate-spin text-text-muted" aria-hidden />
                )}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Recap
--------------------------------------------------------------------------- */

interface RecapSection {
  title: string;
  lines: string[];
  unavailable: string | null;
}

function RecapTab() {
  const authedFetch = useAuthedFetch();
  const [scope, setScope] = useState<"crypto" | "equities">("crypto");
  /* Keyed by the scope it belongs to, so "loading" is DERIVED rather than
     set at the top of the effect — a synchronous setState there is a
     cascading render, and the lint rule forbidding it is right. */
  const [loaded, setLoaded] = useState<{ scope: string; sections: RecapSection[] } | null>(
    null,
  );
  const sections = loaded !== null && loaded.scope === scope ? loaded.sections : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch(`/api/research/recap?scope=${scope}`);
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { sections: RecapSection[] };
        if (!cancelled) setLoaded({ scope, sections: body.sections });
      } catch {
        if (!cancelled) setLoaded({ scope, sections: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, scope]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        {(["crypto", "equities"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setScope(option)}
            className={cn(
              "type-label rounded-control border px-3 py-1.5 capitalize transition-colors",
              scope === option
                ? "border-transparent bg-accent text-surface-base"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {sections === null ? (
        <Spinner label="Reading markets…" />
      ) : (
        sections.map((section) => (
          <Panel key={section.title}>
            <p className="type-label mb-2 text-text-muted">{section.title}</p>
            {section.unavailable !== null ? (
              <p className="type-body-sm text-text-secondary">{section.unavailable}</p>
            ) : (
              <ul className="flex list-none flex-col gap-1">
                {section.lines.map((line) => (
                  <li key={line} className="type-body-sm text-text-primary">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Signals
--------------------------------------------------------------------------- */

interface Signal {
  symbol: string;
  type: string;
  direction: string;
  strength: string;
  title: string;
  summary: string;
  evidence: Array<{ label: string; value: string; source: string }>;
  confirmationCount: number;
  contradictions: string[];
  dataFreshness: string;
}

function SignalsTab() {
  const authedFetch = useAuthedFetch();
  const [symbol, setSymbol] = useState("SOL");
  const [loaded, setLoaded] = useState<{ symbol: string; signals: Signal[] } | null>(null);
  const signals = loaded !== null && loaded.symbol === symbol ? loaded.signals : null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch(`/api/research/signals?symbol=${symbol}`);
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { signals: Signal[] };
        if (!cancelled) setLoaded({ symbol, signals: body.signals });
      } catch {
        if (!cancelled) setLoaded({ symbol, signals: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, symbol]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {["SOL", "BTC", "ETH"].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSymbol(option)}
            className={cn(
              "type-label rounded-control border px-3 py-1.5 transition-colors",
              symbol === option
                ? "border-transparent bg-accent text-surface-base"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover",
            )}
          >
            {option}
          </button>
        ))}
      </div>

      {signals === null ? (
        <Spinner label="Reading venues…" />
      ) : signals.length === 0 ? (
        <Unavailable reason={`Nothing notable on ${symbol} right now. No move, funding level or venue divergence crossed a threshold — a quiet market is a real answer.`} />
      ) : (
        signals.map((signal) => (
          <Panel key={`${signal.type}-${signal.title}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="type-body-sm text-text-primary">{signal.title}</p>
              <span className="type-label shrink-0 text-text-muted">
                {signal.strength} · {signal.confirmationCount} venue
                {signal.confirmationCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="type-label mt-1 text-text-secondary">{signal.summary}</p>

            <div className="mt-2 flex flex-col gap-0.5">
              {signal.evidence.map((item) => (
                <div
                  key={`${item.source}-${item.label}`}
                  className="flex justify-between gap-3"
                >
                  <span className="type-label text-text-muted">
                    {item.label} · {item.source}
                  </span>
                  <span className="type-data-sm text-text-primary">{item.value}</span>
                </div>
              ))}
            </div>

            {/* Contradictions are shown, never suppressed. */}
            {signal.contradictions.map((contradiction) => (
              <p key={contradiction} className="type-label mt-2 text-negative">
                {contradiction}
              </p>
            ))}
          </Panel>
        ))
      )}

      <p className="type-label text-text-muted">
        Observations, not recommendations. Strength reflects how much
        independent data agrees, not a prediction.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Yield
--------------------------------------------------------------------------- */

interface YieldRow {
  id: string;
  name: string;
  asset: string;
  apyPct: number | null;
  apy30dPct: number | null;
  tvlUsd: number | null;
  flags: string[];
}

function YieldTab() {
  const authedFetch = useAuthedFetch();
  const [stables, setStables] = useState(false);
  const [loaded, setLoaded] = useState<{
    stables: boolean;
    rows: YieldRow[];
    ranking: string;
  } | null>(null);

  const rows = loaded !== null && loaded.stables === stables ? loaded.rows : null;
  const ranking = loaded?.ranking ?? "";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch(
          `/api/research/yield${stables ? "?stables=true" : ""}`,
        );
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          opportunities: YieldRow[];
          ranking: string;
        };
        if (!cancelled) {
          setLoaded({ stables, rows: body.opportunities, ranking: body.ranking });
        }
      } catch {
        if (!cancelled) setLoaded({ stables, rows: [], ranking: "" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch, stables]);

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setStables((value) => !value)}
        className={cn(
          "type-label self-start rounded-control border px-3 py-1.5 transition-colors",
          stables
            ? "border-transparent bg-accent text-surface-base"
            : "border-border-subtle text-text-secondary hover:bg-surface-hover",
        )}
      >
        Stablecoins only
      </button>

      {rows === null ? (
        <Spinner label="Reading Kamino…" />
      ) : rows.length === 0 ? (
        <Unavailable reason="No vaults matched." />
      ) : (
        rows.map((row) => (
          <Panel key={row.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="type-body-sm text-text-primary">{row.name}</p>
                <p className="type-label text-text-muted">
                  {row.asset} · {money(row.tvlUsd, 0)} deposited
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="type-data-sm text-accent">
                  {row.apyPct?.toFixed(2) ?? "—"}%
                </p>
                <p className="type-label text-text-muted">
                  {row.apy30dPct?.toFixed(2) ?? "—"}% 30d
                </p>
              </div>
            </div>
            {row.flags.map((flag) => (
              <p key={flag} className="type-label mt-1 text-text-secondary">
                {flag}
              </p>
            ))}
          </Panel>
        ))
      )}

      {ranking.length > 0 && <p className="type-label text-text-muted">{ranking}</p>}
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Unlocks
--------------------------------------------------------------------------- */

function UnlocksTab() {
  const authedFetch = useAuthedFetch();
  const [state, setState] = useState<{ configured: boolean; reason?: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch("/api/research/unlocks?hours=168");
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as { configured: boolean; reason?: string };
        if (!cancelled) setState(body);
      } catch {
        if (!cancelled) setState({ configured: false, reason: "Could not load." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  if (state === null) return <Spinner label="Checking unlock data…" />;

  if (!state.configured) {
    return <Unavailable reason={state.reason ?? "Token unlock data is not configured."} />;
  }

  return <Unavailable reason="No unlocks scheduled in the next seven days." />;
}

/* ---------------------------------------------------------------------------
   Shell
--------------------------------------------------------------------------- */

export function ResearchWorkspace() {
  const auth = useElyraAuth();
  const [tab, setTab] = useState<Tab>("reports");

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <FileSearch size={16} strokeWidth={1.5} aria-hidden className="text-text-muted" />
          <h1 className="type-label text-text-secondary">RESEARCH</h1>
        </div>
        <p className="type-body-sm text-text-muted">
          Filings, markets, signals, yields and event intelligence.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "type-label rounded-control border px-3 py-1.5 transition-colors",
              tab === item.id
                ? "border-transparent bg-accent text-surface-base"
                : "border-border-subtle text-text-secondary hover:bg-surface-hover",
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {!auth.authenticated ? (
        <Unavailable reason="Sign in to run research and see your reports." />
      ) : (
        <div className="min-h-0">
          {tab === "reports" && <ReportsTab />}
          {tab === "backtests" && <BacktestsTab />}
          {tab === "prediction" && <PredictionMarketsTab />}
          {tab === "recap" && <RecapTab />}
          {tab === "signals" && <SignalsTab />}
          {tab === "yield" && <YieldTab />}
          {tab === "unlocks" && <UnlocksTab />}
        </div>
      )}
    </div>
  );
}
