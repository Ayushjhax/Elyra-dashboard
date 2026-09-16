/* ---------------------------------------------------------------------------
   The database, as TypeScript.

   Hand-written rather than generated, because generation needs a live project
   and this has to compile before anyone has provisioned one. It mirrors
   supabase/migrations/0001_init.sql exactly — when that file changes, this one
   changes with it in the same commit.
--------------------------------------------------------------------------- */

export type Surface = "web" | "telegram";
export type MessageRole = "user" | "assistant" | "tool";
export type ExchangeId = "binance" | "okx" | "hyperliquid";

export interface Profile {
  id: string;
  privy_did: string;
  /** Permanent, unique, generated server-side. Null until first issued. */
  referral_code: string | null;
  /** EVM. Hyperliquid's portfolio endpoint is keyed by one of these. */
  wallet_address: string | null;
  /** This app's native chain, and what the UI shows. */
  solana_address: string | null;
  display_name: string | null;
  created_at: string;
}

export interface ExchangeAccount {
  id: string;
  user_id: string;
  exchange: ExchangeId;
  label: string | null;
  api_key_enc: string | null;
  api_secret_enc: string | null;
  passphrase_enc: string | null;
  wallet_address: string | null;
  key_last_four: string | null;
  created_at: string;
}

export interface WatchlistRow {
  user_id: string;
  symbol: string;
  added_at: string;
}

export interface TelegramLink {
  id: string;
  user_id: string;
  telegram_user_id: number;
  telegram_chat_id: number;
  telegram_username: string | null;
  linked_at: string;
}

export interface TelegramLinkCode {
  code: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface Conversation {
  id: string;
  user_id: string;
  surface: Surface;
  telegram_chat_id: number | null;
  title: string | null;
  created_at: string;
  last_message_at: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: MessageRole;
  content: string | null;
  tool_calls: unknown | null;
  tool_results: unknown | null;
  provider: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  created_at: string;
}

export interface AgentRun {
  id: string;
  user_id: string | null;
  conversation_id: string | null;
  surface: string;
  primary_provider: string | null;
  final_provider: string | null;
  fell_back: boolean;
  fallback_reason: string | null;
  tool_iterations: number | null;
  total_latency_ms: number | null;
  error: string | null;
  created_at: string;
}

/**
 * One reading of a user's portfolio value, kept so the performance chart has
 * a real series to draw rather than a reconstruction.
 *
 * Written on read, bucketed — see lib/portfolio/history.ts. Deliberately
 * narrow: this records what the portfolio was WORTH, not what it held. A
 * position-level history is a much larger table and answers a question the
 * chart does not ask.
 */
export interface PortfolioSnapshotRow {
  user_id: string;
  at: string;
  total_value_usd: number;
}

/* ---------------------------------------------------------------------------
   Referrals — see supabase/migrations/0006_referrals.sql for why the ledger
   is append-only and why pools are rows rather than a derived count.
--------------------------------------------------------------------------- */

export type PointsEventType = "REFERRAL_ACTIVATED" | "REFERRAL_POOL_BONUS";

export interface PointsLedgerRow {
  id: string;
  user_id: string;
  event_type: PointsEventType;
  /** Signed: a correction is a negative row, never a delete. */
  points: number;
  /** The idempotency key. Unique across the table. */
  source_id: string;
  metadata: unknown;
  created_at: string;
}

export type ReferralStatus = "pending" | "activated" | "not_eligible";

export interface ReferralRow {
  id: string;
  referrer_user_id: string;
  /** Unique — the database's "one referrer per user" rule. */
  referred_user_id: string;
  referral_code: string;
  status: ReferralStatus;
  attributed_at: string;
  signed_up_at: string;
  activated_at: string | null;
  rewarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReferralPoolRow {
  id: string;
  user_id: string;
  pool_number: number;
  /** The target in force when this pool completed, not today's. */
  target: number;
  bonus_points: number;
  bonus_ledger_id: string | null;
  completed_at: string;
  created_at: string;
}

/* ---------------------------------------------------------------------------
   Personalized — see supabase/migrations/0005_personalized.sql for why memory
   and conversation are separate tables rather than one history.
--------------------------------------------------------------------------- */

export type MemoryTypeRow =
  | "concentration_limit"
  | "stablecoin_buffer"
  | "preferred_venue"
  | "leverage_limit"
  | "watch_symbol"
  | "note";

export interface PersonalizedMemoryRow {
  id: string;
  user_id: string;
  type: MemoryTypeRow;
  key: string;
  /** jsonb. Shape depends on `type`; the service validates before writing. */
  value: unknown;
  confidence: number;
  source: "explicit" | "inferred";
  label: string;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

export interface PersonalizedConversationRow {
  id: string;
  user_id: string;
  title: string;
  /** Rolling summary of everything older than the recent window. */
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface PersonalizedMessageRow {
  id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  /** The validated PersonalizedAnswer. Null on a user turn. */
  structured: unknown | null;
  provider: string | null;
  model: string | null;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

export interface MarketCacheRow {
  cache_key: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}

/**
 * An interface re-expressed as an anonymous object type.
 *
 * postgrest-js constrains every table to `Record<string, unknown>`, and
 * TypeScript only gives *type aliases* an implicit index signature — an
 * `interface` never satisfies that constraint, which silently collapses the
 * whole schema to `any` and then to `never` at every call site. Mapping the
 * interface here keeps the readable named types above and still satisfies it.
 */
type Columns<T> = { [K in keyof T]: T[K] };

/** Columns that accept null, and so may always be omitted from an insert. */
type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

/**
 * Row shape, an insert shape, and an update shape.
 *
 * `HasDefault` names the columns the database fills in — primary keys and
 * `created_at`. Nullable columns are derived rather than listed: omitting one
 * on insert is always legal, and spelling them out twice would let the two
 * lists drift.
 */
/**
 * One smart-money finding, written by the scheduled EDGAR scan.
 *
 * `edges` and `filings` are JSONB and stay `unknown` here: they are the
 * engine's own shapes, they cross a workspace boundary, and the route
 * validates them at the edge rather than this file asserting a structure it
 * cannot check. A confident type over unvalidated JSON is worse than an
 * honest `unknown`.
 */
export interface SmartMoneyFindingRow {
  id: string;
  ticker: string;
  cik: string;
  company: string;
  logo: string | null;
  kind: string;
  direction: string;
  score: number;
  confidence: number;
  headline: string;
  edges: unknown;
  filings: unknown;
  /** Acceptance timestamp of the newest evidence. Never a filing date. */
  observed_at: string;
  computed_at: string;
  disclaimer: string;
  created_at: string;
  updated_at: string;
}

type Table<Row, HasDefault extends keyof Row> = {
  Row: Columns<Row>;
  Insert: Columns<
    Omit<Row, HasDefault | NullableKeys<Row>> &
      Partial<Pick<Row, HasDefault | NullableKeys<Row>>>
  >;
  Update: Partial<Columns<Row>>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile, "id" | "created_at">;
      smart_money_findings: Table<
        SmartMoneyFindingRow,
        "created_at" | "updated_at"
      >;
      exchange_accounts: Table<ExchangeAccount, "id" | "created_at">;
      watchlist: Table<WatchlistRow, "added_at">;
      telegram_links: Table<TelegramLink, "id" | "linked_at">;
      telegram_link_codes: Table<TelegramLinkCode, "consumed_at">;
      telegram_updates: Table<
        { update_id: number; received_at: string },
        "received_at"
      >;
      conversations: Table<
        Conversation,
        "id" | "created_at" | "last_message_at"
      >;
      messages: Table<MessageRow, "id" | "created_at">;
      agent_runs: Table<AgentRun, "id" | "created_at" | "fell_back">;
      market_cache: Table<MarketCacheRow, "fetched_at">;
      portfolio_snapshots: Table<PortfolioSnapshotRow, "at">;
      points_ledger: Table<PointsLedgerRow, "id" | "created_at" | "metadata">;
      referrals: Table<
        ReferralRow,
        | "id"
        | "status"
        | "attributed_at"
        | "signed_up_at"
        | "activated_at"
        | "rewarded_at"
        | "created_at"
        | "updated_at"
      >;
      referral_pools: Table<
        ReferralPoolRow,
        "id" | "bonus_points" | "bonus_ledger_id" | "completed_at" | "created_at"
      >;
      personalized_memories: Table<
        PersonalizedMemoryRow,
        "id" | "created_at" | "updated_at" | "confidence" | "source" | "confirmed_at"
      >;
      personalized_conversations: Table<
        PersonalizedConversationRow,
        "id" | "created_at" | "updated_at" | "title" | "summary"
      >;
      personalized_messages: Table<
        PersonalizedMessageRow,
        | "id"
        | "created_at"
        | "structured"
        | "provider"
        | "model"
        | "latency_ms"
        | "input_tokens"
        | "output_tokens"
      >;
      usage_counters: Table<
        { user_id: string; day: string; runs: number },
        "runs"
      >;
    };
    Views: Record<never, never>;
    Functions: {
      /** Atomic check-and-increment. See the migration for why it is one statement. */
      claim_agent_run: {
        Args: { p_user_id: string; p_limit: number };
        Returns: { allowed: boolean; runs: number }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
