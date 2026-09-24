-- pgTAP: MON-08/MON-09/MON-14/D-16/D-26 proof for accounts and transactions.
--
-- Proves client-generated UUID primary keys with no server default, server-
-- incremented version on every update, household-scoped RLS isolation
-- between two real users, the composite FK that stops a transaction
-- pointing at another household's account, the column-level grants that
-- make every FX stamp column server-only, and the required-date/timezone
-- and non-zero-amount shape checks.

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

-- Each user's household id, captured as postgres before impersonating.
create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- 1. No column default on either client-generated UUID PK (MON-08).
select extensions.is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'accounts' and column_name = 'id'),
  null,
  'accounts.id has no column default (MON-08)'
);
select extensions.is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'transactions' and column_name = 'id'),
  null,
  'transactions.id has no column default (MON-08)'
);

-- Impersonate A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0)$$,
  'A can insert an account into own household'
);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -1234, 'USD', '2026-09-22', 'America/Vancouver')$$,
  'A can insert a transaction against own account'
);

-- 3. Stamp columns are server-only (D-16): naming one in the insert list fails 42501.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, home_amount)
    values ('c1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -100, 'USD', '2026-09-22', 'America/Vancouver', 100)$$,
  '42501', null,
  'A cannot insert home_amount (D-16 grant)'
);

-- 4. Same for update.
select extensions.throws_ok(
  $$update public.transactions set rate = 1.5 where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update rate (D-16 grant)'
);

-- 5. Version bumps on every update (MON-09), twice.
update public.transactions set note = 'x' where id = 'b1111111-1111-1111-1111-111111111111';
select extensions.is(
  (select version from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  2,
  'first update bumps version to 2 (MON-09)'
);
update public.transactions set note = 'x2' where id = 'b1111111-1111-1111-1111-111111111111';
select extensions.is(
  (select version from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  3,
  'second update bumps version to 3'
);

-- 6. Version-conditional update (D-18): a stale expected_version affects 0 rows.
select extensions.results_eq(
  $$with u as (
     update public.transactions set note = 'y' where id = 'b1111111-1111-1111-1111-111111111111' and version = 1 returning 1
   ) select count(*)::int from u$$,
  $$values (0)$$,
  'version-conditional update with a stale version affects 0 rows'
);

-- 7. RLS isolation: B sees none of A's rows.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select extensions.is((select count(*) from public.transactions)::int, 0, 'B sees no transactions (RLS isolation)');
select extensions.is((select count(*) from public.accounts)::int, 0, 'B sees no accounts (RLS isolation)');

-- 8. B cannot write into A's household, and cannot point a B-household
-- transaction at A's account (composite FK).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('d1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -50, 'USD', '2026-09-22', 'America/Vancouver')$$,
  '42501', null,
  'B cannot insert a transaction into household A (RLS with check)'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('e1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'a1111111-1111-1111-1111-111111111111', -50, 'USD', '2026-09-22', 'America/Vancouver')$$,
  '23503', null,
  'B inserting into own household referencing A''s account fails the composite FK'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 9. Required-shape checks.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('f1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -50, 'USD', null, 'America/Vancouver')$$,
  '23502', null,
  'local_date null violates not-null (MON-14)'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('f2111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -50, 'USD', '2026-09-22', null)$$,
  '23502', null,
  'time_zone null violates not-null (MON-14)'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('f3111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 0, 'USD', '2026-09-22', 'America/Vancouver')$$,
  '23514', null,
  'original_amount 0 violates the non-zero check'
);

-- 10. Unknown currency is rejected.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('f4111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -50, 'ZZZ', '2026-09-22', 'America/Vancouver')$$,
  '23514', null,
  'unknown currency ZZZ is rejected (guard_transaction_currency)'
);

reset role;

-- 11. anon has no access at all.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.transactions$$,
  '42501', null,
  'anon cannot read transactions'
);
reset role;

-- 12. Before the stamping trigger (plan 01-05) exists, rate_pending is an
-- honest, defined boolean -- never null.
select extensions.ok(
  (select rate_pending is not null from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  'rate_pending is a defined boolean before the stamping trigger exists (D-17)'
);

-- 13. Index required for the Activity list's month/date ordering exists.
select extensions.has_index(
  'public', 'transactions', 'transactions_household_date_idx',
  'transactions_household_date_idx exists'
);

select * from extensions.finish();
rollback;
