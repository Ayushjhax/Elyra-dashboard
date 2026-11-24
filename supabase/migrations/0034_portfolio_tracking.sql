-- 0034 — Portfolio tracking: one close a day for every account, net of flows.
--
-- `portfolio_snapshots` (0004) is written only while someone has Elyra open,
-- so a line drawn from it has holes wherever the person did not look. This
-- table is the daily close, written by the server for every account with a
-- wallet whether or not they visited — what the Portfolio page's equity
-- curve, returns, drawdown and daily PnL calendar are built from.
--
-- Each row also carries the net of the deposits and withdrawals since the
-- previous row (lib/portfolio/flows.ts), measured between the two readings
-- rather than between midnights: the job reads equity a little after 00:00
-- UTC, and money that arrived in between belongs to the interval it moved
-- the equity in. `flows_complete` is false when a chain holding value could
-- not be read far enough back, or a transfer had no price — the page then
-- leaves the day out rather than counting a deposit as a gain.
--
-- Safe to run against a database that already has it.

create table if not exists public.portfolio_daily (
  user_id         uuid           not null references public.profiles(id) on delete cascade,
  -- The UTC day whose close this approximates (the reading is taken just after it).
  day             date           not null,
  recorded_at     timestamptz    not null default now(),
  -- Null when the read was partial — a venue failed — so the figure is not the account's value.
  equity_usd      numeric(20, 2),
  -- Net USD in (positive) or out since the previous row's reading. Null when unknown.
  flow_usd        numeric(20, 2),
  flows_complete  boolean        not null default false,
  -- What could not be read, written for a person.
  notes           text[]         not null default '{}',
  primary key (user_id, day)
);

create index if not exists portfolio_daily_user_day_idx
  on public.portfolio_daily (user_id, day desc);

-- RLS on with no policies: the service role writes and reads, scoped by
-- user_id in every query; no client role can touch it.
alter table public.portfolio_daily enable row level security;
revoke all on public.portfolio_daily from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The schedule. Its own route, /api/portfolio/track, not a step of the
-- five-minute tick: reading every account takes minutes and the tick's 300
-- seconds belong to trading. Every ten minutes from 00:00 to 05:59 UTC, each
-- call records yesterday's close for the next batch of accounts that lack
-- one, and returns at once when none do. Same vault secrets as 0013.
-- ---------------------------------------------------------------------------

create or replace function public.elyra_portfolio_track_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base   text;
  secret text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'elyra_api_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'elyra_cron_secret';
  if base is null or secret is null then
    return;
  end if;
  perform net.http_get(
    url := rtrim(base, '/') || '/api/portfolio/track',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.elyra_portfolio_track_tick() from public, anon, authenticated;

select cron.schedule('elyra-portfolio-track', '*/10 0-5 * * *', 'select public.elyra_portfolio_track_tick()');
