-- pgTAP: 10-12 devices RPCs -- touch/list/revoke over auth.sessions, owner-only. Migration 20261126000400.
begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-0000000012a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a123@test.local', '{}', now(), now()),
  ('10000000-0000-4000-8000-0000000012a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b123@test.local', '{}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('10000000-0000-4000-8000-0000000012c1', '10000000-0000-4000-8000-0000000012a1', now(), now()),
  ('10000000-0000-4000-8000-0000000012c2', '10000000-0000-4000-8000-0000000012a1', now(), now()),
  ('10000000-0000-4000-8000-0000000012c3', '10000000-0000-4000-8000-0000000012a2', now(), now());

-- ---- anon cannot execute
set local role anon;
select throws_ok($$select public.list_my_devices()$$, '42501', null, 'anon cannot list_my_devices');
select throws_ok($$select public.touch_my_device('x','y','z')$$, '42501', null, 'anon cannot touch_my_device');
select throws_ok($$select public.revoke_my_session('10000000-0000-4000-8000-0000000012c2')$$, '42501', null, 'anon cannot revoke_my_session');
reset role;

-- ---- user A on session C1
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000012a1","role":"authenticated","session_id":"10000000-0000-4000-8000-0000000012c1"}';

select lives_ok($$select public.touch_my_device('Pixel 9', 'Android 16', '1.0.0')$$, 'A touches own device');
select is((select model from public.devices where session_id = '10000000-0000-4000-8000-0000000012c1'), 'Pixel 9', 'C1 device row written');
select is((select count(*)::int from public.list_my_devices()), 2, 'list returns A two sessions');
select is((select is_current from public.list_my_devices() where session_id = '10000000-0000-4000-8000-0000000012c1'), true, 'C1 is current');
select is((select model from public.list_my_devices() where session_id = '10000000-0000-4000-8000-0000000012c2'), '', 'C2 has empty model');

select lives_ok($$select public.touch_my_device(repeat('m', 120), 'Android 16', '1.0.0')$$, 'long model accepted');
select is((select char_length(model) from public.devices where session_id = '10000000-0000-4000-8000-0000000012c1'), 80, 'model truncated to 80');

-- forged session: jwt names B session while A is the caller
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000012a1","role":"authenticated","session_id":"10000000-0000-4000-8000-0000000012c3"}';
select throws_ok($$select public.touch_my_device('Forged', 'x', '1')$$, '42501', null, 'touch with a session not owned by caller refused');

-- back to C1: revoke
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000012a1","role":"authenticated","session_id":"10000000-0000-4000-8000-0000000012c1"}';
select is(public.revoke_my_session('10000000-0000-4000-8000-0000000012c3'), false, 'A cannot revoke B session');
select is(public.revoke_my_session('10000000-0000-4000-8000-0000000012c2'), true, 'A revokes own C2');

reset role;
select is((select count(*)::int from auth.sessions where id in ('10000000-0000-4000-8000-0000000012c2', '10000000-0000-4000-8000-0000000012c3')), 1, 'C2 gone, B session C3 remains');

select * from extensions.finish();
rollback;
