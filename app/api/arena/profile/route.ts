import { NextResponse } from "next/server";
import { setProfile } from "@/lib/arena/server";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* Sets the person's Arena handle and whether they are public. Private unless they say otherwise. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  try {
    await setProfile(resolved.userId, await jsonBody(request));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return arenaFailure(error);
  }
}
