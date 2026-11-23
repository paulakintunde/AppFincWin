-- Phase 10 (10-17): DAT-02 server-held records the client cannot read, for the person's own export.
-- One RPC returns (table_name, row) pairs for the caller only: their Decide shadow results, their household's plan
-- state, and the plan events that name them. Never another person's id (payer_id, user ids, store ids, payloads).
create function public.my_server_export()
returns table (table_name text, row jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
    select 'decide_shadow_runs'::text,
           jsonb_build_object('engine_revision', s.engine_revision, 'sample_id', s.sample_id, 'code', s.code,
                              'variant', s.variant, 'reasons', s.reasons, 'figures', s.figures, 'created_at', s.created_at)
      from public.decide_shadow_runs s
     where s.user_id = uid
     order by s.created_at, s.id;

  return query
    select 'household_plans'::text,
           jsonb_build_object('household_id', p.household_id, 'plan_key', p.plan_key, 'plan_size', p.plan_size,
                              'status', p.status, 'period', p.period, 'store', p.store,
                              'trial_started_at', p.trial_started_at, 'trial_ends_at', p.trial_ends_at,
                              'covered_until', p.covered_until, 'created_at', p.created_at)
      from public.household_plans p
     where exists (select 1 from public.household_members m
                    where m.household_id = p.household_id and m.user_id = uid)
     order by p.created_at;

  -- plan_events carries no household column: it is keyed by the store app user, so the caller gets the events
  -- recorded under their own id, reduced to kind, environment and dates.
  return query
    select 'plan_events'::text,
           jsonb_build_object('kind', e.type, 'environment', e.environment, 'received_at', e.received_at,
                              'applied_at', e.applied_at)
      from public.plan_events e
     where e.app_user_id = uid::text
     order by e.received_at, e.id;
end;
$$;

revoke execute on function public.my_server_export() from public, anon;
grant execute on function public.my_server_export() to authenticated;
