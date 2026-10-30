-- pgTAP: Phase 05.3 D-28 -- readiness answers (decide_answers kind 'readiness_waiver') are owner-private.
-- The owner inserts, reads and soft-deletes their waivers; another member of the same household reads none and
-- cannot write one for the owner; malformed keys and wrong shapes are refused (23514); the older kinds still save.
-- Migration 20261030000200. Needs 20261028001000 and 20261029000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household as a member.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- A check in A's household, so the "check_id set" case reaches the shape check rather than the household guard.
insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c7700000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Sofa', '{"kind":"buy","itemType":"other"}');

set local role authenticated;

-- ---------------------------------------------------------------------
-- A, the owner of the answers (1-4).
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'paid-by-other:5e700000-0000-0000-0000-000000000001:2026-09-21', '2026-10-30')$$,
  'A saves a "someone else paid it" waiver');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'income-elsewhere', '2026-10-30')$$,
  'A saves a "my money comes from elsewhere" waiver');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'month-complete:2026-09', '2026-10-30')$$,
  'A saves a "month is complete" waiver');
select extensions.is((select count(*)::int from public.decide_answers where kind = 'readiness_waiver'), 3, 'A reads their 3 waivers');

-- ---------------------------------------------------------------------
-- B, another member of the same household (5-8).
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select extensions.is((select count(*)::int from public.decide_answers where kind = 'readiness_waiver'), 0, 'B reads none of A''s waivers');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, created_by, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'readiness_waiver', 'income-elsewhere', '2026-10-30')$$,
  '42501', null, 'B cannot write a waiver that names A (no column grant on created_by)');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'income-elsewhere', '2026-10-30')$$,
  'B saves their own waiver in the shared household');
select extensions.is(
  (select created_by from public.decide_answers where id = 'a7700000-0000-0000-0000-000000000005'),
  '22222222-2222-2222-2222-222222222222'::uuid, 'B''s waiver belongs to B');

-- ---------------------------------------------------------------------
-- Back to A (9-11).
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is((select count(*)::int from public.decide_answers where kind = 'readiness_waiver'), 3, 'A still reads exactly their 3 waivers');
select extensions.lives_ok(
  $$update public.decide_answers set deleted_at = now() where id = 'a7700000-0000-0000-0000-000000000003'$$,
  'A soft-deletes a waiver (Ask again)');
select extensions.is(
  (select count(*)::int from public.decide_answers where kind = 'readiness_waiver' and deleted_at is null), 2,
  'A has 2 live waivers after the soft delete');

-- ---------------------------------------------------------------------
-- Malformed keys and wrong shapes are refused (12-16).
-- ---------------------------------------------------------------------
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000011', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'paid-by-other:bad', '2026-10-30')$$,
  '23514', null, 'a malformed waiver key is refused');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('a7700000-0000-0000-0000-000000000012', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'start-from:2026-08', 100, '2026-10-30')$$,
  '23514', null, 'a waiver with an amount is refused');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000013', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'nothing-to-add:2026-08', null)$$,
  '23514', null, 'a waiver without a date is refused');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date, check_id)
    values ('a7700000-0000-0000-0000-000000000014', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'readiness_waiver', 'always-other:5e700000-0000-0000-0000-000000000001', '2026-10-30', 'c7700000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a waiver tied to a check is refused');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, on_date)
    values ('a7700000-0000-0000-0000-000000000015', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'other', 'income-elsewhere', '2026-10-30')$$,
  '23514', null, 'an unknown kind is refused');

-- ---------------------------------------------------------------------
-- The existing kinds are unchanged (17).
-- ---------------------------------------------------------------------
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('a7700000-0000-0000-0000-000000000021', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'expected_income', '2026-11', 100000, '2026-11-01')$$,
  'an expected-income answer still saves');

select * from extensions.finish();
rollback;
