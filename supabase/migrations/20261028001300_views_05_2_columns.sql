-- 05.2 fix (found in the 05.2-36 Pixel walkthrough): public.transactions_active is a `select *` view, and Postgres freezes
-- that column list when the view is created. 20261028000400 added income_kind, counts_as and refund_of to
-- public.transactions, but the view was last re-created in 20261016000120, so it did not expose them and every read of
-- TRANSACTION_COLUMNS through the view failed (Home "This month", "Bills due"). Same fix as 20261010000100 and
-- 20261016000120 (RESEARCH Pitfall 1): re-create the view. The three columns were added last, so they append at the end.
-- Definition, security_invoker and grants are exactly those of 20261016000120. Additive: no existing column changes.
-- statement_periods_live lists its columns explicitly and already matches the app, so it is unchanged.
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;
