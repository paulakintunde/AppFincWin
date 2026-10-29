-- pgTAP: Phase 05.2 review WR-04 -- decide_answers live key includes the household.
-- Migration 20261029000100. Needs 20261028001000.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- A moves: A keeps the old household H1 and joins C's household H2.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '11111111-1111-1111-1111-111111111111', 'member', 1);

select extensions.has_index('public', 'decide_answers', 'decide_answers_live_key_household', 'household-keyed live index exists');
select extensions.hasnt_index('public', 'decide_answers', 'decide_answers_live_key', 'old live index is gone');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('a7400000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'expected_income', '2026-11', 100000, '2026-11-01')$$,
  'an expected-income answer saves in the old household');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('a7400000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'expected_income', '2026-11', 120000, '2026-11-01')$$,
  'the same month saves in the new household');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('a7400000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'expected_income', '2026-11', 130000, '2026-11-01')$$,
  '23505', null, 'a second live answer for the same kind and key in one household is refused');
select extensions.lives_ok(
  $$update public.decide_answers set deleted_at = now() where id = 'a7400000-0000-0000-0000-000000000002'$$,
  'the new-household answer can be soft-deleted');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('a7400000-0000-0000-0000-000000000004', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'expected_income', '2026-11', 130000, '2026-11-01')$$,
  'after the soft delete a new live answer saves');

select * from extensions.finish();
rollback;
