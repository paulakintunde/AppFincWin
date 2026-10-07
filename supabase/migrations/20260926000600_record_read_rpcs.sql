-- Record read RPCs: per-account balances and the list of months with data
-- (REC-08, ACT-02, D-10, D-50).
--
-- Both are SECURITY INVOKER, unlike every RPC in the previous migration --
-- they perform no privileged lookup, so the caller's own RLS on
-- transactions_active is the only access control needed, and the sums
-- never leak past household membership (T-02-09-08). Returned as text so a
-- minor-unit sum never round-trips through a JS double (Money is integers
-- everywhere -- PROJECT.md). Both read transactions_active, so a
-- soft-deleted row is excluded automatically and a transfer leg (which
-- carries an ordinary account_id/original_amount/local_date like any other
-- row) is naturally included in whichever account it belongs to (D-50) --
-- nothing here nets the two legs against each other or excludes them; that
-- exclusion is a month-total concern for a later RPC, not this one.
create or replace function public.account_balances(p_household_id uuid)
returns table (account_id uuid, currency text, paid_sum text, pending_sum text)
language sql stable security invoker set search_path = '' as $$
  select t.account_id, t.original_currency,
         coalesce(sum(t.original_amount) filter (where t.status = 'paid'), 0)::text,
         coalesce(sum(t.original_amount) filter (where t.status = 'pending'), 0)::text
  from public.transactions_active t
  where t.household_id = p_household_id
  group by t.account_id, t.original_currency
$$;

-- transaction_months is shaped (month, row_count) rather than a richer
-- projection, so a later archive phase (DAT-01) can add an `archived`
-- column without breaking callers.
create or replace function public.transaction_months(p_household_id uuid)
returns table (month text, row_count integer)
language sql stable security invoker set search_path = '' as $$
  select to_char(t.local_date, 'YYYY-MM'), count(*)::integer
  from public.transactions_active t
  where t.household_id = p_household_id
  group by 1 order by 1 desc
$$;

revoke execute on function public.account_balances(uuid), public.transaction_months(uuid) from public, anon;
grant execute on function public.account_balances(uuid), public.transaction_months(uuid) to authenticated;
