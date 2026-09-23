-- pgTAP: ACC-04 provisioning proof.
--
-- Inserting an auth.users row must create exactly one profile, one
-- household (owned by that user) and one owner membership (weight 1),
-- entirely from the on_auth_user_created trigger -- no client step. The
-- security-definer functions backing this must be locked down: pinned
-- search_path, execute revoked from every client role except the one
-- explicit grant to authenticated on user_household_ids(). Every RLS
-- policy on the three tables this migration creates must use the
-- (select auth.uid()) initPlan form or the user_household_ids() helper
-- (Pitfall 4), and household_members must be indexed on user_id.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(16);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values (
  '11111111-1111-1111-1111-111111111111',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'a@test.local',
  '{"full_name":"Alice Test"}',
  now(), now()
);

-- Provisioning: exactly one row in each table, correct shape.
select extensions.is(
  (select count(*) from public.profiles where id = '11111111-1111-1111-1111-111111111111')::int,
  1,
  'signup creates exactly one profile'
);
select extensions.is(
  (select count(*) from public.households where owner_id = '11111111-1111-1111-1111-111111111111')::int,
  1,
  'signup creates exactly one household owned by the new user'
);
select extensions.is(
  (select count(*) from public.household_members where user_id = '11111111-1111-1111-1111-111111111111')::int,
  1,
  'signup creates exactly one membership row'
);
select extensions.is(
  (select role from public.household_members where user_id = '11111111-1111-1111-1111-111111111111'),
  'owner',
  'the new membership has role owner'
);
select extensions.is(
  (select weight from public.household_members where user_id = '11111111-1111-1111-1111-111111111111')::int,
  1,
  'the new membership has weight 1'
);
select extensions.is(
  (select full_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice Test',
  'full_name is copied from raw_user_meta_data.full_name'
);

-- Security-definer hardening: prosecdef + pinned search_path.
select extensions.ok(
  (select prosecdef from pg_proc where proname = 'handle_new_user'),
  'handle_new_user is security definer'
);
select extensions.ok(
  (select proconfig[1] from pg_proc where proname = 'handle_new_user') = 'search_path=""',
  'handle_new_user pins search_path to an empty string'
);
select extensions.ok(
  (select prosecdef from pg_proc where proname = 'user_household_ids'),
  'user_household_ids is security definer'
);
select extensions.ok(
  (select proconfig[1] from pg_proc where proname = 'user_household_ids') = 'search_path=""',
  'user_household_ids pins search_path to an empty string'
);

-- Execute privileges: no client role may run handle_new_user; only
-- authenticated may run user_household_ids.
select extensions.ok(
  not has_function_privilege('anon', 'public.handle_new_user()', 'execute'),
  'anon cannot execute handle_new_user'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute'),
  'authenticated cannot execute handle_new_user'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.user_household_ids()', 'execute'),
  'anon cannot execute user_household_ids'
);
select extensions.ok(
  has_function_privilege('authenticated', 'public.user_household_ids()', 'execute'),
  'authenticated can execute user_household_ids'
);

-- Index required by Pitfall 4.
select extensions.has_index(
  'public', 'household_members', 'household_members_user_id_idx',
  'household_members_user_id_idx exists'
);

-- Policy-shape check: every policy on the three tables must reference
-- (select auth.uid()) or the user_household_ids() helper. Printed once
-- during development against `select tablename, policyname, qual from
-- pg_policies where schemaname = 'public'` to confirm how Postgres
-- renders the wrapped call -- it comes back as
-- `( SELECT auth.uid() AS uid)` / `( SELECT user_household_ids() AS
-- user_household_ids)`.
select extensions.is(
  (select count(*)
     from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'households', 'household_members')
      and qual !~ 'SELECT auth\.uid\(\) AS uid|user_household_ids')::int,
  0,
  'every policy on the three tables uses the auth.uid() initPlan form or the user_household_ids helper'
);

select * from extensions.finish();
rollback;
