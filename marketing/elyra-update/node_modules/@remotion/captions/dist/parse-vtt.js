"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVtt = void 0;
const parseVttTimestamp = (time) => {
    const parts = time.trim().split(':');
    if (parts.length < 2 || parts.length > 3) {
        throw new Error(`Invalid timestamp:${time}`);
    }
    const hours = parts.length === 3 ? parts[0] : '0';
    const minutes = parts.length === 3 ? parts[1] : parts[0];
    const [seconds, millis] = (parts.length === 3 ? parts[2] : parts[1]).split(/[,.]/);
    if (!hours || !minutes || !seconds || !millis) {
        throw new Error(`Invalid timestamp:${time}`);
    }
    return (parseInt(hours, 10) * 3600000 +
        parseInt(minutes, 10) * 60000 +
        parseInt(seconds, 10) * 1000 +
        parseInt(millis, 10));
};
const parseVtt = ({ input }) => {
    var _a;
    const inputLines = input
        .replace(/^\uFEFF/, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n');
    const captions = [];
    let i = 0;
    // The file starts with a `WEBVTT` header, optionally followed by trailing
    // text on the same line.
    if ((_a = inputLines[i]) === null || _a === void 0 ? void 0 : _a.trim().startsWith('WEBVTT')) {
        i++;
    }
    while (i < inputLines.length) {
        const line = inputLines[i];
        if (line.trim() === '') {
            i++;
            continue;
        }
        // NOTE, STYLE and REGION blocks are not cues and span until the next
        // blank line.
        if (/^(NOTE|STYLE|REGION)(\s|$)/.test(line)) {
            i++;
            while (i < inputLines.length && inputLines[i].trim() !== '') {
                i++;
            }
            continue;
        }
        const arrowIndex = line.indexOf('-->');
        if (arrowIndex === -1) {
            // An optional cue identifier. Skip it and read the timing line next.
            i++;
            continue;
        }
        const startToken = line.slice(0, arrowIndex).trim();
        const endToken = line
            .slice(arrowIndex + '-->'.length)
            .trim()
            .split(/\s+/)[0];
        const startMs = parseVttTimestamp(startToken);
        const endMs = parseVttTimestamp(endToken);
        i++;
        const text = [];
        // Only a truly empty line ends a cue. Whitespace-only lines are part of
        // the cue, e.g. YouTube auto-generated captions start cues with a line
        // containing a single space.
        while (i < inputLines.length && inputLines[i] !== '') {
            text.push(inputLines[i]);
            i++;
        }
        captions.push({
            // Cue text may contain markup tags (`<i>`, `<v Speaker>`, inline
            // timestamps like `<00:00:01.000>`, ...) and escaped characters.
            // Strip tags before decoding so that `&lt;i&gt;` stays a literal `<i>`,
            // and decode in a single pass so that `&amp;lt;` becomes `&lt;`.
            text: text
                .join('\n')
                .replace(/<[^>]*>/g, '')
                .replace(/&(?:#(\d+)|#[xX]([\da-fA-F]+)|(amp|lt|gt|quot|apos|nbsp|lrm|rlm));/g, (match, decimal, hex, name) => {
                if (name) {
                    return {
                        amp: '&',
                        lt: '<',
                        gt: '>',
                        quot: '"',
                        apos: "'",
                        nbsp: '\u00A0',
                        lrm: '\u200E',
                        rlm: '\u200F',
                    }[name];
                }
                const codePoint = decimal
                    ? parseInt(decimal, 10)
                    : parseInt(hex, 16);
                const invalid = codePoint === 0 ||
                    codePoint > 0x10ffff ||
                    (codePoint >= 0xd800 && codePoint <= 0xdfff);
                return invalid ? match : String.fromCodePoint(codePoint);
            })
                .trim(),
            startMs,
            endMs,
            timestampMs: (startMs + endMs) / 2,
            confidence: 1,
        });
    }
    return { captions };
};
exports.parseVtt = parseVtt;
