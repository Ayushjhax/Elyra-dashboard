import { NextResponse } from "next/server";
import { agentCaller, NO_STORE, originAllowed } from "@/lib/agentApi/http";
import { claimCall } from "@/lib/agentApi/keys";
import { ERROR, PROTOCOL_VERSIONS, handleMessage, rpcError, type JsonRpcResponse } from "@/lib/agentApi/mcp";

/* ---------------------------------------------------------------------------
   Elyra's MCP endpoint (Streamable HTTP, stateless, tools only).

     claude mcp add --transport http elyra https://api.getelyra.xyz/api/mcp \
       --header "Authorization: Bearer elyra_ak_…"

   POST carries one JSON-RPC message (or, for 2025-03-26 clients, a batch)
   and is answered with one JSON body; a notification gets 202 and no body.
   GET would open a server-to-client stream, which this server does not
   offer, so it is 405 — as the transport spec allows. The JSON-RPC handling
   is lib/agentApi/mcp.ts; the key and its limits are lib/agentApi/keys.ts.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A backtest or a filings report can take a while; most calls take well under a second. */
export const maxDuration = 60;

/** Requests are a method and a few arguments; anything larger is not one. */
const MAX_BODY_BYTES = 64 * 1024;

const json = (body: JsonRpcResponse | JsonRpcResponse[], status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(request: Request): Promise<Response> {
  if (!originAllowed(request)) return json(rpcError(null, ERROR.invalidRequest, "Origin not allowed."), 403);

  const version = request.headers.get("mcp-protocol-version");
  if (version !== null && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
    return json(rpcError(null, ERROR.invalidRequest, `Unsupported MCP-Protocol-Version: ${version}`, { supported: PROTOCOL_VERSIONS }), 400);
  }

  const caller = await agentCaller(request);
  if ("response" in caller) return caller.response;

  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY_BYTES) return json(rpcError(null, ERROR.invalidRequest, "Request body too large."), 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(rpcError(null, ERROR.parse, "Parse error: the body is not JSON."), 400);
  }

  const claim = () => claimCall(caller.auth);
  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > 20) return json(rpcError(null, ERROR.invalidRequest, "A batch holds 1 to 20 messages."), 400);
    const responses: JsonRpcResponse[] = [];
    for (const message of body) {
      const response = await handleMessage(message, caller.auth, claim);
      if (response !== null) responses.push(response);
    }
    return responses.length === 0 ? new Response(null, { status: 202, headers: NO_STORE }) : json(responses);
  }

  const response = await handleMessage(body, caller.auth, claim);
  if (response === null) return new Response(null, { status: 202, headers: NO_STORE });
  return json(response);
}

/** No server-to-client stream here. */
export function GET(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST", ...NO_STORE } });
}

/** No sessions to end. */
export function DELETE(): Response {
  return new Response(null, { status: 405, headers: { allow: "POST", ...NO_STORE } });
}
