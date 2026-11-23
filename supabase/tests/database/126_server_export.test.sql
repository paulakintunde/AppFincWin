-- pgTAP: 10-17 my_server_export() -- own rows only, cross-household isolation, anon refused.
-- Migration 20261126000450.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('12600000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a126@test.local', '{}', now(), now()),
  ('12600000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b126@test.local', '{}', now(), now());

insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, figures) values
  ('12600000-0000-4000-8000-0000000000a1', 'r1', 's60', 'fits_month', '{}'),
  ('12600000-0000-4000-8000-0000000000a2', 'r1', 's60', 'not_yet', '{}');

-- Each person has their own household of one from signup.
delete from public.household_plans
 where household_id in (select household_id from public.household_members
                         where user_id in ('12600000-0000-4000-8000-0000000000a1', '12600000-0000-4000-8000-0000000000a2'));
insert into public.household_plans (household_id, payer_id, store, plan_key, plan_size, status)
select m.household_id, m.user_id, 'APP_STORE', 'solo', 1, 'active'
  from public.household_members m
 where m.user_id in ('12600000-0000-4000-8000-0000000000a1', '12600000-0000-4000-8000-0000000000a2');

insert into public.plan_events (rc_event_id, type, app_user_id, environment) values
  ('evt-126-a', 'INITIAL_PURCHASE', '12600000-0000-4000-8000-0000000000a1', 'PRODUCTION'),
  ('evt-126-b', 'RENEWAL', '12600000-0000-4000-8000-0000000000a2', 'PRODUCTION');

set local role authenticated;
set local request.jwt.claims = '{"sub":"12600000-0000-4000-8000-0000000000a1","role":"authenticated"}';

select extensions.is((select count(*)::int from public.my_server_export() where table_name = 'decide_shadow_runs'), 1, 'A gets own shadow run');
select extensions.is((select record_json ->> 'code' from public.my_server_export() where table_name = 'decide_shadow_runs'), 'fits_month', 'A shadow run is A''s');
select extensions.is((select count(*)::int from public.my_server_export() where table_name = 'household_plans'), 1, 'A gets own household plan');
select extensions.is((select count(*)::int from public.my_server_export() where table_name = 'plan_events'), 1, 'A gets own plan event');
select extensions.is((select record_json ->> 'kind' from public.my_server_export() where table_name = 'plan_events'), 'INITIAL_PURCHASE', 'A event is A''s');
select extensions.is((select count(*)::int from public.my_server_export() where record_json::text like '%payer_id%' or record_json::text like '%app_user_id%'), 0, 'no id columns leak');

set local request.jwt.claims = '{"sub":"12600000-0000-4000-8000-0000000000a2","role":"authenticated"}';
select extensions.is((select count(*)::int from public.my_server_export() where record_json ->> 'code' = 'fits_month' or record_json ->> 'kind' = 'INITIAL_PURCHASE'), 0, 'B sees none of A''s rows');

reset role;
set local role anon;
select extensions.throws_ok($$select * from public.my_server_export()$$, '42501', null, 'anon cannot execute');

select * from extensions.finish();
rollback;
