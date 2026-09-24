-- pgTAP: MON-06/MON-11/MON-12/D-08/D-11/D-12 proof for FX monitoring state
-- (currencies, fx_rate_holds, fx_alerts, fx_latest_rates(), fx_drop_hold()).
--
-- currencies is client-readable reference data (D-08); fx_rate_holds and
-- fx_alerts are invisible to every client role (D-11); fx_latest_rates()
-- proves the per-quote latest-preferring-frankfurter-v2 lookup; fx_drop_hold()
-- proves the operator runbook (D-12) removes an auto-accepted rate from
-- fx_rates and marks the hold dropped.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

-- Seed as postgres (service-role equivalent; bypasses RLS).
insert into public.currencies (code, name, symbol) values ('USD', 'US Dollar', '$');

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.15, '2026-09-18', 'frankfurter-v2'),
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'USD', 1.20, '2026-09-21', 'open-er-api');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (select count(*) from public.currencies)::int, 1,
  'authenticated can read currencies'
);
select extensions.throws_ok(
  $$select count(*) from public.fx_rate_holds$$,
  '42501', null,
  'authenticated cannot read fx_rate_holds'
);
select extensions.throws_ok(
  $$select count(*) from public.fx_alerts$$,
  '42501', null,
  'authenticated cannot read fx_alerts'
);
select extensions.throws_ok(
  $$insert into public.currencies (code, name) values ('GBP', 'Pound Sterling')$$,
  '42501', null,
  'authenticated cannot insert into currencies'
);

select extensions.is(
  (select rate from public.fx_latest_rates() where quote = 'USD'), '1.1483000000',
  'fx_latest_rates() prefers frankfurter-v2 on the latest tied date'
);
select extensions.is(
  (select rate_date from public.fx_latest_rates() where quote = 'USD')::text, '2026-09-21',
  'fx_latest_rates() returns the latest rate_date across sources'
);
select extensions.is(
  (select source from public.fx_latest_rates() where quote = 'USD'), 'frankfurter-v2',
  'fx_latest_rates() attributes the winning row correctly'
);
select extensions.is(
  (select rate from public.fx_latest_rates('2026-09-19') where quote = 'USD'), '1.1500000000',
  'fx_latest_rates(on_or_before) returns the nearest earlier row'
);
select extensions.is(
  (select rate_date from public.fx_latest_rates('2026-09-19') where quote = 'USD')::text, '2026-09-18',
  'fx_latest_rates(on_or_before) returns the correct earlier rate_date'
);

select extensions.throws_ok(
  $$select public.fx_drop_hold(999)$$,
  '42501', null,
  'fx_drop_hold is not executable by authenticated'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.currencies$$,
  '42501', null,
  'anon cannot read currencies'
);
reset role;

-- Operator runbook (D-12), as postgres (service-role equivalent).
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'NZD', 1.90, '2026-09-22', 'frankfurter-v2');
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, prior_rate, prior_rate_date, change_ratio, status)
values ('EUR', 'NZD', 1.90, '2026-09-22', 'frankfurter-v2', 1.60, '2026-09-21', 0.1875, 'auto-accepted');

select extensions.is(
  (select count(*) from public.fx_rates where quote = 'NZD' and rate_date = '2026-09-22')::int, 1,
  'auto-accepted rate exists in fx_rates before fx_drop_hold'
);

select public.fx_drop_hold((select id from public.fx_rate_holds where quote = 'NZD'));

select extensions.is(
  (select count(*) from public.fx_rates where quote = 'NZD' and rate_date = '2026-09-22')::int, 0,
  'fx_drop_hold removes the auto-accepted rate from fx_rates'
);
select extensions.is(
  (select status from public.fx_rate_holds where quote = 'NZD'), 'dropped',
  'fx_drop_hold marks the hold dropped'
);

select * from extensions.finish();
rollback;
