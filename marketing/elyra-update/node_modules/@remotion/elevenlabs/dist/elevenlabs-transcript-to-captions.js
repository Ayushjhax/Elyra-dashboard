"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.elevenLabsTranscriptToCaptions = void 0;
const z = __importStar(require("zod/mini"));
const detect_elevenlabs_transcript_format_1 = require("./detect-elevenlabs-transcript-format");
const seconds = z.number().check(z.nonnegative());
const sttWord = z.object({
    text: z.string(),
    start: seconds,
    end: seconds,
    type: z.enum(['word', 'spacing', 'audio_event']),
});
const stt = z.object({ words: z.array(sttWord) });
const segmentWord = z.object({
    text: z.string(),
    start_time: seconds,
    end_time: seconds,
});
const segment = z.object({
    text: z.string(),
    start_time: seconds,
    end_time: seconds,
    words: z.optional(z.array(segmentWord)),
});
const segmented = z.object({ segments: z.array(segment) });
const elevenLabsTranscriptToCaptions = ({ transcript, }) => {
    const format = (0, detect_elevenlabs_transcript_format_1.detectElevenLabsTranscriptFormat)(transcript);
    if (format === null) {
        throw new Error('Invalid ElevenLabs transcript: expected Speech-to-Text words or a segmented JSON export with timed segments.');
    }
    const schema = format === 'speech-to-text' ? stt : segmented;
    const result = z.safeParse(schema, transcript);
    if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue.path.reduce((acc, key) => typeof key === 'number'
            ? `${acc}[${key}]`
            : `${acc}${acc ? '.' : ''}${String(key)}`, '');
        throw new Error(`ElevenLabs ${path || 'transcript'} ${/(^|\.)(start|end|start_time|end_time)$/.test(path) ? 'must be a finite, non-negative number (seconds)' : `is invalid: ${issue.message}`}.`);
    }
    const captions = [];
    if (format === 'segmented') {
        const parsed = z.parse(segmented, transcript);
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
                        confidence: null,
                    });
                }
            }
            else {
                const startMs = entry.start_time * 1000;
                const endMs = entry.end_time * 1000;
                captions.push({
                    text: entry.text,
                    startMs,
                    endMs,
                    timestampMs: (startMs + endMs) / 2,
                    confidence: null,
                });
            }
        }
        return { captions };
    }
    const { words } = z.parse(stt, transcript);
    let isFirst = true;
    for (let i = 0; i < words.length; i++) {
        const entry = words[i];
        if (entry.end < entry.start) {
            throw new Error(`ElevenLabs words[${i}].end must not be earlier than start.`);
        }
        if (entry.type !== 'word') {
            continue;
        }
        const prevEntry = i > 0 ? words[i - 1] : null;
        const hasSpacing = prevEntry !== null && prevEntry.type === 'spacing';
        const startMs = !isFirst && hasSpacing ? prevEntry.start * 1000 : entry.start * 1000;
        const endMs = entry.end * 1000;
        const text = isFirst ? entry.text : ` ${entry.text}`;
        captions.push({
            confidence: null,
            startMs,
            endMs,
            text,
            timestampMs: (startMs + endMs) / 2,
        });
        isFirst = false;
    }
    return { captions };
};
exports.elevenLabsTranscriptToCaptions = elevenLabsTranscriptToCaptions;
