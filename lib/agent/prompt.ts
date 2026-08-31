import "server-only";

import type { SystemPrompt } from "@/lib/agent/providers/types";
import type { ToolContext } from "@/lib/agent/tools/registry";
import { getPortfolio, summarise } from "@/lib/exchange/portfolio";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   The system prompt.

   Split in two, and the split is load-bearing. `STABLE` is byte-identical on
   every run, so it caches; the user context is rebuilt per run and goes after
   it. Interleaving them — a position size inside the rules, say — would
   invalidate the cache on every single request.

   The rules below restate docs/ELYRA_BRAND.md §6 in the second person. That
   document is the source of truth for product voice, and an agent that reads
   as a different product from the panel it answers in is a bug.
--------------------------------------------------------------------------- */

const STABLE = `You are Elyra, the agent inside an operator's crypto trading terminal.

You read market data and the operator's own account, and you write analysis.
You have no ability to place, modify, or cancel an order, and no tool that
could. If asked to trade, say plainly that you cannot and describe what you
observe instead.

## How you answer

State what has happened, not what will happen. "SOL reclaimed the 4H range
high at 181.40 earlier today" is an observation. "SOL is going to run" is not
something you say. Where a setup is forming, name it as forming and name what
would invalidate it.

Cite the numbers you pulled. Every price, funding rate, open interest figure
and position size in your reply must have come from a tool call in this
conversation. You do not know the current price of anything from memory, and a
number you recall rather than fetch is wrong often enough to be worthless.
When you state a figure, it should be traceable to a tool result.

If a tool fails, returns nothing, or returns data older than you would like,
say so in the reply. Tool results carry \`fetchedAt\`, \`servedFromCache\`, and
sometimes \`unavailable\` or \`unreadable\` lists — read them. An answer that
quietly omits the venue that failed reads as complete and is not. Never
estimate a number you could not retrieve.

Give no financial advice. Do not recommend a position size, do not tell the
operator what to buy or sell, and do not use "you should". You describe; they
decide. Explaining what funding at -0.03% per 8h means for a long is analysis.
Telling someone to close that long is not yours to say.

Keep replies under 200 words. Lead with the answer, then the evidence. If the
operator asks for a full report or a deep dive, go longer — but the default is
short, and padding a thin answer to look thorough is worse than a thin answer.

Be precise and quiet. Never enthusiastic about money. No emoji. No
exclamations. No apologies — if something failed, state the cause.

## Using tools

Batch your calls. \`get_market_snapshot\` takes an array and makes one upstream
request, so ask for every symbol you need at once rather than calling it
repeatedly.

Prefer \`get_ohlcv_summary\` over reasoning about raw candles. It returns
computed SMA, RSI, ATR and volume ratios that are exact; arithmetic you do
yourself over a candle list is not.

Funding rates are percent per funding interval, and the interval differs by
venue — 8h on Binance and OKX, 1h on Hyperliquid. Check \`intervalHours\` before
comparing two venues or annualising anything.

An indicator that is \`null\` means there was not enough history to compute it
honestly. Report it as unavailable; do not approximate it from what is there.

Portfolio tools are already scoped to the operator asking. There is no user
parameter and you never need one.`;

/* ------------------------------------------------------------------------- */

const currency = (value: number) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

/**
 * The per-run context block.
 *
 * Rebuilt on every run so the agent starts from the operator's current state
 * rather than asking three tools for what it could have been told. It is
 * best-effort: a portfolio read that fails degrades to a line saying so,
 * because a run that answers "what is SOL doing" must not fail because an
 * exchange key expired.
 */
export async function buildUserContext(
  context: ToolContext,
): Promise<string> {
  const lines: string[] = ["## Current operator context", ""];

  const [watchlist, portfolio] = await Promise.allSettled([
    serviceClient()
      .from("watchlist")
      .select("symbol")
      .eq("user_id", context.userId)
      .order("added_at", { ascending: true }),
    getPortfolio(context.userId, context.sessionWallet),
  ]);

  if (watchlist.status === "fulfilled" && !watchlist.value.error) {
    const symbols = (watchlist.value.data ?? []).map((row) => row.symbol);
    lines.push(
      symbols.length > 0
        ? `Watchlist: ${symbols.join(", ")}`
        : "Watchlist: empty.",
    );
  } else {
    lines.push("Watchlist: could not be read this run.");
  }

  lines.push("");

  if (portfolio.status !== "fulfilled") {
    lines.push(
      "Positions and equity: could not be read this run. Say so if asked " +
        "about the account, and do not estimate.",
    );
    return lines.join("\n");
  }

  const summary = summarise(portfolio.value);

  if (summary.venues.length === 0) {
    lines.push(
      "No exchange is connected, so there are no positions and no equity to " +
        "report. If asked about the account, say it is not connected rather " +
        "than that it is empty — those are different answers.",
    );
  } else {
    lines.push(
      `Equity: ${currency(summary.equity)} across ${summary.venues.join(", ")}`,
      `Unrealised PnL: ${currency(summary.totalUnrealizedPnl)}`,
      `Gross exposure: ${currency(summary.grossExposure)} · Net: ${currency(summary.netExposure)}`,
      "",
    );

    if (portfolio.value.positions.length === 0) {
      lines.push("Open positions: none.");
    } else {
      lines.push(`Open positions (${portfolio.value.positions.length}):`);
      /* Ten is enough to ground a reply. The agent calls get_positions when
         it needs the rest, and a long list here would push the cached prefix
         further from the model's attention for no gain. */
      for (const position of portfolio.value.positions.slice(0, 10)) {
        const pnl =
          position.unrealizedPnl === null
            ? ""
            : ` · PnL ${currency(position.unrealizedPnl)}`;
        lines.push(
          `- ${position.label} ${position.side} ${position.size} @ ` +
            `${position.markPrice} (${currency(position.notional)})${pnl}`,
        );
      }
      if (portfolio.value.positions.length > 10) {
        lines.push(
          `- ...and ${portfolio.value.positions.length - 10} more; call get_positions for the full list.`,
        );
      }
    }
  }

  if (summary.failures.length > 0) {
    lines.push(
      "",
      "Could not be read this run — mention this if you describe the account:",
    );
    for (const failure of summary.failures) {
      lines.push(`- ${failure.scope}: ${failure.reason}`);
    }
  }

  return lines.join("\n");
}

export async function buildSystemPrompt(
  context: ToolContext,
): Promise<SystemPrompt> {
  return { stable: STABLE, volatile: await buildUserContext(context) };
}

/** The canned prompt behind Telegram's /report. */
export function reportPrompt(symbol: string | null): string {
  if (symbol === null) {
    return (
      "Give me a short report on my account: equity, how the open positions " +
      "are doing, and anything in the market data behind them worth noting " +
      "right now. Pull the numbers."
    );
  }

  return (
    `Give me a short report on ${symbol}: where price is against its recent ` +
    `range, what funding and open interest are doing, and whether I have any ` +
    `exposure to it. Pull the numbers.`
  );
}

/** Exported for the prompt tests. */
export const STABLE_SYSTEM_PROMPT = STABLE;
