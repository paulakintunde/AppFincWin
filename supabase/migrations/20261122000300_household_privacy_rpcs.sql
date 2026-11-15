-- Phase 8 wave 1b (CMP-F18): every security-definer path obeys personal-unless-shared. Proven by 101 and 103.
-- RLS does not cover functions that run as owner, so each one re-applies the visibility rule of 20261122000100:
-- transactions, accounts, recurring_series are shared-or-owner; debts, recurring_dismissals, income_payer_prompts are
-- owner-only (D-13, D-14, D-16, D-43). Bodies are re-issued from the newest definition on the branch (apply_patches from
-- 20261115000100_category_icon_key.sql). Debt- and goal-linked lines stay personal (08-GATES; enforced by 08-10).

-- 0. Helpers ------------------------------------------------------------------------------------------------
-- True when the account is the user's own or a joint account. A null owner or an ownerless account (created_by cleared by
-- ON DELETE SET NULL) never refuses: nobody can see such an account, so it cannot be a way into another member's data.
create or replace function public.hh_account_usable(p_account uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is null or not exists (select 1 from public.accounts a where a.id = p_account)
      or exists (select 1 from public.accounts a
                  where a.id = p_account and (a.is_shared or a.created_by is null or a.created_by = p_user))
$$;
revoke execute on function public.hh_account_usable(uuid, uuid) from public, anon, authenticated;

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
      elsif v_entity in ('transactions', 'recurring_series', 'accounts') then  -- 08-05: shared-or-owner
        continue when not ((v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())
                           and ((v_row_json ->> 'is_shared')::boolean
                                or (v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid())));
      elsif v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts') then  -- 08-05: owner-only
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
      when 'categories' then array['name', 'color_key', 'archived_at', 'monthly_cap', 'icon_key']  -- 2.2; 261115 (icon_key)
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
        'refine_last_at', 'refine_snooze_until', 'custom_options',
        'answered_no_debts_at', 'answered_net_not_set_at', 'answered_no_rules_at', 'answered_bills_right_at']  -- 05.2, 05.3-81; 261114 (answered undo)
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

    -- 08-05 (CMP-F18): a row the caller may not see is looked up as no row, so another member's personal row gets exactly
    -- the not-found refusal a missing id gets (same status, reason and null fields), and its lock is never taken.
    execute format('select to_jsonb(t) from public.%I t where t.id = $1%s for update', v_entity,
      case
        when v_entity in ('transactions', 'recurring_series', 'accounts') then
          ' and t.household_id in (select public.user_household_ids()) and (t.is_shared or t.created_by = (select auth.uid()))'
        when v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts') then
          ' and t.household_id in (select public.user_household_ids()) and t.created_by = (select auth.uid())'
        else ''
      end)
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
    elsif v_entity in ('transactions', 'recurring_series', 'accounts') then  -- 08-05: shared-or-owner
      if not ((v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())
              and ((v_row_json ->> 'is_shared')::boolean
                   or (v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid()))) then
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
    elsif v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts') then -- 05, 05.2; 08-05: owner-only
      if not ((v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid())
              and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not in a household the caller belongs to', v_idx using errcode = '42501';
      end if;
    else -- categories: owner-only, and a system row (Transfer/Settlement) is never writable (D-34)
      if (v_row_json ->> 'owner_id')::uuid <> (select auth.uid()) or (v_row_json ->> 'is_system')::boolean then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    end if;

    -- 08-05 (D-14, D-18): on a line someone else created, only the named payer may change amount, currency, date and note;
    -- nobody else may change anything (the non-creator's other edits go through the split/category RPCs of 08-10).
    -- A server-recorded undo step (v_system) replays state the caller's own action produced, so it is exempt.
    if v_entity = 'transactions' and not v_system
       and (v_row_json ->> 'created_by') is not null
       and (v_row_json ->> 'created_by')::uuid is distinct from (select auth.uid()) then
      if (select auth.uid()) is distinct from coalesce((v_row_json ->> 'paid_by')::uuid, (v_row_json ->> 'created_by')::uuid)
         or exists (select 1 from jsonb_object_keys(v_patch) k
                     where k <> all (array['original_amount', 'original_currency', 'local_date', 'note'])) then
        raise exception 'shared_line_creator_only' using errcode = '42501';
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
        when 'categories.icon_key' then 'text'  -- 261115
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
        when 'decide_settings.answered_no_debts_at' then 'timestamptz'  -- 261114
        when 'decide_settings.answered_net_not_set_at' then 'timestamptz'  -- 261114
        when 'decide_settings.answered_no_rules_at' then 'timestamptz'  -- 261114
        when 'decide_settings.answered_bills_right_at' then 'timestamptz'  -- 261114
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
                           'recurring_dismissals', 'income_payer_prompts', 'decide_answers', 'holdings', 'holding_lots') then  -- 06
      v_out := v_out || jsonb_build_array(v_op);
      continue;
    end if;

    v_k := coalesce((
      select sum(case when l.allow_system_keys and l.label_key = 'monthAdded' then 0  -- 06: forward and undo both unbumped
                      when l.allow_system_keys then 1  -- 06: a system step's undo does not bump versions
                      else 2 * (select count(*) from jsonb_array_elements(l.ops) o where o ->> 'id' = v_id::text) end)  -- 06
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
      elsif v_entity in ('transactions', 'recurring_series', 'accounts') then  -- 08-05: shared-or-owner
        v_in_scope := (v_row ->> 'household_id')::uuid in (select public.user_household_ids())
                      and ((v_row ->> 'is_shared')::boolean
                           or (v_row ->> 'created_by')::uuid is not distinct from (select auth.uid()));
      elsif v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts') then  -- 08-05: owner-only
        v_in_scope := (v_row ->> 'created_by')::uuid is not distinct from (select auth.uid())
                      and (v_row ->> 'household_id')::uuid in (select public.user_household_ids());
      elsif v_entity = 'category_rules' then
        v_in_scope := (v_row ->> 'scope' = 'personal' and (v_row ->> 'owner_id')::uuid is not distinct from (select auth.uid()))
                      or (v_row ->> 'scope' = 'shared' and (v_row ->> 'household_id')::uuid in (select public.user_household_ids()));
      elsif v_entity = 'decide_settings' then
        v_in_scope := (v_row ->> 'user_id')::uuid is not distinct from (select auth.uid());
      elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals', 'decide_answers', 'holdings', 'holding_lots') then  -- 06
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
       and (is_shared or created_by = (select auth.uid()))  -- 08-05: another member's personal series is out of scope
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
      perform set_config('fincwin.household_rpc', 'on', true);  -- 08-05: a server-recorded step may soft-delete shared lines
      perform set_config('fincwin.system_restamp', 'on', true);
    end if;
    -- 06 review P5-WR-01: an Undo puts back a state that existed, so guard_goal_line_paid lets it turn a goal line paid.
    perform set_config('fincwin.undo_any', 'on', true);  -- 06 review
    v_result := public.apply_patches(public.undo_adjusted_ops(p_step)); -- 05.3 D-15
    perform set_config('fincwin.undo_any', '', true);  -- 06 review
    perform set_config('fincwin.undo_replay', '', true);
    perform set_config('fincwin.household_rpc', '', true);  -- 08-05
    perform set_config('fincwin.system_restamp', '', true);

    if v_result ->> 'status' = 'applied' and cardinality(v_cleanup) > 0 then
      update public.transactions set deleted_at = now()
       where id = any (v_cleanup) and deleted_at is null;
    end if;

    set constraints public.transfer_pair_check immediate;
    set constraints public.transfer_pair_check deferred;
  exception
    when integrity_constraint_violation or insufficient_privilege or invalid_parameter_value then
      perform set_config('fincwin.undo_any', '', true);  -- 06 review
      perform set_config('fincwin.undo_replay', '', true);
    perform set_config('fincwin.household_rpc', '', true);  -- 08-05
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

create or replace function public.undo_log_fill()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e jsonb;
begin
  -- D-CR-02: a step is validated when it is written, not when it is
  -- replayed -- every op must be an object carrying an allowlisted entity,
  -- a uuid id, a positive integer expectedVersion and a non-empty patch
  -- object. apply_patches re-checks all of this (and the column allowlist)
  -- at replay time; this just stops a malformed step ever being stored.
  for e in select value from jsonb_array_elements(new.ops) loop
    if jsonb_typeof(e) is distinct from 'object'
       or (coalesce(e ->> 'entity', '') not in ('transactions', 'categories', 'recurring_series', 'accounts', 'category_rules', 'decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals', 'decide_settings', 'recurring_dismissals', 'income_payer_prompts', 'decide_answers', 'holdings', 'holding_lots') -- 02.3, 05, 05.2, 06
           -- 2.2: households only in a server-recorded step (add-month undo)
           and not (new.allow_system_keys and e ->> 'entity' = 'households'))
       or coalesce(e ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or jsonb_typeof(e -> 'expectedVersion') is distinct from 'number'
       or coalesce(e ->> 'expectedVersion', '') !~ '^[1-9][0-9]{0,8}$'
       or jsonb_typeof(e -> 'patch') is distinct from 'object'
       or e -> 'patch' = '{}'::jsonb then
      raise exception 'undo_log: malformed op in step %', new.id using errcode = '22023';
    end if;
  end loop;

  new.touched_ids := array(select distinct (e2 ->> 'id')::uuid from jsonb_array_elements(new.ops) e2);

  -- D-CR-01: remember how far the materialiser had got for every series
  -- this step touches, so a replay can tell whether the system has added
  -- occurrences since (see undo_replay below).
  new.series_generations := coalesce((
    select jsonb_object_agg(rs.id::text, rs.generation)
      from public.recurring_series rs
     where (rs.is_shared or rs.created_by = (select auth.uid()))  -- 08-05: no generation of another member's personal series
       and rs.id in (
       select (e3 ->> 'id')::uuid from jsonb_array_elements(new.ops) e3
        where e3 ->> 'entity' = 'recurring_series'
     )
  ), '{}'::jsonb);
  return new;
end;
$$;

create or replace function public.create_recurring_series(
  p_series jsonb,
  p_anchor_transaction_id uuid default null,
  p_link_transaction_ids uuid[] default '{}',
  p_undo_step jsonb default null,
  p_anchor_is_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := (p_series ->> 'household_id')::uuid;
  v_series_id uuid := (p_series ->> 'id')::uuid;
  v_anchor_created jsonb := null;
  v_existing public.recurring_series%rowtype;
  v_anchor_date date := nullif(p_series ->> 'anchor_date', '')::date;
  v_anchor_txn public.transactions%rowtype;
  v_time_zone text := p_series ->> 'time_zone';
  v_materialised_through date;
  v_today date;
  v_linked jsonb := '[]'::jsonb;
  v_inserted jsonb := '[]'::jsonb;
begin
  if v_household_id is null or v_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', v_household_id using errcode = '42501';
  end if;

  -- 08-05: the paying account must be the caller's own or a joint account
  if nullif(p_series ->> 'account_id', '') is not null
     and not public.hh_account_usable((p_series ->> 'account_id')::uuid, (select auth.uid())) then
    raise exception 'create_recurring_series: the account is not yours or joint' using errcode = '42501';
  end if;

  select * into v_existing from public.recurring_series where id = v_series_id;
  if found then
    if v_existing.household_id <> v_household_id then
      raise exception 'series % belongs to a different household', v_series_id using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'already-applied', 'series_id', v_series_id);
  end if;

  -- 2026-10-06 user decision: p_anchor_is_new says the anchor row was created
  -- in this same user action, so its undo also removes the anchor. It is only
  -- meaningful with an anchor; a flag with nothing to apply to is malformed.
  if coalesce(p_anchor_is_new, false) and p_anchor_transaction_id is null then
    raise exception 'p_anchor_is_new requires p_anchor_transaction_id' using errcode = '22023';
  end if;

  if p_anchor_transaction_id is not null then
    select * into v_anchor_txn from public.transactions
     where id = p_anchor_transaction_id
       and household_id = v_household_id
       and created_by = (select auth.uid())  -- 08-05: only the caller's own line becomes a series
       and deleted_at is null
       and recurring_series_id is null
     for update;
    if not found then
      raise exception 'anchor transaction % is not eligible to become a series', p_anchor_transaction_id using errcode = '22023';
    end if;
    v_anchor_date := v_anchor_txn.local_date;

    -- W6-13 WR-08: the flag is verified, not trusted. "New" means the anchor
    -- is untouched since it was inserted (version 1: no user edit has bumped
    -- it; FX restamps run under system_restamp and do not) and was inserted
    -- by this caller. Anything else is an existing entry, and making an
    -- existing entry repeat must leave it alone on undo (D-24 amendment).
    if coalesce(p_anchor_is_new, false)
       and (v_anchor_txn.version <> 1 or v_anchor_txn.created_by is distinct from (select auth.uid())) then
      raise exception 'anchor transaction % is not new', p_anchor_transaction_id using errcode = '22023';
    end if;
  end if;

  v_today := (now() at time zone coalesce(v_time_zone, 'UTC'))::date;

  insert into public.recurring_series (
    id, household_id, created_by, updated_by, account_id, name, amount, currency, category_id,
    payment_type, freq, anchor_date, time_zone, end_date, occurrence_count, is_automatic, is_shared -- 2.2: D-02; 08-05: D-16
  ) values (
    v_series_id, v_household_id, (select auth.uid()), (select auth.uid()), (p_series ->> 'account_id')::uuid,
    p_series ->> 'name', (p_series ->> 'amount')::bigint, p_series ->> 'currency',
    nullif(p_series ->> 'category_id', '')::uuid, nullif(p_series ->> 'payment_type', ''),
    p_series ->> 'freq', v_anchor_date, v_time_zone,
    nullif(p_series ->> 'end_date', '')::date, nullif(p_series ->> 'occurrence_count', '')::integer,
    coalesce((p_series ->> 'is_automatic')::boolean, false), -- is_sample is never read from client JSON (T-02.2-10-03)
    coalesce(nullif(p_series ->> 'is_shared', '')::boolean, v_anchor_txn.is_shared, false)  -- 08-05: D-16, the creator's choice
  );

  -- Link the anchor row plus any explicitly requested rows, one per
  -- local_date (first by id) so the caller can never create two occurrence
  -- rows for the same date.
  with candidates as (
    select id from public.transactions
     where household_id = v_household_id
       and created_by = (select auth.uid())  -- 08-05: only the caller's own lines are linked
       and deleted_at is null
       and recurring_series_id is null
       and (id = p_anchor_transaction_id or id = any (p_link_transaction_ids))
  ),
  deduped as (
    select distinct on (t.local_date) t.id, t.local_date
      from public.transactions t join candidates c on c.id = t.id
     order by t.local_date, t.id
  ),
  updated as (
    update public.transactions t
       set recurring_series_id = v_series_id, occurrence_date = t.local_date
      from deduped d
     where t.id = d.id
     returning t.id, t.version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_linked
    from updated;

  select max(local_date) into v_materialised_through
    from public.transactions where recurring_series_id = v_series_id;

  if v_materialised_through is null then
    v_materialised_through := greatest(v_anchor_date, date_trunc('month', v_today)::date) - 1;
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);
  update public.recurring_series set materialised_through = v_materialised_through where id = v_series_id;
  perform set_config('fincwin.system_restamp', '', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', 1)), '[]'::jsonb) into v_inserted
    from public.materialise_series(v_series_id) as id;

  -- The anchor's version is read after the link above, so the undo op's
  -- expectedVersion is the row as this action left it: any later edit makes
  -- the undo refuse (D-26) rather than silently deleting the user's change.
  -- W6-13 WR-08: only an anchor this call actually linked. The link CTE keeps
  -- one row per local_date (smallest id first), so a requested link row on
  -- the anchor's date can win over the anchor; the step must then never
  -- soft-delete the unlinked anchor.
  if coalesce(p_anchor_is_new, false) then
    select jsonb_build_object('id', t.id, 'version', t.version) into v_anchor_created
      from public.transactions t
     where t.id = p_anchor_transaction_id
       and t.recurring_series_id = v_series_id
       and exists (
         select 1 from jsonb_array_elements(v_linked) l where (l ->> 'id')::uuid = t.id
       );
  end if;

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', v_series_id, 'version', 1, 'before', null),
    'inserted', v_inserted,
    'soft_deleted', '[]'::jsonb,
    'linked', v_linked
  ) || case when v_anchor_created is null then '{}'::jsonb
            else jsonb_build_object('anchor_created', v_anchor_created) end);
end;
$$;

create or replace function public.edit_recurring_series_from(
  p_series_id uuid,
  p_expected_version integer,
  p_patch jsonb,
  p_effective_from date,
  p_undo_step jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_before jsonb;
  v_key text;
  v_allowed text[] := array['name', 'amount', 'currency', 'account_id', 'category_id',
    'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'is_automatic', 'end_reason'];  -- 05.2 D-24
  v_soft_deleted jsonb := '[]'::jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_new_version integer;
  v_new_anchor date;
  v_count integer;
  v_used integer := 0;
begin
  select * into s from public.recurring_series where id = p_series_id and deleted_at is null
     and (is_shared or created_by = (select auth.uid())) for update;  -- 08-05: a personal series of another member is not found
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if s.household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', s.household_id using errcode = '42501';
  end if;
  -- D-WR-03: a replay of this same action (its undo step already exists)
  -- is already-applied, not a conflict with its own first attempt.
  if public.undo_step_replayed(p_undo_step) then
    return jsonb_build_object('status', 'already-applied', 'series_id', s.id, 'undo_step_id', p_undo_step ->> 'id');
  end if;
  if s.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'conflict', jsonb_build_object(
        'entity', 'recurring_series', 'id', s.id, 'updated_by', s.updated_by,
        'record_name', s.name, 'builtin_key', null, 'reason', 'changed'
      )
    );
  end if;

  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb then
    raise exception 'edit_recurring_series_from: p_patch must be a non-empty object' using errcode = '22023';
  end if;

  -- D-WR-09: a null effective date is invalid (it used to bump the version
  -- and regenerate nothing); one far in the past is rejected, because the
  -- rewind would re-materialise every occurrence the user deleted since
  -- (tombstones fall outside the occurrence unique index); and one before
  -- the anchor is clamped to it, so a re-anchor never starts the series
  -- earlier than it began.
  if p_effective_from is null then
    raise exception 'edit_recurring_series_from: p_effective_from is required' using errcode = '22023';
  end if;
  if p_effective_from < (date_trunc('month', (now() at time zone s.time_zone)::date) - interval '12 months')::date then
    raise exception 'edit_recurring_series_from: p_effective_from % is too far in the past', p_effective_from using errcode = '22023';
  end if;
  p_effective_from := greatest(p_effective_from, s.anchor_date);

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'unknown recurring_series patch key %', v_key using errcode = '22023';
    end if;
  end loop;

  if nullif(p_patch ->> 'account_id', '') is not null
     and not public.hh_account_usable((p_patch ->> 'account_id')::uuid, (select auth.uid())) then
    raise exception 'edit_recurring_series_from: the account is not yours or joint' using errcode = '42501';  -- 08-05
  end if;

  v_before := (
    select coalesce(jsonb_object_agg(k, to_jsonb(s) -> k), '{}'::jsonb)
      from jsonb_object_keys(p_patch) as k
  );
  if p_patch ? 'freq' and not (p_patch ? 'anchor_date') then
    v_before := v_before || jsonb_build_object('anchor_date', to_jsonb(s.anchor_date));
  end if;

  -- D-WR-05: occurrence_count counts n = 0..count-1 from anchor_date, so
  -- moving the anchor (a freq change re-anchors at p_effective_from, or an
  -- explicit anchor_date) must carry over only what the old schedule had
  -- not yet used -- otherwise the count restarts and a 12-instalment loan
  -- grows extra instalments. An explicit occurrence_count in the patch wins.
  v_new_anchor := case
    when p_patch ? 'anchor_date' then (p_patch ->> 'anchor_date')::date
    when p_patch ? 'freq' then p_effective_from
    else s.anchor_date
  end;
  v_count := case when p_patch ? 'occurrence_count'
                  then nullif(p_patch ->> 'occurrence_count', '')::integer
                  else s.occurrence_count end;
  if v_new_anchor is distinct from s.anchor_date and s.occurrence_count is not null
     and not (p_patch ? 'occurrence_count') then
    while v_used < s.occurrence_count
      and public.recurring_occurrence_date(s.anchor_date, s.freq, v_used) < v_new_anchor loop
      v_used := v_used + 1;
    end loop;
    if v_used >= s.occurrence_count then
      raise exception 'series % has no occurrences left after %', s.id, v_new_anchor using errcode = '22023';
    end if;
    v_count := s.occurrence_count - v_used;
    v_before := v_before || jsonb_build_object('occurrence_count', to_jsonb(s.occurrence_count));
  end if;

  update public.recurring_series set
    name = case when p_patch ? 'name' then (p_patch ->> 'name') else name end,
    amount = case when p_patch ? 'amount' then (p_patch ->> 'amount')::bigint else amount end,
    currency = case when p_patch ? 'currency' then (p_patch ->> 'currency') else currency end,
    account_id = case when p_patch ? 'account_id' then (p_patch ->> 'account_id')::uuid else account_id end,
    category_id = case when p_patch ? 'category_id' then nullif(p_patch ->> 'category_id', '')::uuid else category_id end,
    payment_type = case when p_patch ? 'payment_type' then nullif(p_patch ->> 'payment_type', '') else payment_type end,
    freq = case when p_patch ? 'freq' then (p_patch ->> 'freq') else freq end,
    anchor_date = v_new_anchor,
    end_date = case when p_patch ? 'end_date' then nullif(p_patch ->> 'end_date', '')::date else end_date end,
    occurrence_count = v_count,
    is_automatic = case when p_patch ? 'is_automatic' then (p_patch ->> 'is_automatic')::boolean else is_automatic end, -- 2.2: D-02
    end_reason = case when p_patch ? 'end_reason' then nullif(p_patch ->> 'end_reason', '') else end_reason end, -- 05.2 D-24
    materialised_through = least(coalesce(materialised_through, p_effective_from - 1), p_effective_from - 1)
  where id = p_series_id
  returning version into v_new_version;

  perform set_config('fincwin.household_rpc', 'on', true);  -- 08-05: D-16, a member may edit a shared series
  with to_delete as (
    update public.transactions
       set deleted_at = now()
     where recurring_series_id = p_series_id
       and status = 'pending'
       and deleted_at is null
       and occurrence_date >= p_effective_from
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_soft_deleted
    from to_delete;
  perform set_config('fincwin.household_rpc', '', true);  -- 08-05

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', 1)), '[]'::jsonb) into v_inserted
    from public.materialise_series(p_series_id) as id;

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', p_series_id, 'version', v_new_version, 'before', v_before),
    'inserted', v_inserted,
    'soft_deleted', v_soft_deleted,
    'linked', '[]'::jsonb
  ));
end;
$$;

create or replace function public.end_recurring_series(
  p_series_id uuid,
  p_expected_version integer,
  p_end_date date,
  p_undo_step jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_before jsonb;
  v_soft_deleted jsonb := '[]'::jsonb;
  v_new_version integer;
begin
  select * into s from public.recurring_series where id = p_series_id and deleted_at is null
     and (is_shared or created_by = (select auth.uid())) for update;  -- 08-05: a personal series of another member is not found
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if s.household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', s.household_id using errcode = '42501';
  end if;
  -- D-WR-03: replay of this same action -> already-applied.
  if public.undo_step_replayed(p_undo_step) then
    return jsonb_build_object('status', 'already-applied', 'series_id', s.id, 'undo_step_id', p_undo_step ->> 'id');
  end if;
  if s.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'conflict', jsonb_build_object(
        'entity', 'recurring_series', 'id', s.id, 'updated_by', s.updated_by,
        'record_name', s.name, 'builtin_key', null, 'reason', 'changed'
      )
    );
  end if;
  -- D-WR-09: a null end date used to pass the check below (NULL < x is
  -- NULL) and silently turn "End series" into "remove the end date".
  if p_end_date is null then
    raise exception 'end_recurring_series: p_end_date is required' using errcode = '22023';
  end if;
  if p_end_date < s.anchor_date then
    raise exception 'end_date % is before anchor_date %', p_end_date, s.anchor_date using errcode = '22023';
  end if;

  v_before := jsonb_build_object('end_date', to_jsonb(s.end_date), 'occurrence_count', to_jsonb(s.occurrence_count));

  update public.recurring_series set end_date = p_end_date where id = p_series_id
  returning version into v_new_version;

  perform set_config('fincwin.household_rpc', 'on', true);  -- 08-05: D-16, a member may end a shared series
  with to_delete as (
    update public.transactions
       set deleted_at = now()
     where recurring_series_id = p_series_id
       and status = 'pending'
       and deleted_at is null
       and occurrence_date > p_end_date
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_soft_deleted
    from to_delete;
  perform set_config('fincwin.household_rpc', '', true);  -- 08-05

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', p_series_id, 'version', v_new_version, 'before', v_before),
    'inserted', '[]'::jsonb,
    'soft_deleted', v_soft_deleted,
    'linked', '[]'::jsonb
  ));
end;
$$;

create or replace function public.materialise_series(p_series_id uuid, p_today date default null)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_today date;
  v_through date;
  v_floor date;
  v_date date;
  v_id uuid;
  v_author uuid;
  v_added boolean := false;
  v_tripped boolean := false;
  v_months integer;
  n integer := 0;
  n_start integer := 0;
begin
  select * into s from public.recurring_series
   where id = p_series_id and deleted_at is null
   for update;
  if not found then
    return;
  end if;
  -- 06 review P1-CR-03: a removed goal's contribution and a removed debt's Expected extra write no more lines. remove_goal
  -- and remove_debt stop these series themselves; this covers a goal or debt removed by an older app build's plain patch,
  -- whose new lines could never be confirmed or paid. Undo of that removal brings the goal back, and the next run fills in.
  if s.goal_id is not null  -- 06 review
     and not exists (select 1 from public.savings_goals g where g.id = s.goal_id and g.deleted_at is null) then  -- 06 review
    return;  -- 06 review
  end if;  -- 06 review
  if exists (select 1 from public.debts d where d.extra_series_id = s.id and d.deleted_at is not null) then  -- 06 review
    return;  -- 06 review
  end if;  -- 06 review

  v_today := coalesce(p_today, (now() at time zone s.time_zone)::date);
  -- 2.2 (D-16, user decision 2026-10-09): materialise through the later of the
  -- default horizon and the end of the household's horizon_month, so a series
  -- created after a month was added still reaches it.
  v_through := greatest(
    public.recurring_horizon(v_today),
    coalesce(
      (select (to_date(h.horizon_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
         from public.households h
        where h.id = s.household_id and h.horizon_month is not null),
      public.recurring_horizon(v_today)
    )
  );
  if s.end_date is not null and s.end_date < v_through then
    v_through := s.end_date;
  end if;
  v_floor := greatest(coalesce(s.materialised_through + 1, s.anchor_date), s.anchor_date);
  -- D-WR-01: a series outlives a non-owner author (created_by is ON DELETE
  -- SET NULL), but stamp_fx_rate needs an author profile, so fall back to
  -- the household owner rather than fail every day from then on.
  v_author := coalesce(s.created_by, (select h.owner_id from public.households h where h.id = s.household_id));

  -- D-IN-06: start one step below the first n that can reach v_floor
  -- (occurrence dates never decrease in n, and every n below this one is
  -- dated before v_floor) instead of at n = 0, so the 5000-step guard bounds
  -- the work done per run rather than the series' whole lifetime. n stays
  -- absolute, so occurrence_count is still counted from the anchor.
  v_months := ((extract(year from v_floor) - extract(year from s.anchor_date)) * 12
               + (extract(month from v_floor) - extract(month from s.anchor_date)))::integer;
  n_start := greatest(0, case s.freq
    when 'weekly' then (v_floor - s.anchor_date) / 7
    when 'fortnightly' then (v_floor - s.anchor_date) / 14
    when 'monthly' then v_months
    when 'quarterly' then v_months / 3
    when 'yearly' then v_months / 12
    else 0
  end - 1);
  n := n_start;

  loop
    exit when s.occurrence_count is not null and n >= s.occurrence_count;
    if n - n_start > 5000 then -- hard guard (T-02-08-05): no series ever loops unbounded
      v_tripped := true;
      exit;
    end if;
    v_date := public.recurring_occurrence_date(s.anchor_date, s.freq, n);
    exit when v_date > v_through;

    if v_date >= v_floor then
      insert into public.transactions (
        id, household_id, account_id, created_by, original_amount, original_currency,
        local_date, time_zone, name, category_id, payment_type, status, recurring_series_id, occurrence_date,
        is_automatic, is_sample, goal_id, is_shared -- 2.2: D-02, D-09; 06: D-25; 08-05: D-16
      ) values (
        gen_random_uuid(), s.household_id, s.account_id, v_author, s.amount, s.currency,
        v_date, s.time_zone, s.name, s.category_id, s.payment_type, 'pending', s.id, v_date,
        s.is_automatic, s.is_sample, s.goal_id, s.is_shared -- 06: D-25; 08-05: lines copy is_shared from the series, created_by is the series creator (v_author)
      )
      on conflict (recurring_series_id, occurrence_date) where recurring_series_id is not null and deleted_at is null
      do nothing
      returning id into v_id;

      if v_id is not null then
        v_added := true;
        return next v_id;
      end if;
    end if;

    n := n + 1;
  end loop;

  -- D-CR-01: generation moves whenever this run adds rows, so a stored undo
  -- step for a template edit/end can tell that the occurrence set it was
  -- built against has grown since (apply_undo_step refuses it, D-26).
  -- D-IN-06: if the guard tripped, the high-water mark only moves as far as
  -- the last date actually generated, never silently past skipped dates.
  if v_tripped then
    raise warning 'materialise_series %: step guard tripped before %', s.id, v_through;
    v_through := least(v_through, v_date);
  end if;

  if v_through > coalesce(s.materialised_through, '-infinity'::date) or v_added then
    perform set_config('fincwin.system_restamp', 'on', true);
    update public.recurring_series
       set materialised_through = greatest(v_through, coalesce(materialised_through, v_through)),
           generation = generation + case when v_added then 1 else 0 end
     where id = s.id;
    perform set_config('fincwin.system_restamp', '', true);
  end if;

  return;
end;
$$;

-- reviewed, no change: public.record_entry_list (its row check already requires created_by = auth.uid(); it calls create_recurring_series above)

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
     and (s.is_shared or s.created_by = (select auth.uid()))  -- 08-05: never clone or touch another member's personal series
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

create or replace function public.seed_sample_data(p_household_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_home text;
  v_exp int;
  v_mult numeric;
  v_month date;
  v_m date;
  v_last int;
  v_tz text;
  v_i int;
  v_acct_main uuid := gen_random_uuid();
  v_acct_card uuid := gen_random_uuid();
  v_acct_cash uuid := gen_random_uuid();
  v_acct_sav uuid := gen_random_uuid();   -- 05
  v_acct_inv uuid := gen_random_uuid();   -- 05
  v_series uuid := gen_random_uuid();
  v_transfer_cat uuid;
  v_n int := 0;
  v_k int;
begin
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;
  if p_today is null or abs(p_today - current_date) > 2 then
    raise exception 'p_today must be within 2 days of today' using errcode = '22023';
  end if;
  if public.sample_data_exists(p_household_id) then
    return jsonb_build_object('status', 'already-seeded');
  end if;

  select p.home_currency into v_home from public.profiles p where p.id = v_user;
  if v_home is null then
    raise exception 'no profile for user' using errcode = '42501';
  end if;
  v_exp := public.currency_exponent(v_home, v_user);
  v_mult := coalesce(
    (('{"JPY":150,"KRW":1300,"INR":80,"IDR":15000,"VND":25000,"HUF":350,"CLP":900,"COP":4000,"NGN":1500,"PKR":280,"LKR":300,"PHP":55,"THB":35,"TWD":32,"CZK":23,"SEK":10,"NOK":10,"DKK":7,"ZAR":18,"MXN":18,"BRL":5,"TRY":30,"RUB":90,"UAH":40,"EGP":48}'::jsonb) ->> v_home)::numeric,
    1);

  v_month := date_trunc('month', p_today)::date;
  -- demo:pastMonths=6

  select t.time_zone into v_tz from public.transactions t
   where t.household_id = p_household_id and t.created_by = v_user order by t.created_at desc limit 1;  -- 08-05: own lines only
  v_tz := coalesce(v_tz, 'UTC');

  select c.id into v_transfer_cat from public.categories c where c.owner_id = v_user and c.builtin_key = 'Transfer';

  -- Accounts. 05: Savings and Investments added.
  insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, credit_limit, is_sample)
  values
    (v_acct_main, p_household_id, v_user, 'Everyday account', 'checking', v_home,
       (round(2400 * v_mult) * 10 ^ v_exp)::bigint, null, true),   -- demo:account.everyday.opening=2400
    (v_acct_card, p_household_id, v_user, 'Credit card', 'credit', v_home,
       0, (round(3000 * v_mult) * 10 ^ v_exp)::bigint, true),
    (v_acct_cash, p_household_id, v_user, 'Cash', 'cash', v_home,
       (round(80 * v_mult) * 10 ^ v_exp)::bigint, null, true),   -- demo:account.cash.opening=80
    (v_acct_sav, p_household_id, v_user, 'Savings', 'savings', v_home,
       (round(7200 * v_mult) * 10 ^ v_exp)::bigint, null, true),   -- demo:account.savings.opening=7200
    (v_acct_inv, p_household_id, v_user, 'Investments', 'investment', v_home,
       (round(2000 * v_mult) * 10 ^ v_exp)::bigint, null, true);   -- demo:account.investments.opening=2000

  -- 05: the confirmed monthly Salary series (OQ-A7): anchored on the 5th of the first seeded month, materialised through the
  -- end of the current month (the daily job carries it on from there). Occurrences inherit is_sample.
  insert into public.recurring_series (
    id, household_id, created_by, account_id, name, amount, currency, category_id,
    freq, anchor_date, time_zone, materialised_through, is_sample
  ) values (
    v_series, p_household_id, v_user, v_acct_main, 'Salary',
    (round(4400 * v_mult) * 10 ^ v_exp)::bigint, v_home,   -- demo:salary.major=4400
    (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = 'Income'),
    'monthly',
    (v_month - interval '6 months')::date + (5 - 1),   -- demo:salary.day=5
    v_tz, (v_month + interval '1 month' - interval '1 day')::date, true
  );

  -- 05: the current month and the 6 months before it (part 2, OQ-A7), one template for every month.
  for v_i in 0..6 loop
    v_m := (v_month - make_interval(months => v_i))::date;
    v_last := extract(day from (v_m + interval '1 month' - interval '1 day'))::int;

    -- Salary, linked to the series the way materialised occurrences are.
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample, recurring_series_id, occurrence_date
    ) values (
      gen_random_uuid(), p_household_id, v_acct_main, v_user,
      (round(4400 * v_mult) * 10 ^ v_exp)::bigint, v_home,
      v_m + (least(5, v_last) - 1), v_tz, 'Salary',
      (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = 'Income'),
      case when v_m + (least(5, v_last) - 1) <= p_today then 'paid' else 'pending' end,
      true, v_series, v_m + (least(5, v_last) - 1)
    );
    v_n := v_n + 1;

    with raw (idx, day, name, major, key) as (values
      (0,
        2,  -- demo:template.0.day=2
        'Rent',
        -1600,  -- demo:template.0.major=-1600
        'Housing'),
      (1,
        4,  -- demo:template.1.day=4
        'Weekly shop',
        -140,  -- demo:template.1.major=-140
        'Groceries'),
      (2,
        11,  -- demo:template.2.day=11
        'Weekly shop',
        -140,  -- demo:template.2.major=-140
        'Groceries'),
      (3,
        18,  -- demo:template.3.day=18
        'Weekly shop',
        -140,  -- demo:template.3.major=-140
        'Groceries'),
      (4,
        25,  -- demo:template.4.day=25
        'Weekly shop',
        -140,  -- demo:template.4.major=-140
        'Groceries'),
      (5,
        6,  -- demo:template.5.day=6
        'Utilities',
        -170,  -- demo:template.5.major=-170
        'Utilities'),
      (6,
        8,  -- demo:template.6.day=8
        'Transport',
        -220,  -- demo:template.6.major=-220
        'Transport'),
      (7,
        12,  -- demo:template.7.day=12
        'Dining out',
        -180,  -- demo:template.7.major=-180
        'Dining'),
      (8,
        1,  -- demo:template.8.day=1
        'Subscriptions',
        -40,  -- demo:template.8.major=-40
        'Subscriptions'),
      (9,
        20,  -- demo:template.9.day=20
        'Insurance',
        -150,  -- demo:template.9.major=-150
        'Insurance'),
      (10,
        22,  -- demo:template.10.day=22
        'Student loan',
        -190,  -- demo:template.10.major=-190
        'Debt')
    )
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample
    )
    select gen_random_uuid(), p_household_id, v_acct_main, v_user,
           (round(r.major * v_mult) * 10 ^ v_exp)::bigint, v_home,
           v_m + (least(r.day, v_last) - 1), v_tz, r.name,
           (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = r.key),
           case when v_m + (least(r.day, v_last) - 1) <= p_today then 'paid' else 'pending' end,
           true
      from raw r;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;

    -- Savings transfer (two legs sharing a transfer_id) on the 3rd.
    with t (tid) as (select gen_random_uuid())
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample, transfer_id
    )
    select gen_random_uuid(), p_household_id, leg.acct, v_user,
           (round(leg.major * v_mult) * 10 ^ v_exp)::bigint, v_home,
           v_m + (least(3, v_last) - 1), v_tz, 'To savings', v_transfer_cat,
           case when v_m + (least(3, v_last) - 1) <= p_today then 'paid' else 'pending' end,
           true, t.tid
      from t,
           (values (v_acct_main, -500), (v_acct_sav, 500)) as leg (acct, major);   -- demo:transfer.savings=500
    v_n := v_n + 2;

    -- Investment transfer on the 3rd.
    with t (tid) as (select gen_random_uuid())
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample, transfer_id
    )
    select gen_random_uuid(), p_household_id, leg.acct, v_user,
           (round(leg.major * v_mult) * 10 ^ v_exp)::bigint, v_home,
           v_m + (least(3, v_last) - 1), v_tz, 'To investments', v_transfer_cat,
           case when v_m + (least(3, v_last) - 1) <= p_today then 'paid' else 'pending' end,
           true, t.tid
      from t,
           (values (v_acct_main, -400), (v_acct_inv, 400)) as leg (acct, major);   -- demo:transfer.investing=400
    v_n := v_n + 2;
  end loop;

  -- 05: debts. The Student loan, and the Credit card's terms row (D-40: paid in full every month adds no minimum).
  insert into public.debts (id, household_id, created_by, name, kind, currency, balance, apr, minimum_payment, secured, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, 'Student loan', 'loan', v_home,
    (round(6200 * v_mult) * 10 ^ v_exp)::bigint,   -- demo:debt.balance=6200
    '5.5',   -- demo:debt.apr=5.5
    (round(190 * v_mult) * 10 ^ v_exp)::bigint,   -- demo:debt.minimum=190
    false, true);
  insert into public.debts (id, household_id, created_by, account_id, name, kind, currency, balance, apr, minimum_payment, secured,
                            min_percent, min_interest_added, min_floor, paid_in_full, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, v_acct_card, 'Credit card', 'card', v_home, 0, null, 0, false,
    null, null, null, true, true);   -- demo:cardDebt.paidInFull=true

  -- 05: the typed limits the demo needs. investing_floor 0 (05-18 deviation 1); a row the user already has is kept.
  -- A new row is marked seeded (the guard trigger honours fincwin.decide_seed); an existing row is never marked.
  perform set_config('fincwin.decide_seed', 'on', true);
  insert into public.decide_settings (user_id, currency, investing_floor, seeded)
  values (v_user, v_home, 0, true)   -- demo:settings.investingFloor=0
  on conflict (user_id) do update set investing_floor = 0 where public.decide_settings.investing_floor is null;
  perform set_config('fincwin.decide_seed', '', true);

  -- 05: the two open checks.
  insert into public.decide_checks (id, household_id, created_by, kind, name, inputs, status, furthest_step, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, 'buy', 'Sofa',
    -- demo:sofaInputs={"name":"Sofa","itemType":"general","advertised":180000,"method":"cash","combine":false}
    '{"name":"Sofa","itemType":"general","advertised":180000,"method":"cash","combine":false}'::jsonb,
    'open', 3, true);
  insert into public.decide_checks (id, household_id, created_by, kind, name, inputs, status, furthest_step, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, 'buy', 'Car',
    -- demo:carInputs={"name":"Car","itemType":"vehicle","advertised":1450000,"method":"loan","combine":true,"loan":{"deposit":700000,"termMonths":24,"aprText":"6.9","secured":true},"runningCosts":[{"name":"Insurance","amount":16000,"category":"insurance"},{"name":"Fuel","amount":14000,"category":"fuel"},{"name":"Parking","amount":6000,"category":null}],"replaces":[{"name":"Bus pass","amount":12000,"category":null}]}
    '{"name":"Car","itemType":"vehicle","advertised":1450000,"method":"loan","combine":true,"loan":{"deposit":700000,"termMonths":24,"aprText":"6.9","secured":true},"runningCosts":[{"name":"Insurance","amount":16000,"category":"insurance"},{"name":"Fuel","amount":14000,"category":"fuel"},{"name":"Parking","amount":6000,"category":null}],"replaces":[{"name":"Bus pass","amount":12000,"category":null}]}'::jsonb,
    'open', 3, true);

  return jsonb_build_object('status', 'applied', 'accounts', 5, 'transactions', v_n, 'series', 1, 'checks', 2, 'debts', 2);
end;
$$;

-- 08-05: sample data acts only on rows the caller created (a member clearing theirs must not clear another member's).
create or replace function public.clear_sample_data(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tx int := 0;
  v_series int := 0;
  v_accts int := 0;
  v_cats int := 0;
  v_checks int := 0;
  v_debts int := 0;
  v_kept int := 0;
  k int;
begin
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);

  -- 05: sample checks, their links and both sample debts rows go first. User-made checks, debts and rows written by
  -- Go ahead (never is_sample) are untouched.
  delete from public.decide_links where check_id in (select id from public.decide_checks where household_id = p_household_id and created_by = v_user and is_sample);
  with d as (
    delete from public.decide_checks where household_id = p_household_id and created_by = v_user and is_sample returning 1
  ) select count(*) into v_checks from d;
  with d as (
    delete from public.debts where household_id = p_household_id and created_by = v_user and is_sample returning 1
  ) select count(*) into v_debts from d;
  -- 05: the seed's typed limits row goes with the sample figures, only while it is still marked seeded (a user edit clears the mark).
  delete from public.decide_settings where user_id = v_user and seeded;

  -- Transactions still flagged, soft-deleted ones included.
  with d as (
    delete from public.transactions where household_id = p_household_id and created_by = v_user and is_sample returning 1
  ) select count(*) into v_tx from d;

  -- Series: delete when no row references them, else convert.
  with d as (
    delete from public.recurring_series s
     where s.household_id = p_household_id and s.created_by = v_user and s.is_sample
       and not exists (select 1 from public.transactions t where t.recurring_series_id = s.id)
    returning 1
  ) select count(*) into v_series from d;
  update public.recurring_series set is_sample = false
   where household_id = p_household_id and created_by = v_user and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  -- Accounts.
  with d as (
    delete from public.accounts a
     where a.household_id = p_household_id and a.created_by = v_user and a.is_sample
       and not exists (select 1 from public.transactions t where t.account_id = a.id)
       and not exists (select 1 from public.recurring_series s where s.account_id = a.id)
    returning 1
  ) select count(*) into v_accts from d;
  update public.accounts set is_sample = false
   where household_id = p_household_id and created_by = v_user and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  -- Categories owned by the caller.
  with d as (
    delete from public.categories c
     where c.owner_id = v_user and c.is_sample
       and not exists (select 1 from public.transactions t where t.category_id = c.id)
       and not exists (select 1 from public.recurring_series s where s.category_id = c.id)
    returning 1
  ) select count(*) into v_cats from d;
  update public.categories set is_sample = false
   where owner_id = v_user and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  perform set_config('fincwin.system_restamp', '', true);

  return jsonb_build_object('status', 'applied', 'transactions', v_tx, 'series', v_series,
                            'accounts', v_accts, 'categories', v_cats, 'checks', v_checks, 'debts', v_debts, 'kept', v_kept);
end;
$$;

-- reviewed, no change: public.redate_sample_data_if_stale (security invoker, reads through RLS, then calls clear/seed above)
-- reviewed, no change: public.sample_data_exists (security invoker; RLS now limits it to the caller's own and shared rows)

-- reviewed, no change: public.record_decide_outcome (the check must be created_by = auth.uid(); the Wait goal is the caller's own)
-- reviewed, no change: public.record_decide_go (the check must be the caller's; the line is inserted with created_by = auth.uid() and guard_transaction_account below checks its account)
-- reviewed, no change: public.guard_transaction_time_zone (reads no row)
-- reviewed, no change: public.guard_account_currency (reads no row)
-- reviewed, no change: public.guard_recurring_series (reads only the caller's category)
-- reviewed, no change: public.guard_recurring_dismissal (owner-only table; RLS and created_by pin it)
-- reviewed, no change: public.guard_income_payer_prompt (owner-only table; RLS and created_by pin it)
-- reviewed, no change: public.guard_category_rule (reads no other row)
-- reviewed, no change: public.guard_decide_check, public.guard_decide_link, public.guard_decide_change, public.guard_decide_answer (owner-private tables)

create or replace function public.guard_decide_settings_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.reserve_account_id is not null and not exists (
       select 1 from public.accounts a
        where a.id = new.reserve_account_id and a.household_id in (select public.user_household_ids())) then
    raise exception 'decide_settings: account is not in your household' using errcode = '42501';
  end if;
  -- 08-05: the reserve account is the caller's own or a joint account (checked when it is set or changed)
  if new.reserve_account_id is not null
     and (tg_op = 'INSERT' or new.reserve_account_id is distinct from old.reserve_account_id)
     and not public.hh_account_usable(new.reserve_account_id, new.user_id) then
    raise exception 'decide_settings: account is not yours or joint' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_debt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and not exists (
       select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'debts: account is not in this household' using errcode = '42501';
  end if;
  if new.series_id is not null and not exists (
       select 1 from public.recurring_series s where s.id = new.series_id and s.household_id = new.household_id) then
    raise exception 'debts: series is not in this household' using errcode = '42501';
  end if;
  -- 08-05: a debt's account is the owner's own or joint, and its series is the owner's own (checked when set or changed)
  if new.account_id is not null and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'debts: account is not yours or joint' using errcode = '42501';
  end if;
  if new.series_id is not null and new.created_by is not null and (tg_op = 'INSERT' or new.series_id is distinct from old.series_id)
     and not exists (select 1 from public.recurring_series s where s.id = new.series_id and s.created_by = new.created_by) then
    raise exception 'debts: series is not yours' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    if new.created_by is not null then new.created_by := old.created_by; end if;
    if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' and new.check_id is not null then  -- WR-A01
      new.check_id := old.check_id;
    end if;
    new.updated_at := now();
  end if;
  -- R18.4: a card is never housing; otherwise the flag turns ON (never off) from the old signals, on insert and
  -- on a server-run update that sets series_id or check_id.
  if new.kind = 'card' then
    new.is_housing := false;
  elsif not new.is_housing
        and (tg_op = 'INSERT' or coalesce(current_setting('fincwin.decide_rpc', true), '') = 'on')
        and (new.series_id is not null or new.check_id is not null)
        and (exists (select 1 from public.recurring_series s join public.categories c on c.id = s.category_id
                      where s.id = new.series_id and c.builtin_key = 'Housing')
             or exists (select 1 from public.decide_checks k
                         where k.id = new.check_id and k.inputs ->> 'itemType' = 'property')) then
    new.is_housing := true;
  end if;
  return new;
end;
$$;

create or replace function public.guard_savings_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('fincwin.decide_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_rpc then new.kind := 'pot'; end if;
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    if new.is_safety_net then new.locked := true; end if;  -- 06
    if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
      raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
    end if;  -- 05.2
    -- 06: compare to the stamped created_by (auth.uid() for every client; clients have no created_by grant), so the
    -- Wait RPC and owner-role writers with no JWT still link their own check. Same rule as guard_holding_lot.
    if new.account_id is not null and not public.hh_account_usable(new.account_id, new.created_by) then  -- 08-05
      raise exception 'savings_goals: account is not yours or joint' using errcode = '42501';
    end if;
    if new.check_id is not null and not exists (select 1 from public.decide_checks c where c.id = new.check_id and c.household_id = new.household_id and c.created_by = new.created_by) then  -- 06
      raise exception 'savings_goals: check is not yours' using errcode = '42501';  -- 06
    end if;  -- 06
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  new.kind := old.kind;
  new.bucket := old.bucket;  -- 05.2
  if new.created_by is not null then new.created_by := old.created_by; end if;
  if new.check_id is not null then new.check_id := old.check_id; end if;  -- WR-A01: only SET NULL may land
  -- 06: the safety-net flag moves only inside set_safety_net (D-29) or an undo replay of that swap
  if coalesce(current_setting('fincwin.safety_net_rpc', true), '') <> 'on'
     and coalesce(current_setting('fincwin.undo_replay', true), '') <> 'on' then  -- 06
    new.is_safety_net := old.is_safety_net;  -- 06
  end if;  -- 06
  if new.is_safety_net then new.locked := true; end if;  -- 06
  if old.is_safety_net and new.deleted_at is not null and old.deleted_at is null then  -- 06
    raise exception 'savings_goals: the safety net cannot be removed' using errcode = '42501';  -- 06
  end if;  -- 06
  if old.kind = 'pot' then
    new.currency := old.currency;
    -- 06: monthly_amount is editable on every pot (D-17, D-20); the 05.2 pin for non-bucket pots is gone
  elsif not v_rpc then
    new.name := old.name;
    new.currency := old.currency;
    new.target := old.target;
    new.monthly_amount := old.monthly_amount;
    new.ready_by := old.ready_by;
    new.opening_saved := old.opening_saved;
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
    raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
  end if;  -- 05.2
  if new.account_id is not null and new.account_id is distinct from old.account_id  -- 08-05
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'savings_goals: account is not yours or joint' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.guard_holding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
  else
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    new.created_by := old.created_by;
    new.currency := old.currency;
    if coalesce(current_setting('fincwin.holding_sync', true), '') <> 'on' then
      new.value := old.value;
      new.value_as_of := old.value_as_of;
    end if;
    new.updated_at := now();
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'holdings: account is not in this household' using errcode = '42501';
  end if;
  if new.paid_from_account_id is not null and not exists (select 1 from public.accounts a where a.id = new.paid_from_account_id and a.household_id = new.household_id) then
    raise exception 'holdings: paid-from account is not in this household' using errcode = '42501';
  end if;
  -- 08-05: the accounts are the owner's own or joint (checked when set or changed)
  if new.account_id is not null and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'holdings: account is not yours or joint' using errcode = '42501';
  end if;
  if new.paid_from_account_id is not null and (tg_op = 'INSERT' or new.paid_from_account_id is distinct from old.paid_from_account_id)
     and not public.hh_account_usable(new.paid_from_account_id, new.created_by) then
    raise exception 'holdings: paid-from account is not yours or joint' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.guard_transaction_debt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.debt_id is not null
     and (tg_op = 'INSERT' or new.debt_id is distinct from old.debt_id) then
    if not exists (
      select 1 from public.debts d
       where d.id = new.debt_id
         and d.household_id = new.household_id
         and (new.created_by is null or d.created_by = new.created_by)) then  -- 08-05: only the line creator's own debt
      raise exception 'transactions: debt is not in this household' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_series_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.goal_id is not null and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id) then
    if not exists (
      select 1 from public.savings_goals g
       where g.id = new.goal_id
         and g.household_id = new.household_id
         and g.deleted_at is null
         and g.created_by = new.created_by) then  -- 08-05: the goal belongs to the series creator, whoever edits it
      raise exception 'recurring_series: goal is not one of your live goals in this household' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.record_debt_one_off(p_debt_id uuid, p_payment jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_debt public.debts%rowtype;
  v_id uuid;
  v_account uuid;
  v_date date;
  v_amount bigint;
  v_category uuid;
begin
  v_step_id := public.grow_check_undo_step(p_undo_step, 'debtOneOffRecorded', 'record_debt_one_off');
  if v_uid is null then
    raise exception 'record_debt_one_off: not signed in' using errcode = '42501';
  end if;

  -- A replay of the same step (the offline queue) writes nothing.
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  if jsonb_typeof(p_payment) is distinct from 'object' then
    raise exception 'record_debt_one_off: p_payment is required' using errcode = '22023';
  end if;
  begin
    v_id := (p_payment ->> 'id')::uuid;
    v_account := (p_payment ->> 'account_id')::uuid;
    v_date := (p_payment ->> 'local_date')::date;
  exception when others then
    raise exception 'record_debt_one_off: the payment is malformed' using errcode = '22023';
  end;
  if v_id is null or v_account is null or v_date is null
     or jsonb_typeof(p_payment -> 'amount') is distinct from 'number'
     or coalesce(p_payment ->> 'amount', '') !~ '^[0-9]{1,14}$'
     or (p_payment ->> 'amount')::bigint not between 1 and 10000000000000
     or coalesce(p_payment ->> 'currency', '') !~ '^[A-Z0-9]{2,4}$'
     or char_length(coalesce(p_payment ->> 'time_zone', '')) not between 1 and 64
     or char_length(btrim(coalesce(p_payment ->> 'name', ''))) not between 1 and 200 then  -- 06 review P3-WR-07: cut to 80 below
    raise exception 'record_debt_one_off: the payment is malformed' using errcode = '22023';
  end if;
  v_amount := (p_payment ->> 'amount')::bigint;

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found or v_debt.created_by is distinct from (select auth.uid())  -- 08-05: owner-only, refused like a missing debt
     or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'record_debt_one_off: the debt is not in your household' using errcode = '42501';
  end if;
  if v_debt.deleted_at is not null or v_debt.paid_off_on is not null then
    raise exception 'record_debt_one_off: the debt is already paid off or removed' using errcode = '22023';
  end if;
  if v_amount > v_debt.balance then
    raise exception 'record_debt_one_off: the payment is more than the debt' using errcode = '22023';
  end if;
  -- 06 review P1-WR-03: the balance is in the debt's currency, so the payment is too (a 0-decimal yen line must never
  -- move a dollar balance by its raw minor units).
  if p_payment ->> 'currency' is distinct from v_debt.currency then  -- 06 review
    raise exception 'record_debt_one_off: the payment must be in the debt''s currency' using errcode = '22023';  -- 06 review
  end if;  -- 06 review

  if not exists (select 1 from public.accounts a
                  where a.id = v_account and a.household_id = v_debt.household_id and a.deleted_at is null
                    and public.hh_account_usable(a.id, (select auth.uid()))) then
    raise exception 'record_debt_one_off: the account is not in your household' using errcode = '42501';
  end if;

  -- Category: the one sent when the caller owns it, else the debt payment series' category (record_debt_sale rule).
  v_category := nullif(p_payment ->> 'category_id', '')::uuid;
  if v_category is not null
     and not exists (select 1 from public.categories c where c.id = v_category and c.owner_id = v_uid) then
    v_category := null;
  end if;
  if v_category is null and v_debt.series_id is not null then
    select s.category_id into v_category
      from public.recurring_series s
      join public.categories c on c.id = s.category_id
     where s.id = v_debt.series_id and c.owner_id = v_uid;
  end if;

  insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                   local_date, time_zone, name, category_id, status, debt_id)
  values (v_id, v_debt.household_id, v_account, v_uid, -v_amount, p_payment ->> 'currency', v_date,
          p_payment ->> 'time_zone', public.grow_line_name(p_payment ->> 'name'), v_category, 'pending', p_debt_id);  -- 06 review P3-WR-07

  -- Undo removes the line (record_debt_sale op shape). No system column is patched, so allow_system_keys stays off.
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtOneOffRecorded', coalesce(p_undo_step -> 'label_params', '{}'::jsonb),
          jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', v_id, 'expectedVersion', 1,
                                               'patch', jsonb_build_object('deleted_at', '$now'))));

  return jsonb_build_object('status', 'applied', 'transaction_id', v_id, 'undo_step_id', v_step_id);
end;
$$;

create or replace function public.record_debt_sale(
  p_debt_id uuid,
  p_expected_version integer,
  p_sale jsonb,
  p_payment jsonb,
  p_undo_step jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_debt public.debts%rowtype;
  v_leg jsonb;
  v_label text;
  v_id uuid;
  v_account uuid;
  v_category uuid;
  v_date date;
  v_sale_id uuid;
  v_payment_id uuid;
  v_payment_amount bigint := 0;
  v_paid_off boolean := false;
  v_still_owed bigint;
  v_series public.recurring_series%rowtype;
  v_sid uuid;
  v_changes jsonb := '[]'::jsonb;
  v_change jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_new_version integer;
  v_paid_off_on date;
  v_more jsonb;  -- 06 review P1-WR-07
begin
  v_step_id := public.grow_check_undo_step(p_undo_step, 'debtSaleRecorded', 'record_debt_sale');
  if v_uid is null then
    raise exception 'record_debt_sale: not signed in' using errcode = '42501';
  end if;
  if jsonb_typeof(p_sale) is distinct from 'object' then
    raise exception 'record_debt_sale: p_sale is required' using errcode = '22023';
  end if;
  if p_payment is not null and jsonb_typeof(p_payment) not in ('object', 'null') then
    raise exception 'record_debt_sale: p_payment must be an object or null' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payment) = 'null' then
    p_payment := null;
  end if;

  -- Shape of both legs, before anything is locked or written.
  foreach v_label in array array['sale', 'payment'] loop
    v_leg := case v_label when 'sale' then p_sale else p_payment end;
    continue when v_leg is null;
    begin
      v_id := (v_leg ->> 'id')::uuid;
      v_account := (v_leg ->> 'account_id')::uuid;
      v_date := (v_leg ->> 'local_date')::date;
    exception when others then
      raise exception 'record_debt_sale: the % is malformed', v_label using errcode = '22023';
    end;
    if v_id is null or v_account is null or v_date is null
       or jsonb_typeof(v_leg -> 'amount') is distinct from 'number'
       or coalesce(v_leg ->> 'amount', '') !~ '^[0-9]{1,14}$'
       or (v_leg ->> 'amount')::bigint not between 1 and 10000000000000
       or coalesce(v_leg ->> 'currency', '') !~ '^[A-Z0-9]{2,4}$'
       or char_length(coalesce(v_leg ->> 'time_zone', '')) not between 1 and 64
       or char_length(btrim(coalesce(v_leg ->> 'name', ''))) not between 1 and 200 then  -- 06 review P3-WR-07: cut to 80 below
      raise exception 'record_debt_sale: the % is malformed', v_label using errcode = '22023';
    end if;
  end loop;
  if p_payment is not null and (p_payment ->> 'id') = (p_sale ->> 'id') then
    raise exception 'record_debt_sale: the sale and payment ids must differ' using errcode = '22023';
  end if;

  select * into v_debt from public.debts where id = p_debt_id and deleted_at is null for update;
  if not found or v_debt.created_by is distinct from (select auth.uid())  -- 08-05: owner-only, refused like a missing debt
     or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'record_debt_sale: the debt is not in your household' using errcode = '42501';
  end if;

  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id,
                              'version', v_debt.version);  -- 06 review P3-WR-01
  end if;
  if v_debt.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;
  -- 06 review P1-WR-03: the final payment comes off a balance kept in the debt's currency, so it is in that currency.
  if p_payment is not null and p_payment ->> 'currency' is distinct from v_debt.currency then  -- 06 review
    raise exception 'record_debt_sale: the payment must be in the debt''s currency' using errcode = '22023';  -- 06 review
  end if;  -- 06 review

  if not exists (select 1 from public.accounts a
                  where a.id = (p_sale ->> 'account_id')::uuid and a.household_id = v_debt.household_id and a.deleted_at is null
                    and public.hh_account_usable(a.id, (select auth.uid())))
     or (p_payment is not null and not exists (
           select 1 from public.accounts a
            where a.id = (p_payment ->> 'account_id')::uuid and a.household_id = v_debt.household_id and a.deleted_at is null
                    and public.hh_account_usable(a.id, (select auth.uid())))) then
    raise exception 'record_debt_sale: the account is not in your household' using errcode = '42501';
  end if;

  -- The sale: money in. 06 review P5-WR-05: linked to the debt, so it shows under the debt and Decide reads it as the
  -- one-time money in of a sale, never as pay. Money in never moves the balance (debt_balance_follows_line).
  v_sale_id := (p_sale ->> 'id')::uuid;
  insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                   local_date, time_zone, name, status, debt_id)  -- 06 review
  values (v_sale_id, v_debt.household_id, (p_sale ->> 'account_id')::uuid, v_uid, (p_sale ->> 'amount')::bigint,
          p_sale ->> 'currency', (p_sale ->> 'local_date')::date, p_sale ->> 'time_zone',
          public.grow_line_name(p_sale ->> 'name'), 'paid', p_debt_id);  -- 06 review P3-WR-07, P5-WR-05

  v_still_owed := v_debt.balance;
  v_new_version := v_debt.version;  -- 06 review P3-WR-01: unchanged unless the debt is paid off below
  if p_payment is not null then
    v_payment_id := (p_payment ->> 'id')::uuid;
    v_payment_amount := (p_payment ->> 'amount')::bigint;
    v_category := nullif(p_payment ->> 'category_id', '')::uuid;
    if v_category is null and v_debt.series_id is not null then
      select s.category_id into v_category
        from public.recurring_series s
        join public.categories c on c.id = s.category_id
       where s.id = v_debt.series_id and c.owner_id = v_uid;
    end if;
    -- The final payment: money out. 06 review P1-WR-06 / P5-WR-05: linked to the debt (debt_id), so it is in the debt's
    -- payment list and Decide reads it as a debt payment. debt_balance_follows_line takes it off the balance (at most what
    -- is owed) and remembers how much, so Undo (deleting the line) puts back exactly that, once.
    insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                     local_date, time_zone, name, category_id, status, debt_id)  -- 06 review
    values (v_payment_id, v_debt.household_id, (p_payment ->> 'account_id')::uuid, v_uid, -v_payment_amount,
            p_payment ->> 'currency', (p_payment ->> 'local_date')::date, p_payment ->> 'time_zone',
            public.grow_line_name(p_payment ->> 'name'), v_category, 'paid', p_debt_id);  -- 06 review P3-WR-07

    select d.balance into v_still_owed from public.debts d where d.id = p_debt_id;  -- 06 review: what the trigger left

    if v_still_owed = 0 then  -- 06 review
      v_paid_off := true;
      v_paid_off_on := (p_payment ->> 'local_date')::date;
      -- Both the payment series and the Expected extra series stop at the payoff date.
      foreach v_sid in array array[v_debt.series_id, v_debt.extra_series_id] loop
        continue when v_sid is null;
        select * into v_series from public.recurring_series
         where id = v_sid and deleted_at is null and household_id = v_debt.household_id
           and created_by = (select auth.uid());  -- 08-05: the caller's own series only
        continue when not found or (v_series.end_date is not null and v_series.end_date <= v_paid_off_on);
        -- 06 review P1-WR-07: the debt's own payment series is never dropped (debts.series_id keeps pointing at it). On a
        -- sale dated before its first payment it ends on its anchor, and the anchor's Expected line goes by hand.
        if v_sid = v_debt.series_id and v_paid_off_on < v_series.anchor_date then  -- 06 review
          v_change := public.grow_end_series(v_sid, v_series.anchor_date);  -- 06 review
          with d as (  -- 06 review
            update public.transactions set deleted_at = now()  -- 06 review
             where recurring_series_id = v_sid and status = 'pending' and deleted_at is null  -- 06 review
               and occurrence_date > v_paid_off_on  -- 06 review
            returning id, version  -- 06 review
          )  -- 06 review
          select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'version', d.version) order by d.id), '[]'::jsonb)  -- 06 review
            into v_more from d;  -- 06 review
          v_change := jsonb_set(v_change, '{soft_deleted}', (v_change -> 'soft_deleted') || v_more);  -- 06 review
        else  -- 06 review
          v_change := public.grow_end_series(v_sid, v_paid_off_on);  -- 06 review
        end if;  -- 06 review
        v_changes := v_changes || jsonb_build_array(v_change);  -- 06 review
      end loop;

      -- 06 review: the balance is the trigger's; this write is only the payoff date.
      update public.debts set paid_off_on = v_paid_off_on  -- 06 review
       where id = p_debt_id
      returning version into v_new_version;
    end if;
  end if;

  -- Ops, in order: the rows, the series inverses, then the debt restore.
  v_ops := jsonb_build_array(jsonb_build_object(
    'entity', 'transactions', 'id', v_sale_id, 'expectedVersion', 1, 'patch', jsonb_build_object('deleted_at', '$now')));
  if p_payment is not null then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'transactions', 'id', v_payment_id, 'expectedVersion', 1, 'patch', jsonb_build_object('deleted_at', '$now')));
  end if;
  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
  -- 06 review P5-WR-05: no balance op. Deleting the payment line (above) already puts back what it took off; restoring
  -- the balance here as well would add it twice. Only a payoff moved paid_off_on, so only then is there a debt op.
  if v_paid_off then  -- 06 review
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
      'patch', jsonb_build_object('paid_off_on', to_jsonb(v_debt.paid_off_on))));  -- 06 review
  end if;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtSaleRecorded', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'paid_off', v_paid_off, 'still_owed', v_still_owed,
                            'undo_step_id', v_step_id, 'version', v_new_version);  -- 06 review P3-WR-01
end;
$$;

create or replace function public.remove_debt(p_debt_id uuid, p_expected_version integer, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_debt public.debts%rowtype;
  v_sid uuid;
  v_ops jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_version integer;
begin
  if v_uid is null then
    raise exception 'remove_debt: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'debtRemoved', 'remove_debt', false);

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found or v_debt.created_by is distinct from (select auth.uid())  -- 08-05: owner-only, refused like a missing debt
     or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'remove_debt: the debt is not in your household' using errcode = '42501';
  end if;
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id, 'version', v_debt.version);
  end if;
  if v_debt.deleted_at is not null or v_debt.version is distinct from p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  for v_sid in
    select distinct s.id from public.recurring_series s
     where s.id in (v_debt.series_id, v_debt.extra_series_id)
       and s.household_id = v_debt.household_id and s.deleted_at is null
       and s.created_by = (select auth.uid())  -- 08-05
     order by s.id
  loop
    v_ops := v_ops || public.grow_stop_series_for_removal(v_sid);
  end loop;

  with d as (
    update public.transactions set deleted_at = now()
     where debt_id = p_debt_id and household_id = v_debt.household_id and status = 'pending' and deleted_at is null
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', d.id, 'expectedVersion', d.version,
                                               'patch', jsonb_build_object('deleted_at', null)) order by d.id), '[]'::jsonb)
    into v_lines from d;

  update public.debts set deleted_at = now() where id = p_debt_id returning version into v_version;

  v_ops := jsonb_build_array(jsonb_build_object('entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_version,
                                                'patch', jsonb_build_object('deleted_at', null)))
           || v_ops || v_lines;
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtRemoved', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'debt_id', p_debt_id, 'version', v_version, 'undo_step_id', v_step_id);
end;
$$;

create or replace function public.save_debt_plan(
  p_debt_id uuid,
  p_expected_version integer,
  p_extra bigint,
  p_order text,
  p_series jsonb,
  p_undo_step jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_debt public.debts%rowtype;
  v_old public.recurring_series%rowtype;
  v_old_live boolean := false;
  v_today date;
  v_next date;
  v_end date;
  v_new_series uuid := null;
  v_series_id uuid;
  v_anchor date;
  v_tz text;
  v_name text;
  v_account uuid;
  v_category uuid;
  v_changes jsonb := '[]'::jsonb;
  v_change jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_new_version integer;
  v_other public.debts%rowtype;  -- 06 review P3-WR-03
  v_oseries public.recurring_series%rowtype;  -- 06 review
  v_ochange jsonb;  -- 06 review
  v_oversion integer;  -- 06 review
  v_other_ops jsonb := '[]'::jsonb;  -- 06 review
begin
  if p_extra is null or p_extra not between 0 and 10000000000000 then
    raise exception 'save_debt_plan: the extra payment must be between 0 and 10000000000000' using errcode = '22023';
  end if;
  if p_order is not null and p_order not in ('rate', 'balance') then
    raise exception 'save_debt_plan: the order must be rate or balance' using errcode = '22023';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'debtPlanSaved', 'save_debt_plan');
  if v_uid is null then
    raise exception 'save_debt_plan: not signed in' using errcode = '42501';
  end if;

  select * into v_debt from public.debts where id = p_debt_id and deleted_at is null for update;
  if not found or v_debt.created_by is distinct from (select auth.uid())  -- 08-05: owner-only, refused like a missing debt
     or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'save_debt_plan: the debt is not in your household' using errcode = '42501';
  end if;

  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'series_id', v_debt.extra_series_id, 'undo_step_id', v_step_id,
                              'version', v_debt.version);  -- 06 review P3-WR-01
  end if;
  if v_debt.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  -- The existing Expected extra series, when it is still running.
  if v_debt.extra_series_id is not null then
    select * into v_old from public.recurring_series
     where id = v_debt.extra_series_id and deleted_at is null and household_id = v_debt.household_id
       and created_by = (select auth.uid());  -- 08-05
    if found then
      v_today := (now() at time zone v_old.time_zone)::date;
      v_old_live := v_old.end_date is null or v_old.end_date >= v_today;
    end if;
  end if;

  if p_extra > 0 then
    if jsonb_typeof(p_series) is distinct from 'object' then
      raise exception 'save_debt_plan: p_series is required with an extra payment' using errcode = '22023';
    end if;
    begin
      v_series_id := (p_series ->> 'id')::uuid;
      v_account := (p_series ->> 'account_id')::uuid;
      v_anchor := (p_series ->> 'anchor_date')::date;
      v_category := nullif(p_series ->> 'category_id', '')::uuid;
    exception when others then
      raise exception 'save_debt_plan: the series is malformed' using errcode = '22023';
    end;
    v_tz := p_series ->> 'time_zone';
    v_name := btrim(coalesce(p_series ->> 'name', ''));
    if v_series_id is null or v_account is null or v_anchor is null
       or v_tz is null or char_length(v_tz) not between 1 and 64
       or char_length(v_name) not between 1 and 200 then  -- 06 review P3-WR-07
      raise exception 'save_debt_plan: the series is malformed' using errcode = '22023';
    end if;
    v_name := public.grow_line_name(v_name);  -- 06 review P3-WR-07: a long debt name is cut to 80, not refused
    if not exists (select 1 from public.accounts a
                    where a.id = v_account and a.household_id = v_debt.household_id and a.deleted_at is null
                    and public.hh_account_usable(a.id, (select auth.uid()))) then
      raise exception 'save_debt_plan: the account is not in your household' using errcode = '42501';
    end if;
  end if;

  -- Same amount from the same account on a running series: the series stays as it is. A new paid-from account takes the
  -- end-and-create branch below (06 review P1-WR-04: it was silently ignored).
  if p_extra > 0 and v_old_live and v_old.amount = -p_extra and v_old.account_id = v_account then  -- 06 review
    v_new_series := v_old.id;
  else
    if v_old_live then
      v_next := (select min(t.occurrence_date) from public.transactions t
                  where t.recurring_series_id = v_old.id and t.status = 'pending' and t.deleted_at is null
                    and t.occurrence_date >= v_today);
      -- Before the first date, grow_end_series drops the series rather than keeping its first line.
      v_end := coalesce(v_next - 1, v_today);
      v_changes := v_changes || jsonb_build_array(public.grow_end_series(v_old.id, v_end));
    end if;
    if p_extra > 0 then
      v_change := public.create_recurring_series(
        jsonb_build_object(
          'id', v_series_id, 'household_id', v_debt.household_id, 'account_id', v_account,
          'name', v_name, 'amount', -p_extra, 'currency', v_debt.currency, 'category_id', v_category,
          'freq', 'monthly', 'anchor_date', v_anchor, 'time_zone', v_tz, 'is_automatic', false),
        null, '{}'::uuid[], null, false);
      if v_change ->> 'status' is distinct from 'applied' then
        raise exception 'save_debt_plan: series % was not created (%)', v_series_id, v_change ->> 'status'
          using errcode = '22023';
      end if;
      v_changes := v_changes || jsonb_build_array(v_change);
      v_new_series := v_series_id;
    end if;
  end if;

  update public.debts
     set payoff_extra = p_extra, payoff_order = p_order, extra_series_id = v_new_series
   where id = p_debt_id
  returning version into v_new_version;

  -- 06 review P3-WR-03: one extra a month per household. Putting the extra on this debt takes it off any other debt in the
  -- same save (its Expected extra series is ended, or dropped before its first date, as above), so moving the extra is ONE
  -- Undo and the payoff segment never counts two extras. Each other debt row moves by one version, as the step needs.
  if p_extra > 0 then  -- 06 review
    for v_other in  -- 06 review
      select * from public.debts d  -- 06 review
       where d.household_id = v_debt.household_id and d.created_by = (select auth.uid()) and d.id <> p_debt_id and d.deleted_at is null  -- 06 review
         and (d.payoff_extra > 0 or d.extra_series_id is not null)  -- 06 review
       order by d.id  -- 06 review
       for update  -- 06 review
    loop  -- 06 review
      v_ochange := null;  -- 06 review
      select * into v_oseries from public.recurring_series  -- 06 review
       where id = v_other.extra_series_id and deleted_at is null and household_id = v_debt.household_id
         and created_by = (select auth.uid());  -- 08-05  -- 06 review
      if found then  -- 06 review
        v_today := (now() at time zone v_oseries.time_zone)::date;  -- 06 review
        if v_oseries.end_date is null or v_oseries.end_date >= v_today then  -- 06 review
          v_next := (select min(t.occurrence_date) from public.transactions t  -- 06 review
                      where t.recurring_series_id = v_oseries.id and t.status = 'pending' and t.deleted_at is null  -- 06 review
                        and t.occurrence_date >= v_today);  -- 06 review
          v_ochange := public.grow_end_series(v_oseries.id, coalesce(v_next - 1, v_today));  -- 06 review
        end if;  -- 06 review
      end if;  -- 06 review
      update public.debts set payoff_extra = 0, extra_series_id = null where id = v_other.id  -- 06 review
      returning version into v_oversion;  -- 06 review
      if v_ochange is not null then  -- 06 review
        v_other_ops := v_other_ops || public.series_change_inverse(v_ochange);  -- 06 review
      end if;  -- 06 review
      v_other_ops := v_other_ops || jsonb_build_array(jsonb_build_object(  -- 06 review
        'entity', 'debts', 'id', v_other.id, 'expectedVersion', v_oversion,  -- 06 review
        'patch', jsonb_build_object('payoff_extra', v_other.payoff_extra, 'extra_series_id', to_jsonb(v_other.extra_series_id))));  -- 06 review
    end loop;  -- 06 review
  end if;  -- 06 review

  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
  -- The debt restore goes last: the series rows are back first, so extra_series_id points at a restored series.
  v_ops := v_ops || jsonb_build_array(jsonb_build_object(
    'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
    'patch', jsonb_build_object('payoff_order', to_jsonb(v_debt.payoff_order),
                                'payoff_extra', v_debt.payoff_extra,
                                'extra_series_id', to_jsonb(v_debt.extra_series_id))));

  v_ops := v_ops || v_other_ops;  -- 06 review P3-WR-03: the other debts' extras come back too

  -- allow_system_keys: payoff_extra and extra_series_id are server-only, so only this server-built step may restore them.
  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, v_uid, 'debtPlanSaved', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, true);

  -- 06 review P3-WR-01: the debt's new version, so the client chains its next write on it instead of waiting for a refetch.
  return jsonb_build_object('status', 'applied', 'series_id', v_new_series, 'undo_step_id', v_step_id,
                            'version', v_new_version);  -- 06 review
end;
$$;

create or replace function public.save_goal_plan(p_goal jsonb, p_expected_version integer, p_series jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_insert boolean := p_expected_version is null;
  v_flag boolean := false;
  v_label text;
  v_step_id uuid;
  v_clean jsonb;
  v_in public.savings_goals%rowtype;
  v_goal public.savings_goals%rowtype;
  v_id uuid;
  v_s public.recurring_series%rowtype;
  v_series_id uuid;
  v_series_version integer;
  v_goal_version integer;
  v_sid uuid;
  v_acc uuid;
  v_acc_currency text;
  v_amount bigint;
  v_anchor date;
  v_tz text;
  v_name text;
  v_cat uuid;
  v_today date;
  v_next date;
  v_end date;
  v_patch jsonb;
  v_prev public.savings_goals%rowtype;
  v_change jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_restore jsonb;
  v_ver integer;
begin
  if v_uid is null then
    raise exception 'save_goal_plan: sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(p_goal) is distinct from 'object' then
    raise exception 'save_goal_plan: p_goal must be an object' using errcode = '22023';
  end if;
  v_clean := coalesce((
    select jsonb_object_agg(e.key, e.value)
      from jsonb_each(p_goal) as e(key, value)
     where e.key = any (array['id', 'household_id', 'name', 'currency', 'target', 'ready_by', 'monthly_amount', 'opening_saved',
                              'account_id', 'locked', 'icon', 'color_key', 'is_safety_net', 'up_front_only', 'check_id', 'protect'])
  ), '{}'::jsonb);
  if v_clean ? 'is_safety_net' then
    if jsonb_typeof(v_clean -> 'is_safety_net') is distinct from 'boolean' then
      raise exception 'save_goal_plan: is_safety_net must be a boolean' using errcode = '22023';
    end if;
    v_flag := (v_clean ->> 'is_safety_net')::boolean;
  end if;
  v_label := case when not v_insert then 'goalPlanChanged' when v_flag then 'safetyNetSizeSaved' else 'goalMade' end;
  v_step_id := public.grow_check_undo_step(p_undo_step, v_label, 'save_goal_plan', false);

  -- Replay of an action that already landed: nothing is written.
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  begin
    select * into strict v_in from jsonb_populate_record(null::public.savings_goals, v_clean);
  exception when others then
    raise exception 'save_goal_plan: p_goal is malformed' using errcode = '22023';
  end;
  if v_in.id is null then
    raise exception 'save_goal_plan: the goal needs an id' using errcode = '22023';
  end if;

  if v_insert then
    if v_in.household_id is null or v_in.household_id not in (select public.user_household_ids()) then
      raise exception 'save_goal_plan: not a member of that household' using errcode = '42501';
    end if;
    if char_length(btrim(coalesce(v_in.name, ''))) not between 1 and 80
       or coalesce(v_in.currency, '') !~ '^[A-Z0-9]{2,4}$'
       or (v_in.target is not null and v_in.target not between 1 and 10000000000000)
       or (v_in.opening_saved is not null and v_in.opening_saved not between 0 and 10000000000000)
       or (v_in.monthly_amount is not null and v_in.monthly_amount not between 0 and 10000000000000) then
      raise exception 'save_goal_plan: the goal is malformed' using errcode = '22023';
    end if;
    -- 06 review P1-WR-08: a safety net the user makes here is confirmed from the start (20261106000400 point 3), so
    -- "We moved your safety net here" never shows for it.
    insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, monthly_amount,
                                      opening_saved, account_id, locked, icon, color_key, is_safety_net, up_front_only,
                                      check_id, protect, net_confirmed_at)  -- 06 review
    values (v_in.id, v_in.household_id, v_uid, 'pot', btrim(v_in.name), v_in.currency, v_in.target, v_in.ready_by,
            v_in.monthly_amount, coalesce(v_in.opening_saved, 0), v_in.account_id,
            coalesce(v_in.locked, true) or v_flag, v_in.icon, v_in.color_key, v_flag,
            coalesce(v_in.up_front_only, false), v_in.check_id, coalesce(v_in.protect, true),
            case when v_flag then now() end);  -- 06 review
    v_id := v_in.id;
  else
    v_id := v_in.id;
    select * into v_goal from public.savings_goals g where g.id = v_id for update;
    if not found or v_goal.deleted_at is not null then
      return jsonb_build_object('status', 'conflict');
    end if;
    if v_goal.created_by is distinct from v_uid or v_goal.household_id not in (select public.user_household_ids()) then
      raise exception 'save_goal_plan: that goal is not yours' using errcode = '42501';
    end if;
    if v_goal.version <> p_expected_version then
      return jsonb_build_object('status', 'conflict');
    end if;
    if (v_clean ? 'name' and char_length(btrim(coalesce(v_in.name, ''))) not between 1 and 80)
       or (v_in.target is not null and v_in.target not between 1 and 10000000000000)
       or (v_in.opening_saved is not null and v_in.opening_saved not between 0 and 10000000000000)
       or (v_in.monthly_amount is not null and v_in.monthly_amount not between 0 and 10000000000000) then
      raise exception 'save_goal_plan: the goal is malformed' using errcode = '22023';
    end if;
    -- 06 review P4-WR-02: a Wait goal's name and plan belong to its Decide check. guard_savings_goal would put the old values
    -- back without a word while this save reported success, so a change to any of them is refused here instead.
    if v_goal.kind <> 'pot' and (  -- 06 review
         (v_clean ? 'name' and btrim(v_in.name) is distinct from v_goal.name)  -- 06 review
         or (v_clean ? 'target' and v_in.target is distinct from v_goal.target)  -- 06 review
         or (v_clean ? 'ready_by' and v_in.ready_by is distinct from v_goal.ready_by)  -- 06 review
         or (v_clean ? 'monthly_amount' and v_in.monthly_amount is distinct from v_goal.monthly_amount)  -- 06 review
         or (v_clean ? 'opening_saved' and coalesce(v_in.opening_saved, v_goal.opening_saved) is distinct from v_goal.opening_saved)) then  -- 06 review
      raise exception 'save_goal_plan: a Wait goal''s plan is set by its Decide check' using errcode = '22023';  -- 06 review
    end if;  -- 06 review
    v_prev := v_goal;
    update public.savings_goals g set
      name = case when v_clean ? 'name' then btrim(v_in.name) else g.name end,
      target = case when v_clean ? 'target' then v_in.target else g.target end,
      ready_by = case when v_clean ? 'ready_by' then v_in.ready_by else g.ready_by end,
      monthly_amount = case when v_clean ? 'monthly_amount' then v_in.monthly_amount else g.monthly_amount end,
      opening_saved = case when v_clean ? 'opening_saved' then coalesce(v_in.opening_saved, g.opening_saved) else g.opening_saved end,
      account_id = case when v_clean ? 'account_id' then v_in.account_id else g.account_id end,
      locked = case when v_clean ? 'locked' then coalesce(v_in.locked, g.locked) else g.locked end,
      protect = case when v_clean ? 'protect' then coalesce(v_in.protect, g.protect) else g.protect end,
      up_front_only = case when v_clean ? 'up_front_only' then coalesce(v_in.up_front_only, g.up_front_only) else g.up_front_only end,
      icon = case when v_clean ? 'icon' then v_in.icon else g.icon end,
      color_key = case when v_clean ? 'color_key' then v_in.color_key else g.color_key end
    where g.id = v_id;
  end if;

  select * into v_goal from public.savings_goals g where g.id = v_id;

  -- The goal's monthly contribution series (D-25).
  select * into v_s from public.recurring_series s
   where s.goal_id = v_id and s.deleted_at is null and s.end_date is null
     and s.created_by = v_uid for update;  -- 08-05
  v_series_id := v_s.id;

  if p_series is null or jsonb_typeof(p_series) = 'null' then
    if v_s.id is not null then
      v_today := (now() at time zone v_s.time_zone)::date;
      select min(t.occurrence_date) into v_next
        from public.transactions t
       where t.recurring_series_id = v_s.id and t.status = 'pending' and t.deleted_at is null and t.occurrence_date >= v_today;
      v_end := coalesce(v_next - 1, v_today);
      if v_end < v_s.anchor_date then
        -- nothing of it has come due yet: the series goes, with its Expected lines. Undo brings both back.
        with d as (
          update public.transactions set deleted_at = now()
           where recurring_series_id = v_s.id and status = 'pending' and deleted_at is null
          returning id, version
        )
        select coalesce(jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', d.id, 'expectedVersion', d.version,
                                                     'patch', jsonb_build_object('deleted_at', null)) order by d.id), '[]'::jsonb)
          into v_restore from d;
        update public.recurring_series set deleted_at = now() where id = v_s.id returning version into v_ver;
        v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'recurring_series', 'id', v_s.id, 'expectedVersion', v_ver,
                                                               'patch', jsonb_build_object('deleted_at', null)))
                       || v_restore;
      else
        -- One statement sets end_date and end_reason (one version), and the Expected lines after the end go.
        v_change := public.edit_recurring_series_from(v_s.id, v_s.version,
          jsonb_build_object('end_date', v_end, 'end_reason', 'stopped'), v_end + 1, null);
        if v_change ->> 'status' is distinct from 'applied' then
          raise exception 'save_goal_plan: the contribution could not be stopped (%)', v_change ->> 'status' using errcode = '22023';
        end if;
        v_ops := v_ops || public.series_change_inverse(v_change);
      end if;
    end if;
  elsif jsonb_typeof(p_series) = 'object' then
    begin
      v_sid := (p_series ->> 'id')::uuid;
      v_acc := (p_series ->> 'account_id')::uuid;
      v_anchor := (p_series ->> 'anchor_date')::date;
      v_cat := nullif(p_series ->> 'category_id', '')::uuid;
    exception when others then
      raise exception 'save_goal_plan: the contribution is malformed' using errcode = '22023';
    end;
    v_tz := p_series ->> 'time_zone';
    v_name := coalesce(nullif(btrim(p_series ->> 'name'), ''), v_goal.name);
    if v_sid is null or v_acc is null or v_anchor is null or v_tz is null
       or jsonb_typeof(p_series -> 'amount') is distinct from 'number'
       or coalesce(p_series ->> 'amount', '') !~ '^-?[0-9]{1,14}$'
       or abs((p_series ->> 'amount')::bigint) not between 1 and 10000000000000
       or char_length(v_name) not between 1 and 200 then
      raise exception 'save_goal_plan: the contribution is malformed' using errcode = '22023';
    end if;
    v_amount := -abs((p_series ->> 'amount')::bigint);
    select a.currency into v_acc_currency from public.accounts a where a.id = v_acc and a.household_id = v_goal.household_id
       and public.hh_account_usable(a.id, v_uid);  -- 08-05: own or joint
    if not found then
      raise exception 'save_goal_plan: the paid-from account is not in this household' using errcode = '42501';
    end if;
    if v_s.id is null then
      v_today := (now() at time zone v_tz)::date;
      insert into public.recurring_series (id, household_id, created_by, updated_by, account_id, name, amount, currency,
                                           category_id, freq, anchor_date, time_zone, goal_id, materialised_through)
      values (v_sid, v_goal.household_id, v_uid, v_uid, v_acc, v_name, v_amount, v_acc_currency,
              v_cat, 'monthly', v_anchor, v_tz, v_id, greatest(v_anchor, date_trunc('month', v_today)::date) - 1);
      perform public.materialise_series(v_sid);
      v_series_id := v_sid;
      -- Undo soft-deletes the new series; undo_replay takes its untouched Expected lines with it.
      select s.version into v_ver from public.recurring_series s where s.id = v_sid;
      v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'recurring_series', 'id', v_sid, 'expectedVersion', v_ver,
                                                             'patch', jsonb_build_object('deleted_at', '$now')));
    else
      v_today := (now() at time zone v_s.time_zone)::date;
      v_patch := '{}'::jsonb;
      if v_name is distinct from v_s.name then v_patch := v_patch || jsonb_build_object('name', v_name); end if;
      if v_amount is distinct from v_s.amount then v_patch := v_patch || jsonb_build_object('amount', v_amount); end if;
      if v_acc is distinct from v_s.account_id then
        v_patch := v_patch || jsonb_build_object('account_id', v_acc, 'currency', v_acc_currency);
      end if;
      if v_anchor is distinct from v_s.anchor_date then v_patch := v_patch || jsonb_build_object('anchor_date', v_anchor); end if;
      if v_patch <> '{}'::jsonb then
        v_change := public.edit_recurring_series_from(v_s.id, v_s.version, v_patch, v_today, null);
        if v_change ->> 'status' is distinct from 'applied' then
          raise exception 'save_goal_plan: the contribution could not be changed (%)', v_change ->> 'status' using errcode = '22023';
        end if;
        v_ops := v_ops || public.series_change_inverse(v_change);
      end if;
      v_series_id := v_s.id;
    end if;
  else
    raise exception 'save_goal_plan: p_series must be an object or null' using errcode = '22023';
  end if;

  if v_series_id is not null then
    select s.version into v_series_version from public.recurring_series s where s.id = v_series_id;
  end if;

  select g.version into v_goal_version from public.savings_goals g where g.id = v_id;

  -- The goal op goes last, after the series ops.
  if v_insert and v_flag then
    -- A flagged goal cannot be soft-deleted, so the new safety net is un-flagged first. Both ops carry the same version:
    -- apply_patches checks every op before it writes any.
    v_ops := v_ops || jsonb_build_array(
      jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
                         'patch', jsonb_build_object('is_safety_net', false)),
      jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
                         'patch', jsonb_build_object('deleted_at', '$now')));
  elsif v_insert then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
                                                           'patch', jsonb_build_object('deleted_at', '$now')));
  else
    v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
      'patch', jsonb_build_object('name', v_prev.name, 'target', v_prev.target, 'ready_by', v_prev.ready_by,
                                  'monthly_amount', v_prev.monthly_amount, 'opening_saved', v_prev.opening_saved,
                                  'account_id', v_prev.account_id, 'locked', v_prev.locked, 'protect', v_prev.protect,
                                  'up_front_only', v_prev.up_front_only, 'icon', v_prev.icon, 'color_key', v_prev.color_key)));
  end if;

  -- allow_system_keys only for the new safety net (its un-flag op patches is_safety_net, a system key).
  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, v_uid, v_label, coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, v_insert and v_flag);

  return jsonb_build_object('status', 'applied', 'goal_id', v_id, 'goal_version', v_goal_version,
                            'series_id', v_series_id, 'series_version', v_series_version, 'undo_step_id', v_step_id);
end;
$$;

create or replace function public.confirm_goal_contribution(p_transaction_id uuid, p_expected_version integer, p_in_leg jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_row public.transactions%rowtype;
  v_goal public.savings_goals%rowtype;
  v_leg_id uuid;
  v_transfer_id uuid;
  v_row_version integer;
  v_leg_version integer;
begin
  if v_uid is null then
    raise exception 'confirm_goal_contribution: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'goalContributionConfirmed', 'confirm_goal_contribution', false);
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  select * into v_row from public.transactions t where t.id = p_transaction_id for update;
  if not found or v_row.deleted_at is not null
     or v_row.created_by is distinct from v_uid then  -- 08-05: goal lines are personal; another member's line is 'does not exist'
    raise exception 'confirm_goal_contribution: that line does not exist' using errcode = '22023';
  end if;
  if v_row.household_id not in (select public.user_household_ids()) then
    raise exception 'confirm_goal_contribution: not a member of that household' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' or v_row.goal_id is null then
    raise exception 'confirm_goal_contribution: only an Expected goal line can be confirmed' using errcode = '22023';
  end if;
  select * into v_goal from public.savings_goals g where g.id = v_row.goal_id for update;
  if not found or v_goal.deleted_at is not null then
    raise exception 'confirm_goal_contribution: the goal is gone' using errcode = '22023';
  end if;
  if v_goal.created_by is distinct from v_uid or v_goal.household_id <> v_row.household_id then
    raise exception 'confirm_goal_contribution: that goal is not yours' using errcode = '42501';
  end if;
  if v_row.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  -- 06 review P5-WR-01: this is the one writer guard_goal_line_paid lets turn an Expected goal line paid.
  perform set_config('fincwin.goal_confirm', 'on', true);  -- 06 review
  if v_goal.account_id is null or v_goal.account_id = v_row.account_id or v_goal.currency <> v_row.original_currency then
    update public.transactions set status = 'paid' where id = v_row.id returning version into v_row_version;
    perform set_config('fincwin.goal_confirm', '', true);  -- 06 review
    return public.grow_store_step(v_step_id, 'goalContributionConfirmed', p_undo_step,
      jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', v_row.id, 'expectedVersion', v_row_version,
                                           'patch', jsonb_build_object('status', 'pending'))),
      jsonb_build_object('status', 'applied', 'transaction_id', v_row.id, 'transaction_version', v_row_version,
                         'in_leg_id', null, 'in_leg_version', null, 'transfer_id', null, 'undo_step_id', v_step_id));
  end if;

  perform set_config('fincwin.goal_confirm', '', true);  -- 06 review: nothing above wrote; the paired branch sets it again
  if jsonb_typeof(p_in_leg) is distinct from 'object' then
    raise exception 'confirm_goal_contribution: p_in_leg must be an object' using errcode = '22023';
  end if;
  begin
    v_leg_id := (p_in_leg ->> 'id')::uuid;
    v_transfer_id := (p_in_leg ->> 'transfer_id')::uuid;
  exception when others then
    raise exception 'confirm_goal_contribution: p_in_leg is malformed' using errcode = '22023';
  end;
  if v_leg_id is null or v_transfer_id is null or v_row.original_amount >= 0 then
    raise exception 'confirm_goal_contribution: p_in_leg is malformed' using errcode = '22023';
  end if;

  -- The pair check is deferred to commit, so the order of the two writes is free; the in-leg goes first.
  insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                   time_zone, name, category_id, payment_type, note, status, transfer_id, goal_id)
  values (v_leg_id, v_row.household_id, v_uid, v_goal.account_id, abs(v_row.original_amount), v_row.original_currency,
          v_row.local_date, v_row.time_zone, v_row.name, v_row.category_id, v_row.payment_type, v_row.note, 'paid',
          v_transfer_id, v_goal.id)
  returning version into v_leg_version;
  perform set_config('fincwin.goal_confirm', 'on', true);  -- 06 review
  update public.transactions set status = 'paid', transfer_id = v_transfer_id, goal_id = null
   where id = v_row.id returning version into v_row_version;
  perform set_config('fincwin.goal_confirm', '', true);  -- 06 review

  return public.grow_store_step(v_step_id, 'goalContributionConfirmed', p_undo_step,
    jsonb_build_array(
      jsonb_build_object('entity', 'transactions', 'id', v_leg_id, 'expectedVersion', v_leg_version,
                         'patch', jsonb_build_object('deleted_at', '$now')),
      jsonb_build_object('entity', 'transactions', 'id', v_row.id, 'expectedVersion', v_row_version,
                         'patch', jsonb_build_object('status', 'pending', 'transfer_id', null, 'goal_id', v_row.goal_id))),
    jsonb_build_object('status', 'applied', 'transaction_id', v_row.id, 'transaction_version', v_row_version,
                       'in_leg_id', v_leg_id, 'in_leg_version', v_leg_version, 'transfer_id', v_transfer_id, 'undo_step_id', v_step_id));
end;
$$;

create or replace function public.grow_end_series(p_series_id uuid, p_end date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_version integer;
  v_soft_deleted jsonb;
  v_before jsonb;
begin
  select * into s from public.recurring_series
   where id = p_series_id and deleted_at is null and household_id in (select public.user_household_ids())
     and created_by = (select auth.uid())  -- 08-05
   for update;
  if not found or p_end is null then
    raise exception 'grow_end_series: series % could not be ended', p_series_id using errcode = '22023';
  end if;

  if p_end < s.anchor_date then
    -- Ended before its first date: no occurrence of it ever happens, so the series goes (soft delete). Ending it on its
    -- anchor instead would keep that first Expected line, and every re-save of the plan would add one more.
    update public.recurring_series set deleted_at = now() where id = p_series_id
    returning version into v_version;
    v_before := jsonb_build_object('deleted_at', null);
  else
    update public.recurring_series set end_date = p_end, end_reason = 'stopped' where id = p_series_id
    returning version into v_version;
    v_before := jsonb_build_object('end_date', to_jsonb(s.end_date), 'occurrence_count', to_jsonb(s.occurrence_count),
                                   'end_reason', to_jsonb(s.end_reason));
  end if;

  with to_delete as (
    update public.transactions
       set deleted_at = now()
     where recurring_series_id = p_series_id
       and status = 'pending'
       and deleted_at is null
       and occurrence_date > p_end
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_soft_deleted
    from to_delete;

  return jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', p_series_id, 'version', v_version, 'before', v_before),
    'inserted', '[]'::jsonb,
    'soft_deleted', v_soft_deleted,
    'linked', '[]'::jsonb
  );
end;
$$;

create or replace function public.grow_stop_series_for_removal(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_today date;
  v_end date;
  v_change jsonb := null;
  v_more jsonb;
begin
  select * into s from public.recurring_series
   where id = p_series_id and deleted_at is null and household_id in (select public.user_household_ids())
     and created_by = (select auth.uid())  -- 08-05
   for update;
  if not found then
    return '[]'::jsonb;
  end if;
  v_today := (now() at time zone s.time_zone)::date;
  v_end := greatest(v_today - 1,
                    coalesce((select max(t.occurrence_date) from public.transactions t
                               where t.recurring_series_id = s.id and t.deleted_at is null and t.status <> 'pending'),
                             v_today - 1));
  if s.end_date is null or s.end_date > v_end then
    v_change := public.grow_end_series(s.id, v_end);
  end if;
  with d as (
    update public.transactions set deleted_at = now()
     where recurring_series_id = s.id and status = 'pending' and deleted_at is null
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'version', d.version) order by d.id), '[]'::jsonb)
    into v_more from d;
  if v_change is not null then
    return public.series_change_inverse(jsonb_set(v_change, '{soft_deleted}', (v_change -> 'soft_deleted') || v_more));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', e.value ->> 'id',
                                                       'expectedVersion', (e.value ->> 'version')::integer,
                                                       'patch', jsonb_build_object('deleted_at', null)) order by e.ordinality)
                     from jsonb_array_elements(v_more) with ordinality e), '[]'::jsonb);
end;
$$;

-- reviewed, no change: public.remove_goal (goal owner-checked; its series are the caller's own once guard_series_goal is tightened)
-- reviewed, no change: public.set_safety_net (target goal owner-checked; the old net lookup is created_by = v_uid)
-- reviewed, no change: public.set_net_answer_use (goal owner-checked)
-- reviewed, no change: public.debt_balance_follows_line (follows the line's own debt_id, which guard_transaction_debt keeps to the line creator's debt)
-- reviewed, no change: public.sync_holding_value (touches only the lot's own holding)
-- reviewed, no change: public.seed_holding_value (touches only the lot's own holding)
-- reviewed, no change: public.guard_holding_lot (already requires h.created_by = new.created_by)
-- reviewed, no change: public.guard_goal_line_paid (blocks a status flip only; reads no other member's row)
-- reviewed, no change: public.grow_check_undo_step (writes only the caller's own undo_log row)
-- reviewed, no change: public.grow_store_step (writes only the caller's own undo_log row)
-- reviewed, no change: public.grow_line_name (formats text)
-- reviewed, no change: public.savings_goals_decide_may_use_guard (owner-private table)
-- reviewed, no change: public.stamp_decide_check_history (owner-private table)
-- reviewed, no change: public.decide_copy_rule_caps (05.5 Band A, no client grant; copies each user's own caps to categories with owner_id = that user)
-- reviewed, no change: public.account_balances (security invoker; RLS limits it to the caller's own and shared lines)
-- reviewed, no change: public.series_change_inverse, public.record_series_undo_step (build undo ops from rows the calling RPC already scoped)
-- reviewed, no change: public.undo_step_replayed (reads only the caller's own undo_log row)

-- 1. A line may only sit on an account the line's creator can use (own or joint). Client writes only: the service role
-- (materialiser, FX restamp) has no auth.uid() and is skipped. An account of another household is left to the composite FK.
create or replace function public.guard_transaction_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and new.created_by is not null
     and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
     and exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id)
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'transactions: account is not yours or joint' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_transaction_account() from public, anon, authenticated;

drop trigger if exists guard_transaction_account on public.transactions;
create trigger guard_transaction_account
  before insert or update of account_id on public.transactions
  for each row execute function public.guard_transaction_account();

-- 2. D-14 / D-18: who may change a shared line. The creator: anything. The named payer (paid_by): amount, currency, date
-- and note only. Anyone else: nothing. household_id, is_shared, paid_by and created_by change only inside the household
-- RPCs of 08-09..08-14 (and the series RPCs above), which set fincwin.household_rpc for the statement. No auth.uid()
-- (service role, ON DELETE SET NULL cascades) is not a client write and is skipped.
create or replace function public.guard_shared_line_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_flag boolean := coalesce(current_setting('fincwin.household_rpc', true), '') = 'on';
begin
  if v_uid is null or v_flag then
    return new;
  end if;
  if new.household_id is distinct from old.household_id or new.is_shared is distinct from old.is_shared
     or (new.paid_by is distinct from old.paid_by and new.paid_by is not null)
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then  -- clearing is ON DELETE SET NULL
    raise exception 'shared_line_creator_only' using errcode = '42501';
  end if;
  if old.created_by is null or v_uid = old.created_by then
    return new;
  end if;
  -- someone other than the creator: only client-writable columns matter, the rest is stamped by triggers
  if (new.account_id is distinct from old.account_id or new.time_zone is distinct from old.time_zone
      or new.name is distinct from old.name or new.category_id is distinct from old.category_id
      or new.payment_type is distinct from old.payment_type or new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at or new.transfer_id is distinct from old.transfer_id
      or new.is_refund is distinct from old.is_refund or new.is_automatic is distinct from old.is_automatic
      or new.one_off is distinct from old.one_off or new.goal_id is distinct from old.goal_id
      or new.income_kind is distinct from old.income_kind or new.counts_as is distinct from old.counts_as
      or new.refund_of is distinct from old.refund_of or new.debt_id is distinct from old.debt_id
      or new.recurring_series_id is distinct from old.recurring_series_id
      or new.occurrence_date is distinct from old.occurrence_date)
     or (v_uid is distinct from coalesce(old.paid_by, old.created_by)
         and (new.original_amount is distinct from old.original_amount
              or new.original_currency is distinct from old.original_currency
              or new.local_date is distinct from old.local_date or new.note is distinct from old.note)) then
    raise exception 'shared_line_creator_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_shared_line_edit() from public, anon, authenticated;

drop trigger if exists guard_shared_line_edit on public.transactions;
create trigger guard_shared_line_edit
  before update on public.transactions
  for each row execute function public.guard_shared_line_edit();

-- 3. D-13: only the creator flips an account to joint. Going back to personal is refused while another member has a live
-- shared line on it.
create or replace function public.guard_joint_account_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_flag boolean := coalesce(current_setting('fincwin.household_rpc', true), '') = 'on';
begin
  if v_uid is null or v_flag or new.is_shared is not distinct from old.is_shared then
    return new;
  end if;
  if old.created_by is distinct from v_uid then
    raise exception 'joint_account_creator_only' using errcode = '42501';
  end if;
  if old.is_shared and not new.is_shared and exists (
       select 1 from public.transactions t
        where t.account_id = old.id and t.deleted_at is null and t.is_shared
          and t.created_by is distinct from old.created_by) then
    raise exception 'joint_account_has_member_lines' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_joint_account_flag() from public, anon, authenticated;

drop trigger if exists guard_joint_account_flag on public.accounts;
create trigger guard_joint_account_flag
  before update of is_shared on public.accounts
  for each row execute function public.guard_joint_account_flag();

-- 4. D-13: a joint account's full balance is visible to every member, including lines that are personal to one member.
-- Paid lines only, per currency, like account_balances; the client adds the account's opening_balance (the account row is
-- visible to members). Personal accounts are never returned.
create or replace function public.joint_account_balances(p_household_id uuid)
returns table (account_id uuid, balance bigint, currency text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.account_id, coalesce(sum(t.original_amount) filter (where t.status = 'paid'), 0)::bigint, t.original_currency
    from public.transactions t
    join public.accounts a on a.id = t.account_id
   where p_household_id in (select public.user_household_ids())
     and a.household_id = p_household_id
     and a.is_shared
     and a.deleted_at is null
     and t.household_id = p_household_id
     and t.deleted_at is null
   group by t.account_id, t.original_currency
$$;
revoke execute on function public.joint_account_balances(uuid) from public, anon;
grant execute on function public.joint_account_balances(uuid) to authenticated;

