-- ---------------------------------------------------------------------------
-- The Desk: a committee of AI models from different labs that forecasts one
-- market question together, by a fixed procedure, and is scored on it.
--
-- Words only. Nothing here holds, moves or places money; the Desk's only
-- output is a probability, a memo and a record. Each run's question is one
-- the world settles — "{market} closes above its price now at {time}" — on
-- Hyperliquid's one-minute close, so every forecast is scored with the Brier
-- score: each member's before and after review, and the Desk's pooled vote.
-- `desk_seat_stats` accumulates those scores per seat and model; the next
-- vote's weights are read from it (lib/desk/protocol.ts).
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, runs read only by their owner.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.desk_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  market        text not null,
  horizon       text not null check (horizon in ('4h', '24h', '7d')),
  -- The mid when the desk convened; the statement is "closes above" it.
  start_price   numeric not null check (start_price > 0),
  resolves_at   timestamptz not null,
  statement     text not null,
  -- The convener's note, if any; shown to the members as data.
  note          text check (note is null or char_length(note) <= 280),
  stage         text not null default 'facts' check (stage in ('facts', 'brief', 'independent', 'review', 'vote', 'memo', 'done', 'failed')),
  facts         jsonb not null default '[]'::jsonb,
  assignments   jsonb not null default '{}'::jsonb,
  weights       jsonb not null default '{}'::jsonb,
  p_independent numeric,
  p_final       numeric,
  spread        numeric,
  memo          text,
  memo_model    text,
  dissent       jsonb,
  status        text not null default 'open' check (status in ('open', 'up', 'down', 'void')),
  settled_price numeric,
  settled_at    timestamptz,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists desk_runs_user_idx on public.desk_runs(user_id, created_at desc);
create index if not exists desk_runs_open_idx on public.desk_runs(resolves_at) where status = 'open' and stage = 'done';
alter table public.desk_runs enable row level security;

-- One member's answer in one round.
create table if not exists public.desk_turns (
  run_id     uuid not null references public.desk_runs(id) on delete cascade,
  seat       text not null,
  round      text not null check (round in ('independent', 'review')),
  provider   text not null,
  model      text not null,
  p          integer check (p between 1 and 99),
  thesis     text not null default '',
  note       text not null default '',
  changed    boolean,
  -- Cited a figure not on the fact sheet: reasoning withheld, vote kept.
  flagged    boolean not null default false,
  error      text,
  latency_ms integer,
  tokens_in  integer,
  tokens_out integer,
  brier      numeric,
  created_at timestamptz not null default now(),
  primary key (run_id, seat, round)
);
alter table public.desk_turns enable row level security;

-- Each seat's track record, per model; seat 'desk' is the pooled vote.
create table if not exists public.desk_seat_stats (
  seat                  text not null,
  model                 text not null,
  settled               integer not null default 0,
  brier_sum             numeric not null default 0,
  independent_brier_sum numeric not null default 0,
  updated_at            timestamptz not null default now(),
  primary key (seat, model)
);
alter table public.desk_seat_stats enable row level security;
