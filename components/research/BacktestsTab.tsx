"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";

/* ---------------------------------------------------------------------------
   The Backtest lab.

   ── Assumptions are shown with every result, not behind a toggle ───────

   A return figure alone is not a result. The fee, the slippage, the execution
   timing and the period are what make it interpretable, and a UI that tucks
   them away produces screenshots that circulate without them.

   ── Parameter controls are generated ───────────────────────────────────

   Each strategy carries its own parameter metadata, so the form is rendered
   from the registry rather than hand-written twenty-one times. Adding a
   strategy adds its controls automatically.
--------------------------------------------------------------------------- */

interface StrategyParameter {
  key: string;
  label: string;
  default: number;
  min?: number;
  max?: number;
  step?: number;
  description: string;
}

interface Strategy {
  id: string;
  name: string;
  category: string;
  rules: { entry: string; exit: string };
  parameters: StrategyParameter[];
  requiresVolume: boolean;
  intradayOnly: boolean;
}

interface Category {
  id: string;
  label: string;
}

interface Metrics {
  totalReturnPct: number;
  benchmarkReturnPct: number | null;
  maxDrawdownPct: number;
  sharpe: number | null;
  sortino: number | null;
  cagrPct: number | null;
  trades: number;
  winRatePct: number | null;
  profitFactor: number | null;
  exposurePct: number;
  totalFees: number;
  notes: string[];
}

interface RunResult {
  id: string | null;
  strategy: { name: string; rules: { entry: string; exit: string } };
  config: {
    instrumentId: string;
    timeframe: string;
    startAt: string;
    endAt: string;
    initialCapitalUsd: number;
    params: Record<string, number>;
    execution: { feeBps: number; slippageBps: number };
  };
  metrics: Metrics;
  quality: { level: string; issues: string[] };
  robustness: { findings: string[] } | null;
  warnings: string[];
  barsLoaded: number;
  coverage: number;
  trades: Array<{
    entryTime: number;
    exitTime: number | null;
    entryPrice: number;
    exitPrice: number | null;
    netPnl: number;
    returnPct: number;
    barsHeld: number;
    entryReason: string;
    exitReason: string;
  }>;
}

const TIMEFRAMES = ["15m", "1h", "4h", "1d"];
const PERIODS = [
  { label: "3M", days: 90 },
  { label: "6M", days: 182 },
  { label: "1Y", days: 365 },
];
const SYMBOLS = ["SOL", "BTC", "ETH"];

const pct = (value: number | null | undefined, digits = 1): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—";

const num = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface-raised p-4">
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "type-label rounded-control border px-2.5 py-1 transition-colors",
        active
          ? "border-transparent bg-accent text-surface-base"
          : "border-border-subtle text-text-secondary hover:bg-surface-hover",
      )}
    >
      {children}
    </button>
  );
}

/** Equity curve, drawn from the result rather than a chart library. */
function EquitySpark({ equity }: { equity: Array<{ equity: number }> }) {
  if (equity.length < 2) return null;

  /* Downsampled to roughly the pixel width — plotting 8,700 points into a
     600px box draws the same line far more slowly. */
  const step = Math.max(1, Math.floor(equity.length / 240));
  const points = equity.filter((_, i) => i % step === 0).map((p) => p.equity);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;

  const path = points
    .map((value, i) => {
      const x = (i / (points.length - 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const up = points[points.length - 1] >= points[0];

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-24 w-full"
      aria-label="Equity curve"
    >
      <path
        d={path}
        fill="none"
        stroke={up ? "var(--accent)" : "var(--negative)"}
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function BacktestsTab() {
  const authedFetch = useAuthedFetch();

  const [catalogue, setCatalogue] = useState<{
    strategies: Strategy[];
    categories: Category[];
  } | null>(null);

  const [symbol, setSymbol] = useState("SOL");
  const [timeframe, setTimeframe] = useState("1h");
  const [days, setDays] = useState(365);
  const [strategyId, setStrategyId] = useState("RSI_12_MEAN_REVERSION_V1");
  const [params, setParams] = useState<Record<string, number>>({});
  const [feeBps, setFeeBps] = useState(10);
  const [slippageBps, setSlippageBps] = useState(10);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "trades" | "strategy">("overview");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await authedFetch("/api/backtest/strategies");
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          strategies: Strategy[];
          categories: Category[];
        };
        if (!cancelled) setCatalogue(body);
      } catch {
        if (!cancelled) setCatalogue({ strategies: [], categories: [] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authedFetch]);

  const strategy = catalogue?.strategies.find((s) => s.id === strategyId) ?? null;

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const response = await authedFetch("/api/backtest/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategy: strategyId,
          symbol,
          timeframe,
          days,
          feeBps,
          slippageBps,
          params,
          robustness: true,
        }),
      });
      const body = (await response.json()) as RunResult & { error?: string };
      if (!response.ok) {
        setError(body.error ?? "The backtest failed.");
        setResult(null);
        return;
      }
      setResult(body);
      setTab("overview");
    } catch {
      setError("The backtest could not be run.");
    } finally {
      setRunning(false);
    }
  }, [authedFetch, strategyId, symbol, timeframe, days, feeBps, slippageBps, params]);

  if (catalogue === null) {
    return (
      <div className="flex items-center gap-2 py-6 text-text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        <span className="type-label">Loading strategies…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <p className="type-label mb-2 text-text-muted">Strategy builder</p>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-label w-16 text-text-muted">Asset</span>
            {SYMBOLS.map((option) => (
              <Chip key={option} active={symbol === option} onClick={() => setSymbol(option)}>
                {option}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-label w-16 text-text-muted">Timeframe</span>
            {TIMEFRAMES.map((option) => (
              <Chip
                key={option}
                active={timeframe === option}
                onClick={() => setTimeframe(option)}
              >
                {option}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="type-label w-16 text-text-muted">Period</span>
            {PERIODS.map((option) => (
              <Chip
                key={option.label}
                active={days === option.days}
                onClick={() => setDays(option.days)}
              >
                {option.label}
              </Chip>
            ))}
          </div>

          <div>
            <span className="type-label text-text-muted">Strategy</span>
            <select
              value={strategyId}
              onChange={(event) => {
                setStrategyId(event.target.value);
                /* Cleared so the new strategy starts at its own defaults
                   rather than inheriting a period that means something
                   different. */
                setParams({});
              }}
              className={cn(
                "type-body-sm mt-1 w-full rounded-control border border-border-subtle",
                "bg-surface-base px-2.5 py-2 text-text-primary focus:outline-none",
              )}
            >
              {catalogue.categories.map((category) => (
                <optgroup key={category.id} label={category.label}>
                  {catalogue.strategies
                    .filter((s) => s.category === category.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Rendered from the registry, not hand-coded per strategy. */}
          {strategy !== null && strategy.parameters.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {strategy.parameters.map((parameter) => (
                <label key={parameter.key} className="flex flex-col gap-1">
                  <span className="type-label text-text-muted">{parameter.label}</span>
                  <input
                    type="number"
                    value={params[parameter.key] ?? parameter.default}
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step ?? 1}
                    onChange={(event) =>
                      setParams((current) => ({
                        ...current,
                        [parameter.key]: Number(event.target.value),
                      }))
                    }
                    className={cn(
                      "type-data-sm w-24 rounded-control border border-border-subtle",
                      "bg-surface-base px-2 py-1.5 text-text-primary focus:outline-none",
                    )}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1">
              <span className="type-label text-text-muted">Fee (bps)</span>
              <input
                type="number"
                value={feeBps}
                min={0}
                onChange={(event) => setFeeBps(Number(event.target.value))}
                className="type-data-sm w-24 rounded-control border border-border-subtle bg-surface-base px-2 py-1.5 text-text-primary focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="type-label text-text-muted">Slippage (bps)</span>
              <input
                type="number"
                value={slippageBps}
                min={0}
                onChange={(event) => setSlippageBps(Number(event.target.value))}
                className="type-data-sm w-24 rounded-control border border-border-subtle bg-surface-base px-2 py-1.5 text-text-primary focus:outline-none"
              />
            </label>
          </div>

          <Button
            variant="accent"
            size="sm"
            className="self-start"
            onClick={() => void run()}
            disabled={running}
          >
            {running ? "Running…" : "Run backtest"}
          </Button>

          <p className="type-label text-text-muted">
            Long only. Signal on bar close, filled at the next bar&rsquo;s open.
            Funding excluded. Shorts and leverage are not simulated.
          </p>
        </div>
      </Panel>

      {error !== null && (
        <div className="rounded-card border border-border-subtle bg-surface-base p-4">
          <p className="type-body-sm text-negative">{error}</p>
        </div>
      )}

      {result !== null && (
        <>
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="type-body-sm text-text-primary">
                  {result.config.instrumentId} · {result.strategy.name}
                </p>
                <p className="type-label text-text-muted">
                  {result.config.timeframe.toUpperCase()} · {result.barsLoaded} bars ·{" "}
                  {(result.coverage * 100).toFixed(1)}% coverage
                </p>
              </div>
              <span className="type-label text-text-muted">{result.quality.level}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                ["Return", pct(result.metrics.totalReturnPct)],
                ["Buy & hold", pct(result.metrics.benchmarkReturnPct)],
                ["Max drawdown", pct(result.metrics.maxDrawdownPct)],
                ["Sharpe", num(result.metrics.sharpe)],
                ["Trades", String(result.metrics.trades)],
                ["Win rate", pct(result.metrics.winRatePct, 0)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="type-label text-text-muted">{label}</p>
                  <p className="type-data-sm text-text-primary">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <EquitySpark equity={(result as unknown as { equity: Array<{ equity: number }> }).equity ?? []} />
            </div>
          </Panel>

          <div className="flex gap-1.5">
            {(["overview", "trades", "strategy"] as const).map((option) => (
              <Chip key={option} active={tab === option} onClick={() => setTab(option)}>
                {option}
              </Chip>
            ))}
          </div>

          {tab === "overview" && (
            <Panel>
              {/* Not a footnote: a return without its assumptions is a number
                  that circulates without its caveats. */}
              <p className="type-label mb-2 text-text-muted">Assumptions</p>
              <ul className="flex list-none flex-col gap-0.5">
                {[
                  `Data source: Binance klines, ${result.config.timeframe}`,
                  `Period: ${result.config.startAt.slice(0, 10)} → ${result.config.endAt.slice(0, 10)}`,
                  `Initial capital: $${result.config.initialCapitalUsd.toLocaleString()}`,
                  `Fee ${result.config.execution.feeBps} bps · Slippage ${result.config.execution.slippageBps} bps`,
                  "Direction: long only · Funding excluded",
                  "Execution: signal on bar close, fill at next bar open",
                ].map((line) => (
                  <li key={line} className="type-label text-text-secondary">
                    {line}
                  </li>
                ))}
              </ul>

              {result.quality.issues.length > 0 && (
                <>
                  <p className="type-label mb-1 mt-3 text-text-muted">Caveats</p>
                  {result.quality.issues.map((issue) => (
                    <p key={issue} className="type-label text-text-secondary">
                      {issue}
                    </p>
                  ))}
                </>
              )}

              {result.robustness !== null && (
                <>
                  <p className="type-label mb-1 mt-3 text-text-muted">Robustness</p>
                  {result.robustness.findings.map((finding) => (
                    <p key={finding} className="type-label text-text-secondary">
                      {finding}
                    </p>
                  ))}
                </>
              )}
            </Panel>
          )}

          {tab === "trades" && (
            <Panel>
              <p className="type-label mb-2 text-text-muted">
                {result.trades.length} trade{result.trades.length === 1 ? "" : "s"}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {["Entry", "Exit", "Return", "PnL", "Bars"].map((head) => (
                        <th key={head} className="type-label py-1.5 text-left text-text-muted">
                          {head}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, 50).map((trade, index) => (
                      <tr key={index} className="border-b border-border-subtle/50">
                        <td className="type-label py-1.5 text-text-secondary">
                          {new Date(trade.entryTime).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                        <td className="type-label py-1.5 text-text-secondary">
                          {trade.exitTime === null
                            ? "—"
                            : new Date(trade.exitTime).toISOString().slice(0, 16).replace("T", " ")}
                        </td>
                        <td
                          className={cn(
                            "type-data-sm py-1.5",
                            trade.returnPct >= 0 ? "text-accent" : "text-negative",
                          )}
                        >
                          {pct(trade.returnPct)}
                        </td>
                        <td className="type-data-sm py-1.5 text-text-primary">
                          ${trade.netPnl.toFixed(2)}
                        </td>
                        <td className="type-label py-1.5 text-text-secondary">
                          {trade.barsHeld}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.trades.length > 50 && (
                <p className="type-label mt-2 text-text-muted">
                  Showing the first 50 of {result.trades.length}.
                </p>
              )}
            </Panel>
          )}

          {tab === "strategy" && (
            <Panel>
              <p className="type-label mb-1 text-text-muted">Entry</p>
              <p className="type-body-sm mb-3 text-text-primary">{result.strategy.rules.entry}</p>
              <p className="type-label mb-1 text-text-muted">Exit</p>
              <p className="type-body-sm mb-3 text-text-primary">{result.strategy.rules.exit}</p>
              <p className="type-label mb-1 text-text-muted">Parameters</p>
              <p className="type-data-sm text-text-secondary">
                {Object.entries(result.config.params)
                  .map(([key, value]) => `${key}: ${value}`)
                  .join(" · ")}
              </p>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
