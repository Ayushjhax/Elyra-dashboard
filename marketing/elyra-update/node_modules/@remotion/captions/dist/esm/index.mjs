// src/ensure-max-characters-per-line.ts
var splitWords = (inputCaptions) => {
  const captions = [];
  for (let i = 0;i < inputCaptions.length; i++) {
    const w = inputCaptions[i];
    const words = w.text.split(" ").filter(Boolean);
    for (let j = 0;j < words.length; j++) {
      const word = words[j];
      captions.push({
        text: ` ${word}`,
        startMs: w.startMs,
        endMs: w.endMs,
        confidence: w.confidence,
        timestampMs: w.timestampMs,
        ...j === words.length - 1 && w.pageBreakAfter ? { pageBreakAfter: true } : {}
      });
    }
  }
  return captions;
};
var ensureMaxCharactersPerLine = ({
  captions,
  maxCharsPerLine
}) => {
  const splitted = splitWords(captions);
  const segments = [];
  let currentSegment = [];
  for (let i = 0;i < splitted.length; i++) {
    const w = splitted[i];
    const remainingWords = splitted.slice(i + 1);
    const filledCharactersInLine = currentSegment.map((s) => s.text.length).reduce((a, b) => a + b, 0);
    const preventOrphanWord = remainingWords.length < 4 && remainingWords.length > 1 && filledCharactersInLine > maxCharsPerLine / 2;
    if (currentSegment.length > 0 && (filledCharactersInLine + w.text.length > maxCharsPerLine || preventOrphanWord)) {
      segments.push(currentSegment);
      currentSegment = [];
    }
    currentSegment.push(w);
    if (w.pageBreakAfter && i < splitted.length - 1) {
      segments.push(currentSegment);
      currentSegment = [];
    }
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }
  return { segments };
};
// src/create-tiktok-style-captions.ts
var createTikTokStyleCaptions = ({
  captions,
  combineTokensWithinMilliseconds,
  breakOnSilenceAfterMilliseconds
}) => {
  const tikTokStyleCaptions = [];
  let currentText = "";
  let currentTokens = [];
  let currentFrom = 0;
  let currentTo = 0;
  const add = () => {
    const text = currentText.endsWith(`
`) ? currentText.slice(0, -1) : currentText;
    tikTokStyleCaptions.push({
      text: text.trimStart(),
      startMs: currentFrom,
      tokens: currentTokens,
      durationMs: Infinity
    });
    if (tikTokStyleCaptions.length > 1) {
      tikTokStyleCaptions[tikTokStyleCaptions.length - 2].durationMs = currentFrom - tikTokStyleCaptions[tikTokStyleCaptions.length - 2].startMs;
    }
  };
  captions.forEach((item, index) => {
    const { text } = item;
    const exceedsDuration = currentTo - currentFrom > combineTokensWithinMilliseconds;
    const shouldBreakOnSilence = breakOnSilenceAfterMilliseconds !== undefined && currentText !== "" && item.startMs - currentTo >= breakOnSilenceAfterMilliseconds;
    if (text.startsWith(" ") && (exceedsDuration || shouldBreakOnSilence)) {
      if (currentText !== "") {
        add();
      }
      currentText = text.trimStart();
      currentTokens = [
        {
          text: text.trimStart(),
          fromMs: item.startMs,
          toMs: item.endMs,
          ...item.pageBreakAfter ? { pageBreakAfter: true } : {}
        }
      ].filter((t) => t.text !== "");
      currentFrom = item.startMs;
      currentTo = item.endMs;
    } else {
      if (currentText === "") {
        currentFrom = item.startMs;
      }
      const textToAppend = text;
      currentText += textToAppend;
      currentText = currentText.trimStart();
      if (text.trim() !== "") {
        currentTokens.push({
          text: currentTokens.length === 0 ? currentText.trimStart() : textToAppend,
          fromMs: item.startMs,
          toMs: item.endMs,
          ...item.pageBreakAfter ? { pageBreakAfter: true } : {}
        });
      }
      currentTo = item.endMs;
    }
    if (item.pageBreakAfter && currentText !== "") {
      add();
      currentText = "";
      currentTokens = [];
    }
    if (index === captions.length - 1 && currentText !== "") {
      add();
      tikTokStyleCaptions[tikTokStyleCaptions.length - 1].durationMs = currentTo - tikTokStyleCaptions[tikTokStyleCaptions.length - 1].startMs;
    }
  });
  const lastPage = tikTokStyleCaptions[tikTokStyleCaptions.length - 1];
  if (lastPage && lastPage.durationMs === Infinity) {
    lastPage.durationMs = currentTo - lastPage.startMs;
  }
  return { pages: tikTokStyleCaptions };
};
// src/parse-srt.ts
function toMilliseconds(time) {
  const [first, second, third] = time.split(":");
  if (!first) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  if (!second) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  if (!third) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  const [seconds, millis] = third.trim().split(/[,.]/);
  if (!seconds) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  if (!millis) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  return parseInt(first, 10) * 3600000 + parseInt(second, 10) * 60000 + parseInt(seconds, 10) * 1000 + parseInt(millis, 10);
}
var parseSrt = ({
  input,
  strict = false
}) => {
  const inputLines = input.replace(/^\uFEFF/, "").replace(/\r\n/g, `
`).replace(/\r/g, `
`).split(`
`);
  const captions = [];
  if (strict) {
    const timestamp = (token, cue, line) => {
      const match = /^(\d+):(\d{2}):(\d{2})[,.](\d{3})$/.exec(token);
      if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) {
        throw new Error(`SRT cue ${cue}, line ${line}: invalid timestamp "${token}". Use HH:MM:SS,mmm.`);
      }
      const value = Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4]);
      if (!Number.isFinite(value)) {
        throw new Error(`SRT cue ${cue}, line ${line}: timestamp is too large.`);
      }
      return value;
    };
    let i = 0;
    while (i < inputLines.length) {
      if (inputLines[i].trim() === "") {
        i++;
        continue;
      }
      const cue = captions.length + 1;
      const headerLine = i + 1;
      if (!/^\d+$/.test(inputLines[i].trim())) {
        throw new Error(`SRT cue ${cue}, line ${headerLine}: expected a numeric cue index.`);
      }
      i++;
      const timingLine = inputLines[i];
      const timing = timingLine?.match(/^\s*(\S+)\s+-->\s+(\S+)(.*)$/);
      const settings = timing?.[3].trim();
      if (!timing || settings && !settings.split(/\s+/).every((setting) => /^(?:(?:X[12]|Y[12]):\d+|(?:align|position|line|size|vertical):\S+)$/.test(setting))) {
        throw new Error(`SRT cue ${cue}, line ${i + 1}: expected start --> end timestamps.`);
      }
      const startMs = timestamp(timing[1], cue, i + 1);
      const endMs = timestamp(timing[2], cue, i + 1);
      if (endMs < startMs) {
        throw new Error(`SRT cue ${cue}, line ${i + 1}: end must not be earlier than start.`);
      }
      i++;
      const text = [];
      while (i < inputLines.length && inputLines[i].trim() !== "") {
        text.push(inputLines[i]);
        i++;
      }
      if (text.length === 0) {
        throw new Error(`SRT cue ${cue}, line ${i + 1}: expected cue text.`);
      }
      captions.push({
        text: text.join(`
`).trimEnd(),
        startMs,
        endMs,
        timestampMs: (startMs + endMs) / 2,
        confidence: 1
      });
    }
    if (captions.length === 0) {
      throw new Error("SRT: No timed captions found. Provide numbered cues with timestamps and text.");
    }
    return { captions };
  }
  for (let i = 0;i < inputLines.length; i++) {
    const line = inputLines[i];
    const nextLine = inputLines[i + 1];
    if (line?.match(/^\s*\d+\s*$/) && nextLine?.includes(" --> ")) {
      const nextLineSplit = nextLine.split(" --> ");
      const start = toMilliseconds(nextLineSplit[0].trim());
      const end = toMilliseconds(nextLineSplit[1].trim());
      captions.push({
        text: "",
        startMs: start,
        endMs: end,
        confidence: 1,
        timestampMs: (start + end) / 2
      });
      i++;
    } else if (line?.trim() === "") {
      if (captions.length > 0) {
        captions[captions.length - 1].text = captions[captions.length - 1].text.trim();
      }
    } else if (captions.length > 0) {
      captions[captions.length - 1].text += line + `
`;
    }
  }
  return {
    captions: captions.map((l) => {
      return {
        ...l,
        text: l.text.trimEnd()
      };
    })
  };
};
// src/parse-vtt.ts
var parseVttTimestamp = (time) => {
  const parts = time.trim().split(":");
  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  const hours = parts.length === 3 ? parts[0] : "0";
  const minutes = parts.length === 3 ? parts[1] : parts[0];
  const [seconds, millis] = (parts.length === 3 ? parts[2] : parts[1]).split(/[,.]/);
  if (!hours || !minutes || !seconds || !millis) {
    throw new Error(`Invalid timestamp:${time}`);
  }
  return parseInt(hours, 10) * 3600000 + parseInt(minutes, 10) * 60000 + parseInt(seconds, 10) * 1000 + parseInt(millis, 10);
};
var parseVtt = ({ input }) => {
  const inputLines = input.replace(/^\uFEFF/, "").replace(/\r\n/g, `
`).replace(/\r/g, `
`).split(`
`);
  const captions = [];
  let i = 0;
  if (inputLines[i]?.trim().startsWith("WEBVTT")) {
    i++;
  }
  while (i < inputLines.length) {
    const line = inputLines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(line)) {
      i++;
      while (i < inputLines.length && inputLines[i].trim() !== "") {
        i++;
      }
      continue;
    }
    const arrowIndex = line.indexOf("-->");
    if (arrowIndex === -1) {
      i++;
      continue;
    }
    const startToken = line.slice(0, arrowIndex).trim();
    const endToken = line.slice(arrowIndex + "-->".length).trim().split(/\s+/)[0];
    const startMs = parseVttTimestamp(startToken);
    const endMs = parseVttTimestamp(endToken);
    i++;
    const text = [];
    while (i < inputLines.length && inputLines[i] !== "") {
      text.push(inputLines[i]);
      i++;
    }
    captions.push({
      text: text.join(`
`).replace(/<[^>]*>/g, "").replace(/&(?:#(\d+)|#[xX]([\da-fA-F]+)|(amp|lt|gt|quot|apos|nbsp|lrm|rlm));/g, (match, decimal, hex, name) => {
        if (name) {
          return {
            amp: "&",
            lt: "<",
            gt: ">",
            quot: '"',
            apos: "'",
            nbsp: " ",
            lrm: "‎",
            rlm: "‏"
          }[name];
        }
        const codePoint = decimal ? parseInt(decimal, 10) : parseInt(hex, 16);
        const invalid = codePoint === 0 || codePoint > 1114111 || codePoint >= 55296 && codePoint <= 57343;
        return invalid ? match : String.fromCodePoint(codePoint);
      }).trim(),
      startMs,
      endMs,
      timestampMs: (startMs + endMs) / 2,
      confidence: 1
    });
  }
  return { captions };
};
// src/serialize-srt.ts
var formatSingleSrtTimestamp = (timestamp) => {
  const hours = Math.floor(timestamp / 3600000);
  const minutes = Math.floor(timestamp % 3600000 / 60000);
  const seconds = Math.floor(timestamp % 60000 / 1000);
  const milliseconds = Math.floor(timestamp % 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
};
var formatSrtTimestamp = (startMs, endMs) => {
  return `${formatSingleSrtTimestamp(startMs)} --> ${formatSingleSrtTimestamp(endMs)}`;
};
var serializeSrt = ({ lines }) => {
  const cues = [];
  for (const line of lines) {
    let currentCue = [];
    for (const caption of line) {
      currentCue.push(caption);
      if (caption.pageBreakAfter) {
        cues.push(currentCue);
        currentCue = [];
      }
    }
    if (currentCue.length > 0) {
      cues.push(currentCue);
    }
  }
  return cues.map((s, index) => {
    const firstTimestamp = s[0].startMs;
    const lastTimestamp = s[s.length - 1].endMs;
    return [
      index + 1,
      formatSrtTimestamp(firstTimestamp, lastTimestamp),
      s.map((caption) => caption.text).join("")
    ].join(`
`);
  }).join(`

`);
};

// src/index.ts
var CaptionsInternals = {
  ensureMaxCharactersPerLine
};
export {
  CaptionsInternals,
  createTikTokStyleCaptions,
  parseSrt,
  parseVtt,
  serializeSrt
};
