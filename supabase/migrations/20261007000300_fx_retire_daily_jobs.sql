-- 02-DECISION-fx-on-demand.md item 2: no daily FX job. Retire the fx-sync and
-- fx-monitor crons, the two SQL functions only fx-monitor called, and the
-- per-currency staleness setting.
--
-- Where each fx-monitor duty went:
--   * staleness alerts (currencies.staleness_limit_days): removed. The column
--     stays (a drop needs a min_supported_version raise); it is only marked
--     retired and nothing reads it.
--   * fx_auto_accept_holds(): KEPT. resolve-rate calls it lazily on each
--     fetching call, so a held rate still auto-accepts without a cron.
--   * fx_restamp_pending(): DROPPED. The client pending-rate sweep replaces it.
--   * fx_pending_rows_count(): DROPPED. The only alert left is an on-demand
--     fetch failure.
--   * digest email: moves into resolve-rate, fires only on fetch failure.
--     fx_alerts and emailed_at stay.
--   * vault rows fx_sync_url/secret and fx_monitor_url/secret: deleted in the
--     production rollout, not here (they were created by hand at deploy time).
--
-- Ordered before 20261007000400 on purpose: a part-way production push has
-- already removed the crons. Idempotent: safe when either job is absent.

select cron.unschedule(j.jobname)
from cron.job j
where j.jobname in ('fx-sync-daily', 'fx-monitor-daily');

drop function if exists public.fx_pending_rows_count(interval);
drop function if exists public.fx_restamp_pending(integer);

comment on column public.currencies.staleness_limit_days is 'Retired 2026-10-07 (02-DECISION-fx-on-demand.md): fx-monitor and staleness alerts were removed; nothing reads this column. Not dropped, to avoid a min_supported_version raise.';
comment on table public.currencies is 'Frozen ISO currency metadata, last written by the retired fx-sync job. Read only by guard_custom_currency()''s shadow check; the app''s picker uses its built-in list (02-DECISION-fx-on-demand.md).';
comment on table public.fx_rates is 'Shared EUR-based reference FX rates, written on demand by the resolve-rate Edge Function (service role) and read by every signed-in user (02-DECISION-fx-on-demand.md).';
comment on table public.fx_alerts is 'Operator alert queue. Written by resolve-rate on an on-demand fetch failure or hold, and by fx_auto_accept_holds()/fx_drop_hold(); emailed by resolve-rate (02-DECISION-fx-on-demand.md).';
