-- ---------------------------------------------------------------------------
-- Trading automation: rules a person sets, and the positions Elyra opens
-- for them on Hyperliquid.
--
-- Execution runs on a Hyperliquid API wallet ("agent") that the person
-- approves from their own wallet. An agent can place and cancel orders for
-- the account and cannot withdraw, transfer, or approve anything — so the
-- key stored here can lose money only by trading, inside the limits below
-- and in lib/autotrade/rules.ts, and the person can revoke it on Hyperliquid
-- at any time without Elyra.
--
-- The key is encrypted with CREDENTIALS_ENC_KEY (lib/crypto/credentials.ts),
-- like exchange API secrets, and is never returned by any route.
--
-- `unique (rule_id, signal_at)` is the idempotency boundary: one rule enters
-- at most once per bar, however many ticks overlap. A position row is
-- written BEFORE its order is sent, so a tick that dies mid-order leaves an
-- `opening` row to reconcile rather than a position nobody recorded.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Deleting an account cascades from profiles. Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.trading_settings (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  -- Stops every new entry, account-wide. Open positions keep their TP and SL.
  paused                boolean not null default false,
  daily_loss_limit_usd  numeric not null default 100 check (daily_loss_limit_usd > 0 and daily_loss_limit_usd <= 5000),
  max_open_positions    integer not null default 3 check (max_open_positions between 1 and 5),
  updated_at            timestamptz not null default now()
);

alter table public.trading_settings enable row level security;

create table if not exists public.trading_agents (
  user_id          uuid primary key references public.profiles(id) on delete cascade,
  network          text not null check (network in ('mainnet', 'testnet')),
  -- The person's Hyperliquid account: the wallet that approved the agent.
  account_address  text not null,
  agent_address    text not null,
  agent_key        text not null,
  -- The nonce of the approval the person signs; checked when it comes back.
  approval_nonce   bigint not null,
  approved_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table public.trading_agents enable row level security;

create table if not exists public.trading_rules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  coin             text not null,
  strategy_id      text not null,
  params           jsonb not null default '{}'::jsonb,
  interval         text not null check (interval in ('15m', '1h', '4h', '1d')),
  size_usd         numeric not null check (size_usd >= 12 and size_usd <= 5000),
  leverage         integer not null check (leverage between 1 and 5),
  take_profit_pct  numeric not null check (take_profit_pct > 0),
  stop_loss_pct    numeric not null check (stop_loss_pct > 0),
  mode             text not null default 'paper' check (mode in ('paper', 'live')),
  enabled          boolean not null default true,
  -- Close time of the last bar this rule entered on.
  last_signal_at   timestamptz,
  -- What the scheduler saw last, in words, for the rule's row.
  last_checked_at  timestamptz,
  last_note        text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists trading_rules_enabled_idx on public.trading_rules(enabled) where enabled;
create index if not exists trading_rules_user_idx on public.trading_rules(user_id);

alter table public.trading_rules enable row level security;

create table if not exists public.trading_positions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  rule_id           uuid references public.trading_rules(id) on delete set null,
  rule_name         text not null,
  mode              text not null check (mode in ('paper', 'live')),
  network           text,
  coin              text not null,
  side              text not null default 'long' check (side in ('long')),
  size              numeric not null check (size > 0),
  entry_price       numeric not null check (entry_price > 0),
  take_profit       numeric not null,
  stop_loss         numeric not null,
  -- The bar close the entry was taken on.
  signal_at         timestamptz not null,
  entry_reason      text,
  entry_cloid       text,
  tp_cloid          text,
  sl_cloid          text,
  status            text not null check (status in ('opening', 'open', 'closed', 'failed')),
  exit_price        numeric,
  exit_reason       text,
  realised_pnl_usd  numeric,
  error             text,
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  unique (rule_id, signal_at)
);

create index if not exists trading_positions_user_idx on public.trading_positions(user_id, opened_at desc);
create index if not exists trading_positions_open_idx on public.trading_positions(status) where status in ('opening', 'open');

alter table public.trading_positions enable row level security;
