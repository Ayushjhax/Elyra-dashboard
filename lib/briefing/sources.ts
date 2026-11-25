import "server-only";

import { defillamaHacks } from "@/lib/events/defillama";
import type { RawHack } from "@/lib/events/feed";
import { governanceCandidates, newsCandidates, SNAPSHOT_SPACES, securityCandidate, type Candidate, type OutletFeed, type SnapshotProposal } from "@/lib/briefing/candidates";
import { parseRss } from "@/lib/briefing/rss";

/* ---------------------------------------------------------------------------
   Where the briefing's developments come from, read live once a day:

   - six crypto newsrooms' public RSS feeds — headlines, standfirsts and
     links, nothing behind a paywall or a key;
   - Snapshot's public GraphQL for the DAOs in SNAPSHOT_SPACES;
   - DefiLlama's hack record (lib/events/defillama.ts).

   Each source is read on its own and may fail on its own: a briefing with
   five outlets is still a briefing, and the notes say which did not answer.
--------------------------------------------------------------------------- */

export const OUTLETS: ReadonlyArray<{ outlet: string; url: string }> = [
  { outlet: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { outlet: "The Block", url: "https://www.theblock.co/rss.xml" },
  { outlet: "Decrypt", url: "https://decrypt.co/feed" },
  { outlet: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { outlet: "The Defiant", url: "https://thedefiant.io/api/feed" },
  { outlet: "Blockworks", url: "https://blockworks.co/feed" },
];

const SNAPSHOT_URL = "https://hub.snapshot.org/graphql";
/* Generous: the six outlets and Snapshot are read at once, once a day. */
const TIMEOUT_MS = 20_000;

async function readOutlet(outlet: string, url: string): Promise<OutletFeed> {
  const response = await fetch(url, {
    headers: { accept: "application/rss+xml, application/xml, text/xml", "user-agent": "elyra-server/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${outlet} returned ${response.status}`);
  return { outlet, items: parseRss(await response.text()) };
}

async function readSnapshot(now: number): Promise<SnapshotProposal[]> {
  const since = Math.floor(now / 1000) - 4 * 86_400;
  const query = `query ($spaces: [String], $since: Int) {
    proposals(first: 100, where: { space_in: $spaces, created_gte: $since }, orderBy: "created", orderDirection: desc) {
      id title state created end votes choices scores scores_total link space { id name }
    }
  }`;
  const response = await fetch(SNAPSHOT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "elyra-server/1.0" },
    body: JSON.stringify({ query, variables: { spaces: Object.keys(SNAPSHOT_SPACES), since } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Snapshot returned ${response.status}`);
  const body = (await response.json()) as { data?: { proposals?: unknown } };
  const proposals = body.data?.proposals;
  if (!Array.isArray(proposals)) throw new Error("Snapshot returned no proposals list");
  return proposals.filter(
    (proposal): proposal is SnapshotProposal =>
      typeof proposal === "object" &&
      proposal !== null &&
      typeof (proposal as SnapshotProposal).title === "string" &&
      typeof (proposal as SnapshotProposal).space?.id === "string" &&
      Array.isArray((proposal as SnapshotProposal).choices) &&
      Array.isArray((proposal as SnapshotProposal).scores),
  );
}

export interface Gathered {
  candidates: Candidate[];
  notes: string[];
}

export async function gatherCandidates(now: number): Promise<Gathered> {
  const notes: string[] = [];
  const failed = (what: string) => (error: unknown) => {
    notes.push(`${what}: ${error instanceof Error ? error.message : "unavailable"}`);
    return null;
  };

  const [feeds, proposals, hacks] = await Promise.all([
    Promise.all(OUTLETS.map(({ outlet, url }) => readOutlet(outlet, url).catch(failed(outlet)))),
    readSnapshot(now).catch(failed("Snapshot")),
    defillamaHacks().catch(failed("DefiLlama")),
  ]);

  const candidates = [
    ...newsCandidates(feeds.filter((feed): feed is OutletFeed => feed !== null), now),
    ...governanceCandidates(proposals ?? [], now),
  ];
  const security = securityCandidate((hacks as RawHack[] | null) ?? [], now);
  if (security !== null) candidates.push(security);
  return { candidates, notes };
}
