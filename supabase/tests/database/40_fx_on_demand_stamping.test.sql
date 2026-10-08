-- pgTAP: migration 20261007000400_fx_on_demand_stamping (decision
-- 02-DECISION-fx-on-demand.md items 1, 3, 4, 6).
--
-- Exact now means: a stored rate dated on the line's own local_date, or an
-- earlier stored rate that a recorded on-demand lookup (fx_rate_lookups)
-- says is that date's publication. Failed fetches back off per reason
-- (fx_rate_fetch_failures), and is_iso_currency accepts every active ISO
-- 4217 code with no stored rate.
--
-- Each case uses its own month so fx_rates seeded for one case cannot be
-- the "nearest earlier row" of another. Home currency is USD (default); the
-- account is GBP, so a line has a GBP leg and a USD leg.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(40);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

select extensions.has_table('public', 'fx_rate_lookups', 'fx_rate_lookups exists');
select extensions.has_table('public', 'fx_rate_fetch_failures', 'fx_rate_fetch_failures exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Wallet', 'cash', 'GBP', 0);
reset role;

-- 1. Own-date rate -> exact.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-01-10', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-01-10', 'frankfurter-v2');
-- 2. Earlier rate, no lookup -> pending (provisional).
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-02-07', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-02-07', 'frankfurter-v2');
-- 3. Earlier rate + final lookups -> exact.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-03-07', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-03-07', 'frankfurter-v2');
insert into public.fx_rate_lookups (quote, requested_date, rate_date, source, fetched_at) values
  ('GBP', '2024-03-10', '2024-03-07', 'frankfurter-v2', timestamptz '2024-03-13 00:00+00'),
  ('USD', '2024-03-10', '2024-03-07', 'frankfurter-v2', timestamptz '2024-03-13 00:00+00');
-- 4. Lookup names a different rate_date than the nearest stored row.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-04-07', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-04-07', 'frankfurter-v2'),
  ('EUR', 'GBP', 0.86, '2024-04-08', 'frankfurter-v2'),
  ('EUR', 'USD', 1.11, '2024-04-08', 'frankfurter-v2');
insert into public.fx_rate_lookups (quote, requested_date, rate_date, source, fetched_at) values
  ('GBP', '2024-04-10', '2024-04-07', 'frankfurter-v2', timestamptz '2024-04-13 00:00+00'),
  ('USD', '2024-04-10', '2024-04-07', 'frankfurter-v2', timestamptz '2024-04-13 00:00+00');
-- 5. Held value, FINAL lookup; GBP's held row (05-09) is not stored yet.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-05-07', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-05-07', 'frankfurter-v2');
insert into public.fx_rate_lookups (quote, requested_date, rate_date, source, fetched_at) values
  ('GBP', '2024-05-10', '2024-05-09', 'frankfurter-v2', timestamptz '2024-05-13 00:00+00'),
  ('USD', '2024-05-10', '2024-05-07', 'frankfurter-v2', timestamptz '2024-05-13 00:00+00');
-- 6. Held value, NON-final lookup, later refreshed.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-06-07', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-06-07', 'frankfurter-v2');
insert into public.fx_rate_lookups (quote, requested_date, rate_date, source, fetched_at) values
  ('GBP', '2024-06-10', '2024-06-09', 'frankfurter-v2', timestamptz '2024-06-10 00:00+00'),
  ('USD', '2024-06-10', '2024-06-07', 'frankfurter-v2', timestamptz '2024-06-13 00:00+00');
-- 7. Fresh / stale non-final lookups around today.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, current_date - 2, 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, current_date - 2, 'frankfurter-v2');
insert into public.fx_rate_lookups (quote, requested_date, rate_date, source, fetched_at) values
  ('GBP', current_date, current_date - 2, 'frankfurter-v2', now()),
  ('USD', current_date, current_date - 2, 'frankfurter-v2', now()),
  ('GBP', current_date - 1, current_date - 2, 'frankfurter-v2', now() - interval '2 hours'),
  ('USD', current_date - 1, current_date - 2, 'frankfurter-v2', now() - interval '2 hours');
-- 8. Coverage older than 7 days is exact when a final lookup says so.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-07-21', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-07-21', 'frankfurter-v2');
insert into public.fx_rate_lookups (quote, requested_date, rate_date, source, fetched_at) values
  ('GBP', '2024-08-10', '2024-07-21', 'frankfurter-v2', timestamptz '2024-08-13 00:00+00'),
  ('USD', '2024-08-10', '2024-07-21', 'frankfurter-v2', timestamptz '2024-08-13 00:00+00');
-- 9. Relax path: rates 10 days earlier, no lookup.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, '2024-08-31', 'frankfurter-v2'),
  ('EUR', 'USD', 1.10, '2024-08-31', 'frankfurter-v2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone) values
  ('b0000000-0000-0000-0000-000000000001', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-01-10', 'UTC'),
  ('b0000000-0000-0000-0000-000000000002', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-02-10', 'UTC'),
  ('b0000000-0000-0000-0000-000000000003', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-03-10', 'UTC'),
  ('b0000000-0000-0000-0000-000000000004', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-04-10', 'UTC'),
  ('b0000000-0000-0000-0000-000000000005', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-05-10', 'UTC'),
  ('b0000000-0000-0000-0000-000000000006', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-06-10', 'UTC'),
  ('b0000000-0000-0000-0000-000000000007', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', current_date, 'UTC'),
  ('b0000000-0000-0000-0000-000000000008', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', current_date - 1, 'UTC'),
  ('b0000000-0000-0000-0000-000000000009', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-08-10', 'UTC'),
  ('b0000000-0000-0000-0000-00000000000a', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'GBP', '2024-09-10', 'UTC');
reset role;

select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000001'), false, 'own-date rate is exact');
select extensions.is((select rate_date from public.transactions where id = 'b0000000-0000-0000-0000-000000000001'), '2024-01-10'::date, 'own-date rate_date is the line date');
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000002'), true, 'earlier rate with no lookup is pending');
select extensions.isnt((select home_amount from public.transactions where id = 'b0000000-0000-0000-0000-000000000002'), null, 'a pending line still has a provisional home_amount');
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000003'), false, 'earlier rate with a final lookup is exact');
select extensions.is((select rate_date from public.transactions where id = 'b0000000-0000-0000-0000-000000000003'), '2024-03-07'::date, 'covered rate keeps the earlier rate_date');
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000004'), true, 'a lookup naming a different rate_date does not cover the nearest row');

-- 5. Held value, final lookup.
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000005'), true, 'held value not in fx_rates: line is pending');
insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'GBP', 0.86, '2024-05-09', 'frankfurter-v2');
set local role service_role;
select public.restamp_transaction('b0000000-0000-0000-0000-000000000005', null);
reset role;
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000005'), false, 'once the held row is accepted a FINAL lookup covers at once');

-- 6. Held value, non-final lookup.
insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'GBP', 0.86, '2024-06-09', 'frankfurter-v2');
set local role service_role;
select public.restamp_transaction('b0000000-0000-0000-0000-000000000006', null);
reset role;
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000006'), true, 'accepted held row with a stale non-final lookup stays pending');
update public.fx_rate_lookups set fetched_at = now() where quote = 'GBP' and rate_date = '2024-06-09';
set local role service_role;
select public.restamp_transaction('b0000000-0000-0000-0000-000000000006', null);
reset role;
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000006'), false, 'refreshing fetched_at (resolve-rate) makes the lookup cover');

-- 7. Non-final fresh vs stale.
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000007'), false, 'a fresh non-final lookup covers');
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000008'), true, 'a stale non-final lookup does not cover');

-- 8 / 9.
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-000000000009'), false, 'a final lookup covers a rate older than 7 days');
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-00000000000a'), true, 'rates 10 days earlier with no lookup: pending');
set local role service_role;
select public.restamp_transaction('b0000000-0000-0000-0000-00000000000a', array['GBP', 'USD']);
reset role;
select extensions.is((select rate_pending from public.transactions where id = 'b0000000-0000-0000-0000-00000000000a'), false, 'relax path still stamps exact from a backfilled rate');

-- fx_rate_covers.
select extensions.is(public.fx_rate_covers('GBP', date '2024-01-10', date '2024-01-10'), true, 'fx_rate_covers: own date');
select extensions.is(public.fx_rate_covers('GBP', date '2024-02-10', date '2024-02-07'), false, 'fx_rate_covers: no lookup');
select extensions.is(public.fx_rate_covers('GBP', date '2024-03-10', date '2024-03-07'), true, 'fx_rate_covers: final lookup');

-- fx_quotes_needing_fetch at 2023-01-10: GBP stored on the day; USD, CHF, JPY nothing.
insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'GBP', 0.85, '2023-01-10', 'frankfurter-v2');
select extensions.is(public.fx_quotes_needing_fetch(array['USD', 'GBP', 'EUR', 'CHF', 'USD'], date '2023-01-10'), array['CHF', 'USD']::text[], 'needing-fetch: uncovered only, sorted, distinct, no EUR');
select extensions.is(public.fx_quotes_needing_fetch(array['GBP', 'EUR'], date '2023-01-10'), '{}'::text[], 'needing-fetch: empty when all covered');

insert into public.fx_rate_fetch_failures (quote, requested_date, reason, failed_at)
values ('JPY', '2023-01-10', 'no-usable-rate', now() - interval '1 hour');
select extensions.is(public.fx_quotes_needing_fetch(array['JPY'], date '2023-01-10'), '{}'::text[], 'no-usable-rate 1h ago is backed off');
update public.fx_rate_fetch_failures set failed_at = now() - interval '7 hours' where quote = 'JPY';
select extensions.is(public.fx_quotes_needing_fetch(array['JPY'], date '2023-01-10'), array['JPY']::text[], 'no-usable-rate 7h ago is retried');
update public.fx_rate_fetch_failures set reason = 'held', failed_at = now() - interval '1 hour' where quote = 'JPY';
select extensions.is(public.fx_quotes_needing_fetch(array['JPY'], date '2023-01-10'), '{}'::text[], 'held 1h ago is backed off');
update public.fx_rate_fetch_failures set reason = 'both-sources-failed', failed_at = now() - interval '10 minutes' where quote = 'JPY';
select extensions.is(public.fx_quotes_needing_fetch(array['JPY'], date '2023-01-10'), '{}'::text[], 'both-sources-failed 10 min ago is backed off');
update public.fx_rate_fetch_failures set failed_at = now() - interval '45 minutes' where quote = 'JPY';
select extensions.is(public.fx_quotes_needing_fetch(array['JPY'], date '2023-01-10'), array['JPY']::text[], 'both-sources-failed 45 min ago is retried');

-- is_iso_currency.
select extensions.is(public.is_iso_currency('THB'), true, 'THB accepted with no stored rate');
select extensions.is(public.is_iso_currency('DEM'), false, 'withdrawn DEM rejected');
select extensions.is(public.is_iso_currency('ZZZ'), false, 'unknown ZZZ rejected');
insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'HRK', 7.5, '2020-01-10', 'frankfurter-v2');
select extensions.is(public.is_iso_currency('HRK'), true, 'a withdrawn code already in fx_rates stays valid');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a2222222-2222-2222-2222-222222222222', (select id from hh), 'Baht', 'cash', 'THB', 0)$$,
  'an account in THB saves with no THB rate stored'
);

-- Privileges.
select extensions.throws_ok($$select * from public.fx_rate_lookups$$, '42501', null, 'authenticated cannot read fx_rate_lookups');
select extensions.throws_ok($$insert into public.fx_rate_lookups (quote, requested_date, rate_date, source) values ('GBP', '2024-01-10', '2024-01-10', 'frankfurter-v2')$$, '42501', null, 'authenticated cannot write fx_rate_lookups');
select extensions.throws_ok($$select * from public.fx_rate_fetch_failures$$, '42501', null, 'authenticated cannot read fx_rate_fetch_failures');
select extensions.throws_ok($$insert into public.fx_rate_fetch_failures (quote, requested_date, reason) values ('GBP', '2024-01-10', 'held')$$, '42501', null, 'authenticated cannot write fx_rate_fetch_failures');
reset role;

select extensions.is(has_function_privilege('authenticated', 'public.fx_rate_covers(text, date, date)', 'execute'), false, 'authenticated cannot execute fx_rate_covers');
select extensions.is(has_function_privilege('authenticated', 'public.fx_quotes_needing_fetch(text[], date)', 'execute'), false, 'authenticated cannot execute fx_quotes_needing_fetch');
select extensions.is(has_function_privilege('service_role', 'public.fx_rate_covers(text, date, date)', 'execute')
  and has_function_privilege('service_role', 'public.fx_quotes_needing_fetch(text[], date)', 'execute'), true, 'service_role can execute both');

select * from extensions.finish();
rollback;
