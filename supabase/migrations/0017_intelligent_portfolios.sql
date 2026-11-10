-- ---------------------------------------------------------------------------
-- Intelligent Portfolios: what each landed swap added to a portfolio.
--
-- A portfolio is bought into the person's own wallet, one swap per holding,
-- so the wallet alone cannot say which NVIDIA tokens belong to "AI leaders"
-- and which to "High growth" — two portfolios can hold the same token. This
-- ledger is how a position is attributed: one row per token a proven swap
-- moved, keyed by its signature.
--
-- A row is written only after /api/invest/fills has read the transaction
-- from the chain: it landed, it succeeded, this account's wallet signed it,
-- and the amount is the wallet's actual token balance change in it — never a
-- quote, never a figure the browser sent. A position is the sum of its rows.
--
-- `unique (signature, mint)` is the idempotency boundary: a retried or
-- replayed record of the same swap changes nothing, and one swap cannot be
-- counted toward two portfolios.
--
-- Same lockdown as the rest of the schema: RLS on with no policies, the
-- service-role client the only writer, every query filtered by user_id.
-- Deleting an account cascades from profiles. Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.portfolio_fills (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,

  -- lib/invest/catalog.ts ids. Text, not an enum: the catalog is code.
  portfolio_id  text not null,

  signature     text not null,
  mint          text not null,

  -- The wallet's balance change for this mint in this transaction, in base
  -- units: positive for a buy, negative for a sale. Numeric, because a
  -- nine-decimal token overflows a bigint long before it is a large holding.
  delta_units   numeric not null check (delta_units <> 0),
  decimals      integer not null check (decimals between 0 and 18),

  created_at    timestamptz not null default now(),

  unique (signature, mint)
);

create index if not exists portfolio_fills_user_idx
  on public.portfolio_fills(user_id, portfolio_id);

alter table public.portfolio_fills enable row level security;
