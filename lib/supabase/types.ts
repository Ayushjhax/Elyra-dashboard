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
  wallet_address: string | null;
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

export interface MarketCacheRow {
  cache_key: string;
  payload: unknown;
  fetched_at: string;
  expires_at: string;
}

/** Row shape, an insert shape with defaults optional, and an update shape. */
type Table<Row, OptionalOnInsert extends keyof Row> = {
  Row: Row;
  Insert: Omit<Row, OptionalOnInsert> & Partial<Pick<Row, OptionalOnInsert>>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile, "id" | "created_at">;
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
