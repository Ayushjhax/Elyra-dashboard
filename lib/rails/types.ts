/* ---------------------------------------------------------------------------
   Agent rails: the shapes shared by the server, the console and the agent
   API. Pure.
--------------------------------------------------------------------------- */

/** What an agent may ask Elyra to carry out. */
export const INTENT_KINDS = ["swap", "payment", "perp_order"] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

/** What a mandate may grant: the intents, and asking to be paid. */
export const MANDATE_KINDS = [...INTENT_KINDS, "payment_request"] as const;
export type MandateKind = (typeof MANDATE_KINDS)[number];

export const MANDATE_KIND_LABEL: Record<MandateKind, string> = {
  swap: "Swap tokens on Solana",
  payment: "Pay in USDC on Solana",
  perp_order: "Trade Hyperliquid perps",
  payment_request: "Ask to be paid in USDC",
};

export type IntentStatus = "rejected" | "pending" | "approved" | "executed" | "declined" | "expired" | "failed";

export interface Mandate {
  id: string;
  keyId: string;
  kinds: MandateKind[];
  /** Null: any asset the action itself allows. */
  assets: string[] | null;
  perIntentUsd: number;
  dailyUsd: number;
  /** Empty: any payee that passes screening. */
  payees: string[];
  autoPerps: boolean;
  livePerps: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SwapParams {
  kind: "swap";
  from: string;
  to: string;
  /** Human units of `from`, exactly as asked. */
  amount: string;
}

export interface PaymentParams {
  kind: "payment";
  /** The payee's Solana wallet. */
  to: string;
  /** USDC, in human units. */
  amount: string;
  amountBase: string;
  mint: string;
  /** The payment request it settles, when it is one. */
  requestId: string | null;
  /** The Solana Pay reference the transfer carries, when it settles a request. */
  reference: string | null;
}

export interface PerpParams {
  kind: "perp_order";
  coin: string;
  side: "long" | "short";
  sizeUsd: number;
  leverage: number;
  takeProfitPct: number;
  stopLossPct: number;
  mode: "paper" | "live";
}

export type IntentParams = SwapParams | PaymentParams | PerpParams;

/** A sanctions screen of a payee. */
export interface Screening {
  status: "clear" | "listed" | "unavailable";
  /** What it was checked against. */
  source: string;
  checkedAt: string;
}

export interface IntentView {
  id: string;
  keyId: string;
  /** The agent key's name, as its owner named it. */
  agent: string;
  kind: IntentKind;
  params: IntentParams;
  summary: string;
  usdValue: number | null;
  status: IntentStatus;
  reasons: string[];
  memo: string | null;
  screening: Screening | null;
  result: Record<string, unknown> | null;
  /** The ledger hash of the proposal. */
  receipt: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt: string | null;
  settledAt: string | null;
}

export interface LedgerEvent {
  seq: number;
  at: string;
  actor: string;
  event: string;
  subjectId: string | null;
  body: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

export type LedgerVerification = { ok: true; count: number; head: string } | { ok: false; count: number; brokenAt: number; reason: string };

export interface PaymentRequestView {
  id: string;
  label: string;
  memo: string | null;
  recipient: string;
  mint: string;
  /** Human units. */
  amount: string;
  status: "open" | "paid" | "expired" | "cancelled";
  /** The URL any Solana Pay wallet opens. */
  solanaPayUrl: string;
  /** Elyra's own page for it. */
  payUrl: string;
  paidSignature: string | null;
  paidBy: string | null;
  paidAt: string | null;
  expiresAt: string;
  createdAt: string;
  /** Which agent asked for it, when one did. */
  agent: string | null;
}

export interface AgentWithMandate {
  keyId: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  mandate: Mandate | null;
  /** Dollars of intents this key has used today against its daily cap. */
  spentTodayUsd: number;
}

export interface RailsResponse {
  agents: AgentWithMandate[];
  intents: IntentView[];
  requests: PaymentRequestView[];
  ledger: { events: LedgerEvent[]; verification: LedgerVerification };
  error: string | null;
}
