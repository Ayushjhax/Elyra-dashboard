import { NextResponse } from "next/server";
import { base64Bytes } from "@/lib/attachments";
import { getSessionUser } from "@/lib/auth/session";
import {
  AUDIO_TYPES,
  MAX_AUDIO_BYTES,
  TranscriptionError,
  transcribe,
  transcriptionAvailable,
} from "@/lib/voice/transcribe";

/* ---------------------------------------------------------------------------
   Voice input, for browsers without their own speech recognition.

   GET says whether this server can transcribe at all, so the composer only
   offers recording where it will work. POST takes one short clip and
   returns its words. Signed-in only — the transcript goes into the agent's
   composer, which needs a session anyway — and capped per user per hour, so
   a stuck recorder or a script cannot run up the key's quota.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PER_HOUR = 60;
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** Per server instance — enough to stop a loop, not a global quota. */
const recent = new Map<string, number[]>();

function allow(userKey: string, now: number): boolean {
  const window = (recent.get(userKey) ?? []).filter((at) => now - at < 3_600_000);
  if (window.length >= PER_HOUR) {
    recent.set(userKey, window);
    return false;
  }
  window.push(now);
  recent.set(userKey, window);
  return true;
}

export async function GET(): Promise<Response> {
  return NextResponse.json({ available: transcriptionAvailable() });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const audio = typeof body.audio === "string" ? body.audio : "";
  const mediaType =
    typeof body.mediaType === "string" ? body.mediaType.split(";")[0].trim().toLowerCase() : "";

  if (!(AUDIO_TYPES as readonly string[]).includes(mediaType)) {
    return NextResponse.json({ error: "That recording format is not supported." }, { status: 400 });
  }
  if (audio.length === 0 || !BASE64.test(audio)) {
    return NextResponse.json({ error: "The recording was empty or malformed." }, { status: 400 });
  }
  if (base64Bytes(audio) > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep it under a minute." }, { status: 413 });
  }

  const key = user.userId ?? user.privyDid;
  if (!allow(key, Date.now())) {
    return NextResponse.json({ error: "Too many recordings in the last hour. Type this one." }, { status: 429 });
  }

  try {
    return NextResponse.json({ text: await transcribe(audio, mediaType) });
  } catch (error) {
    if (error instanceof TranscriptionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[voice]", error);
    return NextResponse.json({ error: "The recording could not be transcribed." }, { status: 500 });
  }
}
