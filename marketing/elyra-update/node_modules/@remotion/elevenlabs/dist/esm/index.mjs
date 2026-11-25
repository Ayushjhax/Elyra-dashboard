// src/detect-elevenlabs-transcript-format.ts
import * as z from "zod/mini";
var stt = z.object({ language_code: z.unknown(), words: z.unknown() });
var sttWithId = z.object({ transcription_id: z.unknown(), words: z.unknown() });
var segmented = z.object({
  language_code: z.unknown(),
  segments: z.unknown()
});
var detectElevenLabsTranscriptFormat = (input) => {
  if (z.safeParse(stt, input).success || z.safeParse(sttWithId, input).success) {
    return "speech-to-text";
  }
  if (z.safeParse(segmented, input).success) {
    return "segmented";
  }
  return null;
};
// src/elevenlabs-transcript-to-captions.ts
import * as z2 from "zod/mini";
var seconds = z2.number().check(z2.nonnegative());
var sttWord = z2.object({
  text: z2.string(),
  start: seconds,
  end: seconds,
  type: z2.enum(["word", "spacing", "audio_event"])
});
var stt2 = z2.object({ words: z2.array(sttWord) });
var segmentWord = z2.object({
  text: z2.string(),
  start_time: seconds,
  end_time: seconds
});
var segment = z2.object({
  text: z2.string(),
  start_time: seconds,
  end_time: seconds,
  words: z2.optional(z2.array(segmentWord))
});
var segmented2 = z2.object({ segments: z2.array(segment) });
var elevenLabsTranscriptToCaptions = ({
  transcript
}) => {
  const format = detectElevenLabsTranscriptFormat(transcript);
  if (format === null) {
    throw new Error("Invalid ElevenLabs transcript: expected Speech-to-Text words or a segmented JSON export with timed segments.");
  }
  const schema = format === "speech-to-text" ? stt2 : segmented2;
  const result = z2.safeParse(schema, transcript);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue.path.reduce((acc, key) => typeof key === "number" ? `${acc}[${key}]` : `${acc}${acc ? "." : ""}${String(key)}`, "");
    throw new Error(`ElevenLabs ${path || "transcript"} ${/(^|\.)(start|end|start_time|end_time)$/.test(path) ? "must be a finite, non-negative number (seconds)" : `is invalid: ${issue.message}`}.`);
  }
  const captions = [];
  if (format === "segmented") {
    const parsed = z2.parse(segmented2, transcript);
    for (const [index, entry] of parsed.segments.entries()) {
      if (entry.end_time < entry.start_time) {
        throw new Error(`ElevenLabs segments[${index}].end_time must not be earlier than start_time.`);
      }
      if (entry.words && entry.words.length > 0) {
        for (const [wordIndex, word] of entry.words.entries()) {
          if (word.end_time < word.start_time) {
            throw new Error(`ElevenLabs segments[${index}].words[${wordIndex}].end_time must not be earlier than start_time.`);
          }
          const startMs = word.start_time * 1000;
          const endMs = word.end_time * 1000;
          captions.push({
            text: word.text,
            startMs,
            endMs,
            timestampMs: (startMs + endMs) / 2,
            confidence: null
          });
        }
      } else {
        const startMs = entry.start_time * 1000;
        const endMs = entry.end_time * 1000;
        captions.push({
          text: entry.text,
          startMs,
          endMs,
          timestampMs: (startMs + endMs) / 2,
          confidence: null
        });
      }
    }
    return { captions };
  }
  const { words } = z2.parse(stt2, transcript);
  let isFirst = true;
  for (let i = 0;i < words.length; i++) {
    const entry = words[i];
    if (entry.end < entry.start) {
      throw new Error(`ElevenLabs words[${i}].end must not be earlier than start.`);
    }
    if (entry.type !== "word") {
      continue;
    }
    const prevEntry = i > 0 ? words[i - 1] : null;
    const hasSpacing = prevEntry !== null && prevEntry.type === "spacing";
    const startMs = !isFirst && hasSpacing ? prevEntry.start * 1000 : entry.start * 1000;
    const endMs = entry.end * 1000;
    const text = isFirst ? entry.text : ` ${entry.text}`;
    captions.push({
      confidence: null,
      startMs,
      endMs,
      text,
      timestampMs: (startMs + endMs) / 2
    });
    isFirst = false;
  }
  return { captions };
};
export {
  detectElevenLabsTranscriptFormat,
  elevenLabsTranscriptToCaptions
};
