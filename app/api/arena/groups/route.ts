import { NextResponse } from "next/server";
import { createGroup, joinGroup } from "@/lib/arena/server";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* Creates a group (with an invite code) or joins one by its code. Groups decide who sees shared calls. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  try {
    const body = await jsonBody(request);
    if (body.action === "join") await joinGroup(resolved.userId, body.code);
    else await createGroup(resolved.userId, body.name);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return arenaFailure(error);
  }
}
