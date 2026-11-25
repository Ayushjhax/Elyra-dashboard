/* ---------------------------------------------------------------------------
   A reply, made fit to be said. Pure.

   Elyra's replies are written to be read: markdown, tables, links, tickers
   with dollar signs, addresses. In a voice conversation the model is asked
   to write for the ear (lib/voice/personas.ts), but a reply read aloud from
   the text chat was not, and a model does not always comply. So the text is
   cleaned here before any voice says it: tables and code are dropped (the
   chat still shows them), links say their text, an address or a hash is
   named rather than spelled out, and markdown marks go.

   Then it is cut into short pieces at sentence ends, so the first sentence
   can be spoken while the rest is still being voiced.
--------------------------------------------------------------------------- */

const ADDRESS = /\b(?:0x[0-9a-fA-F]{20,}|[1-9A-HJ-NP-Za-km-z]{32,88})\b/g;

export function toSpeakable(markdown: string, addressWord = "the address"): string {
  const kept: string[] = [];
  let inCode = false;
  let droppedTable = false;
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    /* A table row, or the rule under its header. */
    if (/^\|.*\|$/.test(line) || /^\|?\s*:?-{3,}/.test(line)) {
      droppedTable = true;
      continue;
    }
    kept.push(line);
  }
  let text = kept.join("\n");
  if (droppedTable) text = `${text}\n`;

  text = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(ADDRESS, addressWord)
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?=[^*\w]|$)/g, "$1$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+/g, " ");

  /* Lines become sentences: a line that does not end a sentence gets one. */
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (/[.!?。！？:：;；…]$/.test(line) ? line : `${line}.`))
    .join(" ")
    .trim();
}

/**
 * Pieces of at most `max` characters, cut at sentence ends where possible
 * (Latin or Chinese punctuation), then at commas, then at spaces.
 */
export function speechChunks(text: string, max = 280): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]+["”’)\]]*\s*|[^.!?。！？]+$/g) ?? [];
  const out: string[] = [];
  let current = "";
  const push = (piece: string) => {
    const trimmed = piece.trim();
    if (trimmed.length > 0) out.push(trimmed);
  };
  for (const sentence of sentences) {
    if (sentence.length > max) {
      push(current);
      current = "";
      let rest = sentence;
      while (rest.length > max) {
        const window = rest.slice(0, max);
        const cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("，"), window.lastIndexOf(" "));
        const at = cut > max / 3 ? cut + 1 : max;
        push(rest.slice(0, at));
        rest = rest.slice(at);
      }
      current = rest;
      continue;
    }
    /* The first piece is kept short, so the voice starts sooner. */
    const limit = out.length === 0 ? Math.min(max, 140) : max;
    if ((current + sentence).length > limit) {
      push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }
  push(current);
  return out;
}
