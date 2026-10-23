-- ---------------------------------------------------------------------------
-- The evidence behind a confirmed prepared action.
--
-- A prepared swap becomes `confirmed` only once the person's wallet signed it
-- and it landed. The signature is that proof, checked against the chain by
-- /api/actions before the row changes — and kept here, so the record says
-- which transaction did it rather than only that something did.
--
-- Null for every other status, and for rows confirmed before this column.
--
-- Safe to run against a database that already has it.
-- ---------------------------------------------------------------------------

alter table public.prepared_actions
  add column if not exists confirmed_signature text;
