import "server-only";

import type { RegisteredTool } from "@/lib/agent/tools/registry";
import { getPortfolio, summarise } from "@/lib/exchange/portfolio";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Portfolio tools. All read-only, all implicitly scoped to the caller.

   None of these takes a user identifier. The model never sees one and cannot
   supply one: `userId` comes from the ToolContext, which the agent loop fills
   from a verified session (web) or a telegram_links lookup (Telegram). A tool
   that accepted a user id as a parameter would let a crafted message read
   another user's positions, so the parameter simply does not exist.
--------------------------------------------------------------------------- */

export const getPositions: RegisteredTool = {
  def: {
    name: "get_positions",
    description:
      "The caller's open perp and spot positions across every connected " +
      "exchange, with entry, mark, size, liquidation price, unrealised PnL " +
      "and notional. Spot rows carry no entry price or PnL — the venue " +
      "reports holdings, not cost basis. Check `unreadable`: a venue listed " +
      "there could not be read, so the list is incomplete.",
    parameters: { type: "object", properties: {} },
  },

  async execute(_args, context) {
    const portfolio = await getPortfolio(context.userId, context.sessionWallet);

    return {
      fetchedAt: new Date().toISOString(),
      positions: portfolio.positions,
      positionCount: portfolio.positions.length,
      unreadable: portfolio.failures,
    };
  },
};

export const getWatchlist: RegisteredTool = {
  def: {
    name: "get_watchlist",
    description: "The symbols the caller is tracking.",
    parameters: { type: "object", properties: {} },
  },

  async execute(_args, context) {
    /* Scoped by user_id in the query itself — the service-role client
       bypasses RLS and nothing else will catch a missing filter. */
    const { data, error } = await serviceClient()
      .from("watchlist")
      .select("symbol, added_at")
      .eq("user_id", context.userId)
      .order("added_at", { ascending: true });

    if (error) throw error;

    return {
      fetchedAt: new Date().toISOString(),
      symbols: (data ?? []).map((row) => row.symbol),
    };
  },
};

export const getPortfolioSummary: RegisteredTool = {
  def: {
    name: "get_portfolio_summary",
    description:
      "Account equity, total unrealised PnL, gross and net exposure, and the " +
      "largest position with its share of equity. Net exposure is longs minus " +
      "shorts; gross is the absolute total. Check `unreadable` before " +
      "describing the total as complete.",
    parameters: { type: "object", properties: {} },
  },

  async execute(_args, context) {
    const portfolio = await getPortfolio(context.userId, context.sessionWallet);
    const summary = summarise(portfolio);

    return {
      fetchedAt: new Date().toISOString(),
      ...summary,
      unreadable: summary.failures,
    };
  },
};

export const PORTFOLIO_TOOLS = [
  getPositions,
  getWatchlist,
  getPortfolioSummary,
];
