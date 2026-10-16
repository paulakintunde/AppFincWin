-- pgTAP: Phase 5 plan 32 -- depth tables (D-27, D-34, D-35, D-36). Needs 20261016000100, 20261016000110.
-- Owner-private RLS for changes and goals, check constraints, RPC-only decision state, link roles and erasure cascade.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(23);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household; C stays alone.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- An account and two transactions in A's household (link targets), inserted as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, created_by)
values
  ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -999, 'USD', current_date, 'UTC', 'Coffee', '11111111-1111-1111-1111-111111111111'),
  ('b1111111-1111-1111-1111-111111111112', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -499, 'USD', current_date, 'UTC', 'Tea', '11111111-1111-1111-1111-111111111111');

select extensions.ok(
  (select count(*) = 2 and bool_and(relrowsecurity) from pg_class
    where oid in ('public.decide_changes'::regclass, 'public.savings_goals'::regclass)),
  'decide_changes and savings_goals exist with RLS enabled');

-- ---------------------------------------------------------------- As A: changes
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.decide_changes (id, household_id, kind, name, monthly_amount, currency, start_month, end_month)
    values ('e1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'income', 'Raise', 25000, 'USD', '2027-01', '2027-12')$$,
  'A inserts a dated change in A''s household');
select extensions.is(
  (select count(*)::int from public.decide_changes where id = 'e1000000-0000-0000-0000-000000000001'),
  1, 'A sees their own change');

select extensions.throws_ok(
  $$insert into public.decide_changes (id, household_id, kind, monthly_amount, currency, start_month)
    values ('e1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'spending', 0, 'USD', '2027-01')$$,
  '23514', null, 'a zero monthly amount is refused');
select extensions.throws_ok(
  $$insert into public.decide_changes (id, household_id, kind, monthly_amount, currency, start_month, end_month)
    values ('e1000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'spending', -100, 'USD', '2027-06', '2027-05')$$,
  '23514', null, 'an end month before the start month is refused');
select extensions.throws_ok(
  $$insert into public.decide_changes (id, household_id, kind, monthly_amount, currency, start_month)
    values ('e1000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'spending', -100, 'USD', '2026-13')$$,
  '23514', null, 'start month 2026-13 is refused');

select extensions.lives_ok(
  $$update public.decide_changes set monthly_amount = 30000 where id = 'e1000000-0000-0000-0000-000000000001'$$,
  'A edits the amount of a change');
select extensions.is(
  (select version from public.decide_changes where id = 'e1000000-0000-0000-0000-000000000001'),
  2, 'the edit bumped the version');
select extensions.throws_ok(
  $$update public.decide_changes set household_id = (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333') where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'household_id has no update grant, so it cannot move');

-- A cannot insert a goal; a goal inserted by the owner role is visible to A only.
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, name, currency, target)
    values ('f1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Sofa fund', 'USD', 120000)$$,
  '42501', null, 'goals have no client insert grant');
reset role;
insert into public.savings_goals (id, household_id, created_by, name, currency, target, monthly_amount)
values ('f1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        '11111111-1111-1111-1111-111111111111', 'Sofa fund', 'USD', 120000, 10000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.savings_goals where id = 'f1000000-0000-0000-0000-000000000001'),
  1, 'A sees their own goal');
select extensions.throws_ok(
  $$update public.savings_goals set target = 1 where id = 'f1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client update of the goal target has no column grant');
select extensions.lives_ok(
  $$update public.savings_goals set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001'$$,
  'A soft-deletes their goal');

-- decision state on checks is never client-writable
select extensions.lives_ok(
  $$insert into public.decide_checks (id, household_id, name, inputs)
    values ('d1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Sofa', '{"kind":"buy","price":120000}')$$,
  'A inserts an open check');
select extensions.throws_ok(
  $$update public.decide_checks set cooling_off_at = now() where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client update of cooling_off_at is refused');
select extensions.throws_ok(
  $$update public.decide_checks set estimate_running = 100 where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client update of estimate_running is refused');

-- link roles
select extensions.lives_ok(
  $$insert into public.decide_links (id, household_id, check_id, entity, target_id, role)
    values ('91000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'd1000000-0000-0000-0000-000000000001', 'transactions', 'b1111111-1111-1111-1111-111111111111', 'payment')$$,
  'a link with role payment is accepted');
select extensions.throws_ok(
  $$insert into public.decide_links (id, household_id, check_id, entity, target_id, role)
    values ('91000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'd1000000-0000-0000-0000-000000000001', 'transactions', 'b1111111-1111-1111-1111-111111111112', 'deposit')$$,
  '23514', null, 'a link with role deposit is refused');
select extensions.throws_ok(
  $$update public.decide_links set role = 'day_one' where id = '91000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a link role cannot be changed after insert');
reset role;

-- ---------------------------------------------------------------- Seen by B and C
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.decide_changes) + (select count(*)::int from public.savings_goals),
  0, 'B, in A''s household, sees none of A''s changes or goals');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.decide_changes) + (select count(*)::int from public.savings_goals),
  0, 'C sees none of A''s changes or goals');
reset role;

-- ---------------------------------------------------------------- Erasure
select extensions.lives_ok(
  $$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$,
  'deleting A succeeds');
select extensions.is(
  (select count(*)::int from public.decide_changes where created_by = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from public.savings_goals where created_by = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from public.decide_changes where household_id in (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))
  + (select count(*)::int from public.savings_goals where household_id in (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  0, 'deleting A purges every change and goal');

select * from extensions.finish();
rollback;
