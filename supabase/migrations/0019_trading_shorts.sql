-- ---------------------------------------------------------------------------
-- Trading automation: short rules.
--
-- A rule now says which side it trades. A short rule runs its strategy on the
-- price chart turned upside down (lib/autotrade/rules.ts `mirrorCandles`)
-- and sells to open, with its take-profit below the entry and its stop above.
--
-- Additive, and safe to run whether or not 0018 already ran: existing rules
-- and positions are longs, which is what the default says.
-- ---------------------------------------------------------------------------

alter table public.trading_rules
  add column if not exists side text not null default 'long';

do $migration$
begin
  if not exists (select 1 from pg_constraint where conname = 'trading_rules_side_check') then
    alter table public.trading_rules
      add constraint trading_rules_side_check check (side in ('long', 'short'));
  end if;
end
$migration$;

-- 0018 allowed only longs. Replaced, not stacked, so a short can be recorded.
alter table public.trading_positions drop constraint if exists trading_positions_side_check;
alter table public.trading_positions
  add constraint trading_positions_side_check check (side in ('long', 'short'));
