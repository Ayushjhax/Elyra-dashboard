-- ---------------------------------------------------------------------------
-- 0030 — Strategy designs: the strategies a person designs in Elyra.
--
-- A design is rules as data (lib/strategies/spec.ts): entry and exit
-- conditions over a fixed set of indicators, and risk limits. It is checked
-- by `validateDesign` before it is stored and run by one interpreter
-- (lib/strategies/interpret.ts), whether the person wrote it, took it from
-- Elyra's library or Elyra's AI proposed it. `result` is the last backtest's
-- summary, kept beside it so the list shows how each one tested.
--
-- Nothing here trades: a design is tested on history, never sent to a
-- venue.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.strategy_designs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null check (length(name) between 1 and 60),
  design      jsonb not null,
  source      text not null check (source in ('designer', 'library', 'ai')),
  result      jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists strategy_designs_user_idx on public.strategy_designs(user_id, updated_at desc);

alter table public.strategy_designs enable row level security;
