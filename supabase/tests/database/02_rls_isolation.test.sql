-- pgTAP: FND-12 cross-household isolation proof.
--
-- RLS is the only authorisation boundary between one household's money
-- and another's. This proves, against two real users (A and B) created
-- through the same signup trigger as production, that A cannot read or
-- write any of B's rows across profiles, households and household_members,
-- that A's own writes are limited to the six granted profile columns, and
-- that anon (pre-sign-in) cannot read any of the three tables at all.
--
-- Note: anon has no table-level privilege on these three tables (this
-- migration's `revoke all ... from anon`), so an anon SELECT fails with a
-- permission-denied error (42501) before RLS is even evaluated -- a
-- stronger guarantee than "0 rows returned", and what is asserted below.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

-- Impersonate A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (select id from public.profiles)::text,
  '11111111-1111-1111-1111-111111111111',
  'A sees only own profile row; B''s profile is invisible'
);
select extensions.is(
  (select owner_id from public.households)::text,
  '11111111-1111-1111-1111-111111111111',
  'A sees only own household; B''s household is invisible'
);
select extensions.is(
  (select user_id from public.household_members)::text,
  '11111111-1111-1111-1111-111111111111',
  'A sees only own membership row; B''s membership is invisible'
);
select extensions.is(
  (select role from public.household_members), 'owner', 'A''s visible membership has role owner'
);
select extensions.is(
  (select weight from public.household_members)::int, 1, 'A''s visible membership has weight 1'
);

select extensions.results_eq(
  $$with u as (update public.profiles set accent = 'navy' where id = '22222222-2222-2222-2222-222222222222' returning 1) select count(*)::int from u$$,
  $$values (0)$$,
  'A updating B''s profile affects 0 rows'
);

select extensions.throws_ok(
  $$insert into public.household_members (household_id, user_id) select id, '11111111-1111-1111-1111-111111111111' from public.households limit 1$$,
  '42501', null,
  'A cannot insert into household_members'
);
select extensions.throws_ok(
  $$update public.households set owner_id = owner_id where id in (select public.user_household_ids())$$,
  '42501', null,
  'A cannot update households'
);
select extensions.throws_ok(
  $$update public.profiles set version = 99 where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update profiles.version (column not granted)'
);

update public.profiles set accent = 'navy' where id = (select auth.uid());
select extensions.is(
  (select accent from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'navy',
  'A can update own accent'
);
select extensions.is(
  (select version from public.profiles where id = '11111111-1111-1111-1111-111111111111')::int,
  2,
  'own-row update bumps version via the shared trigger'
);

select extensions.throws_ok(
  $$update public.profiles set accent = 'purple' where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'an invalid accent value violates the check constraint'
);

reset role;

-- Impersonate anon (pre-sign-in).
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.households$$, '42501', null, 'anon cannot read households'
);
select extensions.throws_ok(
  $$select count(*) from public.household_members$$, '42501', null, 'anon cannot read household_members'
);
select extensions.throws_ok(
  $$select count(*) from public.profiles$$, '42501', null, 'anon cannot read profiles'
);
reset role;

select * from extensions.finish();
rollback;
