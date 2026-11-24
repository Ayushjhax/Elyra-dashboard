-- ---------------------------------------------------------------------------
-- 0032 — The paper account.
--
-- A person trades from two accounts side by side: Live, with the funds in
-- their own Hyperliquid account, and Paper, with virtual equity that never
-- touches their money. The Live / Paper switch in the header picks which one
-- orders go to (`active`).
--
-- The paper balance is never stored as a figure. It is `starting_usd` plus
-- the results of the account's paper positions opened since `started_at`,
-- read from trading_positions (lib/paper/funds.ts), so it cannot drift from
-- the trades it is made of. Claiming starts it at $100,000; a reset starts
-- it again from now. An AI fund's paper positions are the fund's own
-- capital (0025) and are not part of it.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer. Additive and safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.paper_accounts (
  user_id       uuid primary key references public.profiles(id) on delete cascade,
  starting_usd  numeric not null default 100000 check (starting_usd > 0 and starting_usd <= 1000000),
  -- Paper positions opened from here on are this balance's.
  started_at    timestamptz not null default now(),
  -- The account orders go to: true is Paper, false is Live.
  active        boolean not null default false,
  resets        integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.paper_accounts enable row level security;
