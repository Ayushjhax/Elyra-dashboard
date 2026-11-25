-- ---------------------------------------------------------------------------
-- 0031 — Insider watch: fresh Hyperliquid wallets whose first trade is big.
--
-- `insider_wallets` holds every account the scan (lib/insider/server.ts
-- `runInsiderScan`, on the five-minute tick) has judged, once: `flagged`
-- with its finding — first funding, first bet, the entry's place in the
-- past week's range — or `passed` with the reason. The address is the key,
-- so two overlapping scans write the same row. Everything in a finding is
-- read from Hyperliquid's public data; nothing here trades.
--
-- `insider_watches` is a person asking to be told: the smallest first bet
-- they want to hear about. The website's bell shows the wallets flagged
-- after `created_at` at or above it — on the website only; nothing is sent
-- to the app, push or Telegram.
--
-- `insider_scans` is the last scan, so the page can say when it last looked.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only reader and writer. Additive; safe to run
-- twice.
-- ---------------------------------------------------------------------------

create table if not exists public.insider_wallets (
  address         text primary key check (address ~ '^0x[0-9a-f]{40}$'),
  status          text not null check (status in ('flagged', 'passed')),
  reason          text,
  first_trade_at  timestamptz,
  notional_usd    numeric,
  window_open     boolean not null default false,
  finding         jsonb,
  detected_at     timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists insider_wallets_flagged_idx on public.insider_wallets(status, first_trade_at desc);

create table if not exists public.insider_watches (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  min_usd     numeric not null check (min_usd >= 1000000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.insider_scans (
  id                text primary key,
  at                timestamptz not null,
  leaderboard_rows  integer not null default 0,
  candidates        integer not null default 0,
  checked           integer not null default 0,
  flagged           integer not null default 0,
  error             text
);

alter table public.insider_wallets enable row level security;
alter table public.insider_watches enable row level security;
alter table public.insider_scans enable row level security;
