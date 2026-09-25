-- pgTAP: MON-05/MON-07/MON-13/D-02/D-03/D-04/D-05/D-07/D-16/D-17 proof for
-- server-side FX stamping (20260924000500_fx_stamping.sql).
--
-- Proves the stamp_fx_rate trigger stamps an exact rate (with same-date
-- source preference), re-rates on a local_date change, keeps the stored
-- rate on an amount-only edit, marks a date with no nearby history as
-- rate_pending with a provisional value from the nearest later rate,
-- prefers the open.er-api fallback attribution when that is the leg that
-- supplied it, converts a custom currency through its declared reference
-- currency, and that restamp_transaction is service_role-only and does not
-- bump version.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(43);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

-- Seed fx_rates (EUR base). USD carries a same-date duplicate from
-- open-er-api that must lose to frankfurter-v2 (D-02 tie-break).
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'JPY', 180.7, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'USD', 1.15, '2026-09-18', 'frankfurter-v2'),
  ('EUR', 'JPY', 170, '2026-09-18', 'frankfurter-v2'),
  ('EUR', 'CHF', 0.93, '2026-09-21', 'open-er-api'),
  ('EUR', 'USD', 1.20, '2026-09-21', 'open-er-api');

-- A's home currency is USD (set as postgres; also the column default).
update public.profiles set home_currency = 'USD' where id = '11111111-1111-1111-1111-111111111111';

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0)$$,
  'A can insert the Wallet account'
);

-- 1. Exact stamp, same-date frankfurter-v2 preferred over the open-er-api
-- USD duplicate on both legs (D-02).
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 1000, 'JPY', '2026-09-22', 'America/Vancouver')$$,
  'A can insert a JPY transaction'
);
select extensions.is(
  (select rate_source from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  'frankfurter-v2',
  'JPY txn: rate_source is frankfurter-v2 (MON-05)'
);
select extensions.is(
  (select rate_date from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '2026-09-21'::date,
  'JPY txn: rate_date is the publication date (MON-07)'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  635,
  'JPY txn: home_amount matches the engine/money mirror'
);
select extensions.is(
  (select home_currency from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  'USD',
  'JPY txn: home_currency stamped from the author''s profile (D-05)'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  false,
  'JPY txn: rate_pending is false (an exact rate was found)'
);
select extensions.is(
  (select orig_per_eur::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '180.7000000000',
  'JPY txn: orig_per_eur is the JPY-per-EUR rate'
);
select extensions.is(
  (select home_per_eur::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '1.1483000000',
  'JPY txn: home_per_eur prefers frankfurter-v2 over the same-date open-er-api duplicate'
);

-- 2. Cross rate itself matches the engine/money mirror.
select extensions.is(
  (select rate::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '0.0063547316',
  'JPY txn: rate is the display cross rate (home units per 1 original unit)'
);

-- 3. Same-currency: no conversion, rate 1.
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b2111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -1234, 'USD', '2026-09-22', 'America/Vancouver')$$,
  'A can insert a same-currency USD transaction'
);
select extensions.is(
  (select rate_source from public.transactions where id = 'b2111111-1111-1111-1111-111111111111'),
  'same-currency',
  'USD txn: rate_source is same-currency'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b2111111-1111-1111-1111-111111111111')::int,
  -1234,
  'USD txn: home_amount equals original_amount'
);
select extensions.is(
  (select rate from public.transactions where id = 'b2111111-1111-1111-1111-111111111111')::numeric,
  1::numeric,
  'USD txn: rate is 1'
);

-- 4. Editing local_date re-rates the row (D-04).
select extensions.lives_ok(
  $$update public.transactions set local_date = '2026-09-19' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  'A can move the JPY txn to 2026-09-19'
);
select extensions.is(
  (select rate_date from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '2026-09-18'::date,
  'after date edit: rate_date follows the new nearest-earlier publication'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  676,
  'after date edit: home_amount is recomputed at the 09-18 rates'
);
select extensions.is(
  (select version from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  2,
  'after date edit: version bumped to 2 (a real user edit)'
);

-- 5. Amount-only edit keeps the stored rate and only recomputes
-- home_amount (D-04).
select extensions.lives_ok(
  $$update public.transactions set original_amount = 2000 where id = 'b1111111-1111-1111-1111-111111111111'$$,
  'A can change the JPY txn amount'
);
select extensions.is(
  (select rate_date from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '2026-09-18'::date,
  'after amount edit: rate_date is unchanged'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  1353,
  'after amount edit: home_amount is recomputed from the stored rate, not re-looked-up'
);

-- 6. A date with no history nearby is stamped rate_pending with a
-- provisional value from the nearest later rate (D-03, D-17).
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b4111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 2000, 'JPY', '2020-01-15', 'America/Vancouver')$$,
  'A can insert a JPY transaction dated before fx-sync history began'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'b4111111-1111-1111-1111-111111111111'),
  true,
  'pre-history JPY txn: rate_pending is true (provisional, D-17)'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b4111111-1111-1111-1111-111111111111')::int,
  1353,
  'pre-history JPY txn: home_amount uses the nearest later (09-18) rates provisionally'
);
select extensions.is(
  (select rate_source from public.transactions where id = 'b4111111-1111-1111-1111-111111111111'),
  'frankfurter-v2',
  'pre-history JPY txn: rate_source still names the provisional rate''s source'
);

-- 7. The open.er-api fallback source is attributed, never lost (MON-12).
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b5111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 1000, 'CHF', '2026-09-22', 'America/Vancouver')$$,
  'A can insert a CHF transaction'
);
select extensions.is(
  (select rate_source from public.transactions where id = 'b5111111-1111-1111-1111-111111111111'),
  'open-er-api',
  'CHF txn: rate_source is open-er-api, the only source CHF has (MON-12)'
);

-- 8. A custom currency converts through its declared reference currency
-- and unit value, with rate_source 'custom' (D-07).
select extensions.lives_ok(
  $$insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
    values ('c1111111-1111-1111-1111-111111111111', 'GLD', 'G', 0, 'USD', 2.5, '2026-09-20')$$,
  'A can declare the GLD custom currency'
);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b6111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', 10, 'GLD', '2026-09-22', 'America/Vancouver')$$,
  'A can insert a GLD transaction'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b6111111-1111-1111-1111-111111111111')::int,
  2500,
  'GLD txn: home_amount converts through the declared reference currency and unit value'
);
select extensions.is(
  (select rate_source from public.transactions where id = 'b6111111-1111-1111-1111-111111111111'),
  'custom',
  'GLD txn: rate_source is custom'
);
select extensions.is(
  (select rate_date from public.transactions where id = 'b6111111-1111-1111-1111-111111111111'),
  '2026-09-20'::date,
  'GLD txn: rate_date is the earlier of the reference rate''s date and the custom currency''s as_of'
);

-- 9. restamp_transaction is service_role only (T-01-05-02).
select extensions.throws_ok(
  $$select public.restamp_transaction('b4111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'A cannot call restamp_transaction'
);

-- 10. A service-role restamp after backfill: accepts a rate older than 7
-- days, does not bump version (D-18 groundwork).
reset role;
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1, '2020-01-15', 'frankfurter-v2'),
  ('EUR', 'JPY', 130, '2020-01-15', 'frankfurter-v2');

set local role service_role;
select extensions.lives_ok(
  $$select public.restamp_transaction('b4111111-1111-1111-1111-111111111111', array['JPY', 'USD'])$$,
  'service_role can call restamp_transaction'
);
reset role;

select extensions.is(
  (select rate_pending from public.transactions where id = 'b4111111-1111-1111-1111-111111111111'),
  false,
  'after restamp: rate_pending is false'
);
select extensions.is(
  (select rate_date from public.transactions where id = 'b4111111-1111-1111-1111-111111111111'),
  '2020-01-15'::date,
  'after restamp: rate_date is the backfilled date'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b4111111-1111-1111-1111-111111111111')::int,
  1692,
  'after restamp: home_amount uses the backfilled rates'
);
select extensions.is(
  (select version from public.transactions where id = 'b4111111-1111-1111-1111-111111111111')::int,
  1,
  'after restamp: version is unchanged -- a system restamp is not a user edit'
);

-- 11. A currency the picker does not offer can never be stamped (guard
-- from 20260924000400_transactions.sql, reiterated here since it is the
-- guarantee stamp_fx_rate's rate lookups rely on).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b7111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -50, 'ZZZ', '2026-09-22', 'America/Vancouver')$$,
  '23514', null,
  'unknown currency ZZZ is rejected before it can reach stamp_fx_rate'
);
reset role;

-- 12. stamp_fx_rate and restamp_transaction are hardened the same way
-- every other privileged function in this codebase is.
select extensions.ok(
  (select prosecdef from pg_proc where proname = 'stamp_fx_rate'),
  'stamp_fx_rate is security definer'
);
select extensions.ok(
  (select proconfig[1] from pg_proc where proname = 'stamp_fx_rate') = 'search_path=""',
  'stamp_fx_rate pins search_path to an empty string'
);
select extensions.ok(
  (select prosecdef from pg_proc where proname = 'restamp_transaction'),
  'restamp_transaction is security definer'
);
select extensions.ok(
  (select proconfig[1] from pg_proc where proname = 'restamp_transaction') = 'search_path=""',
  'restamp_transaction pins search_path to an empty string'
);

select * from extensions.finish();
rollback;
