import { NextResponse } from "next/server";
import { isMemoryType, listMemories, saveMemory } from "@/lib/personalized/memory";
import { resolve, resolveWritable } from "@/lib/personalized/session";

/* ---------------------------------------------------------------------------
   Saved preferences.

   Every query is scoped by the verified user id — see lib/personalized/session.
   A userId in the body is not read, and there is no code path that would read
   one: `resolveWritable` returns the id it verified and nothing else is in
   scope here.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolved = await resolve(request);
  if ("response" in resolved) return resolved.response;

  const { userId } = resolved.session;
  if (userId === null) return NextResponse.json({ memories: [] });

  return NextResponse.json({ memories: await listMemories(userId) });
}

export async function POST(request: Request) {
  const resolved = await resolveWritable(request, "Saving a preference");
  if ("response" in resolved) return resolved.response;

  let body: { type?: unknown; value?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (!isMemoryType(body.type)) {
    return NextResponse.json({ error: "Unknown preference type." }, { status: 400 });
  }

  const saved = await saveMemory(resolved.session.userId, {
    type: body.type,
    value: body.value,
  });

  if (saved.error !== null) {
    return NextResponse.json({ error: saved.error }, { status: 400 });
  }

  return NextResponse.json({ memory: saved.memory });
}
