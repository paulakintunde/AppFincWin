-- Phase 2.2 (record polish) plan 14: "Add {month}" as one server RPC (D-16).
--
-- Extends the household horizon by exactly one month (contiguous adds only,
-- never more than 12 months ahead of today), materialises every active
-- series into that month as real pending rows, and records ONE undo step.
-- The step is written server-side with allow_system_keys (RESEARCH Pattern 7)
-- so undo can soft-delete the inserted rows AND rewind each series'
-- materialised_through and the household horizon_month; re-adding the month
-- afterwards then creates the rows again (Pitfall 6).
--
-- RESEARCH assumption A7: the rewind only touches system-inserted rows from
-- this step. undo_replay refuses the step if a series' generation moved since
-- (D-CR-01), so later materialisation or edits make the undo refuse rather
-- than corrupt. The step is inserted AFTER materialisation so the stored
-- series_generations match the post-add state.
--
-- Additive and idempotent (FND-10).

create or replace function public.add_activity_month(
  p_household_id uuid,
  p_month text,
  p_today date,
  p_undo_step jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.households%rowtype;
  v_step_id uuid;
  v_default text;
  v_effective text;
  v_expected text;
  v_month_start date;
  v_before_horizon text;
  v_captured jsonb := '[]'::jsonb;
  v_cap record;
  v_inserted uuid[] := '{}'::uuid[];
  v_ops jsonb := '[]'::jsonb;
  v_id uuid;
  v_version integer;
  v_through date;
begin
  if p_household_id is null or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;

  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'add_activity_month: p_month must be YYYY-MM' using errcode = '22023';
  end if;
  if p_today is null or abs(p_today - current_date) > 2 then
    raise exception 'add_activity_month: p_today is out of range' using errcode = '22023';
  end if;
  if jsonb_typeof(p_undo_step) is distinct from 'object'
     or p_undo_step ->> 'label_key' is distinct from 'monthAdded' then
    raise exception 'add_activity_month: p_undo_step must be a monthAdded step' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'add_activity_month: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'add_activity_month: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;

  -- Replay of the same action.
  if exists (select 1 from public.undo_log where id = v_step_id and owner_id = (select auth.uid())) then
    return jsonb_build_object('status', 'already-applied');
  end if;

  select * into h from public.households where id = p_household_id for update;

  v_default := to_char(public.recurring_horizon(p_today), 'YYYY-MM');
  v_effective := greatest(coalesce(h.horizon_month, v_default), v_default);
  v_expected := to_char(to_date(v_effective || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM');
  if p_month <> v_expected then
    raise exception 'add_activity_month: month must follow %', v_effective using errcode = '22023';
  end if;
  if p_month > to_char(date_trunc('month', p_today) + interval '12 months', 'YYYY-MM') then
    raise exception 'add_activity_month: % is more than 12 months ahead', p_month using errcode = '22023';
  end if;

  v_month_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_before_horizon := h.horizon_month;

  -- Before-state of every series that can reach the added month.
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'through', s.materialised_through) order by s.id), '[]'::jsonb)
    into v_captured
    from public.recurring_series s
   where s.household_id = p_household_id
     and s.deleted_at is null
     and (s.end_date is null or s.end_date >= v_month_start);

  -- Horizon first, so materialise_series reads the new end of horizon.
  perform set_config('fincwin.system_restamp', 'on', true);
  update public.households set horizon_month = p_month where id = p_household_id;
  perform set_config('fincwin.system_restamp', '', true);

  for v_cap in select (e ->> 'id')::uuid as id from jsonb_array_elements(v_captured) e loop
    v_inserted := v_inserted || array(select public.materialise_series(v_cap.id, p_today));
  end loop;

  -- Ops are built from server state after all writes.
  foreach v_id in array v_inserted loop
    select t.version into v_version from public.transactions t where t.id = v_id;
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'transactions', 'id', v_id, 'expectedVersion', v_version,
      'patch', jsonb_build_object('deleted_at', '$now')));
  end loop;

  for v_cap in
    select (e ->> 'id')::uuid as id, nullif(e ->> 'through', '')::date as before_through
      from jsonb_array_elements(v_captured) e
  loop
    select s.version, s.materialised_through into v_version, v_through
      from public.recurring_series s where s.id = v_cap.id;
    if v_through is distinct from v_cap.before_through then
      v_ops := v_ops || jsonb_build_array(jsonb_build_object(
        'entity', 'recurring_series', 'id', v_cap.id, 'expectedVersion', v_version,
        'patch', jsonb_build_object('materialised_through', v_cap.before_through)));
    end if;
  end loop;

  select hh.version into v_version from public.households hh where hh.id = p_household_id;
  v_ops := v_ops || jsonb_build_array(jsonb_build_object(
    'entity', 'households', 'id', p_household_id, 'expectedVersion', v_version,
    'patch', jsonb_build_object('horizon_month', v_before_horizon)));

  if jsonb_array_length(v_ops) > 6000 then
    raise exception 'add_activity_month: too many operations (MAX_UNDO_OPS)' using errcode = '22023';
  end if;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, (select auth.uid()), 'monthAdded',
          coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, true);

  return jsonb_build_object(
    'status', 'applied', 'month', p_month,
    'inserted', to_jsonb(v_inserted), 'undo_step_id', v_step_id);
end;
$$;

revoke execute on function public.add_activity_month(uuid, text, date, jsonb) from public, anon;
grant execute on function public.add_activity_month(uuid, text, date, jsonb) to authenticated;
