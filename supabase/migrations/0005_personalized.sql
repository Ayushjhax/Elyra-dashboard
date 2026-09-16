-- ---------------------------------------------------------------------------
-- Personalized — durable memory and its own conversation store.
--
-- Two tables, kept apart on purpose.
--
-- `personalized_memories` holds STANDING INSTRUCTIONS: "never let one asset
-- exceed 25%". These outlive any conversation and are re-read on every turn.
-- Conflating them with chat history is why assistants forget a limit stated
-- four sessions ago — the limit scrolls out of the context window along with
-- the small talk around it.
--
-- `personalized_conversations` / `personalized_messages` hold what was said.
-- Separate from the existing `conversations` / `messages` pair, which belong
-- to the agent surface shared with Telegram: that table's `surface` check
-- constraint admits only 'web' and 'telegram', and widening it would couple
-- two products that have different retention, different context assembly and
-- different failure modes.
--
-- Same lockdown as the rest of the schema: authentication is Privy, so
-- auth.uid() is null and a policy keyed on it matches nothing. RLS on with no
-- policies is a default deny for every role except the service role, and row
-- scoping is the caller's job in the query.
--
-- Safe to run against a database that already has these.
-- ---------------------------------------------------------------------------

create table if not exists public.personalized_memories (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,

  -- What kind of standing instruction this is.
  type         text not null check (type in (
                 'concentration_limit','stablecoin_buffer','preferred_venue',
                 'leverage_limit','watch_symbol','note')),

  -- Stable identity within a type, so re-saying a preference updates rather
  -- than accumulates. The symbol for a watch; the type itself for singletons.
  key          text not null,

  value        jsonb not null,

  -- 1 for anything the user said outright. Lower only for inferred memories,
  -- which must never be written from a single observation.
  confidence   numeric(4,3) not null default 1 check (confidence between 0 and 1),
  source       text not null default 'explicit' check (source in ('explicit','inferred')),

  -- Already written for display, so the rail never has to re-derive prose
  -- from a jsonb value.
  label        text not null,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  confirmed_at timestamptz
);

-- One memory per (user, type, key): saying "max 25%" twice updates the row.
create unique index if not exists personalized_memories_key_idx
  on public.personalized_memories (user_id, type, key);

create index if not exists personalized_memories_user_idx
  on public.personalized_memories (user_id, updated_at desc);

-- ---------------------------------------------------------------------------

create table if not exists public.personalized_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null default 'New conversation',
  -- A rolling summary of everything older than the recent window, so a long
  -- conversation does not have to be replayed in full on every turn.
  summary    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists personalized_conversations_user_idx
  on public.personalized_conversations (user_id, updated_at desc);

create table if not exists public.personalized_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
                    references public.personalized_conversations(id) on delete cascade,
  -- Denormalised so every read can filter by user without a join. The join
  -- would be correct; this makes a missing filter impossible to write.
  user_id         uuid not null references public.profiles(id) on delete cascade,

  role            text not null check (role in ('user','assistant')),
  content         text not null,

  -- The validated PersonalizedAnswer for an assistant turn: insights,
  -- metrics, suggested prompts. Null for a user turn.
  structured      jsonb,

  -- Which provider produced it and what it cost, for the run log. Never
  -- contains reasoning, only metadata.
  provider        text,
  model           text,
  latency_ms      int,
  input_tokens    int,
  output_tokens   int,

  created_at      timestamptz not null default now()
);

create index if not exists personalized_messages_conversation_idx
  on public.personalized_messages (conversation_id, created_at);

create index if not exists personalized_messages_user_idx
  on public.personalized_messages (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Lockdown
-- ---------------------------------------------------------------------------

alter table public.personalized_memories      enable row level security;
alter table public.personalized_conversations enable row level security;
alter table public.personalized_messages      enable row level security;

revoke all on public.personalized_memories      from anon, authenticated;
revoke all on public.personalized_conversations from anon, authenticated;
revoke all on public.personalized_messages      from anon, authenticated;
