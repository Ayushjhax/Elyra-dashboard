-- ---------------------------------------------------------------------------
-- Telegram Capital OS — prepared actions and notification preferences.
--
-- ── Why prepared actions are a TABLE and not a callback payload ──────────
--
-- Telegram gives an inline button 64 bytes of `callback_data` and hands it
-- back verbatim when someone taps it. The tempting design is to pack the
-- action into those bytes — "swap:SOL:USDC:21.25" — and act on what comes
-- back. That is wrong in two separate ways.
--
-- It is UNAUTHENTICATED INPUT. callback_data returns through the same webhook
-- as everything else, and while Telegram vouches for `from.id`, it does not
-- vouch that the payload was one Elyra actually issued. An attacker who can
-- reach the webhook with a valid secret can name any amount.
--
-- It is STALE. A swap prepared against a $100 SOL price and tapped twenty
-- minutes later is a different trade. The amounts have to be re-derived from
-- a live snapshot at confirmation time, which means the server has to know
-- what was proposed — not just what the button said.
--
-- So the button carries an OPAQUE ID and nothing else. Everything that
-- decides what happens lives in this row, written by the server, scoped to a
-- user, and expiring on its own.
--
-- ── What this table is not ──────────────────────────────────────────────
--
-- It is not an execution queue. Nothing in this repository can sign a
-- transaction: there is no signing path anywhere in it. A row here reaching
-- `confirmed` means a human pressed confirm in a surface that can verify who
-- they are — never that a transaction was sent. A Telegram tap moves a row to
-- `acknowledged` at most.
--
-- Same lockdown as the rest of the schema: Privy authentication means
-- auth.uid() is null, so RLS is enabled with no policies — a default deny for
-- every role but the service role — and row scoping is the query's job.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.prepared_actions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  -- The opaque handle a Telegram button carries. Random, not derived from
  -- the contents: a derived id is a guessable id, and guessing one would let
  -- a stranger's tap address someone else's action.
  token        text not null unique,

  kind         text not null check (kind in (
                 'swap','reduce_perp','close_perp','transfer','deposit','withdraw')),

  -- The full prepared preview, exactly as it was shown. Kept verbatim so the
  -- confirmation screen can show what was actually agreed to rather than a
  -- re-rendering that might differ.
  payload      jsonb not null,

  -- Where it was prepared. A preview shown in Telegram and one shown on the
  -- dashboard are the same record; this only says where it started.
  surface      text not null check (surface in ('web','telegram')),

  status       text not null default 'prepared'
                 check (status in ('prepared','acknowledged','confirmed','expired','cancelled')),

  -- Short by design. A financial preview goes stale in minutes, and an action
  -- that cannot be confirmed late cannot be replayed late either.
  expires_at   timestamptz not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists prepared_actions_user_idx
  on public.prepared_actions(user_id, created_at desc);

-- Expiry sweeps scan on this.
create index if not exists prepared_actions_expiry_idx
  on public.prepared_actions(expires_at)
  where status = 'prepared';

create table if not exists public.telegram_notification_preferences (
  user_id            uuid primary key references public.profiles(id) on delete cascade,

  -- Every channel defaults OFF. An unsolicited message containing someone's
  -- balance is a disclosure they did not ask for, and defaulting these on
  -- would make linking a chat an implicit consent to broadcast.
  price_alerts       boolean not null default false,
  liquidation_alerts boolean not null default false,
  large_moves        boolean not null default false,
  daily_summary      boolean not null default false,

  -- Local time of day for the digest, as minutes past midnight, with the IANA
  -- zone it is relative to. Stored apart so a user moving timezone keeps the
  -- hour they chose rather than being silently shifted.
  daily_summary_minute integer not null default 540
                         check (daily_summary_minute between 0 and 1439),
  timezone           text not null default 'UTC',

  -- Below this, a move is not worth a notification. Percent.
  move_threshold_pct numeric not null default 5
                       check (move_threshold_pct > 0),

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Sent notifications, so a restart or a retry does not send the same alert
-- twice. The unique key is the idempotency boundary: it is a constraint
-- rather than a check-then-insert, which races.
create table if not exists public.telegram_notifications_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  -- Whatever makes this alert unique for this user: a symbol plus a bucketed
  -- timestamp, a position id plus a threshold. Built by the sender.
  dedupe_key text not null,
  sent_at    timestamptz not null default now(),
  unique (user_id, kind, dedupe_key)
);

create index if not exists telegram_notifications_sent_idx
  on public.telegram_notifications_sent(user_id, sent_at desc);

alter table public.prepared_actions                    enable row level security;
alter table public.telegram_notification_preferences   enable row level security;
alter table public.telegram_notifications_sent         enable row level security;

-- ---------------------------------------------------------------------------
-- Price alerts.
--
-- A level and a direction, per user per symbol. Deliberately NOT "notify me
-- when SOL is above 120" evaluated continuously — that fires every tick for
-- as long as the condition holds. `triggered_at` is stamped on the first
-- crossing and the row goes quiet until it is re-armed, so an alert is an
-- EVENT rather than a state.
--
-- `direction` is stored rather than inferred from the price at creation time.
-- Inferring it means an alert created while the market is moving can end up
-- meaning the opposite of what the user typed.
-- ---------------------------------------------------------------------------

create table if not exists public.price_alerts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  symbol       text not null,
  direction    text not null check (direction in ('above', 'below')),
  target       numeric not null check (target > 0),

  -- The price when the alert was created. Kept so the notification can say
  -- "SOL crossed 120, up from 96 when you set this" — the context that makes
  -- the alert actionable rather than just true.
  created_price numeric,

  -- Null until it fires. Re-arming clears it.
  triggered_at timestamptz,
  triggered_price numeric,

  created_at   timestamptz not null default now(),

  -- One alert per user, symbol, direction and level. Re-sending the same
  -- command updates the row rather than stacking duplicates that all fire
  -- together.
  unique (user_id, symbol, direction, target)
);

-- The delivery worker scans this: armed alerts only, grouped by symbol.
create index if not exists price_alerts_armed_idx
  on public.price_alerts(symbol)
  where triggered_at is null;

create index if not exists price_alerts_user_idx
  on public.price_alerts(user_id, created_at desc);

alter table public.price_alerts enable row level security;
