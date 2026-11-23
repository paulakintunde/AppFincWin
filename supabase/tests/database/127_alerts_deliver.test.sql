-- pgTAP: 10-23 alert delivery RPCs (ALR-03/04/06). Migration 20261126000700.
-- Seeds as the superuser (no JWT claims). Expo and time zones are proven in the Deno tests; this file proves the state moves.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('31000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a127@test.local', '{"full_name":"Ann Test"}', now(), now()),
  ('31000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b127@test.local', '{"full_name":"Bo Test"}', now(), now());

insert into public.push_tokens (token, user_id, platform)
values ('ExponentPushToken[aaaaaaaaaaaaaaaa]', '31000000-0000-4000-8000-0000000000a1', 'android'),
       ('ExponentPushToken[bbbbbbbbbbbbbbbb]', '31000000-0000-4000-8000-0000000000b1', 'ios');
-- A has no prefs row (defaults apply). B is a digest user in a named zone.
insert into public.alert_prefs (user_id, mode, time_zone) values ('31000000-0000-4000-8000-0000000000b1', 'digest', 'America/Vancouver');

select public.raise_alert('31000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":100,"currency":"USD"}'::jsonb, null, null, 'k127-1');
select public.raise_alert('31000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":200,"currency":"USD"}'::jsonb, null, null, 'k127-2');
select public.raise_alert('31000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":300,"currency":"USD"}'::jsonb, null, null, 'k127-3');
select public.raise_alert('31000000-0000-4000-8000-0000000000b1', 'over_cap', '{"over_minor":400,"currency":"USD"}'::jsonb, null, null, 'k127-4');
select public.raise_alert('31000000-0000-4000-8000-0000000000b1', 'bills_due', '{"bill":"Rent","amount_minor":500,"currency":"USD","lead_days":1}'::jsonb, null, null, 'k127-5');

create temp table oid as select dedupe_key as k, id, log_id from public.alert_outbox where dedupe_key like 'k127-%';
-- k127-3 is not due yet.
update public.alert_outbox set deliver_after = now() + interval '1 hour' where dedupe_key = 'k127-3';
-- k127-4 and k127-5 are B's digest rows.
update public.alert_outbox set status = 'digest' where dedupe_key in ('k127-4', 'k127-5');

-- ------------------------------------------------------------------ claim
create temp table c1 as select j from public.alerts_claim(10) j;
select extensions.is((select count(*)::int from c1), 2, 'claim returns the due queued rows and skips future and digest rows');
select extensions.is((select count(*)::int from public.alert_outbox where status = 'sending' and attempts = 1), 2, 'claimed rows are sending with attempts 1');
select extensions.is((select j -> 'prefs' ->> 'mode' from c1 limit 1), 'instant', 'missing prefs read as instant');
select extensions.is((select j -> 'prefs' ->> 'quiet_start' from c1 limit 1), '22:00:00', 'missing prefs read quiet start 22:00');
select extensions.is((select j -> 'prefs' ->> 'time_zone' from c1 limit 1), 'UTC', 'missing prefs read UTC');
select extensions.is((select jsonb_array_length(j -> 'tokens') from c1 limit 1), 1, 'claim carries the user tokens');

-- A second claim in the same transaction never returns the first rows again.
update public.alert_outbox set deliver_after = now() where dedupe_key = 'k127-3';
create temp table c2 as select j from public.alerts_claim(10) j;
select extensions.is((select count(*)::int from c2), 1, 'second claim returns only the newly due row');
select extensions.is((select count(*)::int from c1 a join c2 b on a.j ->> 'id' = b.j ->> 'id'), 0, 'two claims never return the same row');

-- ------------------------------------------------------------------ hold
select public.alerts_hold((select id from oid where k = 'k127-1'), now() + interval '1 hour');
select extensions.is((select status from public.alert_outbox where dedupe_key = 'k127-1'), 'queued', 'hold puts the row back in the queue');
select extensions.ok((select deliver_after > now() + interval '59 minutes' from public.alert_outbox where dedupe_key = 'k127-1'), 'hold sets deliver_after');
select extensions.is((select held_for_quiet from public.alert_log where id = (select log_id from oid where k = 'k127-1')), true, 'hold marks the log held_for_quiet');

-- ------------------------------------------------------------------ finish
select public.alerts_finish((select id from oid where k = 'k127-2'), 'sent', 'sent', array['t1'], array['ExponentPushToken[aaaaaaaaaaaaaaaa]']);
select extensions.is((select status || ':' || array_to_string(ticket_ids, ',') from public.alert_outbox where dedupe_key = 'k127-2'), 'sent:t1', 'finish sets status and ticket ids');
select extensions.is((select delivery from public.alert_log where id = (select log_id from oid where k = 'k127-2')), 'sent', 'finish writes the log delivery');
select extensions.ok((select delivered_at is not null from public.alert_log where id = (select log_id from oid where k = 'k127-2')), 'finish stamps delivered_at');
select public.alerts_finish((select id from oid where k = 'k127-3'), 'dropped', 'no_device', '{}');
select extensions.is((select delivery from public.alert_log where id = (select log_id from oid where k = 'k127-3')), 'no_device', 'no device is recorded in the log');
select extensions.throws_ok($$ select public.alerts_finish(gen_random_uuid(), 'queued', 'sent', '{}') $$, '22023', 'alerts_finish: bad status queued', 'finish refuses a status outside its set');

-- ------------------------------------------------------------------ receipts
select extensions.is((select count(*)::int from public.alerts_receipts_due()), 0, 'receipts are not due before 15 minutes');
update public.alert_outbox set sent_at = now() - interval '20 minutes' where dedupe_key = 'k127-2';
select extensions.is((select count(*)::int from public.alerts_receipts_due()), 1, 'receipts are due after 15 minutes');
select public.alerts_receipts_done((select id from oid where k = 'k127-2'));
select extensions.is((select count(*)::int from public.alerts_receipts_due()), 0, 'a checked row is not due again');
select public.alerts_drop_token('ExponentPushToken[aaaaaaaaaaaaaaaa]');
select extensions.is((select count(*)::int from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaa]'), 0, 'drop_token deletes the token');

-- ------------------------------------------------------------------ digest
select extensions.is((select (j -> 'counts' ->> 'over_cap') || ',' || (j -> 'counts' ->> 'bills_due') from public.alerts_digest_users() j), '1,1', 'digest users carry counts by kind');
select public.alerts_digest_done('31000000-0000-4000-8000-0000000000b1', '2026-11-22');
select extensions.is((select count(*)::int from public.alert_outbox where status = 'sent' and dedupe_key in ('k127-4', 'k127-5')), 2, 'digest_done marks the digest rows sent');
select extensions.is((select count(*)::int from public.alert_log where delivery = 'digest' and user_id = '31000000-0000-4000-8000-0000000000b1'), 2, 'digest_done writes the log');
select extensions.is((select last_digest_date::text from public.alert_prefs where user_id = '31000000-0000-4000-8000-0000000000b1'), '2026-11-22', 'digest_done sets last_digest_date');

-- ------------------------------------------------------------------ access
select extensions.is((select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('alerts_claim', 'alerts_finish', 'alerts_hold', 'alerts_requeue', 'alerts_digest_users', 'alerts_digest_done', 'alerts_receipts_due', 'alerts_receipts_done', 'alerts_drop_token')),
  false, 'authenticated cannot execute any delivery RPC');

select * from extensions.finish();
rollback;
