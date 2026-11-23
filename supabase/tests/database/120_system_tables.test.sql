-- pgTAP: 10-02 System tables -- owner-only RLS, grants, push-token RPCs, cascades, alert defaults.
-- Migration 20261126000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a120@test.local', '{}', now(), now()),
  ('10000000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b120@test.local', '{}', now(), now());

insert into auth.sessions (id, user_id, created_at, updated_at) values
  ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000a1', now(), now()),
  ('10000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-0000000000a2', now(), now());

-- Seed server-written rows as the superuser (clients cannot write these).
insert into public.devices (session_id, user_id, model) values
  ('10000000-0000-4000-8000-0000000000c1', '10000000-0000-4000-8000-0000000000a1', 'Pixel 9'),
  ('10000000-0000-4000-8000-0000000000c2', '10000000-0000-4000-8000-0000000000a2', 'iPhone XR');
insert into public.alert_log (user_id, kind) values
  ('10000000-0000-4000-8000-0000000000a1', 'bills_due'),
  ('10000000-0000-4000-8000-0000000000a2', 'over_cap');

-- ---- defaults (superuser, before switching role)
select is(public.alert_setting('10000000-0000-4000-8000-0000000000a1', 'bills_due')::text, '(t,,,1)', 'bills_due default: enabled, lead_days 1');
select is((select enabled from public.alert_setting('10000000-0000-4000-8000-0000000000a1', 'goal_reached')), true, 'goal_reached default: enabled');
select is((select enabled from public.alert_setting('10000000-0000-4000-8000-0000000000a1', 'large_txn')), false, 'large_txn default: disabled');

-- ---- user A
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated","session_id":"10000000-0000-4000-8000-0000000000c1"}';

select lives_ok($$insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency) values ('10000000-0000-4000-8000-0000000000a1', 'large_txn', true, 50000, 'USD')$$, 'A inserts own alert_settings');
select lives_ok($$insert into public.alert_prefs (user_id) values ('10000000-0000-4000-8000-0000000000a1')$$, 'A inserts own alert_prefs');
select lives_ok($$insert into public.archived_months (user_id, month) values ('10000000-0000-4000-8000-0000000000a1', '2026-03')$$, 'A archives a month');
select throws_ok($$insert into public.archived_months (user_id, month) values ('10000000-0000-4000-8000-0000000000a1', '2026-13')$$, '23514', null, 'month 2026-13 refused');
select throws_ok($$insert into public.archived_months (user_id, month) values ('10000000-0000-4000-8000-0000000000a1', '26-03')$$, '23514', null, 'month 26-03 refused');
select throws_ok($$insert into public.alert_settings (user_id, kind, enabled) values ('10000000-0000-4000-8000-0000000000a2', 'over_cap', true)$$, '42501', null, 'A cannot insert alert_settings for B');
select throws_ok($$insert into public.alert_prefs (user_id) values ('10000000-0000-4000-8000-0000000000a2')$$, '42501', null, 'A cannot insert alert_prefs for B');
select throws_ok($$insert into public.archived_months (user_id, month) values ('10000000-0000-4000-8000-0000000000a2', '2026-03')$$, '42501', null, 'A cannot insert archived_months for B');

select results_eq($$select mode, quiet_enabled, quiet_start::text, quiet_end::text, partner_alerts from public.alert_prefs$$,
  $$values ('instant'::text, true, '22:00:00'::text, '07:00:00'::text, true)$$, 'alert_prefs defaults');
select throws_ok($$update public.alert_prefs set last_digest_date = current_date$$, '42501', null, 'A cannot update last_digest_date');
select lives_ok($$update public.alert_prefs set mode = 'digest'$$, 'A updates mode');

select throws_ok($$insert into public.devices (session_id, user_id) values (gen_random_uuid(), '10000000-0000-4000-8000-0000000000a1')$$, '42501', null, 'A cannot insert devices');
select throws_ok($$update public.devices set model = 'x'$$, '42501', null, 'A cannot update devices');
select throws_ok($$delete from public.devices$$, '42501', null, 'A cannot delete devices');
select throws_ok($$select * from public.push_tokens$$, '42501', null, 'A cannot read push_tokens');
select throws_ok($$insert into public.alert_log (user_id, kind) values ('10000000-0000-4000-8000-0000000000a1', 'bills_due')$$, '42501', null, 'A cannot insert alert_log');
select throws_ok($$delete from public.alert_log$$, '42501', null, 'A cannot delete alert_log');

select is((select count(*)::int from public.devices), 1, 'A sees only own device');
select is((select count(*)::int from public.alert_log), 1, 'A sees only own alert_log');

select lives_ok($$select public.register_push_token('ExponentPushToken[shared-phone]', 'android')$$, 'A registers push token');

-- ---- user B
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a2","role":"authenticated","session_id":"10000000-0000-4000-8000-0000000000c2"}';

select is((select count(*)::int from public.alert_settings), 0, 'B sees none of A alert_settings');
select is((select count(*)::int from public.alert_prefs), 0, 'B sees none of A alert_prefs');
select is((select count(*)::int from public.archived_months), 0, 'B sees none of A archived_months');
select is((select count(*)::int from public.devices where session_id = '10000000-0000-4000-8000-0000000000c1'), 0, 'B cannot see A device');
select is((select count(*)::int from public.alert_log where user_id = '10000000-0000-4000-8000-0000000000a1'), 0, 'B cannot see A alert_log');

select lives_ok($$select public.unregister_push_token('ExponentPushToken[shared-phone]')$$, 'B unregister on A token is a no-op');
select lives_ok($$select public.register_push_token('ExponentPushToken[shared-phone]', 'android')$$, 'B registers the same token (moves it)');

reset role;

select is((select user_id::text from public.push_tokens where token = 'ExponentPushToken[shared-phone]'), '10000000-0000-4000-8000-0000000000a2', 'token moved to B');
select is((select session_id::text from public.push_tokens where token = 'ExponentPushToken[shared-phone]'), '10000000-0000-4000-8000-0000000000c2', 'token session is B session');

-- unregister only removes the caller's own token
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-4000-8000-0000000000a1","role":"authenticated","session_id":"10000000-0000-4000-8000-0000000000c1"}';
select public.unregister_push_token('ExponentPushToken[shared-phone]');
reset role;
select is((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[shared-phone]'), 1, 'A cannot remove B token');

-- ---- cascades
insert into public.push_tokens (token, user_id, session_id, platform) values
  ('ExponentPushToken[session-c1]', '10000000-0000-4000-8000-0000000000a1', '10000000-0000-4000-8000-0000000000c1', 'ios');
delete from auth.sessions where id = '10000000-0000-4000-8000-0000000000c1';
select is((select count(*)::int from public.devices where session_id = '10000000-0000-4000-8000-0000000000c1'), 0, 'session delete removes device');
select is((select count(*)::int from public.push_tokens where session_id = '10000000-0000-4000-8000-0000000000c1'), 0, 'session delete removes push token');

delete from auth.users where id = '10000000-0000-4000-8000-0000000000a2';
select is((select count(*)::int from public.devices where user_id = '10000000-0000-4000-8000-0000000000a2')
        + (select count(*)::int from public.push_tokens where user_id = '10000000-0000-4000-8000-0000000000a2')
        + (select count(*)::int from public.alert_log where user_id = '10000000-0000-4000-8000-0000000000a2'), 0, 'user delete removes devices, tokens, log');

delete from auth.users where id = '10000000-0000-4000-8000-0000000000a1';
select is((select count(*)::int from public.alert_settings where user_id = '10000000-0000-4000-8000-0000000000a1')
        + (select count(*)::int from public.alert_prefs where user_id = '10000000-0000-4000-8000-0000000000a1')
        + (select count(*)::int from public.archived_months where user_id = '10000000-0000-4000-8000-0000000000a1')
        + (select count(*)::int from public.alert_log where user_id = '10000000-0000-4000-8000-0000000000a1'), 0, 'user delete removes settings, prefs, archive, log');

select * from extensions.finish();
rollback;
