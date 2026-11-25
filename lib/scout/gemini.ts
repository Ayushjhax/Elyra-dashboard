import "server-only";

import { optional } from "@/lib/env";
import { ScoutError } from "@/lib/scout/errors";

/* ---------------------------------------------------------------------------
   Scout's model: Gemini Flash, on Google's free tier.

   Scout is built to cost nothing to run. Gemini's free tier reads public
   YouTube videos by their address — the video never passes through Elyra —
   and answers in JSON held to a schema. Two models are tried in turn, both
   on the free tier, so one under load or out of quota falls to the other.

   A YouTube video is read up to its first 20 minutes, at low resolution: the
   words are what is wanted, and that keeps one video inside the free tier's
   per-minute token allowance.
--------------------------------------------------------------------------- */

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
export const SCOUT_MODELS = ["gemini-3.5-flash", "gemini-3.5-flash-lite"] as const;
export const VIDEO_CLIP_SECONDS = 1_200;

type Part = { text: string } | { fileData: { fileUri: string }; videoMetadata?: { endOffset: string } };

interface UrlMetadata {
  retrievedUrl?: string;
  urlRetrievalStatus?: string;
}

interface Reply {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> }; finishReason?: string; urlContextMetadata?: { urlMetadata?: UrlMetadata[] } }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export function geminiConfigured(): boolean {
  return (optional("GEMINI_API_KEY") ?? "").trim() !== "";
}

/** Whether to try the next model: busy, out of quota or broken, never a request the next would refuse too. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function geminiText(input: {
  system: string;
  parts: Part[];
  maxTokens: number;
  schema?: Record<string, unknown>;
  timeoutMs: number;
  video?: boolean;
  /** Let Gemini fetch the addresses in the prompt itself (its URL context tool). */
  urlContext?: boolean;
}): Promise<{ text: string; model: string; retrieved: UrlMetadata[] }> {
  const key = optional("GEMINI_API_KEY")?.trim();
  if (key === undefined || key === "") throw new ScoutError("Scout's AI is not set up on this server (GEMINI_API_KEY).", 503);

  let last = "Elyra's free AI is busy. Try again in a minute.";
  for (const model of SCOUT_MODELS) {
    let response: Response;
    try {
      response = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "content-type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: input.system }] },
          contents: [{ role: "user", parts: input.parts }],
          ...(input.urlContext === true ? { tools: [{ url_context: {} }] } : {}),
          generationConfig: {
            maxOutputTokens: input.maxTokens,
            /* Thinking counts against the budget; a little is enough to read carefully. */
            thinkingConfig: { thinkingLevel: "low" },
            ...(input.schema !== undefined ? { responseMimeType: "application/json", responseSchema: input.schema } : {}),
            ...(input.video === true ? { mediaResolution: "MEDIA_RESOLUTION_LOW" } : {}),
          },
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
        cache: "no-store",
      });
    } catch {
      last = "Elyra's free AI did not answer in time. Try again.";
      continue;
    }
    const body = (await response.json().catch(() => ({}))) as Reply;
    if (!response.ok) {
      if (RETRYABLE.has(response.status)) {
        last = response.status === 429 ? "Elyra's free AI allowance is used up for the moment. Try again in a minute." : last;
        continue;
      }
      const message = body.error?.message ?? "";
      if (input.video === true && response.status === 400) {
        throw new ScoutError("Gemini could not open that video. It must be public, not live, and not age-restricted.", 422);
      }
      console.error("[scout/gemini]", model, response.status, message.slice(0, 200));
      throw new ScoutError("Elyra's free AI refused the request.", 502);
    }
    if (body.promptFeedback?.blockReason !== undefined) throw new ScoutError("Gemini declined to read that source.", 422);
    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => part.thought !== true)
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "RECITATION" || candidate?.finishReason === "PROHIBITED_CONTENT") {
      throw new ScoutError("Gemini declined to read that source.", 422);
    }
    if (text === "") {
      last = "Elyra's free AI returned nothing. Try again.";
      continue;
    }
    return { text, model, retrieved: candidate?.urlContextMetadata?.urlMetadata ?? [] };
  }
  throw new ScoutError(last, 503);
}

export const TRANSCRIBE_SYSTEM =
  "You transcribe videos for Elyra, a trading app. Write the spoken words of the video verbatim, as plain text in the language spoken, with no timestamps, headings or commentary. Where words are unclear, leave them out rather than guess. If no one speaks, write exactly: NO SPEECH.";

export const COPY_PAGE_SYSTEM =
  "You copy web articles for Elyra, a trading app. Return the article's headline on the first line, then its main text verbatim as plain paragraphs. Leave out navigation, adverts, related links and comments, and add nothing of your own. If the page cannot be read, write exactly: UNREADABLE.";

/**
 * An article a site will not serve to a server, fetched by Google for Gemini
 * (the URL context tool) and copied out. Used only after the direct read was
 * refused; the copy is the model's, and is labelled so.
 */
export async function copyPage(url: string): Promise<{ title: string | null; text: string; model: string }> {
  const result = await geminiText({ system: COPY_PAGE_SYSTEM, parts: [{ text: `Copy this article: ${url}` }], maxTokens: 14_000, timeoutMs: 100_000, urlContext: true });
  const fetched = result.retrieved.some((entry) => entry.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS");
  const body = result.text.trim();
  if (!fetched || /^UNREADABLE\.?$/i.test(body) || body.length < 200) throw new ScoutError("That site blocks readers, and Gemini could not open it either. Paste the article's text instead.", 422);
  const [first, ...rest] = body.split("\n");
  return { title: first.trim().slice(0, 300) || null, text: rest.join("\n").trim(), model: result.model };
}

/** The words of a public YouTube video, up to its first 20 minutes. */
export async function transcribe(videoUrl: string): Promise<{ text: string; model: string }> {
  const result = await geminiText({
    system: TRANSCRIBE_SYSTEM,
    parts: [{ fileData: { fileUri: videoUrl }, videoMetadata: { endOffset: `${VIDEO_CLIP_SECONDS}s` } }, { text: "Transcribe this video." }],
    maxTokens: 14_000,
    timeoutMs: 110_000,
    video: true,
  });
  if (/^NO SPEECH\.?$/i.test(result.text.trim())) throw new ScoutError("No one speaks in that video, so there is nothing to read.", 422);
  return result;
}
