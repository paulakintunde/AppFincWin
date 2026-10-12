-- pgTAP: Phase 02.3 plan 02 -- public.category_rules (REC-27; D-24..D-27).
-- Shape, RLS (personal owner-only, shared household-wide), grants, pinned
-- ownership, soft delete and per-scope keyword uniqueness.
--
-- Needs 20261012000100.

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

-- B joins A's household; C stays alone.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- Custom categories: A's and B's.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.categories (id, name, color_key) values ('c0000000-0000-0000-0000-0000000000a1', 'A stuff', 'teal');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.categories (id, name, color_key) values ('c0000000-0000-0000-0000-0000000000b1', 'B stuff', 'plum');
reset role;

select extensions.has_table('public', 'category_rules', 'category_rules exists');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.category_rules'::regclass), 'RLS is enabled');

-- As A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
    values ('ab000000-0000-0000-0000-000000000001', 'personal', 'Gym', 'gym', 'c0000000-0000-0000-0000-0000000000a1')$$,
  'A inserts a personal rule on their own category');
select extensions.ok(
  (select owner_id = '11111111-1111-1111-1111-111111111111' and household_id is null
      and created_by = '11111111-1111-1111-1111-111111111111' and version = 1
     from public.category_rules where id = 'ab000000-0000-0000-0000-000000000001'),
  'personal rule: owner and created_by are A, no household, version 1');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
    values ('ab000000-0000-0000-0000-000000000002', 'personal', 'Spa', 'spa', 'c0000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'a personal rule cannot point at another user''s category');
select extensions.lives_ok(
  $$insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_builtin_key)
    values ('ab000000-0000-0000-0000-000000000003', 'shared', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Tesco', 'tesco', 'Groceries')$$,
  'A inserts a shared rule into their household');
select extensions.ok(
  (select owner_id is null from public.category_rules where id = 'ab000000-0000-0000-0000-000000000003'),
  'shared rule has no owner_id');
reset role;

-- As B.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.category_rules where id = 'ab000000-0000-0000-0000-000000000003'), 1,
  'B sees the household''s shared rule');
select extensions.is(
  (select count(*)::int from public.category_rules where id = 'ab000000-0000-0000-0000-000000000001'), 0,
  'B does not see A''s personal rule');
select extensions.lives_ok(
  $$update public.category_rules set keyword = 'Tesco Express' where id = 'ab000000-0000-0000-0000-000000000003'$$,
  'B edits the shared rule');
select extensions.ok(
  (select version = 2 and updated_by = '22222222-2222-2222-2222-222222222222'
     from public.category_rules where id = 'ab000000-0000-0000-0000-000000000003'),
  'shared edit bumps version and stamps B');
do $$
declare n integer;
begin
  update public.category_rules set keyword = 'x' where id = 'ab000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count;
  perform set_config('pgtap.upd', n::text, true);
end $$;
select extensions.is(current_setting('pgtap.upd')::int, 0, 'B updating A''s personal rule affects 0 rows');
reset role;
select extensions.is(
  (select keyword from public.category_rules where id = 'ab000000-0000-0000-0000-000000000001'), 'Gym',
  'A''s personal rule is unchanged');

-- As C.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.category_rules), 0, 'C sees no rules');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_builtin_key)
    values ('ab000000-0000-0000-0000-000000000004', 'shared', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Evil', 'evil', 'Dining')$$,
  '42501', null, 'C cannot insert a shared rule into A''s household');
reset role;

-- Grants, as A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.category_rules set scope = 'shared' where id = 'ab000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'scope is not updatable');
select extensions.throws_ok(
  $$update public.category_rules set owner_id = '22222222-2222-2222-2222-222222222222' where id = 'ab000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'owner_id is not updatable');
select extensions.throws_ok(
  $$update public.category_rules set household_id = null where id = 'ab000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'household_id is not updatable');
select extensions.throws_ok(
  $$delete from public.category_rules$$, '42501', null, 'authenticated cannot delete');

-- Shape and bounds.
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id, target_name)
    values ('ab000000-0000-0000-0000-000000000005', 'personal', 'Shape1', 'shape1', 'c0000000-0000-0000-0000-0000000000a1', 'A stuff')$$,
  '23514', null, 'a personal rule cannot carry target_name');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_builtin_key, target_name)
    values ('ab000000-0000-0000-0000-000000000006', 'shared', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Shape2', 'shape2', 'Dining', 'Eating')$$,
  '23514', null, 'a shared rule cannot carry both targets');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, household_id, keyword, keyword_norm)
    values ('ab000000-0000-0000-0000-000000000007', 'shared', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Shape3', 'shape3')$$,
  '23514', null, 'a shared rule needs a target');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, category_id, target_builtin_key)
    values ('ab000000-0000-0000-0000-000000000008', 'shared', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Shape4', 'shape4', 'c0000000-0000-0000-0000-0000000000a1', 'Dining')$$,
  '23514', null, 'a shared rule cannot carry category_id');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
    values ('ab000000-0000-0000-0000-000000000009', 'personal', repeat('k', 61), 'long', 'c0000000-0000-0000-0000-0000000000a1')$$,
  '23514', null, 'a 61-character keyword is rejected');
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
    values ('ab000000-0000-0000-0000-00000000000a', 'personal', '   ', 'x', 'c0000000-0000-0000-0000-0000000000a1')$$,
  '23514', null, 'a blank keyword is rejected');

-- Uniqueness among live personal rules; soft delete frees the keyword.
select extensions.throws_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
    values ('ab000000-0000-0000-0000-00000000000b', 'personal', 'GYM', 'gym', 'c0000000-0000-0000-0000-0000000000a1')$$,
  '23505', null, 'a second live personal rule with the same keyword_norm is rejected');
select extensions.lives_ok(
  $$update public.category_rules set deleted_at = now() where id = 'ab000000-0000-0000-0000-000000000001'$$,
  'soft delete works');
select extensions.lives_ok(
  $$insert into public.category_rules (id, scope, keyword, keyword_norm, category_id)
    values ('ab000000-0000-0000-0000-00000000000c', 'personal', 'GYM', 'gym', 'c0000000-0000-0000-0000-0000000000a1')$$,
  'the keyword can be re-used after the first rule is soft-deleted');
reset role;

-- anon.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select * from public.category_rules$$, '42501', null, 'anon cannot select');
reset role;

-- Privileged writer cannot move scope, owner or household.
update public.category_rules
   set household_id = (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
       scope = 'personal', owner_id = '33333333-3333-3333-3333-333333333333'
 where id = 'ab000000-0000-0000-0000-000000000003';
select extensions.ok(
  (select scope = 'shared' and owner_id is null
      and household_id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')
     from public.category_rules where id = 'ab000000-0000-0000-0000-000000000003'),
  'guard trigger pins scope, owner_id and household_id for a privileged writer');

select * from extensions.finish();
rollback;
