-- ---------------------------------------------------------------------------
-- Prediction markets — account linkage and alert preferences.
--
-- ── Why a separate address column ───────────────────────────────────────
--
-- Polymarket positions are held by a PROXY WALLET, not by the EOA that
-- controls it. Polymarket deploys a contract wallet per user and trades from
-- that, so a user's Privy EVM address and their Polymarket address are
-- usually different strings. Querying the Data API with the EOA returns an
-- empty array — which is indistinguishable from "this person has no
-- positions" unless we know whether we asked about the right address at all.
--
-- That ambiguity is the entire reason this column exists. With it, an empty
-- result means "no positions". Without it, an empty result means nothing,
-- and reporting $0 prediction exposure would be a fabrication.
--
-- Nullable by design: market data is public and browsing needs no account.
--
-- Same lockdown as the rest of the schema: Privy means auth.uid() is null, so
-- RLS is on with no policies and row scoping is the query's job.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists polymarket_address text;

-- Set when the address was confirmed to resolve against the Data API, so a
-- typo does not sit there forever looking like a connected account.
alter table public.profiles
  add column if not exists polymarket_verified_at timestamptz;

-- ---------------------------------------------------------------------------
-- Prediction alert preferences.
--
-- Added to the existing Telegram preference row rather than a new table:
-- these are the same product decision ("what may Elyra send me unprompted")
-- and splitting them would mean two reads and two failure modes for one
-- question. Every flag defaults OFF, like the others.
-- ---------------------------------------------------------------------------

alter table public.telegram_notification_preferences
  add column if not exists prediction_alerts boolean not null default false;

alter table public.telegram_notification_preferences
  add column if not exists prediction_order_updates boolean not null default false;

alter table public.telegram_notification_preferences
  add column if not exists prediction_resolution_alerts boolean not null default false;

-- In PERCENTAGE POINTS, not percent-of-percent. A market moving 54% -> 64% is
-- a 10-point move and a ~18.5% relative move; the first is what anyone means
-- when they say "tell me if it moves 10%", and conflating them makes the
-- alert fire roughly twice as often as asked.
alter table public.telegram_notification_preferences
  add column if not exists prediction_move_threshold_points numeric not null default 10
    check (prediction_move_threshold_points > 0);

-- ---------------------------------------------------------------------------
-- Probability snapshots, so a "moved 10 points today" alert has a baseline.
--
-- Without a stored previous value there is nothing to compare against, and an
-- alert on "current probability" alone can only ever fire on a level, never
-- on a change.
-- ---------------------------------------------------------------------------

create table if not exists public.prediction_probability_marks (
  -- The CLOB token id for one outcome of one market. Not the condition id:
  -- a multi-outcome market has one row per outcome.
  token_id     text primary key,
  market_id    text not null,
  title        text,
  probability  numeric not null check (probability >= 0 and probability <= 1),
  recorded_at  timestamptz not null default now()
);

create index if not exists prediction_probability_marks_recorded_idx
  on public.prediction_probability_marks(recorded_at desc);

alter table public.prediction_probability_marks enable row level security;
