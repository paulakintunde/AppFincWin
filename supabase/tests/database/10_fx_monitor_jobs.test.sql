-- pgTAP: MON-10/MON-11/D-12/Pitfall-2 proof for the FX monitor jobs
-- (fx_auto_accept_holds(), fx_pending_rows_count(), fx-monitor-daily cron).
--
-- A hold held 2+ days ago is auto-accepted into fx_rates with an
-- 'auto-accepted' alert queued; a hold held recently is untouched.
-- fx_pending_rows_count() counts only transactions that have sat
-- rate_pending for more than a day. Both functions are service_role-only.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

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

-- 2. Seed a household/account/user (auto-provisioned via handle_new_user)
-- and two pending transactions, one stuck for 2 days and one just created.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('99999999-9999-9999-9999-999999999999', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'monitor@test.local', '{}', now(), now());

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values (
  'a9999999-9999-9999-9999-999999999999',
  (select id from public.households where owner_id = '99999999-9999-9999-9999-999999999999'),
  'Wallet', 'cash', 'EUR', 0
);

-- original_currency EUR vs profile's default home_currency USD, with no USD
-- fx_rates row seeded, stamps rate_pending = true (D-17) -- no other setup
-- needed to produce a genuinely pending row. created_by must be set
-- explicitly: as postgres, auth.uid() is null, and stamp_fx_rate() requires
-- a resolvable author profile.
insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency, local_date, time_zone, created_at)
values (
  'b9999999-9999-9999-9999-999999999991',
  (select id from public.households where owner_id = '99999999-9999-9999-9999-999999999999'),
  'a9999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', -500, 'EUR', '2026-09-20', 'UTC', now() - interval '2 days'
);
insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency, local_date, time_zone, created_at)
values (
  'b9999999-9999-9999-9999-999999999992',
  (select id from public.households where owner_id = '99999999-9999-9999-9999-999999999999'),
  'a9999999-9999-9999-9999-999999999999', '99999999-9999-9999-9999-999999999999', -700, 'EUR', '2026-09-22', 'UTC', now()
);

select extensions.is(
  (select rate_pending from public.transactions where id = 'b9999999-9999-9999-9999-999999999991'),
  true,
  'the 2-day-old transaction is genuinely rate_pending (sanity check before counting)'
);

select extensions.is(
  (select public.fx_pending_rows_count())::int, 1,
  'fx_pending_rows_count() counts only the transaction pending for more than a day, not the one created now'
);

-- 3. Neither function is executable by authenticated.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"99999999-9999-9999-9999-999999999999","role":"authenticated"}', true);

select extensions.throws_ok(
  $$select count(*) from public.fx_auto_accept_holds()$$,
  '42501', null,
  'fx_auto_accept_holds is not executable by authenticated'
);
select extensions.throws_ok(
  $$select public.fx_pending_rows_count()$$,
  '42501', null,
  'fx_pending_rows_count is not executable by authenticated'
);
reset role;

-- 4. Daily monitor schedule exists.
select extensions.is(
  (select count(*) from cron.job where jobname = 'fx-monitor-daily')::int, 1,
  'fx-monitor-daily cron job is scheduled'
);

select * from extensions.finish();
rollback;
