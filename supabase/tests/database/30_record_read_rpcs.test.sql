-- pgTAP: REC-08/ACT-02/D-10/D-50 proof for account_balances and
-- transaction_months.
--
-- Proves paid and pending sums are kept separate per (account, currency),
-- a transfer pair's two legs are both included in their own account's sums
-- (D-50 -- nothing here nets or excludes a transfer, that is a later
-- month-total RPC's job), a soft-deleted row is excluded from both RPCs,
-- another household's id returns 0 rows (security invoker over
-- transactions_active's own RLS -- T-02-09-08), and transaction_months
-- orders newest first with counts excluding soft-deleted rows.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A Checking', 'checking', 'USD', 0),
  ('a0000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A Savings', 'checking', 'USD', 0);

-- September: one paid, one pending, on A Checking.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -100, 'USD', '2026-09-05', 'America/Vancouver', 'Groceries', 'paid'),
  ('30000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -50,  'USD', '2026-09-10', 'America/Vancouver', 'Upcoming bill', 'pending');

-- September: a soft-deleted row, excluded from both RPCs. deleted_at is
-- update-only (never insert-granted -- D-30), so insert first, then delete.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -999, 'USD', '2026-09-12', 'America/Vancouver', 'Deleted row', 'paid');
update public.transactions set deleted_at = now() where id = '30000000-0000-0000-0000-000000000003';

-- August: a linked transfer pair, one leg per account (D-50).
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id, name) values
  ('30000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -5000, 'USD', '2026-08-01', 'America/Vancouver', 'd3000000-0000-0000-0000-000000000001', 'Transfer out'),
  ('30000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000002', 5000,  'USD', '2026-08-01', 'America/Vancouver', 'd3000000-0000-0000-0000-000000000001', 'Transfer in');

-- July: one more paid row on A Checking.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('30000000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -20, 'USD', '2026-07-15', 'America/Vancouver', 'Old paid row');

create temp table bal as
  select * from public.account_balances((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'));

select extensions.is(
  (select paid_sum from bal where account_id = 'a0000000-0000-0000-0000-000000000001' and currency = 'USD'),
  '-5120',
  'A Checking paid_sum is -100 + -5000 + -20 = -5120, separate from pending (D-10)'
);
select extensions.is(
  (select pending_sum from bal where account_id = 'a0000000-0000-0000-0000-000000000001' and currency = 'USD'),
  '-50',
  'A Checking pending_sum is -50, kept apart from paid'
);
select extensions.is(
  (select paid_sum from bal where account_id = 'a0000000-0000-0000-0000-000000000002' and currency = 'USD'),
  '5000',
  'A Savings paid_sum includes its own transfer leg (+5000), independent of the other leg (D-50)'
);
select extensions.ok(
  not exists (
    select 1 from public.transactions_active where id = '30000000-0000-0000-0000-000000000003'
  ),
  'the soft-deleted row plays no part in account_balances (excluded from transactions_active)'
);

-- Another household's id returns 0 rows -- transactions_active's own RLS
-- means account_balances can only ever sum what the caller can already see.
select extensions.is(
  (select count(*)::int from public.account_balances((select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'))),
  0,
  'account_balances returns 0 rows for a household the caller does not belong to'
);

create temp table months as
  select * from public.transaction_months((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'));

select extensions.is((select count(*)::int from months), 3, 'transaction_months returns exactly 3 distinct months (soft-deleted row does not add a 4th)');
select extensions.is(
  (select array_agg(month order by month desc) from months),
  array['2026-09', '2026-08', '2026-07'],
  'transaction_months orders newest first'
);
select extensions.is((select row_count from months where month = '2026-09'), 2, '2026-09 counts the paid and pending row, excluding the soft-deleted one');

reset role;

select * from extensions.finish();
rollback;
