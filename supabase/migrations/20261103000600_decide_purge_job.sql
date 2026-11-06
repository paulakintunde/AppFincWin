-- 05.4 M7 (CMP-F06): permanently delete Decide rows that were soft-deleted more than 30 days ago.
-- Soft delete exists so Undo works; the undo window is far shorter than 30 days. Children first, checks last.
-- Grow-owned tables (debts, savings_goals) are not touched here. Returns counts only.
create or replace function public.purge_deleted_decide_rows(p_older_than interval default interval '30 days')
returns table (table_name text, deleted bigint)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cut timestamptz := now() - p_older_than;
  v_n bigint;
begin
  delete from public.decide_links where deleted_at is not null and deleted_at < v_cut;
  get diagnostics v_n = row_count;
  table_name := 'decide_links'; deleted := v_n; return next;

  delete from public.decide_changes where deleted_at is not null and deleted_at < v_cut;
  get diagnostics v_n = row_count;
  table_name := 'decide_changes'; deleted := v_n; return next;

  delete from public.decide_answers where deleted_at is not null and deleted_at < v_cut;
  get diagnostics v_n = row_count;
  table_name := 'decide_answers'; deleted := v_n; return next;

  delete from public.decide_checks where deleted_at is not null and deleted_at < v_cut;
  get diagnostics v_n = row_count;
  table_name := 'decide_checks'; deleted := v_n; return next;
end;
$$;
revoke execute on function public.purge_deleted_decide_rows(interval) from public, anon, authenticated;
grant execute on function public.purge_deleted_decide_rows(interval) to service_role;

-- Idempotent schedule: drop an existing job of the same name first.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'decide-purge-nightly') then
    perform cron.unschedule('decide-purge-nightly');
  end if;
end;
$$;
select cron.schedule('decide-purge-nightly', '41 3 * * *', $$select public.purge_deleted_decide_rows()$$);
