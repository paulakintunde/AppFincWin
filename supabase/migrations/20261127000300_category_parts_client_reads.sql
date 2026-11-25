-- Phase 10.1 plan 11 (D-01, SPL-01): the client read and insert path for category parts. Proven by supabase/tests/database/134_category_parts_client_path.test.sql.
-- 20261127000100 added transactions.category_parts and item_split but left two gaps the client needs:
--   1. `select *` froze transactions_active's column list, so the two columns were not selectable through it.
--   2. A new line from a scan is inserted with its parts, so authenticated needs an insert grant on category_parts only.
--      Updates stay RPC-only (set_category_parts); item_split has no client grant at all (set_split_by_item writes it).
-- The tg_category_parts_guard trigger re-validates every inserted part set, so the grant does not widen what a client may store.

create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;
revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

grant insert (category_parts) on public.transactions to authenticated;
