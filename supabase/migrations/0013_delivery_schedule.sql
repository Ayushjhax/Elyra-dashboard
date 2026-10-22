-- ---------------------------------------------------------------------------
-- The delivery tick, scheduled by the database.
--
-- Notifications are checked every five minutes. Vercel's Hobby plan only
-- runs a cron once a day — and fails the deploy when one is set more often —
-- so the schedule lives here instead: pg_cron fires every five minutes and
-- pg_net calls the API's delivery route(s) with the shared CRON_SECRET.
-- vercel.json keeps one daily run as a fallback. A duplicate call is
-- harmless: every send is claimed once, through a unique constraint, before
-- it goes out.
--
-- The API URL and the secret are NOT in this file. They live in Supabase
-- Vault, set once by hand (see supabase/SCHEDULER.md):
--
--   select vault.create_secret('https://api.getelyra.xyz', 'elyra_api_url');
--   select vault.create_secret('<the CRON_SECRET set in Vercel>', 'elyra_cron_secret');
--
-- Until both exist the tick does nothing, so applying this file is safe on a
-- database that is not wired to a deployment yet.
--
-- Safe to run more than once.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.elyra_delivery_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  base   text;
  secret text;
  route  text;
begin
  select decrypted_secret into base   from vault.decrypted_secrets where name = 'elyra_api_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'elyra_cron_secret';
  if base is null or secret is null then
    return;
  end if;

  -- One route delivers every channel: Telegram, the app's inbox and push.
  foreach route in array array['/api/notifications/deliver'] loop
    perform net.http_get(
      url := rtrim(base, '/') || route,
      headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
      -- A pass can take minutes; the route's own ceiling is 300s.
      timeout_milliseconds := 300000
    );
  end loop;
end;
$$;

-- Functions in `public` are callable through the REST API. This one is for
-- the scheduler only.
revoke execute on function public.elyra_delivery_tick() from public, anon, authenticated;

-- Scheduling under an existing name replaces that job, so this stays one job.
select cron.schedule('elyra-delivery', '*/5 * * * *', 'select public.elyra_delivery_tick()');
