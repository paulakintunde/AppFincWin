-- pgTAP: D-23..D-30, D-50, D-55, REC-11/REC-12/ACT-05 proof for undo_log,
-- apply_patches, apply_undo_step, rollback_undo_to and purge_record_tombstones.
--
-- Proves: atomic all-or-nothing bulk patches with server-derived touched_ids;
-- version-conflict refusal that names who last changed what; owner-only
-- undo_log RLS even between two members of the SAME household; the 12-deep
-- trim; rollback-to-X stopping at the first refused step; the transfer-pair
-- allowlist columns cooperating with plan 02-38's deferred constraint
-- trigger; the mark-paid-from-import patch shape; and the daily tombstone
-- purge.
--
-- This file does NOT force `set constraints ... immediate` for the whole
-- file (unlike 33_transfer_pairs.test.sql) -- it leaves the pair trigger in
-- its real, undisturbed default (deferrable initially deferred), because
-- apply_patches applies a transfer pair's two legs as two separate dynamic
-- UPDATE statements, and only stays correct when the check is deferred to
-- commit, exactly as it will be in every real RPC call in production.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(71);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

-- Each user's household id and A's seeded category ids, captured as
-- postgres before impersonating (mirrors 05_accounts_transactions.test.sql
-- and 02-07 SUMMARY.md's RLS-visibility lesson).
create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create temp table catid as select builtin_key, id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111';
grant select on catid to authenticated;

-- ---------------------------------------------------------------------
-- Fixtures: A's two accounts, B's one account.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A Checking', 'checking', 'USD', 0),
  ('a0000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A Savings', 'checking', 'USD', 0);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('b0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'B Checking', 'checking', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('cb000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'b0000000-0000-0000-0000-000000000001', -50, 'USD', '2026-09-22', 'America/Vancouver', 'B''s row');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ---------------------------------------------------------------------
-- 1/2. apply_patches soft-deletes 3 rows and records one undo step in the
-- same call; touched_ids is server-derived; the rows vanish from
-- transactions_active (D-24, D-25, D-30).
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('c0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -100, 'USD', '2026-09-22', 'America/Vancouver', 'Row One'),
  ('c0000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -200, 'USD', '2026-09-22', 'America/Vancouver', 'Row Two'),
  ('c0000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -300, 'USD', '2026-09-22', 'America/Vancouver', 'Row Three');

create temp table res1 as select public.apply_patches(
  '[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}},
    {"entity":"transactions","id":"c0000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"deleted_at":"$now"}},
    {"entity":"transactions","id":"c0000000-0000-0000-0000-000000000003","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb,
  '{"id":"e0000000-0000-0000-0000-000000000001","label_key":"deletedMany","label_params":{"n":3},
    "ops":[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}},
           {"entity":"transactions","id":"c0000000-0000-0000-0000-000000000002","expectedVersion":2,"patch":{"deleted_at":null}},
           {"entity":"transactions","id":"c0000000-0000-0000-0000-000000000003","expectedVersion":2,"patch":{"deleted_at":null}}]}'::jsonb
) as r;

select extensions.is((select r ->> 'status' from res1), 'applied', 'soft-deleting 3 rows in one call returns applied');
select extensions.is((select jsonb_array_length(r -> 'rows') from res1)::int, 3, 'returns 3 row results');
select extensions.is((select (r -> 'rows' -> 0 ->> 'version')::int from res1), 2, 'first row version bumped to 2 (+1)');
select extensions.is((select (r -> 'rows' -> 1 ->> 'version')::int from res1), 2, 'second row version bumped to 2 (+1)');
select extensions.is((select (r -> 'rows' -> 2 ->> 'version')::int from res1), 2, 'third row version bumped to 2 (+1)');
select extensions.is(
  (select count(*)::int from public.transactions_active where id in (
    'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000003'
  )),
  0,
  'soft-deleted rows vanish from transactions_active'
);
select extensions.is((select count(*)::int from public.undo_log where id = 'e0000000-0000-0000-0000-000000000001'), 1, 'exactly one undo_log row inserted for the bulk step');
select extensions.is((select array_length(touched_ids, 1) from public.undo_log where id = 'e0000000-0000-0000-0000-000000000001')::int, 3, 'touched_ids has 3 ids (server-derived)');

-- ---------------------------------------------------------------------
-- 3. A stale expectedVersion anywhere in the list refuses the whole list
-- (all-or-nothing, D-26).
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('c0000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -400, 'USD', '2026-09-22', 'America/Vancouver', 'Row Four'),
  ('c0000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -500, 'USD', '2026-09-22', 'America/Vancouver', 'Row Five');

create temp table res3 as select public.apply_patches(
  '[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000004","expectedVersion":99,"patch":{"note":"x"}},
    {"entity":"transactions","id":"c0000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"note":"y"}}]'::jsonb
) as r;

select extensions.is((select r ->> 'status' from res3), 'conflict', 'a stale expectedVersion anywhere in the list returns conflict');
select extensions.is((select r -> 'conflict' ->> 'reason' from res3), 'changed', 'conflict reason is changed');
select extensions.is((select version from public.transactions where id = 'c0000000-0000-0000-0000-000000000005')::int, 1, 'the OTHER row in the same list is untouched (all-or-nothing)');
select extensions.is((select note from public.transactions where id = 'c0000000-0000-0000-0000-000000000005'), null, 'the other row''s patch was never applied');

-- ---------------------------------------------------------------------
-- 4. Column and entity allowlist violations throw 22023 (T-02-09-01).
-- ---------------------------------------------------------------------
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"home_amount":100}}]'::jsonb)$$,
  '22023', null,
  'patching home_amount throws 22023 (server-only stamp column, not in the allowlist)'
);
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"profiles","id":"11111111-1111-1111-1111-111111111111","expectedVersion":1,"patch":{"full_name":"x"}}]'::jsonb)$$,
  '22023', null,
  'entity profiles throws 22023 (not one of the four allowlisted entities)'
);
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"recurring_series_id":"33333333-3333-3333-3333-333333333333"}}]'::jsonb)$$,
  '22023', null,
  'recurring_series_id must be null; a real uuid throws 22023'
);

-- D-CR-02: a missing or null expectedVersion is an invalid op, never an
-- unconditional write -- both in apply_patches and in a stored step.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000005","patch":{"note":"no version"}}]'::jsonb)$$,
  '22023', null,
  'an op with no expectedVersion key throws 22023 (fails closed)'
);
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000005","expectedVersion":null,"patch":{"note":"null version"}}]'::jsonb)$$,
  '22023', null,
  'an op with a null expectedVersion throws 22023 (fails closed)'
);
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, label_params, ops) values (
      gen_random_uuid(), 'edited', '{}'::jsonb,
      '[{"entity":"transactions","id":"c0000000-0000-0000-0000-000000000005","patch":{"note":null}}]'::jsonb)$$,
  '22023', null,
  'a stored undo step whose op has no expectedVersion is rejected at insert time'
);
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, label_params, ops) values (
      gen_random_uuid(), 'edited', '{}'::jsonb,
      '[{"entity":"profiles","id":"c0000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"note":null}}]'::jsonb)$$,
  '22023', null,
  'a stored undo step naming an unknown entity is rejected at insert time'
);
select extensions.is(
  (select note from public.transactions where id = 'c0000000-0000-0000-0000-000000000005'),
  null,
  'the version-less ops never wrote anything'
);

-- D-IN-02: a stored step has a size cap, not just an element-count cap.
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, label_params, ops) values (
      gen_random_uuid(), 'edited', '{}'::jsonb,
      jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'c0000000-0000-0000-0000-000000000005',
        'expectedVersion', 1, 'patch', jsonb_build_object('note', repeat('x', 2200000)))))$$,
  '23514', null,
  'a stored undo step larger than 2 MB is rejected'
);

-- ---------------------------------------------------------------------
-- 5. An op on B's (other household) row throws 42501 (T-02-09-02).
-- ---------------------------------------------------------------------
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"cb000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"note":"hack"}}]'::jsonb)$$,
  '42501', null,
  'an op on B''s row (a household A does not belong to) throws 42501'
);

-- ---------------------------------------------------------------------
-- 6/7. apply_undo_step restores a soft-deleted row exactly (deleted_at,
-- created_by, rate and home_amount unchanged), and refuses to undo twice.
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('d0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -750, 'USD', '2026-09-22', 'America/Vancouver', 'Coffee');

create temp table d1_before as select rate, home_amount, created_by from public.transactions where id = 'd0000000-0000-0000-0000-000000000001';

select public.apply_patches(
  '[{"entity":"transactions","id":"d0000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb,
  '{"id":"d0000000-0000-0000-0000-000000000009","label_key":"deleted","label_params":{},
    "ops":[{"entity":"transactions","id":"d0000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}}]}'::jsonb
);

create temp table res6 as select public.apply_undo_step('d0000000-0000-0000-0000-000000000009') as r;
select extensions.is((select r ->> 'status' from res6), 'undone', 'apply_undo_step restores the row: status undone');
select extensions.is((select deleted_at from public.transactions where id = 'd0000000-0000-0000-0000-000000000001'), null, 'deleted_at is cleared');
select extensions.is((select created_by from public.transactions where id = 'd0000000-0000-0000-0000-000000000001'), '11111111-1111-1111-1111-111111111111'::uuid, 'created_by is unchanged');
select extensions.is((select rate from public.transactions where id = 'd0000000-0000-0000-0000-000000000001'), (select rate from d1_before), 'rate is unchanged by the undo');
select extensions.is((select home_amount from public.transactions where id = 'd0000000-0000-0000-0000-000000000001'), (select home_amount from d1_before), 'home_amount is unchanged by the undo');

create temp table res7 as select public.apply_undo_step('d0000000-0000-0000-0000-000000000009') as r;
select extensions.is((select r ->> 'status' from res7), 'already-undone', 'calling apply_undo_step again returns already-undone');

-- ---------------------------------------------------------------------
-- 8/9. Refusal attribution: B joins A's household, edits a row A already
-- recorded a step against; A's undo is refused and names B (D-26). B still
-- cannot see or undo A's step at all -- undo_log is per-user, not per
-- household (D-23).
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('f0000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -900, 'USD', '2026-09-22', 'America/Vancouver', 'Groceries run');

select public.apply_patches(
  '[{"entity":"transactions","id":"f0000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"note":"edited by A"}}]'::jsonb,
  '{"id":"f0000000-0000-0000-0000-000000000009","label_key":"edited","label_params":{},
    "ops":[{"entity":"transactions","id":"f0000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"note":null}}]}'::jsonb
);

reset role;
insert into public.household_members (household_id, user_id, role, weight)
  values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update public.transactions set note = 'edited by B' where id = 'f0000000-0000-0000-0000-000000000001';

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table res8 as select public.apply_undo_step('f0000000-0000-0000-0000-000000000009') as r;
select extensions.is((select r ->> 'status' from res8), 'refused', 'A''s undo is refused once B has edited the same row');
select extensions.is((select r -> 'refusal' ->> 'updated_by' from res8), '22222222-2222-2222-2222-222222222222', 'refusal names B as the last editor (updated_by)');
select extensions.is((select r -> 'refusal' ->> 'record_name' from res8), 'Groceries run', 'refusal names the record');
select extensions.is((select status from public.undo_log where id = 'f0000000-0000-0000-0000-000000000009'), 'refused', 'the step''s own status is now refused');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.undo_log where id = 'e0000000-0000-0000-0000-000000000001'), 0, 'B cannot select A''s undo_log row, even as a fellow household member');
create temp table res9 as select public.apply_undo_step('e0000000-0000-0000-0000-000000000001') as r;
select extensions.is((select r ->> 'status' from res9), 'not-found', 'B calling apply_undo_step on A''s step returns not-found');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ---------------------------------------------------------------------
-- 10. Trim: inserting 14 steps for A leaves exactly 12 available rows
-- (D-25).
-- ---------------------------------------------------------------------
insert into public.undo_log (id, label_key, label_params, ops)
select gen_random_uuid(), 'edited', '{}'::jsonb,
       jsonb_build_array(jsonb_build_object('entity', 'categories', 'id', gen_random_uuid(), 'expectedVersion', 1, 'patch', jsonb_build_object('name', 'x')))
  from generate_series(1, 14);

select extensions.is(
  (select count(*)::int from public.undo_log where owner_id = '11111111-1111-1111-1111-111111111111' and status = 'available'),
  12,
  'inserting 14 steps leaves exactly 12 available rows'
);

-- ---------------------------------------------------------------------
-- 11. rollback_undo_to: undoes newest-first down to (and including) the
-- target, and stops with 'blocked' at a refused step in between (D-27).
-- ---------------------------------------------------------------------
insert into public.categories (id, name, color_key) values
  ('c9000000-0000-0000-0000-000000000001', 'Group A One', 'green'),
  ('c9000000-0000-0000-0000-000000000002', 'Group A Two', 'green'),
  ('c9000000-0000-0000-0000-000000000003', 'Group A Three', 'green');

select public.apply_patches(
  '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"archived_at":"$now"}}]'::jsonb,
  '{"id":"90000001-0000-0000-0000-000000000001","label_key":"categoryArchived","label_params":{},
    "ops":[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"archived_at":null}}]}'::jsonb
);
select public.apply_patches(
  '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"archived_at":"$now"}}]'::jsonb,
  '{"id":"90000001-0000-0000-0000-000000000002","label_key":"categoryArchived","label_params":{},
    "ops":[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000002","expectedVersion":2,"patch":{"archived_at":null}}]}'::jsonb
);
select public.apply_patches(
  '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000003","expectedVersion":1,"patch":{"archived_at":"$now"}}]'::jsonb,
  '{"id":"90000001-0000-0000-0000-000000000003","label_key":"categoryArchived","label_params":{},
    "ops":[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000003","expectedVersion":2,"patch":{"archived_at":null}}]}'::jsonb
);

create temp table res11a as select public.rollback_undo_to('90000001-0000-0000-0000-000000000001') as r;
select extensions.is((select r ->> 'status' from res11a), 'undone', 'rollback to the 3rd-newest of 3 straightforward steps undoes all three');
select extensions.is((select (r ->> 'undone')::int from res11a), 3, 'rollback undoes exactly 3 steps');

insert into public.categories (id, name, color_key) values
  ('c9000000-0000-0000-0000-000000000004', 'Group B One', 'slate'),
  ('c9000000-0000-0000-0000-000000000005', 'Group B Two', 'slate'),
  ('c9000000-0000-0000-0000-000000000006', 'Group B Three', 'slate');

select public.apply_patches(
  '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000004","expectedVersion":1,"patch":{"archived_at":"$now"}}]'::jsonb,
  '{"id":"90000002-0000-0000-0000-000000000001","label_key":"categoryArchived","label_params":{},
    "ops":[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000004","expectedVersion":2,"patch":{"archived_at":null}}]}'::jsonb
);
select public.apply_patches(
  '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"archived_at":"$now"}}]'::jsonb,
  '{"id":"90000002-0000-0000-0000-000000000002","label_key":"categoryArchived","label_params":{},
    "ops":[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000005","expectedVersion":2,"patch":{"archived_at":null}}]}'::jsonb
);
select public.apply_patches(
  '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000006","expectedVersion":1,"patch":{"archived_at":"$now"}}]'::jsonb,
  '{"id":"90000002-0000-0000-0000-000000000003","label_key":"categoryArchived","label_params":{},
    "ops":[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000006","expectedVersion":2,"patch":{"archived_at":null}}]}'::jsonb
);

reset role;
update public.undo_log set status = 'refused', refusal = '{"forced":"test-fixture"}'::jsonb, resolved_at = now()
 where id = '90000002-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table res11b as select public.rollback_undo_to('90000002-0000-0000-0000-000000000001') as r;
select extensions.is((select r ->> 'status' from res11b), 'blocked', 'a refused step between newest and target blocks the rollback');
select extensions.is((select (r ->> 'undone')::int from res11b), 1, 'exactly the newest step was undone before the block');
select extensions.is((select r ->> 'blocked_by' from res11b), '90000002-0000-0000-0000-000000000002', 'blocked_by names the refused step');

-- ---------------------------------------------------------------------
-- 12. A custom category can be archived with '$now'; a system category
-- (Transfer) cannot (D-34).
-- ---------------------------------------------------------------------
select extensions.lives_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object(
      'entity', 'categories', 'id', (select id from catid where builtin_key = 'Housing'), 'expectedVersion', 1,
      'patch', jsonb_build_object('archived_at', '$now'))))$$,
  'archiving a custom (editable built-in) category with $now works'
);
select extensions.throws_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object(
      'entity', 'categories', 'id', (select id from catid where builtin_key = 'Transfer'), 'expectedVersion', 1,
      'patch', jsonb_build_object('archived_at', '$now'))))$$,
  '42501', null,
  'archiving the system Transfer category throws 42501'
);

-- ---------------------------------------------------------------------
-- 13. purge_record_tombstones: an unreferenced tombstone aged 2 days is
-- hard-deleted; one referenced by an available step is kept;
-- service_role-only; the cron job exists (D-30).
-- ---------------------------------------------------------------------
reset role;
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, deleted_at) values
  ('90000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -10, 'USD', '2026-09-01', 'America/Vancouver', now() - interval '2 days'),
  ('90000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -20, 'USD', '2026-09-01', 'America/Vancouver', now() - interval '2 days'),
  ('90000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -30, 'USD', '2026-09-01', 'America/Vancouver', now() - interval '2 days');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.undo_log (id, label_key, label_params, ops) values (
  '90000000-0000-0000-0000-000000000009', 'deleted', '{}'::jsonb,
  '[{"entity":"transactions","id":"90000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"deleted_at":null}}]'::jsonb
);
-- D-WR-06: a step that can never be applied again (refused) pins nothing.
insert into public.undo_log (id, label_key, label_params, ops) values (
  '90000000-0000-0000-0000-000000000008', 'deleted', '{}'::jsonb,
  '[{"entity":"transactions","id":"90000000-0000-0000-0000-000000000003","expectedVersion":1,"patch":{"deleted_at":null}}]'::jsonb
);
reset role;
update public.undo_log set status = 'refused', refusal = '{"forced":"test-fixture"}'::jsonb, resolved_at = now()
 where id = '90000000-0000-0000-0000-000000000008';

set local role service_role;
select extensions.lives_ok($$select public.purge_record_tombstones()$$, 'service_role can call purge_record_tombstones');
reset role;

select extensions.is((select count(*)::int from public.transactions where id = '90000000-0000-0000-0000-000000000001'), 0, 'an unreferenced tombstone aged 2 days is hard-deleted');
select extensions.is((select count(*)::int from public.transactions where id = '90000000-0000-0000-0000-000000000002'), 1, 'a tombstone referenced by an available step is kept');
select extensions.is((select count(*)::int from public.transactions where id = '90000000-0000-0000-0000-000000000003'), 0, 'a tombstone referenced only by a refused step is purged (D-WR-06)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok($$select public.purge_record_tombstones()$$, '42501', null, 'authenticated cannot call purge_record_tombstones');
reset role;

select extensions.is((select count(*)::int from cron.job where jobname = 'record-tombstone-purge-daily'), 1, 'record-tombstone-purge-daily cron job is scheduled');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ---------------------------------------------------------------------
-- 14. undo_log cannot be written to directly by any client, whatever the
-- status value (T-02-09-05).
-- ---------------------------------------------------------------------
select extensions.throws_ok(
  $$update public.undo_log set status = 'undone' where owner_id = (select auth.uid())$$,
  '42501', null,
  'a client update on undo_log.status throws 42501 (no update grant at all)'
);
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, label_params, ops, status) values (
      gen_random_uuid(), 'edited', '{}'::jsonb,
      '[{"entity":"categories","id":"c9000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"name":"x"}}]'::jsonb,
      'refused')$$,
  '42501', null,
  'an insert naming status is rejected (column not in the insert grant)'
);

-- ---------------------------------------------------------------------
-- 15/16/17. Transfer linking cooperates with plan 02-38's deferred pair
-- trigger: linking two legs through apply_patches, unlinking one leg alone,
-- and soft-deleting/undoing both legs together (D-50).
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('10000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -5000, 'USD', '2026-09-22', 'America/Vancouver', 'Card payment'),
  ('10000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000002', 5000, 'USD', '2026-09-22', 'America/Vancouver', 'Card payment received');

create temp table res15 as select public.apply_patches(
  jsonb_build_array(
    jsonb_build_object('entity', 'transactions', 'id', '10000000-0000-0000-0000-000000000001', 'expectedVersion', 1,
      'patch', jsonb_build_object('transfer_id', 'd1000000-0000-0000-0000-000000000001', 'category_id', (select id from catid where builtin_key = 'Transfer'))),
    jsonb_build_object('entity', 'transactions', 'id', '10000000-0000-0000-0000-000000000002', 'expectedVersion', 1,
      'patch', jsonb_build_object('transfer_id', 'd1000000-0000-0000-0000-000000000001', 'category_id', (select id from catid where builtin_key = 'Transfer')))
  )
) as r;

select extensions.is((select r ->> 'status' from res15), 'applied', 'apply_patches links a transfer pair across two unlinked rows (D-50)');
select extensions.lives_ok($$set constraints public.transfer_pair_check immediate$$, 'the pair check passes once both legs are linked via apply_patches');
select extensions.lives_ok($$set constraints public.transfer_pair_check deferred$$, 'restore the trigger''s default deferred mode');

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id, name) values
  ('10000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -600, 'USD', '2026-09-22', 'America/Vancouver', 'd1000000-0000-0000-0000-000000000002', 'Transfer leg out'),
  ('10000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000002', 600, 'USD', '2026-09-22', 'America/Vancouver', 'd1000000-0000-0000-0000-000000000002', 'Transfer leg in');

create temp table res16 as select public.apply_patches(
  '[{"entity":"transactions","id":"10000000-0000-0000-0000-000000000003","expectedVersion":1,"patch":{"transfer_id":null}}]'::jsonb
) as r;
select extensions.is((select r ->> 'status' from res16), 'applied', 'unlinking one leg alone via apply_patches still applies (checked at commit, not mid-write)');
select extensions.throws_ok($$set constraints public.transfer_pair_check immediate$$, '23514', null, 'unlinking only one leg fails the pair check once actually checked');
select extensions.lives_ok($$set constraints public.transfer_pair_check deferred$$, 'restore the trigger''s default deferred mode after the expected failure');

-- A deferred constraint trigger's pending check is NOT consumed by a caught
-- exception (pgTAP's throws_ok rolls back to a savepoint, which un-fires it
-- too) -- it stays queued and would re-fail on every later flush in this
-- transaction unless the pair is made whole again. Re-link the leg so this
-- deliberately-broken pair does not haunt every subsequent immediate check.
update public.transactions set transfer_id = 'd1000000-0000-0000-0000-000000000002' where id = '10000000-0000-0000-0000-000000000003';

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id, name) values
  ('10000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -700, 'USD', '2026-09-22', 'America/Vancouver', 'd1000000-0000-0000-0000-000000000003', 'Transfer leg out'),
  ('10000000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000002', 700, 'USD', '2026-09-22', 'America/Vancouver', 'd1000000-0000-0000-0000-000000000003', 'Transfer leg in');

select public.apply_patches(
  '[{"entity":"transactions","id":"10000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"deleted_at":"$now"}},
    {"entity":"transactions","id":"10000000-0000-0000-0000-000000000006","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb,
  '{"id":"d1000000-0000-0000-0000-000000000009","label_key":"transferDeleted","label_params":{},
    "ops":[{"entity":"transactions","id":"10000000-0000-0000-0000-000000000005","expectedVersion":2,"patch":{"deleted_at":null}},
           {"entity":"transactions","id":"10000000-0000-0000-0000-000000000006","expectedVersion":2,"patch":{"deleted_at":null}}]}'::jsonb
);
select extensions.lives_ok($$set constraints public.transfer_pair_check immediate$$, 'soft-deleting both legs of a pair together keeps the pair check satisfied');
select extensions.lives_ok($$set constraints public.transfer_pair_check deferred$$, 'restore the trigger''s default deferred mode');
select extensions.is(
  (select count(*)::int from public.transactions_active where id in ('10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006')),
  0,
  'both legs vanish from transactions_active together'
);

create temp table res17 as select public.apply_undo_step('d1000000-0000-0000-0000-000000000009') as r;
select extensions.is((select r ->> 'status' from res17), 'undone', 'apply_undo_step restores both legs of the pair in one step');
select extensions.is(
  (select count(*)::int from public.transactions_active where id in ('10000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000006')),
  2,
  'both legs are back in transactions_active'
);
select extensions.lives_ok($$set constraints public.transfer_pair_check immediate$$, 'restoring both legs together keeps the pair check satisfied');
select extensions.lives_ok($$set constraints public.transfer_pair_check deferred$$, 'restore the trigger''s default deferred mode');

-- ---------------------------------------------------------------------
-- 18. apply_patches mark-paid-from-import path: status, local_date and
-- original_amount patched together (D-55).
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('20000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a0000000-0000-0000-0000-000000000001', -1099, 'USD', '2026-09-01', 'America/Vancouver', 'Netflix', 'pending');

create temp table res18 as select public.apply_patches(
  '[{"entity":"transactions","id":"20000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"status":"paid","local_date":"2026-09-04","original_amount":-1150}}]'::jsonb
) as r;
select extensions.is((select r ->> 'status' from res18), 'applied', 'the mark-paid-from-import patch (status/local_date/original_amount together) applies');
select extensions.is((select (r -> 'rows' -> 0 ->> 'version')::int from res18), 2, 'version is bumped by the mark-paid patch');
select extensions.is((select status from public.transactions where id = '20000000-0000-0000-0000-000000000001'), 'paid', 'the row is now paid');
select extensions.is((select original_amount from public.transactions where id = '20000000-0000-0000-0000-000000000001')::int, -1150, 'the amount is updated to the imported figure');

-- ---------------------------------------------------------------------
-- 19. Account credit_limit patches through the allowlist; import
-- provenance columns never do (D-45, D-48).
-- ---------------------------------------------------------------------
create temp table res19 as select public.apply_patches(
  '[{"entity":"accounts","id":"a0000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"credit_limit":100000}}]'::jsonb
) as r;
select extensions.is((select r ->> 'status' from res19), 'applied', 'patching credit_limit on an account applies');
select extensions.is((select credit_limit from public.accounts where id = 'a0000000-0000-0000-0000-000000000001')::int, 100000, 'credit_limit is set to the patched value');

select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"20000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"raw_amount":"x"}}]'::jsonb)$$,
  '22023', null,
  'patching the raw amount provenance column throws 22023 (not in the allowlist)'
);
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"transactions","id":"20000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"external_id":"x"}}]'::jsonb)$$,
  '22023', null,
  'patching the import-linkage id column throws 22023 (not in the allowlist)'
);

reset role;

select * from extensions.finish();
rollback;
