import { NextResponse } from "next/server";
import { AgentKeyError, revokeAgentKey } from "@/lib/agentApi/keys";
import { databaseUnavailableMessage, getSessionUser, hasProfile } from "@/lib/auth/session";

/* Revokes one of the signed-in person's agent keys. It stops working at once; the row stays for its history. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "cache-control": "no-store" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Context {
  params: Promise<{ id: string }>;
}

export async function DELETE(request: Request, context: Context): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  if (!hasProfile(user)) return NextResponse.json({ error: databaseUnavailableMessage("Agent keys") }, { status: 503, headers: NO_STORE });
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such key." }, { status: 404, headers: NO_STORE });
  try {
    await revokeAgentKey(user.userId, id);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof AgentKeyError) return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
    return NextResponse.json({ error: "That could not be done right now." }, { status: 500, headers: NO_STORE });
  }
}
