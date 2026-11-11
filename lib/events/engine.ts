import "server-only";

import { writeFromFacts } from "@/lib/arena/writer";
import { defillamaHacks } from "@/lib/events/defillama";
import { formatAmountUsd, hackItem, hackKey, historyItems, onThisDay, postableHacks, type RawHack } from "@/lib/events/feed";
import { assetsBySymbols } from "@/lib/market/pyth/catalog";
import { dayStatsForAssets } from "@/lib/market/pyth/change";
import { pricesForIds } from "@/lib/market/pyth/client";
import { serviceClient } from "@/lib/supabase/server";

/* ---------------------------------------------------------------------------
   Elyra's AI posts on the events feed, from the five-minute tick — "from time
   to time", not on every tick. It posts only when there is something to say:

     1. a hack DefiLlama has recorded in the last three days, of $1 million
        or more (at most HACKS_PER_RUN a run, largest first);
     2. a move of MOVE_PCT or more in a day in BTC, ETH or SOL, once per coin
        per UTC day;
     3. "on this day", once per UTC day, when the history has an
        anniversary for it.

   Each post is written by the model from computed facts and held to their
   numbers (lib/arena/writer.ts), or by the code when the model is down or
   strays. `post_key` is unique, so a tick that runs twice posts once.
--------------------------------------------------------------------------- */

export const HACKS_PER_RUN = 3;
export const MOVE_PCT = 8;
export const MOVE_COINS = ["BTC", "ETH", "SOL"] as const;

const SYSTEM = [
  "You write one short post for Elyra's crypto events feed, from facts you are given.",
  "Use only those facts. Repeat a number only exactly as it appears in them; never compute, round or introduce a new one.",
  "Never guess who is responsible, why something happened or what comes next, unless a fact says so.",
  "Do not tell the reader what to buy, sell or trade. Two or three plain sentences. No exclamation marks, no emoji, no hashtags, no hype.",
].join(" ");

export interface EventsReport {
  posted: number;
  notes: string[];
}

const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);

export async function runEvents(now: number = Date.now()): Promise<EventsReport> {
  const report: EventsReport = { posted: 0, notes: [] };
  const db = serviceClient();

  const existing = async (keys: string[]): Promise<Set<string>> => {
    if (keys.length === 0) return new Set();
    const { data, error } = await db.from("event_posts").select("post_key").in("post_key", keys);
    if (error !== null) throw new Error("Events need database migration 0023.");
    return new Set((data ?? []).map((row) => row.post_key as string));
  };

  const post = async (row: {
    post_key: string;
    kind: "hack" | "move" | "onthisday";
    refers_to: string | null;
    title: string;
    task: string;
    facts: string[];
    fallback: string;
    amount_usd?: number | null;
    chains?: string[];
    source_url?: string | null;
    occurred_at: string;
  }) => {
    const written = await writeFromFacts(row.task, row.facts, row.fallback, { system: SYSTEM, maxTokens: 200 });
    const { error } = await db.from("event_posts").insert({
      post_key: row.post_key,
      kind: row.kind,
      refers_to: row.refers_to,
      title: row.title,
      body: written.text.slice(0, 1200),
      facts: row.facts,
      model: written.model,
      amount_usd: row.amount_usd ?? null,
      chains: row.chains ?? [],
      source_url: row.source_url ?? null,
      occurred_at: row.occurred_at,
    });
    /* A duplicate key means another run posted it first: not an error. */
    if (error === null) report.posted += 1;
  };

  /* ---- 1. new hacks ---- */
  let hacks: RawHack[] = [];
  try {
    hacks = await defillamaHacks();
  } catch (error) {
    report.notes.push(`hacks: ${error instanceof Error ? error.message : "unavailable"}`);
  }
  const fresh = postableHacks(hacks, now);
  if (fresh.length > 0) {
    const done = await existing(fresh.map(hackKey));
    for (const hack of fresh.filter((candidate) => !done.has(hackKey(candidate))).slice(0, HACKS_PER_RUN)) {
      try {
        const item = hackItem(hack);
        const amount = formatAmountUsd(item.amountUsd as number);
        const facts = [
          `Project: ${hack.name}`,
          `Recorded by DefiLlama on ${item.at.slice(0, 10)}`,
          `Amount taken: ${amount}`,
          ...(item.chains.length > 0 ? [`Chains: ${item.chains.join(", ")}`] : []),
          ...(hack.classification ? [`Classification: ${hack.classification}`] : []),
          ...(hack.technique ? [`Technique: ${hack.technique}`] : []),
          ...(item.returnedUsd !== null ? [`Funds returned so far: ${formatAmountUsd(item.returnedUsd)}`] : []),
          ...(hack.description ? [`DefiLlama's description: ${hack.description.slice(0, 400)}`] : []),
        ];
        const method = hack.technique ? ` The technique is recorded as ${hack.technique.toLowerCase()}.` : "";
        await post({
          post_key: item.key,
          kind: "hack",
          refers_to: item.key,
          title: item.title,
          task: "Write a post reporting this newly recorded hack.",
          facts,
          fallback: `${hack.name} has lost ${amount}${item.chains.length > 0 ? ` on ${item.chains.join(", ")}` : ""}, as recorded by DefiLlama.${method}`,
          amount_usd: item.amountUsd,
          chains: item.chains,
          source_url: item.link?.url ?? null,
          occurred_at: item.at,
        });
      } catch (error) {
        report.notes.push(`hack ${hack.name}: ${error instanceof Error ? error.message : "failed"}`);
      }
    }
  }

  /* ---- 2. large moves ---- */
  try {
    const day = utcDay(now);
    const keys = MOVE_COINS.map((coin) => `move:${coin}:${day}`);
    const done = await existing(keys);
    const pending = MOVE_COINS.filter((coin) => !done.has(`move:${coin}:${day}`));
    if (pending.length > 0) {
      const assets = (await assetsBySymbols([...pending])).filter((asset) => asset.assetType === "crypto");
      const [stats, prices] = await Promise.all([dayStatsForAssets(assets), pricesForIds(assets.map((asset) => asset.id))]);
      for (const asset of assets) {
        const stat = stats.get(asset.id);
        const price = prices.find((row) => row.id === asset.id)?.price;
        if (stat === undefined || price === undefined || Math.abs(stat.change24hPct) < MOVE_PCT) continue;
        const change = `${stat.change24hPct >= 0 ? "+" : ""}${stat.change24hPct.toFixed(1)}%`;
        const facts = [
          `${asset.symbol} price: $${Number(price.toPrecision(6))}`,
          `Change over 24 hours: ${change}`,
          ...(stat.high24h !== null && stat.low24h !== null
            ? [`24-hour range: $${Number(stat.low24h.toPrecision(6))} to $${Number(stat.high24h.toPrecision(6))}`]
            : []),
        ];
        await post({
          post_key: `move:${asset.symbol}:${day}`,
          kind: "move",
          refers_to: null,
          title: `${asset.symbol} ${stat.change24hPct >= 0 ? "up" : "down"} ${change.replace(/^[+-]/, "")} in a day`,
          task: "Write a post noting this large one-day move.",
          facts,
          fallback: `${asset.symbol} is ${change} over 24 hours, at $${Number(price.toPrecision(6))}.`,
          occurred_at: new Date(now).toISOString(),
        });
      }
    }
  } catch (error) {
    report.notes.push(`moves: ${error instanceof Error ? error.message : "failed"}`);
  }

  /* ---- 3. on this day ---- */
  try {
    const day = utcDay(now);
    const key = `onthisday:${day}`;
    if (!(await existing([key])).has(key)) {
      const matches = onThisDay(historyItems(hacks), day).slice(0, 4);
      if (matches.length > 0) {
        const facts = matches.map(
          (item) => `${item.at.slice(0, 4)}: ${item.title}${item.amountUsd !== null ? ` (${formatAmountUsd(item.amountUsd)})` : ""}`,
        );
        await post({
          post_key: key,
          kind: "onthisday",
          refers_to: null,
          title: `On this day: ${matches[0].title}`,
          task: "Write an 'on this day' post recalling these events from past years on today's date.",
          facts,
          fallback: `On this day: ${facts.join(". ")}.`,
          occurred_at: new Date(now).toISOString(),
        });
      }
    }
  } catch (error) {
    report.notes.push(`on this day: ${error instanceof Error ? error.message : "failed"}`);
  }

  return report;
}
