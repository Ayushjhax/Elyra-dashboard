import "server-only";

import { optional } from "@/lib/env";

/* ---------------------------------------------------------------------------
   Speech to text, for browsers that cannot do it themselves.

   Chrome, Edge and Safari recognise speech in the browser, and the composer
   uses that: it is live, and nothing passes through this server. Firefox
   has no recogniser, and Brave ships one that cannot reach its service. In
   those the composer records a short clip and posts it here, and Gemini —
   already the agent's fallback provider, under the same key — writes it out.

   The transcript only ever lands in the composer for the person to read and
   send. Nothing said is acted on directly.
--------------------------------------------------------------------------- */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3.5-flash";
const TIMEOUT_MS = 30_000;

/** What MediaRecorder produces across browsers, and what Gemini reads. */
export const AUDIO_TYPES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/wav",
  "audio/flac",
] as const;

/** About three minutes of Opus; a question is seconds. */
export const MAX_AUDIO_BYTES = 2.5 * 1024 * 1024;

const INSTRUCTION =
  "Transcribe this recording exactly as spoken. It is a person dictating a question to a " +
  "crypto trading assistant, so expect tickers and venues — write tickers in capitals (SOL, " +
  "BTC, ETH, HYPE, JUP) and names as their owners write them (Hyperliquid, Binance, " +
  "Polymarket). Return only the words spoken: no quotes, no labels, no commentary. If " +
  "nothing intelligible is said, return nothing.";

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export function transcriptionAvailable(): boolean {
  return optional("GEMINI_API_KEY") !== undefined;
}

/** Strips what a model sometimes wraps a transcript in anyway. */
export function cleanTranscript(text: string): string {
  return text
    .trim()
    .replace(/^(transcript|transcription)\s*:\s*/i, "")
    .replace(/^["“']([\s\S]*)["”']$/, "$1")
    .trim();
}

export async function transcribe(audioBase64: string, mediaType: string): Promise<string> {
  const apiKey = optional("GEMINI_API_KEY");
  if (apiKey === undefined) {
    throw new TranscriptionError("Voice transcription is not configured on this server.", 501);
  }
  const model = optional("GEMINI_TRANSCRIBE_MODEL") ?? DEFAULT_MODEL;

  let response: Response;
  try {
    response = await fetch(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: mediaType, data: audioBase64 } }, { text: INSTRUCTION }],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new TranscriptionError("The transcription service could not be reached.", 502);
  }

  if (!response.ok) {
    /* The upstream body can carry quota detail and project ids; it goes to
       the log, and the person gets a sentence. */
    console.error("[voice] transcription failed", response.status, (await response.text().catch(() => "")).slice(0, 300));
    throw new TranscriptionError(
      response.status === 429
        ? "Voice transcription is over its quota right now. Try again shortly, or type."
        : "The recording could not be transcribed.",
      response.status === 429 ? 429 : 502,
    );
  }

  const payload = (await response.json().catch(() => null)) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  } | null;
  const text = (payload?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  return cleanTranscript(text);
}
