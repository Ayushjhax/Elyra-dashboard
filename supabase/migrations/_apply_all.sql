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

