import { NextResponse } from "next/server";
import { createCall } from "@/lib/arena/server";
import { arenaFailure, arenaUser, jsonBody } from "@/lib/arena/session";

/* ---------------------------------------------------------------------------
   Posts a call. Append-only: there is no route that edits or deletes one.
   The receipt — SHA-256 over the canonical statement and the server's
   timestamp — is computed here, so the time is the server's, not the
   browser's.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const resolved = await arenaUser(request);
  if ("response" in resolved) return resolved.response;
  try {
    const id = await createCall(resolved.userId, await jsonBody(request), Date.now());
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return arenaFailure(error);
  }
}
