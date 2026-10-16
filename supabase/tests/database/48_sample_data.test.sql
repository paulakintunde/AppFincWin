-- pgTAP: Phase 2.2 plan 15 -- sample figures (REC-23; D-09, D-10, D-11, D-12).
-- seed_sample_data / clear_sample_data / sample_data_exists.
--
-- Needs 20261010000100 (columns), 20261010000300 (series) and 20261016000400 (05-51: v2 seed = the demo scenario).
-- 05-51: the seed is now the demo scenario (five accounts, seven months from one template, a Salary series, no foreign line,
-- no refund, no sample category), so the counts below follow it; 57_decide_demo_seed covers checks and debts.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(21);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

update public.profiles set home_currency = 'GBP' where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set home_currency = 'JPY' where id = '33333333-3333-3333-3333-333333333333';

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(public.sample_data_exists((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')), false, 'no samples before seeding');

-- 1. Seed shape.
select extensions.is(
  (public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date) ->> 'status'),
  'applied', 'seed_sample_data applies');
select extensions.is(public.sample_data_exists((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')), true, 'sample_data_exists is true after seeding');
select extensions.is((select count(*) from public.accounts where is_sample)::int, 5, 'five sample accounts');
select extensions.ok(
  (select count(*) from public.transactions where is_sample and recurring_series_id is null
     and local_date >= date_trunc('month', current_date)::date and local_date < (date_trunc('month', current_date) + interval '1 month')::date) >= 15,
  'the monthly template fills the current month');
select extensions.is((select count(*) from public.transactions where is_sample and original_currency <> 'GBP')::int, 0, 'no foreign-currency line');
select extensions.is((select count(*) from public.recurring_series where is_sample)::int, 1, 'one sample series');
select extensions.ok(
  (select count(*) from public.transactions where is_sample and recurring_series_id is not null) >= 1,
  'the sample series occurrences are flagged is_sample');

-- 2. Stamping ran on every sample line.
select extensions.is(
  (select count(*) from public.transactions where is_sample
     and (created_by is distinct from '11111111-1111-1111-1111-111111111111'
          or not (home_amount is not null or rate_pending)))::int,
  0, 'every sample line has created_by and was stamped or marked pending');

-- 3. Seeding twice is refused.
select extensions.is(
  (public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date) ->> 'status'),
  'already-seeded', 'seeding again is refused while samples exist');
select extensions.is((select count(*) from public.accounts where is_sample)::int, 5, 'counts unchanged after the refused seed');

-- 4-6. Edit one line, add a real line on a sample account, soft-delete another.
update public.transactions set name = 'My own weekend'
 where id = (select id from public.transactions where is_sample and name = 'Dining out' order by local_date limit 1);
select extensions.is((select is_sample from public.transactions where name = 'My own weekend'), false, 'editing a sample line clears its flag');

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        (select id from public.accounts where name = 'Everyday account'), -999, 'GBP', current_date, 'UTC', 'Real line');

update public.transactions set deleted_at = now()
 where id = (select id from public.transactions where is_sample and name = 'Insurance' order by local_date limit 1);

-- 7. Clear.
select extensions.is(
  (public.clear_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) ->> 'status'),
  'applied', 'clear_sample_data applies');
select extensions.is(
  (select count(*) from public.transactions where name in ('My own weekend', 'Real line'))::int, 2,
  'the edited and the real line survive clear');
select extensions.is((select count(*) from public.transactions where name = 'Insurance')::int, 0, 'the soft-deleted and the other sample lines are hard-deleted');
select extensions.is(
  (select array_agg(name || ':' || is_sample::text order by name) from public.accounts),
  array['Everyday account:false'],
  'the one used sample account became real; the unused sample accounts are gone');
select extensions.is(public.sample_data_exists((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')), false, 'sample_data_exists is false after clear');

-- 8. A second cycle leaves nothing behind.
select public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date);
select extensions.is(((public.clear_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))) ->> 'checks')::int, 2, 'clear reports the two sample checks');

-- 9. Isolation: a non-member cannot seed or clear.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date)$$,
  '42501', null, 'a non-member cannot seed');
select extensions.throws_ok(
  $$select public.clear_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))$$,
  '42501', null, 'a non-member cannot clear');

-- 10. Magnitude scaling for a zero-decimal home currency.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.seed_sample_data((select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), current_date);
select extensions.is((select max(original_amount) from public.transactions where is_sample and name = 'Salary'), 660000::bigint, 'JPY salary is 4400 x 150 whole yen');

select * from extensions.finish();
rollback;
