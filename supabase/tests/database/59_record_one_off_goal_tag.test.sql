-- pgTAP: Phase 5 plan 32 -- one-off flag and goal tag (D-29, D-34). Needs 20261016000100..120.
-- one_off default and edit, view carries both columns, goal tag guard (own live goal, same household) and transfer pair intact.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- Two accounts in A's household and a transfer pair between them (inserted as the table owner).
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values
  ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Current', 'cash', 'USD', 0),
  ('a1111111-1111-1111-1111-111111111112', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'cash', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, transfer_id, created_by)
values
  ('b1111111-1111-1111-1111-111111111101', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -5000, 'USD', current_date, 'UTC', 'To savings', 'ee000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('b1111111-1111-1111-1111-111111111102', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111112', 5000, 'USD', current_date, 'UTC', 'From current', 'ee000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111'),
  ('b1111111-1111-1111-1111-111111111103', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -999, 'USD', current_date, 'UTC', 'Coffee', null, '11111111-1111-1111-1111-111111111111');

-- Goals: A's live goal, B's goal in A's household, A's soft-deleted goal, C's goal in C's household.
insert into public.savings_goals (id, household_id, created_by, name, currency, target, deleted_at)
values
  ('f1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A live', 'USD', 120000, null),
  ('f1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'B goal', 'USD', 120000, null),
  ('f1000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A gone', 'USD', 120000, now()),
  ('f3000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'C goal', 'USD', 120000, null);

-- ---------------------------------------------------------------- As A: one-off
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (select one_off from public.transactions where id = 'b1111111-1111-1111-1111-111111111103'),
  false, 'one_off defaults to false');
select extensions.lives_ok(
  $$update public.transactions set one_off = true where id = 'b1111111-1111-1111-1111-111111111103'$$,
  'A marks their own line one-off');
select extensions.is(
  (select one_off from public.transactions_active where id = 'b1111111-1111-1111-1111-111111111103'),
  true, 'transactions_active carries one_off');

-- ---------------------------------------------------------------- goal tag
select extensions.lives_ok(
  $$update public.transactions set goal_id = 'f1000000-0000-0000-0000-000000000001' where id = 'b1111111-1111-1111-1111-111111111102'$$,
  'A tags the inbound transfer leg with their live goal');
select extensions.is(
  (select goal_id from public.transactions_active where id = 'b1111111-1111-1111-1111-111111111102'),
  'f1000000-0000-0000-0000-000000000001'::uuid, 'transactions_active carries goal_id');
select extensions.is(
  (select count(*)::int from public.transactions
    where transfer_id = 'ee000000-0000-0000-0000-000000000001' and deleted_at is null),
  2, 'the transfer pair is still two live legs after tagging');

select extensions.throws_ok(
  $$update public.transactions set goal_id = 'f3000000-0000-0000-0000-000000000001' where id = 'b1111111-1111-1111-1111-111111111103'$$,
  '42501', null, 'tagging with another household''s goal is refused');
select extensions.throws_ok(
  $$update public.transactions set goal_id = 'f1000000-0000-0000-0000-000000000002' where id = 'b1111111-1111-1111-1111-111111111103'$$,
  '42501', null, 'tagging with another member''s goal is refused');
select extensions.throws_ok(
  $$update public.transactions set goal_id = 'f1000000-0000-0000-0000-000000000003' where id = 'b1111111-1111-1111-1111-111111111103'$$,
  '42501', null, 'tagging with a soft-deleted goal is refused');
reset role;

-- ---------------------------------------------------------------- goal removal
update public.savings_goals set deleted_at = now() where id = 'f1000000-0000-0000-0000-000000000001';
select extensions.is(
  (select goal_id from public.transactions where id = 'b1111111-1111-1111-1111-111111111102'),
  'f1000000-0000-0000-0000-000000000001'::uuid, 'soft-deleting the goal leaves the existing tag in place');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.transactions set goal_id = 'f1000000-0000-0000-0000-000000000001' where id = 'b1111111-1111-1111-1111-111111111103'$$,
  '42501', null, 'a new tag to the now soft-deleted goal is refused');
reset role;

delete from public.savings_goals where id = 'f1000000-0000-0000-0000-000000000001';
select extensions.is(
  (select goal_id from public.transactions where id = 'b1111111-1111-1111-1111-111111111102'),
  null::uuid, 'hard-deleting the goal sets goal_id to null');

select * from extensions.finish();
rollback;
