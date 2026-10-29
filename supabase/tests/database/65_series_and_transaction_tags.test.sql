-- pgTAP: 05.2-02 -- recurring_series attributes (counts_as, income_kind, saving_mode, pay_group) and the transaction
-- income tags and refund link (income_kind, counts_as, refund_of). Migrations 20261028000300 and 20261028000400.
--
-- Needs 20261028000300, 20261028000400

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6500000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a6500000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'savings', 'USD', 0),
  ('a6500000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other checking', 'checking', 'USD', 0);

insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, is_refund, transfer_id) values
  ('e6500000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000001', -1000000, 'USD', current_date, 'UTC', false, null),
  ('e6500000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000001', 300000, 'USD', current_date, 'UTC', true, null),
  ('e6500000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000001', 200000, 'USD', current_date, 'UTC', true, null),
  ('e6500000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000001', 500000, 'USD', current_date, 'UTC', false, null),
  ('e6500000-0000-0000-0000-000000000005', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'a6500000-0000-0000-0000-000000000003', -50000, 'USD', current_date, 'UTC', false, null),
  ('e6500000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000001', -20000, 'USD', current_date, 'UTC', false, 'f6500000-0000-0000-0000-000000000001'),
  ('e6500000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000002', 20000, 'USD', current_date, 'UTC', false, 'f6500000-0000-0000-0000-000000000001');

insert into public.recurring_series (id, household_id, created_by, account_id, category_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5e650000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a6500000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Pay', 500000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC');

-- 1. Series attributes (as owner; there is no client grant).
select extensions.lives_ok(
  $$update public.recurring_series set counts_as = 'kept' where id = '5e650000-0000-0000-0000-000000000001'$$,
  'series counts_as accepts kept');
select extensions.throws_ok(
  $$update public.recurring_series set counts_as = 'x' where id = '5e650000-0000-0000-0000-000000000001'$$,
  '23514', null, 'series counts_as refuses an unknown value');
select extensions.lives_ok(
  $$update public.recurring_series set saving_mode = 'fixed' where id = '5e650000-0000-0000-0000-000000000001'$$,
  'series saving_mode accepts fixed');
select extensions.throws_ok(
  $$update public.recurring_series set saving_mode = 'x' where id = '5e650000-0000-0000-0000-000000000001'$$,
  '23514', null, 'series saving_mode refuses an unknown value');
select extensions.lives_ok(
  $$update public.recurring_series set income_kind = 'salary' where id = '5e650000-0000-0000-0000-000000000001'$$,
  'series income_kind accepts salary');
select extensions.throws_ok(
  $$update public.recurring_series set income_kind = 'Bad Kind!' where id = '5e650000-0000-0000-0000-000000000001'$$,
  '23514', null, 'series income_kind refuses a bad pattern');
select extensions.throws_ok(
  $$update public.recurring_series set income_kind = repeat('a', 41) where id = '5e650000-0000-0000-0000-000000000001'$$,
  '23514', null, 'series income_kind refuses 41 characters');
select extensions.lives_ok(
  $$update public.recurring_series set pay_group = gen_random_uuid() where id = '5e650000-0000-0000-0000-000000000001'$$,
  'series pay_group accepts a uuid');

-- 2. As A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.throws_ok(
  $$update public.recurring_series set counts_as = 'kept' where id = '5e650000-0000-0000-0000-000000000001'$$,
  '42501', null, 'series counts_as has no client update grant');
select extensions.lives_ok(
  $$update public.transactions set income_kind = 'salary' where id = 'e6500000-0000-0000-0000-000000000004'$$,
  'a client can set income_kind on its own row');
select extensions.lives_ok(
  $$update public.transactions set counts_as = 'kept' where id = 'e6500000-0000-0000-0000-000000000004'$$,
  'a client can set counts_as on its own row');
select extensions.throws_ok(
  $$update public.transactions set income_kind = 'Bad!' where id = 'e6500000-0000-0000-0000-000000000004'$$,
  '23514', null, 'income_kind refuses a bad pattern');
select extensions.throws_ok(
  $$update public.transactions set counts_as = 'x' where id = 'e6500000-0000-0000-0000-000000000004'$$,
  '23514', null, 'counts_as refuses an unknown value');

select extensions.lives_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000001' where id = 'e6500000-0000-0000-0000-000000000002'$$,
  'a refund links to an own-household purchase');
select extensions.lives_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000001' where id = 'e6500000-0000-0000-0000-000000000003'$$,
  'a second refund links to the same purchase');
select extensions.is(
  (select count(*)::int from public.transactions where refund_of = 'e6500000-0000-0000-0000-000000000001'), 2,
  'two refunds share one purchase');
select extensions.throws_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000005' where id = 'e6500000-0000-0000-0000-000000000003'$$,
  '42501', null, 'a refund cannot point at another household purchase');
select extensions.throws_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000004' where id = 'e6500000-0000-0000-0000-000000000003'$$,
  '23514', null, 'a refund cannot point at a money-in row');
select extensions.throws_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000003' where id = 'e6500000-0000-0000-0000-000000000003'$$,
  '23514', null, 'a refund cannot point at itself');
select extensions.throws_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000006' where id = 'e6500000-0000-0000-0000-000000000003'$$,
  '23514', null, 'a refund cannot point at a transfer leg');
select extensions.throws_ok(
  $$update public.transactions set refund_of = 'e6500000-0000-0000-0000-000000000001' where id = 'e6500000-0000-0000-0000-000000000004'$$,
  '23514', null, 'refund_of on a row not flagged is_refund is refused by the shape check');

-- 3. Deleting the purchase leaves the refunds unlinked (as owner).
reset role;
select set_config('request.jwt.claims', '', true);
delete from public.transactions where id = 'e6500000-0000-0000-0000-000000000001';
select extensions.is(
  (select count(*)::int from public.transactions where id in ('e6500000-0000-0000-0000-000000000002', 'e6500000-0000-0000-0000-000000000003')),
  2, 'deleting the purchase keeps both refunds');
select extensions.is(
  (select count(*)::int from public.transactions where refund_of is not null), 0,
  'deleting the purchase sets refund_of to null');

select * from extensions.finish();
rollback;
