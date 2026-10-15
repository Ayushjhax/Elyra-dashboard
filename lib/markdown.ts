/* ---------------------------------------------------------------------------
   Markdown, as a tree React can render.

   The assistant writes Markdown — lists, a table of positions, a link to a
   filing — and the page renders it as elements, never as HTML. There is no
   `dangerouslySetInnerHTML` path: every node becomes a component, so a
   message cannot carry script, styles or an event handler however it was
   written.

   Deliberately the subset an answer about capital uses: paragraphs,
   headings, lists, tables, fenced code, quotes, rules; inline bold, italic,
   code and links. Links are http(s) and mailto only — anything else renders
   as its text.
--------------------------------------------------------------------------- */

export type Inline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong"; c: Inline[] }
  | { t: "em"; c: Inline[] }
  | { t: "link"; href: string; c: Inline[] };

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { t: "p"; c: Inline[] }
  | { t: "h"; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: "ul"; items: Inline[][] }
  | { t: "ol"; start: number; items: Inline[][] }
  | { t: "code"; lang: string | null; v: string }
  | { t: "quote"; c: Block[] }
  | { t: "table"; align: Align[]; head: Inline[][]; rows: Inline[][][] }
  | { t: "hr" };

/** A link target that is safe to put in an href, or null. */
export function safeHref(raw: string): string | null {
  const href = raw.trim();
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

/* ---- Inline ---- */

/* Underscores are not emphasis here: they appear inside identifiers and
   snake_case far more often than as italics in an answer. */
const INLINE =
  /(`+)([\s\S]*?[^`])\1(?!`)|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const push = (value: string) => {
    if (value.length === 0) return;
    const prev = out.at(-1);
    if (prev?.t === "text") prev.v += value;
    else out.push({ t: "text", v: value });
  };
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    push(text.slice(last, at));
    last = at + match[0].length;
    const [, , code, strong, strong2, em, label, href, bare] = match;
    if (code !== undefined) out.push({ t: "code", v: code.trim() === "" ? code : code.replace(/^ (.*) $/, "$1") });
    else if (strong !== undefined || strong2 !== undefined) out.push({ t: "strong", c: parseInline(strong ?? strong2 ?? "") });
    else if (em !== undefined) out.push({ t: "em", c: parseInline(em) });
    else if (label !== undefined && href !== undefined) {
      const safe = safeHref(href);
      if (safe === null) push(label);
      else out.push({ t: "link", href: safe, c: parseInline(label) });
    } else if (bare !== undefined) out.push({ t: "link", href: bare, c: [{ t: "text", v: bare }] });
    else push(match[0]);
  }
  push(text.slice(last));
  return out;
}

/* ---- Blocks ---- */

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  /* An escaped pipe is part of a cell, not a border. */
  return row
    .replace(/\\\|/g, "\u0000")
    .split("|")
    .map((cell) => cell.replace(/\u0000/g, "|").trim());
}

function alignOf(rule: string): Align {
  const left = rule.startsWith(":");
  const right = rule.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const startsBlock = (line: string, next: string | undefined) =>
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line) ||
    (line.includes("|") && next !== undefined && TABLE_RULE.test(next));

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence !== null) {
      const marker = fence[1];
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(marker)) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ t: "code", lang: fence[2] || null, v: body.join("\n") });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({ t: "h", level: Math.min(4, heading[1].length) as 1 | 2 | 3 | 4, c: parseInline(heading[2]) });
      i += 1;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ t: "hr" });
      i += 1;
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_RULE.test(lines[i + 1])) {
      const head = cells(line);
      const align = cells(lines[i + 1]).map(alignOf);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        const row = cells(lines[i]);
        rows.push(head.map((_, index) => parseInline(row[index] ?? "")));
        i += 1;
      }
      blocks.push({ t: "table", align: head.map((_, index) => align[index] ?? null), head: head.map(parseInline), rows });
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        body.push(QUOTE.exec(lines[i])?.[1] ?? "");
        i += 1;
      }
      blocks.push({ t: "quote", c: parseMarkdown(body.join("\n")) });
      continue;
    }

    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet !== null || ordered !== null) {
      const pattern = bullet !== null ? BULLET : ORDERED;
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        const item = pattern.exec(current);
        if (item !== null) {
          items.push(bullet !== null ? item[1] : item[2]);
        } else if (current.trim() !== "" && /^\s{2,}\S/.test(current) && items.length > 0) {
          /* A continuation line, indented under its item. */
          items[items.length - 1] += ` ${current.trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      const parsed = items.map(parseInline);
      blocks.push(
        bullet !== null ? { t: "ul", items: parsed } : { t: "ol", start: Number(ordered?.[1] ?? 1), items: parsed },
      );
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && (paragraph.length === 0 || !startsBlock(lines[i], lines[i + 1]))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ t: "p", c: parseInline(paragraph.join("\n")) });
  }

  return blocks;
}
