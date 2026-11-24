import { NextResponse } from "next/server";
import { UsageLimitError } from "@/lib/agent/quota";
import { rateLimited } from "@/lib/personalized/session";
import { ScoutError } from "@/lib/scout/errors";
import { readHistory, readSource } from "@/lib/scout/read";
import { jsonBody, NO_STORE, scoutUser } from "@/lib/scout/session";

/* ---------------------------------------------------------------------------
   Scout's reads (lib/scout/read.ts).

     GET   the person's last reads, as they were when read
     POST  { url } or { text } — read a YouTube video, a post on X, an
           article or pasted text: graded claims, and what smart money did
           in the coins they name. One model run against the daily cap,
           none when the link was read by anyone in the last day.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* A video is transcribed before it is read: allow for a slow model and its fallback. */
export const maxDuration = 280;

const PER_MINUTE = 5;

export async function GET(request: Request): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  return NextResponse.json(await readHistory(user.userId), { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const user = await scoutUser(request);
  if ("response" in user) return user.response;
  if (rateLimited(`scout-read:${user.userId}`, PER_MINUTE)) {
    return NextResponse.json({ error: "A few reads are already running. Try again in a minute." }, { status: 429 });
  }
  const body = await jsonBody(request);
  if (body === null) return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const url = typeof body.url === "string" ? body.url : undefined;
  const text = typeof body.text === "string" ? body.text : undefined;
  if ((url ?? "").trim() === "" && (text ?? "").trim() === "") return NextResponse.json({ error: "Paste a link or some text." }, { status: 400 });

  try {
    const read = await readSource(user.userId, { url, text });
    return NextResponse.json({ read }, { status: 201, headers: NO_STORE });
  } catch (error) {
    if (error instanceof ScoutError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof UsageLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("[scout/read]", error);
    return NextResponse.json({ error: "Scout could not read that just now." }, { status: 502 });
  }
}
