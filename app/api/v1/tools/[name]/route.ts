import { NextResponse } from "next/server";
import { agentCaller, NO_STORE } from "@/lib/agentApi/http";
import { claimCall } from "@/lib/agentApi/keys";
import { runAgentTool } from "@/lib/agentApi/tools";

/* ---------------------------------------------------------------------------
   Calls one tool. The body is the tool's arguments as a JSON object.

     200 { ok: true,  result }   the tool ran
     200 { ok: false, result }   the tool ran and its source failed — `result.error` says why
     403  the key lacks the scope   404  no such tool   429  over a limit
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Context {
  params: Promise<{ name: string }>;
}

export async function POST(request: Request, context: Context): Promise<Response> {
  const caller = await agentCaller(request);
  if ("response" in caller) return caller.response;
  const { name } = await context.params;

  const text = await request.text().catch(() => "");
  if (text.length > 64 * 1024) return NextResponse.json({ error: "Request body too large." }, { status: 413, headers: NO_STORE });
  let args: unknown = {};
  if (text.trim().length > 0) {
    try {
      args = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "The body must be a JSON object of the tool's arguments." }, { status: 400, headers: NO_STORE });
    }
  }
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return NextResponse.json({ error: "The body must be a JSON object of the tool's arguments." }, { status: 400, headers: NO_STORE });
  }

  const refused = await claimCall(caller.auth);
  if (refused !== null) return NextResponse.json({ error: refused }, { status: 429, headers: { ...NO_STORE, "retry-after": "60" } });

  const outcome = await runAgentTool(name, args as Record<string, unknown>, caller.auth);
  switch (outcome.kind) {
    case "unknown":
      return NextResponse.json({ error: `No tool named ${name}. GET /api/v1/tools lists them.` }, { status: 404, headers: NO_STORE });
    case "forbidden":
      return NextResponse.json(
        { error: `${name} reads the key owner's account; this key was created without account access.` },
        { status: 403, headers: NO_STORE },
      );
    default:
      return NextResponse.json({ ok: outcome.kind === "ok", result: outcome.result }, { headers: NO_STORE });
  }
}
