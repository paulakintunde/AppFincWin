-- pgTAP: WR-B07 proof that a custom currency's per-EUR rate can neither
-- round to zero nor overflow numeric(24,10).
--
-- custom_per_eur() quantises reference_per_eur / unit_value to 10 decimal
-- places. A very high-value unit used to round to 0, so convert_minor()
-- raised 22012 and every insert in that currency was rejected; a tiny unit
-- against a high per-EUR reference overflowed with 22003 at stamp time.
-- custom_per_eur() now raises 22003 for a zero result, exactly like the TS
-- mirror's RangeError, and a custom currency whose rate would be unusable
-- against its reference's latest rate is rejected when it is declared or
-- revalued (23514), not later when a transaction first uses it.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1734, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'VND', 30500, '2026-09-21', 'frankfurter-v2');

-- 1. The pure function.
select extensions.throws_ok(
  $$select public.custom_per_eur(0.0001, 99999999999999)$$,
  '22003', null,
  'custom_per_eur raises 22003 when the rate rounds to zero'
);
select extensions.throws_ok(
  $$select public.custom_per_eur(99999, 0.0000000001)$$,
  '22003', null,
  'custom_per_eur raises 22003 when the rate overflows numeric(24,10)'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 2. Declaring a unit whose rate against its reference would be zero or
-- overflow is rejected up front.
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c1111111-1111-1111-1111-111111111111', 'BIG', 'B', 0, 'USD', 99999999999999, '2026-09-20')$$,
  '23514', null,
  'a custom unit so valuable its per-EUR rate rounds to zero is rejected at declaration'
);
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c2111111-1111-1111-1111-111111111111', 'TNY', 'T', 0, 'VND', 0.0000000001, '2026-09-20')$$,
  '23514', null,
  'a custom unit so small its per-EUR rate overflows is rejected at declaration'
);

-- 3. A high-value but representable unit (1 GOLD = 60,000 USD) is fine,
-- and revaluing it out of range is rejected.
select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c3111111-1111-1111-1111-111111111111', 'GOLD', 'G', 2, 'USD', 60000, '2026-09-20')$$,
  'a high-value custom unit with a representable rate is accepted'
);
select extensions.throws_ok(
  $$update public.custom_currencies set unit_value = 99999999999999 where id = 'c3111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'revaluing a custom unit so its rate rounds to zero is rejected'
);
reset role;

select * from extensions.finish();
rollback;
