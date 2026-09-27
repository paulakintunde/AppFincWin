-- pgTAP: D-42 proof for public.import_profiles.
--
-- Proves a remembered statement-format profile is owner-only (not
-- household-scoped, since one member's confirmed reading must never
-- silently apply to another member's differently-laid-out export), keyed
-- uniquely per (owner, account, layout signature), capped at 2 KB and a
-- jsonb object only, requires the referenced account to be one of the
-- caller's own household's accounts, bumps version on update while
-- layout_signature stays immutable by grant, cascades on account deletion,
-- and is invisible to anon.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

-- Each user's household id, captured as postgres before impersonating
-- (mirrors 05_accounts_transactions.test.sql's `hh` fixture).
create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('aaaaaaa1-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A checking', 'checking', 'USD', 0),
  ('aaaaaaa3-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A cascade target', 'checking', 'USD', 0);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
  values ('bbbbbbb1-2222-2222-2222-222222222222', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'B checking', 'checking', 'USD', 0);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. A inserts a profile for A's own account -> ok, version 1.
select extensions.lives_ok(
  $$insert into public.import_profiles (id, account_id, layout_signature, profile)
    values ('f0000001-1111-1111-1111-111111111111', 'aaaaaaa1-1111-1111-1111-111111111111', 'sig-checking-csv', '{"sign":"positive-is-in","balance":"held"}'::jsonb)$$,
  'A can insert a profile for A''s own account'
);
select extensions.is(
  (select version from public.import_profiles where id = 'f0000001-1111-1111-1111-111111111111')::int,
  1,
  'a fresh profile starts at version 1'
);

-- 2. The same (owner, account, layout_signature) again -> 23505 (unique violation).
select extensions.throws_ok(
  $$insert into public.import_profiles (id, account_id, layout_signature, profile)
    values ('f0000009-1111-1111-1111-111111111111', 'aaaaaaa1-1111-1111-1111-111111111111', 'sig-checking-csv', '{"sign":"positive-is-in"}'::jsonb)$$,
  '23505', null,
  'the same (owner, account, layout_signature) triple twice violates the unique constraint'
);

-- 3. B sees none of A's profiles (owner-only RLS).
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.import_profiles),
  0,
  'B sees no profiles at all (owner-only RLS)'
);

-- 4. B inserting a profile for A's account -> 42501 (account not in B's households).
select extensions.throws_ok(
  $$insert into public.import_profiles (id, account_id, layout_signature, profile)
    values ('f0000003-1111-1111-1111-111111111111', 'aaaaaaa1-1111-1111-1111-111111111111', 'sig-x', '{"sign":"positive-is-in"}'::jsonb)$$,
  '42501', null,
  'B cannot insert a profile referencing A''s account'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 5. A inserting for an account outside A's households -> 42501.
select extensions.throws_ok(
  $$insert into public.import_profiles (id, account_id, layout_signature, profile)
    values ('f0000004-1111-1111-1111-111111111111', 'bbbbbbb1-2222-2222-2222-222222222222', 'sig-y', '{"sign":"positive-is-in"}'::jsonb)$$,
  '42501', null,
  'A cannot insert a profile referencing B''s account'
);

-- 6. A profile over 2 KB -> 23514.
select extensions.throws_ok(
  $$insert into public.import_profiles (id, account_id, layout_signature, profile)
    values ('f0000005-1111-1111-1111-111111111111', 'aaaaaaa1-1111-1111-1111-111111111111', 'sig-oversize',
      jsonb_build_object('padding', repeat('x', 3000)))$$,
  '23514', null,
  'a profile over 2 KB is rejected'
);

-- 7. A JSON array profile (not an object) -> 23514.
select extensions.throws_ok(
  $$insert into public.import_profiles (id, account_id, layout_signature, profile)
    values ('f0000006-1111-1111-1111-111111111111', 'aaaaaaa1-1111-1111-1111-111111111111', 'sig-array', '["a","b"]'::jsonb)$$,
  '23514', null,
  'a jsonb array profile is rejected -- object only'
);

-- 8. A 501-character layout_signature -> 23514.
select extensions.throws_ok(
  format(
    $$insert into public.import_profiles (id, account_id, layout_signature, profile)
      values ('f0000007-1111-1111-1111-111111111111', 'aaaaaaa1-1111-1111-1111-111111111111', %L, '{"sign":"positive-is-in"}'::jsonb)$$,
    repeat('a', 501)
  ),
  '23514', null,
  'a 501-character layout_signature is rejected'
);

-- 9. A updates profile -> version bumps to 2; updating layout_signature is
-- refused by grant (42501), since it is deliberately excluded (the layout
-- signature identifies the row, the profile is what gets corrected).
select extensions.lives_ok(
  $$update public.import_profiles set profile = '{"sign":"negative-is-in","balance":"owed"}'::jsonb where id = 'f0000001-1111-1111-1111-111111111111'$$,
  'A can update the profile column of A''s own row'
);
select extensions.is(
  (select version from public.import_profiles where id = 'f0000001-1111-1111-1111-111111111111')::int,
  2,
  'updating profile bumps version to 2'
);
select extensions.throws_ok(
  $$update public.import_profiles set layout_signature = 'sig-changed' where id = 'f0000001-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update layout_signature (not in the update grant)'
);

-- 10. Deleting the account (as postgres) cascades the profile.
insert into public.import_profiles (id, account_id, layout_signature, profile)
  values ('f0000002-1111-1111-1111-111111111111', 'aaaaaaa3-1111-1111-1111-111111111111', 'sig-cascade', '{"sign":"positive-is-in"}'::jsonb);
reset role;
delete from public.accounts where id = 'aaaaaaa3-1111-1111-1111-111111111111';
select extensions.is(
  (select count(*)::int from public.import_profiles where id = 'f0000002-1111-1111-1111-111111111111'),
  0,
  'deleting the account cascades the import profile'
);

-- 11. anon cannot select.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.import_profiles$$,
  '42501', null,
  'anon cannot read import_profiles'
);
reset role;

select * from extensions.finish();
rollback;
