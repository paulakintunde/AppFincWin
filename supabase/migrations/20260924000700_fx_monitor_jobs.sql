-- FX monitoring jobs: auto-accept aged holds, count stuck pending rows, and
-- schedule the daily digest (MON-10, MON-11, D-09, D-10, D-12, Pitfall 2).
--
-- fx_auto_accept_holds() is the D-12 half of the hold lifecycle fx_drop_hold()
-- (plan 01-08) started: a held rate unconfirmed for 2 days is accepted into
-- fx_rates on the operator's behalf and an 'auto-accepted' fx_alerts row is
-- queued so the digest (plan 01-11's fx-monitor Edge Function) always
-- reports it, with the runbook (docs/ops/fx-operations.md) documenting how
-- to drop a bad auto-accept within the window fx_drop_hold() still covers.
--
-- fx_pending_rows_count() feeds the same digest with how many transactions
-- have sat rate_pending for more than a day (Pitfall 2) -- a stuck backfill
-- is never silent.
--
-- Both functions are service_role-only: the fx-monitor Edge Function is the
-- only caller, invoked by pg_cron via the same shared-secret/net.http_post
-- pattern as fx-sync-daily (20260922000400_fx_sync_schedule.sql).

create or replace function public.fx_auto_accept_holds(p_older_than interval default interval '2 days')
returns setof public.fx_rate_holds
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.fx_rate_holds%rowtype;
begin
  for h in
    select * from public.fx_rate_holds
     where status = 'held' and resolved_at is null and held_at < now() - p_older_than -- CR-B02: never a resolved (e.g. dropped) hold
     order by id
  loop
    insert into public.fx_rates (base, quote, rate, rate_date, source)
    values (h.base, h.quote, h.held_rate, h.held_rate_date, h.source)
    on conflict (base, quote, rate_date, source) do nothing;

    update public.fx_rate_holds
       set status = 'auto-accepted', resolved_at = now()
     where id = h.id
     returning * into h;

    insert into public.fx_alerts (kind, quote, detail)
    values (
      'auto-accepted',
      h.quote,
      jsonb_build_object('heldRate', h.held_rate::text, 'heldRateDate', h.held_rate_date, 'holdId', h.id)
    );

    return next h;
  end loop;
  return;
end;
$$;

revoke execute on function public.fx_auto_accept_holds(interval) from public, anon, authenticated;
grant execute on function public.fx_auto_accept_holds(interval) to service_role;

create or replace function public.fx_pending_rows_count(p_older_than interval default interval '1 day')
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) from public.transactions
   where rate_pending and created_at < now() - p_older_than
$$;

revoke execute on function public.fx_pending_rows_count(interval) from public, anon, authenticated;
grant execute on function public.fx_pending_rows_count(interval) to service_role;

-- fx_restamp_pending(): re-stamps rate_pending rows whose date has
-- arrived (local_date no later than tomorrow, server time), oldest first,
-- under the normal 7-day window -- no quote is relaxed. This is how a
-- future-dated row, which stamp_fx_rate() keeps pending until its own day
-- (WR-B01), picks up that day's rate once fx-sync has stored it; a row
-- whose rates still don't exist simply stays pending. A system restamp, so
-- version is not bumped. Returns how many rows were re-stamped (not how
-- many resolved). Called daily by fx-monitor before it counts pending rows.
create or replace function public.fx_restamp_pending(p_limit integer default 1000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  perform set_config('fincwin.system_restamp', 'on', true);
  perform set_config('fincwin.restamp_relax_quotes', '', true);
  with due as (
    select t.id from public.transactions t
     where t.rate_pending and t.local_date <= current_date + 1
     order by t.created_at
     limit p_limit
  )
  update public.transactions t set updated_at = now() from due where t.id = due.id;
  get diagnostics n = row_count;
  perform set_config('fincwin.system_restamp', '', true);
  return n;
end;
$$;

revoke execute on function public.fx_restamp_pending(integer) from public, anon, authenticated;
grant execute on function public.fx_restamp_pending(integer) to service_role;

-- Daily monitor schedule: 30 minutes after fx-sync-daily (16:30 UTC) so
-- today's holds and fallbacks are already in place before the digest reads
-- them. Same trust model as fx-sync-daily: reuses the fx_sync_secret shared
-- secret (pg_cron is the only caller); the fx_monitor_url Vault row is
-- created at deploy time (plan 01-16), never in git. Locally the job runs,
-- finds null secrets in vault.decrypted_secrets, and fails harmlessly.
select cron.schedule(
  'fx-monitor-daily',
  '0 17 * * *', -- 17:00 UTC, 30 minutes after fx-sync-daily so today's holds and fallbacks are in the digest
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'fx_monitor_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-fx-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'fx_sync_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
