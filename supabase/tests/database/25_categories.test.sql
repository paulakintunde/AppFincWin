-- pgTAP: D-33/D-34/D-35/D-36 proof for per-user categories.
--
-- Proves every new auth user gets the 15 seeded categories (13 built-in
-- plus 2 system), seeding is idempotent, categories are owner-isolated,
-- built-ins are renameable while system rows are fully immutable (by
-- grant, by RLS and defensively by guard_category even for a privileged
-- writer), and the colour/name shape checks hold.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

-- 1. A new auth user is seeded with 15 categories, 2 of them system, via
-- the handle_new_user trigger.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

select extensions.is(
  (select count(*) from public.categories where owner_id = '11111111-1111-1111-1111-111111111111')::int,
  15,
  'a new auth user has exactly 15 seeded categories'
);
select extensions.is(
  (select count(*) from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and is_system)::int,
  2,
  'exactly 2 of the 15 are system-owned (Transfer, Settlement)'
);

-- 2. Calling seed_user_categories again is idempotent (RESEARCH.md Pitfall 7).
select public.seed_user_categories('11111111-1111-1111-1111-111111111111');
select extensions.is(
  (select count(*) from public.categories where owner_id = '11111111-1111-1111-1111-111111111111')::int,
  15,
  'calling seed_user_categories again leaves exactly 15 rows'
);

-- 3. A second user, seeded independently; B sees 0 of A's rows.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.categories where owner_id = '11111111-1111-1111-1111-111111111111')::int,
  0,
  'B selects 0 of A''s categories (owner-only RLS, D-33)'
);
reset role;

-- Impersonate A for the rest of the client-side proofs.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 4. A inserts a custom category; version starts at 1.
select extensions.lives_ok(
  $$insert into public.categories (id, name, color_key)
    values ('c1111111-1111-1111-1111-111111111111', 'Pets', 'plum')$$,
  'A can insert a custom category (Pets, plum)'
);
select extensions.is(
  (select version from public.categories where id = 'c1111111-1111-1111-1111-111111111111')::int,
  1,
  'the new custom category starts at version 1'
);

-- 5. is_system is not in the insert grant.
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key, is_system)
    values ('c2111111-1111-1111-1111-111111111111', 'Fake System', 'plum', true)$$,
  '42501', null,
  'A cannot insert is_system = true (not in the insert grant)'
);

-- 6. builtin_key is not in the insert grant.
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key, builtin_key)
    values ('c3111111-1111-1111-1111-111111111111', 'Fake Builtin', 'plum', 'Housing')$$,
  '42501', null,
  'A cannot insert naming builtin_key (not in the insert grant)'
);

-- 7. A renames a built-in (non-system) category; version bumps, updated_by
-- stamps the acting user.
select extensions.lives_ok(
  $$update public.categories set name = 'Food shop'
    where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'$$,
  'A renames built-in Groceries to Food shop'
);
select extensions.is(
  (select version from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries')::int,
  2,
  'renaming Groceries bumps version to 2'
);
select extensions.is(
  (select updated_by from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'renaming Groceries stamps updated_by as A'
);

-- 8. A system row (Transfer) cannot be updated by its owner -- RLS filters
-- it, so the update affects 0 rows rather than erroring.
select extensions.results_eq(
  $$with u as (
      update public.categories set name = 'Hacked'
      where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Transfer'
      returning 1
    ) select count(*)::int from u$$,
  $$values (0)$$,
  'updating the Transfer row affects 0 rows (RLS: not is_system)'
);

-- 9. color_key is constrained to the 7 swatch keys.
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key)
    values ('c4111111-1111-1111-1111-111111111111', 'Bad Color', 'purple')$$,
  '23514', null,
  'color_key ''purple'' violates the swatch-key check'
);

-- 10. name is capped at 60 characters.
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key)
    values ('c5111111-1111-1111-1111-111111111111', repeat('x', 61), 'plum')$$,
  '23514', null,
  'a 61-character name violates the length check'
);

reset role;

-- 11. anon has no access at all.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.categories$$,
  '42501', null,
  'anon cannot select categories'
);
reset role;

-- 12. Defensively, guard_category reverts builtin_key even for a privileged
-- writer (postgres) updating a normal, non-system row.
select extensions.lives_ok(
  $$update public.categories set builtin_key = 'Income'
    where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'$$,
  'a superuser update naming a different builtin_key does not raise'
);
select extensions.is(
  (select builtin_key from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and name = 'Food shop'),
  'Groceries',
  'guard_category reverts builtin_key on update, even for a privileged writer'
);

select * from extensions.finish();
rollback;
