import "server-only";

import type { RegisteredTool } from "@/lib/agent/tools/registry";
import { ToolArgumentError } from "@/lib/agent/tools/args";
import {
  compareStrategies,
  parseBacktestRequest,
  runOne,
  saveResult,
  MAX_COMPARE,
} from "@/lib/backtest/run";
import {
  defaultParams,
  getStrategy,
  resolveStrategy,
  STRATEGIES,
  STRATEGY_CATEGORIES,
} from "@/lib/backtest/strategies";

/* ---------------------------------------------------------------------------
   Backtesting, as tools the agent can call.

   ── The model never simulates ──────────────────────────────────────────

   Every number these tools return came out of the engine. The model's job is
   to read the result and explain it — which strategy did what, what the
   caveats were, whether the trade count supports a conclusion. A model asked
   to "estimate" a Sharpe ratio will produce one, and it will be wrong in a
   way that looks exactly like being right.

   The descriptions say so explicitly, because the failure mode is a model
   helpfully "checking" a figure and contradicting the table it was handed.

   ── Results are capped before they reach a prompt ──────────────────────

   A year of hourly bars produces hundreds of trades. Putting them in context
   costs tokens on every subsequent turn and buys nothing: the summary answers
   the question, and the full list lives behind a link.
--------------------------------------------------------------------------- */

const round = (value: number | null | undefined, digits = 2): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10 ** digits) / 10 ** digits
    : null;

export const backtestListStrategies: RegisteredTool = {
  def: {
    name: "backtest_list_strategies",
    description:
      "Every technical strategy Elyra can backtest, grouped by category, with " +
      "its exact entry and exit rules and its parameters. Use when asked what " +
      "can be tested, or to confirm a strategy exists before running it.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter: trend, momentum, mean_reversion, volume, volatility, price_volume.",
        },
      },
      required: [],
    },
  },
  async execute(args) {
    const category = typeof args.category === "string" ? args.category : null;
    const rows = STRATEGIES.filter(
      (strategy) => category === null || strategy.category === category,
    );

    return {
      categories: STRATEGY_CATEGORIES,
      strategies: rows.map((strategy) => ({
        id: strategy.id,
        name: strategy.name,
        category: strategy.category,
        entryRule: strategy.rules.entry,
        exitRule: strategy.rules.exit,
        parameters: strategy.parameters.map((parameter) => ({
          key: parameter.key,
          label: parameter.label,
          default: parameter.default,
        })),
        requiresVolume: strategy.requiresVolume,
        intradayOnly: strategy.intradayOnly ?? false,
      })),
      note:
        "An indicator is not a strategy — each entry above has explicit entry " +
        "and exit rules, and those rules are what gets simulated.",
    };
  },
};

export const backtestRun: RegisteredTool = {
  def: {
    name: "backtest_run",
    description:
      "Runs a historical simulation of one technical strategy on real market " +
      "data and returns deterministic performance metrics. Handles common " +
      "misspellings ('rs 12', 'probablistic sar', 'lchimoke cloud'). " +
      "EVERY NUMBER RETURNED IS AUTHORITATIVE — report the figures as given " +
      "and do NOT recompute returns, Sharpe or drawdown yourself. A metric " +
      "returned as null is genuinely unavailable (usually too few " +
      "observations); say so rather than estimating it. Long-only; shorts and " +
      "leverage are not simulated.",
    parameters: {
      type: "object",
      properties: {
        strategy: { type: "string", description: "Strategy name or id — 'rsi 12', 'macd'." },
        symbol: { type: "string", description: "Asset — SOL, BTC, ETH. Default SOL." },
        timeframe: { type: "string", description: "1m, 5m, 15m, 30m, 1h, 4h, 1d. Default 1h." },
        days: { type: "number", description: "Days of history. Default 365." },
        feeBps: { type: "number", description: "Fee in basis points. Default 10." },
        slippageBps: { type: "number", description: "Slippage in basis points. Default 10." },
        robustness: { type: "boolean", description: "Also run cost and parameter sensitivity." },
      },
      required: ["strategy"],
    },
  },
  async execute(args, context) {
    if (typeof args.strategy !== "string" || args.strategy.trim().length === 0) {
      throw new ToolArgumentError("backtest_run needs a `strategy`.");
    }

    const match = resolveStrategy(args.strategy);
    if (match === null) {
      return {
        error: `"${args.strategy}" did not match any strategy.`,
        available: STRATEGIES.map((strategy) => strategy.name),
        note: "Do not guess a substitute. Ask which of the available strategies was meant.",
      };
    }

    const days = typeof args.days === "number" ? args.days : 365;
    const endAt = Date.now();

    const outcome = await runOne(
      {
        symbol: typeof args.symbol === "string" ? args.symbol : "SOL",
        timeframe: typeof args.timeframe === "string" ? args.timeframe : "1h",
        startAt: endAt - days * 86_400_000,
        endAt,
        strategyId: match.strategy.id,
        params: { ...defaultParams(match.strategy), ...match.params },
        feeBps: typeof args.feeBps === "number" ? args.feeBps : 10,
        slippageBps: typeof args.slippageBps === "number" ? args.slippageBps : 10,
      },
      { robustness: args.robustness === true },
    );

    if (!outcome.ok) {
      return {
        error: outcome.error,
        note: "Report this plainly. Do not describe a result that was not produced.",
      };
    }

    const id =
      context.userId.length > 0
        ? await saveResult({ userId: context.userId, query: args.strategy, outcome })
        : null;

    const metrics = outcome.metrics!;

    return {
      resultId: id,
      strategy: {
        name: match.strategy.name,
        entryRule: match.strategy.rules.entry,
        exitRule: match.strategy.rules.exit,
        parameters: outcome.config?.params,
      },
      assumptions: {
        symbol: outcome.config?.instrumentId,
        venue: "binance",
        timeframe: outcome.config?.timeframe,
        from: outcome.config?.startAt,
        to: outcome.config?.endAt,
        bars: outcome.barsLoaded,
        dataCoveragePct: round((outcome.coverage ?? 0) * 100, 1),
        initialCapitalUsd: outcome.config?.initialCapitalUsd,
        direction: "long_only",
        execution: "Signal on bar close, fill at the next bar's open",
        feeBps: outcome.config?.execution.feeBps,
        slippageBps: outcome.config?.execution.slippageBps,
        funding: "excluded",
      },
      performance: {
        totalReturnPct: round(metrics.totalReturnPct),
        buyAndHoldReturnPct: round(metrics.benchmarkReturnPct),
        excessReturnPct: round(metrics.excessReturnPct),
        maxDrawdownPct: round(metrics.maxDrawdownPct),
        sharpe: round(metrics.sharpe),
        sortino: round(metrics.sortino),
        cagrPct: round(metrics.cagrPct),
        trades: metrics.trades,
        winRatePct: round(metrics.winRatePct, 1),
        profitFactor: round(metrics.profitFactor),
        averageBarsHeld: round(metrics.averageBarsHeld, 1),
        exposurePct: round(metrics.exposurePct, 1),
        totalFeesUsd: round(metrics.totalFees),
      },
      quality: outcome.quality?.level,
      caveats: [...(outcome.quality?.issues ?? []), ...(outcome.warnings ?? [])],
      robustness: outcome.robustness?.findings ?? null,
      note:
        "Historical simulation on real data. Past behaviour is not a forecast. " +
        "Compare the strategy return against buy-and-hold before calling it good.",
    };
  },
};

export const backtestCompare: RegisteredTool = {
  def: {
    name: "backtest_compare",
    description:
      "Runs several strategies over ONE shared historical dataset with " +
      `identical costs and execution assumptions. Up to ${MAX_COMPARE} at a ` +
      "time. Use whenever more than one strategy is mentioned. Do NOT declare " +
      "an overall winner from a single period on a single asset — report the " +
      "rows with their drawdowns and trade counts and let the reader weigh them.",
    parameters: {
      type: "object",
      properties: {
        strategies: {
          type: "array",
          items: { type: "string" },
          description: "Strategy names — ['rsi 12', 'macd', 'bollinger'].",
        },
        symbol: { type: "string", description: "Asset. Default SOL." },
        timeframe: { type: "string", description: "Default 1h." },
        days: { type: "number", description: "Days of history. Default 365." },
        feeBps: { type: "number", description: "Fee in basis points. Default 10." },
      },
      required: ["strategies"],
    },
  },
  async execute(args) {
    if (!Array.isArray(args.strategies) || args.strategies.length === 0) {
      throw new ToolArgumentError("backtest_compare needs a `strategies` array.");
    }

    const ids: string[] = [];
    const unresolved: string[] = [];
    for (const entry of args.strategies) {
      if (typeof entry !== "string") continue;
      const match = resolveStrategy(entry);
      if (match === null) unresolved.push(entry);
      else if (!ids.includes(match.strategy.id)) ids.push(match.strategy.id);
    }

    if (ids.length === 0) {
      return { error: "None of those matched a strategy.", unresolved };
    }

    const days = typeof args.days === "number" ? args.days : 365;
    const endAt = Date.now();

    const result = await compareStrategies({
      symbol: typeof args.symbol === "string" ? args.symbol : "SOL",
      timeframe: typeof args.timeframe === "string" ? args.timeframe : "1h",
      startAt: endAt - days * 86_400_000,
      endAt,
      strategyIds: ids,
      feeBps: typeof args.feeBps === "number" ? args.feeBps : 10,
    });

    if (!result.ok) {
      return { error: result.error, note: "Report this plainly." };
    }

    return {
      assumptions: {
        ...result.assumptions,
        execution: "Signal on bar close, fill at the next bar's open",
        note: "Every row used the same candles and the same costs.",
      },
      results: result.rows.map((row) => ({
        strategy: row.strategyName,
        ok: row.ok,
        error: row.error,
        totalReturnPct: round(row.totalReturnPct),
        buyAndHoldReturnPct: round(row.benchmarkReturnPct),
        maxDrawdownPct: round(row.maxDrawdownPct),
        sharpe: round(row.sharpe),
        trades: row.trades,
        winRatePct: round(row.winRatePct, 1),
        quality: row.quality,
      })),
      unresolved,
      warnings: result.warnings,
      note:
        "One period on one asset. A strategy leading here is not the best " +
        "strategy; mention drawdown and trade count alongside return.",
    };
  },
};

export const backtestParseRequest: RegisteredTool = {
  def: {
    name: "backtest_parse_request",
    description:
      "Reads a plain-language backtest request and returns the resolved " +
      "strategies, asset, timeframe and period without running anything. Use " +
      "to confirm what a vague request means before running it.",
    parameters: {
      type: "object",
      properties: { text: { type: "string", description: "The user's words." } },
      required: ["text"],
    },
  },
  async execute(args) {
    if (typeof args.text !== "string") {
      throw new ToolArgumentError("backtest_parse_request needs `text`.");
    }

    const parsed = parseBacktestRequest(args.text);

    return {
      symbol: parsed.symbol,
      timeframe: parsed.timeframe,
      days: parsed.days,
      strategies: parsed.strategyIds.map((id) => {
        const strategy = getStrategy(id);
        return { id, name: strategy?.name ?? id };
      }),
      feeBps: parsed.feeBps ?? 10,
      /* No strategy recognised is a question, not a default. Running an
         arbitrary strategy and labelling it correctly is worse than asking. */
      note:
        parsed.strategyIds.length === 0
          ? "No strategy was recognised. Ask which one was meant rather than picking one."
          : null,
    };
  },
};

export const BACKTEST_TOOLS: RegisteredTool[] = [
  backtestListStrategies,
  backtestRun,
  backtestCompare,
  backtestParseRequest,
];
