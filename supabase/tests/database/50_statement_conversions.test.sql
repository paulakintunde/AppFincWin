-- pgTAP: IMP-05 statement conversions (20261011000300_statement_conversions.sql,
-- CONTEXT D-30 to D-35): insert-only statement figures and fee link, the
-- generated conversion_source, the edit trigger that clears stale figures
-- without a restamp, and the sample-flag guard.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'GBP', 0.86, '2026-09-21', 'frankfurter-v2');

update public.profiles set home_currency = 'USD' where id = '11111111-1111-1111-1111-111111111111';

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- 1-5. Columns and generation.
select extensions.has_column('public', 'transactions_active', 'stmt_orig_amount', 'view exposes stmt_orig_amount');
select extensions.has_column('public', 'transactions_active', 'stmt_orig_currency', 'view exposes stmt_orig_currency');
select extensions.has_column('public', 'transactions_active', 'conversion_source', 'view exposes conversion_source');
select extensions.has_column('public', 'transactions_active', 'fx_fee_of', 'view exposes fx_fee_of');
select extensions.is(
  (select is_generated from information_schema.columns
   where table_schema = 'public' and table_name = 'transactions' and column_name = 'conversion_source'),
  'ALWAYS', 'conversion_source is a generated column'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'GBP card', 'credit', 'GBP', 0),
           ('a2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'USD wallet', 'cash', 'USD', 0)$$,
  'A can insert a GBP and a USD account'
);

-- 6-8. A statement line stores the figures and is sourced 'statement'.
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, stmt_orig_amount, stmt_orig_currency)
    values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -3538, 'GBP', '2026-09-21', 'Europe/London', -4500, 'USD')$$,
  'a statement line with figures is accepted'
);
select extensions.is(
  (select conversion_source from public.transactions_active where id = 'b1111111-1111-1111-1111-111111111111'),
  'statement', 'conversion_source is statement when figures are present'
);
select extensions.is(
  (select original_amount from public.transactions_active where id = 'b1111111-1111-1111-1111-111111111111'),
  -3538::bigint, 'original_amount stays the stored truth'
);

-- 9-11. Shape (23514).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, stmt_orig_amount)
    values ('b2111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-21', 'Europe/London', -120)$$,
  '23514', null, 'an amount without a currency violates the shape check'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, stmt_orig_amount, stmt_orig_currency)
    values ('b3111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-21', 'Europe/London', 120, 'USD')$$,
  '23514', null, 'a positive figure on a negative line violates the shape check'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, stmt_orig_amount, stmt_orig_currency)
    values ('b4111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-21', 'Europe/London', -120, 'GBP')$$,
  '23514', null, 'a statement currency equal to the line currency violates the shape check'
);

-- 12-14. Tamper rules.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, conversion_source)
    values ('b5111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-21', 'Europe/London', 'statement')$$,
  '428C9', null, 'a client insert naming conversion_source is refused (generated column, 428C9 fires before the grant check)'
);
select extensions.throws_ok(
  $$update public.transactions set stmt_orig_amount = -9999 where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'a client update of stmt_orig_amount is refused'
);
select extensions.throws_ok(
  $$update public.transactions set fx_fee_of = 'b1111111-1111-1111-1111-111111111111' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'a client update of fx_fee_of is refused'
);

-- 15-16. conversion_source for non-statement lines.
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b6111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a2222222-2222-2222-2222-222222222222', -700, 'USD', '2026-09-21', 'America/Vancouver'),
      ('b7111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -800, 'GBP', '2026-09-21', 'Europe/London')$$,
  'a home-currency line and a market-stamped foreign line are accepted'
);
select extensions.is(
  (select conversion_source from public.transactions_active where id = 'b6111111-1111-1111-1111-111111111111'),
  null, 'a home-currency line has no conversion_source'
);
select extensions.is(
  (select conversion_source from public.transactions_active where id = 'b7111111-1111-1111-1111-111111111111'),
  'market', 'a market-stamped foreign line is sourced market'
);

-- 17-22. Editing the amount clears the figures with no restamp; a note edit keeps them.
reset role;
create temp table before_stamp as
  select rate, rate_date, rate_source, rate_pending, version
  from public.transactions where id = 'b1111111-1111-1111-1111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$update public.transactions set note = 'lunch' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  'a note edit is accepted'
);
select extensions.is(
  (select stmt_orig_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  -4500::bigint, 'a note edit keeps the statement figures'
);
select extensions.lives_ok(
  $$update public.transactions set original_amount = -3000 where id = 'b1111111-1111-1111-1111-111111111111'$$,
  'an amount edit is accepted'
);
select extensions.is(
  (select stmt_orig_amount is null and stmt_orig_currency is null from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  true, 'an amount edit clears the statement figures'
);
select extensions.isnt(
  (select conversion_source from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  'statement', 'conversion_source is no longer statement after the edit'
);
reset role;
select extensions.is(
  (select row(t.rate, t.rate_date, t.rate_source, t.rate_pending)::text
   from public.transactions t where t.id = 'b1111111-1111-1111-1111-111111111111'),
  (select row(b.rate, b.rate_date, b.rate_source, b.rate_pending)::text from before_stamp b),
  'the edit did not restamp: rate, rate_date, rate_source and rate_pending are unchanged'
);

-- 23-26. Sample guard: soft-delete keeps the flag, a note edit clears it.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, is_sample)
values
  ('d1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a2222222-2222-2222-2222-222222222222', -100, 'USD', '2026-09-21', 'America/Vancouver', true),
  ('d2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a2222222-2222-2222-2222-222222222222', -100, 'USD', '2026-09-21', 'America/Vancouver', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok(
  $$update public.transactions set deleted_at = now() where id = 'd1111111-1111-1111-1111-111111111111'$$,
  'a sample line can be soft-deleted'
);
select extensions.lives_ok(
  $$update public.transactions set note = 'edited' where id = 'd2222222-2222-2222-2222-222222222222'$$,
  'a sample line can be edited'
);
reset role;
select extensions.is(
  (select is_sample from public.transactions where id = 'd1111111-1111-1111-1111-111111111111'),
  true, 'soft-deleting a sample line keeps is_sample (generated column ignored)'
);
select extensions.is(
  (select is_sample from public.transactions where id = 'd2222222-2222-2222-2222-222222222222'),
  false, 'editing a sample line still clears is_sample'
);

-- 27-31. Fee link.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, fx_fee_of)
    values ('e1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -90, 'GBP', '2026-09-21', 'Europe/London', 'b1111111-1111-1111-1111-111111111111')$$,
  'a fee line can link to its purchase'
);
select extensions.is(
  (select fx_fee_of from public.transactions_active where id = 'e1111111-1111-1111-1111-111111111111'),
  'b1111111-1111-1111-1111-111111111111'::uuid, 'the fee link is stored'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, fx_fee_of)
    values ('e2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -90, 'GBP', '2026-09-21', 'Europe/London', 'e2222222-2222-2222-2222-222222222222')$$,
  '23514', null, 'a fee linked to itself violates the check'
);

-- 30. apply_patches allow-list.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"b7111111-1111-1111-1111-111111111111","expectedVersion":1,"patch":{"stmt_orig_amount":-5}}]'::jsonb)$$,
  '22023', null, 'apply_patches refuses stmt_orig_amount'
);

-- 31. The generated column is consistent with its definition on every row.
reset role;
select extensions.is(
  (select count(*)::int from public.transactions
   where conversion_source is distinct from
     (case when stmt_orig_amount is not null then 'statement'
           when rate_source in ('frankfurter-v2','open-er-api') then 'market' end)),
  0, 'conversion_source matches its definition on every row'
);

-- 32-33. Trigger function privileges and no write grants.
select extensions.is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'clear_stmt_conversion_on_edit'
     and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0, 'the edit trigger function is not executable by client roles'
);
select extensions.is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'transactions'
     and column_name in ('stmt_orig_amount', 'stmt_orig_currency', 'fx_fee_of', 'conversion_source')
     and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  0, 'no client update grant exists on the new columns'
);
select extensions.is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'transactions'
     and column_name in ('stmt_orig_amount', 'stmt_orig_currency', 'fx_fee_of')
     and grantee = 'authenticated' and privilege_type = 'INSERT'),
  3, 'the three insert-only columns are insertable'
);
select extensions.is(
  (select count(*)::int from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'transactions'
     and column_name = 'conversion_source'
     and grantee = 'authenticated' and privilege_type = 'INSERT'),
  0, 'conversion_source has no insert grant'
);

select * from extensions.finish();
rollback;
