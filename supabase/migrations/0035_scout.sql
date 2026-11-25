-- ---------------------------------------------------------------------------
-- 0035 — Scout: link reads, smart-money auto-buys and Poly baskets.
--
-- scout_sources   one row per link read in the last day, shared by everyone
--                 who reads it: the claims Elyra's AI found in the source,
--                 each with its quote, graded by code on every read. Pasted
--                 text is never stored here — a person's paste stays in
--                 their own read.
-- scout_reads     a person's reads, each kept as it was when read.
-- scout_rules     auto-buy rules: a smart-money flow or an official listing
--                 announcement opens a market order through the chart
--                 ticket's own path (lib/autotrade/trade.ts). Paper unless
--                 the person chose live and the server is switched to live.
-- scout_fires     what each rule did, written BEFORE the order is sent and
--                 unique on (rule, signal), so a signal never trades twice.
-- poly_baskets    paper baskets of Polymarket outcomes. Elyra places no
-- poly_basket_legs  Polymarket orders; a leg's cost is the book walked for
--                 its stake, its value the bids walked for its shares.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.scout_sources (
  key           text primary key,
  kind          text not null check (kind in ('youtube', 'x', 'article')),
  url           text,
  title         text,
  author        text,
  published_at  timestamptz,
  tier          text not null check (tier in ('primary', 'newsroom', 'unverified')),
  party         text,
  text_origin   text not null check (text_origin in ('page', 'page_copy', 'post', 'transcript')),
  attention     jsonb not null default '[]'::jsonb,
  summary       text,
  claims        jsonb not null default '[]'::jsonb,
  dropped       integer not null default 0,
  model         text,
  read_at       timestamptz not null default now()
);

alter table public.scout_sources enable row level security;

create table if not exists public.scout_reads (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  source_key  text not null,
  view        jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists scout_reads_user_idx on public.scout_reads(user_id, created_at desc);
alter table public.scout_reads enable row level security;

create table if not exists public.scout_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  name             text not null check (length(name) between 1 and 40),
  trigger          text not null check (trigger in ('smart_money', 'listing')),
  side             text not null check (side in ('long', 'short', 'both')),
  coins            text[] not null default '{}',
  min_wallets      integer not null check (min_wallets between 3 and 10),
  size_usd         numeric not null check (size_usd > 0),
  leverage         integer not null check (leverage between 1 and 5),
  take_profit_pct  numeric not null check (take_profit_pct > 0),
  stop_loss_pct    numeric not null check (stop_loss_pct > 0),
  max_per_day      integer not null check (max_per_day between 1 and 5),
  mode             text not null default 'paper' check (mode in ('paper', 'live')),
  status           text not null default 'active' check (status in ('active', 'paused')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists scout_rules_user_idx on public.scout_rules(user_id);
create index if not exists scout_rules_active_idx on public.scout_rules(status) where status = 'active';
alter table public.scout_rules enable row level security;

create table if not exists public.scout_fires (
  id           uuid primary key default gen_random_uuid(),
  rule_id      uuid not null references public.scout_rules(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  signal_key   text not null,
  trigger      text not null check (trigger in ('smart_money', 'listing')),
  coin         text not null,
  side         text not null check (side in ('long', 'short')),
  outcome      text not null check (outcome in ('pending', 'opened', 'refused')),
  reason       text not null default '',
  position_id  uuid references public.trading_positions(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (rule_id, signal_key)
);

create index if not exists scout_fires_user_idx on public.scout_fires(user_id, created_at desc);
alter table public.scout_fires enable row level security;

create table if not exists public.poly_baskets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (length(name) between 1 and 40),
  stake_usd   numeric not null check (stake_usd >= 10 and stake_usd <= 10000),
  created_at  timestamptz not null default now()
);

create index if not exists poly_baskets_user_idx on public.poly_baskets(user_id, created_at desc);
alter table public.poly_baskets enable row level security;

create table if not exists public.poly_basket_legs (
  id             uuid primary key default gen_random_uuid(),
  basket_id      uuid not null references public.poly_baskets(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  condition_id   text not null,
  token_id       text not null,
  outcome        text not null,
  outcome_index  integer not null,
  question       text not null,
  slug           text,
  event_slug     text,
  cost_usd       numeric not null,
  shares         numeric not null,
  entry_price    numeric not null,
  -- 1 won, 0 lost, null while the market is open.
  settled        numeric check (settled in (0, 1)),
  settled_at     timestamptz,
  created_at     timestamptz not null default now(),
  unique (basket_id, token_id)
);

create index if not exists poly_basket_legs_user_idx on public.poly_basket_legs(user_id);
alter table public.poly_basket_legs enable row level security;
