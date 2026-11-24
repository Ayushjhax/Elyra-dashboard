/* ---------------------------------------------------------------------------
   What a pasted link is, before anything is fetched.

   Three kinds are read: a YouTube video, a post on X, and any other web
   page, read as an article. Each is reduced to one canonical address and a
   cache key, so the same video pasted as youtu.be/…, a Shorts link or a
   watch URL with a timestamp is read once and shared.

   The link is refused here, before any request, when it could point inside
   a network rather than at the public web: another scheme, credentials in
   the address, an IP literal, a single-label or internal host, or a port
   other than the web's own. The fetcher checks the resolved addresses again
   (lib/scout/fetch.ts); this is the first of the two gates, not the only one.

   Pure, so the app and the tests share it.
--------------------------------------------------------------------------- */

export type LinkKind = "youtube" | "x" | "article";

export interface ParsedLink {
  kind: LinkKind;
  /** The canonical address, the one that is fetched and shown. */
  url: string;
  /** Cache key: `yt:<id>`, `x:<status id>` or `url:<canonical>`. */
  key: string;
  host: string;
  videoId: string | null;
  statusId: string | null;
}

export const MAX_URL_LENGTH = 2_000;

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const X_HOSTS = new Set(["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com", "mobile.x.com"]);

/** Hosts that name a machine on a private network rather than a site. */
const INTERNAL_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp", ".intranet", ".test", ".invalid", ".example"];

/** Query parameters that only track the click, dropped from the cache key. */
const TRACKING = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref_src$|igshid$)/i;

function isIpLiteral(host: string): boolean {
  if (host.startsWith("[") || host.includes(":")) return true;
  /* Dotted, and also the bare-number and hex spellings a URL parser accepts. */
  return /^[0-9.]+$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host);
}

export function youtubeIdOf(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (host.endsWith("youtu.be")) {
    const id = url.pathname.split("/")[1] ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }
  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v") ?? "";
    return YOUTUBE_ID.test(id) ? id : null;
  }
  const match = /^\/(?:shorts|live|embed|v)\/([^/?#]+)/.exec(url.pathname);
  return match !== null && YOUTUBE_ID.test(match[1]) ? match[1] : null;
}

export function xStatusOf(url: URL): { handle: string; id: string } | null {
  if (!X_HOSTS.has(url.hostname.toLowerCase())) return null;
  const match = /^\/([A-Za-z0-9_]{1,15})\/status(?:es)?\/(\d{5,25})(?:\/|$)/.exec(url.pathname);
  return match === null ? null : { handle: match[1], id: match[2] };
}

/** Reads a pasted link, or says in words why it will not be fetched. */
export function parseLink(input: string): { ok: true; link: ParsedLink } | { ok: false; error: string } {
  const raw = input.trim();
  if (raw === "") return { ok: false, error: "Paste a link." };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, error: "That link is too long." };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: "That is not a web address." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, error: "Only web links (https) can be read." };
  if (url.username !== "" || url.password !== "") return { ok: false, error: "A link with a username or password in it is not read." };
  if (url.port !== "" && url.port !== "80" && url.port !== "443") return { ok: false, error: "Only links on the web's standard ports are read." };

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host)) return { ok: false, error: "Links to an IP address are not read; use the site's name." };
  if (!host.includes(".") || host === "localhost" || INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return { ok: false, error: "That address is not on the public web." };
  }

  const videoId = youtubeIdOf(url);
  if (videoId !== null) {
    return {
      ok: true,
      link: { kind: "youtube", url: `https://www.youtube.com/watch?v=${videoId}`, key: `yt:${videoId}`, host: "youtube.com", videoId, statusId: null },
    };
  }
  if (YOUTUBE_HOSTS.has(host)) return { ok: false, error: "That YouTube link does not name a video." };

  const status = xStatusOf(url);
  if (status !== null) {
    return {
      ok: true,
      link: { kind: "x", url: `https://x.com/${status.handle}/status/${status.id}`, key: `x:${status.id}`, host: "x.com", videoId: null, statusId: status.id },
    };
  }
  if (X_HOSTS.has(host)) return { ok: false, error: "That X link does not name a post." };

  const canonical = new URL(url.toString());
  canonical.protocol = "https:";
  canonical.hostname = host;
  canonical.hash = "";
  for (const name of [...canonical.searchParams.keys()]) if (TRACKING.test(name)) canonical.searchParams.delete(name);
  const text = canonical.toString();
  return { ok: true, link: { kind: "article", url: text, key: `url:${text}`, host: host.replace(/^www\./, ""), videoId: null, statusId: null } };
}

/** Up to `max` links from a box that holds one per line (or separated by spaces). */
export function splitLinks(input: string, max: number): string[] {
  return [...new Set(input.split(/[\s,]+/).map((part) => part.trim()).filter((part) => part !== ""))].slice(0, max);
}
