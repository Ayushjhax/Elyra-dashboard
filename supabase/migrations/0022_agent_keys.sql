-- ---------------------------------------------------------------------------
-- 0022 — Agent keys: Elyra's live context for outside AI agents.
--
-- A person creates a key in Connections and gives it to an agent (Claude,
-- ChatGPT, a bot of their own). The agent calls Elyra's MCP endpoint
-- (/api/mcp) or its REST mirror (/api/v1/tools) with that key. Every tool it
-- can reach only reads: market data always, and the person's own portfolio
-- only when the key was created with the `account` scope.
--
-- Only a SHA-256 of the key is stored; the key itself is shown once. A key is
-- revoked, never deleted, so its usage history stays attributable.
--
-- RLS on, no policies: the server reads and writes with the service role.
-- ---------------------------------------------------------------------------

create table if not exists public.agent_keys (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  -- The first characters of the key, for recognising it in a list.
  prefix        text not null,
  key_hash      text not null unique,
  scopes        text[] not null default array['market']::text[]
                  check (scopes <@ array['market', 'account']::text[] and 'market' = any(scopes)),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists agent_keys_user_idx on public.agent_keys(user_id, created_at desc);

alter table public.agent_keys enable row level security;

-- Calls per key per UTC day, for the daily cap.
create table if not exists public.agent_key_usage (
  key_id  uuid not null references public.agent_keys(id) on delete cascade,
  day     date not null,
  calls   int not null default 0,
  primary key (key_id, day)
);

alter table public.agent_key_usage enable row level security;

-- Check and count one call in a single statement, so two concurrent calls at
-- `limit - 1` cannot both pass (the same shape as claim_agent_run).
create or replace function public.claim_agent_key_call(p_key_id uuid, p_limit int)
returns table (allowed boolean, calls int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   date := (now() at time zone 'utc')::date;
  v_calls int;
begin
  insert into public.agent_key_usage as u (key_id, day, calls)
  values (p_key_id, v_day, 1)
  on conflict (key_id, day) do update
     set calls = u.calls + 1
   where u.calls < p_limit
  returning u.calls into v_calls;

  if v_calls is not null then
    return query select true, v_calls;
    return;
  end if;

  select u.calls into v_calls
    from public.agent_key_usage u
   where u.key_id = p_key_id and u.day = v_day;
  return query select false, coalesce(v_calls, p_limit);
end;
$$;

revoke all on function public.claim_agent_key_call(uuid, int) from public, anon, authenticated;
