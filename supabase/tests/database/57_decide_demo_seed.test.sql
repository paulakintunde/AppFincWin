-- pgTAP: 05-51 (D-19, DCU-11) -- seed_sample_data / clear_sample_data v2 = the demo scenario.
-- Needs 20261016000100 (decide tables) and 20261016000400 (the v2 seed).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(27);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

update public.profiles set home_currency = 'USD' where id = '11111111-1111-1111-1111-111111111111';

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date) ->> 'status'),
  'applied', 'seed applies');

-- 1. Seven months of rows: the current month and six full past months.
select extensions.is(
  (select count(distinct date_trunc('month', local_date)) from public.transactions where is_sample)::int, 7,
  'the current month and 6 past months carry sample rows');
select extensions.is(
  (select count(*) from public.transactions where is_sample and name = 'Rent')::int, 7, 'one Rent line per month');
select extensions.is(
  (select min(local_date) from public.transactions where is_sample),
  (date_trunc('month', current_date) - interval '6 months')::date,
  'the oldest seeded month starts on the 1st (counts as a full month)');

-- 2. The live Salary series and its linked rows.
select extensions.is((select count(*) from public.recurring_series where is_sample and name = 'Salary' and freq = 'monthly' and deleted_at is null)::int, 1, 'one live sample Salary series');
select extensions.is(
  (select count(*) from public.transactions where is_sample and name = 'Salary' and recurring_series_id is not null and occurrence_date = local_date)::int, 7,
  'every Salary row is linked to the series with its occurrence date');

-- 3. Transfers are valid pairs.
select extensions.is(
  (select count(*) from (select transfer_id from public.transactions where is_sample and transfer_id is not null
     group by transfer_id having count(*) = 2 and sum(original_amount) = 0 and count(distinct account_id) = 2) p)::int, 14,
  'fourteen transfer pairs (savings and investments, 7 months), each two legs netting to zero');
select extensions.is((select count(*) from public.accounts where is_sample)::int, 5, 'five sample accounts');

-- 4. Debts: the Student loan and the paid-in-full card record.
select extensions.is((select count(*) from public.debts where is_sample)::int, 2, 'two sample debts rows');
select extensions.is(
  (select balance || ':' || minimum_payment || ':' || apr from public.debts where is_sample and name = 'Student loan'),
  '620000:19000:5.5', 'the Student loan row');
select extensions.ok(
  (select d.paid_in_full and d.min_percent is null and d.min_interest_added is null and d.min_floor is null and d.minimum_payment = 0
     and d.account_id = (select id from public.accounts where is_sample and name = 'Credit card')
   from public.debts d where d.is_sample and d.kind = 'card'),
  'the card-kind row sits on the sample Credit card, paid_in_full, no minimum terms');

-- 5. Settings: investing_floor 0.
select extensions.is((select investing_floor from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 0::bigint, 'investing_floor is 0');
select extensions.is((select seeded from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), true, 'the seeded settings row is marked seeded');
select extensions.throws_ok(
  $update public.decide_settings set seeded = true where user_id = '11111111-1111-1111-1111-111111111111'$,
  '42501', null, 'a client cannot set seeded (no column grant)');

-- 6. Checks.
select extensions.is((select count(*) from public.decide_checks where is_sample and status = 'open')::int, 2, 'two open sample checks');
select extensions.is(
  (select inputs -> 'loan' ->> 'aprText' from public.decide_checks where name = 'Car' and is_sample), '6.9', 'the car APR is the typed text');
select extensions.is(
  (select (inputs -> 'combine') from public.decide_checks where name = 'Sofa' and is_sample), 'false'::jsonb, 'the sofa check does not combine');

-- 7. Clear removes sample checks, links, both debts rows and keeps user-made checks.
insert into public.decide_checks (id, household_id, kind, name, inputs)
values ('c1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'buy', 'Mine', '{}'::jsonb);
insert into public.decide_links (id, household_id, check_id, entity, target_id)
values ('d1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        (select id from public.decide_checks where name = 'Car' and is_sample), 'debts', (select id from public.debts where is_sample and name = 'Student loan'));

select extensions.is(
  (public.clear_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) ->> 'checks')::int, 2, 'clear reports 2 checks');
select extensions.is((select count(*) from public.decide_checks where name in ('Sofa', 'Car'))::int, 0, 'sample checks are gone');
select extensions.is((select count(*) from public.decide_links)::int, 0, 'their links are gone');
select extensions.is((select count(*) from public.debts)::int, 0, 'both sample debts rows are gone (no card row left on the deleted Credit card)');
select extensions.is((select count(*) from public.decide_checks where name = 'Mine')::int, 1, 'the user-made check is kept');

select extensions.is((select count(*) from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111')::int, 0, 'clear removes the still-seeded settings row');

-- 8. A user edit clears the mark: clear then keeps the row, even when the edit re-saves the seeded value.
reset role;
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bob Test"}', now(), now());
update public.profiles set home_currency = 'USD' where id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select extensions.is(
  (public.seed_sample_data((select id from public.households where owner_id = '22222222-2222-2222-2222-222222222222'), current_date) ->> 'status'),
  'applied', 'seed applies for a second user');
select extensions.is((select seeded from public.decide_settings where user_id = '22222222-2222-2222-2222-222222222222'), true, 'the second user row is seeded');
update public.decide_settings set investing_floor = 0 where user_id = '22222222-2222-2222-2222-222222222222';
select extensions.is((select seeded from public.decide_settings where user_id = '22222222-2222-2222-2222-222222222222'), false, 'a client edit clears seeded');
select public.clear_sample_data((select id from public.households where owner_id = '22222222-2222-2222-2222-222222222222'));
select extensions.is((select count(*) from public.decide_settings where user_id = '22222222-2222-2222-2222-222222222222')::int, 1, 'clear keeps an edited settings row');

select * from extensions.finish();
rollback;
