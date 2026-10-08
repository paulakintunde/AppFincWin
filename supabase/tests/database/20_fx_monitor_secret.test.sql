-- pgTAP: IN-B03 originally proved fx-monitor-daily used its own shared secret.
-- Both daily FX jobs were retired by migration 20261007000300
-- (02-DECISION-fx-on-demand.md), so the subject no longer exists. The file
-- stays to keep numbering stable and now asserts no cron command is left
-- that reads either FX vault secret.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(1);

select extensions.is(
  (select count(*) from cron.job where command like '%fx_sync_secret%' or command like '%fx_monitor_secret%')::int, 0,
  'no cron job command references fx_sync_secret or fx_monitor_secret'
);

select * from extensions.finish();
rollback;
