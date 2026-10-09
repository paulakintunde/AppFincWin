-- pgTAP: Phase 2.2 account_pending_split, account_paid_before and the atomic
-- change_home_currency (D-22, D-25, D-26, Confirmed Decision 11).
--
-- Expected cap values, from fixture rates EUR->GBP 0.85, EUR->USD 1.10:
--   convert_minor(50000 GBP-minor, 0.85, 2, 1.10, 2) = 64706 USD-minor
--   rounded half-up to a whole unit: 647 USD -> 64700
--   convert_minor(10, ...) = 13 -> 0 whole units -> clamped to 10^2 = 100

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, current_date, 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, current_date, 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

update public.profiles set home_currency = 'GBP'
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');

insert into public.categories (id, owner_id, name, color_key, monthly_cap) values
  ('c1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Big cap', 'green', 50000),
  ('c1000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Tiny cap', 'blue', 10),
  ('c1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Sample cap', 'teal', 50000),
  ('c2000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Other user cap', 'green', 50000);
update public.categories set is_sample = true where id = 'c1000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A Checking', 'checking', 'GBP', 0);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', 2500, 'GBP', '2026-10-20', 'Europe/London', 'P in', 'pending'),
  ('30000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -4000, 'GBP', '2026-10-21', 'Europe/London', 'P out 1', 'pending'),
  ('30000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -500, 'GBP', '2026-12-05', 'Europe/London', 'P out far', 'pending'),
  ('30000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -1000, 'GBP', '2026-10-02', 'Europe/London', 'Paid', 'paid'),
  ('30000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -7777, 'GBP', '2026-10-22', 'Europe/London', 'P deleted', 'pending'),
  ('30000000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -300, 'GBP', '2026-09-30', 'Europe/London', 'Paid before', 'paid'),
  ('30000000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -200, 'GBP', '2026-09-15', 'Europe/London', 'Pending before', 'pending');
update public.transactions set deleted_at = now() where id = '30000000-0000-0000-0000-000000000005';

create temp table split as
  select * from public.account_pending_split((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'));
grant select on split to authenticated;

select extensions.is((select pending_in from split), '2500', 'pending_in sums positive pending moves');
select extensions.is((select pending_out from split), '-4700', 'pending_out sums negative pending moves, deleted row excluded');
select extensions.is((select pending_count from split), 4, 'pending_count counts live pending lines, any horizon');

create temp table pb as
  select * from public.account_paid_before((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '2026-10-01');
grant select on pb to authenticated;
select extensions.is((select paid_sum from pb), '-300', 'paid_before only includes paid rows strictly before the date');
select extensions.is((select count(*)::int from pb), 1, 'paid_before returns one row per account and currency');

-- Second user sees nothing of the first household.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.account_pending_split((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))),
  0, 'another user gets 0 pending-split rows for the household (RLS)');
select extensions.is(
  (select count(*)::int from public.account_paid_before((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '2026-12-01')),
  0, 'another user gets 0 paid-before rows for the household (RLS)');

-- Mismatched from-currency throws 40001 and changes nothing.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.change_home_currency('USD', 'EUR', current_date)$$,
  '40001', null, 'a stale from-currency raises 40001');
select extensions.is((select home_currency from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'GBP', 'profile unchanged after 40001');

-- Missing USD rate with caps present: all-or-nothing.
reset role;
create temp table saved_rates as select * from public.fx_rates where quote = 'USD';
delete from public.fx_rates where quote = 'USD';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.change_home_currency('USD', 'GBP', current_date)$$,
  'P0001', 'rates unavailable', 'a missing rate raises P0001');
select extensions.is(
  (select monthly_cap::text from public.categories where id = 'c1000000-0000-0000-0000-000000000001'),
  '50000', 'cap unchanged when rates are missing');

-- Rates restored: atomic conversion.
reset role;
insert into public.fx_rates select * from saved_rates;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  (select public.change_home_currency('USD', 'GBP', current_date) ->> 'caps_converted'),
  '3', 'applied: 3 caps converted');
select extensions.is(
  (select monthly_cap::text from public.categories where id = 'c1000000-0000-0000-0000-000000000001'),
  '64700', 'cap converted at stored rates and rounded half-up to a whole unit');
select extensions.is(
  (select monthly_cap::text from public.categories where id = 'c1000000-0000-0000-0000-000000000002'),
  '100', 'a cap below one whole unit clamps to exactly one unit');

reset role;
select extensions.ok(
  (select is_sample from public.categories where id = 'c1000000-0000-0000-0000-000000000003')
  and (select home_currency from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'USD'
  and (select monthly_cap from public.categories where id = 'c2000000-0000-0000-0000-000000000001') = 50000,
  'sample flag survives, profile is USD, the other user cap is untouched');

select * from extensions.finish();
rollback;
