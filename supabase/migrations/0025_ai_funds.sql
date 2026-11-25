-- ---------------------------------------------------------------------------
-- 0025 — Autonomous AI funds.
--
-- A fund is a book of the person's own capital that an AI agent manages
-- (an agent key, 0022) inside a charter the person writes: the markets it
-- may trade, how large a position and how much gross exposure it may run,
-- how much leverage, and the drawdown and daily loss at which Elyra stops
-- it. Elyra is the fund's administrator and risk officer: it holds every
-- order to the charter before anything is sent, marks the book to market
-- on the five-minute tick, keeps the units and the high-water mark, halts
-- the fund and flattens it when the drawdown limit is reached, and seals
-- every lifecycle event — and each day's closing NAV — into the person's
-- ledger (rails_ledger, 0024).
--
-- Nothing is pooled and Elyra holds no key that can withdraw. A paper fund
-- trades virtual capital at Hyperliquid's prices; a live fund trades a
-- slice of the person's own Hyperliquid account through the API wallet
-- they approved (0018), which can trade and cannot withdraw. Capital is an
-- allocation of that account, never a transfer. Every fund starts on paper;
-- live is reached only by graduating a paper fund with a record.
--
-- Positions are the automation's own (trading_positions), tagged with the
-- fund, so the five-minute pass manages their exits like any other and the
-- Automation page lists them. One open position per coin per fund is a
-- database guarantee, not a check that two requests could both pass.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_funds (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  -- The manager: the agent key whose tools run this fund. Null = no manager.
  key_id              uuid references public.agent_keys(id) on delete set null,
  name                text not null check (length(name) between 1 and 60),
  -- The person's brief to the manager, in their own words.
  objective           text not null check (length(objective) between 1 and 1200),
  mode                text not null check (mode in ('paper', 'live')),
  status              text not null default 'active'
                        check (status in ('active', 'paused', 'halted', 'winding_down', 'closed')),
  -- The charter. Bounds mirror lib/funds/policy.ts FUND_LIMITS.
  markets             text[] not null check (cardinality(markets) between 1 and 40),
  allow_shorts        boolean not null default true,
  max_position_pct    numeric not null check (max_position_pct >= 1 and max_position_pct <= 100),
  max_gross_exposure  numeric not null check (max_gross_exposure > 0 and max_gross_exposure <= 5),
  max_leverage        integer not null check (max_leverage between 1 and 5),
  max_positions       integer not null check (max_positions between 1 and 5),
  max_drawdown_pct    numeric not null check (max_drawdown_pct >= 2 and max_drawdown_pct <= 50),
  daily_loss_pct      numeric not null check (daily_loss_pct >= 0.5 and daily_loss_pct <= 20),
  -- Accounting, per unit (a unit starts at 100). Units themselves are the
  -- sum of ai_fund_flows; these are the marks the risk checks read.
  hwm_npu             numeric not null default 100 check (hwm_npu > 0),
  day_start_npu       numeric not null default 100 check (day_start_npu > 0),
  day_start_on        date,
  last_nav            numeric,
  last_npu            numeric,
  marked_at           timestamptz,
  halt_reason         text,
  -- A live fund names the paper fund it graduated from.
  predecessor_id      uuid references public.ai_funds(id) on delete set null,
  closed_reason       text check (closed_reason in ('wound_down', 'graduated')),
  final_report        jsonb,
  manager_seen_at     timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  closed_at           timestamptz
);

-- A key manages at most one open fund, so a manager's tools never need to
-- be told which fund they mean.
create unique index if not exists ai_funds_manager_idx
  on public.ai_funds(key_id) where key_id is not null and status <> 'closed';
create index if not exists ai_funds_user_idx on public.ai_funds(user_id, created_at desc);
create index if not exists ai_funds_open_idx on public.ai_funds(status) where status <> 'closed';

alter table public.ai_funds enable row level security;

-- Capital in and out, at the NAV per unit of the moment, so returns are
-- time-weighted: adding money never reads as performance.
create table if not exists public.ai_fund_flows (
  id          uuid primary key default gen_random_uuid(),
  fund_id     uuid not null references public.ai_funds(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('subscribe', 'redeem')),
  amount_usd  numeric not null check (amount_usd > 0),
  npu         numeric not null check (npu > 0),
  units       numeric not null check (units > 0),
  created_at  timestamptz not null default now()
);

create index if not exists ai_fund_flows_fund_idx on public.ai_fund_flows(fund_id, created_at);

alter table public.ai_fund_flows enable row level security;

-- The book marked to market, at most once an hour.
create table if not exists public.ai_fund_marks (
  fund_id    uuid not null references public.ai_funds(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  bucket     timestamptz not null,
  nav        numeric not null,
  npu        numeric not null check (npu > 0),
  gross_usd  numeric not null default 0,
  positions  integer not null default 0,
  primary key (fund_id, bucket)
);

alter table public.ai_fund_marks enable row level security;

-- The manager's journal: its view and its reasons, in its own words. Shown
-- as the agent's text; never acted on, never put in a notice.
create table if not exists public.ai_fund_notes (
  id           uuid primary key default gen_random_uuid(),
  fund_id      uuid not null references public.ai_funds(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  key_id       uuid references public.agent_keys(id) on delete set null,
  position_id  uuid references public.trading_positions(id) on delete set null,
  body         text not null check (length(body) between 1 and 2000),
  created_at   timestamptz not null default now()
);

create index if not exists ai_fund_notes_fund_idx on public.ai_fund_notes(fund_id, created_at desc);

alter table public.ai_fund_notes enable row level security;

-- Fund positions are automation positions, tagged.
alter table public.trading_positions
  add column if not exists fund_id uuid references public.ai_funds(id) on delete set null;

alter table public.trading_positions drop constraint if exists trading_positions_origin_check;
alter table public.trading_positions
  add constraint trading_positions_origin_check check (origin in ('rule', 'order', 'fund'));

create unique index if not exists trading_positions_fund_coin_idx
  on public.trading_positions(fund_id, coin) where fund_id is not null and status in ('opening', 'open');
create index if not exists trading_positions_fund_idx
  on public.trading_positions(fund_id, opened_at desc) where fund_id is not null;

-- A fund's history is the ledger's events about it.
create index if not exists rails_ledger_subject_idx on public.rails_ledger(user_id, subject_id, seq desc);
