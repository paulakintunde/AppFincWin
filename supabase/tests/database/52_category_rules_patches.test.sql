-- pgTAP: Phase 02.3 plan 08 -- category_rules in undo_log_fill / apply_patches
-- (REC-27; D-24, D-27). Rule ops ride ordinary undo steps; scope mirrors the
-- table's RLS; only the table's update-grant columns patch; a category_id must
-- be a non-system category the caller owns; a conflict names the rule.
--
-- Needs 20261012000100 and 20261012000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(22);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);
insert into public.transactions (id, created_by, household_id, account_id, original_amount, original_currency, local_date, time_zone, name) values
  ('d1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 500, 'USD', '2026-10-02', 'UTC', 'Money back');
insert into public.categories (id, owner_id, name, color_key) values
  ('c0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'A stuff', 'teal'),
  ('c0000000-0000-0000-0000-0000000000b1', '22222222-2222-2222-2222-222222222222', 'B stuff', 'plum');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
values ('ab000000-0000-0000-0000-000000000001', 'personal', 'Gym', 'gym', 'c0000000-0000-0000-0000-0000000000a1');
insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_builtin_key)
values ('ab000000-0000-0000-0000-000000000002', 'shared', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Tesco', 'tesco', 'Groceries');

-- 1-3. A rule op rides an ordinary undo step, and undoing it applies.
select extensions.lives_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e5000000-0000-0000-0000-000000000001', 'deletedRule',
    '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)$$,
  'undo_log_fill accepts a category_rules op');
select extensions.is(
  (public.apply_undo_step('e5000000-0000-0000-0000-000000000001')) ->> 'status',
  'undone', 'undoing the step applies the rule op');
select extensions.isnt(
  (select deleted_at from public.category_rules where id = 'ab000000-0000-0000-0000-000000000001'),
  null, 'the personal rule is soft-deleted by the step');

-- 4-5. Restore through apply_patches.
select extensions.is(
  (public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}}]'::jsonb)) ->> 'status',
  'applied', 'A restores their personal rule');
select extensions.is(
  (select version from public.category_rules where id = 'ab000000-0000-0000-0000-000000000001'),
  3, 'the restore bumps the version');

-- 6-7. B (household member) edits the shared rule.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"keyword":"Tesco Express","keyword_norm":"tesco express"}}]'::jsonb)) ->> 'status',
  'applied', 'a household member edits a shared rule');
select extensions.is(
  (select updated_by from public.category_rules where id = 'ab000000-0000-0000-0000-000000000002'),
  '22222222-2222-2222-2222-222222222222'::uuid, 'updated_by is the editing member');

-- 8. B cannot touch A's personal rule.
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"keyword":"Hacked"}}]'::jsonb)$$,
  '42501', null, 'a member cannot patch another user''s personal rule');

-- 9. C cannot touch the shared rule of a household they are not in.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":2,"patch":{"keyword":"Hacked"}}]'::jsonb)$$,
  '42501', null, 'an outsider cannot patch a shared rule');

-- 10-13. Column allow-list and category ownership, as A.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"owner_id":"22222222-2222-2222-2222-222222222222"}}]'::jsonb)$$,
  '22023', null, 'owner_id is not patchable');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"scope":"shared"}}]'::jsonb)$$,
  '22023', null, 'scope is not patchable');
select extensions.throws_ok(
  $$select public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"category_id":"c0000000-0000-0000-0000-0000000000b1"}}]'::jsonb)$$,
  '42501', null, 'category_id naming another user''s category is refused');
select extensions.throws_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity','category_rules','id','ab000000-0000-0000-0000-000000000001','expectedVersion',3,
      'patch',jsonb_build_object('category_id',(select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and is_system limit 1)))))$$,
  '42501', null, 'category_id naming a system category is refused');

-- 14-16. A stale version on the shared rule is a conflict naming the rule.
select extensions.is(
  (public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"keyword":"Late"}}]'::jsonb)) ->> 'status',
  'conflict', 'a stale expectedVersion on a rule conflicts');
select extensions.is(
  (public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"keyword":"Late"}}]'::jsonb)) -> 'conflict' ->> 'record_name',
  'Tesco Express', 'the conflict names the rule by its keyword');
select extensions.is(
  (public.apply_patches('[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"keyword":"Late"}}]'::jsonb)) -> 'conflict' ->> 'entity',
  'category_rules', 'the conflict entity is category_rules');

-- 17-19. Replay of an already-recorded step reports only rules in scope.
select extensions.is(
  (public.apply_patches(
    '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"keyword":"Gym 2"}}]'::jsonb,
    '{"id":"e5000000-0000-0000-0000-000000000001","label_key":"x","ops":[]}'::jsonb)) ->> 'status',
  'already-applied', 'a replayed step is reported as already-applied');
select extensions.ok(
  (public.apply_patches(
    '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"keyword":"Gym 2"}}]'::jsonb,
    '{"id":"e5000000-0000-0000-0000-000000000001","label_key":"x","ops":[]}'::jsonb)) -> 'rows' @> '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001"}]'::jsonb,
  'the owner sees their personal rule in the replay rows');
-- B records a step of their own, then replays it naming A's personal rule.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.undo_log (id, label_key, ops) values ('e5000000-0000-0000-0000-000000000002', 'x',
  '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":2,"patch":{"keyword":"Tesco"}}]'::jsonb);
select extensions.is(
  (public.apply_patches(
    '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000001","expectedVersion":3,"patch":{"keyword":"Gym 2"}}]'::jsonb,
    '{"id":"e5000000-0000-0000-0000-000000000002","label_key":"x","ops":[]}'::jsonb)) -> 'rows',
  '[]'::jsonb, 'another user''s personal rule is not reported in a replay');
select extensions.is(
  (public.apply_patches(
    '[{"entity":"category_rules","id":"ab000000-0000-0000-0000-000000000002","expectedVersion":2,"patch":{"keyword":"Tesco"}}]'::jsonb,
    '{"id":"e5000000-0000-0000-0000-000000000002","label_key":"x","ops":[]}'::jsonb)) -> 'rows' -> 0 ->> 'entity',
  'category_rules', 'a member sees a shared rule in the replay rows');

-- 21-22. Existing entities still apply (smoke).
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  (public.apply_patches('[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb)) ->> 'status',
  'applied', 'a transactions op still applies');
select extensions.isnt(
  (select deleted_at from public.transactions where id = 'd1000000-0000-0000-0000-000000000001'),
  null, 'the transaction is soft-deleted');

select * from extensions.finish();
rollback;
