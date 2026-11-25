import "server-only";

import { optional } from "@/lib/env";
import type { VoicePersona } from "@/lib/voice/personas";

/* ---------------------------------------------------------------------------
   Text to speech: Elyra's voices, spoken by Gemini.

   The same key as transcription (GEMINI_API_KEY). Gemini's speech models
   take the words and a delivery note — the persona's `speakingStyle` — and
   speak them in one of their prebuilt voices, detecting the language (so a
   Chinese reply is spoken in Chinese by the same voice).

   Streamed: Gemini sends the audio as it is made, as 16-bit mono PCM at
   24 kHz, and this passes each piece straight to the browser, which plays it
   as it arrives. Unstreamed, a sentence took ~6.7 s to come back; streamed,
   the first audio arrives in ~3.8 s and the rest faster than it plays
   (measured 21 November 2026 on gemini-3.8-flash-lite-tts, the model
   Google suggests for conversational voice agents).

   Only the words given are spoken. The route caps their length and the
   caller has already cleaned them (lib/voice/speakable.ts).
--------------------------------------------------------------------------- */

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
const DEFAULT_MODEL = "gemini-3.8-flash-lite-tts";
const TIMEOUT_MS = 30_000;

/** The PCM every streamed chunk is in. */
export const SPEECH_FORMAT = { sampleRate: 24_000, channels: 1, bitsPerSample: 16 } as const;

export class SpeechError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "SpeechError";
  }
}

export function speechAvailable(): boolean {
  return optional("GEMINI_API_KEY") !== undefined;
}

/** The request Gemini's Interactions API takes for one voice, streamed. */
export function speechRequest(text: string, persona: VoicePersona, model: string) {
  return {
    model,
    stream: true,
    input: [
      {
        type: "user_input",
        content: [{ type: "text", text, annotations: [{ type: "speech_metadata", style: persona.speakingStyle }] }],
      },
    ],
    response_format: { type: "audio", mime_type: "audio/l16", sample_rate: SPEECH_FORMAT.sampleRate },
    generation_config: { speech_config: [{ voice: persona.geminiVoice }] },
  };
}

/**
 * The audio pieces out of Gemini's event stream: every `step.delta` whose
 * delta is audio, base64-decoded. Events are server-sent (`data:` lines,
 * blank-line separated); anything else in the stream is skipped.
 */
export function audioFromEvents(onPcm: (bytes: Uint8Array) => void): (text: string) => void {
  let buffer = "";
  return (text: string) => {
    buffer += text;
    let end = buffer.indexOf("\n\n");
    while (end !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("");
      if (data.length > 0 && data !== "[DONE]") {
        try {
          const event = JSON.parse(data) as { event_type?: string; delta?: { type?: string; data?: string } };
          if (event.delta?.type === "audio" && typeof event.delta.data === "string") {
            onPcm(new Uint8Array(Buffer.from(event.delta.data, "base64")));
          }
        } catch {
          /* A malformed event is skipped, not the whole voice. */
        }
      }
      end = buffer.indexOf("\n\n");
    }
  };
}

/** Speaks `text` as `persona`: a stream of raw PCM (SPEECH_FORMAT). */
export async function streamSpeech(text: string, persona: VoicePersona, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
  const apiKey = optional("GEMINI_API_KEY");
  if (apiKey === undefined) throw new SpeechError("Elyra's voices are not configured on this server.", 501);
  const model = optional("GEMINI_TTS_MODEL") ?? DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream", "x-goog-api-key": apiKey },
      body: JSON.stringify(speechRequest(text, persona, model)),
      signal: signal === undefined ? AbortSignal.timeout(TIMEOUT_MS) : AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
    });
  } catch {
    throw new SpeechError("The voice service could not be reached.", 502);
  }
  if (!response.ok || response.body === null) {
    /* The upstream body can carry quota detail and project ids: to the log only. */
    console.error("[voice] speech failed", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw new SpeechError(
      response.status === 429 ? "Elyra's voice is over its quota right now. Replies still arrive as text." : "The reply could not be spoken.",
      response.status === 429 ? 429 : 502,
    );
  }

  const upstream = response.body.getReader();
  const decoder = new TextDecoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const feed = audioFromEvents((bytes) => controller.enqueue(bytes));
      try {
        for (;;) {
          const { done, value } = await upstream.read();
          if (done) break;
          feed(decoder.decode(value, { stream: true }));
        }
        feed(`${decoder.decode()}\n\n`);
        controller.close();
      } catch {
        try {
          controller.close();
        } catch {
          /* The listener went away. */
        }
      }
    },
    cancel() {
      void upstream.cancel().catch(() => undefined);
    },
  });
}
