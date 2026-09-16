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
