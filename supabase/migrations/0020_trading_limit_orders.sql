-- ---------------------------------------------------------------------------
-- Trading automation: limit orders, and what paper-trade analysis needs.
--
-- A limit order opens a long or a short when the price reaches a level, with
-- its take-profit and stop-loss attached. A live one rests on Hyperliquid's
-- book (its client order ids are kept here), so it fills whether or not
-- Elyra is open; the five-minute check learns of the fill and records the
-- position. A paper one is filled by that check when a bar trades through
-- the level.
--
-- Positions now record the leverage they were opened at, so the analysis can
-- band by it, and where they came from: a rule or a limit order.
--
-- Same lockdown as the rest of the schema. Additive; safe to run twice.
-- ---------------------------------------------------------------------------

create table if not exists public.trading_orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  mode          text not null check (mode in ('paper', 'live')),
  network       text,
  coin          text not null,
  side          text not null check (side in ('long', 'short')),
  limit_price   numeric not null check (limit_price > 0),
  size_usd      numeric not null check (size_usd >= 12 and size_usd <= 5000),
  leverage      integer not null check (leverage between 1 and 5),
  take_profit   numeric not null check (take_profit > 0),
  stop_loss     numeric not null check (stop_loss > 0),
  status        text not null check (status in ('open', 'filled', 'cancelled', 'failed')),
  entry_cloid   text,
  tp_cloid      text,
  sl_cloid      text,
  position_id   uuid references public.trading_positions(id) on delete set null,
  error         text,
  created_at    timestamptz not null default now(),
  filled_at     timestamptz,
  cancelled_at  timestamptz
);

create index if not exists trading_orders_user_idx on public.trading_orders(user_id, created_at desc);
create index if not exists trading_orders_open_idx on public.trading_orders(status) where status = 'open';

alter table public.trading_orders enable row level security;

alter table public.trading_positions add column if not exists leverage integer;
alter table public.trading_positions add column if not exists origin text not null default 'rule';

do $migration$
begin
  if not exists (select 1 from pg_constraint where conname = 'trading_positions_origin_check') then
    alter table public.trading_positions
      add constraint trading_positions_origin_check check (origin in ('rule', 'order'));
  end if;
end
$migration$;
