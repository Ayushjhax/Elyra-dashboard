import "server-only";

import type { AgentAuth } from "@/lib/agentApi/keys";
import { agentToolsFor, runAgentTool, type AgentTool } from "@/lib/agentApi/tools";
import { fundToolReads } from "@/lib/funds/tools";

/* ---------------------------------------------------------------------------
   Elyra as an MCP server: the JSON-RPC half, separate from HTTP.

   Stateless, tools only. There are no sessions, no server-initiated messages
   and no SSE: each request is answered with one JSON object, which the
   Streamable HTTP transport allows (spec 2025-11-25, basic/transports). The
   route (app/api/mcp/route.ts) does the transport rules — Origin, the
   protocol-version header, 202 for notifications — and the key check.

   Errors follow the spec's split: a malformed request or an unknown tool is a
   JSON-RPC error; a tool that ran and failed is a result with `isError`, so
   the calling model can read why and correct itself.
--------------------------------------------------------------------------- */

/** Newest first. The first is offered when a client asks for one not listed. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_VERSION = "1.0.0";

export const INSTRUCTIONS = [
  "Elyra's live market context: crypto, US and Asian equities, FX and metals prices from Pyth; perpetual funding and open interest;",
  "Polymarket prediction markets and order books; Solana DeFi pools; SEC-filing company research; and strategy backtests.",
  "With an account-scoped key, also the key owner's own portfolio, positions, orders and activity across their connected venues.",
  "The market and account tools only read.",
  "When the key's owner has granted it a mandate, the rails_ tools let it ASK for transactions: swaps and USDC payments the owner signs in their own wallet,",
  "Hyperliquid perp orders, and USDC payment requests to be paid. Each ask is held to the mandate, recorded in the owner's ledger and answered with a receipt;",
  "call rails_mandate first to see what is allowed. Elyra holds no wallet key and nothing moves without the owner's signature, except perp orders a mandate lets run.",
  "When the key manages one of the owner's AI funds, the fund_ tools run it: fund_overview gives the owner's brief, the charter and the book marked to market;",
  "fund_open_position and fund_close_position trade Hyperliquid perps for the fund, held to its charter, with every decision recorded in the owner's ledger;",
  "fund_write_note keeps the fund's journal. Elyra halts the fund at its drawdown limit, and capital, the charter and paper or live are the owner's alone.",
  "When a tool returns an error, say the data could not be retrieved rather than estimating it.",
].join(" ");

export const ERROR = {
  parse: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internal: -32603,
} as const;

type Id = string | number | null;

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export const rpcError = (id: Id, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: data === undefined ? { code, message } : { code, message, data },
});

const rpcResult = (id: Id, result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** "get_market_snapshot" → "Get market snapshot", for clients that show a title. */
function title(name: string): string {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function mcpTool(tool: AgentTool) {
  const rails = tool.scope === "rails";
  const fund = tool.scope === "fund";
  /* A rails or fund tool that only reads is still read-only. */
  const reads = fund
    ? fundToolReads(tool.name)
    : !rails || /^rails_(mandate|intent_status|list_intents|payment_request_status)$/.test(tool.name);
  return {
    name: tool.name,
    title: title(tool.name),
    description:
      tool.scope === "account"
        ? `${tool.description} (Reads the key owner's own account.)`
        : rails && !reads
          ? `${tool.description} (Asks the key owner; held to their mandate and recorded in their ledger.)`
          : fund && !reads
            ? `${tool.description} (Acts for the fund this key manages; held to its charter and recorded in the owner's ledger.)`
            : tool.description,
    inputSchema: tool.parameters,
    annotations: { title: title(tool.name), readOnlyHint: reads, destructiveHint: false, idempotentHint: reads, openWorldHint: true },
  };
}

/** Text a model can read: the result as indented JSON. */
const asText = (value: unknown) => JSON.stringify(value, null, 2);

/** A JSON-RPC request (it has an id) or a notification (it has none). */
export function isRequest(message: Record<string, unknown>): boolean {
  return "id" in message && (typeof message.id === "string" || typeof message.id === "number");
}

/**
 * Handles one JSON-RPC message. Returns the response for a request, and null
 * for a notification or a client's response, which get no body.
 */
export async function handleMessage(
  message: unknown,
  auth: AgentAuth,
  /** Counts one tool call against the key's limits; returns why it is refused, or null. */
  claim: () => Promise<string | null> = async () => null,
): Promise<JsonRpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0") return rpcError(null, ERROR.invalidRequest, "Not a JSON-RPC 2.0 message.");
  if (!isRequest(message)) {
    /* notifications/initialized, notifications/cancelled, or a response to a
       server request this server never makes: accepted and ignored. */
    return null;
  }
  const id = message.id as string | number;
  if (typeof message.method !== "string") return rpcError(id, ERROR.invalidRequest, "A request needs a method.");
  const params = isObject(message.params) ? message.params : {};

  switch (message.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "elyra",
          title: "Elyra",
          version: SERVER_VERSION,
          description: "Live market and portfolio context for AI agents, and permissioned rails for the transactions they ask for.",
          websiteUrl: "https://getelyra.xyz",
        },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      /* Under 50 tools: one page, so no cursor. */
      return rpcResult(id, { tools: (await agentToolsFor(auth)).map(mcpTool) });
    case "tools/call": {
      if (typeof params.name !== "string") return rpcError(id, ERROR.invalidParams, "tools/call needs a tool `name`.");
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!isObject(args)) return rpcError(id, ERROR.invalidParams, "`arguments` must be an object.");
      /* Every call counts, a misspelt one included, so probing is not free. */
      const refused = await claim();
      if (refused !== null) return rpcResult(id, { content: [{ type: "text", text: refused }], isError: true });
      const outcome = await runAgentTool(params.name, args, auth);
      if (outcome.kind === "unknown") return rpcError(id, ERROR.invalidParams, `Unknown tool: ${params.name}`);
      if (outcome.kind === "denied") return rpcResult(id, { content: [{ type: "text", text: outcome.reason }], isError: true });
      if (outcome.kind === "forbidden") {
        return rpcResult(id, {
          content: [{ type: "text", text: `${params.name} reads the key owner's account. This key was created without account access; create one with it in Elyra → Connections.` }],
          isError: true,
        });
      }
      const structured = isObject(outcome.result) ? outcome.result : { value: outcome.result };
      return rpcResult(id, {
        content: [{ type: "text", text: asText(outcome.result) }],
        structuredContent: structured,
        isError: outcome.kind === "tool-error",
      });
    }
    default:
      return rpcError(id, ERROR.methodNotFound, `Method not found: ${message.method}`);
  }
}
