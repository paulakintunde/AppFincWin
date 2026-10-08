-- pgTAP: MON-10/D-12 proof for fx_auto_accept_holds().
--
-- A hold held 2+ days ago is auto-accepted into fx_rates with an
-- 'auto-accepted' alert queued; a hold held recently is untouched. The
-- function is service_role-only. The fx-monitor-daily cron and
-- fx_pending_rows_count() were retired by migration 20261007000300.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

-- 1. Seed two holds (as postgres, table owner -- bypasses grants/RLS): one
-- aged past the 2-day default, one recent.
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, status, held_at)
values
  ('EUR', 'AUD', 1.80000000, '2026-09-19', 'frankfurter-v2', 'held', now() - interval '3 days'),
  ('EUR', 'CHF', 0.95000000, '2026-09-22', 'frankfurter-v2', 'held', now() - interval '1 hour');

select extensions.is(
  (select count(*) from public.fx_auto_accept_holds())::int, 1,
  'fx_auto_accept_holds() accepts exactly the hold older than the 2-day default'
);

select extensions.is(
  (select count(*) from public.fx_rates where quote = 'AUD' and rate_date = '2026-09-19' and source = 'frankfurter-v2')::int, 1,
  'the auto-accepted hold''s rate now exists in fx_rates'
);

select extensions.is(
  (select status from public.fx_rate_holds where quote = 'AUD'), 'auto-accepted',
  'the aged hold is marked auto-accepted'
);

select extensions.is(
  (select status from public.fx_rate_holds where quote = 'CHF'), 'held',
  'the recent hold is left untouched'
);

select extensions.is(
  (select count(*) from public.fx_alerts where kind = 'auto-accepted' and quote = 'AUD')::int, 1,
  'exactly one auto-accepted alert is queued for the operator digest'
);

-- 2. Not executable by authenticated.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);

select extensions.throws_ok(
  $$select count(*) from public.fx_auto_accept_holds()$$,
  '42501', null,
  'fx_auto_accept_holds is not executable by authenticated'
);
reset role;

select * from extensions.finish();
rollback;
