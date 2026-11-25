import type { AutoBuyRule, Trigger } from "@/lib/scout/autobuy";
import type { CoinFlow, FlowSignal, SmartMoneyRead } from "@/lib/scout/flows";
import type { ClaimEvent, ClaimKind, Direction, Grade, SourceTier } from "@/lib/scout/grade";
import type { AnnouncementKind, Exchange } from "@/lib/scout/listings";

/* What Scout's routes answer, shared by the server and the page. */

export type SourceKind = "youtube" | "x" | "article" | "text";

export interface ClaimView {
  asset: string | null;
  /** The Hyperliquid market the asset trades as, when it trades there. */
  coin: string | null;
  statement: string;
  quote: string;
  kind: ClaimKind;
  direction: Direction;
  event: ClaimEvent;
  hedged: boolean;
  grade: Grade;
  /** The exchange's own announcement that confirms a listing claim. */
  confirmedBy: { exchange: Exchange; title: string; url: string; at: string } | null;
  /** A listing claim the official feeds were checked for and did not show: the feeds read. */
  notInFeeds: Exchange[] | null;
  /** A listing claim about an exchange whose feed Scout cannot read for free (Binance, Coinbase…). */
  unreadable: string | null;
}

export interface AssetCheck {
  asset: string;
  coin: string;
  price: number | null;
  /** The move since the source was published (when known and recent), else over 24 hours. */
  changePct: number | null;
  changeSince: "published" | "24h";
  flow: Omit<CoinFlow, "coin" | "lastAt"> | null;
  read: SmartMoneyRead;
  /** The cohort's open positions in the market, when three or more agree. */
  holding: { side: "LONG" | "SHORT"; wallets: number; of: number | null; status: string } | null;
  /** The source's lean against what smart money did. */
  verdict: "agrees" | "disagrees" | "no_read";
  lean: Direction;
}

export interface ReadView {
  id: string;
  key: string;
  kind: SourceKind;
  url: string | null;
  title: string | null;
  author: string | null;
  publishedAt: string | null;
  readAt: string;
  tier: SourceTier;
  party: string | null;
  /** Where the text came from: the page, Gemini's copy of a page that blocks servers, the post, a transcript Gemini wrote, or the reader's paste. */
  textOrigin: "page" | "page_copy" | "post" | "transcript" | "pasted";
  attention: string[];
  summary: string | null;
  claims: ClaimView[];
  assets: AssetCheck[];
  /** Claims the model offered whose quote was not in the source. */
  dropped: number;
  model: string | null;
  /** Answered from the shared cache: no model ran for this read. */
  cached: boolean;
  /** Smart money's window for this read, in hours. */
  flowHours: number;
}

export interface ReadsResponse {
  reads: ReadView[];
  error: string | null;
}

export interface AnnouncementView {
  exchange: Exchange;
  title: string;
  url: string;
  at: string;
  kind: AnnouncementKind;
  tickers: string[];
  /** Tickers Hyperliquid trades, as their Hyperliquid coin. */
  coins: string[];
}

export interface HoldingView {
  coin: string;
  side: "LONG" | "SHORT";
  wallets: number;
  /** Cohort wallets in the market on either side, when known. */
  of: number | null;
  status: string;
  /** Share of the cohort's money in the market on this side, 0–100. */
  sharePct: number;
}

export type FlowWindow = "1h" | "6h" | "24h";

export interface SmartMoneyResponse {
  window: FlowWindow;
  flows: CoinFlow[];
  signals: FlowSignal[];
  holdings: HoldingView[];
  cohort: { wallets: number; read: number; at: string | null };
  announcements: AnnouncementView[];
  feeds: Array<{ exchange: Exchange; ok: boolean }>;
  disclaimer: string;
  error: string | null;
}

export interface AutoBuyView extends AutoBuyRule {
  id: string;
  status: "active" | "paused";
  createdAt: string;
  firedToday: number;
}

export interface FireView {
  id: string;
  ruleId: string;
  ruleName: string;
  trigger: Trigger;
  coin: string;
  side: "long" | "short";
  outcome: "opened" | "refused";
  reason: string;
  positionId: string | null;
  at: string;
}

export interface AutoBuysResponse {
  rules: AutoBuyView[];
  fires: FireView[];
  coins: string[];
  live: boolean;
  error: string | null;
}
