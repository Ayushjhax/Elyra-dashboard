/* ---------------------------------------------------------------------------
   Elyra's Daily Briefing, as the website reads it.

   Ten items a day, each one development written from one source's facts,
   with that source linked — and "And more": the day's movers, stablecoin
   yields and market signals, computed by code at publication. Written once a
   day (lib/briefing/run.ts) and kept, so any past day reads as it was.
--------------------------------------------------------------------------- */

export type BriefingKind = "news" | "governance" | "security";

export interface BriefingSource {
  /** The outlet or record: "The Block", "Snapshot · Aave DAO", "DefiLlama". */
  name: string;
  url: string;
}

export interface BriefingItem {
  kind: BriefingKind;
  /** A token the item names, held to the facts and to Pyth's catalogue; null when none. */
  ticker: string | null;
  /** Pyth's id for `ticker`, so the website can open it on the chart. */
  assetId: number | null;
  headline: string;
  body: string;
  /** Simplified Chinese, when the translation stayed on the facts; null shows the English. */
  headlineZh: string | null;
  bodyZh: string | null;
  sources: BriefingSource[];
  /** What the item was written from — kept so every line can be audited. */
  facts: string[];
  /** "model" when the writer's text passed the guard, "source" when the source's own words stand in. */
  writtenBy: "model" | "source";
}

export interface BriefingMover {
  symbol: string;
  changePct: number;
  priceUsd: number;
}

export interface BriefingYield {
  name: string;
  asset: string;
  apyPct: number;
  tvlUsd: number | null;
}

export interface BriefingSignal {
  symbol: string;
  direction: "positive" | "negative" | "neutral";
  title: string;
  strength: "low" | "medium" | "high";
}

export interface BriefingExtras {
  gainers: BriefingMover[];
  losers: BriefingMover[];
  yields: BriefingYield[];
  signals: BriefingSignal[];
}

export interface Briefing {
  /** The UTC day it covers the run-up to: "2026-11-21". */
  day: string;
  publishedAt: string;
  items: BriefingItem[];
  extras: BriefingExtras;
}

export interface BriefingResponse {
  briefing: Briefing | null;
  /** Days with a published briefing, newest first. */
  days: string[];
  /** When today's will be published, if it is not out yet. */
  nextAt: string | null;
  error: string | null;
}

/** 00:00 UTC — 08:00 in Beijing and Singapore, the evening before in New York. */
export const BRIEFING_HOUR_UTC = 0;

export const BRIEFING_ITEMS = 10;
