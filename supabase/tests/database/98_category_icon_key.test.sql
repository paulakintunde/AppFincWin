-- pgTAP: 06.2-17 (D-07) categories.icon_key. Migration 20261115000100_category_icon_key.sql.
-- A custom category may carry an icon name from FincWin's own set; the server only allows a short camelCase name
-- (no emoji, spaces, upper-case first letter or long free text). RLS is unchanged: owner-only writes.
-- Runs in CI with `supabase test db`; not run locally (no Docker on the build machine).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

select extensions.has_column('public', 'categories', 'icon_key', 'categories has an icon_key column');
select extensions.col_is_null('public', 'categories', 'icon_key', 'icon_key is nullable (null draws the letter tile)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. A valid name inserts (insert grant covers icon_key).
select extensions.lives_ok(
  $$insert into public.categories (id, name, color_key, icon_key)
    values ('c9811111-1111-1111-1111-111111111111', 'Eating out', 'plum', 'dining')$$,
  'A can insert a custom category with icon_key dining'
);
select extensions.is(
  (select icon_key from public.categories where id = 'c9811111-1111-1111-1111-111111111111'),
  'dining', 'the icon_key reads back');

-- 2. The shape check rejects emoji, spaces, over-long values and an upper-case first letter.
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key, icon_key)
    values ('c9822222-1111-1111-1111-111111111111', 'Emoji', 'plum', 'pizza🍕')$$,
  '23514', null, 'an emoji icon_key violates the shape check');
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key, icon_key)
    values ('c9833333-1111-1111-1111-111111111111', 'Space', 'plum', 'my icon')$$,
  '23514', null, 'an icon_key with a space violates the shape check');
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key, icon_key)
    values ('c9844444-1111-1111-1111-111111111111', 'Long', 'plum', 'a' || repeat('b', 32))$$,
  '23514', null, 'a 33-character icon_key violates the shape check');
select extensions.throws_ok(
  $$insert into public.categories (id, name, color_key, icon_key)
    values ('c9855555-1111-1111-1111-111111111111', 'Upper', 'plum', 'Dining')$$,
  '23514', null, 'an icon_key starting upper-case violates the shape check');

-- 3. The owner can change and clear it (update grant covers icon_key).
select extensions.lives_ok(
  $$update public.categories set icon_key = 'shoppingBag' where id = 'c9811111-1111-1111-1111-111111111111'$$,
  'A can change the icon_key of their own category');
select extensions.lives_ok(
  $$update public.categories set icon_key = null where id = 'c9811111-1111-1111-1111-111111111111'$$,
  'A can clear the icon_key back to the letter tile');

-- 4. Undo replays through apply_patches: categories.icon_key is allowlisted and typed.
select extensions.is(
  (public.apply_patches(('[{"entity":"categories","id":"c9811111-1111-1111-1111-111111111111","expectedVersion":'
    || (select version from public.categories where id = 'c9811111-1111-1111-1111-111111111111')
    || ',"patch":{"icon_key":"dining"}}]')::jsonb)) ->> 'status',
  'applied', 'icon_key patches through apply_patches');
select extensions.is(
  (select icon_key from public.categories where id = 'c9811111-1111-1111-1111-111111111111'),
  'dining', 'the apply_patches icon_key is stored');

-- 5. RLS unchanged: another user cannot change A's icon_key (0 rows, no error).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.results_eq(
  $$with u as (
      update public.categories set icon_key = 'home' where id = 'c9811111-1111-1111-1111-111111111111' returning 1
    ) select count(*)::int from u$$,
  $$values (0)$$,
  'B cannot change A''s icon_key (RLS: owner-only)');

select * from extensions.finish();
rollback;
