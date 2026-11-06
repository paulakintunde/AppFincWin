-- 05.3 D-15 (05.2 finding N-05) and D-16. Additive.
-- D-15: undo_replay re-created from the LATEST definition in 20261010000200_record_polish_patches.sql; only the lines
--       marked "05.3 D-15" change. A later step of the same owner that touched a row and was already undone moved the
--       row's version by 2 per op on that row (its forward write and its undo) without changing the row's values. The
--       expected version is raised by exactly that amount, and only when the row's current version equals the raised
--       value, so any other change (another member, a later step still in effect, a refused step, a purged step) still
--       conflicts. apply_undo_step and rollback_undo_to are unchanged.
-- D-16: decide_checks.answer_v3 holds the SeenV3 the user last saw ({v:3, code, variant, readyBy, unspentAfter,
--       lineFacts}). Never derived from verdict_at_decision. guard_decide_check does not lock it (it locks only inputs,
--       name, furthest_step, kind on a decided check).

create or replace function public.undo_adjusted_ops(p_step public.undo_log)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_op jsonb;
  v_out jsonb := '[]'::jsonb;
  v_entity text;
  v_id uuid;
  v_ev integer;
  v_k integer;
  v_row jsonb;
  v_cur integer;
  v_in_scope boolean;
begin
  for v_op in
    select value from jsonb_array_elements(p_step.ops) with ordinality as t(value, ord) order by ord
  loop
    v_entity := v_op ->> 'entity';
    v_id := null;
    v_ev := null;
    begin
      v_id := (v_op ->> 'id')::uuid;
      v_ev := (v_op ->> 'expectedVersion')::integer;
    exception when others then
      v_id := null;
    end;

    if v_entity is null or v_id is null or v_ev is null
       or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts', 'households', 'category_rules',
                           'decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals', 'decide_settings',
                           'recurring_dismissals', 'income_payer_prompts', 'decide_answers') then
      v_out := v_out || jsonb_build_array(v_op);
      continue;
    end if;

    v_k := coalesce((
      select sum(2 * (select count(*) from jsonb_array_elements(l.ops) o where o ->> 'id' = v_id::text))
        from public.undo_log l
       where l.owner_id = p_step.owner_id
         and l.status = 'undone'
         and (l.created_at, l.id) > (p_step.created_at, p_step.id)
         and v_id = any (l.touched_ids)
    ), 0)::integer;

    if v_k = 0 then
      v_out := v_out || jsonb_build_array(v_op);
      continue;
    end if;

    execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_entity) using v_id into v_row;

    -- same scope as apply_patches Phase A; a row out of scope is left to apply_patches to refuse
    v_in_scope := false;
    if v_row is not null then
      if v_entity = 'households' then
        v_in_scope := (v_row ->> 'id')::uuid in (select public.user_household_ids());
      elsif v_entity in ('transactions', 'recurring_series', 'accounts', 'debts', 'recurring_dismissals', 'income_payer_prompts') then
        v_in_scope := (v_row ->> 'household_id')::uuid in (select public.user_household_ids());
      elsif v_entity = 'category_rules' then
        v_in_scope := (v_row ->> 'scope' = 'personal' and (v_row ->> 'owner_id')::uuid is not distinct from (select auth.uid()))
                      or (v_row ->> 'scope' = 'shared' and (v_row ->> 'household_id')::uuid in (select public.user_household_ids()));
      elsif v_entity = 'decide_settings' then
        v_in_scope := (v_row ->> 'user_id')::uuid is not distinct from (select auth.uid());
      elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals', 'decide_answers') then
        v_in_scope := (v_row ->> 'created_by')::uuid is not distinct from (select auth.uid())
                      and (v_row ->> 'household_id')::uuid in (select public.user_household_ids());
      else -- categories
        v_in_scope := (v_row ->> 'owner_id')::uuid is not distinct from (select auth.uid());
      end if;
    end if;

    v_cur := case when v_in_scope then (v_row ->> 'version')::integer else null end;

    if v_cur is not null and v_cur = v_ev + v_k then
      v_out := v_out || jsonb_build_array(jsonb_set(v_op, '{expectedVersion}', to_jsonb(v_ev + v_k))); -- 05.3 D-15
    else
      v_out := v_out || jsonb_build_array(v_op);
    end if;
  end loop;

  return v_out;
end;
$$;

revoke execute on function public.undo_adjusted_ops(public.undo_log) from public, anon, authenticated;

create or replace function public.undo_replay(p_step public.undo_log)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_op jsonb;
  v_series public.recurring_series%rowtype;
  v_row public.transactions%rowtype;
  v_cleanup uuid[] := '{}'::uuid[];
  v_result jsonb;
begin
  for v_op in
    select value from jsonb_array_elements(p_step.ops) where value ->> 'entity' = 'recurring_series'
  loop
    select * into v_series from public.recurring_series
     where id = (v_op ->> 'id')::uuid
       and household_id in (select public.user_household_ids())
     for update;
    if not found then
      continue; -- missing or out of scope: apply_patches reports/raises it
    end if;

    if v_op -> 'patch' = jsonb_build_object('deleted_at', '$now') then
      select * into v_row from public.transactions t
       where t.recurring_series_id = v_series.id
         and t.deleted_at is null
         and not (t.id = any (p_step.touched_ids))
         and (t.version > 1 or t.status <> 'pending')
       order by t.occurrence_date, t.id
       limit 1;
      if found then
        return jsonb_build_object(
          'status', 'conflict',
          'conflict', jsonb_build_object(
            'entity', 'transactions', 'id', v_row.id, 'updated_by', v_row.updated_by,
            'record_name', v_row.name, 'builtin_key', null, 'reason', 'changed'
          )
        );
      end if;
      v_cleanup := v_cleanup || array(
        select t.id from public.transactions t
         where t.recurring_series_id = v_series.id
           and t.deleted_at is null
           and not (t.id = any (p_step.touched_ids))
      );
    elsif v_series.generation is distinct from (p_step.series_generations ->> v_series.id::text)::integer then
      return jsonb_build_object(
        'status', 'conflict',
        'conflict', jsonb_build_object(
          'entity', 'recurring_series', 'id', v_series.id, 'updated_by', null,
          'record_name', v_series.name, 'builtin_key', null, 'reason', 'changed'
        )
      );
    end if;
  end loop;

  -- D-WR-02: the replay runs in a subtransaction. A step whose ops are
  -- individually version-valid can still be impossible to apply -- a
  -- restored occurrence colliding with a re-materialised one (23505), a
  -- check or deferred transfer-pair violation (23514), a moved account
  -- (23503), a caller who has since left the household (42501), or an op a
  -- newer server no longer accepts (22023). Any of those is a refusal (D-26,
  -- D-28), not an error: otherwise the step stays 'available', throws on
  -- every tap, and blocks every rollback beneath it. The deferred
  -- transfer-pair check is forced here so its failure is catchable too,
  -- instead of surfacing at commit where nothing can turn it into a refusal.
  begin
    -- 2.2: a server-recorded add-month step may rewind the high-water marks
    if p_step.allow_system_keys then
      perform set_config('fincwin.undo_replay', 'on', true);
      perform set_config('fincwin.system_restamp', 'on', true);
    end if;
    v_result := public.apply_patches(public.undo_adjusted_ops(p_step)); -- 05.3 D-15
    perform set_config('fincwin.undo_replay', '', true);
    perform set_config('fincwin.system_restamp', '', true);

    if v_result ->> 'status' = 'applied' and cardinality(v_cleanup) > 0 then
      update public.transactions set deleted_at = now()
       where id = any (v_cleanup) and deleted_at is null;
    end if;

    set constraints public.transfer_pair_check immediate;
    set constraints public.transfer_pair_check deferred;
  exception
    when integrity_constraint_violation or insufficient_privilege or invalid_parameter_value then
      perform set_config('fincwin.undo_replay', '', true);
      perform set_config('fincwin.system_restamp', '', true);
      v_result := jsonb_build_object(
        'status', 'conflict',
        'conflict', jsonb_build_object(
          'entity', p_step.ops -> 0 ->> 'entity', 'id', p_step.ops -> 0 ->> 'id', 'updated_by', null,
          'record_name', null, 'builtin_key', null, 'reason', 'changed'
        )
      );
  end;

  return v_result;
end;
$$;

revoke execute on function public.undo_replay(public.undo_log) from public, anon, authenticated;

-- D-16
alter table public.decide_checks add column if not exists answer_v3 jsonb;
alter table public.decide_checks add constraint decide_checks_answer_v3_shape
  check (answer_v3 is null or (jsonb_typeof(answer_v3) = 'object'
    and answer_v3 ->> 'code' in ('needs_input', 'not_yet', 'monthly_short', 'emergency_use', 'fits_unspent', 'fits_month')
    and pg_column_size(answer_v3) < 4096));
grant insert (answer_v3) on public.decide_checks to authenticated;
grant update (answer_v3) on public.decide_checks to authenticated;
comment on column public.decide_checks.answer_v3 is '05.3 D-15/D-16: SeenV3 the user last saw; never derived from verdict_at_decision.';
