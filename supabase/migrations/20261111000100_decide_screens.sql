-- 06.1 Decide screens: D-20, D-22, D-23, CO-D-64(6), FIN-20 storage.
-- Additive only. Sorts after every Grow migration (the planned 20261110000100 name was taken).
-- Not pushed from here: the human-gated push is plan 31.

-- 1. D-20: the flagged safety-net goal may carry a Decide-only "answers may use it" flag -------------------------------
-- Default off. Only set_net_answer_use writes it (the column is in no client grant); un-flagging a net, or removing it,
-- puts it back to off. Grow's own lock rules (locked, protect, is_safety_net) are not touched.
alter table public.savings_goals add column if not exists decide_may_use boolean not null default false;
alter table public.savings_goals add constraint savings_goals_decide_may_use_net check (decide_may_use = false or is_safety_net);

create or replace function public.savings_goals_decide_may_use_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.decide_may_use := false;
    return new;
  end if;
  -- The flag moves only inside set_net_answer_use or an undo replay of that step.
  if coalesce(current_setting('fincwin.net_answer_rpc', true), '') <> 'on'
     and coalesce(current_setting('fincwin.undo_replay', true), '') <> 'on' then
    new.decide_may_use := old.decide_may_use;
  end if;
  -- A goal that stops being the net (a swap) or is removed no longer lets answers use it.
  if not new.is_safety_net or new.deleted_at is not null then
    new.decide_may_use := false;
  end if;
  return new;
end;
$$;
revoke execute on function public.savings_goals_decide_may_use_guard() from public, anon, authenticated;
create trigger savings_goals_decide_may_use_guard before insert or update on public.savings_goals
  for each row execute function public.savings_goals_decide_may_use_guard();

-- set_net_answer_use: "answers may use my safety net" on or off, with a version check and one undo step. The undo step is
-- built here from what the call wrote (client ops are never stored). label_key: safetyNetUnlocked (on) / safetyNetLocked (off).
create or replace function public.set_net_answer_use(p_goal_id uuid, p_on boolean, p_expected_version integer, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_label text;
  v_goal public.savings_goals%rowtype;
  v_version integer;
begin
  if v_uid is null then
    raise exception 'set_net_answer_use: sign in first' using errcode = '42501';
  end if;
  if p_goal_id is null or p_on is null or p_expected_version is null then
    raise exception 'set_net_answer_use: the goal, the setting and its version are required' using errcode = '22023';
  end if;
  v_label := case when p_on then 'safetyNetUnlocked' else 'safetyNetLocked' end;
  v_step_id := public.grow_check_undo_step(p_undo_step, v_label, 'set_net_answer_use', false);
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  select * into v_goal from public.savings_goals g where g.id = p_goal_id for update;
  if not found
     or v_goal.created_by is distinct from v_uid
     or v_goal.household_id not in (select public.user_household_ids())
     or v_goal.deleted_at is not null
     or not v_goal.is_safety_net then
    raise exception 'set_net_answer_use: that is not your safety net' using errcode = '42501';
  end if;
  if v_goal.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;
  if v_goal.decide_may_use = p_on then
    return jsonb_build_object('status', 'unchanged', 'goal_id', v_goal.id, 'goal_version', v_goal.version);
  end if;

  perform set_config('fincwin.net_answer_rpc', 'on', true);
  update public.savings_goals set decide_may_use = p_on where id = v_goal.id returning version into v_version;
  perform set_config('fincwin.net_answer_rpc', 'off', true);

  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, v_uid, v_label, coalesce(p_undo_step -> 'label_params', '{}'::jsonb),
          jsonb_build_array(jsonb_build_object('entity', 'savings_goals', 'id', v_goal.id, 'expectedVersion', v_version,
                                               'patch', jsonb_build_object('decide_may_use', v_goal.decide_may_use))),
          true);

  return jsonb_build_object('status', 'applied', 'goal_id', v_goal.id, 'goal_version', v_version, 'undo_step_id', v_step_id);
end;
$$;
revoke execute on function public.set_net_answer_use(uuid, boolean, integer, jsonb) from public, anon;
grant execute on function public.set_net_answer_use(uuid, boolean, integer, jsonb) to authenticated;

-- 2. D-23 and FIN-20 storage: decide_settings -----------------------------------------------------------------------
-- Four "I answered this" stamps (no other debts, safety net not set, no rules, bills are right). FIN-20: the tax set-aside
-- share in basis points (0 to 60%); stored now, unused until plan 29 is approved. Written like the other decide_settings
-- columns (a column grant); not in apply_patches, as with safety_net_locked.
alter table public.decide_settings
  add column if not exists answered_no_debts_at timestamptz,
  add column if not exists answered_net_not_set_at timestamptz,
  add column if not exists answered_no_rules_at timestamptz,
  add column if not exists answered_bills_right_at timestamptz,
  add column if not exists tax_set_aside_bp integer;
alter table public.decide_settings add constraint decide_settings_tax_set_aside_bp_range
  check (tax_set_aside_bp is null or tax_set_aside_bp between 0 and 6000);
grant insert (answered_no_debts_at, answered_net_not_set_at, answered_no_rules_at, answered_bills_right_at, tax_set_aside_bp)
  on public.decide_settings to authenticated;
grant update (answered_no_debts_at, answered_net_not_set_at, answered_no_rules_at, answered_bills_right_at, tax_set_aside_bp)
  on public.decide_settings to authenticated;

-- 3. CO-D-64 (6): "What Decide said on {date}", one row per decided check -------------------------------------------
-- Owner-private. Deleted with the check (cascade; the nightly purge hard-deletes old soft-deleted checks) and with the
-- account (cascade on the user). No update or delete grant: rows are written once.
create table public.decide_check_history (
  id uuid primary key,
  check_id uuid not null references public.decide_checks(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  said_on date not null,
  code text not null check (char_length(code) between 1 and 80),
  variant text check (variant is null or char_length(variant) <= 80),
  result jsonb not null check (pg_column_size(result) < 16384),
  created_at timestamptz not null default now()
);
create index decide_check_history_check_idx on public.decide_check_history (check_id, said_on);

create or replace function public.stamp_decide_check_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then new.created_by := (select auth.uid()); end if;
  return new;
end;
$$;
revoke execute on function public.stamp_decide_check_history() from public, anon, authenticated;
create trigger stamp_decide_check_history before insert on public.decide_check_history
  for each row execute function public.stamp_decide_check_history();

alter table public.decide_check_history enable row level security;
create policy "own decide check history read" on public.decide_check_history for select to authenticated
  using (created_by = (select auth.uid())
         and exists (select 1 from public.decide_checks c where c.id = check_id and c.created_by = (select auth.uid())));
create policy "own decide check history insert" on public.decide_check_history for insert to authenticated
  with check (created_by = (select auth.uid())
              and exists (select 1 from public.decide_checks c where c.id = check_id and c.created_by = (select auth.uid())));

revoke all on public.decide_check_history from anon;
revoke insert, update, delete, truncate on public.decide_check_history from authenticated;
grant select on public.decide_check_history to authenticated;
grant insert (id, check_id, said_on, code, variant, result) on public.decide_check_history to authenticated;

-- 4. apply_patches (re-issued from 20261106000100; changed lines marked 06.1) ---------------------------------------
-- Only so the undo step of set_net_answer_use can put savings_goals.decide_may_use back (a system key, like is_safety_net).
create or replace function public.apply_patches(p_ops jsonb, p_undo_step jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  v_idx integer;
  v_op jsonb;
  v_entity text;
  v_id uuid;
  v_expected_version integer;
  v_patch jsonb;
  v_key text;
  v_allowed text[];
  v_row_json jsonb;
  v_current_version integer;
  v_col_type text;
  v_set_parts text[];
  v_new_version integer;
  v_skip_flags boolean[] := '{}'::boolean[];
  v_rows jsonb := '[]'::jsonb;
  v_step_id uuid;
  v_label_key text;
  v_label_params jsonb;
  v_step_ops jsonb;
  -- 2.2: true only inside undo_replay of a step flagged allow_system_keys
  v_system boolean := coalesce(current_setting('fincwin.undo_replay', true), '') = 'on';
begin
  if jsonb_typeof(p_ops) <> 'array' then
    raise exception 'apply_patches: p_ops must be a JSON array' using errcode = '22023';
  end if;
  n := jsonb_array_length(p_ops);
  if n < 1 or n > 6000 then
    raise exception 'apply_patches: p_ops must contain between 1 and 6000 operations' using errcode = '22023';
  end if;

  -- D-WR-03: a replay of an action that already landed (same client step
  -- id) is reported as already-applied with each row's current version,
  -- instead of conflicting with the versions its own first attempt left
  -- behind. Rows are only reported for allowlisted entities in the
  -- caller's scope.
  if public.undo_step_replayed(p_undo_step) then
    for v_idx in 0 .. n - 1 loop
      v_op := p_ops -> v_idx;
      v_entity := v_op ->> 'entity';
      continue when jsonb_typeof(v_op) <> 'object'
        or v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts', 'category_rules', 'decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals', 'decide_settings', 'recurring_dismissals', 'income_payer_prompts', 'decide_answers', 'holdings', 'holding_lots'); -- 02.3, 05, 05.2
      begin
        v_id := (v_op ->> 'id')::uuid;
      exception when others then
        continue;
      end;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_entity) using v_id into v_row_json;
      continue when v_row_json is null;
      if v_entity = 'categories' then
        continue when (v_row_json ->> 'owner_id')::uuid is distinct from (select auth.uid());
      elsif v_entity = 'category_rules' then  -- 02.3
        continue when not (
          (v_row_json ->> 'scope' = 'personal' and (v_row_json ->> 'owner_id')::uuid is not distinct from (select auth.uid()))
          or (v_row_json ->> 'scope' = 'shared' and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())));
      elsif v_entity = 'decide_settings' then  -- 05.2: scoped by user_id
        continue when (v_row_json ->> 'user_id')::uuid is distinct from (select auth.uid());
      elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals', 'decide_answers', 'holdings', 'holding_lots') then  -- 05, 05.2: owner-private
        continue when not ((v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid())
                           and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids()));
      else
        continue when not ((v_row_json ->> 'household_id')::uuid in (select public.user_household_ids()));
      end if;
      v_rows := v_rows || jsonb_build_array(jsonb_build_object(
        'entity', v_entity, 'id', v_id, 'version', (v_row_json ->> 'version')::integer));
    end loop;
    return jsonb_build_object('status', 'already-applied', 'rows', v_rows);
  end if;

  -- Phase A: validate shape, lock and check every row, no writes yet.
  for v_idx in 0 .. n - 1 loop
    v_op := p_ops -> v_idx;
    if jsonb_typeof(v_op) <> 'object' then
      raise exception 'apply_patches: op % is not an object', v_idx using errcode = '22023';
    end if;

    v_entity := v_op ->> 'entity';
    if v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts', 'households', 'category_rules', 'decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals', 'decide_settings', 'recurring_dismissals', 'income_payer_prompts', 'decide_answers', 'holdings', 'holding_lots') then -- 02.3, 05, 05.2
      raise exception 'apply_patches: op % has an unknown entity %', v_idx, coalesce(v_entity, 'null') using errcode = '22023';
    end if;

    begin
      v_id := (v_op ->> 'id')::uuid;
    exception when others then
      raise exception 'apply_patches: op % has an invalid id', v_idx using errcode = '22023';
    end;

    -- D-CR-02: fail closed. A missing key or a JSON null yields SQL NULL from
    -- ->>, and `NULL !~ ...` is NULL (not true), so the coalesce is what
    -- turns "no version" into an invalid op instead of an unconditional write.
    if jsonb_typeof(v_op -> 'expectedVersion') is distinct from 'number'
       or coalesce(v_op ->> 'expectedVersion', '') !~ '^[1-9][0-9]{0,8}$' then
      raise exception 'apply_patches: op % has an invalid expectedVersion', v_idx using errcode = '22023';
    end if;
    v_expected_version := (v_op ->> 'expectedVersion')::integer;

    v_patch := v_op -> 'patch';
    if jsonb_typeof(v_patch) <> 'object' or (select count(*) from jsonb_object_keys(v_patch)) = 0 then
      raise exception 'apply_patches: op % patch must be a non-empty object', v_idx using errcode = '22023';
    end if;

    v_allowed := case v_entity
      when 'transactions' then array['account_id', 'original_amount', 'original_currency', 'local_date',
        'time_zone', 'note', 'name', 'category_id', 'payment_type', 'status', 'deleted_at', 'transfer_id',
        'recurring_series_id', 'occurrence_date', 'is_refund', 'is_automatic',
        'one_off', 'goal_id', 'income_kind', 'counts_as', 'refund_of']  -- 2.2, 05 (D-29, D-34), 05.2
      when 'categories' then array['name', 'color_key', 'archived_at', 'monthly_cap']  -- 2.2
      when 'recurring_series' then array['name', 'amount', 'currency', 'account_id', 'category_id',
        'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'deleted_at', 'is_automatic',
        'counts_as', 'income_kind', 'saving_mode', 'pay_group', 'end_reason']  -- 2.2, 05.2, 05.2 D-24
        || case when v_system then array['materialised_through'] else '{}'::text[] end
      when 'accounts' then array['name', 'kind', 'opening_balance', 'archived_at', 'overdraft_limit', 'credit_limit',
        'deleted_at', 'use', 'use_purpose', 'use_envelope_id', 'use_extra_set_aside', 'overdraft_rate', 'interest_rate']  -- 2.2, 05.2, 05.4, 06
      when 'households' then case when v_system then array['horizon_month'] else '{}'::text[] end  -- 2.2
      when 'category_rules' then array['keyword', 'keyword_norm', 'category_id', 'target_builtin_key', 'target_name', 'deleted_at']  -- 02.3
      when 'decide_checks' then array['deleted_at']
        || case when v_system then array['status', 'decided_at', 'verdict_at_decision', 'estimate_day_one', 'estimate_monthly',
          'wait_monthly', 'ready_by', 'broke_line', 'cooling_off_at', 'estimate_monthly_payment', 'estimate_running'] else '{}'::text[] end  -- 05
      when 'debts' then array['name', 'balance', 'apr', 'minimum_payment', 'secured', 'term_months', 'deleted_at', 'is_housing', 'pays_in_full', 'paid_off_on', 'due_day', 'started_balance', 'payoff_order']  -- 05-119 (R18.4), 05.2, 05.2 paid off, 05.4
        || case when v_system then array['check_id', 'payoff_extra', 'extra_series_id'] else '{}'::text[] end  -- 05; 06 (save_debt_plan undo only)
      when 'decide_links' then array['deleted_at']  -- 05
      when 'decide_changes' then array['kind', 'name', 'monthly_amount', 'currency', 'start_month', 'end_month', 'deleted_at']  -- 05 (D-27)
      when 'savings_goals' then array['name', 'target', 'ready_by', 'opening_saved', 'done_at', 'deleted_at',
        'account_id', 'monthly_amount', 'color_key', 'locked', 'protect', 'up_front_only', 'icon', 'net_confirmed_at']  -- 05 (D-34), 05-119 (R18.2), 05.2, 06
        || case when v_system then array['is_safety_net', 'decide_may_use'] else '{}'::text[] end  -- 06 (D-29 swap undo only); 06.1 (set_net_answer_use undo)
      when 'decide_settings' then array['currency', 'rough_income', 'rough_spending', 'reserve', 'dsr_line', 'housing_line',
        'unsecured_multiple', 'investing_floor', 'saving_floor', 'basis_override',
        'income_types', 'income_pattern', 'income_pattern_confirmed', 'variable_method', 'steady_amount', 'spread_months',
        'hold_months', 'share_pct', 'detail', 'remind_plan', 'remind_unspent', 'setup_done_at', 'everyday_override',
        'everyday_override_at', 'month_marks', 'unspent_anchor', 'unspent_anchor_at', 'reserve_account_id', 'reserve_goal',
        'rough_saving', 'rough_debt', 'rough_invest', 'rough_as_of', 'unexplained_amount', 'unexplained_use', 'unexplained_at',
        'refine_last_at', 'refine_snooze_until', 'custom_options']  -- 05.2, 05.3-81
      when 'recurring_dismissals' then array['deleted_at']  -- 05.2
      when 'income_payer_prompts' then array['income_kind', 'counts_as', 'apply_to_future', 'deleted_at']  -- 05.2
      when 'decide_answers' then array['amount', 'bool_value', 'on_date', 'deleted_at']  -- 05.2
      when 'holdings' then array['name', 'type', 'opening_put_in', 'account_id', 'paid_from_account_id', 'monthly_amount', 'day', 'rate', 'deleted_at']  -- 06
      when 'holding_lots' then array['amount', 'units', 'local_date', 'note', 'deleted_at']  -- 06
    end case;

    for v_key in select jsonb_object_keys(v_patch) loop
      if not (v_key = any (v_allowed)) then
        raise exception 'apply_patches: op % patches unknown column % on %', v_idx, v_key, v_entity using errcode = '22023';
      end if;
      if v_entity = 'transactions' and v_key in ('recurring_series_id', 'occurrence_date')
         and jsonb_typeof(v_patch -> v_key) <> 'null' then
        raise exception 'apply_patches: op % must set % to null', v_idx, v_key using errcode = '22023';
      end if;
    end loop;

    -- 02.3: a rule may only point at a non-system category the caller owns
    if v_entity = 'category_rules' and v_patch ? 'category_id' and jsonb_typeof(v_patch -> 'category_id') <> 'null'
       and not exists (select 1 from public.categories c
                        where c.id = (v_patch ->> 'category_id')::uuid
                          and c.owner_id = (select auth.uid()) and not c.is_system) then
      raise exception 'apply_patches: op % names a category the caller does not own', v_idx using errcode = '42501';
    end if;

    execute format('select to_jsonb(t) from public.%I t where t.id = $1 for update', v_entity)
      using v_id
      into v_row_json;

    if v_row_json is null then
      if v_patch = jsonb_build_object('deleted_at', '$now') or v_patch = jsonb_build_object('archived_at', '$now') then
        v_skip_flags := array_append(v_skip_flags, true);
        continue; -- already gone is satisfied; nothing to check or write
      end if;
      return jsonb_build_object(
        'status', 'conflict',
        'conflict', jsonb_build_object(
          'entity', v_entity, 'id', v_id, 'updated_by', null, 'record_name', null, 'builtin_key', null, 'reason', 'not-found'
        )
      );
    end if;

    if v_entity = 'households' then -- 2.2: scoped by the household's own id
      if not ((v_row_json ->> 'id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not in a household the caller belongs to', v_idx using errcode = '42501';
      end if;
    elsif v_entity in ('transactions', 'recurring_series', 'accounts') then
      if not ((v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not in a household the caller belongs to', v_idx using errcode = '42501';
      end if;
    elsif v_entity = 'category_rules' then -- 02.3: personal = owner only; shared = household members
      if not ((v_row_json ->> 'scope' = 'personal' and (v_row_json ->> 'owner_id')::uuid is not distinct from (select auth.uid()))
              or (v_row_json ->> 'scope' = 'shared' and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids()))) then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    elsif v_entity = 'decide_settings' then -- 05.2: scoped by user_id
      if (v_row_json ->> 'user_id')::uuid is distinct from (select auth.uid()) then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals', 'decide_answers', 'holdings', 'holding_lots') then -- 05, 05.2: owner-private
      if not ((v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid())
              and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    elsif v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts') then -- 05, 05.2: household-scoped
      if not ((v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not in a household the caller belongs to', v_idx using errcode = '42501';
      end if;
    else -- categories: owner-only, and a system row (Transfer/Settlement) is never writable (D-34)
      if (v_row_json ->> 'owner_id')::uuid <> (select auth.uid()) or (v_row_json ->> 'is_system')::boolean then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    end if;

    v_current_version := (v_row_json ->> 'version')::integer;
    if v_current_version <> v_expected_version then
      return jsonb_build_object(
        'status', 'conflict',
        'conflict', jsonb_build_object(
          'entity', v_entity, 'id', v_id,
          'updated_by', v_row_json ->> 'updated_by',
          'record_name', coalesce(v_row_json ->> 'name', v_row_json ->> 'keyword'),  -- 02.3
          'builtin_key', case when v_entity = 'categories' then v_row_json ->> 'builtin_key' else null end,
          'reason', 'changed'
        )
      );
    end if;

    v_skip_flags := array_append(v_skip_flags, false);
  end loop;

  -- Phase B: every op checked out; apply each non-skipped one.
  for v_idx in 0 .. n - 1 loop
    if v_skip_flags[v_idx + 1] then
      continue;
    end if;

    v_op := p_ops -> v_idx;
    v_entity := v_op ->> 'entity';
    v_id := (v_op ->> 'id')::uuid;
    v_patch := v_op -> 'patch';
    v_set_parts := array[]::text[];

    for v_key in select jsonb_object_keys(v_patch) loop
      v_col_type := case v_entity || '.' || v_key
        when 'transactions.account_id' then 'uuid'
        when 'transactions.original_amount' then 'bigint'
        when 'transactions.original_currency' then 'text'
        when 'transactions.local_date' then 'date'
        when 'transactions.time_zone' then 'text'
        when 'transactions.note' then 'text'
        when 'transactions.name' then 'text'
        when 'transactions.category_id' then 'uuid'
        when 'transactions.payment_type' then 'text'
        when 'transactions.status' then 'text'
        when 'transactions.deleted_at' then 'timestamptz'
        when 'transactions.transfer_id' then 'uuid'
        when 'transactions.recurring_series_id' then 'uuid'
        when 'transactions.occurrence_date' then 'date'
        when 'transactions.is_refund' then 'boolean'
        when 'transactions.is_automatic' then 'boolean'
        when 'categories.monthly_cap' then 'bigint'
        when 'recurring_series.is_automatic' then 'boolean'
        when 'recurring_series.materialised_through' then 'date'
        when 'accounts.deleted_at' then 'timestamptz'
        when 'households.horizon_month' then 'text'
        when 'categories.name' then 'text'
        when 'categories.color_key' then 'text'
        when 'categories.archived_at' then 'timestamptz'
        when 'recurring_series.name' then 'text'
        when 'recurring_series.amount' then 'bigint'
        when 'recurring_series.currency' then 'text'
        when 'recurring_series.account_id' then 'uuid'
        when 'recurring_series.category_id' then 'uuid'
        when 'recurring_series.payment_type' then 'text'
        when 'recurring_series.freq' then 'text'
        when 'recurring_series.anchor_date' then 'date'
        when 'recurring_series.end_date' then 'date'
        when 'recurring_series.occurrence_count' then 'integer'
        when 'recurring_series.deleted_at' then 'timestamptz'
        when 'accounts.name' then 'text'
        when 'accounts.kind' then 'text'
        when 'accounts.opening_balance' then 'bigint'
        when 'accounts.archived_at' then 'timestamptz'
        when 'accounts.overdraft_limit' then 'bigint'
        when 'accounts.credit_limit' then 'bigint'
        when 'accounts.overdraft_rate' then 'text'  -- 05.4
        when 'debts.due_day' then 'smallint'  -- 05.4
        when 'category_rules.keyword' then 'text'  -- 02.3
        when 'category_rules.keyword_norm' then 'text'  -- 02.3
        when 'category_rules.category_id' then 'uuid'  -- 02.3
        when 'category_rules.target_builtin_key' then 'text'  -- 02.3
        when 'category_rules.target_name' then 'text'  -- 02.3
        when 'category_rules.deleted_at' then 'timestamptz'  -- 02.3
        when 'decide_checks.deleted_at' then 'timestamptz'  -- 05
        when 'decide_checks.status' then 'text'  -- 05
        when 'decide_checks.decided_at' then 'timestamptz'  -- 05
        when 'decide_checks.verdict_at_decision' then 'text'  -- 05
        when 'decide_checks.estimate_day_one' then 'bigint'  -- 05
        when 'decide_checks.estimate_monthly' then 'bigint'  -- 05
        when 'decide_checks.wait_monthly' then 'bigint'  -- 05
        when 'decide_checks.ready_by' then 'date'  -- 05
        when 'decide_checks.broke_line' then 'boolean'  -- 05
        when 'decide_checks.cooling_off_at' then 'timestamptz'  -- 05
        when 'decide_checks.estimate_monthly_payment' then 'bigint'  -- 05
        when 'decide_checks.estimate_running' then 'bigint'  -- 05
        when 'debts.name' then 'text'  -- 05
        when 'debts.balance' then 'bigint'  -- 05
        when 'debts.apr' then 'text'  -- 05
        when 'debts.minimum_payment' then 'bigint'  -- 05
        when 'debts.secured' then 'boolean'  -- 05
        when 'debts.term_months' then 'integer'  -- 05
        when 'debts.deleted_at' then 'timestamptz'  -- 05
        when 'debts.check_id' then 'uuid'  -- 05
        when 'decide_links.deleted_at' then 'timestamptz'  -- 05
        when 'transactions.one_off' then 'boolean'  -- 05
        when 'transactions.goal_id' then 'uuid'  -- 05
        when 'decide_changes.kind' then 'text'  -- 05
        when 'decide_changes.name' then 'text'  -- 05
        when 'decide_changes.monthly_amount' then 'bigint'  -- 05
        when 'decide_changes.currency' then 'text'  -- 05
        when 'decide_changes.start_month' then 'text'  -- 05
        when 'decide_changes.end_month' then 'text'  -- 05
        when 'decide_changes.deleted_at' then 'timestamptz'  -- 05
        when 'savings_goals.deleted_at' then 'timestamptz'  -- 05
        when 'savings_goals.name' then 'text'  -- 05-119
        when 'savings_goals.target' then 'bigint'  -- 05-119
        when 'savings_goals.ready_by' then 'date'  -- 05-119
        when 'savings_goals.opening_saved' then 'bigint'  -- 05-119
        when 'savings_goals.done_at' then 'timestamptz'  -- 05-119
        when 'debts.is_housing' then 'boolean'  -- 05-119
        when 'recurring_series.counts_as' then 'text'  -- 05.2
        when 'recurring_series.income_kind' then 'text'  -- 05.2
        when 'recurring_series.saving_mode' then 'text'  -- 05.2
        when 'transactions.income_kind' then 'text'  -- 05.2
        when 'transactions.counts_as' then 'text'  -- 05.2
        when 'debts.pays_in_full' then 'text'  -- 05.2
        when 'recurring_series.end_reason' then 'text'  -- 05.2 D-24
        when 'debts.paid_off_on' then 'date'  -- 05.2 paid off
        when 'accounts.use' then 'text'  -- 05.2
        when 'accounts.use_purpose' then 'text'  -- 05.2
        when 'savings_goals.color_key' then 'text'  -- 05.2
        when 'decide_settings.currency' then 'text'  -- 05.2
        when 'decide_settings.dsr_line' then 'text'  -- 05.2
        when 'decide_settings.housing_line' then 'text'  -- 05.2
        when 'decide_settings.basis_override' then 'text'  -- 05.2
        when 'decide_settings.income_pattern' then 'text'  -- 05.2
        when 'decide_settings.variable_method' then 'text'  -- 05.2
        when 'decide_settings.detail' then 'text'  -- 05.2
        when 'decide_settings.unexplained_use' then 'text'  -- 05.2
        when 'income_payer_prompts.income_kind' then 'text'  -- 05.2
        when 'income_payer_prompts.counts_as' then 'text'  -- 05.2
        when 'recurring_series.pay_group' then 'uuid'  -- 05.2
        when 'transactions.refund_of' then 'uuid'  -- 05.2
        when 'accounts.use_envelope_id' then 'uuid'  -- 05.2
        when 'savings_goals.account_id' then 'uuid'  -- 05.2
        when 'decide_settings.reserve_account_id' then 'uuid'  -- 05.2
        when 'accounts.use_extra_set_aside' then 'bigint'  -- 05.2
        when 'savings_goals.monthly_amount' then 'bigint'  -- 05.2
        when 'decide_settings.rough_income' then 'bigint'  -- 05.2
        when 'decide_settings.rough_spending' then 'bigint'  -- 05.2
        when 'decide_settings.reserve' then 'bigint'  -- 05.2
        when 'decide_settings.investing_floor' then 'bigint'  -- 05.2
        when 'decide_settings.saving_floor' then 'bigint'  -- 05.2
        when 'decide_settings.steady_amount' then 'bigint'  -- 05.2
        when 'decide_settings.everyday_override' then 'bigint'  -- 05.2
        when 'decide_settings.unspent_anchor' then 'bigint'  -- 05.2
        when 'decide_settings.reserve_goal' then 'bigint'  -- 05.2
        when 'decide_settings.rough_saving' then 'bigint'  -- 05.2
        when 'decide_settings.rough_debt' then 'bigint'  -- 05.2
        when 'decide_settings.rough_invest' then 'bigint'  -- 05.2
        when 'decide_settings.unexplained_amount' then 'bigint'  -- 05.2
        when 'decide_answers.amount' then 'bigint'  -- 05.2
        when 'decide_settings.unsecured_multiple' then 'integer'  -- 05.2
        when 'decide_settings.spread_months' then 'smallint'  -- 05.2
        when 'decide_settings.hold_months' then 'smallint'  -- 05.2
        when 'decide_settings.share_pct' then 'smallint'  -- 05.2
        when 'decide_settings.income_pattern_confirmed' then 'boolean'  -- 05.2
        when 'decide_settings.remind_plan' then 'boolean'  -- 05.2
        when 'decide_settings.remind_unspent' then 'boolean'  -- 05.2
        when 'income_payer_prompts.apply_to_future' then 'boolean'  -- 05.2
        when 'decide_answers.bool_value' then 'boolean'  -- 05.2
        when 'decide_settings.everyday_override_at' then 'date'  -- 05.2
        when 'decide_settings.unspent_anchor_at' then 'date'  -- 05.2
        when 'decide_settings.rough_as_of' then 'date'  -- 05.2
        when 'decide_settings.unexplained_at' then 'date'  -- 05.2
        when 'decide_answers.on_date' then 'date'  -- 05.2
        when 'decide_settings.setup_done_at' then 'timestamptz'  -- 05.2
        when 'decide_settings.refine_last_at' then 'timestamptz'  -- 05.2
        when 'decide_settings.refine_snooze_until' then 'timestamptz'  -- 05.2
        when 'recurring_dismissals.deleted_at' then 'timestamptz'  -- 05.2
        when 'income_payer_prompts.deleted_at' then 'timestamptz'  -- 05.2
        when 'decide_answers.deleted_at' then 'timestamptz'  -- 05.2
        when 'decide_settings.income_types' then 'text[]'  -- 05.2
        when 'decide_settings.month_marks' then 'jsonb'  -- 05.2
        when 'decide_settings.custom_options' then 'jsonb'  -- 05.3-81
        when 'savings_goals.locked' then 'boolean'  -- 06
        when 'savings_goals.protect' then 'boolean'  -- 06
        when 'savings_goals.up_front_only' then 'boolean'  -- 06
        when 'savings_goals.icon' then 'text'  -- 06
        when 'savings_goals.net_confirmed_at' then 'timestamptz'  -- 06
        when 'savings_goals.is_safety_net' then 'boolean'  -- 06
        when 'savings_goals.decide_may_use' then 'boolean'  -- 06.1 (system key: set_net_answer_use undo)
        when 'debts.started_balance' then 'bigint'  -- 06
        when 'debts.payoff_order' then 'text'  -- 06
        when 'debts.payoff_extra' then 'bigint'  -- 06 (system key: save_debt_plan undo)
        when 'debts.extra_series_id' then 'uuid'  -- 06 (system key: save_debt_plan undo)
        when 'accounts.interest_rate' then 'text'  -- 06
        when 'holdings.name' then 'text'  -- 06
        when 'holdings.type' then 'text'  -- 06
        when 'holdings.opening_put_in' then 'bigint'  -- 06
        when 'holdings.account_id' then 'uuid'  -- 06
        when 'holdings.paid_from_account_id' then 'uuid'  -- 06
        when 'holdings.monthly_amount' then 'bigint'  -- 06
        when 'holdings.day' then 'smallint'  -- 06
        when 'holdings.rate' then 'text'  -- 06
        when 'holdings.deleted_at' then 'timestamptz'  -- 06
        when 'holding_lots.amount' then 'bigint'  -- 06
        when 'holding_lots.units' then 'text'  -- 06
        when 'holding_lots.local_date' then 'date'  -- 06
        when 'holding_lots.note' then 'text'  -- 06
        when 'holding_lots.deleted_at' then 'timestamptz'  -- 06
      end case;

      if v_col_type = 'timestamptz' and (v_patch ->> v_key) = '$now' then
        v_set_parts := array_append(v_set_parts, format('%I = now()', v_key));
      else
        v_set_parts := array_append(v_set_parts, format('%I = ($2 ->> %L)::%s', v_key, v_key, v_col_type));
      end if;
    end loop;

    execute format('update public.%I set %s where id = $1 returning version', v_entity, array_to_string(v_set_parts, ', '))
      using v_id, v_patch
      into v_new_version;

    v_rows := v_rows || jsonb_build_array(jsonb_build_object('entity', v_entity, 'id', v_id, 'version', v_new_version));
  end loop;

  if p_undo_step is not null then
    if jsonb_typeof(p_undo_step) <> 'object' then
      raise exception 'apply_patches: p_undo_step must be an object' using errcode = '22023';
    end if;
    begin
      v_step_id := (p_undo_step ->> 'id')::uuid;
    exception when others then
      raise exception 'apply_patches: p_undo_step.id must be a uuid' using errcode = '22023';
    end;
    v_label_key := p_undo_step ->> 'label_key';
    v_label_params := coalesce(p_undo_step -> 'label_params', '{}'::jsonb);
    v_step_ops := p_undo_step -> 'ops';
    if jsonb_typeof(v_step_ops) <> 'array' then
      raise exception 'apply_patches: p_undo_step.ops must be an array' using errcode = '22023';
    end if;

    -- No `on conflict do nothing`: a replay never reaches here (D-WR-03
    -- short-circuits it above), so a duplicate id is a real error.
    insert into public.undo_log (id, owner_id, label_key, label_params, ops)
    values (v_step_id, (select auth.uid()), v_label_key, v_label_params, v_step_ops);
  end if;

  return jsonb_build_object('status', 'applied', 'rows', v_rows);
end;
$$;

revoke execute on function public.apply_patches(jsonb, jsonb) from public, anon;
grant execute on function public.apply_patches(jsonb, jsonb) to authenticated;

-- 5. D-22: record_decide_outcome (4-argument) re-issued from 20261031000100; changed lines marked 06.1 -----------------
-- "Save for it" now makes the goal Locked, linked to the check (already so), and up-front only when the check pays by
-- installments. Same signature; the one undo step still puts the check back to open and removes the goal.
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
  v_up_front boolean := false;  -- 06.1 D-22
  v_price numeric;  -- 06.1 D-22
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
      -- 06.1 D-22: the target is the up-front part of what the check priced, so it never exceeds the price.
      if coalesce(v_check.inputs ->> 'price', '') ~ '^[0-9]{1,14}$' then
        v_price := (v_check.inputs ->> 'price')::numeric;
        if v_price > 0 and (v_goal ->> 'target')::numeric > v_price then
          raise exception 'record_decide_outcome: the goal target is above the price' using errcode = '22023';
        end if;
      end if;
      v_up_front := coalesce(v_check.inputs -> 'pay' ->> 'mode', '') = 'plan';
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
    insert into public.savings_goals (id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by, account_id, locked, up_front_only)  -- 06.1 D-22: locked, linked to the check, up-front only for installments
    values (v_goal_id, v_check.household_id, (select auth.uid()), p_check_id,
            btrim(v_goal ->> 'name'), v_goal ->> 'currency', (v_goal ->> 'target')::bigint,
            v_wait_monthly, v_ready_by, v_account_id, true, v_up_front)
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
