import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { claimAgentRun } from "@/lib/agent/quota";
import { staysOnFacts } from "@/lib/arena/writer";
import { hyperliquidCandles } from "@/lib/autotrade/hyperliquid";
import { serviceClient } from "@/lib/supabase/server";
import { listingFeeds } from "@/lib/scout/announcements";
import { CLAIMS_SCHEMA, CLAIMS_SYSTEM, claimsPrompt, parseClaims, type Claim, type SourceMeta } from "@/lib/scout/claims";
import { ScoutError } from "@/lib/scout/errors";
import { readArticle, readPost, readVideoMeta } from "@/lib/scout/fetch";
import { coinForTicker, readOf } from "@/lib/scout/flows";
import { copyPage, geminiText, transcribe } from "@/lib/scout/gemini";
import { attentionCues, gradeOf, gradeRank, sourceStanding, type Direction, type SourceTier } from "@/lib/scout/grade";
import { parseLink, snowflakeTime } from "@/lib/scout/link";
import { confirmingListing, exchangeNamed, READ_FEEDS, type Announcement, type Exchange } from "@/lib/scout/listings";
import { allMids, DAY_MS, flowsFor, holdings, perpCoins } from "@/lib/scout/smartMoney";
import type { AssetCheck, ClaimView, ReadView, SourceKind } from "@/lib/scout/types";

/* ---------------------------------------------------------------------------
   A read: a link or a paste in, graded claims and a smart-money check out.

     1. The source is fetched (lib/scout/fetch.ts): an article's page, a
        post through X's embed, a video's title through YouTube's embed and
        its words through Gemini (lib/scout/gemini.ts).
     2. Gemini lists the claims, each with its quote; code keeps a claim only
        when the quote is in the source, and its statement and the summary
        only when every number in them is (`staysOnFacts`).
     3. Code grades each claim (lib/scout/grade.ts) and checks a listing
        claim against the exchanges' own feeds.
     4. For each coin the claims name that Hyperliquid trades, code reads the
        move since the source appeared and what smart money opened.

   A link already read in the last day is answered from the shared cache —
   the source's claims, not the person's — so the second reader costs no
   model run. Market data and the feeds are always read fresh. A read claims
   one of the person's daily model runs, like a question to Elyra; a cached
   one claims none. Nothing a read finds is ever acted on.
--------------------------------------------------------------------------- */

export const CACHE_MS = DAY_MS;
export const MIN_PASTE = 40;
export const MAX_PASTE = 6_000;
const MAX_ASSETS = 5;

interface Source {
  key: string;
  kind: SourceKind;
  url: string | null;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  tier: SourceTier;
  party: string | null;
  textOrigin: ReadView["textOrigin"];
  attention: string[];
  summary: string | null;
  claims: Claim[];
  dropped: number;
  model: string | null;
}

/* --- the source --------------------------------------------------------------- */

async function cachedSource(key: string, now: number): Promise<Source | null> {
  const { data } = await serviceClient().from("scout_sources").select("*").eq("key", key).maybeSingle();
  if (data === null || data === undefined) return null;
  const row = data as Record<string, unknown>;
  if (now - Date.parse(String(row.read_at)) > CACHE_MS) return null;
  return {
    key,
    kind: row.kind as SourceKind,
    url: (row.url as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    author: (row.author as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    tier: row.tier as SourceTier,
    party: (row.party as string | null) ?? null,
    textOrigin: row.text_origin as ReadView["textOrigin"],
    attention: Array.isArray(row.attention) ? (row.attention as string[]) : [],
    summary: (row.summary as string | null) ?? null,
    claims: Array.isArray(row.claims) ? (row.claims as Claim[]) : [],
    dropped: Number(row.dropped ?? 0),
    model: (row.model as string | null) ?? null,
  };
}

async function claimsFrom(meta: SourceMeta, text: string): Promise<{ summary: string | null; claims: Claim[]; dropped: number; model: string }> {
  const reply = await geminiText({
    system: CLAIMS_SYSTEM,
    parts: [{ text: claimsPrompt(meta, text) }],
    maxTokens: 6_000,
    schema: CLAIMS_SCHEMA as unknown as Record<string, unknown>,
    timeoutMs: 60_000,
  });
  const parsed = parseClaims(reply.text, text);
  const facts = [text, meta.title ?? ""];
  return {
    /* A number the source does not hold drops the summary, and puts the claim's own quote in place of its statement. */
    summary: parsed.summary !== "" && staysOnFacts(parsed.summary, facts) ? parsed.summary : null,
    claims: parsed.claims.map((claim) => (staysOnFacts(claim.statement, facts) ? claim : { ...claim, statement: claim.quote.slice(0, 220) })),
    dropped: parsed.dropped,
    model: reply.model,
  };
}

/** Fetches and reads a source no one has read in the last day. Claims the person's model run first. */
async function freshSource(userId: string, input: { url?: string; text?: string }): Promise<Source> {
  if (typeof input.text === "string" && input.text.trim() !== "") {
    const text = input.text.trim();
    if (text.length < MIN_PASTE) throw new ScoutError(`Paste at least ${MIN_PASTE} characters.`, 400);
    if (text.length > MAX_PASTE) throw new ScoutError(`Paste at most ${MAX_PASTE.toLocaleString("en-US")} characters, or the link instead.`, 400);
    await claimAgentRun(userId);
    const meta: SourceMeta = { kind: "text", title: null, author: null, publishedAt: null };
    const read = await claimsFrom(meta, text);
    return {
      key: `paste:${createHash("sha256").update(text).digest("hex").slice(0, 32)}`,
      kind: "text",
      url: null,
      title: null,
      author: null,
      publishedAt: null,
      ...sourceStanding({ kind: "text", host: null, handle: null }),
      textOrigin: "pasted",
      attention: attentionCues(text),
      ...read,
    };
  }

  const parsed = parseLink(input.url ?? "");
  if (!parsed.ok) throw new ScoutError(parsed.error, 400);
  const link = parsed.link;

  if (link.kind === "x") {
    const post = await readPost(link.url);
    await claimAgentRun(userId);
    /* The embed dates a post to the day; its id dates it to the millisecond. */
    const publishedAt = (link.statusId !== null ? snowflakeTime(link.statusId) : null) ?? post.publishedAt;
    const meta: SourceMeta = { kind: "x", title: null, author: post.handle !== null ? `@${post.handle}` : post.author, publishedAt };
    const read = await claimsFrom(meta, post.text);
    return {
      key: link.key,
      kind: "x",
      url: post.handle !== null ? `https://x.com/${post.handle}/status/${link.statusId}` : link.url,
      title: null,
      author: meta.author,
      publishedAt,
      ...sourceStanding({ kind: "x", host: null, handle: post.handle }),
      textOrigin: "post",
      attention: attentionCues(post.text),
      ...read,
    };
  }

  if (link.kind === "youtube") {
    const video = await readVideoMeta(link.url);
    await claimAgentRun(userId);
    const transcript = await transcribe(link.url);
    const meta: SourceMeta = { kind: "youtube", title: video.title, author: video.channel, publishedAt: null };
    const read = await claimsFrom(meta, transcript.text);
    return {
      key: link.key,
      kind: "youtube",
      url: link.url,
      title: video.title,
      author: video.channel,
      publishedAt: null,
      ...sourceStanding({ kind: "youtube", host: null, handle: null }),
      textOrigin: "transcript",
      attention: attentionCues(`${video.title ?? ""}\n${transcript.text}`),
      ...read,
    };
  }

  /* Read directly when the site allows it; when it refuses servers (most newsrooms sit behind bot walls), Google fetches it for Gemini.
     The copy is credited to the host that refused Scout after following the link's redirects — never to the pasted address alone,
     so an open redirect on an official site cannot lend its standing to another page. A refusal before any page answered
     (the site did not respond) credits nobody. */
  let direct: Awaited<ReturnType<typeof readArticle>> | null = null;
  let refusedBy: string | null = null;
  try {
    direct = await readArticle(link.url);
  } catch (error) {
    if (!(error instanceof ScoutError) || (error.status !== 502 && error.status !== 422)) throw error;
    refusedBy = error.host;
  }
  await claimAgentRun(userId);
  const article = direct ?? { ...(await copyPage(link.url)), site: null, author: null, publishedAt: null, host: refusedBy ?? "" };
  const meta: SourceMeta = { kind: "article", title: article.title, author: article.author ?? article.site, publishedAt: article.publishedAt };
  const read = await claimsFrom(meta, article.text);
  const standing = sourceStanding({ kind: "article", host: article.host, handle: null });
  return {
    key: link.key,
    kind: "article",
    url: link.url,
    title: article.title,
    author: article.author,
    publishedAt: article.publishedAt,
    tier: standing.tier,
    party: standing.party ?? article.site,
    textOrigin: direct !== null ? "page" : "page_copy",
    attention: attentionCues(`${article.title ?? ""}\n${article.text}`),
    ...read,
  };
}

async function saveSource(source: Source, now: number): Promise<void> {
  /* Pastes are not shared: a person's text stays in their own read. */
  if (source.kind === "text" || source.textOrigin === "pasted") return;
  await serviceClient()
    .from("scout_sources")
    .upsert(
      {
        key: source.key,
        kind: source.kind,
        url: source.url,
        title: source.title,
        author: source.author,
        published_at: source.publishedAt,
        tier: source.tier,
        party: source.party,
        text_origin: source.textOrigin,
        attention: source.attention,
        summary: source.summary,
        claims: source.claims,
        dropped: source.dropped,
        model: source.model,
        read_at: new Date(now).toISOString(),
      },
      { onConflict: "key" },
    );
}

/* --- grading and the market ---------------------------------------------------- */

export function claimViews(
  claims: readonly Claim[],
  tier: SourceTier,
  coins: Set<string>,
  feeds: { announcements: Announcement[]; feeds: Array<{ exchange: Exchange; ok: boolean }> },
  now: number,
): ClaimView[] {
  const answered = feeds.feeds.filter((feed) => feed.ok).map((feed) => feed.exchange);
  return claims
    .map((claim) => {
      const isListing = claim.event === "listing" && claim.asset !== null;
      /* A claim about one exchange is settled only by that exchange's own feed; one Scout cannot read is said so, never settled by another. */
      const named = isListing ? exchangeNamed(`${claim.statement} ${claim.quote}`) : null;
      const readable = named === null || (READ_FEEDS as readonly string[]).includes(named);
      const confirming = isListing && readable ? confirmingListing(claim.asset as string, feeds.announcements, now, named) : null;
      const grade = gradeOf(claim.kind, tier, claim.hedged, confirming !== null);
      const checked = named === null ? answered : answered.filter((exchange) => exchange === named);
      return {
        ...claim,
        coin: claim.asset !== null ? coinForTicker(claim.asset, coins) : null,
        grade,
        confirmedBy: confirming === null ? null : { exchange: confirming.exchange, title: confirming.title, url: confirming.url, at: new Date(confirming.at).toISOString() },
        /* Said only when it matters: a listing the party itself announced needs no other feed. */
        notInFeeds: isListing && readable && confirming === null && grade !== "confirmed" && checked.length > 0 ? checked : null,
        unreadable: isListing && !readable && grade !== "confirmed" ? named : null,
      };
    })
    .sort((a, b) => gradeRank(a.grade) - gradeRank(b.grade));
}

/** The direction of the strongest claim about a coin. */
function leanOf(claims: readonly ClaimView[], coin: string): Direction {
  return claims.find((claim) => claim.coin === coin && claim.direction !== "neutral")?.direction ?? "neutral";
}

async function moveSince(coin: string, since: number, mid: number | null): Promise<number | null> {
  if (mid === null) return null;
  const candles = await hyperliquidCandles(coin, "1h", since, since + 2 * 3_600_000).catch(() => []);
  const open = candles[0]?.open;
  return typeof open === "number" && open > 0 ? Math.round(((mid - open) / open) * 10_000) / 100 : null;
}

export async function assetChecks(claims: readonly ClaimView[], publishedAt: string | null, now: number): Promise<{ assets: AssetCheck[]; flowHours: number }> {
  const coins = [...new Set(claims.map((claim) => claim.coin).filter((coin): coin is string => coin !== null))].slice(0, MAX_ASSETS);
  const published = publishedAt !== null ? Date.parse(publishedAt) : NaN;
  const recent = Number.isFinite(published) && now - published <= DAY_MS && published <= now;
  /* Since the source appeared when that is within the day (an hour at least); otherwise the last day. */
  const windowMs = recent ? Math.max(3_600_000, now - published) : DAY_MS;
  const flowHours = Math.max(1, Math.round(windowMs / 3_600_000));
  if (coins.length === 0) return { assets: [], flowHours };

  const [flowRead, mids, held] = await Promise.all([flowsFor(windowMs).catch(() => null), allMids().catch(() => ({}) as Record<string, string>), holdings()]);
  const priceSince = recent ? published : now - DAY_MS;
  const assets = await Promise.all(
    coins.map(async (coin): Promise<AssetCheck> => {
      const mid = Number(mids[coin]);
      const price = Number.isFinite(mid) && mid > 0 ? mid : null;
      const flow = flowRead?.flows.find((entry) => entry.coin === coin);
      const read = readOf(flow);
      const lean = leanOf(claims, coin);
      const holding = held.holdings.find((entry) => entry.coin === coin) ?? null;
      const verdict =
        read === "quiet" || lean === "neutral" ? "no_read" : (lean === "bullish") === (read === "buying") ? "agrees" : "disagrees";
      return {
        asset: claims.find((claim) => claim.coin === coin)?.asset ?? coin,
        coin,
        price,
        changePct: await moveSince(coin, priceSince, price),
        changeSince: recent ? "published" : "24h",
        flow:
          flow === undefined
            ? null
            : { openedLong: flow.openedLong, openedShort: flow.openedShort, closedLong: flow.closedLong, closedShort: flow.closedShort, boughtUsd: flow.boughtUsd, soldUsd: flow.soldUsd },
        read,
        holding: holding === null ? null : { side: holding.side, wallets: holding.wallets, of: holding.of, status: holding.status },
        verdict,
        lean,
      };
    }),
  );
  return { assets, flowHours };
}

/* --- the read --------------------------------------------------------------------- */

export async function readSource(userId: string, input: { url?: string; text?: string }): Promise<ReadView> {
  const now = Date.now();
  let source: Source | null = null;
  let cached = false;
  if (typeof input.url === "string" && (input.text ?? "").trim() === "") {
    const parsed = parseLink(input.url);
    if (!parsed.ok) throw new ScoutError(parsed.error, 400);
    source = await cachedSource(parsed.link.key, now);
    cached = source !== null;
  }
  if (source === null) {
    source = await freshSource(userId, input);
    await saveSource(source, now);
  }

  const [coins, feeds] = await Promise.all([perpCoins(), listingFeeds().catch(() => ({ announcements: [], feeds: [] }))]);
  const claims = claimViews(source.claims, source.tier, coins, feeds, now);
  const { assets, flowHours } = await assetChecks(claims, source.publishedAt, now);

  const view: ReadView = {
    id: randomUUID(),
    key: source.key,
    kind: source.kind,
    url: source.url,
    title: source.title,
    author: source.author,
    publishedAt: source.publishedAt,
    readAt: new Date(now).toISOString(),
    tier: source.tier,
    party: source.party,
    textOrigin: source.textOrigin,
    attention: source.attention,
    summary: source.summary,
    claims,
    assets,
    dropped: source.dropped,
    model: source.model,
    cached,
    flowHours,
  };
  await serviceClient().from("scout_reads").insert({ id: view.id, user_id: userId, source_key: source.key, view, created_at: view.readAt });
  return view;
}

export const HISTORY = 12;

/** The person's last reads, as they were when read. */
export async function readHistory(userId: string): Promise<{ reads: ReadView[]; error: string | null }> {
  const { data, error } = await serviceClient()
    .from("scout_reads")
    .select("view, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  if (error !== null) {
    const missing = error.code === "42P01" || error.code === "PGRST205";
    return { reads: [], error: missing ? "Scout needs its tables: run migration 0035_scout.sql." : "Your reads could not be loaded." };
  }
  return { reads: (data ?? []).map((row) => (row as { view: ReadView }).view), error: null };
}
