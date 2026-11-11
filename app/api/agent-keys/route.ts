import { NextResponse } from "next/server";
import { AgentKeyError, createAgentKey, listAgentKeys } from "@/lib/agentApi/keys";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";

/* ---------------------------------------------------------------------------
   The signed-in person's agent keys: list them, or create one. A new key is
   returned once, in full, in the creation response, and never again — only
   its hash is stored. The account is always the session's, never the body's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };

async function owner(request: Request): Promise<{ userId: string } | { response: Response }> {
  const user = await getSessionUser(request);
  if (user === null) return { response: NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE }) };
  if (!hasProfile(user)) return { response: NextResponse.json({ error: databaseUnavailableMessage("Agent keys") }, { status: 503, headers: NO_STORE }) };
  return { userId: user.userId };
}

function failure(error: unknown): Response {
  if (error instanceof AgentKeyError) return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
  return NextResponse.json({ error: "That could not be done right now." }, { status: 500, headers: NO_STORE });
}

export async function GET(request: Request): Promise<Response> {
  const resolved = await owner(request);
  if ("response" in resolved) return resolved.response;
  try {
    return NextResponse.json({ keys: await listAgentKeys(resolved.userId) }, { headers: NO_STORE });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  const resolved = await owner(request);
  if ("response" in resolved) return resolved.response;
  const body = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  try {
    const created = await createAgentKey(resolved.userId, body);
    return NextResponse.json({ key: created.key, created: created.view }, { status: 201, headers: NO_STORE });
  } catch (error) {
    return failure(error);
  }
}

