import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { rateLimited } from "@/lib/personalized/session";
import { personaById } from "@/lib/voice/personas";
import { SPEECH_FORMAT, SpeechError, speechAvailable, streamSpeech } from "@/lib/voice/tts";

/* ---------------------------------------------------------------------------
   Elyra's voices.

   GET says whether this server can speak at all, so the browser uses its
   own voice where it cannot. POST takes a short piece of a reply and a
   persona id and answers with the spoken audio as it is made: raw 16-bit
   mono PCM at 24 kHz (lib/voice/tts.ts), which the page plays as it arrives.

   Signed-in only, a persona from Elyra's list only, and capped per person
   per minute and per piece — each piece is a paid generation, and nothing
   here should let a script turn the key into a free speech service.
--------------------------------------------------------------------------- */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A reply is cut into pieces of at most 280 characters (lib/voice/speakable.ts); this leaves room. */
export const MAX_SPEECH_CHARS = 600;
/** Pieces a minute: a long spoken reply is about six. */
const PIECES_PER_MINUTE = 40;

export async function GET(): Promise<Response> {
  return NextResponse.json({ available: speechAvailable() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser(request);
  if (user === null) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (rateLimited(`speak:${user.privyDid}`, PIECES_PER_MINUTE)) {
    return NextResponse.json({ error: "Too many requests. Wait a moment and try again." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (body === null || typeof body !== "object") return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  const persona = personaById(body.persona);
  if (persona === null) return NextResponse.json({ error: "Choose one of Elyra's voices." }, { status: 400 });
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length === 0) return NextResponse.json({ error: "Nothing to say." }, { status: 400 });
  if (text.length > MAX_SPEECH_CHARS) return NextResponse.json({ error: `At most ${MAX_SPEECH_CHARS} characters at a time.` }, { status: 413 });

  try {
    const audio = await streamSpeech(text, persona, request.signal);
    return new Response(audio, {
      headers: {
        "content-type": `audio/l16; rate=${SPEECH_FORMAT.sampleRate}; channels=${SPEECH_FORMAT.channels}`,
        "x-sample-rate": String(SPEECH_FORMAT.sampleRate),
        "cache-control": "no-store",
        "x-accel-buffering": "no",
      },
    });
  } catch (error) {
    if (error instanceof SpeechError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("[voice] speak", error);
    return NextResponse.json({ error: "The reply could not be spoken." }, { status: 502 });
  }
}
