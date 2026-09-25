-- pgTAP: CR-B03 proof that the SECURITY DEFINER currency helpers cannot be
-- used to read another user's custom currency.
--
-- is_known_currency(code, user), currency_exponent(code, owner) and
-- per_eur_rate(code, on, owner, ...) take an arbitrary owner UUID and run
-- as the definer, so any client allowed to call them could read past the
-- owner-only RLS on custom_currencies (D-07). Only the triggers call them,
-- and they do so as the definer. EXECUTE is revoked from every client role;
-- service_role keeps it.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(12);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

-- A (the victim) declares a private custom currency.
insert into public.custom_currencies (id, owner_id, code, symbol, decimals, reference_currency, unit_value, as_of)
values ('c1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'PTS', 'P', 0, 'USD', 0.01, '2026-09-20');

-- 1. B (another signed-in user who knows A's UUID) cannot call any helper.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select extensions.throws_ok(
  $$select * from public.per_eur_rate('PTS', '2026-09-24', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'B cannot read A''s custom valuation through per_eur_rate'
);
select extensions.throws_ok(
  $$select public.is_known_currency('PTS', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'B cannot probe A''s custom codes through is_known_currency'
);
select extensions.throws_ok(
  $$select public.currency_exponent('PTS', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'B cannot read A''s declared decimals through currency_exponent'
);
reset role;

-- 2. anon cannot call them either.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select * from public.per_eur_rate('PTS', '2026-09-24', '11111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'anon cannot call per_eur_rate'
);
reset role;

-- 3. Privilege catalogue: no client role holds EXECUTE; service_role does.
select extensions.ok(
  not has_function_privilege('authenticated', 'public.per_eur_rate(text, date, uuid, boolean)', 'execute'),
  'authenticated has no EXECUTE on per_eur_rate'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.is_known_currency(text, uuid)', 'execute'),
  'authenticated has no EXECUTE on is_known_currency'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.currency_exponent(text, uuid)', 'execute'),
  'authenticated has no EXECUTE on currency_exponent'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.currency_exponent(text, uuid)', 'execute'),
  'anon has no EXECUTE on currency_exponent'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.per_eur_rate(text, date, uuid, boolean)', 'execute'),
  'service_role keeps EXECUTE on per_eur_rate'
);

-- 4. The triggers that rely on these helpers still work for the owner:
-- A can log a transaction in their own custom currency.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select public.user_household_ids() limit 1), 'Points', 'other', 'PTS', 0)$$,
  'A can still open an account in their own custom currency (guard trigger runs as definer)'
);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b1111111-1111-1111-1111-111111111111', (select public.user_household_ids() limit 1), 'a1111111-1111-1111-1111-111111111111', 500, 'PTS', '2026-09-22', 'UTC')$$,
  'A can still log a transaction in their own custom currency (stamp trigger runs as definer)'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  500,
  'the stamp trigger still converts A''s custom currency (500 PTS at 0.01 USD = 5.00 USD)'
);
reset role;

select * from extensions.finish();
rollback;
