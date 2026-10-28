-- pgTAP: Phase 05.2 (DSU-05, DSU-15, D-13) -- recurring_dismissals, income_payer_prompts, decide_answers.
-- Migrations 20261028000800, 20261028000900 and 20261028001000.
--
-- Needs 20261016000100 and 20261028000800 .. 20261028001000.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household as a member; C stays in a household of their own.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- One check for A (household 1) and one for C (household 2), written as the table owner.
insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c6800000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Sofa', '{"kind":"buy"}'),
  ('c6800000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'buy', 'Bike', '{"kind":"buy"}');

-- ---------------------------------------------------------------------
-- As A: recurring_dismissals (tests 1-7).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.recurring_dismissals (id, household_id, payee_key, direction)
    values ('d6800000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'coffee shop|USD|-1', 'out')$$,
  'a member can record a Not regular answer for their household');
select extensions.throws_ok(
  $$insert into public.recurring_dismissals (id, household_id, payee_key, direction)
    values ('d6800000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'coffee shop|USD|-1', 'out')$$,
  '42501', null, 'a dismissal cannot be written into another household');
select extensions.throws_ok(
  $$insert into public.recurring_dismissals (id, household_id, payee_key, direction)
    values ('d6800000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'coffee shop|USD|-1', 'out')$$,
  '23505', null, 'a second live dismissal for the same payee and direction is refused');
select extensions.throws_ok(
  $$insert into public.recurring_dismissals (id, household_id, payee_key, direction)
    values ('d6800000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'rent|USD|-1', 'sideways')$$,
  '23514', null, 'a direction other than in or out is refused');
select extensions.lives_ok(
  $$update public.recurring_dismissals set deleted_at = now() where id = 'd6800000-0000-0000-0000-000000000001'$$,
  'a dismissal can be soft-deleted (Undo)');
select extensions.lives_ok(
  $$insert into public.recurring_dismissals (id, household_id, payee_key, direction)
    values ('d6800000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'coffee shop|USD|-1', 'out')$$,
  'after a soft delete the same payee can be dismissed again');
select extensions.throws_ok(
  $$delete from public.recurring_dismissals where id = 'd6800000-0000-0000-0000-000000000005'$$,
  '42501', null, 'delete is not granted');

-- ---------------------------------------------------------------------
-- As A: income_payer_prompts (tests 8-12).
-- ---------------------------------------------------------------------
select extensions.lives_ok(
  $$insert into public.income_payer_prompts (id, household_id, payer_key, income_kind, counts_as)
    values ('e6800000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'acme payroll', 'salary', 'available')$$,
  'a member can save the once-only new-payer answer');
select extensions.throws_ok(
  $$insert into public.income_payer_prompts (id, household_id, payer_key, income_kind, counts_as)
    values ('e6800000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'acme payroll', 'bonus', 'kept')$$,
  '23505', null, 'one live rule per payer');
select extensions.throws_ok(
  $$insert into public.income_payer_prompts (id, household_id, payer_key, income_kind, counts_as)
    values ('e6800000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), repeat('x', 61), 'salary', 'available')$$,
  '23514', null, 'a payer key over 60 characters is refused');
select extensions.throws_ok(
  $$insert into public.income_payer_prompts (id, household_id, payer_key, income_kind, counts_as)
    values ('e6800000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'other payer', 'salary', 'maybe')$$,
  '23514', null, 'counts_as other than available or kept is refused');
select extensions.is(
  (select version from public.recurring_dismissals where id = 'd6800000-0000-0000-0000-000000000001'),
  2, 'the version bumps on update');

-- ---------------------------------------------------------------------
-- As A: decide_answers (tests 13-23).
-- ---------------------------------------------------------------------
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, bool_value, on_date)
    values ('f6800000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'pay_arrival', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa:2026-10-01', true, '2026-10-01')$$,
  'a pay arrival answer with its key is accepted');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, bool_value, on_date)
    values ('f6800000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'pay_arrival', 'not-a-key', true, '2026-10-01')$$,
  '23514', null, 'a pay arrival with a malformed key is refused');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('f6800000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'expected_income', '2026-11', 450000, '2026-11-01')$$,
  'an expected income answer for a month is accepted');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('f6800000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'expected_income', '2026-12', -1, '2026-12-01')$$,
  '23514', null, 'a negative expected income is refused');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, check_id)
    values ('f6800000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'held_bridge', 'c6800000-0000-0000-0000-000000000001', 120000, 'c6800000-0000-0000-0000-000000000001')$$,
  'a held-back bridge for a check is accepted');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, check_id)
    values ('f6800000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'held_bridge', 'something-else', 1, 'c6800000-0000-0000-0000-000000000001')$$,
  '23514', null, 'a bridge whose key is not its check id is refused');
select extensions.lives_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, bool_value, check_id)
    values ('f6800000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'volatile_cover', 'c6800000-0000-0000-0000-000000000001', true, 'c6800000-0000-0000-0000-000000000001')$$,
  'a can-you-cover-low-months answer for a check is accepted');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, on_date)
    values ('f6800000-0000-0000-0000-000000000008', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'expected_income', '2026-11', 1, '2026-11-01')$$,
  '23505', null, 'one live answer per person, kind and key');
select extensions.throws_ok(
  $$insert into public.decide_answers (id, household_id, kind, key, amount, check_id)
    values ('f6800000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'held_bridge', 'c6800000-0000-0000-0000-000000000002', 1, 'c6800000-0000-0000-0000-000000000002')$$,
  '42501', null, 'an answer cannot point at a check outside its household');
select extensions.lives_ok(
  $$update public.decide_answers set amount = 99000 where id = 'f6800000-0000-0000-0000-000000000005'$$,
  'an answer amount can be updated');
select extensions.is(
  (select count(*)::int from public.decide_answers), 4, 'A sees their own four answers');

-- ---------------------------------------------------------------------
-- As B (same household) and C (another household): isolation (tests 24-28).
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.decide_answers), 0, 'a household member cannot read another member''s answers');
select extensions.ok(
  (select count(*) from public.recurring_dismissals where household_id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) >= 1,
  'a household member can read the household''s dismissals');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select (select count(*) from public.decide_answers) + (select count(*) from public.recurring_dismissals)
        + (select count(*) from public.income_payer_prompts))::int,
  0, 'another household sees none of the rows');
select extensions.throws_ok(
  $$insert into public.income_payer_prompts (id, household_id, payer_key, income_kind, counts_as)
    values ('e6800000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'intruder', 'salary', 'available')$$,
  '42501', null, 'another household cannot write a payer rule into this one');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select count(*) from public.decide_answers$$,
  '42501', null, 'anon has no access to decide_answers');
select extensions.throws_ok(
  $$select count(*) from public.recurring_dismissals$$,
  '42501', null, 'anon has no access to recurring_dismissals');

-- ---------------------------------------------------------------------
-- As the table owner: the check cascade (test 30).
-- ---------------------------------------------------------------------
reset role;
delete from public.decide_checks where id = 'c6800000-0000-0000-0000-000000000001';
select extensions.is(
  (select string_agg(kind, ',' order by kind) from public.decide_answers),
  'expected_income,pay_arrival', 'deleting a check removes its bridge and cover answers and keeps the rest');

select * from extensions.finish();
rollback;
