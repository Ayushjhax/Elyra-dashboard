-- ---------------------------------------------------------------------------
-- Elyra Arena, phase 1: trade reviews, calls with receipts, the daily chart
-- puzzle, and the groups and profiles that decide who sees what.
--
-- Points and paper only. Nothing here holds, moves or promises money: no
-- buy-ins, prizes, wagers, escrow or deposits (docs/ARENA_REAL_MONEY.md).
--
-- Calls are append-only: there is no update path in the API for a call's
-- statement, and its receipt is a SHA-256 over the canonical text and the
-- server timestamp, so a call cannot be quietly rewritten after the fact.
-- `onchain_signature` is reserved for a Solana memo the person signs later.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.trade_reviews (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id) on delete cascade,
  position_id    uuid not null unique references public.trading_positions(id) on delete cascade,
  label          text not null check (label in ('brilliant', 'great', 'good', 'inaccuracy', 'mistake', 'blunder')),
  -- What the label and the coaching were computed from, exactly.
  facts          jsonb not null,
  coaching       text not null,
  -- The model that wrote the coaching, or 'fallback' when the code did.
  coaching_model text not null,
  created_at     timestamptz not null default now()
);
create index if not exists trade_reviews_user_idx on public.trade_reviews(user_id, created_at desc);
alter table public.trade_reviews enable row level security;

create table if not exists public.arena_profiles (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  -- Chosen by the person, lower-case; never the wallet address.
  handle     text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  public     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.arena_profiles enable row level security;

create table if not exists public.arena_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 40),
  invite_code text not null unique,
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
alter table public.arena_groups enable row level security;

create table if not exists public.arena_group_members (
  group_id  uuid not null references public.arena_groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists arena_group_members_user_idx on public.arena_group_members(user_id);
alter table public.arena_group_members enable row level security;

create table if not exists public.arena_calls (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  market            text not null,
  direction         text not null check (direction in ('above', 'below')),
  price             numeric not null check (price > 0),
  resolves_at       timestamptz not null,
  confidence        integer not null check (confidence between 50 and 99),
  visibility        text not null default 'private' check (visibility in ('private', 'groups', 'public')),
  statement         text not null,
  receipt           text not null,
  created_at        timestamptz not null,
  status            text not null default 'open' check (status in ('open', 'hit', 'miss', 'void')),
  settled_price     numeric,
  settled_source    text,
  settled_at        timestamptz,
  brier             numeric,
  -- The hit card or the eulogy, written once the call settles.
  card              text,
  card_model        text,
  onchain_signature text
);
create index if not exists arena_calls_user_idx on public.arena_calls(user_id, created_at desc);
create index if not exists arena_calls_open_idx on public.arena_calls(resolves_at) where status = 'open';
alter table public.arena_calls enable row level security;

create table if not exists public.arena_call_backings (
  id             uuid primary key default gen_random_uuid(),
  call_id        uuid not null references public.arena_calls(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  stance         text not null check (stance in ('tail', 'fade')),
  points         integer not null check (points between 1 and 100),
  -- The ISO week the points came out of, e.g. '2026-W46'.
  week           text not null,
  settled_points integer,
  created_at     timestamptz not null default now(),
  unique (call_id, user_id)
);
create index if not exists arena_call_backings_user_idx on public.arena_call_backings(user_id, week);
alter table public.arena_call_backings enable row level security;

create table if not exists public.arena_puzzle_days (
  puzzle_date  date primary key,
  number       integer not null,
  market       text not null,
  interval     text not null,
  -- Close time of the last visible bar.
  ends_at      timestamptz not null,
  -- Visible bars, rebased so the first close is 100; the future is not here.
  visible      jsonb not null,
  -- The hidden answer and the bars that reveal it.
  outcome      text not null check (outcome in ('up', 'down')),
  change_pct   numeric not null,
  reveal       jsonb not null,
  bot_direction text not null check (bot_direction in ('up', 'down')),
  bot_correct  boolean not null,
  -- The momentum bot's rating after this puzzle.
  bot_rating   numeric not null,
  created_at   timestamptz not null default now()
);
alter table public.arena_puzzle_days enable row level security;

create table if not exists public.arena_puzzle_answers (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  puzzle_date   date not null references public.arena_puzzle_days(puzzle_date) on delete cascade,
  direction     text not null check (direction in ('up', 'down')),
  confidence    integer not null check (confidence between 50 and 99),
  correct       boolean not null,
  rating_before numeric not null,
  rating_after  numeric not null,
  streak        integer not null,
  created_at    timestamptz not null default now(),
  primary key (user_id, puzzle_date)
);
alter table public.arena_puzzle_answers enable row level security;
