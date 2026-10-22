-- ---------------------------------------------------------------------------
-- Everything a fresh Elyra database needs, in order, in one paste.
--
-- GENERATED. Assembled from the files listed below; edit those, not this.
-- Regenerate with:  npm run supabase:bundle
--
-- Every statement is idempotent, so pasting this twice changes nothing and
-- pasting it over a partially-migrated database fills in what is missing.
--
-- 0003_repair.sql is deliberately NOT here: it repairs databases created from
-- an older 0001, and 0001 already carries those `alter table ... if not
-- exists` statements itself. Running it against a fresh database is a no-op.
-- ---------------------------------------------------------------------------

-- ======================= 0001_init.sql =======================
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

-- ==================== 0002_smart_money.sql ====================
-- ---------------------------------------------------------------------------
-- Smart-money findings.
--
-- Deliberately self-contained: no foreign keys and no dependency on the rest
-- of the elyra-signals schema, so it can be applied to a database that only
-- has the dashboard's own tables. One statement to run, and nothing else has
-- to exist first.
--
-- A finding is NOT a signal. It has no entry, target or stop, because those
-- need price history and filings do not contain any. The columns below are
-- shaped so that no amount of later convenience can quietly add them: there
-- is nowhere to put one.
-- ---------------------------------------------------------------------------

create table if not exists public.smart_money_findings (
  -- Deterministic: ticker plus the date of the newest evidence. A rescan that
  -- sees the same filings overwrites rather than duplicating.
  id             text primary key,

  ticker         text not null,
  cik            text not null,
  company        text not null,
  logo           text,

  kind           text not null check (kind in (
                   'institutional_flow','earnings_quality',
                   'business_performance','disclosure_risk')),
  direction      text not null check (direction in ('bullish','bearish')),
  score          numeric(6,2) not null check (score between -100 and 100),
  confidence     numeric(4,3) not null check (confidence between 0 and 1),

  headline       text not null,
  -- Full Edge[] and FilingRef[], kept whole so a card can show provenance and
  -- an audit can reconstruct the finding without re-running the scan.
  edges          jsonb not null,
  filings        jsonb not null,

  -- When the newest piece of evidence became publicly knowable. This is an
  -- acceptance timestamp, never a filing date.
  observed_at    timestamptz not null,
  computed_at    timestamptz not null,
  disclaimer     text not null,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Evidence cannot be knowable after it was computed.
  constraint smart_money_time_sane check (observed_at <= computed_at)
);

create index if not exists smart_money_feed_idx
  on public.smart_money_findings (observed_at desc, score desc);
create index if not exists smart_money_ticker_idx
  on public.smart_money_findings (ticker, observed_at desc);
create index if not exists smart_money_kind_idx
  on public.smart_money_findings (kind, observed_at desc);

-- Read-only to the browser; only the service role writes. The dashboard
-- reads through its own server route, so anon never needs direct access.
alter table public.smart_money_findings enable row level security;

drop policy if exists smart_money_read on public.smart_money_findings;
create policy smart_money_read
  on public.smart_money_findings
  for select
  using (true);

-- ================ 0004_portfolio_snapshots.sql ================
-- ---------------------------------------------------------------------------
-- Portfolio value over time.
--
-- One row per user per five-minute bucket, written on read by
-- lib/portfolio/history.ts. This is what turns the performance chart from a
-- reconstruction into real history: what the portfolio was actually worth at
-- a past moment, including assets since sold and capital since added.
--
-- Deliberately narrow. It records what the portfolio was WORTH, not what it
-- held — a position-level history is a far larger table and answers a
-- question the chart does not ask. When cost-basis and deposit tracking land,
-- they belong in their own table beside this one rather than as columns here.
--
-- Safe to run against a database that already has it.
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_snapshots (
  user_id         uuid        not null references public.profiles(id) on delete cascade,
  -- Floored to the bucket by the writer, so concurrent polls in the same
  -- window collide on this key and the first one wins instead of writing
  -- near-duplicate rows seconds apart.
  at              timestamptz not null,
  total_value_usd numeric(20, 2) not null,

  primary key (user_id, at)
);

-- Every read is "this user, newest first, since T".
create index if not exists portfolio_snapshots_user_at_idx
  on public.portfolio_snapshots (user_id, at desc);

-- Same lockdown as the rest of the schema: RLS on with no policies is a
-- default deny for every role except the service role, which bypasses it.
-- Authentication is Privy, so auth.uid() is null and a policy keyed on it
-- would match nothing. Row scoping is the caller's job, in the query.
alter table public.portfolio_snapshots enable row level security;

revoke all on public.portfolio_snapshots from anon, authenticated;

-- =================== 0005_personalized.sql ===================
-- ---------------------------------------------------------------------------
-- Personalized — durable memory and its own conversation store.
--
-- Two tables, kept apart on purpose.
--
-- `personalized_memories` holds STANDING INSTRUCTIONS: "never let one asset
-- exceed 25%". These outlive any conversation and are re-read on every turn.
-- Conflating them with chat history is why assistants forget a limit stated
-- four sessions ago — the limit scrolls out of the context window along with
-- the small talk around it.
--
-- `personalized_conversations` / `personalized_messages` hold what was said.
-- Separate from the existing `conversations` / `messages` pair, which belong
-- to the agent surface shared with Telegram: that table's `surface` check
-- constraint admits only 'web' and 'telegram', and widening it would couple
-- two products that have different retention, different context assembly and
-- different failure modes.
--
-- Same lockdown as the rest of the schema: authentication is Privy, so
-- auth.uid() is null and a policy keyed on it matches nothing. RLS on with no
-- policies is a default deny for every role except the service role, and row
-- scoping is the caller's job in the query.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.personalized_memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  -- What kind of standing instruction this is.
  type         text not null check (type in (
                 'concentration_limit','stablecoin_buffer','preferred_venue',
                 'leverage_limit','watch_symbol','note')),

  -- Stable identity within a type, so re-saying a preference updates rather
  -- than accumulates. The symbol for a watch; the type itself for singletons.
  key          text not null,

  value        jsonb not null,

  -- 1 for anything the user said outright. Lower only for inferred memories,
  -- which must never be written from a single observation.
  confidence   numeric(4,3) not null default 1 check (confidence between 0 and 1),
  source       text not null default 'explicit' check (source in ('explicit','inferred')),

  -- Already written for display, so the rail never has to re-derive prose
  -- from a jsonb value.
  label        text not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- One memory per (user, type, key): saying "max 25%" twice updates the row.
create unique index if not exists personalized_memories_key_idx
  on public.personalized_memories (user_id, type, key);

create index if not exists personalized_memories_user_idx
  on public.personalized_memories (user_id, updated_at desc);

-- ---------------------------------------------------------------------------

create table if not exists public.personalized_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null default 'New conversation',
  -- A rolling summary of everything older than the recent window, so a long
  -- conversation does not have to be replayed in full on every turn.
  summary    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personalized_conversations_user_idx
  on public.personalized_conversations (user_id, updated_at desc);

create table if not exists public.personalized_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
                    references public.personalized_conversations(id) on delete cascade,
  -- Denormalised so every read can filter by user without a join. The join
  -- would be correct; this makes a missing filter impossible to write.
  user_id         uuid not null references public.profiles(id) on delete cascade,

  role            text not null check (role in ('user','assistant')),
  content         text not null,

  -- The validated PersonalizedAnswer for an assistant turn: insights,
  -- metrics, suggested prompts. Null for a user turn.
  structured      jsonb,

  -- Which provider produced it and what it cost, for the run log. Never
  -- contains reasoning, only metadata.
  provider        text,
  model           text,
  latency_ms      int,
  input_tokens    int,
  output_tokens   int,

  created_at      timestamptz not null default now()
);

create index if not exists personalized_messages_conversation_idx
  on public.personalized_messages (conversation_id, created_at);

create index if not exists personalized_messages_user_idx
  on public.personalized_messages (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Lockdown
-- ---------------------------------------------------------------------------

alter table public.personalized_memories      enable row level security;
alter table public.personalized_conversations enable row level security;
alter table public.personalized_messages      enable row level security;

revoke all on public.personalized_memories      from anon, authenticated;
revoke all on public.personalized_conversations from anon, authenticated;
revoke all on public.personalized_messages      from anon, authenticated;

-- ===================== 0006_referrals.sql =====================
-- ---------------------------------------------------------------------------
-- Referrals, points and activation pools.
--
-- Three new tables plus one column on `profiles`. Elyra had no points system,
-- no referral system and no invite codes before this, so nothing here is
-- replacing an existing mechanism.
--
-- The design rule running through all of it: EVERY reward is a row, and every
-- row carries the key that makes issuing it twice impossible. A referral
-- programme is paid out in something people want, so "we retried the webhook
-- and paid them again" has to be structurally unavailable rather than merely
-- unlikely.
--
-- Same lockdown as the rest of the schema. Authentication is Privy, so
-- auth.uid() is null and a policy keyed on it matches nothing; RLS on with no
-- policies is a default deny for every role except the service role, and row
-- scoping is the caller's job in the query.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The code lives on the profile
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists referral_code text;

-- Unique where present. A partial index rather than a plain unique constraint
-- so existing rows without a code do not all collide on null.
create unique index if not exists profiles_referral_code_idx
  on public.profiles (referral_code)
  where referral_code is not null;

-- ---------------------------------------------------------------------------
-- 2. Points ledger — append-only
--
-- The balance is a SUM over this table, never a column someone increments.
-- A mutable total can drift from its own history and there is then no way to
-- tell which of the two is wrong; a ledger cannot, because the history is the
-- balance.
-- ---------------------------------------------------------------------------

create table if not exists public.points_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,

  event_type text not null check (event_type in (
               'REFERRAL_ACTIVATED','REFERRAL_POOL_BONUS')),

  -- Signed, so a future correction is a negative row rather than a delete.
  -- The audit trail has to stay append-only to be worth having.
  points     int not null,

  -- THE idempotency key. 'referral_activation:{referredUserId}' and
  -- 'referral_pool:{referrerUserId}:{poolNumber}'. Unique across the table,
  -- so a replayed webhook or a double-clicked retry inserts nothing and the
  -- caller learns it was already paid.
  source_id  text not null,

  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists points_ledger_source_idx
  on public.points_ledger (source_id);

create index if not exists points_ledger_user_idx
  on public.points_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Referrals
--
-- One row per referred account, created when attribution binds at sign-up.
-- ---------------------------------------------------------------------------

create table if not exists public.referrals (
  id                uuid primary key default gen_random_uuid(),

  referrer_user_id  uuid not null references public.profiles(id) on delete cascade,
  -- The unique constraint below is the "0 or 1 referrer per user" rule, held
  -- by the database rather than by whichever code path happens to run first.
  -- Two concurrent sign-up requests cannot both win.
  referred_user_id  uuid not null unique references public.profiles(id) on delete cascade,

  -- The code as it was actually used, kept even if the referrer's code is
  -- ever changed by support — the attribution should still say what happened.
  referral_code     text not null,

  status            text not null default 'pending'
                      check (status in ('pending','activated','not_eligible')),

  attributed_at     timestamptz not null default now(),
  signed_up_at      timestamptz not null default now(),
  activated_at      timestamptz,
  rewarded_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Self-referral, refused by the database as well as by the application.
  -- Application checks are correct and also skippable; this one is not.
  constraint referrals_no_self check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_user_id, created_at desc);

create index if not exists referrals_status_idx
  on public.referrals (referrer_user_id, status);

-- ---------------------------------------------------------------------------
-- 4. Activation pools
--
-- An explicit row per completed pool rather than deriving completion from a
-- count. Deriving would work until the target is ever changed, at which point
-- every historical pool silently re-computes against the new number and the
-- bonus history stops matching what was actually paid. The row records the
-- target that applied when it completed.
-- ---------------------------------------------------------------------------

create table if not exists public.referral_pools (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  -- 1, 2, 3 … Unique per user, which is what stops one pool paying twice.
  pool_number     int not null check (pool_number > 0),

  -- The target in force when this pool completed, not today's.
  target          int not null check (target > 0),

  bonus_points    int not null default 0,
  -- The ledger row that paid it, so a bonus can always be traced to money.
  bonus_ledger_id uuid references public.points_ledger(id) on delete set null,

  completed_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create unique index if not exists referral_pools_user_number_idx
  on public.referral_pools (user_id, pool_number);

create index if not exists referral_pools_user_idx
  on public.referral_pools (user_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- Lockdown
-- ---------------------------------------------------------------------------

alter table public.points_ledger   enable row level security;
alter table public.referrals       enable row level security;
alter table public.referral_pools  enable row level security;

revoke all on public.points_ledger  from anon, authenticated;
revoke all on public.referrals      from anon, authenticated;
revoke all on public.referral_pools from anon, authenticated;

-- ================ 0007_telegram_capital_os.sql ================
-- ---------------------------------------------------------------------------
-- Telegram Capital OS — prepared actions and notification preferences.
--
-- ── Why prepared actions are a TABLE and not a callback payload ──────────
--
-- Telegram gives an inline button 64 bytes of `callback_data` and hands it
-- back verbatim when someone taps it. The tempting design is to pack the
-- action into those bytes — "swap:SOL:USDC:21.25" — and act on what comes
-- back. That is wrong in two separate ways.
--
-- It is UNAUTHENTICATED INPUT. callback_data returns through the same webhook
-- as everything else, and while Telegram vouches for `from.id`, it does not
-- vouch that the payload was one Elyra actually issued. An attacker who can
-- reach the webhook with a valid secret can name any amount.
--
-- It is STALE. A swap prepared against a $100 SOL price and tapped twenty
-- minutes later is a different trade. The amounts have to be re-derived from
-- a live snapshot at confirmation time, which means the server has to know
-- what was proposed — not just what the button said.
--
-- So the button carries an OPAQUE ID and nothing else. Everything that
-- decides what happens lives in this row, written by the server, scoped to a
-- user, and expiring on its own.
--
-- ── What this table is not ──────────────────────────────────────────────
--
-- It is not an execution queue. Nothing in this repository can sign a
-- transaction: there is no signing path anywhere in it. A row here reaching
-- `confirmed` means a human pressed confirm in a surface that can verify who
-- they are — never that a transaction was sent. A Telegram tap moves a row to
-- `acknowledged` at most.
--
-- Same lockdown as the rest of the schema: Privy authentication means
-- auth.uid() is null, so RLS is enabled with no policies — a default deny for
-- every role but the service role — and row scoping is the query's job.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.prepared_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  -- The opaque handle a Telegram button carries. Random, not derived from
  -- the contents: a derived id is a guessable id, and guessing one would let
  -- a stranger's tap address someone else's action.
  token        text not null unique,

  kind         text not null check (kind in (
                 'swap','reduce_perp','close_perp','transfer','deposit','withdraw')),

  -- The full prepared preview, exactly as it was shown. Kept verbatim so the
  -- confirmation screen can show what was actually agreed to rather than a
  -- re-rendering that might differ.
  payload      jsonb not null,

  -- Where it was prepared. A preview shown in Telegram and one shown on the
  -- dashboard are the same record; this only says where it started.
  surface      text not null check (surface in ('web','telegram')),

  status       text not null default 'prepared'
                 check (status in ('prepared','acknowledged','confirmed','expired','cancelled')),

  -- Short by design. A financial preview goes stale in minutes, and an action
  -- that cannot be confirmed late cannot be replayed late either.
  expires_at   timestamptz not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists prepared_actions_user_idx
  on public.prepared_actions(user_id, created_at desc);

-- Expiry sweeps scan on this.
create index if not exists prepared_actions_expiry_idx
  on public.prepared_actions(expires_at)
  where status = 'prepared';

create table if not exists public.telegram_notification_preferences (
  user_id            uuid primary key references public.profiles(id) on delete cascade,

  -- Every channel defaults OFF. An unsolicited message containing someone's
  -- balance is a disclosure they did not ask for, and defaulting these on
  -- would make linking a chat an implicit consent to broadcast.
  price_alerts       boolean not null default false,
  liquidation_alerts boolean not null default false,
  large_moves        boolean not null default false,
  daily_summary      boolean not null default false,

  -- Local time of day for the digest, as minutes past midnight, with the IANA
  -- zone it is relative to. Stored apart so a user moving timezone keeps the
  -- hour they chose rather than being silently shifted.
  daily_summary_minute integer not null default 540
                         check (daily_summary_minute between 0 and 1439),
  timezone           text not null default 'UTC',

  -- Below this, a move is not worth a notification. Percent.
  move_threshold_pct numeric not null default 5
                       check (move_threshold_pct > 0),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Sent notifications, so a restart or a retry does not send the same alert
-- twice. The unique key is the idempotency boundary: it is a constraint
-- rather than a check-then-insert, which races.
create table if not exists public.telegram_notifications_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  -- Whatever makes this alert unique for this user: a symbol plus a bucketed
  -- timestamp, a position id plus a threshold. Built by the sender.
  dedupe_key text not null,
  sent_at    timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);

create index if not exists telegram_notifications_sent_idx
  on public.telegram_notifications_sent(user_id, sent_at desc);

alter table public.prepared_actions                    enable row level security;
alter table public.telegram_notification_preferences   enable row level security;
alter table public.telegram_notifications_sent         enable row level security;

-- ---------------------------------------------------------------------------
-- Price alerts.
--
-- A level and a direction, per user per symbol. Deliberately NOT "notify me
-- when SOL is above 120" evaluated continuously — that fires every tick for
-- as long as the condition holds. `triggered_at` is stamped on the first
-- crossing and the row goes quiet until it is re-armed, so an alert is an
-- EVENT rather than a state.
--
-- `direction` is stored rather than inferred from the price at creation time.
-- Inferring it means an alert created while the market is moving can end up
-- meaning the opposite of what the user typed.
-- ---------------------------------------------------------------------------

create table if not exists public.price_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  symbol       text not null,
  direction    text not null check (direction in ('above', 'below')),
  target       numeric not null check (target > 0),

  -- The price when the alert was created. Kept so the notification can say
  -- "SOL crossed 120, up from 96 when you set this" — the context that makes
  -- the alert actionable rather than just true.
  created_price numeric,

  -- Null until it fires. Re-arming clears it.
  triggered_at timestamptz,
  triggered_price numeric,

  created_at   timestamptz not null default now(),

  -- One alert per user, symbol, direction and level. Re-sending the same
  -- command updates the row rather than stacking duplicates that all fire
  -- together.
  unique (user_id, symbol, direction, target)
);

-- The delivery worker scans this: armed alerts only, grouped by symbol.
create index if not exists price_alerts_armed_idx
  on public.price_alerts(symbol)
  where triggered_at is null;

create index if not exists price_alerts_user_idx
  on public.price_alerts(user_id, created_at desc);

alter table public.price_alerts enable row level security;

-- ================ 0008_prediction_markets.sql ================
-- ---------------------------------------------------------------------------
-- Prediction markets — account linkage and alert preferences.
--
-- ── Why a separate address column ───────────────────────────────────────
--
-- Polymarket positions are held by a PROXY WALLET, not by the EOA that
-- controls it. Polymarket deploys a contract wallet per user and trades from
-- that, so a user's Privy EVM address and their Polymarket address are
-- usually different strings. Querying the Data API with the EOA returns an
-- empty array — which is indistinguishable from "this person has no
-- positions" unless we know whether we asked about the right address at all.
--
-- That ambiguity is the entire reason this column exists. With it, an empty
-- result means "no positions". Without it, an empty result means nothing,
-- and reporting $0 prediction exposure would be a fabrication.
--
-- Nullable by design: market data is public and browsing needs no account.
--
-- Same lockdown as the rest of the schema: Privy means auth.uid() is null, so
-- RLS is on with no policies and row scoping is the query's job.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists polymarket_address text;

-- Set when the address was confirmed to resolve against the Data API, so a
-- typo does not sit there forever looking like a connected account.
alter table public.profiles
  add column if not exists polymarket_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Prediction alert preferences.
--
-- Added to the existing Telegram preference row rather than a new table:
-- these are the same product decision ("what may Elyra send me unprompted")
-- and splitting them would mean two reads and two failure modes for one
-- question. Every flag defaults OFF, like the others.
-- ---------------------------------------------------------------------------

alter table public.telegram_notification_preferences
  add column if not exists prediction_alerts boolean not null default false;

alter table public.telegram_notification_preferences
  add column if not exists prediction_order_updates boolean not null default false;

alter table public.telegram_notification_preferences
  add column if not exists prediction_resolution_alerts boolean not null default false;

-- In PERCENTAGE POINTS, not percent-of-percent. A market moving 54% -> 64% is
-- a 10-point move and a ~18.5% relative move; the first is what anyone means
-- when they say "tell me if it moves 10%", and conflating them makes the
-- alert fire roughly twice as often as asked.
alter table public.telegram_notification_preferences
  add column if not exists prediction_move_threshold_points numeric not null default 10
    check (prediction_move_threshold_points > 0);

-- ---------------------------------------------------------------------------
-- Probability snapshots, so a "moved 10 points today" alert has a baseline.
--
-- Without a stored previous value there is nothing to compare against, and an
-- alert on "current probability" alone can only ever fire on a level, never
-- on a change.
-- ---------------------------------------------------------------------------

create table if not exists public.prediction_probability_marks (
  -- The CLOB token id for one outcome of one market. Not the condition id:
  -- a multi-outcome market has one row per outcome.
  token_id     text primary key,
  market_id    text not null,
  title        text,
  probability  numeric not null check (probability >= 0 and probability <= 1),
  recorded_at  timestamptz not null default now()
);

create index if not exists prediction_probability_marks_recorded_idx
  on public.prediction_probability_marks(recorded_at desc);

alter table public.prediction_probability_marks enable row level security;

-- ===================== 0009_research.sql =====================
-- ---------------------------------------------------------------------------
-- Research reports.
--
-- ── One table, not a job queue ──────────────────────────────────────────
--
-- A row IS the job and, once finished, the report. Splitting them would mean
-- a two-phase write for every state change and a join for every read, to
-- model a lifecycle that is strictly linear: queued, running, done or failed.
--
-- `status` carries the lifecycle and `document` carries the result. A row
-- with status 'complete' and a null document is a bug, not a state.
--
-- ── Why the document is jsonb ───────────────────────────────────────────
--
-- The report is a typed tree of sections, metrics and sources that is
-- rendered to both HTML and PDF. Normalising it into tables would let the
-- database validate nothing useful — no constraint expresses "every metric
-- cites a source that exists" — while making the common read a five-way join.
-- The application verifies the structure before it is stored.
--
-- ── Ownership ───────────────────────────────────────────────────────────
--
-- Privy means auth.uid() is null, so RLS is on with no policies and every
-- query filters by user_id. A report contains a user's research; the download
-- path re-checks ownership rather than trusting an unguessable id.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.research_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- What was asked for, as typed. Kept so a failed report can be retried and
  -- so history reads like the user's own words rather than a parsed summary.
  query       text not null,
  kind        text not null check (kind in ('earnings', '10-K', '10-Q', 'custom')),

  -- Resolved subject. Null until the entity step succeeds, which is why a
  -- failed report can still say what it was looking for.
  subject_name   text,
  subject_ticker text,
  subject_cik    text,
  period_label   text,

  status      text not null default 'queued'
                check (status in ('queued','resolving','collecting','analyzing','rendering','complete','failed')),

  -- Written for a person. Shown while the job runs and after it fails.
  status_detail text,

  -- 'verified' | 'verified_with_warnings' | 'incomplete'. Null until complete.
  quality     text check (quality in ('verified','verified_with_warnings','incomplete')),

  -- The full ResearchReportDocument. Null until the document is built.
  document    jsonb,

  -- Object-storage path of the rendered PDF. Null until rendering succeeds,
  -- so a non-null value means a file that exists.
  pdf_path    text,
  pdf_bytes   integer,

  -- Why it failed. Null on success.
  error       text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists research_reports_user_idx
  on public.research_reports(user_id, created_at desc);

-- The worker scans this: anything still running.
create index if not exists research_reports_active_idx
  on public.research_reports(created_at)
  where status not in ('complete', 'failed');

alter table public.research_reports enable row level security;

-- ===================== 0010_backtests.sql =====================
-- ---------------------------------------------------------------------------
-- Backtest results.
--
-- ── One row per run, with the arrays inline ─────────────────────────────
--
-- A year of hourly bars produces a few hundred trades and ~8,700 equity
-- points. That is tens of kilobytes of JSON — small enough to live in the row
-- and far simpler than a side table plus object storage. The listing query
-- selects explicit columns rather than `*`, so browsing history never drags
-- the arrays across the wire.
--
-- ── Why the config is stored whole ──────────────────────────────────────
--
-- A result is only meaningful alongside the assumptions that produced it: the
-- fee, the slippage, the execution timing, the exact parameters. Storing them
-- as a blob beside the numbers is what makes a saved result reproducible, and
-- `engine_version` plus `strategy_version` say whether today's code would
-- still produce it.
--
-- Same lockdown as the rest of the schema: Privy means auth.uid() is null, so
-- RLS is on with no policies and every query filters by user_id.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.backtest_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- What was asked for, as typed, so history reads like the user's own words.
  query       text,

  instrument   text not null,
  venue        text not null,
  timeframe    text not null,
  strategy_id  text not null,
  strategy_version integer not null,
  engine_version   text not null,

  started_at  timestamptz not null,
  ended_at    timestamptz not null,

  status      text not null default 'queued'
                check (status in ('queued','loading','simulating','complete','failed')),
  status_detail text,

  -- The full BacktestConfig, including costs and execution timing.
  config      jsonb,
  -- Computed metrics. Nulls inside are meaningful: see lib/backtest/metrics.
  metrics     jsonb,
  -- Trades and the equity curve.
  trades      jsonb,
  equity      jsonb,
  -- Robustness checks, when they were run.
  robustness  jsonb,

  quality     text check (quality in ('insufficient_data','insufficient_trades','valid','valid_with_warnings')),
  -- Every caveat, so a stored result still carries its own warnings.
  warnings    jsonb,

  error       text,

  created_at  timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists backtest_results_user_idx
  on public.backtest_results(user_id, created_at desc);

create index if not exists backtest_results_active_idx
  on public.backtest_results(created_at)
  where status not in ('complete', 'failed');

alter table public.backtest_results enable row level security;

-- ================ 0011_prediction_signals.sql ================
-- ---------------------------------------------------------------------------
-- Prediction market intelligence: signals, book history, alerts, watchlist.
--
-- Builds on 0008, which added the Polymarket account linkage and the
-- probability marks. Nothing here duplicates an existing table: positions and
-- orders stay upstream at the venue, notifications stay in the Telegram
-- preference row, and backtest_results (0010) remains the SPOT backtest store.
-- Prediction backtests are a different simulator over a different data shape
-- and carry their own success definition, so they are not forced into it.
--
-- Same lockdown as the rest of the schema: Privy means auth.uid() is null, so
-- RLS is enabled with no policies and row scoping is the query's job. The
-- service-role client bypasses RLS entirely — `.eq("user_id", ...)` IS the
-- tenant boundary, and every read in lib/prediction/ carries one.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Generated signals, and what became of them.
--
-- The signal JSON is stored whole rather than shredded into columns. It is an
-- AUDIT RECORD: the exact object a user was shown, including the evidence and
-- the thresholds in force at the time. Normalising it would mean a later
-- schema change silently rewrites history, and a win rate attributed to a
-- rule nobody can reconstruct is not a measurement.
--
-- The queryable fields are lifted out alongside it for indexing only.
-- ---------------------------------------------------------------------------

create table if not exists public.prediction_signals (
  id          uuid primary key default gen_random_uuid(),
  -- Null for a signal generated by a scan rather than for one person.
  user_id     uuid references public.profiles(id) on delete cascade,

  market_id   text not null,
  condition_id text,
  token_id    text not null,

  strategy_id      text not null,
  strategy_version text not null,

  direction   text not null
                check (direction in ('long_yes','long_no','long_outcome','neutral','watch')),
  strength    text not null check (strength in ('low','medium','high')),

  -- The whole PredictionTechnicalSignal, exactly as rendered.
  signal      jsonb not null,

  -- Lifecycle. A setup that never entered is neither a win nor a loss, which
  -- is why 'waiting_entry' and 'expired' are distinct from 'invalidated'.
  status      text not null default 'generated'
                check (status in ('generated','waiting_entry','entered','target_hit',
                                  'invalidated','expired','cancelled')),

  -- Forward tracking. Paper only: nothing here places an order.
  entry_filled_at timestamptz,
  entry_price     numeric check (entry_price > 0 and entry_price < 1),
  resolved_at     timestamptz,
  -- Signed probability points from entry. Null until resolved.
  result_points   numeric,

  generated_at timestamptz not null default now(),
  expires_at   timestamptz,
  updated_at   timestamptz not null default now()
);

create index if not exists prediction_signals_user_idx
  on public.prediction_signals(user_id, generated_at desc);

create index if not exists prediction_signals_market_idx
  on public.prediction_signals(market_id, generated_at desc);

-- The lifecycle worker's hot path: everything still being tracked.
create index if not exists prediction_signals_open_idx
  on public.prediction_signals(status, expires_at)
  where status in ('generated','waiting_entry','entered');

alter table public.prediction_signals enable row level security;

-- ---------------------------------------------------------------------------
-- Forward order-book features.
--
-- Polymarket publishes probability history but not historical DEPTH, so
-- order-book strategies have no comparable historical sample and report no
-- win rate (see lib/prediction/signal-backtest.ts). This table is how that
-- stops being true: features are recorded as they are observed, so the
-- sample accumulates from real observations rather than a reconstruction.
--
-- Deliberately NOT a raw update log. Storing every WebSocket frame forever
-- costs gigabytes per market per month to answer questions that the derived
-- features answer directly. One row per token per sampling interval.
-- ---------------------------------------------------------------------------

create table if not exists public.prediction_book_snapshots (
  id          bigserial primary key,
  token_id    text not null,
  market_id   text not null,

  best_bid    numeric,
  best_ask    numeric,
  midpoint    numeric,
  microprice  numeric,
  spread      numeric,

  bid_depth_1  numeric,
  ask_depth_1  numeric,
  bid_depth_5  numeric,
  ask_depth_5  numeric,
  imbalance_5  numeric check (imbalance_5 >= -1 and imbalance_5 <= 1),

  -- Which transport produced it. A snapshot is not a live observation, and
  -- a sample pooled across both without this column cannot be split later.
  transport   text not null default 'rest_snapshot'
                check (transport in ('rest_snapshot','realtime')),

  recorded_at timestamptz not null default now()
);

create index if not exists prediction_book_snapshots_token_idx
  on public.prediction_book_snapshots(token_id, recorded_at desc);

-- Retention sweeps read this. Compression and pruning live in the worker.
create index if not exists prediction_book_snapshots_recorded_idx
  on public.prediction_book_snapshots(recorded_at);

alter table public.prediction_book_snapshots enable row level security;

-- ---------------------------------------------------------------------------
-- Alert rules.
--
-- Separate from price_alerts (0007): that table keys on a SYMBOL and a spot
-- price. A prediction alert keys on an outcome token, and half of its kinds
-- are not price thresholds at all — imbalance, spread, and the signal
-- lifecycle events. Forcing both into one table would mean a symbol column
-- that is null for half the rows and a direction column that means different
-- things per kind.
--
-- `state` is what stops an alert firing on every tick: a threshold rule that
-- has fired sits in 'triggered' until the condition clears and re-arms it.
-- ---------------------------------------------------------------------------

create table if not exists public.prediction_alert_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  market_id   text not null,
  token_id    text,
  market_question text,
  outcome_label   text,

  kind        text not null
                check (kind in ('price_above','price_below','probability_change',
                                'orderbook_imbalance','spread_expansion','spread_compression',
                                'liquidity_change','signal_new','signal_entry','signal_target',
                                'signal_invalidated','signal_expired','market_resolution')),

  -- The level, in the unit the kind implies: 0–1 for price, −1..1 for
  -- imbalance, probability POINTS for a change, dollars for liquidity.
  threshold   numeric,

  -- Set for the signal_* kinds. Refers to a stored signal id, never to model
  -- text — an alert that names a setup must name the exact one it watched.
  signal_id   uuid references public.prediction_signals(id) on delete cascade,

  -- armed -> triggered -> armed. Never fires twice without re-arming.
  state       text not null default 'armed' check (state in ('armed','triggered','disabled')),
  last_value  numeric,
  triggered_at timestamptz,
  -- Suppresses a re-fire for this long even after the condition clears.
  cooldown_seconds integer not null default 300 check (cooldown_seconds >= 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prediction_alert_rules_user_idx
  on public.prediction_alert_rules(user_id, created_at desc);

-- The evaluator's hot path.
create index if not exists prediction_alert_rules_armed_idx
  on public.prediction_alert_rules(token_id)
  where state = 'armed';

-- One rule per user per market/outcome/kind/threshold. Re-sending the same
-- request re-arms rather than stacking duplicates that all fire together.
create unique index if not exists prediction_alert_rules_unique_idx
  on public.prediction_alert_rules(
    user_id, market_id, coalesce(token_id, ''), kind, coalesce(threshold, -999)
  );

alter table public.prediction_alert_rules enable row level security;

-- ---------------------------------------------------------------------------
-- Watchlist. What a user wants kept warm.
--
-- Also the subscription manager's persistence: the reference counts in
-- lib/prediction/state.ts live in process memory and do not survive a
-- restart, so this is what tells a fresh process which markets to re-watch.
-- ---------------------------------------------------------------------------

create table if not exists public.prediction_watchlist (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  market_id   text not null,
  token_id    text,
  market_question text,
  added_at    timestamptz not null default now(),
  primary key (user_id, market_id)
);

create index if not exists prediction_watchlist_market_idx
  on public.prediction_watchlist(market_id);

alter table public.prediction_watchlist enable row level security;

-- ============= 0012_prepared_action_signature.sql =============
-- ---------------------------------------------------------------------------
-- The evidence behind a confirmed prepared action.
--
-- A prepared swap becomes `confirmed` only once the person's wallet signed it
-- and it landed. The signature is that proof, checked against the chain by
-- /api/actions before the row changes — and kept here, so the record says
-- which transaction did it rather than only that something did.
--
-- Null for every other status, and for rows confirmed before this column.
--
-- Safe to run against a database that already has it.
-- ---------------------------------------------------------------------------

alter table public.prepared_actions
  add column if not exists confirmed_signature text;

-- ================= 0013_delivery_schedule.sql =================
-- ---------------------------------------------------------------------------
-- The delivery tick, scheduled by the database.
--
-- Notifications are checked every five minutes. Vercel's Hobby plan only
-- runs a cron once a day — and fails the deploy when one is set more often —
-- so the schedule lives here instead: pg_cron fires every five minutes and
-- pg_net calls the API's delivery route(s) with the shared CRON_SECRET.
-- vercel.json keeps one daily run as a fallback. A duplicate call is
-- harmless: every send is claimed once, through a unique constraint, before
-- it goes out.
--
-- The API URL and the secret are NOT in this file. They live in Supabase
-- Vault, set once by hand (see supabase/SCHEDULER.md):
--
--   select vault.create_secret('https://api.getelyra.xyz', 'elyra_api_url');
--   select vault.create_secret('<the CRON_SECRET set in Vercel>', 'elyra_cron_secret');
--
-- Until both exist the tick does nothing, so applying this file is safe on a
-- database that is not wired to a deployment yet.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.elyra_delivery_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base   text;
  secret text;
  route  text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'elyra_api_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'elyra_cron_secret';
  if base is null or secret is null then
    return;
  end if;

  -- Every route the tick drives. The app's own delivery route is added here
  -- when it exists.
  foreach route in array array['/api/telegram/deliver'] loop
    perform net.http_get(
      url := rtrim(base, '/') || route,
      headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
      -- A pass can take minutes; the route's own ceiling is 300s.
      timeout_milliseconds := 300000
    );
  end loop;
end;
$$;

-- Functions in `public` are callable through the REST API. This one is for
-- the scheduler only.
revoke execute on function public.elyra_delivery_tick() from public, anon, authenticated;

-- Scheduling under an existing name replaces that job, so this stays one job.
select cron.schedule('elyra-delivery', '*/5 * * * *', 'select public.elyra_delivery_tick()');

