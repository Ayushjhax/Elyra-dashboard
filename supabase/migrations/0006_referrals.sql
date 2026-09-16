-- ---------------------------------------------------------------------------
-- Referrals, points and activation pools.
--
-- Three new tables plus one column on `profiles`. Elyra had no points system,
-- no referral system and no invite codes before this, so nothing here is
-- replacing an existing mechanism.
--
-- The design rule running through all of it: EVERY reward is a row, and every
-- row carries the key that makes issuing it twice impossible. A referral
-- programme is paid out in something people want, so "we retried the webhook
-- and paid them again" has to be structurally unavailable rather than merely
-- unlikely.
--
-- Same lockdown as the rest of the schema. Authentication is Privy, so
-- auth.uid() is null and a policy keyed on it matches nothing; RLS on with no
-- policies is a default deny for every role except the service role, and row
-- scoping is the caller's job in the query.
--
-- Safe to run twice.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The code lives on the profile
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists referral_code text;

-- Unique where present. A partial index rather than a plain unique constraint
-- so existing rows without a code do not all collide on null.
create unique index if not exists profiles_referral_code_idx
  on public.profiles (referral_code)
  where referral_code is not null;

-- ---------------------------------------------------------------------------
-- 2. Points ledger — append-only
--
-- The balance is a SUM over this table, never a column someone increments.
-- A mutable total can drift from its own history and there is then no way to
-- tell which of the two is wrong; a ledger cannot, because the history is the
-- balance.
-- ---------------------------------------------------------------------------

create table if not exists public.points_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,

  event_type text not null check (event_type in (
               'REFERRAL_ACTIVATED','REFERRAL_POOL_BONUS')),

  -- Signed, so a future correction is a negative row rather than a delete.
  -- The audit trail has to stay append-only to be worth having.
  points     int not null,

  -- THE idempotency key. 'referral_activation:{referredUserId}' and
  -- 'referral_pool:{referrerUserId}:{poolNumber}'. Unique across the table,
  -- so a replayed webhook or a double-clicked retry inserts nothing and the
  -- caller learns it was already paid.
  source_id  text not null,

  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists points_ledger_source_idx
  on public.points_ledger (source_id);

create index if not exists points_ledger_user_idx
  on public.points_ledger (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Referrals
--
-- One row per referred account, created when attribution binds at sign-up.
-- ---------------------------------------------------------------------------

create table if not exists public.referrals (
  id                uuid primary key default gen_random_uuid(),

  referrer_user_id  uuid not null references public.profiles(id) on delete cascade,
  -- The unique constraint below is the "0 or 1 referrer per user" rule, held
  -- by the database rather than by whichever code path happens to run first.
  -- Two concurrent sign-up requests cannot both win.
  referred_user_id  uuid not null unique references public.profiles(id) on delete cascade,

  -- The code as it was actually used, kept even if the referrer's code is
  -- ever changed by support — the attribution should still say what happened.
  referral_code     text not null,

  status            text not null default 'pending'
                      check (status in ('pending','activated','not_eligible')),

  attributed_at     timestamptz not null default now(),
  signed_up_at      timestamptz not null default now(),
  activated_at      timestamptz,
  rewarded_at       timestamptz,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Self-referral, refused by the database as well as by the application.
  -- Application checks are correct and also skippable; this one is not.
  constraint referrals_no_self check (referrer_user_id <> referred_user_id)
);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_user_id, created_at desc);

create index if not exists referrals_status_idx
  on public.referrals (referrer_user_id, status);

-- ---------------------------------------------------------------------------
-- 4. Activation pools
--
-- An explicit row per completed pool rather than deriving completion from a
-- count. Deriving would work until the target is ever changed, at which point
-- every historical pool silently re-computes against the new number and the
-- bonus history stops matching what was actually paid. The row records the
-- target that applied when it completed.
-- ---------------------------------------------------------------------------

create table if not exists public.referral_pools (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,

  -- 1, 2, 3 … Unique per user, which is what stops one pool paying twice.
  pool_number     int not null check (pool_number > 0),

  -- The target in force when this pool completed, not today's.
  target          int not null check (target > 0),

  bonus_points    int not null default 0,
  -- The ledger row that paid it, so a bonus can always be traced to money.
  bonus_ledger_id uuid references public.points_ledger(id) on delete set null,

  completed_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create unique index if not exists referral_pools_user_number_idx
  on public.referral_pools (user_id, pool_number);

create index if not exists referral_pools_user_idx
  on public.referral_pools (user_id, completed_at desc);

-- ---------------------------------------------------------------------------
-- Lockdown
-- ---------------------------------------------------------------------------

alter table public.points_ledger   enable row level security;
alter table public.referrals       enable row level security;
alter table public.referral_pools  enable row level security;

revoke all on public.points_ledger  from anon, authenticated;
revoke all on public.referrals      from anon, authenticated;
revoke all on public.referral_pools from anon, authenticated;
