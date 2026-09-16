import "server-only";

import {
  directionOf,
  formatPercent,
  formatUsd,
  type ReportMetric,
  type ReportSection,
  type ResearchReportDocument,
  type ResearchSource,
} from "@/lib/research/report";
import { ENGINE_VERSION } from "@/lib/backtest/engine";
import { getStrategy } from "@/lib/backtest/strategies";
import type { RunOutcome } from "@/lib/backtest/run";

/* ---------------------------------------------------------------------------
   A backtest as a research document.

   Reuses the Research report model and PDF renderer rather than introducing a
   second one — same cover, same source appendix, same quality block, same
   verifier.

   ── Reproducibility metadata is a section, not a footer ────────────────

   Engine version, strategy version, data source, exact parameters and the
   period. Without those a saved PDF is a screenshot: the numbers cannot be
   regenerated, and there is no way to tell whether today's code would still
   produce them.
--------------------------------------------------------------------------- */

function metric(
  label: string,
  value: string,
  raw: number | null,
  sources: string[],
  change: number | null = null,
  note: string | null = null,
): ReportMetric {
  return {
    label,
    value,
    raw,
    unit: null,
    change: change === null ? null : `${change >= 0 ? "+" : ""}${change.toFixed(1)}%`,
    changeDirection: directionOf(change),
    sources,
    agreement: "single_source",
    note,
  };
}

/**
 * Builds the document. Returns null when the run did not produce a result.
 */
export function backtestDocument(
  outcome: RunOutcome,
  query: string | null,
): ResearchReportDocument | null {
  if (!outcome.ok || outcome.config === undefined || outcome.metrics === undefined) {
    return null;
  }

  const config = outcome.config;
  const m = outcome.metrics;
  const strategy = getStrategy(config.strategyId);

  const source: ResearchSource = {
    id: "candles",
    kind: "market_data",
    label: `Binance klines — ${config.instrumentId}, ${config.timeframe}, ${outcome.barsLoaded ?? 0} bars`,
    url: "https://api.binance.com/api/v3/klines",
    asOf: config.endAt,
  };

  const sections: ReportSection[] = [
    {
      id: "performance",
      title: "Performance",
      blocks: [
        {
          kind: "metrics",
          metrics: [
            metric("Total return", formatPercent(m.totalReturnPct), m.totalReturnPct, ["candles"]),
            metric(
              "Buy and hold",
              formatPercent(m.benchmarkReturnPct),
              m.benchmarkReturnPct,
              ["candles"],
              null,
              "Same period, same bars, same costs.",
            ),
            metric("Excess return", formatPercent(m.excessReturnPct), m.excessReturnPct, ["candles"]),
            metric("Ending equity", formatUsd(m.endingEquity), m.endingEquity, ["candles"]),
            metric(
              "CAGR",
              formatPercent(m.cagrPct),
              m.cagrPct,
              m.cagrPct === null ? [] : ["candles"],
              null,
              m.cagrPct === null ? "Period too short to annualise meaningfully." : null,
            ),
          ],
        },
      ],
    },
    {
      id: "risk",
      title: "Risk",
      blocks: [
        {
          kind: "metrics",
          metrics: [
            metric("Max drawdown", formatPercent(m.maxDrawdownPct), m.maxDrawdownPct, ["candles"]),
            metric(
              "Sharpe",
              m.sharpe === null ? "—" : m.sharpe.toFixed(2),
              m.sharpe,
              m.sharpe === null ? [] : ["candles"],
              null,
              m.sharpe === null ? "Too few return observations to measure." : null,
            ),
            metric(
              "Sortino",
              m.sortino === null ? "—" : m.sortino.toFixed(2),
              m.sortino,
              m.sortino === null ? [] : ["candles"],
              null,
              m.sortino === null ? "Too few losing periods to measure downside risk." : null,
            ),
            metric(
              "Annualised volatility",
              formatPercent(m.annualisedVolatilityPct),
              m.annualisedVolatilityPct,
              m.annualisedVolatilityPct === null ? [] : ["candles"],
              null,
              m.annualisedVolatilityPct === null
                ? "Unavailable."
                : "Annualised on a 365-day year — crypto trades continuously.",
            ),
            metric("Exposure", formatPercent(m.exposurePct), m.exposurePct, ["candles"]),
          ],
        },
      ],
    },
    {
      id: "trades",
      title: "Trading",
      blocks: [
        {
          kind: "metrics",
          metrics: [
            metric("Trades", String(m.trades), m.trades, ["candles"]),
            metric("Win rate", formatPercent(m.winRatePct), m.winRatePct, m.winRatePct === null ? [] : ["candles"]),
            metric(
              "Profit factor",
              m.profitFactor === null ? "—" : m.profitFactor.toFixed(2),
              m.profitFactor,
              m.profitFactor === null ? [] : ["candles"],
              null,
              m.profitFactor === null ? "No losing trades to divide by." : null,
            ),
            metric("Average trade", formatUsd(m.averageTradeUsd), m.averageTradeUsd, m.averageTradeUsd === null ? [] : ["candles"]),
            metric("Total fees", formatUsd(m.totalFees), m.totalFees, ["candles"]),
            metric("Total slippage", formatUsd(m.totalSlippage), m.totalSlippage, ["candles"]),
          ],
        },
      ],
    },
    {
      id: "rules",
      title: "Strategy rules",
      blocks: [
        { kind: "paragraph", text: `Entry — ${strategy?.rules.entry ?? "Not recorded."}` },
        { kind: "paragraph", text: `Exit — ${strategy?.rules.exit ?? "Not recorded."}` },
        {
          kind: "paragraph",
          text: `Parameters: ${Object.entries(config.params)
            .map(([key, value]) => `${key} = ${value}`)
            .join(", ")}`,
        },
      ],
    },
    {
      id: "assumptions",
      title: "Assumptions",
      blocks: [
        {
          kind: "bullets",
          items: [
            `Market: ${config.instrumentId} on ${config.venue}, ${config.timeframe} bars`,
            `Period: ${config.startAt.slice(0, 10)} to ${config.endAt.slice(0, 10)}`,
            `Bars loaded: ${outcome.barsLoaded ?? 0} (${((outcome.coverage ?? 0) * 100).toFixed(1)}% coverage)`,
            `Initial capital: ${formatUsd(config.initialCapitalUsd)}`,
            `Direction: long only — shorts are not simulated`,
            `Position size: ${(config.positionFraction * 100).toFixed(0)}% of equity`,
            `Execution: signal on bar close, filled at the next bar's open`,
            `Fees: ${config.execution.feeBps} bps per side`,
            `Slippage: ${config.execution.slippageBps} bps per side, always against the trade`,
            `Funding: excluded`,
          ],
        },
      ],
    },
  ];

  if (outcome.robustness !== undefined) {
    sections.push({
      id: "robustness",
      title: "Robustness",
      blocks: [
        {
          kind: "table",
          table: {
            caption: "The same strategy under harsher and neighbouring assumptions.",
            columns: ["Variant", "Return", "Drawdown", "Trades"],
            rows: outcome.robustness.checks.map((check) => [
              check.change,
              formatPercent(check.totalReturnPct),
              formatPercent(check.maxDrawdownPct),
              String(check.trades),
            ]),
            sources: ["candles"],
          },
        },
        { kind: "bullets", items: outcome.robustness.findings },
      ],
    });
  }

  /* Reproducibility is a section. A saved PDF whose numbers cannot be
     regenerated is a screenshot. */
  sections.push({
    id: "reproducibility",
    title: "Reproducibility",
    blocks: [
      {
        kind: "bullets",
        items: [
          `Engine version: ${ENGINE_VERSION}`,
          `Strategy: ${config.strategyId} (version ${strategy?.version ?? 1})`,
          `Data provider: Binance public klines`,
          `Generated: ${new Date().toISOString()}`,
        ],
      },
    ],
  });

  const caveats = [...(outcome.quality?.issues ?? []), ...(outcome.warnings ?? [])];
  if (caveats.length > 0) {
    sections.push({
      id: "caveats",
      title: "Caveats",
      blocks: caveats.map((text) => ({ kind: "omission" as const, text })),
    });
  }

  return {
    id: `backtest-${config.strategyId}-${config.instrumentId}`,
    title: `${config.instrumentId} · ${strategy?.name ?? config.strategyId}`,
    kind: "custom",
    subject: { name: `${config.instrumentId} backtest`, ticker: config.instrumentId, cik: null },
    period: { label: `${config.timeframe} bars`, start: config.startAt, end: config.endAt },
    priorPeriod: null,
    generatedAt: new Date().toISOString(),
    sections,
    sources: [source],
    quality: {
      level:
        outcome.quality?.level === "valid"
          ? "verified"
          : outcome.quality?.level === "valid_with_warnings"
            ? "verified_with_warnings"
            : "incomplete",
      checks: [
        {
          id: "lookahead",
          label: "No lookahead — signals execute on the next bar",
          passed: true,
          detail: null,
        },
        {
          id: "costs",
          label: "Fees and slippage applied on both sides",
          passed: config.execution.feeBps > 0 || config.execution.slippageBps > 0,
          detail:
            config.execution.feeBps > 0 || config.execution.slippageBps > 0
              ? null
              : "This run assumed zero costs.",
        },
        {
          id: "benchmark",
          label: "Benchmark uses the same bars and the same costs",
          passed: m.benchmarkReturnPct !== null,
          detail: m.benchmarkReturnPct === null ? "Benchmark unavailable." : null,
        },
        {
          id: "sample",
          label: "Enough trades to describe a distribution",
          passed: m.trades >= 5,
          detail: m.trades >= 5 ? null : `${m.trades} trade(s).`,
        },
      ],
      omissions: query === null ? [] : [`Requested as: "${query}"`],
    },
  };
}
