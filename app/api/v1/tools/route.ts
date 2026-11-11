import { NextResponse } from "next/server";
import { agentCaller, NO_STORE } from "@/lib/agentApi/http";
import { agentTools } from "@/lib/agentApi/tools";

/* ---------------------------------------------------------------------------
   The agent API's REST mirror, for agents and scripts that do not speak MCP:
   the same tools, the same key, the same limits. This lists what the key may
   call; POST /api/v1/tools/{name} calls one.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const caller = await agentCaller(request);
  if ("response" in caller) return caller.response;
  return NextResponse.json(
    {
      scopes: caller.auth.scopes,
      tools: agentTools(caller.auth.scopes).map((tool) => ({
        name: tool.name,
        scope: tool.scope,
        description: tool.description,
        inputSchema: tool.parameters,
      })),
    },
    { headers: NO_STORE },
  );
}
