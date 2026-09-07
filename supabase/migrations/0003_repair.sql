-- ---------------------------------------------------------------------------
-- Repair: bring a live database up to what the code expects.
--
-- Idempotent and safe to re-run. Everything here is `if not exists`, so
-- applying it to a database that already has these objects changes nothing.
--
-- Why this file exists rather than "just re-run 0001":
--
--   `create table if not exists` does nothing to a table that already exists.
--   0001_init.sql grew `alter table ... add column if not exists` lines for
--   exactly this reason, but a database created from the revision *before*
--   those lines landed never receives them unless 0001 is re-run — and
--   re-running a whole init file against a live database is the sort of thing
--   people are reasonably unwilling to do.
--
-- What was actually wrong, measured against the live project:
--
--   1. `profiles.solana_address` was absent. Every query naming it failed
--      with 42703, `lib/auth/session.ts` fell back to a column list without
--      it, and the session's Solana address was therefore null for every
--      user — which the wallet route reported as "This account has no Solana
--      wallet." over funded Phantom and Jupiter wallets, and which the health
--      meter read as the Solana RPC being degraded. The RPC was fine.
--
--   2. `public.smart_money_findings` did not exist. PostgREST answered
--      PGRST205 from its own schema cache and the panel said so.
--
-- The application no longer depends on (1) being applied — Privy is the
-- source of truth for linked wallets and the session resolves the address
-- from it on a cache miss. Applying this turns that per-request lookup back
-- into a cached column read, which is what it was always meant to be.
-- ---------------------------------------------------------------------------

-- 1. Identity ---------------------------------------------------------------

alter table public.profiles add column if not exists solana_address text;
alter table public.profiles add column if not exists wallet_address text;
alter table public.profiles add column if not exists display_name   text;

-- Sessions look a profile up by DID on every authenticated request. The
-- unique constraint in 0001 already indexes it; this is a no-op there and
-- repairs a database whose constraint was created without one.
create unique index if not exists profiles_privy_did_idx
  on public.profiles (privy_did);

-- 2. Smart-money findings ---------------------------------------------------
--
-- Mirrors elyra-signals/migrations/0002_smart_money.sql so a dashboard
-- database can be brought up without checking out the engine repo. Kept
-- byte-identical in its column definitions; if the two ever diverge, that
-- file is the original.

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

alter table public.smart_money_findings enable row level security;

-- Row-level security is the backstop here, not the mechanism — see the note
-- at the top of 0001_init.sql. Identity is Privy, so `auth.uid()` is never
-- populated and a policy keyed on it would match nothing. Findings are not
-- user-scoped in any case: they are public market observations.
drop policy if exists smart_money_read on public.smart_money_findings;
create policy smart_money_read
  on public.smart_money_findings
  for select
  using (true);

-- 3. Reload PostgREST's schema cache ----------------------------------------
--
-- Without this the new table exists in Postgres and PostgREST still answers
-- PGRST205 for it until its cache happens to refresh, which looks exactly
-- like the migration not having run.

notify pgrst, 'reload schema';
