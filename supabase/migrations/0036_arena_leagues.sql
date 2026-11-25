-- ---------------------------------------------------------------------------
-- Elyra Arena, launch: leagues (fantasy sport, played with markets) and the
-- ladders.
--
-- Points and paper only. Nothing here holds, moves or promises money: no
-- buy-ins, prizes, wagers, escrow or deposits (docs/ARENA_REAL_MONEY.md).
--
-- A league snake-drafts markets; once a market is picked, nobody else in the
-- league can hold it (`arena_league_picks` unique (league, market), and the
-- partial unique index on `arena_league_slots` for what is held now). The
-- draft is append-only. A roster slot records the first and last round it
-- counts for, so a lineup is read for any round without a snapshot — a move
-- made during round k counts from k + 1 (lib/arena/league.ts).
--
-- Rounds are scored on Hyperliquid's daily opens, cached once in
-- `arena_market_opens`: a daily bar's open never changes after 00:00 UTC.
--
-- The ladders read four columns kept on `arena_profiles`, refreshed from the
-- answers and the calls whenever either changes, and backfilled here.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id or
-- by a league the user is in. Additive; safe to run twice.
-- ---------------------------------------------------------------------------

alter table public.arena_profiles add column if not exists puzzle_rating numeric;
alter table public.arena_profiles add column if not exists puzzle_played integer not null default 0;
alter table public.arena_profiles add column if not exists calls_settled integer not null default 0;
alter table public.arena_profiles add column if not exists calls_brier numeric;

update public.arena_profiles p
   set puzzle_rating = latest.rating_after,
       puzzle_played = latest.played
  from (
    select distinct on (user_id) user_id, rating_after, count(*) over (partition by user_id) as played
      from public.arena_puzzle_answers
     order by user_id, puzzle_date desc
  ) latest
 where latest.user_id = p.user_id;

update public.arena_profiles p
   set calls_settled = settled.calls,
       calls_brier = settled.brier
  from (
    select user_id, count(*) as calls, avg(brier) as brier
      from public.arena_calls
     where status in ('hit', 'miss')
     group by user_id
  ) settled
 where settled.user_id = p.user_id;

create table if not exists public.arena_leagues (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 40),
  invite_code      text not null unique,
  owner_id         uuid not null references public.profiles(id) on delete cascade,
  roster_size      integer not null check (roster_size between 3 and 6),
  rounds           integer not null check (rounds between 3 and 12),
  -- A round is a day or a week.
  round_days       integer not null check (round_days in (1, 7)),
  -- Two minutes (a live draft night), an hour, eight hours.
  pick_seconds     integer not null check (pick_seconds in (120, 3600, 28800)),
  status           text not null default 'forming' check (status in ('forming', 'drafting', 'active', 'done')),
  draft_started_at timestamptz,
  -- The first 00:00 UTC after the last pick.
  season_starts_at timestamptz,
  -- The last pick whose manager was told they are on the clock (slow drafts);
  -- -1 once every manager has been told the draft is done.
  notified_pick    integer,
  champion_id      uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists arena_leagues_live_idx on public.arena_leagues(status) where status in ('drafting', 'active');
alter table public.arena_leagues enable row level security;

create table if not exists public.arena_league_managers (
  league_id  uuid not null references public.arena_leagues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  -- Dealt at random when the draft starts.
  draft_slot integer check (draft_slot between 0 and 9),
  joined_at  timestamptz not null default now(),
  primary key (league_id, user_id),
  unique (league_id, draft_slot)
);
create index if not exists arena_league_managers_user_idx on public.arena_league_managers(user_id);
alter table public.arena_league_managers enable row level security;

-- The draft itself. Append-only: one row per pick, one manager per market.
create table if not exists public.arena_league_picks (
  league_id uuid not null references public.arena_leagues(id) on delete cascade,
  pick      integer not null check (pick >= 0),
  user_id   uuid not null references public.profiles(id) on delete cascade,
  market    text not null,
  -- Made for the manager when their clock ran out.
  auto      boolean not null default false,
  picked_at timestamptz not null,
  primary key (league_id, pick),
  unique (league_id, market)
);
alter table public.arena_league_picks enable row level security;

-- Who holds what, and for which rounds it counts.
create table if not exists public.arena_league_slots (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.arena_leagues(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  market     text not null,
  from_round integer not null check (from_round >= 1),
  -- The last round it counts for; null while still held.
  to_round   integer check (to_round >= 0),
  via        text not null check (via in ('draft', 'free_agent')),
  created_at timestamptz not null default now()
);
create unique index if not exists arena_league_slots_held_idx on public.arena_league_slots(league_id, market) where to_round is null;
create index if not exists arena_league_slots_league_idx on public.arena_league_slots(league_id);
alter table public.arena_league_slots enable row level security;

create table if not exists public.arena_league_matchups (
  league_id  uuid not null references public.arena_leagues(id) on delete cascade,
  round      integer not null check (round >= 1),
  home_id    uuid not null references public.profiles(id) on delete cascade,
  -- Null is a bye.
  away_id    uuid references public.profiles(id) on delete cascade,
  home_pct   numeric,
  away_pct   numeric,
  result     text check (result in ('home', 'away', 'tie', 'void')),
  -- Each market's move the result was computed from.
  facts      jsonb,
  settled_at timestamptz,
  primary key (league_id, round, home_id)
);
alter table public.arena_league_matchups enable row level security;

-- The commentator's recap of a settled round, written from computed facts.
create table if not exists public.arena_league_recaps (
  league_id  uuid not null references public.arena_leagues(id) on delete cascade,
  round      integer not null,
  text       text not null,
  model      text not null,
  facts      jsonb not null,
  created_at timestamptz not null default now(),
  primary key (league_id, round)
);
alter table public.arena_league_recaps enable row level security;

-- Hyperliquid's daily open for a market, cached: it never changes once the day starts.
create table if not exists public.arena_market_opens (
  market     text not null,
  day        date not null,
  open       numeric not null check (open > 0),
  created_at timestamptz not null default now(),
  primary key (market, day)
);
alter table public.arena_market_opens enable row level security;

-- ---------------------------------------------------------------------------
-- Three writes that must each happen whole, so they are functions.
--
-- Joining and dealing the draft both lock the league's row: a join cannot
-- land while the slots are being dealt, nor take a league past capacity.
-- A pick is written with its roster slot or not at all, so a drafted market
-- is never missing from its manager's roster. Service role only.
-- ---------------------------------------------------------------------------

create or replace function public.arena_league_join(p_league uuid, p_user uuid, p_capacity int)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.arena_leagues where id = p_league for update;
  if not found then
    return 'missing';
  end if;
  if exists (select 1 from public.arena_league_managers where league_id = p_league and user_id = p_user) then
    return 'member';
  end if;
  if v_status <> 'forming' then
    return 'closed';
  end if;
  if (select count(*) from public.arena_league_managers where league_id = p_league) >= p_capacity then
    return 'full';
  end if;
  insert into public.arena_league_managers (league_id, user_id, draft_slot, joined_at)
  values (p_league, p_user, null, now());
  return 'joined';
end;
$$;

revoke all on function public.arena_league_join(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.arena_league_join(uuid, uuid, int) to service_role;

-- Deals the draft slots in the order given and starts the clock. The order
-- must name exactly the managers there are now, each once; if someone joined
-- or left since it was drawn, nothing changes and the caller draws again.
create or replace function public.arena_league_start(p_league uuid, p_owner uuid, p_order uuid[], p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league public.arena_leagues%rowtype;
  v_size   int := coalesce(array_length(p_order, 1), 0);
begin
  select * into v_league from public.arena_leagues where id = p_league for update;
  if not found then
    return 'missing';
  end if;
  if v_league.owner_id <> p_owner then
    return 'not_owner';
  end if;
  if v_league.status <> 'forming' then
    return 'started';
  end if;
  if (select count(*) from public.arena_league_managers where league_id = p_league) <> v_size
     or (select count(distinct entry) from unnest(p_order) as entry) <> v_size
     or exists (select 1 from public.arena_league_managers m where m.league_id = p_league and not (m.user_id = any (p_order))) then
    return 'changed';
  end if;
  update public.arena_league_managers set draft_slot = null where league_id = p_league;
  update public.arena_league_managers m set draft_slot = array_position(p_order, m.user_id) - 1 where m.league_id = p_league;
  update public.arena_leagues set status = 'drafting', draft_started_at = p_at where id = p_league;
  return 'ok';
end;
$$;

revoke all on function public.arena_league_start(uuid, uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.arena_league_start(uuid, uuid, uuid[], timestamptz) to service_role;

-- One pick and the roster slot it fills, together. Returns the slot's id, or
-- null when the draft is not under way or someone made this pick, or took
-- this market, first — in which case neither row is kept.
create or replace function public.arena_league_pick(p_league uuid, p_pick int, p_user uuid, p_market text, p_auto boolean, p_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot uuid;
begin
  perform 1 from public.arena_leagues where id = p_league and status = 'drafting' for share;
  if not found then
    return null;
  end if;
  insert into public.arena_league_picks (league_id, pick, user_id, market, auto, picked_at)
  values (p_league, p_pick, p_user, p_market, p_auto, p_at);
  insert into public.arena_league_slots (league_id, user_id, market, from_round, to_round, via)
  values (p_league, p_user, p_market, 1, null, 'draft')
  returning id into v_slot;
  return v_slot;
exception when unique_violation then
  return null;
end;
$$;

revoke all on function public.arena_league_pick(uuid, int, uuid, text, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.arena_league_pick(uuid, int, uuid, text, boolean, timestamptz) to service_role;
