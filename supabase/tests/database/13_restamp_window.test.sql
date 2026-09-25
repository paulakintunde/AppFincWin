-- pgTAP: WR-B01 proof that a restamp only marks a rate exact when it has
-- good reason to.
--
-- restamp_transaction() used to relax the 7-day exact window for every leg,
-- whatever its age. That included legs the resolve-rate backfill never
-- returned, and future-dated rows, which were then stamped exact from
-- today's rate and never re-rated. Now:
--   * only the quotes the backfill actually stored (p_relax_quotes) may use
--     an earlier row beyond 7 days;
--   * a row dated more than a day ahead of the server date stays pending;
--   * local_date must fall between 1900-01-01 and a year ahead;
--   * fx_restamp_pending() (fx-monitor, daily) re-stamps due pending rows
--     under the normal window, so a future-dated row resolves once its day
--     arrives.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

-- USD has a rate on the transaction's date; JPY's latest earlier rate is a
-- year older. Today's rates exist for both.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1, '2020-01-15', 'frankfurter-v2'),
  ('EUR', 'JPY', 120, '2019-01-10', 'frankfurter-v2'),
  ('EUR', 'USD', 1.15, current_date, 'frankfurter-v2'),
  ('EUR', 'JPY', 170, current_date, 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Wallet', 'cash', 'USD', 0);

-- 1. A JPY row whose JPY leg has no rate within 7 days.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'JPY', '2020-01-15', 'UTC');

-- 2. A planned JPY expense 30 days ahead.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b2111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', -5000, 'JPY', current_date + 30, 'UTC');

-- 3. A JPY row dated today (UTC+14 zones may be a day ahead: still allowed).
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b3111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'JPY', current_date + 1, 'Pacific/Kiritimati');

select extensions.is(
  (select rate_pending from public.transactions where id = 'b3111111-1111-1111-1111-111111111111'),
  false,
  'a row dated tomorrow (a UTC+14 today) is stamped exact from today''s rates'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'b2111111-1111-1111-1111-111111111111'),
  true,
  'a row dated 30 days ahead is pending'
);

-- 4. local_date bounds.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b4111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'USD', current_date + 400, 'UTC')$$,
  '23514', null,
  'a local_date more than a year ahead is rejected'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b5111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'USD', '1899-12-31', 'UTC')$$,
  '23514', null,
  'a local_date before 1900 is rejected'
);
select extensions.throws_ok(
  $$update public.transactions set local_date = current_date + 400 where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'moving a row more than a year ahead is rejected'
);
reset role;

-- 5. A restamp with no backfilled quotes never relaxes the window: the
-- year-old JPY row is not good enough to call the rate exact.
set local role service_role;
select public.restamp_transaction('b1111111-1111-1111-1111-111111111111');
reset role;
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  true,
  'restamp without backfilled quotes leaves a leg with only a year-old rate pending'
);

-- 6. Relaxing only USD (the quote the backfill returned) still leaves the
-- JPY leg pending.
set local role service_role;
select public.restamp_transaction('b1111111-1111-1111-1111-111111111111', array['USD']);
reset role;
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  true,
  'restamp relaxes only the backfilled quotes: the JPY leg the backfill did not return stays pending'
);

-- 7. Once JPY is backfilled too, the row is exact at the backfilled rates.
set local role service_role;
select public.restamp_transaction('b1111111-1111-1111-1111-111111111111', array['JPY', 'USD']);
reset role;
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  false,
  'restamp with both legs backfilled stamps the row exact'
);
select extensions.is(
  (select rate_date from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '2019-01-10'::date,
  'the relaxed JPY leg uses the last publication on or before the date'
);

-- 8. A future-dated row never becomes exact through a restamp, even with
-- every quote relaxed.
set local role service_role;
select public.restamp_transaction('b2111111-1111-1111-1111-111111111111', array['JPY', 'USD']);
reset role;
select extensions.is(
  (select rate_pending from public.transactions where id = 'b2111111-1111-1111-1111-111111111111'),
  true,
  'a future-dated row stays pending after a relaxed restamp'
);

-- 9. fx_restamp_pending() re-stamps due pending rows under the normal
-- window, is service_role-only, and never bumps version.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b6111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'JPY', '2021-06-01', 'UTC');
select extensions.throws_ok(
  $$select public.fx_restamp_pending()$$,
  '42501', null,
  'fx_restamp_pending is not executable by authenticated'
);
reset role;

-- fx-sync later stores the rates for that week.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.2, '2021-05-31', 'frankfurter-v2'),
  ('EUR', 'JPY', 130, '2021-05-31', 'frankfurter-v2');

set local role service_role;
select extensions.ok(
  (select public.fx_restamp_pending()) >= 1,
  'fx_restamp_pending re-stamps the due pending rows'
);
reset role;
select extensions.is(
  (select rate_pending from public.transactions where id = 'b6111111-1111-1111-1111-111111111111'),
  false,
  'a due pending row is resolved once its week''s rates exist'
);
select extensions.is(
  (select version from public.transactions where id = 'b6111111-1111-1111-1111-111111111111')::int,
  1,
  'fx_restamp_pending does not bump version'
);

select * from extensions.finish();
rollback;
