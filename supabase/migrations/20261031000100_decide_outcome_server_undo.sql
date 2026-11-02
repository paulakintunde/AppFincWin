-- 05.3-66 (gaps 1, 2, 8). A new 4-argument record_decide_outcome records the Plan it / Not buying undo step on the
-- server with allow_system_keys, as record_decide_go does, because a client-recorded step cannot restore
-- decide_checks.status (apply_patches allows it only during a system replay). The Wait goal may carry account_id so the
-- plan pot is born linked. The 3-argument function is unchanged so installed builds keep working.
--
-- Contract (src/db/decideOutcomes.ts, 05.3-78):
--   record_decide_outcome(p_check_id uuid, p_outcome text 'wait'|'pass', p_decision jsonb, p_undo_step jsonb)
--     -> {status:'applied'|'already-applied', undo_step_id uuid|null, check_version int|null, goal_version int|null}
--   p_undo_step: {id uuid, label_key 'planSaved' (wait) | 'notBuyingSaved' (pass), label_params: {name?: string <= 80}}
--   p_decision.goal.account_id: optional uuid|null; guard_savings_goal refuses an account outside the household.

create or replace function public.record_decide_outcome(
  p_check_id uuid, p_outcome text, p_decision jsonb, p_undo_step jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_check public.decide_checks%rowtype;
  v_target_status text;
  v_cooling boolean := false;
  v_wait_monthly bigint;
  v_ready_by date;
  v_goal jsonb;
  v_goal_id uuid;
  v_account_id uuid;
  v_step_id uuid;
  v_label_key text;
  v_params jsonb;
  v_ops jsonb;
  v_check_version integer;
  v_goal_version integer;
begin
  if p_outcome is null or p_outcome not in ('wait', 'pass') then
    raise exception 'record_decide_outcome: the outcome must be wait or pass' using errcode = '22023';
  end if;
  v_target_status := case p_outcome when 'wait' then 'waiting' else 'passed' end;
  v_label_key := case p_outcome when 'wait' then 'planSaved' else 'notBuyingSaved' end;

  -- The undo step is validated before anything is locked or written.
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception 'record_decide_outcome: p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'record_decide_outcome: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'record_decide_outcome: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;
  if p_undo_step ->> 'label_key' is distinct from v_label_key then
    raise exception 'record_decide_outcome: the undo step label is not allowed here' using errcode = '22023';
  end if;
  v_params := coalesce(p_undo_step -> 'label_params', '{}'::jsonb);
  if jsonb_typeof(v_params) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(v_params) k where k <> 'name')
     or (v_params ? 'name' and (jsonb_typeof(v_params -> 'name') is distinct from 'string'
                                or char_length(v_params ->> 'name') > 80)) then
    raise exception 'record_decide_outcome: the undo step label params are malformed' using errcode = '22023';
  end if;

  select * into v_check from public.decide_checks where id = p_check_id and deleted_at is null for update;
  if not found
     or v_check.created_by is distinct from (select auth.uid())
     or v_check.household_id not in (select public.user_household_ids()) then
    raise exception 'record_decide_outcome: the check is not yours' using errcode = '42501';
  end if;

  -- A replay of a recorded step is success; nothing more is written.
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
    select g.id, g.version into v_goal_id, v_goal_version
      from public.savings_goals g where g.check_id = p_check_id order by g.created_at limit 1;
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id,
                              'check_version', v_check.version, 'goal_version', v_goal_version);
  end if;
  -- A replay of the same outcome without a recorded step (the 3-argument path) is also success.
  if v_check.status = v_target_status then
    select g.id, g.version into v_goal_id, v_goal_version
      from public.savings_goals g where g.check_id = p_check_id order by g.created_at limit 1;
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', null,
                              'check_version', v_check.version, 'goal_version', v_goal_version);
  end if;
  if v_check.status <> 'open' then
    raise exception 'record_decide_outcome: the check is already decided' using errcode = '22023';
  end if;

  if jsonb_typeof(p_decision) is distinct from 'object'
     or coalesce(p_decision ->> 'verdict', '') not in ('fits', 'adjust', 'no', 'missing') then
    raise exception 'record_decide_outcome: p_decision is malformed' using errcode = '22023';
  end if;
  if p_decision ? 'cooling_off' and jsonb_typeof(p_decision -> 'cooling_off') is distinct from 'boolean' then
    raise exception 'record_decide_outcome: cooling_off must be a boolean' using errcode = '22023';
  end if;
  v_cooling := coalesce((p_decision ->> 'cooling_off')::boolean, false);

  v_goal := case when jsonb_typeof(p_decision -> 'goal') = 'null' then null else p_decision -> 'goal' end;
  if p_outcome = 'pass' and v_goal is not null then
    raise exception 'record_decide_outcome: a pass has no goal' using errcode = '22023';
  end if;

  if p_outcome = 'wait' then
    if jsonb_typeof(p_decision -> 'wait_monthly') is distinct from 'number'
       or coalesce(p_decision ->> 'wait_monthly', '') !~ '^[0-9]{1,14}$'
       or (p_decision ->> 'wait_monthly')::bigint > 10000000000000 then
      raise exception 'record_decide_outcome: wait_monthly must be an integer within bounds' using errcode = '22023';
    end if;
    v_wait_monthly := (p_decision ->> 'wait_monthly')::bigint;
    begin
      v_ready_by := nullif(p_decision ->> 'ready_by', '')::date;
    exception when others then
      raise exception 'record_decide_outcome: ready_by must be a date' using errcode = '22023';
    end;
    if v_ready_by is not null and v_ready_by < current_date then
      v_ready_by := current_date;
    end if;
    if v_goal is not null then
      if jsonb_typeof(v_goal) is distinct from 'object'
         or char_length(btrim(coalesce(v_goal ->> 'name', ''))) not between 1 and 80
         or coalesce(v_goal ->> 'currency', '') !~ '^[A-Z0-9]{2,4}$'
         or jsonb_typeof(v_goal -> 'target') is distinct from 'number'
         or coalesce(v_goal ->> 'target', '') !~ '^[0-9]{1,14}$'
         or (v_goal ->> 'target')::bigint not between 1 and 10000000000000 then
        raise exception 'record_decide_outcome: the goal is malformed' using errcode = '22023';
      end if;
      begin
        v_goal_id := (v_goal ->> 'id')::uuid;
      exception when others then
        raise exception 'record_decide_outcome: the goal id must be a uuid' using errcode = '22023';
      end;
      if v_goal_id is null then
        raise exception 'record_decide_outcome: the goal id must be a uuid' using errcode = '22023';
      end if;
      -- Gap 1: the pot may be born linked to an account. null or absent means unlinked.
      if v_goal ? 'account_id' and jsonb_typeof(v_goal -> 'account_id') not in ('null', 'string') then
        raise exception 'record_decide_outcome: the goal account must be a uuid' using errcode = '22023';
      end if;
      begin
        v_account_id := nullif(v_goal ->> 'account_id', '')::uuid;
      exception when others then
        raise exception 'record_decide_outcome: the goal account must be a uuid' using errcode = '22023';
      end;
    end if;
  end if;

  perform set_config('fincwin.decide_rpc', 'on', true);

  update public.decide_checks
     set status = v_target_status,
         decided_at = now(),
         verdict_at_decision = p_decision ->> 'verdict',
         wait_monthly = case when p_outcome = 'wait' then v_wait_monthly else null end,
         ready_by = case when p_outcome = 'wait' then v_ready_by else null end,
         cooling_off_at = case when v_cooling then now() + interval '48 hours' else null end
   where id = p_check_id;

  if p_outcome = 'wait' and v_goal is not null then
    insert into public.savings_goals (id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by, account_id)
    values (v_goal_id, v_check.household_id, (select auth.uid()), p_check_id,
            btrim(v_goal ->> 'name'), v_goal ->> 'currency', (v_goal ->> 'target')::bigint,
            v_wait_monthly, v_ready_by, v_account_id)
    on conflict (id) do nothing;
  end if;

  perform set_config('fincwin.decide_rpc', '', true);

  select c.version into v_check_version from public.decide_checks c where c.id = p_check_id;
  if v_goal_id is not null and p_outcome = 'wait' then
    select g.version into v_goal_version from public.savings_goals g where g.id = v_goal_id;
  end if;

  -- The undo step is built here from the locked row, never from client ops. It puts the check back to open and
  -- soft-deletes the plan's pot. allow_system_keys lets undo_replay restore the server-only decision columns.
  v_ops := jsonb_build_array(jsonb_build_object(
    'entity', 'decide_checks', 'id', p_check_id, 'expectedVersion', v_check_version,
    'patch', jsonb_build_object('status', 'open', 'decided_at', null, 'verdict_at_decision', null,
                                'wait_monthly', null, 'ready_by', null, 'cooling_off_at', null)));
  if v_goal_version is not null then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'savings_goals', 'id', v_goal_id, 'expectedVersion', v_goal_version,
      'patch', jsonb_build_object('deleted_at', '$now')));
  end if;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, (select auth.uid()), v_label_key, v_params, v_ops, true);

  return jsonb_build_object('status', 'applied', 'undo_step_id', v_step_id,
                            'check_version', v_check_version, 'goal_version', v_goal_version);
end;
$$;
revoke execute on function public.record_decide_outcome(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_decide_outcome(uuid, text, jsonb, jsonb) to authenticated;
