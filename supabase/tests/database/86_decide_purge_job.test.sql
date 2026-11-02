-- pgTAP: 05.4 M7 (CMP-F06) -- purge_deleted_decide_rows and the decide-purge-nightly job, migration 20261103000600.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;

insert into public.decide_checks (id, household_id, created_by, kind, name, inputs, deleted_at) values
  ('c8600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Old gone', '{"kind":"buy","itemType":"other"}', now() - interval '31 days'),
  ('c8600000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Recent gone', '{"kind":"buy","itemType":"other"}', now() - interval '5 days'),
  ('c8600000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Live', '{"kind":"buy","itemType":"other"}', null);

select extensions.has_function('public', 'purge_deleted_decide_rows', array['interval'], 'the purge function exists');
select extensions.ok(not has_function_privilege('anon', 'public.purge_deleted_decide_rows(interval)', 'execute'), 'anon cannot execute it');
select extensions.ok(not has_function_privilege('authenticated', 'public.purge_deleted_decide_rows(interval)', 'execute'), 'authenticated cannot execute it');
select extensions.ok(has_function_privilege('service_role', 'public.purge_deleted_decide_rows(interval)', 'execute'), 'service_role can execute it');
select extensions.is((select schedule from cron.job where jobname = 'decide-purge-nightly'), '41 3 * * *', 'the nightly job is scheduled at 03:41 UTC');

select extensions.is((select deleted from public.purge_deleted_decide_rows() where table_name = 'decide_checks'), 1::bigint, 'one check is purged');
select extensions.is((select count(*)::int from public.decide_checks where id = 'c8600000-0000-0000-0000-000000000001'), 0, 'the 31-day-old deleted check is gone');
select extensions.is((select count(*)::int from public.decide_checks where id = 'c8600000-0000-0000-0000-000000000002'), 1, 'the 5-day-old deleted check remains (Undo window)');
select extensions.is((select count(*)::int from public.decide_checks where id = 'c8600000-0000-0000-0000-000000000003'), 1, 'the live check remains');

select * from extensions.finish();
rollback;
