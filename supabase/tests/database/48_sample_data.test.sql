-- pgTAP: Phase 2.2 plan 15 -- sample figures (REC-23; D-09, D-10, D-11, D-12).
-- seed_sample_data / clear_sample_data / sample_data_exists.
--
-- Needs 20261010000100 (columns), 20261010000300 (series) and 20261010000600.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

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
select extensions.is((select count(*) from public.accounts where is_sample)::int, 3, 'three sample accounts');
select extensions.ok(
  (select count(*) from public.transactions where is_sample and recurring_series_id is null
     and local_date >= date_trunc('month', current_date)::date and local_date < (date_trunc('month', current_date) + interval '1 month')::date) between 18 and 24,
  'about 20 sample lines in the current month');
select extensions.is((select count(*) from public.transactions where is_sample and original_currency <> 'GBP')::int, 1, 'exactly one foreign-currency line');
select extensions.is((select count(*) from public.transactions where is_sample and is_refund)::int, 1, 'exactly one refund line');
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
select extensions.is((select count(*) from public.accounts where is_sample)::int, 3, 'counts unchanged after the refused seed');

-- 4-6. Edit one line, add a real line on a sample account, soft-delete another.
update public.transactions set name = 'My own weekend' where is_sample and name = 'Weekend away';
select extensions.is((select is_sample from public.transactions where name = 'My own weekend'), false, 'editing a sample line clears its flag');

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        (select id from public.accounts where name = 'Everyday account'), -999, 'GBP', current_date, 'UTC', 'Real line');

update public.transactions set deleted_at = now() where is_sample and name = 'Gym';

-- 7. Clear.
select extensions.is(
  (public.clear_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) ->> 'status'),
  'applied', 'clear_sample_data applies');
select extensions.is(
  (select count(*) from public.transactions where name in ('My own weekend', 'Real line'))::int, 2,
  'the edited and the real line survive clear');
select extensions.is((select count(*) from public.transactions where name = 'Gym')::int, 0, 'the soft-deleted sample line is hard-deleted');
select extensions.is(
  (select array_agg(name || ':' || is_sample::text order by name) from public.accounts),
  array['Credit card:false', 'Everyday account:false'],
  'the two used sample accounts became real; the unused Cash account is gone');
select extensions.is(public.sample_data_exists((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')), false, 'sample_data_exists is false after clear');

-- 8. The category used by the edited line is kept as real; an unused one is deleted on a later cycle.
select extensions.is((select is_sample from public.categories where name = 'Weekend trips'), false, 'a sample category still in use becomes real');
select public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date);
select public.clear_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'));
select extensions.is((select count(*) from public.categories where name = 'Weekend trips')::int, 1, 'an unused sample category is deleted');

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
select extensions.is((select original_amount from public.transactions where is_sample and name = 'Salary'), 480000::bigint, 'JPY salary is 3200 x 150 whole yen');

select * from extensions.finish();
rollback;
