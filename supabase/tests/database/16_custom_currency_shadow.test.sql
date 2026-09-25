-- pgTAP: WR-B06 proof that a custom currency can neither shadow an ISO
-- code nor reference itself.
--
-- The shadow check used to compare a new custom code only against the
-- quotes fx_rates held at that moment, so on a young database even USD
-- could be registered as a custom code. Once a custom code later appeared
-- in fx_rates (an open.er-api fallback quote, a new Frankfurter currency),
-- the update path let reference_currency be set to the custom code itself,
-- and per_eur_rate() then recursed until "stack depth limit exceeded" --
-- failing every insert or update that touched that currency.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

-- A young database: only GBP has been synced so far.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2026-09-21', 'frankfurter-v2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. A real ISO 4217 code is rejected even before fx_rates carries it.
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c1111111-1111-1111-1111-111111111111', 'USD', '$', 2, 'GBP', 1, '2026-09-20')$$,
  '23514', null,
  'custom code USD is rejected as an ISO 4217 code even when fx_rates does not carry USD yet'
);
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c2111111-1111-1111-1111-111111111111', 'XAU', 'Au', 2, 'GBP', 1, '2026-09-20')$$,
  '23514', null,
  'custom code XAU (an ISO 4217 code with no fx_rates row) is rejected'
);

-- 2. A genuinely custom code is still accepted.
select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c3111111-1111-1111-1111-111111111111', 'ZZQ', 'Z', 0, 'GBP', 2, '2026-09-20')$$,
  'a non-ISO custom code is accepted'
);
reset role;

-- 3. Later the same code appears in fx_rates (e.g. an open.er-api quote).
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'ZZQ', 3, '2026-09-21', 'open-er-api');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.custom_currencies set reference_currency = 'ZZQ' where id = 'c3111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'a custom currency cannot be pointed at its own code'
);

-- 4. A second custom currency referencing that now-ISO code resolves the
-- reference as ISO, never through the user's own custom definition.
select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c4111111-1111-1111-1111-111111111111', 'ZZR', 'R', 0, 'ZZQ', 1, '2026-09-20')$$,
  'a custom currency may reference a code fx_rates now carries'
);
reset role;

select extensions.is(
  (select rate::text from public.per_eur_rate('ZZR', '2026-09-22', '11111111-1111-1111-1111-111111111111')),
  '3.0000000000',
  'the reference is resolved from fx_rates (3 per EUR), not recursively through the custom ZZQ (0.425 per EUR)'
);

select * from extensions.finish();
rollback;
