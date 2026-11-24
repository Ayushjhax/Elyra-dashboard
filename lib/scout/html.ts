/* ---------------------------------------------------------------------------
   Text out of a web page or an embed, without a browser.

   An article is read the way a reader's eye reads it: the page's own
   metadata for the title, author and date (Open Graph, then JSON-LD, then
   the page), and the paragraphs of the article itself for the text, with
   scripts, navigation, headers, footers and forms removed first. A page that
   carries its whole body in JSON-LD (`articleBody`) is read from that.

   A post on X is read from X's public embed (oEmbed), which carries the
   post's text, its author and its date. It is the only free, keyless way to
   read a post, and the author it reports is X's, not the link's.

   Regular expressions, not a DOM: the server has none, and this only needs
   what a page declares. Pure.
--------------------------------------------------------------------------- */

export const MAX_ARTICLE_CHARS = 40_000;
/** Shorter paragraphs are menus, captions and bylines. */
const MIN_PARAGRAPH = 40;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  mdash: "—", ndash: "–", hellip: "…", copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", yen: "¥", middot: "·", bull: "•",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[entity.toLowerCase()] ?? whole;
  });
}

/** Markup to text: line breaks kept where the markup had them, tags dropped. */
export function textOf(html: string): string {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const ATTRIBUTE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;

function attributes(tag: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const match of tag.matchAll(ATTRIBUTE)) found[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  return found;
}

/** Every `<meta>` by its property, name or itemprop, lowercased; the first of each wins. */
export function metaTags(html: string): Map<string, string> {
  const metas = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? "").toLowerCase();
    const content = attrs.content?.trim() ?? "";
    if (key !== "" && content !== "" && !metas.has(key)) metas.set(key, content);
  }
  return metas;
}

interface LinkedData {
  headline?: string;
  datePublished?: string;
  author?: string;
  body?: string;
}

const ARTICLE_TYPES = /^(NewsArticle|Article|BlogPosting|ReportageNews|AnalysisNewsArticle|TechArticle|OpinionNewsArticle|LiveBlogPosting)$/;

function authorName(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const names = value.map(authorName).filter((name): name is string => typeof name === "string");
    return names.length > 0 ? names.slice(0, 3).join(", ") : undefined;
  }
  if (value !== null && typeof value === "object" && typeof (value as { name?: unknown }).name === "string") {
    return (value as { name: string }).name;
  }
  return undefined;
}

/** The page's own JSON-LD article, if it declares one. */
export function linkedData(html: string): LinkedData {
  const found: LinkedData = {};
  for (const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }
    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const node = queue.shift();
      if (Array.isArray(node)) {
        queue.push(...node);
        continue;
      }
      if (node === null || typeof node !== "object") continue;
      const record = node as Record<string, unknown>;
      if (Array.isArray(record["@graph"])) queue.push(...(record["@graph"] as unknown[]));
      const type = record["@type"];
      const types = Array.isArray(type) ? type : [type];
      if (!types.some((entry) => typeof entry === "string" && ARTICLE_TYPES.test(entry))) continue;
      if (found.headline === undefined && typeof record.headline === "string") found.headline = record.headline;
      if (found.datePublished === undefined && typeof record.datePublished === "string") found.datePublished = record.datePublished;
      if (found.author === undefined) found.author = authorName(record.author);
      if (found.body === undefined && typeof record.articleBody === "string") found.body = record.articleBody;
    }
  }
  return found;
}

const NOISE = /<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|figure|button|select)\b[\s\S]*?<\/\1>/gi;

function paragraphs(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<(p|h2|h3|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = textOf(match[2]).replace(/\n+/g, " ").trim();
    const isHeading = match[1].toLowerCase().startsWith("h");
    if (text.length >= (isHeading ? 12 : MIN_PARAGRAPH)) out.push(text);
  }
  return out;
}

function isoOrNull(value: string | undefined | null): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export interface Article {
  title: string | null;
  site: string | null;
  author: string | null;
  publishedAt: string | null;
  text: string;
}

export function extractArticle(html: string): Article {
  const metas = metaTags(html);
  const ld = linkedData(html);
  const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const timeTag = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i.exec(html)?.[1];

  const title = metas.get("og:title") ?? metas.get("twitter:title") ?? ld.headline ?? (titleTag !== undefined ? textOf(titleTag) : null);
  const rawAuthor = metas.get("author") ?? ld.author ?? metas.get("parsely-author") ?? metas.get("article:author") ?? null;
  const author = rawAuthor !== null && !/^https?:\/\//i.test(rawAuthor) ? rawAuthor.slice(0, 120) : null;
  const publishedAt = isoOrNull(
    metas.get("article:published_time") ?? ld.datePublished ?? metas.get("parsely-pub-date") ?? metas.get("date") ?? metas.get("pubdate") ?? metas.get("sailthru.date") ?? timeTag,
  );

  const cleaned = html.replace(/<!--[\s\S]*?-->/g, "").replace(NOISE, " ");
  /* The article element when the page has one; the body otherwise. */
  const articles = [...cleaned.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)].map((match) => match[1]);
  const region = articles.length > 0 ? articles.reduce((a, b) => (b.length > a.length ? b : a)) : (/<body\b[^>]*>([\s\S]*)<\/body>/i.exec(cleaned)?.[1] ?? cleaned);
  let text = paragraphs(region).join("\n\n");
  if (text.length < 400 && articles.length > 0) text = paragraphs(cleaned).join("\n\n");
  if (ld.body !== undefined && ld.body.length > text.length) text = textOf(ld.body);

  return {
    title: title !== null ? title.replace(/\s+/g, " ").trim().slice(0, 300) || null : null,
    site: metas.get("og:site_name")?.slice(0, 80) ?? null,
    author,
    publishedAt,
    text: text.slice(0, MAX_ARTICLE_CHARS),
  };
}

/* --- embeds ----------------------------------------------------------------- */

export interface Post {
  handle: string | null;
  author: string | null;
  text: string;
  publishedAt: string | null;
}

/** X's oEmbed answer: the post's text, its real author and its date. */
export function parseXEmbed(body: unknown): Post | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as { author_name?: unknown; author_url?: unknown; html?: unknown };
  if (typeof record.html !== "string") return null;
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(record.html)?.[1];
  if (paragraph === undefined) return null;
  const text = textOf(paragraph);
  const handle = typeof record.author_url === "string" ? (/(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/?$/i.exec(record.author_url)?.[1] ?? null) : null;
  const anchors = [...record.html.matchAll(/<a\b[^>]*>([^<]+)<\/a>/gi)].map((match) => match[1].trim());
  const dated = anchors.reverse().find((anchor) => /^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(anchor));
  return {
    handle,
    author: typeof record.author_name === "string" ? record.author_name.slice(0, 80) : null,
    text,
    publishedAt: dated !== undefined ? isoOrNull(`${dated} 00:00 UTC`) : null,
  };
}

export interface VideoMeta {
  title: string | null;
  channel: string | null;
}

export function parseYoutubeEmbed(body: unknown): VideoMeta | null {
  if (body === null || typeof body !== "object") return null;
  const record = body as { title?: unknown; author_name?: unknown };
  if (typeof record.title !== "string") return null;
  return { title: record.title.slice(0, 300), channel: typeof record.author_name === "string" ? record.author_name.slice(0, 80) : null };
}
