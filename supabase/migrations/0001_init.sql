-- ---------------------------------------------------------------------------
-- Elyra — initial schema.
--
-- Apply with `supabase db push`, or paste into the SQL editor.
--
-- A note on authentication, because it changes what protects these rows.
--
-- Identity is Privy, not Supabase Auth. Supabase is the database and nothing
-- else, so `auth.users` is never populated and `auth.uid()` is always null.
-- That makes RLS policies keyed on `auth.uid()` worthless here — they would
-- match no row and read as protection that is not there.
--
-- What protects rows instead: every query runs server-side under the service
-- role and filters by `user_id` explicitly. RLS is still enabled on every
-- table below, with zero policies and all grants revoked from `anon` and
-- `authenticated`, so a leaked anon key reads nothing. It is the backstop,
-- not the mechanism.
--
-- If Privy is later wired as a Supabase third-party JWT issuer, the policies
-- at the bottom of this file become live with one edit each: `auth.jwt() ->>
-- 'sub'` carries the Privy DID, which joins to `profiles.privy_did`.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- Keyed by a generated uuid rather than `auth.users(id)`: the spec assumed
-- Supabase Auth, and Privy issues its own DID (`did:privy:...`) instead. The
-- DID is the join key from a verified access token to a row here.
-- Two address columns, because they are used for different things and a user
-- may have either or both. `wallet_address` is the EVM address, and exists
-- specifically because Hyperliquid's portfolio endpoint is keyed by one.
-- `solana_address` is this app's native chain and what the UI displays.
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  privy_did      text not null unique,
  wallet_address text,
  solana_address text,
  display_name   text,
  created_at     timestamptz not null default now()
);

-- `create table if not exists` does nothing to a table that already exists,
-- so a column added to this file after someone has already run it would never
-- reach their database. These make the file idempotent in the way that
-- actually matters: safe to re-run, and re-running repairs an older schema.
alter table public.profiles add column if not exists solana_address text;
alter table public.profiles add column if not exists wallet_address text;
alter table public.profiles add column if not exists display_name   text;

-- Read-only exchange credentials.
--
-- The three `*_enc` columns hold AES-256-GCM ciphertext produced by
-- lib/crypto/credentials.ts, keyed by CREDENTIALS_ENC_KEY. Plaintext never
-- reaches this table and never leaves the server. `key_last_four` exists so
-- the UI can identify a connection without the ciphertext being decrypted.
--
-- Hyperliquid is the exception: its portfolio endpoint is public and keyed by
-- wallet address, so it stores an address and no secret at all.
create table if not exists public.exchange_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  exchange       text not null check (exchange in ('binance', 'okx', 'hyperliquid')),
  label          text,
  api_key_enc    text,
  api_secret_enc text,
  passphrase_enc text,          -- OKX only; null elsewhere
  wallet_address text,          -- Hyperliquid only; null elsewhere
  key_last_four  text,
  created_at     timestamptz not null default now(),

  -- Either it is a signed-API connection with a key pair, or it is an
  -- address-only connection. Never neither.
  constraint exchange_accounts_credential_present check (
    (api_key_enc is not null and api_secret_enc is not null)
    or wallet_address is not null
  ),
  -- OKX signs with a passphrase in addition to the key pair.
  constraint exchange_accounts_okx_passphrase check (
    exchange <> 'okx' or passphrase_enc is not null
  )
);

create unique index if not exists exchange_accounts_user_exchange_key
  on public.exchange_accounts(user_id, exchange);

-- Exchanges have no watchlist concept, so this is ours.
create table if not exists public.watchlist (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  symbol   text not null,
  added_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

-- ---------------------------------------------------------------------------
-- Telegram
-- ---------------------------------------------------------------------------

create table if not exists public.telegram_links (
  id                uuid   primary key default gen_random_uuid(),
  user_id           uuid   not null references public.profiles(id) on delete cascade,
  telegram_user_id  bigint not null unique,
  telegram_chat_id  bigint not null,
  telegram_username text,
  linked_at         timestamptz not null default now()
);

create unique index if not exists telegram_links_user_id_key
  on public.telegram_links(user_id);

create table if not exists public.telegram_link_codes (
  code        text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  expires_at  timestamptz not null,
  consumed_at timestamptz
);

create index if not exists telegram_link_codes_user_idx
  on public.telegram_link_codes(user_id, expires_at desc);

-- Webhook idempotency. Insert-then-ignore-conflict before any processing:
-- Telegram retries anything that is not a fast 2xx, and each retry would
-- otherwise be a duplicate paid model run.
create table if not exists public.telegram_updates (
  update_id   bigint primary key,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Conversations
-- ---------------------------------------------------------------------------

create table if not exists public.conversations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  surface          text not null check (surface in ('web', 'telegram')),
  telegram_chat_id bigint,
  title            text,
  created_at       timestamptz not null default now(),
  last_message_at  timestamptz not null default now()
);

create index if not exists conversations_user_surface_idx
  on public.conversations(user_id, surface, last_message_at desc);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            text not null check (role in ('user', 'assistant', 'tool')),
  content         text,
  tool_calls      jsonb,
  tool_results    jsonb,
  provider        text,
  model           text,
  input_tokens    int,
  output_tokens   int,
  latency_ms      int,
  created_at      timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages(conversation_id, created_at);

-- One row per run, whether it succeeded or not. `fell_back` and
-- `fallback_reason` are what make the Anthropic failure rate observable.
create table if not exists public.agent_runs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references public.profiles(id) on delete set null,
  conversation_id  uuid references public.conversations(id) on delete cascade,
  surface          text not null,
  primary_provider text,
  final_provider   text,
  fell_back        boolean not null default false,
  fallback_reason  text,
  tool_iterations  int,
  total_latency_ms int,
  error            text,
  created_at       timestamptz not null default now()
);

create index if not exists agent_runs_user_idx
  on public.agent_runs(user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Market cache and usage
-- ---------------------------------------------------------------------------

-- The fallback cache, used when UPSTASH_REDIS_REST_URL is unset.
create table if not exists public.market_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists market_cache_expires_idx
  on public.market_cache(expires_at);

create table if not exists public.usage_counters (
  user_id uuid not null references public.profiles(id) on delete cascade,
  day     date not null,
  runs    int  not null default 0,
  primary key (user_id, day)
);

-- Check and increment in one statement.
--
-- Read-then-write from the application would let two concurrent runs both see
-- `runs = limit - 1` and both proceed. The conditional ON CONFLICT below makes
-- the cap hold under concurrency: when the row is already at the limit the
-- update matches nothing, no row is returned, and the caller is refused.
create or replace function public.claim_agent_run(p_user_id uuid, p_limit int)
returns table (allowed boolean, runs int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day  date := (now() at time zone 'utc')::date;
  v_runs int;
begin
  insert into public.usage_counters as u (user_id, day, runs)
  values (p_user_id, v_day, 1)
  on conflict (user_id, day) do update
     set runs = u.runs + 1
   where u.runs < p_limit
  returning u.runs into v_runs;

  if v_runs is not null then
    return query select true, v_runs;
    return;
  end if;

  -- The row existed and the WHERE blocked the update: already at the cap.
  select u.runs into v_runs
    from public.usage_counters u
   where u.user_id = p_user_id and u.day = v_day;

  return query select false, coalesce(v_runs, 0);
end;
$$;

-- ---------------------------------------------------------------------------
-- Lockdown
--
-- RLS on with no policies is a default deny for every role except the service
-- role, which bypasses it. Combined with the revokes below, an exposed anon
-- key reads nothing from this schema.
-- ---------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.exchange_accounts   enable row level security;
alter table public.watchlist           enable row level security;
alter table public.telegram_links      enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_updates    enable row level security;
alter table public.conversations       enable row level security;
alter table public.messages            enable row level security;
alter table public.agent_runs          enable row level security;
alter table public.market_cache        enable row level security;
alter table public.usage_counters      enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- Credentials are never readable by anything but the service role, even if a
-- future policy is added carelessly to the rest of the schema.
revoke all on public.exchange_accounts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- If Privy is later wired as a Supabase third-party JWT issuer
--
-- Supabase would then populate `auth.jwt()` from the Privy access token, whose
-- `sub` claim is the Privy DID. Uncommenting these makes direct client reads
-- safe; they are inert until that is configured, which is why they are not
-- active now — an inactive policy that looks active is worse than none.
--
-- create or replace function public.current_profile_id() returns uuid
--   language sql stable as $$
--     select id from public.profiles where privy_did = auth.jwt() ->> 'sub'
--   $$;
--
-- create policy profiles_self on public.profiles
--   for select to authenticated using (privy_did = auth.jwt() ->> 'sub');
-- create policy conversations_self on public.conversations
--   for select to authenticated using (user_id = public.current_profile_id());
-- create policy messages_self on public.messages
--   for select to authenticated using (user_id = public.current_profile_id());
-- create policy watchlist_self on public.watchlist
--   for all to authenticated using (user_id = public.current_profile_id());
-- create policy usage_counters_self on public.usage_counters
--   for select to authenticated using (user_id = public.current_profile_id());
-- ---------------------------------------------------------------------------
