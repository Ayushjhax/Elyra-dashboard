import "server-only";

import type { AgentAuth, AgentScope } from "@/lib/agentApi/keys";
import { executeTool, toolDefinitions, type ToolContext } from "@/lib/agent/tools/registry";
import type { ToolDef } from "@/lib/agent/providers/types";
import { fundToolsFor, isFundTool, runFundTool } from "@/lib/funds/tools";
import { predictionAccount } from "@/lib/prediction/account";
import { activeMandate, isRailsTool, railsToolsFor, runRailsTool } from "@/lib/rails/tools";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Which of Elyra's own tools an outside agent may call.

   An allowlist, not a blocklist: a tool added to the assistant later is not
   exposed to outside agents until someone decides it should be and lists it
   here. Nothing listed places, changes or cancels anything.

   The exceptions are the rails (lib/rails/tools.ts): tools that PROPOSE a
   transaction for the key's owner to approve, offered only to a key whose
   owner granted it a mandate, and held to that mandate; and an AI fund's
   tools (lib/funds/tools.ts), offered only to the key that manages it, and
   held to its charter.

   `market` tools read public data and run with no account at all — so the
   two that would otherwise save a record (a prediction signal, a backtest
   result) save nothing. `account` tools read the key owner's own portfolio,
   positions and history, and only for a key created with that scope. The
   addresses they read are resolved from the owner's profile, never from an
   argument, exactly as for the built-in assistant.
--------------------------------------------------------------------------- */

const MARKET = [
  "get_market_snapshot",
  "get_ohlcv_summary",
  "get_funding_rate",
  "get_open_interest",
  "perp_market",
  "token_prices",
  "defi_pools",
  "prediction_markets",
  "prediction_search_markets",
  "prediction_search_events",
  "prediction_get_trending",
  "prediction_get_market",
  "prediction_get_event",
  "prediction_get_orderbook",
  "prediction_get_market_history",
  "prediction_get_live_state",
  "prediction_get_orderbook_analytics",
  "prediction_get_probability_basket",
  "prediction_estimate_execution",
  "prediction_get_exit_liquidity",
  "prediction_get_signal",
  "prediction_list_strategies",
  "prediction_backtest_signal",
  "company_research",
  "backtest_list_strategies",
  "backtest_parse_request",
  "backtest_run",
  "backtest_compare",
  "data_source_health",
] as const;

const ACCOUNT = [
  "get_portfolio_summary",
  "get_positions",
  "get_watchlist",
  "portfolio_overview",
  "portfolio_holdings",
  "portfolio_risk",
  "defi_positions",
  "open_orders",
  "recent_activity",
  "prediction_get_positions",
  "prediction_get_position",
  "prediction_get_portfolio_summary",
  "prediction_get_exposure",
  "prediction_get_expiring_positions",
  "prediction_get_activity",
  "prediction_get_open_orders",
  "prediction_get_signal_history",
  "prediction_list_alerts",
] as const;

export const TOOL_SCOPE: ReadonlyMap<string, AgentScope> = new Map<string, AgentScope>([
  ...MARKET.map((name) => [name, "market"] as [string, AgentScope]),
  ...ACCOUNT.map((name) => [name, "account"] as [string, AgentScope]),
]);

export interface AgentTool extends ToolDef {
  /**
   * "rails": a tool that proposes a transaction, granted by a mandate rather
   * than a key scope. "fund": a tool of the AI fund the key manages.
   */
  scope: AgentScope | "rails" | "fund";
}

/** The read tools a key's scopes allow, in the registry's order. */
export function agentTools(scopes: readonly AgentScope[]): AgentTool[] {
  return toolDefinitions().flatMap((def) => {
    const scope = TOOL_SCOPE.get(def.name);
    return scope !== undefined && scopes.includes(scope) ? [{ ...def, scope }] : [];
  });
}

/**
 * Everything a key may see: its read tools, then — only when its owner has
 * granted it a live mandate — the rails tools that mandate allows
 * (lib/rails/tools.ts), then — only while it manages an open AI fund — that
 * fund's tools (lib/funds/tools.ts).
 */
export async function agentToolsFor(auth: AgentAuth): Promise<AgentTool[]> {
  const [mandate, fundDefs] = await Promise.all([activeMandate(auth), fundToolsFor(auth)]);
  const rails = railsToolsFor(mandate).map((def) => ({ ...def, scope: "rails" as const }));
  const fund = fundDefs.map((def) => ({ ...def, scope: "fund" as const }));
  return [...agentTools(auth.scopes), ...rails, ...fund];
}

export type AgentToolOutcome =
  | { kind: "ok"; result: unknown }
  | { kind: "tool-error"; result: unknown }
  | { kind: "unknown" }
  | { kind: "forbidden"; scope: AgentScope }
  /** A rails tool the key's mandate does not grant, a key with no mandate, or a fund tool for a key that manages no fund. */
  | { kind: "denied"; reason: string };

async function accountContext(userId: string): Promise<ToolContext> {
  const { data } = await serviceClient().from("profiles").select("wallet_address, solana_address").eq("id", userId).maybeSingle();
  const profile = (data ?? null) as { wallet_address: string | null; solana_address: string | null } | null;
  return {
    userId,
    sessionWallet: profile?.wallet_address ?? null,
    solanaAddress: profile?.solana_address ?? null,
    polymarketAddress: (await predictionAccount(userId).catch(() => null))?.address ?? null,
  };
}

/** No account: nothing is read from, or saved to, anyone's records. */
const ANONYMOUS: ToolContext = { userId: "", sessionWallet: null, solanaAddress: null, polymarketAddress: null };

export async function runAgentTool(name: string, args: Record<string, unknown>, auth: AgentAuth): Promise<AgentToolOutcome> {
  if (isRailsTool(name)) {
    const outcome = await runRailsTool(name, args, auth);
    return outcome.kind === "forbidden" ? { kind: "denied", reason: outcome.reason } : outcome;
  }
  if (isFundTool(name)) {
    const outcome = await runFundTool(name, args, auth);
    return outcome.kind === "forbidden" ? { kind: "denied", reason: outcome.reason } : outcome;
  }
  const scope = TOOL_SCOPE.get(name);
  if (scope === undefined || !toolDefinitions().some((def) => def.name === name)) return { kind: "unknown" };
  if (!auth.scopes.includes(scope)) return { kind: "forbidden", scope };
  const context = scope === "account" ? await accountContext(auth.userId) : ANONYMOUS;
  const outcome = await executeTool(name, args, context);
  return outcome.ok ? { kind: "ok", result: outcome.result } : { kind: "tool-error", result: outcome.result };
}
