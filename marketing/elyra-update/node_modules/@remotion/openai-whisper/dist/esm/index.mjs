// src/openai-whisper-api-to-captions.ts
import * as z from "zod/mini";
var escapeRegex = (text) => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};
var apostropheVariants = ["'", "‘", "’", "ʼ", "＇"];
var apostropheVariantRegex = `[${apostropheVariants.map(escapeRegex).join("")}]`;
var escapeWordForRegex = (text) => {
  return Array.from(text).map((character) => {
    return apostropheVariants.includes(character) ? apostropheVariantRegex : escapeRegex(character);
  }).join("");
};
var seconds = z.number().check(z.nonnegative());
var wordSchema = z.object({ word: z.string(), start: seconds, end: seconds });
var segmentSchema = z.object({
  text: z.string(),
  start: seconds,
  end: seconds
});
var transcriptionSchema = z.object({
  text: z.string(),
  words: z.optional(z.array(wordSchema)),
  task: z.optional(z.string())
});
var segmentsSchema = z.object({ segments: z.optional(z.array(segmentSchema)) });
var invalidTranscript = (issue) => {
  const path = issue.path.reduce((acc, key) => typeof key === "number" ? `${acc}[${key}]` : `${acc}${acc ? "." : ""}${String(key)}`, "");
  return new Error(`OpenAI Whisper ${path || "transcription"} ${/(^|\.)(start|end)$/.test(path) ? "must be a finite, non-negative number (seconds)" : `is invalid: ${issue.message}`}.`);
};
var openAiWhisperApiToCaptions = ({
  transcription
}) => {
  const captions = [];
  const result = z.safeParse(transcriptionSchema, transcription);
  if (!result.success) {
    throw invalidTranscript(result.error.issues[0]);
  }
  const parsed = result.data;
  if (parsed.task && parsed.task !== "transcribe" && !parsed.words?.length) {
    throw new Error(`The transcription does need to be a "transcribe" task. The input you gave is "task": "${parsed.task}"`);
  }
  if (!parsed.words?.length) {
    const segmentResult = z.safeParse(segmentsSchema, transcription);
    if (!segmentResult.success) {
      throw invalidTranscript(segmentResult.error.issues[0]);
    }
    if (!segmentResult.data.segments?.length) {
      throw new Error('OpenAI Whisper: No timed captions found. Export verbose_json with timestamp_granularities: ["word"] or timed segments.');
    }
    for (const [index, segment] of segmentResult.data.segments.entries()) {
      if (segment.end < segment.start) {
        throw new Error(`OpenAI Whisper segments[${index}].end must not be earlier than start.`);
      }
      const startMs = segment.start * 1000;
      const endMs = segment.end * 1000;
      captions.push({
        text: segment.text,
        startMs,
        endMs,
        timestampMs: (startMs + endMs) / 2,
        confidence: null
      });
    }
    return { captions };
  }
  for (const [index, word] of parsed.words.entries()) {
    if (word.end < word.start) {
      throw new Error(`OpenAI Whisper words[${index}].end must not be earlier than start.`);
    }
  }
  let remainingText = parsed.text;
  for (let i = 0;i < parsed.words.length; i++) {
    const word = parsed.words[i];
    const firstWord = i === 0;
    if (firstWord) {
      word.word = word.word.trimStart();
    }
    const punctuation = `\\?,\\.\\%\\–\\!\\;\\:\\'\\"\\-\\_\\(\\)\\[\\]\\{\\}\\@\\#\\$\\^\\&\\*\\+\\=\\/\\|\\<\\>\\~\`\\u2018\\u2019\\u02bc\\uff07`;
    const wordToMatch = word.word.replace(new RegExp(`^[${punctuation}]+`), "");
    const match = new RegExp(`^([\\s?${punctuation}]{0,4})${escapeWordForRegex(wordToMatch)}([${punctuation}]{0,3})?`).exec(remainingText);
    if (!match) {
      throw new Error(`Unable to parse punctuation from OpenAI Whisper output. Could not find word "${word.word}" in text "${remainingText.slice(0, 100)}". File an issue under https://remotion.dev/issue and post the input for openAiWhisperApiToCaptions() to ask for a fix.`);
    }
    const foundText = match[0];
    remainingText = remainingText.slice(foundText.length);
    captions.push({
      confidence: null,
      endMs: word.end * 1000,
      startMs: word.start * 1000,
      text: foundText,
      timestampMs: (word.start + word.end) / 2 * 1000
    });
  }
  return { captions };
};
// src/is-openai-whisper-transcript.ts
import * as z2 from "zod/mini";
var withTask = z2.object({ task: z2.unknown() });
var withWords = z2.object({
  text: z2.unknown(),
  language: z2.unknown(),
  words: z2.unknown()
});
var withDuration = z2.object({
  text: z2.unknown(),
  duration: z2.unknown(),
  segments: z2.unknown()
});
var withSegments = z2.object({
  text: z2.unknown(),
  language: z2.unknown(),
  segments: z2.unknown()
});
var isOpenAiWhisperTranscript = (input) => {
  return z2.safeParse(withTask, input).success || z2.safeParse(withWords, input).success || z2.safeParse(withDuration, input).success || z2.safeParse(withSegments, input).success;
};
export {
  isOpenAiWhisperTranscript,
  openAiWhisperApiToCaptions
};
