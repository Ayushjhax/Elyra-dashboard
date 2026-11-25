import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { extractArticle, parseXEmbed, parseYoutubeEmbed, type Article, type Post, type VideoMeta } from "@/lib/scout/html";
import { parseLink } from "@/lib/scout/link";
import { ScoutError } from "@/lib/scout/errors";

/* ---------------------------------------------------------------------------
   Fetching what a person pastes, without letting the paste reach inside.

   A link a person pastes is fetched by the server, so it must not be able to
   point the server at anything but the public web. `parseLink` refuses the
   obvious spellings first; here every hop is checked again after DNS: each
   address the name resolves to must be public, redirects are followed by
   hand (at most three, each re-checked), the body is capped, and only HTML
   is read. X and YouTube are read through their public embeds at fixed
   hosts, so a pasted link is never fetched from those sites directly.
--------------------------------------------------------------------------- */

const MAX_HTML_BYTES = 2_500_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 12_000;
const USER_AGENT = "Mozilla/5.0 (compatible; ElyraScout/1.0; +https://getelyra.xyz)";

/** Whether an IP address is one the public internet routes to. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; /* carrier-grade NAT */
    if (a === 169 && b === 254) return false; /* link-local, cloud metadata */
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a >= 224) return false; /* multicast and reserved */
    return true;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === "::" || lower === "::1") return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
    if (mapped !== null) return isPublicAddress(mapped[1]);
    if (/^f[cd]/.test(lower) || /^fe[89ab]/.test(lower) || lower.startsWith("ff")) return false;
    if (lower.startsWith("64:ff9b:") || lower.startsWith("2001:db8") || lower.startsWith("100::")) return false;
    return true;
  }
  return false;
}

async function assertPublicHost(hostname: string): Promise<void> {
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new ScoutError("That site could not be found.", 400);
  }
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new ScoutError("That address is not on the public web.", 400);
  }
}

async function cappedText(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(Math.min(size, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk.subarray(0, joined.length - offset), offset);
    offset += chunk.byteLength;
    if (offset >= joined.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}

/** A public web page's HTML, every hop checked. */
export async function fetchPage(url: string): Promise<{ html: string; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const parsed = parseLink(current);
    if (!parsed.ok) throw new ScoutError(parsed.error, 400);
    const target = new URL(current);
    await assertPublicHost(target.hostname);
    let response: Response;
    try {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1", "accept-language": "en;q=1, *;q=0.5" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
    } catch {
      throw new ScoutError("That page did not answer.", 502);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) throw new ScoutError("That page redirected nowhere.", 502);
      current = new URL(location, current).toString();
      continue;
    }
    const host = target.hostname.toLowerCase().replace(/^www\./, "");
    if (response.status === 401 || response.status === 403) throw new ScoutError("That page refused to be read (it may need a login or block readers).", 502, host);
    if (response.status === 404 || response.status === 410) throw new ScoutError("That page does not exist.", 404);
    if (!response.ok) throw new ScoutError(`That page answered ${response.status}.`, 502, host);
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) throw new ScoutError("That link is not a web page Scout can read.", 415);
    return { html: await cappedText(response, MAX_HTML_BYTES), finalUrl: current };
  }
  throw new ScoutError("That page redirected too many times.", 502);
}

export async function readArticle(url: string): Promise<Article & { host: string }> {
  const page = await fetchPage(url);
  const article = extractArticle(page.html);
  const host = new URL(page.finalUrl).hostname.toLowerCase().replace(/^www\./, "");
  if (article.text.length < 200) throw new ScoutError("Scout could not find the article's text on that page. Paste the text instead.", 422, host);
  return { ...article, host };
}

async function embedJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new ScoutError(`The embed service answered ${response.status}.`, 502);
  return response.json().catch(() => null);
}

/** A post on X, through X's public embed. */
export async function readPost(url: string): Promise<Post> {
  const body = await embedJson(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1&dnt=true`);
  const post = parseXEmbed(body);
  if (post === null || post.text.trim() === "") throw new ScoutError("X did not share that post. It may be deleted, private or age-restricted — paste its text instead.", 422);
  return post;
}

/** A YouTube video's title and channel, through YouTube's public embed. */
export async function readVideoMeta(videoUrl: string): Promise<VideoMeta> {
  const body = await embedJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(videoUrl)}&format=json`);
  const meta = parseYoutubeEmbed(body);
  if (meta === null) throw new ScoutError("YouTube did not share that video. It must be public and embeddable.", 422);
  return meta;
}
