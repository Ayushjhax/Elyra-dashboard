import { formatAmountUsd, type RawHack } from "@/lib/events/feed";
import type { FeedItem } from "@/lib/briefing/rss";
import type { BriefingKind, BriefingSource } from "@/lib/briefing/types";

/* ---------------------------------------------------------------------------
   What the briefing could say, before anyone writes a word. Pure.

   Every candidate is something a source published — a story, a DAO vote, a
   recorded hack — with the facts it was written from and a weight the code
   computes: a story three outlets ran outweighs one only one did, and a DAO
   vote that has closed outweighs one still open. The writer chooses among
   them and writes from their facts; it never adds a development of its own.
--------------------------------------------------------------------------- */

export interface Candidate {
  id: string;
  kind: BriefingKind;
  title: string;
  summary: string;
  /** When the source published it, or the vote opened or closed. */
  at: string;
  sources: BriefingSource[];
  /** Lines the writer may use, and the only place a number may come from. */
  facts: string[];
  /** A token the source itself attaches — a DAO's governance token. */
  token: string | null;
  weight: number;
}

export const NEWS_WINDOW_HOURS = 24;
export const GOVERNANCE_WINDOW_HOURS = 36;
export const SECURITY_WINDOW_HOURS = 48;
/** Hacks below this are noise in a daily summary. */
export const SECURITY_MIN_USD = 250_000;

/* ---- news ---- */

/**
 * What is not news: price calls, explainers, opinion, promotion and digests
 * of other days. Matched on the headline and the link's path.
 */
const NOISE_TITLE =
  /\bprice (prediction|analysis|forecast)s?\b|\bpodcast\b|\bnewsletter\b|\bsponsored\b|\bpress release\b|\bop-?ed\b|\bopinion\b|\bexplain(ed|er)\b|^how to\b|^what is\b|\bguide to\b|\btop \d+\b|\bweek in review\b|\bdaily recap\b|\bmarket wrap\b|\bthe daily\b|\bmorning brief\b|\bwhat .{0,40}\bmeans?\b|\bwhat it measures\b/i;
const NOISE_PATH = /\/(sponsored|press-releases?|explained|opinion|podcasts?|learn|how-to|price-analysis|price-predictions?|videos?|newsletters?|research-reports?)\//i;

export function isNoise(item: Pick<FeedItem, "title" | "link">): boolean {
  return NOISE_TITLE.test(item.title) || NOISE_PATH.test(item.link);
}

const STOP = new Set(
  "the and for with from that this into over after amid says said will its has have are was were new more than about what why how who their they could would after before onto as of on in to by at up a an is be it or not but out off".split(" "),
);

/** The words a headline is about, for telling the same story from two outlets. */
export function headlineTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .split(/[^a-z0-9$]+/)
      .filter((word) => word.length >= 3 && !STOP.has(word)),
  );
}

/** Two headlines about the same development: most of their words shared. */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  const union = a.size + b.size - shared;
  return shared >= 3 && union > 0 && shared / union >= 0.34;
}

export interface OutletFeed {
  outlet: string;
  items: readonly FeedItem[];
}

const day = (iso: string) => iso.slice(0, 10);

export function newsCandidates(feeds: readonly OutletFeed[], now: number, windowHours = NEWS_WINDOW_HOURS): Candidate[] {
  const since = now - windowHours * 3_600_000;
  const stories: Array<{ tokens: Set<string>; entries: Array<{ outlet: string; item: FeedItem }> }> = [];

  for (const feed of feeds) {
    for (const item of feed.items) {
      if (item.publishedAt === null) continue;
      const at = Date.parse(item.publishedAt);
      if (at < since || at > now + 600_000 || isNoise(item)) continue;
      const tokens = headlineTokens(item.title);
      const story = stories.find((candidate) => sameStory(candidate.tokens, tokens));
      if (story === undefined) {
        stories.push({ tokens, entries: [{ outlet: feed.outlet, item }] });
      } else if (!story.entries.some((entry) => entry.outlet === feed.outlet)) {
        story.entries.push({ outlet: feed.outlet, item });
        for (const token of tokens) story.tokens.add(token);
      }
    }
  }

  return stories.map((story) => {
    /* The earliest report leads; the fullest summary describes it. */
    const entries = [...story.entries].sort((a, b) => Date.parse(a.item.publishedAt ?? "") - Date.parse(b.item.publishedAt ?? ""));
    const lead = entries[0];
    const summary = entries.map((entry) => entry.item.description).sort((a, b) => b.length - a.length)[0] ?? "";
    const newest = Math.max(...entries.map((entry) => Date.parse(entry.item.publishedAt ?? "")));
    const freshness = Math.max(0, 1 - (now - newest) / (windowHours * 3_600_000));
    return {
      id: `news:${lead.item.link}`,
      kind: "news" as const,
      title: lead.item.title,
      summary,
      at: lead.item.publishedAt as string,
      sources: entries.map((entry) => ({ name: entry.outlet, url: entry.item.link })),
      facts: [
        ...entries.map((entry) => `Headline (${entry.outlet}, ${day(entry.item.publishedAt as string)}): ${entry.item.title}`),
        ...(summary === "" ? [] : [`Summary: ${summary.slice(0, 600)}`]),
      ],
      token: null,
      weight: entries.length * 3 + freshness,
    };
  });
}

/* ---- governance ---- */

/** The DAOs whose votes the briefing follows, and the token each governs. */
export const SNAPSHOT_SPACES: Readonly<Record<string, string>> = {
  "aavedao.eth": "AAVE",
  "lido-snapshot.eth": "LDO",
  "uniswapgovernance.eth": "UNI",
  "arbitrumfoundation.eth": "ARB",
  "opcollective.eth": "OP",
  "ens.eth": "ENS",
  "starknet.eth": "STRK",
  "balancer.eth": "BAL",
  "cvx.eth": "CVX",
  "gmx.eth": "GMX",
  "apecoin.eth": "APE",
  "safe.eth": "SAFE",
  "1inch.eth": "1INCH",
  "morpho.eth": "MORPHO",
  "etherfi-dao.eth": "ETHFI",
  "stgdao.eth": "STG",
  "sushigov.eth": "SUSHI",
  "frax.eth": "FXS",
};

export interface SnapshotProposal {
  id: string;
  title: string;
  space: { id: string; name: string };
  state: string;
  created: number;
  end: number;
  votes: number;
  choices: string[];
  scores: number[];
  scores_total: number;
  link: string;
}

/** A vote that opened or closed in the window, with enough voters to matter. */
export function governanceCandidates(proposals: readonly SnapshotProposal[], now: number, windowHours = GOVERNANCE_WINDOW_HOURS): Candidate[] {
  const since = now - windowHours * 3_600_000;
  const out: Candidate[] = [];
  for (const proposal of proposals) {
    const token = SNAPSHOT_SPACES[proposal.space.id] ?? null;
    if (token === null || !/^https:\/\//.test(proposal.link)) continue;
    const opened = proposal.created * 1000;
    const closed = proposal.end * 1000;
    const closedInWindow = proposal.state === "closed" && closed >= since && closed <= now;
    const openedInWindow = proposal.state === "active" && opened >= since;
    if (!closedInWindow && !openedInWindow) continue;
    if (closedInWindow && proposal.votes < 10) continue;

    const facts = [
      `DAO: ${proposal.space.name}, governing ${token}`,
      `Proposal: ${proposal.title}`,
      closedInWindow ? `Voting closed on ${day(new Date(closed).toISOString())}` : `Voting opened on ${day(new Date(opened).toISOString())} and closes on ${day(new Date(closed).toISOString())}`,
      `Votes cast: ${proposal.votes}`,
    ];
    if (closedInWindow && proposal.scores_total > 0 && proposal.scores.length === proposal.choices.length) {
      const leading = proposal.scores.indexOf(Math.max(...proposal.scores));
      const share = (proposal.scores[leading] / proposal.scores_total) * 100;
      facts.push(`Result: "${proposal.choices[leading]}" received ${share.toFixed(2)}% of the voting power`);
    }
    out.push({
      id: `gov:${proposal.id}`,
      kind: "governance",
      title: `${proposal.space.name}: ${proposal.title}`,
      summary: facts.slice(2).join(". "),
      at: new Date(closedInWindow ? closed : opened).toISOString(),
      sources: [{ name: `Snapshot · ${proposal.space.name}`, url: proposal.link }],
      facts,
      token,
      weight: closedInWindow ? 2 + Math.min(2, Math.log10(Math.max(1, proposal.votes)) / 2) : 1.5,
    });
  }
  return out;
}

/* ---- security ---- */

/**
 * The window's recorded hacks as one candidate — "incidents continue" reads
 * better as one item than three — or none when there were none.
 */
export function securityCandidate(hacks: readonly RawHack[], now: number, windowHours = SECURITY_WINDOW_HOURS): Candidate | null {
  const since = now - windowHours * 3_600_000;
  const recent = hacks
    .filter((hack) => hack.date * 1000 >= since && hack.date * 1000 <= now && (hack.amount ?? 0) >= SECURITY_MIN_USD)
    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
    .slice(0, 5);
  if (recent.length === 0) return null;
  const facts = recent.map((hack) => {
    const parts = [
      `${hack.name}: ${formatAmountUsd(hack.amount as number)} taken`,
      ...(hack.chain && hack.chain.length > 0 ? [`on ${hack.chain.join(", ")}`] : []),
      ...(hack.technique ? [`technique recorded as ${hack.technique.toLowerCase()}`] : []),
      ...(hack.returnedFunds ? [`${formatAmountUsd(hack.returnedFunds)} returned`] : []),
      `recorded ${day(new Date(hack.date * 1000).toISOString())}`,
    ];
    return parts.join("; ");
  });
  return {
    id: `security:${day(new Date(now).toISOString())}`,
    kind: "security",
    title: recent.length === 1 ? `${recent[0].name} exploited` : "Security incidents recorded by DefiLlama",
    summary: facts.join(". "),
    at: new Date(recent[0].date * 1000).toISOString(),
    sources: [{ name: "DefiLlama", url: "https://defillama.com/hacks" }],
    facts: [`Hacks DefiLlama recorded in the last ${windowHours} hours:`, ...facts],
    token: null,
    weight: 2.5 + recent.length * 0.5,
  };
}

/** The strongest candidates, at most `limit`, governance and security capped so news leads. */
export function shortlist(candidates: readonly Candidate[], limit = 36): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.weight - a.weight || Date.parse(b.at) - Date.parse(a.at));
  const governance = sorted.filter((candidate) => candidate.kind === "governance").slice(0, 6);
  const security = sorted.filter((candidate) => candidate.kind === "security").slice(0, 1);
  const news = sorted.filter((candidate) => candidate.kind === "news").slice(0, limit - governance.length - security.length);
  return [...news, ...governance, ...security].sort((a, b) => b.weight - a.weight);
}
