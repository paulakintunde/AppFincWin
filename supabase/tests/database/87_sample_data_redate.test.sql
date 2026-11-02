-- pgTAP: 05.4 M8 (APP-15) -- redate_sample_data_if_stale, migration 20261103000700.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok($$select public.seed_sample_data((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date)$$, 'seeded');
select extensions.is(public.redate_sample_data_if_stale((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date),
  false, 'a current seed is left alone');

-- A user row that must survive: seeded as the table owner (clients write transactions through apply_patches, not direct inserts).
reset role;
insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency, local_date, time_zone, name, status, is_sample)
select 'a8700000-0000-0000-0000-000000000001', a.household_id, a.id, '11111111-1111-1111-1111-111111111111', -500, a.currency, current_date, 'UTC', 'My coffee', 'paid', false
  from public.accounts a
 where a.is_sample and a.kind = 'checking' and a.household_id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')
 limit 1;

-- Age the sample: move every sample transaction two months back (as the table owner).
select set_config('fincwin.system_restamp', 'on', true);
update public.transactions set local_date = (local_date - interval '2 months')::date where is_sample;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(public.redate_sample_data_if_stale((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date),
  true, 'a stale seed is re-dated');
select extensions.ok((select max(local_date) from public.transactions where is_sample and household_id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) >= date_trunc('month', current_date),
  'the sample months are current again');
select extensions.is((select count(*)::int from public.transactions where id = 'a8700000-0000-0000-0000-000000000001'), 1, 'the user''s own row survives');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok($$select public.redate_sample_data_if_stale((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), current_date)$$,
  '42501', null, 'a non-member is refused');

select * from extensions.finish();
rollback;
