import "server-only";

import { escapeHtml } from "@/lib/personalized/render/telegram";
import { appUrl } from "@/lib/env";
import {
  compareStrategies,
  parseBacktestRequest,
  runOne,
  saveResult,
} from "@/lib/backtest/run";
import { defaultParams, getStrategy, STRATEGIES } from "@/lib/backtest/strategies";
import type { InlineButton } from "@/lib/telegram/api";

/* ---------------------------------------------------------------------------
   Backtests in Telegram.

   Reads the same engine the web surface does, so a return quoted in a chat
   and the same run on the page cannot disagree.

   Every result carries its assumptions. A performance figure without the fee,
   the slippage and the execution timing beside it is not a result — it is a
   number someone will quote back without the caveats.
--------------------------------------------------------------------------- */

export interface BacktestView {
  html: string;
  buttons: InlineButton[][];
}

const pct = (value: number | null | undefined, digits = 1): string =>
  typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(digits)}%` : "—";

const num = (value: number | null | undefined, digits = 2): string =>
  typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";

/** The menu shown when `/backtest` arrives with no arguments. */
export function backtestMenu(): BacktestView {
  return {
    html: [
      "<b>Elyra Backtests</b>",
      "",
      "Historical simulation of technical strategies on real market data.",
      "",
      "<code>/backtest SOL rsi 12 1h 1y</code>",
      "<code>/backtest btc macd 4h 6m</code>",
      "<code>compare macd, rsi and bollinger on sol</code>",
      "",
      `${STRATEGIES.length} strategies available.`,
    ].join("\n"),
    buttons: [
      [
        { text: "SOL · RSI 12", callbackData: "bt:run:SOL:RSI_12_MEAN_REVERSION_V1" },
        { text: "BTC · MACD", callbackData: "bt:run:BTC:MACD_CROSS_V1" },
      ],
      [{ text: "Strategies", callbackData: "bt:list" }],
      [{ text: "Open Backtest Lab", url: `${appUrl()}/research` }],
    ],
  };
}

export function strategyList(): BacktestView {
  const lines = ["<b>Strategies</b>", ""];

  for (const group of ["trend", "momentum", "mean_reversion", "volume", "volatility", "price_volume"]) {
    const rows = STRATEGIES.filter((strategy) => strategy.category === group);
    if (rows.length === 0) continue;
    lines.push(`<b>${escapeHtml(group.replace(/_/g, " "))}</b>`);
    for (const row of rows) lines.push(`  ${escapeHtml(row.name)}`);
    lines.push("");
  }

  lines.push("<i>Run one with</i> <code>/backtest SOL rsi 1h 1y</code>");

  return { html: lines.join("\n"), buttons: [[{ text: "Back", callbackData: "bt:menu" }]] };
}

/** One result, with its assumptions. */
export async function runView(input: {
  userId: string;
  text: string;
}): Promise<BacktestView> {
  const parsed = parseBacktestRequest(input.text);

  if (parsed.strategyIds.length === 0) {
    /* No strategy recognised is a question, not a default. Running an
       arbitrary strategy and labelling it correctly is worse than asking. */
    return {
      html:
        "<b>Which strategy?</b>\n\nI did not recognise one in that. Try " +
        "<code>/backtest SOL rsi 12 1h 1y</code>, or tap Strategies.",
      buttons: [[{ text: "Strategies", callbackData: "bt:list" }]],
    };
  }

  /* More than one named means a comparison, which is almost certainly what
     was meant. */
  if (parsed.strategyIds.length > 1) {
    return compareView({ ...parsed });
  }

  const strategy = getStrategy(parsed.strategyIds[0])!;
  const endAt = Date.now();

  const outcome = await runOne({
    symbol: parsed.symbol,
    timeframe: parsed.timeframe,
    startAt: endAt - parsed.days * 86_400_000,
    endAt,
    strategyId: strategy.id,
    params: { ...defaultParams(strategy), ...parsed.params },
    feeBps: parsed.feeBps ?? 10,
  });

  if (!outcome.ok || outcome.metrics === undefined) {
    return {
      html: `<b>Backtest failed</b>\n\n${escapeHtml(outcome.error ?? "Unknown error.")}`,
      buttons: [[{ text: "Back", callbackData: "bt:menu" }]],
    };
  }

  const id = await saveResult({ userId: input.userId, query: input.text, outcome });
  const m = outcome.metrics;

  const lines = [
    "<b>Backtest complete</b>",
    "",
    `<b>${escapeHtml(parsed.symbol)} · ${escapeHtml(strategy.name)}</b>`,
    `${parsed.timeframe.toUpperCase()} · ${parsed.days} days · ${outcome.barsLoaded} bars`,
    "",
    `Return        <b>${pct(m.totalReturnPct)}</b>`,
    `Buy &amp; hold    ${pct(m.benchmarkReturnPct)}`,
    `Max drawdown  ${pct(m.maxDrawdownPct)}`,
    `Sharpe        ${num(m.sharpe)}`,
    `Trades        ${m.trades}`,
    `Win rate      ${pct(m.winRatePct, 0)}`,
    "",
    /* Assumptions are not a footnote. A return without them is a number
       someone will quote back without the caveats. */
    "<b>Assumptions</b>",
    `Fee ${outcome.config?.execution.feeBps} bps · Slippage ${outcome.config?.execution.slippageBps} bps`,
    "Long only · Signal on bar close, fill next bar open",
    "Funding excluded",
  ];

  const caveats = [...(outcome.quality?.issues ?? [])].slice(0, 2);
  if (caveats.length > 0) {
    lines.push("", ...caveats.map((issue) => `<i>${escapeHtml(issue)}</i>`));
  }

  lines.push("", "<i>Historical simulation. Not a forecast.</i>");

  return {
    html: lines.join("\n"),
    buttons: [
      ...(id === null
        ? []
        : [[{ text: "Full results", url: `${appUrl()}/research` }]]),
      [
        { text: "Run again", callbackData: `bt:run:${parsed.symbol}:${strategy.id}` },
        { text: "Strategies", callbackData: "bt:list" },
      ],
    ],
  };
}

/** Several strategies over one dataset. */
export async function compareView(input: {
  symbol: string;
  timeframe: string;
  days: number;
  strategyIds: string[];
  feeBps?: number;
}): Promise<BacktestView> {
  const endAt = Date.now();

  const result = await compareStrategies({
    symbol: input.symbol,
    timeframe: input.timeframe,
    startAt: endAt - input.days * 86_400_000,
    endAt,
    strategyIds: input.strategyIds,
    feeBps: input.feeBps ?? 10,
  });

  if (!result.ok || result.assumptions === undefined) {
    return {
      html: `<b>Comparison failed</b>\n\n${escapeHtml(result.error ?? "Unknown error.")}`,
      buttons: [],
    };
  }

  const a = result.assumptions;
  const lines = [
    `<b>${escapeHtml(a.symbol)} · ${a.timeframe.toUpperCase()} · ${input.days} days</b>`,
    `${a.bars} bars · one dataset · identical costs`,
    "",
  ];

  for (const row of result.rows) {
    if (!row.ok) {
      lines.push(`<b>${escapeHtml(row.strategyName)}</b> — ${escapeHtml(row.error ?? "failed")}`);
      continue;
    }
    lines.push(`<b>${escapeHtml(row.strategyName)}</b>`);
    lines.push(
      `  ${pct(row.totalReturnPct)} · dd ${pct(row.maxDrawdownPct)} · ${row.trades} trades · Sharpe ${num(row.sharpe)}`,
    );
  }

  lines.push(
    "",
    `Buy &amp; hold over the same period: <b>${pct(result.rows.find((r) => r.ok)?.benchmarkReturnPct)}</b>`,
    "",
    `Fee ${a.feeBps} bps · Slippage ${a.slippageBps} bps · long only`,
    "",
    /* No winner is declared. One period on one asset ranked by return is how
       a backtester gets used as an oracle. */
    "<i>One period, one asset. Read drawdown and trade count alongside return.</i>",
  );

  return {
    html: lines.join("\n"),
    buttons: [[{ text: "Open Backtest Lab", url: `${appUrl()}/research` }]],
  };
}

/* --- callbacks ------------------------------------------------------------ */

export function isBacktestCallback(data: string): boolean {
  return data.startsWith("bt:");
}

export async function handleBacktestCallback(
  userId: string,
  data: string,
): Promise<BacktestView> {
  if (data === "bt:list") return strategyList();
  if (data === "bt:menu") return backtestMenu();

  const run = /^bt:run:([A-Z]{2,10}):([A-Z0-9_]+)$/.exec(data);
  if (run !== null) {
    const strategy = getStrategy(run[2]);
    if (strategy === null) return backtestMenu();
    return runView({ userId, text: `${run[1]} ${strategy.name} 1h 1y` });
  }

  return backtestMenu();
}
