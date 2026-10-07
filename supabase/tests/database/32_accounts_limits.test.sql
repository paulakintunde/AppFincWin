-- pgTAP: D-48/D-49 proof for account overdraft/credit limits.
--
-- Proves the limits are nullable, zero-accepted, bounded, updatable by an
-- owning member, invisible to anon, and that overdrawn/negative balances
-- and a kind change are never rejected as errors (D-49's "state, never an
-- error" principle).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. Limits default to null.
select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Current', 'checking', 'USD', 0)$$,
  'A can insert an account with no limits'
);
select extensions.is(
  (select overdraft_limit from public.accounts where id = 'a1111111-1111-1111-1111-111111111111'),
  null,
  'overdraft_limit defaults to null'
);

-- 1b. Zero is an accepted value for both limits.
select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance, overdraft_limit, credit_limit)
    values ('a2111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Zero Limits', 'checking', 'USD', 0, 0, 0)$$,
  'zero is accepted for both overdraft_limit and credit_limit'
);

-- 2. Bounds: negative overdraft_limit, and credit_limit over the bound.
select extensions.throws_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance, overdraft_limit)
    values ('a3111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Bad', 'checking', 'USD', 0, -1)$$,
  '23514', null,
  'overdraft_limit -1 violates the non-negative check'
);
select extensions.throws_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance, credit_limit)
    values ('a4111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Bad', 'credit', 'USD', 0, 10000000000001)$$,
  '23514', null,
  'credit_limit 10000000000001 violates the upper bound'
);

-- 3. A member can update both limits.
select extensions.lives_ok(
  $$update public.accounts set overdraft_limit = 50000, credit_limit = 200000 where id = 'a1111111-1111-1111-1111-111111111111'$$,
  'A can update overdraft_limit and credit_limit'
);

-- 5. A negative opening balance is accepted -- overdrawn is a state, never
-- an error (D-49).
select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a5111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Overdrawn', 'checking', 'USD', -24000)$$,
  'a negative opening_balance (-24000) is accepted (D-49)'
);

-- 6. Changing kind from checking to credit with overdraft_limit set is
-- accepted -- no check couples a limit to kind.
select extensions.lives_ok(
  $$update public.accounts set kind = 'credit' where id = 'a1111111-1111-1111-1111-111111111111'$$,
  'changing kind to credit with overdraft_limit set is accepted'
);

reset role;

-- 4. anon cannot select accounts at all.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.accounts$$,
  '42501', null,
  'anon cannot select accounts'
);
reset role;

-- 7. B cannot update A's limits (household RLS, unchanged): 0 rows affected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.results_eq(
  $$with u as (
      update public.accounts set overdraft_limit = 999 where id = 'a1111111-1111-1111-1111-111111111111' returning 1
    ) select count(*)::int from u$$,
  $$values (0)$$,
  'B cannot update A''s account limits (0 rows affected)'
);
reset role;

select * from extensions.finish();
rollback;
