-- pgTAP: Phase 5 plan 04 -- decide_checks / debts / decide_links (and, part 2, decide_changes /
-- savings_goals / transactions.one_off + goal_id) in undo_log_fill and apply_patches (DCU-04, D-11, D-12,
-- D-27, D-29, D-34). Checks, links, changes and goals are owner-private; debts are household-scoped;
-- a check's decision columns patch only while replaying a server-recorded step.
--
-- Needs 20261016000100, 20261016000110, 20261016000120 and 20261016000200.

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

-- B joins A's household.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- Fixtures written as the table owner (the client has no insert grant on goals or decision columns).
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);
insert into public.transactions (id, created_by, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-10-02', 'UTC', 'Laptop bag');
insert into public.decide_checks (id, household_id, created_by, name) values
  ('c4000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Laptop'),
  ('c4000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'C check');
insert into public.debts (id, household_id, created_by, name, kind, currency, balance) values
  ('de000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Laptop loan', 'loan', 'USD', 90000);
insert into public.decide_links (id, household_id, created_by, check_id, entity, target_id) values
  ('1c000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111',
   'c4000000-0000-0000-0000-000000000001', 'transactions', 'd1000000-0000-0000-0000-000000000001');
insert into public.decide_changes (id, household_id, created_by, kind, name, monthly_amount, currency, start_month) values
  ('dc000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'spending', 'Gym', -4000, 'USD', '2026-11');
-- 05-119: Wait goals now arrive only through the Wait RPC, so the fixture insert runs with it on.
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, name, currency, target) values
  ('5a000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Trip fund', 'USD', 100000),
  ('5a000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Tag fund', 'USD', 50000);
select set_config('fincwin.decide_rpc', '', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1-2. The undo log accepts the Decide entities and still refuses others.
select extensions.lives_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e5000000-0000-0000-0000-000000000001', 'decisionWritten',
    '[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}},
      {"entity":"debts","id":"de000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}},
      {"entity":"decide_links","id":"1c000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)$$,
  'undo_log_fill accepts decide_checks, debts and decide_links ops');
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e5000000-0000-0000-0000-000000000002', 'x',
    '[{"entity":"profiles","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"reserve":1}}]'::jsonb)$$,
  '22023', null, 'undo_log_fill refuses an entity outside the list (profiles); decide_settings joined it in 05.2');

-- 3-4. Soft delete and restore a check (abandon / undo).
select extensions.is(
  (public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) ->> 'status',
  'applied', 'A soft-deletes their open check');
select extensions.is(
  (public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}}]'::jsonb)) ->> 'status',
  'applied', 'A restores their check');

-- 5. A status is never patchable outside a server-recorded replay.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"status":"bought"}}]'::jsonb)$$,
  '22023', null, 'status on decide_checks is refused outside replay');

-- 6. Another user's check.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000003","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)$$,
  '42501', null, 'A cannot patch C''s check');

-- 7. Debts are household-scoped: B (member) edits A's household debt.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (public.apply_patches('[{"entity":"debts","id":"de000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"balance":80000}}]'::jsonb)) ->> 'status',
  'applied', 'a household member patches a household debt');

-- 17-18 (part 2, run as B here): owner-private change and goal.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"decide_changes","id":"dc000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)$$,
  '42501', null, 'a member cannot patch another user''s dated change');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"savings_goals","id":"5a000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)$$,
  '42501', null, 'a member cannot patch another user''s savings goal');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 8-9. Links: only deleted_at.
select extensions.is(
  (public.apply_patches('[{"entity":"decide_links","id":"1c000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) ->> 'status',
  'applied', 'A soft-deletes their own link');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"decide_links","id":"1c000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"target_id":"d1000000-0000-0000-0000-000000000001"}}]'::jsonb)$$,
  '22023', null, 'target_id on decide_links is refused');

-- 10-11. A version mismatch names the check.
select extensions.is(
  (public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) ->> 'status',
  'conflict', 'a stale version on decide_checks is a conflict');
select extensions.is(
  (public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) -> 'conflict' ->> 'record_name',
  'Laptop', 'the conflict names the check');

-- ---------------------------------------------------------------------
-- Part 2: decide_changes, savings_goals, one_off, goal_id, cooling-off.
-- ---------------------------------------------------------------------
-- 12.
select extensions.lives_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e5000000-0000-0000-0000-000000000003', 'deletedChange',
    '[{"entity":"decide_changes","id":"dc000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}},
      {"entity":"savings_goals","id":"5a000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)$$,
  'undo_log_fill accepts decide_changes and savings_goals ops');

-- 13-14. A dated change: soft delete, then restore.
select extensions.is(
  (public.apply_patches('[{"entity":"decide_changes","id":"dc000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) ->> 'status',
  'applied', 'A soft-deletes their dated change');
select extensions.is(
  (public.apply_patches('[{"entity":"decide_changes","id":"dc000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}}]'::jsonb)) ->> 'status',
  'applied', 'A restores their dated change');

-- 15-16. A savings goal: soft delete, then restore.
select extensions.is(
  (public.apply_patches('[{"entity":"savings_goals","id":"5a000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) ->> 'status',
  'applied', 'A soft-deletes their savings goal');
select extensions.is(
  (public.apply_patches('[{"entity":"savings_goals","id":"5a000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}}]'::jsonb)) ->> 'status',
  'applied', 'A restores their savings goal');

-- 19-21. one_off and goal_id on the caller's transaction.
select extensions.is(
  (public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"one_off":true}}]'::jsonb)) ->> 'status',
  'applied', 'one_off applies on the caller''s transaction');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"one_off":"maybe"}}]'::jsonb)$$,
  '22P02', null, 'a non-boolean one_off is refused by the type cast');
select extensions.is(
  (public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"goal_id":"5a000000-0000-0000-0000-000000000002"}}]'::jsonb)) ->> 'status',
  'applied', 'goal_id applies on the caller''s transaction');

-- 22-23. Cooling-off and the running estimate are server-only columns.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"cooling_off_at":"2030-01-01T00:00:00Z"}}]'::jsonb)$$,
  '22023', null, 'cooling_off_at is refused outside replay');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"decide_checks","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"estimate_running":1}}]'::jsonb)$$,
  '22023', null, 'estimate_running is refused outside replay');

reset role;
select * from extensions.finish();
rollback;
