-- ---------------------------------------------------------------------------
-- 0029 — Rule sets and copy trading.
--
--   - trading_rule_sets: a person's automation rules, grouped. A set can be
--     published, and then anyone can copy it; it is shown by the owner's
--     Arena handle, never by a wallet. `house` marks Elyra's own sets
--     (lib/copy/house.ts), written from code by `ensureHouse`.
--   - trading_rules.set_id: the set a rule belongs to, at most one.
--   - copy_follows: one person copying one set — their size per trade, a
--     leverage ceiling, paper or live, and how far past the leader's entry a
--     copy may still fill.
--   - trading_positions: set_id tags a rule's entry with its set at the
--     moment it entered, so a set's record is exactly the positions tagged
--     with it, as a fund's is (0025). A copy carries copy_id and the leader's
--     position (leader_position_id), and is unique on the pair: one leader
--     entry is copied once per follower, however many ticks overlap. A copy's
--     origin is 'copy'.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Additive and safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.trading_rule_sets (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null check (char_length(name) between 2 and 40),
  description  text not null default '' check (char_length(description) <= 280),
  published    boolean not null default false,
  house        boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists trading_rule_sets_user_idx on public.trading_rule_sets(user_id);
create index if not exists trading_rule_sets_published_idx on public.trading_rule_sets(published) where published;

alter table public.trading_rule_sets enable row level security;

alter table public.trading_rules
  add column if not exists set_id uuid references public.trading_rule_sets(id) on delete set null;

create index if not exists trading_rules_set_idx on public.trading_rules(set_id) where set_id is not null;

create table if not exists public.copy_follows (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  set_id           uuid not null references public.trading_rule_sets(id) on delete cascade,
  size_usd         numeric not null check (size_usd >= 12 and size_usd <= 5000),
  max_leverage     integer not null check (max_leverage between 1 and 5),
  mode             text not null default 'paper' check (mode in ('paper', 'live')),
  max_drift_pct    numeric not null default 1 check (max_drift_pct > 0 and max_drift_pct <= 3),
  enabled          boolean not null default true,
  -- What the pass did last for this follow, in words, for its row.
  last_checked_at  timestamptz,
  last_note        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, set_id)
);

create index if not exists copy_follows_set_idx on public.copy_follows(set_id) where enabled;

alter table public.copy_follows enable row level security;

alter table public.trading_positions
  add column if not exists set_id uuid references public.trading_rule_sets(id) on delete set null,
  add column if not exists copy_id uuid references public.copy_follows(id) on delete set null,
  add column if not exists leader_position_id uuid references public.trading_positions(id) on delete set null;

alter table public.trading_positions drop constraint if exists trading_positions_origin_check;
alter table public.trading_positions
  add constraint trading_positions_origin_check check (origin in ('rule', 'order', 'fund', 'copy'));

create index if not exists trading_positions_set_idx on public.trading_positions(set_id, opened_at desc) where set_id is not null;
create index if not exists trading_positions_leader_idx on public.trading_positions(leader_position_id) where leader_position_id is not null;
create unique index if not exists trading_positions_copy_once
  on public.trading_positions(copy_id, leader_position_id)
  where copy_id is not null and leader_position_id is not null;
