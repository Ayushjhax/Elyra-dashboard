import { NextResponse } from "next/server";
import { backCall } from "@/lib/arena/server";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* Tail or fade a call with points from this week's budget. Points only: nothing can be bought. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Context {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: Context): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return NextResponse.json({ error: "No such call." }, { status: 404 });
  try {
    await backCall(resolved.userId, id, await jsonBody(request), Date.now());
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return arenaFailure(error);
  }
}
