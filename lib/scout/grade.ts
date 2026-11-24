/* ---------------------------------------------------------------------------
   How much a claim is worth, decided by code.

   Two posts land at once: one says an exchange has officially announced it
   will list a token, the other that the community is speculating it might.
   Attention goes to the louder one before either has been read. Scout's job
   is to undo that: every claim is placed on one scale, by who said it and
   how they said it, and shown in that order, never by how loud it was.

   The model reads the source and says what each claim is (an announcement,
   a report, speculation or opinion) and quotes it. Everything else is code:

     - the source's tier: the party itself (an exchange's own site or its
       account on X), a newsroom, or anyone else. Read from the address the
       source was fetched from and the author X itself reports, never from
       what the text says about itself;
     - hedging in the quote ("reportedly", "could", "sources say"), which
       turns a claimed announcement into speculation whatever the model said;
     - an official exchange feed that confirms a listing (lib/scout/listings.ts),
       which settles a listing claim either way.

   And the attention words — 🚨, BREAKING, "!!" — are counted and shown, so a
   reader sees the volume for what it is.

   Pure.
--------------------------------------------------------------------------- */

export type SourceTier = "primary" | "newsroom" | "unverified";
export type ClaimKind = "announcement" | "report" | "speculation" | "opinion";
export type Grade = "confirmed" | "reported" | "unverified" | "speculation" | "opinion";
export type Direction = "bullish" | "bearish" | "neutral";
export type ClaimEvent = "listing" | "delisting" | "launch" | "partnership" | "hack" | "regulation" | "earnings" | "macro" | "price" | "other";

export const CLAIM_KINDS: readonly ClaimKind[] = ["announcement", "report", "speculation", "opinion"];
export const DIRECTIONS: readonly Direction[] = ["bullish", "bearish", "neutral"];
export const CLAIM_EVENTS: readonly ClaimEvent[] = ["listing", "delisting", "launch", "partnership", "hack", "regulation", "earnings", "macro", "price", "other"];

/** Strongest first. Claims are shown in this order. */
export const GRADE_ORDER: readonly Grade[] = ["confirmed", "reported", "unverified", "speculation", "opinion"];

/**
 * Sites that ARE the party: an exchange's own announcements, a regulator's
 * own releases. A subdomain counts (announcements.bybit.com).
 */
export const OFFICIAL_HOSTS: Readonly<Record<string, string>> = {
  "binance.com": "Binance",
  "coinbase.com": "Coinbase",
  "kraken.com": "Kraken",
  "okx.com": "OKX",
  "bybit.com": "Bybit",
  "upbit.com": "Upbit",
  "hyperliquid.xyz": "Hyperliquid",
  "robinhood.com": "Robinhood",
  "sec.gov": "the SEC",
  "cftc.gov": "the CFTC",
  "federalreserve.gov": "the Federal Reserve",
  "treasury.gov": "the US Treasury",
  "ethereum.org": "the Ethereum Foundation",
  "solana.com": "Solana",
};

/** Accounts on X that are the party itself, by handle (lowercase). */
export const OFFICIAL_HANDLES: Readonly<Record<string, string>> = {
  binance: "Binance",
  coinbase: "Coinbase",
  coinbaseassets: "Coinbase",
  coinbasemarkets: "Coinbase",
  krakenfx: "Kraken",
  okx: "OKX",
  bybit_official: "Bybit",
  hyperliquidx: "Hyperliquid",
  robinhoodapp: "Robinhood",
  secgov: "the SEC",
  federalreserve: "the Federal Reserve",
  solana: "Solana",
  ethereum: "Ethereum",
};

/** Newsrooms with editors: the briefing's outlets (lib/briefing/sources.ts) and the wires. */
export const NEWSROOM_HOSTS: Readonly<Record<string, string>> = {
  "coindesk.com": "CoinDesk",
  "theblock.co": "The Block",
  "decrypt.co": "Decrypt",
  "cointelegraph.com": "Cointelegraph",
  "thedefiant.io": "The Defiant",
  "blockworks.co": "Blockworks",
  "dlnews.com": "DL News",
  "reuters.com": "Reuters",
  "bloomberg.com": "Bloomberg",
  "wsj.com": "The Wall Street Journal",
  "ft.com": "Financial Times",
  "cnbc.com": "CNBC",
  "apnews.com": "AP",
  "nytimes.com": "The New York Times",
  "axios.com": "Axios",
};

export const NEWSROOM_HANDLES: Readonly<Record<string, string>> = {
  coindesk: "CoinDesk",
  theblock__: "The Block",
  decryptmedia: "Decrypt",
  cointelegraph: "Cointelegraph",
  blockworks_: "Blockworks",
  reuters: "Reuters",
  business: "Bloomberg",
  wsj: "The Wall Street Journal",
  ft: "Financial Times",
  cnbc: "CNBC",
  ap: "AP",
};

function byHost(table: Readonly<Record<string, string>>, host: string): string | null {
  const bare = host.toLowerCase().replace(/^www\./, "");
  for (const [domain, name] of Object.entries(table)) {
    if (bare === domain || bare.endsWith(`.${domain}`)) return name;
  }
  return null;
}

export interface SourceStanding {
  tier: SourceTier;
  /** Who the source is, when code knows: "Binance", "CoinDesk". */
  party: string | null;
}

/**
 * Who is speaking. An article by the site it was fetched from; a post by the
 * author X reports for it (the handle in a pasted link can be anything — X
 * answers with the real author); a video or pasted text is unverified,
 * because code cannot tell an exchange's channel from one named after it.
 */
export function sourceStanding(input: { kind: "youtube" | "x" | "article" | "text"; host: string | null; handle: string | null }): SourceStanding {
  if (input.kind === "x" && input.handle !== null) {
    const handle = input.handle.toLowerCase();
    const official = OFFICIAL_HANDLES[handle];
    if (official !== undefined) return { tier: "primary", party: official };
    const newsroom = NEWSROOM_HANDLES[handle];
    if (newsroom !== undefined) return { tier: "newsroom", party: newsroom };
    return { tier: "unverified", party: null };
  }
  if (input.kind === "article" && input.host !== null) {
    const official = byHost(OFFICIAL_HOSTS, input.host);
    if (official !== null) return { tier: "primary", party: official };
    const newsroom = byHost(NEWSROOM_HOSTS, input.host);
    if (newsroom !== null) return { tier: "newsroom", party: newsroom };
  }
  return { tier: "unverified", party: null };
}

/**
 * Words that make a statement a possibility rather than a fact. "May" counts
 * only as a verb: "May 5" and "May 2026" are dates.
 */
const HEDGE =
  /\b(rumou?rs?|rumou?red|reportedly|speculat\w*|allegedly|unconfirmed|could|might|possibly|perhaps|in talks|considering|if true|insiders?|sources (?:say|said|claim|familiar)|people familiar|according to sources)\b|\bmay\b(?!\s+\d)/i;

export function isHedged(quote: string): boolean {
  return HEDGE.test(quote);
}

/**
 * The grade, from the claim's kind, the source's tier and whether its quote
 * hedges. A listing an official feed confirms is confirmed whatever the
 * source; one the feeds do not show stays as graded.
 */
export function gradeOf(kind: ClaimKind, tier: SourceTier, hedged: boolean, confirmedByFeed = false): Grade {
  if (kind === "opinion") return "opinion";
  if (confirmedByFeed) return "confirmed";
  if (kind === "speculation" || hedged) return "speculation";
  if (kind === "announcement") return tier === "primary" ? "confirmed" : tier === "newsroom" ? "reported" : "unverified";
  return tier === "unverified" ? "unverified" : "reported";
}

export function gradeRank(grade: Grade): number {
  return GRADE_ORDER.indexOf(grade);
}

/* --- attention -------------------------------------------------------------- */

const ALARM_EMOJI = ["🚨", "‼️", "⚠️", "🔥", "🚀", "💥", "📢", "🤯", "💰", "🌕"];
const LOUD_WORDS: ReadonlyArray<[RegExp, string]> = [
  [/\bbreaking\b/i, "BREAKING"],
  [/\bjust in\b/i, "JUST IN"],
  [/\bhuge\b/i, "huge"],
  [/\bmassive\b/i, "massive"],
  [/\binsane\b/i, "insane"],
  [/\burgent\b/i, "urgent"],
  [/\bdon'?t miss\b/i, "don't miss"],
  [/\blast chance\b/i, "last chance"],
  [/\b\d{2,5}x\b/i, "100x"],
  [/\bto the moon\b|\bmooning\b/i, "moon"],
  [/\bguaranteed\b/i, "guaranteed"],
  [/\bexplod(e|es|ing)\b/i, "explode"],
];
const MAX_CUES = 6;

/**
 * The words and marks in a source that grab attention, in the order they are
 * checked. They change nothing about a grade; they are shown so the reader
 * can discount them.
 */
export function attentionCues(text: string): string[] {
  const head = text.slice(0, 1_500);
  const cues: string[] = [];
  for (const emoji of ALARM_EMOJI) if (head.includes(emoji)) cues.push(emoji);
  for (const [pattern, label] of LOUD_WORDS) if (pattern.test(head)) cues.push(label);
  if (/[!！]{2,}/.test(head)) cues.push("!!");
  const shouted = head.match(/\b[A-Z]{4,}\b/g) ?? [];
  /* Tickers are capitals too; three shouted words that are not short tickers is shouting. */
  if (shouted.filter((word) => word.length >= 5 && !/^(USDT|USDC|BREAKING)$/.test(word)).length >= 3) cues.push("ALL CAPS");
  return [...new Set(cues)].slice(0, MAX_CUES);
}
