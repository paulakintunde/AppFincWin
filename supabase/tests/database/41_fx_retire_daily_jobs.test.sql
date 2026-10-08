-- pgTAP: 02-DECISION-fx-on-demand.md item 2. The daily FX jobs are gone
-- (migration 20261007000300): no fx-sync-daily / fx-monitor-daily cron, no
-- cron command touching the fx_sync_* / fx_monitor_* vault secrets, and the
-- two monitor-only SQL functions are dropped. Everything resolve-rate and the
-- operator runbook still use must remain.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

select extensions.is(
  (select count(*) from cron.job where jobname in ('fx-sync-daily', 'fx-monitor-daily'))::int, 0,
  'neither fx-sync-daily nor fx-monitor-daily is scheduled'
);
select extensions.is(
  (select count(*) from cron.job where command like '%fx_sync_%' or command like '%fx_monitor_%')::int, 0,
  'no cron command references fx_sync_* or fx_monitor_* vault secrets'
);

select extensions.ok(not has_function_privilege('anon', 'public.fx_pending_rows_count(interval)', 'execute'), 'anon cannot execute fx_pending_rows_count');
select extensions.ok(not has_function_privilege('authenticated', 'public.fx_pending_rows_count(interval)', 'execute'), 'authenticated cannot execute fx_pending_rows_count');
select extensions.ok(not has_function_privilege('service_role', 'public.fx_pending_rows_count(interval)', 'execute'), 'service_role cannot execute fx_pending_rows_count');
select extensions.ok(obj_description('public.fx_pending_rows_count(interval)'::regprocedure, 'pg_proc') like 'DEPRECATED 2026-10-08%', 'fx_pending_rows_count carries the deprecation comment');
select extensions.ok(not has_function_privilege('anon', 'public.fx_restamp_pending(integer)', 'execute'), 'anon cannot execute fx_restamp_pending');
select extensions.ok(not has_function_privilege('authenticated', 'public.fx_restamp_pending(integer)', 'execute'), 'authenticated cannot execute fx_restamp_pending');
select extensions.ok(not has_function_privilege('service_role', 'public.fx_restamp_pending(integer)', 'execute'), 'service_role cannot execute fx_restamp_pending');
select extensions.ok(obj_description('public.fx_restamp_pending(integer)'::regprocedure, 'pg_proc') like 'DEPRECATED 2026-10-08%', 'fx_restamp_pending carries the deprecation comment');

select extensions.has_function('public', 'fx_auto_accept_holds', array['interval'], 'fx_auto_accept_holds is kept');
select extensions.has_function('public', 'fx_drop_hold', array['bigint'], 'fx_drop_hold is kept');
select extensions.has_function('public', 'fx_restamp_by_rate', array['text', 'date'], 'fx_restamp_by_rate is kept');
select extensions.has_function('public', 'fx_resolve_rate_check_limit', array['uuid', 'integer'], 'fx_resolve_rate_check_limit is kept');
select extensions.has_function('public', 'restamp_transaction', array['uuid', 'text[]'], 'restamp_transaction is kept');

select extensions.has_table('public', 'fx_alerts', 'fx_alerts is kept');
select extensions.has_table('public', 'fx_rate_holds', 'fx_rate_holds is kept');
select extensions.has_table('public', 'fx_resolve_calls', 'fx_resolve_calls is kept');
select extensions.has_table('public', 'fx_rates', 'fx_rates is kept');
select extensions.has_table('public', 'currencies', 'currencies is kept');

select extensions.has_column('public', 'currencies', 'staleness_limit_days', 'staleness_limit_days is not dropped');
select extensions.ok(
  col_description('public.currencies'::regclass,
    (select attnum from pg_attribute where attrelid = 'public.currencies'::regclass and attname = 'staleness_limit_days'))
    like '%Retired%',
  'staleness_limit_days is commented as retired'
);

select extensions.is(
  (select count(*) from cron.job where jobname in ('recurring-materialise-daily', 'record-tombstone-purge-daily'))::int, 2,
  'the other daily cron jobs are untouched'
);

-- Idempotence: the migration's unschedule statement is a no-op when absent.
select extensions.lives_ok(
  $$select cron.unschedule(j.jobname) from cron.job j where j.jobname in ('fx-sync-daily', 'fx-monitor-daily')$$,
  'the guarded unschedule runs cleanly when both jobs are already absent'
);
select extensions.is(
  (select count(*) from cron.job where jobname in ('fx-sync-daily', 'fx-monitor-daily'))::int, 0,
  'still zero FX cron jobs after the re-run'
);

select extensions.ok(
  obj_description('public.currencies'::regclass, 'pg_class') like '%Frozen ISO currency metadata%',
  'currencies table comment states it is frozen'
);
select extensions.ok(
  obj_description('public.fx_rates'::regclass, 'pg_class') like '%on demand%',
  'fx_rates table comment states on-demand writes'
);
select extensions.ok(
  obj_description('public.fx_alerts'::regclass, 'pg_class') like '%Operator alert queue%',
  'fx_alerts table comment describes the alert queue'
);
select extensions.ok(
  has_function_privilege('service_role', 'public.fx_auto_accept_holds(interval)', 'execute'),
  'service_role can still execute fx_auto_accept_holds'
);
select extensions.ok(
  not has_function_privilege('authenticated', 'public.fx_auto_accept_holds(interval)', 'execute'),
  'authenticated still cannot execute fx_auto_accept_holds'
);

select * from extensions.finish();
rollback;
