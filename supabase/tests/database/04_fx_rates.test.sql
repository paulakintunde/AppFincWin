-- pgTAP: ENV-08 / ENV-04 proof for fx_rates.
--
-- fx_rates is reference data written only by the fx-sync Edge Function
-- using the service-role key (which bypasses RLS entirely). Signed-in
-- users may read it; no client role may write it; the check constraints
-- enforce a positive rate and the ^[A-Z]{3}$ currency-code shape.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

-- Seed one row as postgres (bypasses RLS; this is what the Edge
-- Function's service-role key does in production).
insert into public.fx_rates (base, quote, rate, rate_date, source)
values ('EUR', 'USD', 1.1483, '2026-09-22', 'frankfurter-v2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (select count(*) from public.fx_rates)::int,
  1,
  'authenticated user can select fx_rates'
);
select extensions.throws_ok(
  $$insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'GBP', 0.85, '2026-09-22', 'frankfurter-v2')$$,
  '42501', null,
  'authenticated cannot insert into fx_rates'
);
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select extensions.throws_ok(
  $$select count(*) from public.fx_rates$$,
  '42501', null,
  'anon cannot read fx_rates'
);
reset role;

-- Check constraints, run as postgres (table owner; RLS does not apply).
select extensions.throws_ok(
  $$insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'USD', 0, '2026-09-23', 'frankfurter-v2')$$,
  '23514', null,
  'rate 0 violates the positive-rate check'
);
select extensions.throws_ok(
  $$insert into public.fx_rates (base, quote, rate, rate_date, source) values ('eur', 'USD', 1.1, '2026-09-23', 'frankfurter-v2')$$,
  '23514', null,
  'lowercase base currency violates the check'
);
select extensions.throws_ok(
  $$insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'USD', 1.1, '2026-09-23', 'bogus-source')$$,
  '23514', null,
  'unknown source violates the check'
);

select * from extensions.finish();
rollback;
