"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bot, ChartNoAxesColumnIncreasing } from "lucide-react";
import { handoffFor, handoffHref } from "@/lib/autotrade/handoff";
import { useAuthedFetch } from "@/lib/useAuthedFetch";
import { cn } from "@/lib/utils";
import { useElyraAuth } from "@/components/providers/PrivyClientProvider";
import { Loading, Problem, SignIn, useResearchResource } from "./shared";
import { useT } from "@/lib/i18n/client";

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
    strategyId?: string;
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
  typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(digits)}%`
    : "—";

const num = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "n/a";

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="r-backtest-result">{children}</div>;
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
      aria-pressed={active}
      className={cn(
        "r-choice type-label rounded-control border px-2.5 py-1 transition-colors",
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
  const t = useT();
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
      aria-label={t("Equity curve")}
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
  const t = useT();
  const authedFetch = useAuthedFetch();

  const auth = useElyraAuth();
  const catalogueFeed = useResearchResource<{
    strategies: Strategy[];
    categories: Category[];
  }>("/api/backtest/strategies", auth.authenticated);
  const catalogue = catalogueFeed.data;
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

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
  const [tab, setTab] = useState<"overview" | "trades" | "strategy">(
    "overview",
  );

  const strategy =
    catalogue?.strategies.find((s) => s.id === strategyId) ?? null;

  const run = useCallback(async () => {
    if (controller.current || !strategy) return;
    const requestController = new AbortController();
    controller.current = requestController;
    setRunning(true);
    setError(null);
    try {
      const response = await authedFetch("/api/backtest/run", {
        method: "POST",
        signal: requestController.signal,
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
      if (requestController.signal.aborted) return;
      if (!response.ok) {
        setError(body.error ?? t("The backtest failed."));
        setResult(null);
        return;
      }
      setResult(body);
      setTab("overview");
    } catch {
      if (!requestController.signal.aborted)
        setError(
          t("The backtest could not be run. Check the inputs and try again."),
        );
    } finally {
      controller.current = null;
      if (!requestController.signal.aborted) setRunning(false);
    }
  }, [
    authedFetch,
    strategyId,
    symbol,
    timeframe,
    days,
    feeBps,
    slippageBps,
    params,
    strategy, t,
  ]);

  const parameterValue = (key: string) =>
    params[key] ??
    strategy?.parameters.find((parameter) => parameter.key === key)?.default;
  const isRsi = strategyId === "RSI_12_MEAN_REVERSION_V1";
  const reset = () => {
    setSymbol("SOL");
    setTimeframe("1h");
    setDays(365);
    setStrategyId("RSI_12_MEAN_REVERSION_V1");
    setParams({});
    setFeeBps(10);
    setSlippageBps(10);
    setResult(null);
    setError(null);
  };
  return (
    <div className="r-backtests">
      {!auth.authenticated && (
        <SignIn>{t("Connect a wallet to configure and run a backtest.")}</SignIn>
      )}
      {catalogueFeed.error && (
        <Problem retry={catalogueFeed.reload}>{catalogueFeed.error}</Problem>
      )}
      {catalogueFeed.loading && (
        <Loading>{t("Loading supported strategies…")}</Loading>
      )}
      <div className="r-split r-backtest-builder">
        <form
          className="r-strategy-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <h2>{t("Strategy builder")}</h2>
          <fieldset disabled={running}>
            <legend className="sr-only">{t("Market and period")}</legend>
            {(
              [
                [t("Asset"), SYMBOLS, symbol, setSymbol],
                [t("Timeframe"), TIMEFRAMES, timeframe, setTimeframe],
              ] as const
            ).map(([label, options, value, change]) => (
              <div className="r-form-row" key={label}>
                <span>{label}</span>
                <div className="r-choices" role="group" aria-label={label}>
                  {options.map((option) => (
                    <Chip
                      key={option}
                      active={value === option}
                      onClick={() => change(option)}
                    >
                      {option}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
            <div className="r-form-row">
              <span>{t("Period")}</span>
              <div className="r-choices" role="group" aria-label={t("Period")}>
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
            </div>
            <label className="r-form-row">
              <span>{t("Strategy")}</span>
              <select
                value={strategyId}
                disabled={!catalogue}
                onChange={(event) => {
                  setStrategyId(event.target.value);
                  setParams({});
                }}
                aria-label={t("Strategy")}
              >
                {!catalogue && (
                  <option value="RSI_12_MEAN_REVERSION_V1">
                    {t("RSI (12) — mean reversion")}
                  </option>
                )}
                {catalogue?.categories.map((category) => (
                  <optgroup key={category.id} label={category.label}>
                    {catalogue.strategies
                      .filter((item) => item.category === category.id)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </label>
          </fieldset>
          {strategy && strategy.parameters.length > 0 && (
            <fieldset className="r-parameter-grid" disabled={running}>
              <legend className="sr-only">{t("Parameters")}</legend>
              {strategy.parameters.map((parameter) => (
                <label key={parameter.key}>
                  <span>{parameter.label}</span>
                  <input
                    type="number"
                    required
                    value={
                      Number.isNaN(params[parameter.key])
                        ? ""
                        : (params[parameter.key] ?? parameter.default)
                    }
                    min={parameter.min}
                    max={parameter.max}
                    step={parameter.step ?? 1}
                    onChange={(event) =>
                      setParams((current) => ({
                        ...current,
                        [parameter.key]:
                          event.target.value === ""
                            ? NaN
                            : Number(event.target.value),
                      }))
                    }
                  />
                </label>
              ))}
            </fieldset>
          )}
          <fieldset className="r-cost-grid" disabled={running}>
            <legend className="sr-only">{t("Execution costs")}</legend>
            <label>
              <span>{t("Fee (bps)")}</span>
              <input
                type="number"
                required
                min={0}
                max={1000}
                value={Number.isNaN(feeBps) ? "" : feeBps}
                onChange={(event) =>
                  setFeeBps(
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                  )
                }
              />
            </label>
            <label>
              <span>{t("Slippage (bps)")}</span>
              <input
                type="number"
                required
                min={0}
                max={1000}
                value={Number.isNaN(slippageBps) ? "" : slippageBps}
                onChange={(event) =>
                  setSlippageBps(
                    event.target.value === ""
                      ? NaN
                      : Number(event.target.value),
                  )
                }
              />
            </label>
          </fieldset>
          <div className="r-actions">
            <button
              type="submit"
              className="r-button r-primary"
              disabled={running || !strategy || !auth.authenticated}
              aria-busy={running}
            >
              {running ? t("Running…") : t("Run backtest")}
            </button>
            <button
              type="button"
              className="r-button r-borderless"
              disabled={running}
              onClick={reset}
            >
              {t("Reset")}
            </button>
          </div>
        </form>
        <aside className="r-strategy-summary">
          <h2>{t("Strategy logic")}</h2>
          <dl className="r-definition">
            <dt>{t("Entry")}</dt>
            <dd>
              {strategy
                ? isRsi
                  ? t("RSI ({period}) crosses back above {level}.", { period: parameterValue("period"), level: parameterValue("oversold") })
                  : strategy.rules.entry
                : t("Load a strategy to view its rules.")}
            </dd>
            <dt>{t("Exit")}</dt>
            <dd>
              {strategy
                ? isRsi
                  ? t("RSI crosses above {level}.", { level: parameterValue("exitLevel") })
                  : strategy.rules.exit
                : "—"}
            </dd>
            <dt>{t("Position")}</dt>
            <dd>{t("Long only")}</dd>
          </dl>
          <div className="r-section">
            <h2>{t("Execution")}</h2>
            <dl className="r-definition">
              <dt>{t("Signal")}</dt>
              <dd>{t("At bar close")}</dd>
              <dt>{t("Fill")}</dt>
              <dd>{t("At next bar open")}</dd>
              <dt>{t("Fee")}</dt>
              <dd>{t("{value} bps", { value: Number.isFinite(feeBps) ? feeBps : "—" })}</dd>
              <dt>{t("Slippage")}</dt>
              <dd>{t("{value} bps", { value: Number.isFinite(slippageBps) ? slippageBps : "—" })}</dd>
            </dl>
          </div>
          <p className="r-footnote">
            {t("Funding, shorts and leverage are not simulated.")}
          </p>
        </aside>
      </div>
      {!result && !running && (
        <div className="r-empty r-backtest-empty">
          <ChartNoAxesColumnIncreasing
            size={28}
            strokeWidth={1.5}
            aria-hidden
          />
          <p>{t("Run a test to see results here.")}</p>
        </div>
      )}
      {running && (
        <Loading>{t("Running the simulation against historical bars…")}</Loading>
      )}
      {error !== null && (
        <div className="rounded-card border border-border-subtle bg-surface-base p-4">
          <p className="type-body-sm text-negative">{error}</p>
        </div>
      )}

      {result !== null && (
        <>
          {result.warnings.map((warning, index) => (
            <p key={index} className="r-note">
              {warning}
            </p>
          ))}
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="type-body-sm text-text-primary">
                  {result.config.instrumentId} · {result.strategy.name}
                </p>
                <p className="type-label text-text-muted">
                  {t("{timeframe} · {barsLoaded} bars · {value2}% coverage", { timeframe: result.config.timeframe.toUpperCase(), barsLoaded: result.barsLoaded, value2: (result.coverage * 100).toFixed(1) })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="type-label text-text-muted">
                  {result.quality.level}
                </span>
                <RunOnPaper result={result} strategyId={strategyId} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[
                [t("Return"), pct(result.metrics.totalReturnPct)],
                [t("Buy & hold"), pct(result.metrics.benchmarkReturnPct)],
                [t("Max drawdown"), pct(result.metrics.maxDrawdownPct)],
                [t("Sharpe"), num(result.metrics.sharpe)],
                [t("Trades"), String(result.metrics.trades)],
                [t("Win rate"), pct(result.metrics.winRatePct, 0)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p className="type-label text-text-muted">{label}</p>
                  <p className="type-data-sm text-text-primary">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <EquitySpark
                equity={
                  (result as unknown as { equity: Array<{ equity: number }> })
                    .equity ?? []
                }
              />
            </div>
          </Panel>

          <div className="flex gap-1.5">
            {(["overview", "trades", "strategy"] as const).map((option) => (
              <Chip
                key={option}
                active={tab === option}
                onClick={() => setTab(option)}
              >
                {option}
              </Chip>
            ))}
          </div>

          {tab === "overview" && (
            <Panel>
              {/* Not a footnote: a return without its assumptions is a number
                  that circulates without its caveats. */}
              <p className="type-label mb-2 text-text-muted">{t("Assumptions")}</p>
              <ul className="flex list-none flex-col gap-0.5">
                {[
                  t("Data source: Binance klines, {timeframe}", { timeframe: result.config.timeframe }),
                  t("Period: {start} → {end}", { start: result.config.startAt.slice(0, 10), end: result.config.endAt.slice(0, 10) }),
                  t("Initial capital: {capital}", { capital: `$${result.config.initialCapitalUsd.toLocaleString("en-US")}` }),
                  t("Fee {fee} bps · Slippage {slippage} bps", { fee: result.config.execution.feeBps, slippage: result.config.execution.slippageBps }),
                  t("Direction: long only · Funding excluded"),
                  t("Execution: signal on bar close, fill at next bar open"),
                ].map((line) => (
                  <li key={line} className="type-label text-text-secondary">
                    {line}
                  </li>
                ))}
              </ul>

              {result.quality.issues.length > 0 && (
                <>
                  <p className="type-label mb-1 mt-3 text-text-muted">
                    {t("Caveats")}
                  </p>
                  {result.quality.issues.map((issue) => (
                    <p key={issue} className="type-label text-text-secondary">
                      {issue}
                    </p>
                  ))}
                </>
              )}

              {result.robustness !== null && (
                <>
                  <p className="type-label mb-1 mt-3 text-text-muted">
                    {t("Robustness")}
                  </p>
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
                {(result.trades.length === 1 ? t("{count} trade", { count: result.trades.length }) : t("{count} trades", { count: result.trades.length }))}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px]">
                  <thead>
                    <tr className="border-b border-border-subtle">
                      {[t("Entry"), t("Exit"), t("Return"), "PnL", t("Bars")].map(
                        (head) => (
                          <th
                            scope="col"
                            key={head}
                            className="type-label py-1.5 text-left text-text-muted"
                          >
                            {head}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {result.trades.slice(0, 50).map((trade, index) => (
                      <tr
                        key={index}
                        className="border-b border-border-subtle/50"
                      >
                        <td className="type-label py-1.5 text-text-secondary">
                          {new Date(trade.entryTime)
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")}
                        </td>
                        <td className="type-label py-1.5 text-text-secondary">
                          {trade.exitTime === null
                            ? "—"
                            : new Date(trade.exitTime)
                                .toISOString()
                                .slice(0, 16)
                                .replace("T", " ")}
                        </td>
                        <td
                          className={cn(
                            "type-data-sm py-1.5",
                            trade.returnPct >= 0
                              ? "text-accent"
                              : "text-negative",
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
                  {t("Showing the first 50 of {count}.", { count: result.trades.length })}
                </p>
              )}
            </Panel>
          )}

          {tab === "strategy" && (
            <Panel>
              <p className="type-label mb-1 text-text-muted">{t("Entry")}</p>
              <p className="type-body-sm mb-3 text-text-primary">
                {result.strategy.rules.entry}
              </p>
              <p className="type-label mb-1 text-text-muted">{t("Exit")}</p>
              <p className="type-body-sm mb-3 text-text-primary">
                {result.strategy.rules.exit}
              </p>
              <p className="type-label mb-1 text-text-muted">{t("Parameters")}</p>
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

/* A tested strategy, one step from running: on a market and timeframe a rule
   can trade, the result offers to fill /automation's New rule form with it.
   Nothing is created until the person adds the rule, and it starts on paper. */
function RunOnPaper({ result, strategyId }: { result: RunResult; strategyId: string }) {
  const t = useT();
  const handoff = handoffFor({
    strategyId: result.config.strategyId ?? strategyId,
    symbol: result.config.instrumentId,
    timeframe: result.config.timeframe,
    params: result.config.params,
  });
  if (handoff === null) return null;
  return (
    <Link href={handoffHref(handoff)} className="r-button" title={t("Fill a new paper rule on Automation with this strategy, market, timeframe and parameters.")}>
      <Bot size={14} strokeWidth={1.5} aria-hidden />
      {t("Run on paper")}
    </Link>
  );
}
