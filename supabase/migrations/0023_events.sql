-- ---------------------------------------------------------------------------
-- 0023 — Events: crypto's history and Elyra's AI posts, as a feed.
--
-- Only Elyra's AI posts. People react and save; nobody else posts or
-- comments, so there is nothing to moderate. The feed mixes three sources:
--
--   - event_posts (here): what the AI writes from time to time on the
--     five-minute tick — a new hack as DefiLlama records it, a large move in
--     a major coin, and "on this day" — each written from computed facts and
--     held to their numbers (lib/arena/writer.ts);
--   - DefiLlama's hack list, read live;
--   - a reviewed list of milestones kept in code (lib/events/history.ts).
--
-- A reaction or a save is keyed by the item's key — "post:<uuid>",
-- "hack:<id>" or "milestone:<slug>" — so the same table covers all three.
--
-- RLS on, no policies: the server reads and writes with the service role.
-- ---------------------------------------------------------------------------

create table if not exists public.event_posts (
  id           uuid primary key default gen_random_uuid(),
  -- What the post is about, unique, so a tick never posts the same thing
  -- twice: "hack:<defillama id>", "move:BTC:2026-11-11", "onthisday:2026-11-11".
  post_key     text not null unique,
  kind         text not null check (kind in ('hack', 'move', 'onthisday')),
  -- The feed item it is about, if any ("hack:123", "milestone:the-merge").
  refers_to    text,
  title        text not null check (length(title) between 1 and 160),
  body         text not null check (length(body) between 1 and 1200),
  facts        jsonb not null default '[]'::jsonb,
  model        text not null,
  amount_usd   numeric,
  chains       text[] not null default '{}',
  source_url   text,
  occurred_at  timestamptz not null,
  created_at   timestamptz not null default now()
);

create index if not exists event_posts_created_idx on public.event_posts(created_at desc);

alter table public.event_posts enable row level security;

create table if not exists public.event_marks (
  item_key    text not null check (item_key ~ '^(post|hack|milestone):[A-Za-z0-9._-]{1,80}$'),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  mark        text not null check (mark in ('like', 'save')),
  created_at  timestamptz not null default now(),
  primary key (item_key, user_id, mark)
);

create index if not exists event_marks_user_idx on public.event_marks(user_id, mark, created_at desc);

alter table public.event_marks enable row level security;
