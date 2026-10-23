-- ---------------------------------------------------------------------------
-- Push receipts, and one delivery route for every channel.
--
-- Expo answers a push with a ticket at once, but whether the phone's push
-- service actually took it — or reported the device gone — arrives later as a
-- receipt. Expo asks for receipts to be read about fifteen minutes on, which
-- is a later delivery run, so the ticket ids wait here in between. A receipt
-- saying DeviceNotRegistered disables the device; any other error is kept on
-- the row for diagnosis.
--
-- The delivery tick now calls /api/notifications/deliver, which sends to every
-- channel — the website's Telegram chat, the app's inbox and push — from one
-- claim per event. /api/telegram/deliver runs the same pass, so calling both
-- would only find every event already claimed.
--
-- Additive, and safe to run more than once.
-- ---------------------------------------------------------------------------

create table if not exists public.push_tickets (
  -- Expo's ticket id, which is also the receipt id.
  id               text primary key,
  device_id        uuid not null references public.push_devices(id) on delete cascade,
  notification_id  uuid references public.notifications(id) on delete set null,
  created_at       timestamptz not null default now(),
  checked_at       timestamptz,
  -- 'ok', or the receipt's error, e.g. 'DeviceNotRegistered'.
  receipt_status   text,
  receipt_message  text
);

create index if not exists push_tickets_unchecked_idx
  on public.push_tickets(created_at)
  where checked_at is null;

alter table public.push_tickets enable row level security;

-- The scheduled tick: one route, every channel. Replaces 0013's definition.
-- Only where pg_net and Vault exist (every Supabase project); a plain
-- Postgres skips this block.
do $migration$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    execute $function$
      create or replace function public.elyra_delivery_tick()
      returns void
      language plpgsql
      security definer
      set search_path = ''
      as $body$
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

        foreach route in array array['/api/notifications/deliver'] loop
          perform net.http_get(
            url := rtrim(base, '/') || route,
            headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
            timeout_milliseconds := 300000
          );
        end loop;
      end;
      $body$;
    $function$;
    execute 'revoke execute on function public.elyra_delivery_tick() from public, anon, authenticated';
  end if;
end;
$migration$;
