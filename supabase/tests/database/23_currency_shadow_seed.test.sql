-- pgTAP: RD-07 proof that the fx-sync currency-metadata feed (the
-- `currencies` table, populated by fx-sync/currencies.ts) seeds the
-- custom-currency shadow check, on top of the static is_iso4217_code floor
-- from WR-B06.
--
-- A code Frankfurter starts publishing metadata for is reserved the moment
-- it appears in `currencies`, even before any fx_rates quote exists for it
-- -- so the operator does not have to hand-maintain the static list for
-- every new currency. A custom currency created *before* its code was ever
-- synced keeps working: the shadow check only runs on insert.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1, '2026-09-21', 'frankfurter-v2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. A genuinely custom code is accepted before fx-sync has ever seen it.
select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c1111111-1111-1111-1111-111111111111', 'ZZQ', 'Z', 0, 'USD', 1, '2026-09-20')$$,
  'a code not yet in currencies or fx_rates is accepted (RD-07: not reserved until seen)'
);
reset role;

-- 2. fx-sync's daily currency-metadata sync now reports ZZQ (simulating a
-- new Frankfurter currency landing tomorrow -- the sync always upserts
-- into public.currencies, never into fx_rates directly for metadata-only
-- codes).
insert into public.currencies (code, name, symbol) values ('ZZQ', 'Zed Zed Quid', 'Z');

-- 3. The already-registered custom currency keeps working: the shadow
-- check never runs on UPDATE, and per_eur_rate() does not consult
-- currencies at all.
select extensions.is(
  (select rate::text from public.per_eur_rate('ZZQ', '2026-09-22', '11111111-1111-1111-1111-111111111111')),
  '1.1000000000',
  'an existing custom currency whose code was later synced into currencies keeps resolving'
);

-- 4. A *new* custom currency using the now-synced code is rejected.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c2111111-1111-1111-1111-111111111111', 'ZZQ', 'Z', 0, 'USD', 1, '2026-09-20')$$,
  '23514', null,
  'a code now present in currencies (seeded by fx-sync) is reserved for a new custom currency'
);

-- 5. A code fx-sync has never carried at all is still accepted.
select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c3111111-1111-1111-1111-111111111111', 'ZZR', 'R', 0, 'USD', 1, '2026-09-20')$$,
  'a code never seen by fx-sync or fx_rates remains a valid custom code'
);
reset role;

select * from extensions.finish();
rollback;
