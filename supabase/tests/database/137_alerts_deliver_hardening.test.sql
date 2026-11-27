-- pgTAP: 10-review S-1 / S-6 (migration 20261127090200). A stale 'sending' row is never sent a third time, one with
-- tickets is never resent, the 08:00 digest is claimed once per day, and a quiet-hours hold gives its attempt back.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('37000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a137@test.local', '{"full_name":"Ann Test"}', now(), now()),
  ('37000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b137@test.local', '{"full_name":"Bo Test"}', now(), now());

select public.raise_alert('37000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":100,"currency":"USD"}'::jsonb, null, null, 'k137-1');
select public.raise_alert('37000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":200,"currency":"USD"}'::jsonb, null, null, 'k137-2');
select public.raise_alert('37000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":300,"currency":"USD"}'::jsonb, null, null, 'k137-3');
create temp table oid as select dedupe_key as k, id, log_id from public.alert_outbox where dedupe_key like 'k137-%';

-- ------------------------------------------------------------------ S-6: hold gives the attempt back
select extensions.is((select count(*)::int from public.alerts_claim(10) j where j ->> 'id' in (select id::text from oid)), 3, 'claim takes the three due rows');
select extensions.is((select attempts::int from public.alert_outbox where dedupe_key = 'k137-1'), 1, 'claim counts an attempt');
select public.alerts_hold((select id from oid where k = 'k137-1'), now() + interval '1 hour');
select extensions.is((select attempts::int from public.alert_outbox where dedupe_key = 'k137-1'), 0, 'a quiet-hours hold gives the attempt back');
select extensions.is((select status from public.alert_outbox where dedupe_key = 'k137-1'), 'queued', 'and puts the row back in the queue');

-- ------------------------------------------------------------------ S-1a: stale 'sending' rows
-- k137-2 went out (tickets stored) but the run died before finishing; k137-3 has no tickets.
update public.alert_outbox set claimed_at = now() - interval '10 minutes', ticket_ids = array['tk1'], ticket_tokens = array['tokA']
 where dedupe_key = 'k137-2';
update public.alert_outbox set claimed_at = now() - interval '10 minutes' where dedupe_key = 'k137-3';

create temp table c1 as select j from public.alerts_claim(10) j where j ->> 'id' in (select id::text from oid);
select extensions.is((select count(*)::int from c1 where j ->> 'id' = (select id::text from oid where k = 'k137-2')), 0, 'a stale sending row with tickets is not handed out again');
select extensions.is((select status from public.alert_outbox where dedupe_key = 'k137-2'), 'sent', 'it is recorded as sent');
select extensions.is((select delivery from public.alert_log where id = (select log_id from oid where k = 'k137-2')), 'sent', 'and the log says sent');
select extensions.is((select count(*)::int from c1 where j ->> 'id' = (select id::text from oid where k = 'k137-3')), 1, 'a stale sending row without tickets is reclaimed once');
select extensions.is((select reclaims::int from public.alert_outbox where dedupe_key = 'k137-3'), 1, 'the reclaim is counted');

-- The reclaimed run dies too: the row goes stale a second time and is dropped, not sent a third time.
update public.alert_outbox set claimed_at = now() - interval '10 minutes' where dedupe_key = 'k137-3';
create temp table c2 as select j from public.alerts_claim(10) j where j ->> 'id' in (select id::text from oid);
select extensions.is((select count(*)::int from c2 where j ->> 'id' = (select id::text from oid where k = 'k137-3')), 0, 'a row already reclaimed once is not handed out again');
select extensions.is((select status from public.alert_outbox where dedupe_key = 'k137-3'), 'dropped', 'it is dropped');
select extensions.is((select delivery from public.alert_log where id = (select log_id from oid where k = 'k137-3')), 'failed', 'and logged failed');

-- ------------------------------------------------------------------ S-1b: digest claim
insert into public.alert_prefs (user_id, mode, time_zone, last_digest_date) values ('37000000-0000-4000-8000-0000000000a1', 'digest', 'UTC', '2026-11-21');
select extensions.is(public.alerts_digest_claim('37000000-0000-4000-8000-0000000000a1', '2026-11-22'), true, 'the first run takes the day');
select extensions.is(public.alerts_digest_claim('37000000-0000-4000-8000-0000000000a1', '2026-11-22'), false, 'an overlapping run does not');
select public.alerts_digest_release('37000000-0000-4000-8000-0000000000a1', '2026-11-22', '2026-11-21');
select extensions.is((select last_digest_date::text from public.alert_prefs where user_id = '37000000-0000-4000-8000-0000000000a1'), '2026-11-21', 'release puts the previous day back');
select extensions.is(public.alerts_digest_claim('37000000-0000-4000-8000-0000000000b1', '2026-11-22'), true, 'a person with no prefs row can be claimed once');

-- ------------------------------------------------------------------ access
select extensions.is((select bool_or(has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('alerts_claim', 'alerts_hold', 'alerts_digest_claim', 'alerts_digest_release')),
  false, 'authenticated cannot execute the new or replaced RPCs');

select * from extensions.finish();
rollback;
