-- Inbox reachability is independent of push permission and token registration.
create table if not exists public.app_notification_accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.app_notification_accounts enable row level security;
-- Only authenticated API routes using the service role access this table.
insert into public.app_notification_accounts (user_id)
select distinct user_id from public.push_devices on conflict (user_id) do nothing;
