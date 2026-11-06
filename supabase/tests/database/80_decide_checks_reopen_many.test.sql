-- pgTAP: 05.3-98 (UAT gap 21, D-19): many live copies per check; migration 20261101000100.
-- "Check again" and "Check another price" each make a new row with reopened_from set; none is refused.
--
-- Needs 20261016000100 and 20261101000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('c8000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Source');

select extensions.ok(
  not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'decide_checks_reopened_once'),
  'the one-live-copy unique index is gone');
select extensions.ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'decide_checks_reopened_from_idx'),
  'decide_checks_reopened_from_idx remains for lookups');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.decide_checks (id, household_id, kind, name, reopened_from)
    values ('c8000000-0000-0000-0000-000000000011', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'buy', 'Copy 1', 'c8000000-0000-0000-0000-000000000001')$$, 'first copy lands');
select extensions.lives_ok(
  $$insert into public.decide_checks (id, household_id, kind, name, reopened_from)
    values ('c8000000-0000-0000-0000-000000000012', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'buy', 'Copy 2', 'c8000000-0000-0000-0000-000000000001')$$, 'second live copy lands');
select extensions.lives_ok(
  $$insert into public.decide_checks (id, household_id, kind, name, reopened_from)
    values ('c8000000-0000-0000-0000-000000000013', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'buy', 'Copy 3', 'c8000000-0000-0000-0000-000000000001')$$, 'third live copy lands');

-- B has no access to A's household.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.decide_checks (id, household_id, kind, name, reopened_from)
    values ('c8000000-0000-0000-0000-000000000021', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'buy', 'Intruder', 'c8000000-0000-0000-0000-000000000001')$$,
  '42501', null, 'another user cannot insert a copy into A''s household');

-- Hard delete of the source nulls all copies.
select set_config('request.jwt.claims', '', true);
reset role;
-- reopened_from stays locked after insert.
update public.decide_checks set reopened_from = 'c8000000-0000-0000-0000-000000000011' where id = 'c8000000-0000-0000-0000-000000000013';
select extensions.is((select reopened_from from public.decide_checks where id = 'c8000000-0000-0000-0000-000000000013'),
  'c8000000-0000-0000-0000-000000000001'::uuid, 'reopened_from is put back on update (guard_decide_check)');

delete from public.decide_checks where id = 'c8000000-0000-0000-0000-000000000001';
select extensions.is((select count(*)::int from public.decide_checks
  where id in ('c8000000-0000-0000-0000-000000000011','c8000000-0000-0000-0000-000000000012','c8000000-0000-0000-0000-000000000013') and reopened_from is null),
  3, 'deleting the source sets reopened_from to NULL on all three copies');

select * from extensions.finish();
rollback;
