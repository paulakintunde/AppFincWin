-- pgTAP: D-01/D-16/D-30/D-37 proof for the Record extension columns on
-- transactions, the category guard, the soft-delete-filtering
-- transactions_active view, and the accounts updated_by stamp.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'JPY', 180.7, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Captured as postgres (bypasses categories' owner-only RLS) so A's own
-- session can reference B's category id below without being able to select
-- B's row directly -- exactly what guard_transaction_category must still
-- catch.
create temp table cat as select owner_id, builtin_key, id from public.categories;
grant select on cat to authenticated;

-- Impersonate A: create an account, and an ordinary transaction with no
-- Record fields set.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0)$$,
  'A can insert an account'
);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -1234, 'USD', '2026-09-22', 'America/Vancouver');

-- 1. Status defaults to 'paid' when not specified.
select extensions.is(
  (select status from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  'paid',
  'a transaction inserted with no status gets ''paid'' by default (D-01)'
);

-- 2. A full Record-shaped insert against A's own category succeeds.
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status, payment_type, category_id)
    values ('b2111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-09-23', 'America/Vancouver',
      'Rent', 'pending', 'direct_debit',
      (select id from cat where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Housing'))$$,
  'A inserts a pending, named, categorised transaction against A''s own category'
);

-- 3. payment_type is constrained to the D-37 list.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, payment_type)
    values ('b3111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver', 'cheque')$$,
  '23514', null,
  'payment_type ''cheque'' violates the D-37 check list'
);

-- 4. name is capped at 200 characters.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
    values ('b4111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver', repeat('x', 201))$$,
  '23514', null,
  'a 201-character name violates the length check'
);

-- 5. A cannot reference a category B owns (guard_transaction_category).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, category_id)
    values ('b5111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver',
      (select id from cat where owner_id = '22222222-2222-2222-2222-222222222222' and builtin_key = 'Housing'))$$,
  '23514', null,
  'A cannot reference B''s category (guard_transaction_category)'
);

-- 6. A member soft-deletes their own row: succeeds, bumps version, stamps
-- updated_by.
select extensions.lives_ok(
  $$update public.transactions set deleted_at = now() where id = 'b2111111-1111-1111-1111-111111111111'$$,
  'A can soft-delete their own transaction'
);
select extensions.is(
  (select version from public.transactions where id = 'b2111111-1111-1111-1111-111111111111')::int,
  2,
  'soft-deleting bumps version to 2'
);
select extensions.is(
  (select updated_by from public.transactions where id = 'b2111111-1111-1111-1111-111111111111'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'soft-deleting stamps updated_by as A'
);

-- 7. The soft-deleted row is absent from transactions_active but still
-- present in the base table (undo/version logic reads the table directly).
select extensions.is(
  (select count(*) from public.transactions_active where id = 'b2111111-1111-1111-1111-111111111111')::int,
  0,
  'the soft-deleted row is absent from transactions_active'
);
select extensions.is(
  (select count(*) from public.transactions where id = 'b2111111-1111-1111-1111-111111111111')::int,
  1,
  'the soft-deleted row is still present in the base transactions table'
);

reset role;

-- 8. B sees none of A's rows through transactions_active (household RLS,
-- unchanged by this migration, still holds through the new view).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.transactions_active)::int,
  0,
  'B sees 0 rows through transactions_active (RLS isolation)'
);
reset role;

-- 9. anon cannot select transactions_active at all.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.transactions_active$$,
  '42501', null,
  'anon cannot select transactions_active'
);
reset role;

-- 10/11. Server-only columns are excluded from the client grants.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.throws_ok(
  $$update public.transactions set import_batch_id = gen_random_uuid() where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update import_batch_id (server-only, D-16)'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, recurring_series_id)
    values ('b6111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver', gen_random_uuid())$$,
  '42501', null,
  'A cannot insert naming recurring_series_id (server-only)'
);

reset role;

-- 12. The trigram search index exists.
select extensions.has_index(
  'public', 'transactions', 'transactions_name_trgm_idx',
  'transactions_name_trgm_idx exists (ACT-03)'
);

-- 13. Renaming an account stamps accounts.updated_by.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.accounts set name = 'Main Wallet' where id = 'a1111111-1111-1111-1111-111111111111';
select extensions.is(
  (select updated_by from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'renaming an account stamps accounts.updated_by'
);
-- 14. D-WR-07: transactions_active is a read path only. Supabase's default
-- privileges hand every new relation insert/update/delete for
-- authenticated; none of that may survive on the view, so the write
-- surface never depends on the view keeping security_invoker.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.transactions_active set note = 'via view' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'authenticated cannot update through transactions_active'
);
select extensions.throws_ok(
  $$delete from public.transactions_active where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'authenticated cannot delete through transactions_active'
);
reset role;
select extensions.is(
  (select array_agg(privilege_type::text order by privilege_type)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'transactions_active' and grantee = 'authenticated'),
  array['SELECT'],
  'authenticated holds only SELECT on transactions_active'
);

reset role;

select * from extensions.finish();
rollback;
