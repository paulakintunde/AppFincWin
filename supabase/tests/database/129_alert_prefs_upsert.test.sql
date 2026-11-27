-- pgTAP: 10-30 alert_prefs saves through the app's upsert shape (device check step 10). Migration 20261127090100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(5);

insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at) values
  ('32000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a129@test.local', now(), now()),
  ('32000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b129@test.local', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"32000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

-- PostgREST upsert: every payload column, user_id included, appears in DO UPDATE SET.
select extensions.lives_ok($$
  insert into public.alert_prefs (user_id, mode, quiet_enabled, quiet_start, quiet_end, time_zone, partner_alerts, version, updated_at)
  values ('32000000-0000-4000-8000-0000000000a1', 'instant', false, '22:00', '07:00', 'America/Vancouver', true, 1, now())
  on conflict (user_id) do update set user_id = excluded.user_id, mode = excluded.mode, quiet_enabled = excluded.quiet_enabled,
    quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, time_zone = excluded.time_zone,
    partner_alerts = excluded.partner_alerts, version = excluded.version, updated_at = excluded.updated_at
$$, 'upsert: the first save (insert path) succeeds as the signed-in user');

select extensions.lives_ok($$
  insert into public.alert_prefs (user_id, mode, quiet_enabled, quiet_start, quiet_end, time_zone, partner_alerts, version, updated_at)
  values ('32000000-0000-4000-8000-0000000000a1', 'instant', true, '23:00', '06:00', 'America/Vancouver', true, 2, now())
  on conflict (user_id) do update set user_id = excluded.user_id, mode = excluded.mode, quiet_enabled = excluded.quiet_enabled,
    quiet_start = excluded.quiet_start, quiet_end = excluded.quiet_end, time_zone = excluded.time_zone,
    partner_alerts = excluded.partner_alerts, version = excluded.version, updated_at = excluded.updated_at
$$, 'upsert: a later save (update path) succeeds');

select extensions.is((select quiet_start::text || '|' || time_zone from public.alert_prefs where user_id = '32000000-0000-4000-8000-0000000000a1'),
  '23:00:00|America/Vancouver', 'upsert: the saved values are the latest ones');

select extensions.throws_ok($$
  update public.alert_prefs set user_id = '32000000-0000-4000-8000-0000000000b1' where user_id = '32000000-0000-4000-8000-0000000000a1'
$$, '42501', null, 'a row cannot be moved to another user');

select extensions.throws_ok($$ update public.alert_prefs set last_digest_date = current_date $$, '42501', null,
  'last_digest_date stays server-only');

select * from extensions.finish();
rollback;
