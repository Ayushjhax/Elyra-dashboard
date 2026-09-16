import "server-only";

import type { ToolDef } from "@/lib/agent/providers/types";
import { ToolArgumentError } from "@/lib/agent/tools/args";
/* The tool modules import `RegisteredTool` from this file, but only as a
   type, so the cycle is erased at compile time and there is no runtime one. */
import { ELYRA_TOOLS } from "@/lib/agent/tools/elyra";
import { MARKET_TOOLS } from "@/lib/agent/tools/market";
import { PORTFOLIO_TOOLS } from "@/lib/agent/tools/portfolio";
import { PREDICTION_TOOLS } from "@/lib/agent/tools/prediction";

/* ---------------------------------------------------------------------------
   The tool registry.

   Defined once, in the neutral format, and adapted per provider. Nothing here
   writes: every tool reads market data or the caller's own account. There is
   no tool that places, modifies or cancels an order, and adding one would
   mean more than appending to this list — see lib/exchange/types.ts.
--------------------------------------------------------------------------- */

/**
 * What a tool knows about who is asking.
 *
 * `userId` is an internal profiles.id resolved from a verified identity. It
 * never comes from model output, a request body, or message text.
 */
export interface ToolContext {
  userId: string;
  /** The Privy wallet, for the address-keyed Hyperliquid read. */
  sessionWallet: string | null;
  /**
   * The Solana address, for wallet and DeFi reads.
   *
   * Resolved from the caller's profile, never from a tool argument — a model
   * that could pass an address could be talked into passing someone else's.
   */
  solanaAddress?: string | null;
  /**
   * The prediction-market account address.
   *
   * Distinct from `sessionWallet`: Polymarket holds positions in a proxy
   * wallet it deploys, whose address is not the EOA that controls it. Null
   * when no prediction account is linked, and that null is load-bearing —
   * it is the difference between "no positions" and "cannot see positions".
   */
  polymarketAddress?: string | null;
}

export interface RegisteredTool {
  def: ToolDef;
  execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<unknown>;
}

export const TOOLS: RegisteredTool[] = [
  ...MARKET_TOOLS,
  ...PORTFOLIO_TOOLS,
  ...ELYRA_TOOLS,
  ...PREDICTION_TOOLS,
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.def.name, tool]));

/** What goes to the provider. */
export function toolDefinitions(): ToolDef[] {
  return TOOLS.map((tool) => tool.def);
}

/** The result of one tool call, as it goes back to the model. */
export interface ToolOutcome {
  ok: boolean;
  result: unknown;
}

/**
 * Runs one tool call.
 *
 * Never throws. A tool that fails returns an error *as its result*, because
 * the model needs to see the failure to report it — the system prompt
 * requires saying a tool failed rather than filling the gap, and it cannot
 * follow that instruction if the failure is thrown away above it.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolOutcome> {
  const tool = BY_NAME.get(name);

  if (tool === undefined) {
    return {
      ok: false,
      result: {
        error: `No tool named "${name}". Available: ${[...BY_NAME.keys()].join(", ")}.`,
      },
    };
  }

  try {
    return { ok: true, result: await tool.execute(args, context) };
  } catch (error) {
    /* Argument errors are written for the model and usually produce a
       corrected call on the next iteration, so they pass through verbatim. */
    if (error instanceof ToolArgumentError) {
      return { ok: false, result: { error: error.message } };
    }

    return {
      ok: false,
      result: {
        error: error instanceof Error ? error.message : "Tool failed",
        /* Stated plainly so the model does not present a gap as a finding. */
        note: "This data could not be retrieved. Say so rather than estimating it.",
      },
    };
  }
}
