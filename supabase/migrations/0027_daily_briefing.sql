-- ---------------------------------------------------------------------------
-- 0027 — The Daily Briefing: ten developments a day, and "And more".
--
-- Written once a day by its own route (lib/briefing/run.ts), called by the
-- schedule below just after 00:00 UTC — 08:00 in Beijing. Each item is one
-- development a source published — a newsroom's story, a DAO's vote, a hack
-- DefiLlama recorded — written by the model from that source's facts and
-- held to them, in English and Simplified Chinese, with the source linked.
-- "And more" (movers, stablecoin yields, signals) is computed by code at
-- publication and kept here, so a past day reads as it was.
--
-- `day` is the key, so a day is written once: a run inserts the row as
-- 'writing' to claim it and updates it to 'published'. A claim left behind
-- by a run that died is taken over after ten minutes, at most four times.
--
-- Anyone may read a published briefing; RLS on, no policies — the server
-- reads and writes with the service role.
-- ---------------------------------------------------------------------------

create table if not exists public.daily_briefings (
  day           date primary key,
  status        text not null default 'writing' check (status in ('writing', 'published')),
  attempts      integer not null default 1 check (attempts between 1 and 10),
  claimed_at    timestamptz not null default now(),
  published_at  timestamptz,
  -- [{ kind, ticker, assetId, headline, body, headlineZh, bodyZh, sources, facts, writtenBy }]
  items         jsonb not null default '[]'::jsonb,
  -- { gainers, losers, yields, signals }
  extras        jsonb not null default '{}'::jsonb,
  model         text,
  -- Sources that did not answer, and why a run stopped.
  notes         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  constraint daily_briefings_published_check check (status <> 'published' or published_at is not null)
);

create index if not exists daily_briefings_published_idx
  on public.daily_briefings(day desc) where status = 'published';

alter table public.daily_briefings enable row level security;

-- ---------------------------------------------------------------------------
-- The schedule. The briefing is written by its own route,
-- /api/briefing/run, not by the five-minute tick: the editor and the
-- translator can take minutes, and the tick's 300 seconds belong to trading.
-- Four calls in the first hour after 00:00 UTC — the first writes the day,
-- a later one takes over a run that died (lib/briefing/run.ts), the rest
-- find it published and return at once. Same vault secrets as 0013.
-- ---------------------------------------------------------------------------

create or replace function public.elyra_briefing_tick()
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
    url := rtrim(base, '/') || '/api/briefing/run',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke execute on function public.elyra_briefing_tick() from public, anon, authenticated;

select cron.schedule('elyra-briefing', '2,17,32,47 0 * * *', 'select public.elyra_briefing_tick()');
