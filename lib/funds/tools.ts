import "server-only";

import type { ToolDef } from "@/lib/agent/providers/types";
import type { AgentAuth } from "@/lib/agentApi/keys";
import { closeFundPosition, fundOverview, openFundPosition, writeFundNote } from "@/lib/funds/manager";
import { fundForKey } from "@/lib/funds/store";

/* ---------------------------------------------------------------------------
   The fund, as tools its AI manager calls over MCP or REST.

   Listed only to a key that manages an open fund (its owner assigns it in
   Elyra → Funds), so an agent sees exactly the fund it runs and nothing
   else. They act only on that fund: no tool takes a fund id, and none can
   move capital, change the charter or choose paper or live — those are the
   owner's.
--------------------------------------------------------------------------- */

interface FundTool {
  def: ToolDef;
  reads: boolean;
  run(args: Record<string, unknown>, auth: AgentAuth): Promise<{ ok: boolean; result: unknown }>;
}

const asTool = <T>(outcome: { ok: true; value: T } | { ok: false; error: string }) =>
  outcome.ok ? { ok: true, result: outcome.value } : { ok: false, result: { error: outcome.error } };

export const FUND_TOOLS: FundTool[] = [
  {
    reads: true,
    def: {
      name: "fund_overview",
      description:
        "The AI fund this key manages: the owner's brief, the charter (markets, shorts, largest position as % of NAV, gross exposure, leverage, open positions, the drawdown at which Elyra halts it, the daily loss limit), the book marked to market now (NAV, cash, NAV per unit, high-water mark, drawdown, today's change, exposure, free margin), every open position with its unrealised result, recent closed trades, whether a new position may open and the largest one allowed. Call it before every decision.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    run: async (_args, auth) => asTool(await fundOverview(auth)),
  },
  {
    reads: false,
    def: {
      name: "fund_open_position",
      description:
        "Open a long or short at the market for the fund, on one of its charter's Hyperliquid perps, with a take-profit and stop-loss in percent from the fill. Held to the charter, Elyra's trading limits ($12–$5,000 a position, 1–5x, isolated) and the owner's account limits; paper or live is the fund's, not yours. Returns opened, refused (with every reason) or failed, and a receipt — the ledger hash of the decision.",
      parameters: {
        type: "object",
        properties: {
          coin: { type: "string", description: "Market, e.g. BTC, kPEPE or xyz:NVDA — one of the charter's." },
          side: { type: "string", enum: ["long", "short"] },
          sizeUsd: { type: "number", description: "Notional in USD. fund_overview gives the largest allowed now." },
          leverage: { type: "number", description: "Whole number, 1 to the charter's maximum." },
          takeProfitPct: { type: "number", description: "Take-profit, percent from the fill (0.3–50)." },
          stopLossPct: { type: "number", description: "Stop-loss, percent from the fill (0.3–25)." },
          thesis: { type: "string", description: "Why, for the fund's journal (at most 2,000 characters). Shown to the owner as your words; never acted on." },
        },
        required: ["coin", "side", "sizeUsd", "leverage", "takeProfitPct", "stopLossPct"],
      },
    },
    run: async (args, auth) => asTool(await openFundPosition(auth, args)),
  },
  {
    reads: false,
    def: {
      name: "fund_close_position",
      description: "Close one of the fund's open positions now, by its positionId from fund_overview. Returns the exit price, the result after fees and a receipt.",
      parameters: {
        type: "object",
        properties: {
          positionId: { type: "string" },
          reason: { type: "string", description: "Why, for the fund's journal. Shown to the owner as your words." },
        },
        required: ["positionId"],
      },
    },
    run: async (args, auth) => asTool(await closeFundPosition(auth, args)),
  },
  {
    reads: false,
    def: {
      name: "fund_write_note",
      description: "Add to the fund's journal: your market view, a change of plan, a review of a trade. The owner reads it in Elyra as your words; it is never acted on. At most 2,000 characters.",
      parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
    },
    run: async (args, auth) => asTool(await writeFundNote(auth, args)),
  },
];

const BY_NAME = new Map(FUND_TOOLS.map((tool) => [tool.def.name, tool]));

export const isFundTool = (name: string): boolean => BY_NAME.has(name);

/** Whether a fund tool only reads. */
export const fundToolReads = (name: string): boolean => BY_NAME.get(name)?.reads === true;

/** The fund tools a key may see: all of them while it manages an open fund, else none. */
export async function fundToolsFor(auth: AgentAuth): Promise<ToolDef[]> {
  const fund = await fundForKey(auth.userId, auth.keyId).catch(() => null);
  return fund === null ? [] : FUND_TOOLS.map((tool) => tool.def);
}

export type FundToolOutcome = { kind: "ok" | "tool-error"; result: unknown } | { kind: "forbidden"; reason: string };

export async function runFundTool(name: string, args: Record<string, unknown>, auth: AgentAuth): Promise<FundToolOutcome> {
  const tool = BY_NAME.get(name);
  if (tool === undefined) return { kind: "forbidden", reason: `No fund tool named ${name}.` };
  const fund = await fundForKey(auth.userId, auth.keyId).catch(() => null);
  if (fund === null) return { kind: "forbidden", reason: "This key manages no open fund. Its owner assigns it one in Elyra → Funds." };
  const outcome = await tool.run(args, auth).catch(() => ({ ok: false, result: { error: "That could not be completed just now." } }));
  return { kind: outcome.ok ? "ok" : "tool-error", result: outcome.result };
}
