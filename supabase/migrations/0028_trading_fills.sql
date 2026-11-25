-- ---------------------------------------------------------------------------
-- 0028 — How an order filled, partial closes, and exits moved by hand.
--
--   - expected_price: the mid when the entry was sent. Against entry_price,
--     the fill, it says what the order cost in slippage.
--   - original_size: the size the position opened at; `size` is what is
--     still open after partial closes.
--   - partial_closes: every partial close, in order —
--     [{ at, size, price, pnlUsd, reason }].
--   - realised_partial_usd: their result after fees, so far. A close of
--     what remains adds it to `realised_pnl_usd`, which is always the whole
--     position's result.
--
-- Additive: every column has a default or is nullable, and rows from before
-- read as positions that were never partly closed.
-- ---------------------------------------------------------------------------

alter table public.trading_positions
  add column if not exists expected_price numeric,
  add column if not exists original_size numeric,
  add column if not exists partial_closes jsonb not null default '[]'::jsonb,
  add column if not exists realised_partial_usd numeric not null default 0;
