-- pgTAP: 05.3-81 (UAT step 75 item 2, 05.1 D-19) -- decide_settings.custom_options, migration 20261031001000.
-- Owner-private own item types and purposes: RLS, size and shape check, apply_patches (undo path), erasure.
--
-- Needs 20261016000100 and 20261028000100 .. 20261031001000.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
create temp table a_hh as select id from hh where owner_id = '11111111-1111-1111-1111-111111111111';
grant select on hh, a_hh to authenticated;

-- B joins A's household as a member.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from a_hh), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- A pre-existing settings row for A.
insert into public.decide_settings (user_id, currency) values ('11111111-1111-1111-1111-111111111111', 'USD');
create temp table sid as select id from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111';
grant select on sid to authenticated;

select extensions.has_column('public', 'decide_settings', 'custom_options', 'custom_options exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- A (owner) writes and reads back.
select extensions.lives_ok($$update public.decide_settings set custom_options = '{"v":1,"itemTypes":[],"purposes":[{"id":"c7900000-0000-0000-0000-000000000001","name":"For the kids","deletedAt":null}]}'::jsonb where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'the owner writes custom_options');
select extensions.is((select custom_options -> 'purposes' -> 0 ->> 'name' from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  'For the kids', 'the owner reads it back');

-- Shape and size.
select extensions.throws_ok($$update public.decide_settings set custom_options = '[]'::jsonb where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'a JSON array is refused');
select extensions.throws_ok($$update public.decide_settings set custom_options = jsonb_build_object('k', (select string_agg(md5(i::text), '') from generate_series(1, 700) i)) where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'an object over 16384 bytes is refused');

-- apply_patches (the undo path): allowlisted, typed jsonb; an unknown column still fails.
select extensions.is((public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', 'decide_settings', 'id', (select id from sid),
    'expectedVersion', (select version from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
    'patch', jsonb_build_object('custom_options', '{"v":1,"itemTypes":[],"purposes":[]}')))) ->> 'status'),
  'applied', 'apply_patches accepts custom_options');
select extensions.is((select custom_options from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '{"v":1,"itemTypes":[],"purposes":[]}'::jsonb, 'custom_options landed as jsonb through apply_patches');
select extensions.throws_ok($$select public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', 'decide_settings', 'id', (select id from sid),
    'expectedVersion', (select version from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
    'patch', jsonb_build_object('no_such_column', '1'))))$$,
  '22023', null, 'an unknown column is still refused');

-- B (another member of A's household) sees nothing and changes nothing.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'another household member reads no settings row of A');
with u as (update public.decide_settings set custom_options = '{"v":1}'::jsonb where user_id = '11111111-1111-1111-1111-111111111111' returning 1)
select extensions.is((select count(*)::int from u), 0, 'another household member updates 0 rows of A');

-- Erasure: deleting A removes A's settings row.
select set_config('request.jwt.claims', '', true);
reset role;
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select extensions.is((select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'deleting the account erases the settings row');

select * from extensions.finish();
rollback;
