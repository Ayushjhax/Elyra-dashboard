-- ---------------------------------------------------------------------------
-- 0033 — Market reports: the deep research Elyra's agent writes about a
-- token, kept so the person can come back to it without asking again.
--
-- `facts` is what the `deep_research` tool gathered (lib/analysis/research.ts)
-- — price and market data, safety checks, sentiment, derivatives positioning
-- and technicals, each with its source — saved when the tool runs. `reply` is
-- the report the agent then wrote from those facts, attached when the reply
-- finishes; it stays null if the run ended before one was written.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.market_reports (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  subject     text not null check (length(subject) between 1 and 80),
  facts       jsonb not null,
  reply       text,
  created_at  timestamptz not null default now(),
  replied_at  timestamptz
);

create index if not exists market_reports_user_idx on public.market_reports(user_id, created_at desc);

alter table public.market_reports enable row level security;
