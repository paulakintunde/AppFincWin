-- pgTAP: IN-B03 proof that fx-monitor-daily authenticates with its own
-- shared secret, so a leaked fx-sync secret cannot also drive fx-monitor
-- (which auto-accepts holds and re-stamps transactions).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(3);

select extensions.ok(
  (select command from cron.job where jobname = 'fx-monitor-daily') like '%''fx_monitor_secret''%',
  'fx-monitor-daily reads the fx_monitor_secret Vault row'
);
select extensions.ok(
  (select command from cron.job where jobname = 'fx-monitor-daily') like '%''x-fx-monitor-secret''%',
  'fx-monitor-daily sends it in the x-fx-monitor-secret header'
);
select extensions.ok(
  (select command from cron.job where jobname = 'fx-monitor-daily') not like '%fx_sync_secret%',
  'fx-monitor-daily no longer sends the fx-sync secret'
);

select * from extensions.finish();
rollback;
