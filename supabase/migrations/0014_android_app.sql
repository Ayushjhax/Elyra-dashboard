-- ---------------------------------------------------------------------------
-- The Android app: push devices, the in-app inbox, an ordered watchlist, and
-- actions the agent prepares.
--
-- The app shares this database with the website, so everything here is
-- ADDITIVE: no table is renamed or dropped, and every existing row keeps its
-- meaning. The Telegram tables stay, because the website still uses them.
-- The app never touches them.
--
-- Same lockdown as the rest of the schema: Privy means auth.uid() is null,
-- so RLS is enabled with no policies, the service-role client is the only
-- writer, and every query filters by user_id.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Push devices.
--
-- One row per installed app that has registered for notifications. A token
-- belongs to one account at a time: when another account signs in on the
-- same phone, the row moves to that account rather than being shared, so
-- one person's alerts never reach another person's lock screen.
--
-- A device is disabled, not deleted, when Expo reports it unregistered —
-- the reason stays visible for diagnosis, and the next registration from
-- that phone clears it.
-- ---------------------------------------------------------------------------

create table if not exists public.push_devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  expo_push_token  text not null unique,
  platform         text not null check (platform in ('android', 'ios')),
  app_version      text not null,
  device_name      text,
  created_at       timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  disabled_at      timestamptz,
  disabled_reason  text
);

create index if not exists push_devices_user_idx
  on public.push_devices(user_id)
  where disabled_at is null;

alter table public.push_devices enable row level security;

-- ---------------------------------------------------------------------------
-- The inbox.
--
-- Every notification the app is sent also lands here, so nothing depends on
-- a push arriving: a denied permission, a dropped push or a cleared lock
-- screen still leaves the message in the app. `data` carries what a tap
-- opens (the route and the ids it needs), never a figure the body does not
-- already state.
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in (
                'price_alert',
                'liquidation',
                'large_move',
                'prediction_move',
                'prediction_order',
                'prediction_resolution',
                'prediction_signal',
                'daily_summary',
                'system')),
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);

create index if not exists notifications_user_idx
  on public.notifications(user_id, created_at desc);

-- The unread badge counts these; it never scans the whole inbox.
create index if not exists notifications_unread_idx
  on public.notifications(user_id)
  where read_at is null;

alter table public.notifications enable row level security;

-- ---------------------------------------------------------------------------
-- The watchlist, ordered.
--
-- The table already exists with (user_id, symbol) as its primary key, so a
-- symbol is already unique per account. The app lets a person reorder it,
-- which needs a position. Existing rows are numbered in the order they were
-- added, so nobody's list reshuffles when this runs.
-- ---------------------------------------------------------------------------

alter table public.watchlist
  add column if not exists position integer;

update public.watchlist w
set position = numbered.rn
from (
  select user_id, symbol,
         row_number() over (partition by user_id order by added_at, symbol) - 1 as rn
  from public.watchlist
) numbered
where w.user_id = numbered.user_id
  and w.symbol = numbered.symbol
  and w.position is null;

create index if not exists watchlist_user_position_idx
  on public.watchlist(user_id, position);

-- ---------------------------------------------------------------------------
-- Prepared actions from the app.
--
-- 'web' and 'telegram' stay valid for the website's existing rows. 'app' is
-- an action prepared in the Android app; 'agent' is one an assistant answer
-- prepared, shown as a review card. The opaque `token` stays: the website's
-- Telegram buttons still resolve by it, and every new row gets one from the
-- same generator.
-- ---------------------------------------------------------------------------

alter table public.prepared_actions
  drop constraint if exists prepared_actions_surface_check;

alter table public.prepared_actions
  add constraint prepared_actions_surface_check
  check (surface in ('web', 'telegram', 'app', 'agent'));
