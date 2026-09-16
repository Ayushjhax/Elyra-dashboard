-- ---------------------------------------------------------------------------
-- Backtest results.
--
-- ── One row per run, with the arrays inline ─────────────────────────────
--
-- A year of hourly bars produces a few hundred trades and ~8,700 equity
-- points. That is tens of kilobytes of JSON — small enough to live in the row
-- and far simpler than a side table plus object storage. The listing query
-- selects explicit columns rather than `*`, so browsing history never drags
-- the arrays across the wire.
--
-- ── Why the config is stored whole ──────────────────────────────────────
--
-- A result is only meaningful alongside the assumptions that produced it: the
-- fee, the slippage, the execution timing, the exact parameters. Storing them
-- as a blob beside the numbers is what makes a saved result reproducible, and
-- `engine_version` plus `strategy_version` say whether today's code would
-- still produce it.
--
-- Same lockdown as the rest of the schema: Privy means auth.uid() is null, so
-- RLS is on with no policies and every query filters by user_id.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.backtest_results (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- What was asked for, as typed, so history reads like the user's own words.
  query       text,

  instrument   text not null,
  venue        text not null,
  timeframe    text not null,
  strategy_id  text not null,
  strategy_version integer not null,
  engine_version   text not null,

  started_at  timestamptz not null,
  ended_at    timestamptz not null,

  status      text not null default 'queued'
                check (status in ('queued','loading','simulating','complete','failed')),
  status_detail text,

  -- The full BacktestConfig, including costs and execution timing.
  config      jsonb,
  -- Computed metrics. Nulls inside are meaningful: see lib/backtest/metrics.
  metrics     jsonb,
  -- Trades and the equity curve.
  trades      jsonb,
  equity      jsonb,
  -- Robustness checks, when they were run.
  robustness  jsonb,

  quality     text check (quality in ('insufficient_data','insufficient_trades','valid','valid_with_warnings')),
  -- Every caveat, so a stored result still carries its own warnings.
  warnings    jsonb,

  error       text,

  created_at  timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists backtest_results_user_idx
  on public.backtest_results(user_id, created_at desc);

create index if not exists backtest_results_active_idx
  on public.backtest_results(created_at)
  where status not in ('complete', 'failed');

alter table public.backtest_results enable row level security;
