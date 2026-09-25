-- pgTAP: WR-B02 proof that a custom-currency leg keeps the open.er-api
-- attribution of its reference rate (MON-12, D-13).
--
-- per_eur_rate() used to label every custom leg 'custom', discarding the
-- reference rate's source, so a custom currency referencing a rate that
-- only open.er-api carries was stamped 'custom' and the mandated
-- "Rates By Exchange Rate API" attribution was never shown.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(4);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'CHF', 0.93, '2026-09-21', 'open-er-api');   -- only the fallback carries CHF

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Wallet', 'cash', 'USD', 0);

-- A custom currency referencing the open.er-api-only CHF, and one
-- referencing the Frankfurter USD.
insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
values
  ('c1111111-1111-1111-1111-111111111111', 'CHP', 'C', 0, 'CHF', 2, '2026-09-20'),
  ('c2111111-1111-1111-1111-111111111111', 'USP', 'U', 0, 'USD', 2, '2026-09-20');

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values
  ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 10, 'CHP', '2026-09-22', 'UTC'),
  ('b2111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 10, 'USP', '2026-09-22', 'UTC');
reset role;

select extensions.is(
  (select rate_source from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  'open-er-api',
  'a custom leg whose reference rate came from open.er-api is attributed open-er-api'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  false,
  'the open.er-api-referenced custom leg is still stamped exact'
);
select extensions.is(
  (select rate_source from public.transactions where id = 'b2111111-1111-1111-1111-111111111111'),
  'custom',
  'a custom leg whose reference rate came from Frankfurter is still attributed custom'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b2111111-1111-1111-1111-111111111111')::int,
  2000,
  'the Frankfurter-referenced custom leg converts as before (10 USP x 2 USD = 20.00 USD)'
);

select * from extensions.finish();
rollback;
