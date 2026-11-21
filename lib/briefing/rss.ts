/* ---------------------------------------------------------------------------
   RSS 2.0, read without a parser dependency: the outlets the briefing reads
   publish flat <item> lists, and only five fields are wanted. Pure, so the
   parsing is tested on real feed text.
--------------------------------------------------------------------------- */

export interface FeedItem {
  title: string;
  link: string;
  /** Plain text, tags and entities removed. */
  description: string;
  publishedAt: string | null;
  categories: string[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/** Text content: CDATA unwrapped, tags dropped, entities decoded, whitespace folded. */
export function plainText(raw: string): string {
  const unwrapped = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  /* Entities first: a description often carries its HTML escaped. */
  const decoded = decodeEntities(unwrapped);
  return decodeEntities(decoded.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function field(item: string, tag: string): string | null {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(item);
  return match === null ? null : plainText(match[1]);
}

export function parseRss(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const body = match[1];
    const title = field(body, "title");
    const link = field(body, "link") ?? field(body, "guid");
    if (!title || !link || !/^https:\/\//.test(link)) continue;
    const date = field(body, "pubDate") ?? field(body, "dc:date");
    const parsed = date === null ? Number.NaN : Date.parse(date);
    items.push({
      title,
      link,
      description: field(body, "description") ?? "",
      publishedAt: Number.isFinite(parsed) ? new Date(parsed).toISOString() : null,
      categories: [...body.matchAll(/<category(?:\s[^>]*)?>([\s\S]*?)<\/category>/gi)].map((category) => plainText(category[1])),
    });
  }
  return items;
}
