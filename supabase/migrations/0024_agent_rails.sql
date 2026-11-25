-- ---------------------------------------------------------------------------
-- 0024 — Agent rails: the permissioned path between AI agents and money.
--
-- An outside agent holds an Elyra agent key (0022), never a wallet key. The
-- person who owns the key grants it a MANDATE: which kinds of transaction it
-- may ask for, which assets, a per-intent and a daily dollar cap, which payees
-- it may pay, when the grant ends, and whether perp orders may run without a
-- review. The agent then submits INTENTS — a swap, a stablecoin payment, a
-- perp order — and Elyra decides each one against the mandate and a
-- sanctions screen, then routes it: the person approves and signs it in their
-- own wallet, or (perp orders only, within the mandate) it runs through the
-- Hyperliquid API wallet they already approved, which cannot withdraw.
--
-- Every step is written to RAILS_LEDGER, an append-only chain per account:
-- each event carries the SHA-256 of the one before it, so the history of
-- what every agent asked for, what was decided and what settled on-chain is
-- tamper-evident and can be verified by anyone holding the export.
--
-- PAYMENT_REQUESTS let an agent (or the person) get paid in USDC on Solana: a
-- Solana Pay request with a reference key, settled when the chain shows a
-- transfer of at least the amount to the recipient that carries the
-- reference.
--
-- RLS on, no policies: the server reads and writes with the service role.
-- Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.agent_mandates (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  key_id          uuid not null references public.agent_keys(id) on delete cascade,
  kinds           text[] not null
                    check (cardinality(kinds) > 0
                           and kinds <@ array['swap', 'payment', 'perp_order', 'payment_request']::text[]),
  -- Null: any asset the action itself allows. Otherwise upper-case symbols.
  assets          text[],
  per_intent_usd  numeric not null check (per_intent_usd > 0 and per_intent_usd <= 10000),
  daily_usd       numeric not null check (daily_usd >= per_intent_usd and daily_usd <= 50000),
  -- Empty: any payee that passes screening. Otherwise the only addresses a payment may go to.
  payees          text[] not null default '{}',
  -- Perp orders within the mandate run without a review (through the API wallet, which cannot withdraw).
  auto_perps      boolean not null default false,
  -- Perp orders may go live (still subject to the server's own live switch and the approved key).
  live_perps      boolean not null default false,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  revoked_at      timestamptz
);

-- One live mandate per key.
create unique index if not exists agent_mandates_live_key_idx
  on public.agent_mandates(key_id) where revoked_at is null;
create index if not exists agent_mandates_user_idx on public.agent_mandates(user_id, created_at desc);

alter table public.agent_mandates enable row level security;

create table if not exists public.agent_intents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  key_id        uuid not null references public.agent_keys(id) on delete cascade,
  kind          text not null check (kind in ('swap', 'payment', 'perp_order')),
  -- The intent as Elyra normalised it: resolved symbols, base units, the payee.
  params        jsonb not null,
  usd_value     numeric,
  status        text not null check (status in
                  ('rejected', 'pending', 'approved', 'executed', 'declined', 'expired', 'failed')),
  reasons       text[] not null default '{}',
  -- The agent's own words for why. Untrusted text: shown as text, never acted on.
  memo          text check (memo is null or length(memo) <= 280),
  screening     jsonb,
  -- What happened: the observed balance changes, or the order placed.
  result        jsonb,
  -- The transaction that carried it out. Unique: one signature settles one intent.
  signature     text unique,
  -- The ledger hash of the proposal: the agent's receipt.
  receipt       text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  decided_at    timestamptz,
  settled_at    timestamptz
);

create index if not exists agent_intents_user_idx on public.agent_intents(user_id, created_at desc);
create index if not exists agent_intents_key_idx on public.agent_intents(key_id, created_at desc);
create index if not exists agent_intents_open_idx
  on public.agent_intents(expires_at) where status in ('pending', 'approved');

alter table public.agent_intents enable row level security;

create table if not exists public.rails_ledger (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  seq          integer not null check (seq > 0),
  -- The exact ISO time that was hashed, kept as text so it round-trips byte for byte.
  occurred_at  text not null,
  -- "person", "elyra", or "agent:<key id>".
  actor        text not null,
  event        text not null,
  subject_id   uuid,
  body         jsonb not null default '{}'::jsonb,
  prev_hash    text not null,
  hash         text not null unique,
  created_at   timestamptz not null default now(),
  -- A chain never forks: one event per position, one successor per event.
  unique (user_id, seq),
  unique (user_id, prev_hash)
);

create index if not exists rails_ledger_user_idx on public.rails_ledger(user_id, seq desc);

alter table public.rails_ledger enable row level security;

create table if not exists public.payment_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  -- The agent key that asked for it, when an agent did.
  key_id          uuid references public.agent_keys(id) on delete set null,
  recipient       text not null,
  mint            text not null,
  amount_base     text not null check (amount_base ~ '^[1-9][0-9]*$'),
  decimals        integer not null check (decimals between 0 and 18),
  label           text not null check (length(label) between 1 and 80),
  memo            text check (memo is null or length(memo) <= 280),
  -- The Solana Pay reference: a public key with no private key, added to the
  -- payment so the chain can be asked for it.
  reference       text not null unique,
  status          text not null default 'open' check (status in ('open', 'paid', 'expired', 'cancelled')),
  paid_signature  text unique,
  paid_by         text,
  paid_at         timestamptz,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);

create index if not exists payment_requests_user_idx on public.payment_requests(user_id, created_at desc);
create index if not exists payment_requests_open_idx
  on public.payment_requests(expires_at) where status = 'open';

alter table public.payment_requests enable row level security;
