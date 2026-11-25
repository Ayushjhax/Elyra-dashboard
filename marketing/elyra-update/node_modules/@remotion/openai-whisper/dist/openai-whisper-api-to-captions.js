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
exports.openAiWhisperApiToCaptions = void 0;
const z = __importStar(require("zod/mini"));
const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
const apostropheVariants = ['\u0027', '\u2018', '\u2019', '\u02bc', '\uff07'];
const apostropheVariantRegex = `[${apostropheVariants.map(escapeRegex).join('')}]`;
const escapeWordForRegex = (text) => {
    return Array.from(text)
        .map((character) => {
        return apostropheVariants.includes(character)
            ? apostropheVariantRegex
            : escapeRegex(character);
    })
        .join('');
};
const seconds = z.number().check(z.nonnegative());
const wordSchema = z.object({ word: z.string(), start: seconds, end: seconds });
const segmentSchema = z.object({
    text: z.string(),
    start: seconds,
    end: seconds,
});
const transcriptionSchema = z.object({
    text: z.string(),
    words: z.optional(z.array(wordSchema)),
    task: z.optional(z.string()),
});
const segmentsSchema = z.object({ segments: z.optional(z.array(segmentSchema)) });
const invalidTranscript = (issue) => {
    const path = issue.path.reduce((acc, key) => typeof key === 'number'
        ? `${acc}[${key}]`
        : `${acc}${acc ? '.' : ''}${String(key)}`, '');
    return new Error(`OpenAI Whisper ${path || 'transcription'} ${/(^|\.)(start|end)$/.test(path) ? 'must be a finite, non-negative number (seconds)' : `is invalid: ${issue.message}`}.`);
};
const openAiWhisperApiToCaptions = ({ transcription, }) => {
    var _a, _b, _c;
    const captions = [];
    const result = z.safeParse(transcriptionSchema, transcription);
    if (!result.success) {
        throw invalidTranscript(result.error.issues[0]);
    }
    const parsed = result.data;
    if (parsed.task && parsed.task !== 'transcribe' && !((_a = parsed.words) === null || _a === void 0 ? void 0 : _a.length)) {
        throw new Error(`The transcription does need to be a "transcribe" task. The input you gave is "task": "${parsed.task}"`);
    }
    if (!((_b = parsed.words) === null || _b === void 0 ? void 0 : _b.length)) {
        const segmentResult = z.safeParse(segmentsSchema, transcription);
        if (!segmentResult.success) {
            throw invalidTranscript(segmentResult.error.issues[0]);
        }
        if (!((_c = segmentResult.data.segments) === null || _c === void 0 ? void 0 : _c.length)) {
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
                confidence: null,
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
    for (let i = 0; i < parsed.words.length; i++) {
        const word = parsed.words[i];
        const firstWord = i === 0;
        // https://github.com/remotion-dev/remotion/issues/5031
        if (firstWord) {
            word.word = word.word.trimStart();
        }
        const punctuation = `\\?,\\.\\%\\–\\!\\;\\:\\'\\"\\-\\_\\(\\)\\[\\]\\{\\}\\@\\#\\$\\^\\&\\*\\+\\=\\/\\|\\<\\>\\~\`\\u2018\\u2019\\u02bc\\uff07`;
        const wordToMatch = word.word.replace(new RegExp(`^[${punctuation}]+`), '');
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
            timestampMs: ((word.start + word.end) / 2) * 1000,
        });
    }
    return { captions };
};
exports.openAiWhisperApiToCaptions = openAiWhisperApiToCaptions;
