-- 08.1-02 ARC-24 (CONTEXT D-09, D-10, D-11; 05.5-13 option B): the server half of Record as bought. Proven by
-- supabase/tests/database/112_decide_go_one_save.test.sql. Not pushed by this plan: plan 15 pushes every 08.1 migration.
--
--   1. recurring_series.amount_kind ('exact' | 'expected', default 'exact'): an expected line is a monthly Activity line
--      for a varying running cost. Every existing series reads exact, so old builds are unaffected. create_recurring_series
--      and edit_recurring_series_from carry it, and apply_patches allows it (so an undo of an edit restores it).
--   2. The sale-and-payoff steps of Grow's record_debt_sale are factored into two private functions
--      (grow_check_sale_legs, grow_sale_and_payoff). record_debt_sale calls them (behaviour unchanged) and so does
--      record_decide_go: one copy of the steps, never two.
--   3. record_decide_go gains p_sale, p_payoff and p_goal_close (jsonb, null = not ticked). One transaction, one undo step:
--      rows, new series, ended series, sale, payoff and the goal close all come back with one Undo. A replay of the same
--      step id is already-applied and writes nothing twice. The goal close sets done_at on a goal the caller owns that is
--      linked to the check (savings_goals.check_id), else refuses with goal_not_linked.
--
-- Additive. The 7-argument record_decide_go overloads are replaced by 10-argument ones whose last three arguments default
-- to null, so every existing call (and every queued write from an older build) resolves to them unchanged.
-- Bodies of apply_patches, create_recurring_series, edit_recurring_series_from and record_debt_sale are the 20261122000300
-- bodies; the only changes are the lines marked 08.1-02.

alter table public.recurring_series add column if not exists amount_kind text not null default 'exact';
alter table public.recurring_series drop constraint if exists recurring_series_amount_kind_check;
alter table public.recurring_series add constraint recurring_series_amount_kind_check
  check (amount_kind in ('exact', 'expected'));


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
        'counts_as', 'income_kind', 'saving_mode', 'pay_group', 'end_reason', 'amount_kind']  -- 2.2, 05.2, 05.2 D-24; 08.1-02
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
        'hold_months', 'detail', 'remind_plan', 'remind_unspent', 'setup_done_at', 'everyday_override',
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
        when v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts', 'decide_checks', 'decide_links', 'decide_changes', 'savings_goals', 'decide_answers', 'holdings', 'holding_lots') then
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
        when 'recurring_series.amount_kind' then 'text'  -- 08.1-02
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

  -- 08.1-02: the kind of amount, exact or expected
  if nullif(p_series ->> 'amount_kind', '') is not null and (p_series ->> 'amount_kind') not in ('exact', 'expected') then
    raise exception 'create_recurring_series: amount_kind must be exact or expected' using errcode = '22023';
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
    payment_type, freq, anchor_date, time_zone, end_date, occurrence_count, is_automatic, is_shared, amount_kind -- 2.2: D-02; 08-05: D-16; 08.1-02
  ) values (
    v_series_id, v_household_id, (select auth.uid()), (select auth.uid()), (p_series ->> 'account_id')::uuid,
    p_series ->> 'name', (p_series ->> 'amount')::bigint, p_series ->> 'currency',
    nullif(p_series ->> 'category_id', '')::uuid, nullif(p_series ->> 'payment_type', ''),
    p_series ->> 'freq', v_anchor_date, v_time_zone,
    nullif(p_series ->> 'end_date', '')::date, nullif(p_series ->> 'occurrence_count', '')::integer,
    coalesce((p_series ->> 'is_automatic')::boolean, false), -- is_sample is never read from client JSON (T-02.2-10-03)
    coalesce(nullif(p_series ->> 'is_shared', '')::boolean, v_anchor_txn.is_shared, false),  -- 08-05: D-16, the creator's choice
    coalesce(nullif(p_series ->> 'amount_kind', ''), 'exact')  -- 08.1-02
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
    'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'is_automatic', 'end_reason', 'amount_kind'];  -- 05.2 D-24; 08.1-02
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

  if nullif(p_patch ->> 'amount_kind', '') is not null and (p_patch ->> 'amount_kind') not in ('exact', 'expected') then  -- 08.1-02
    raise exception 'edit_recurring_series_from: amount_kind must be exact or expected' using errcode = '22023';  -- 08.1-02
  end if;  -- 08.1-02

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
    amount_kind = case when p_patch ? 'amount_kind' then coalesce(nullif(p_patch ->> 'amount_kind', ''), 'exact') else amount_kind end, -- 08.1-02
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

-- 08.1-02: the shape of the sale and the payment leg, shared by record_debt_sale and record_decide_go.
create or replace function public.grow_check_sale_legs(p_sale jsonb, p_payment jsonb, p_fn text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg jsonb;
  v_label text;
  v_id uuid;
  v_account uuid;
  v_date date;
begin
  foreach v_label in array array['sale', 'payment'] loop
    v_leg := case v_label when 'sale' then p_sale else p_payment end;
    continue when v_leg is null;
    begin
      v_id := (v_leg ->> 'id')::uuid;
      v_account := (v_leg ->> 'account_id')::uuid;
      v_date := (v_leg ->> 'local_date')::date;
    exception when others then
      raise exception '%: the % is malformed', p_fn, v_label using errcode = '22023';
    end;
    if v_id is null or v_account is null or v_date is null
       or jsonb_typeof(v_leg -> 'amount') is distinct from 'number'
       or coalesce(v_leg ->> 'amount', '') !~ '^[0-9]{1,14}$'
       or (v_leg ->> 'amount')::bigint not between 1 and 10000000000000
       or coalesce(v_leg ->> 'currency', '') !~ '^[A-Z0-9]{2,4}$'
       or char_length(coalesce(v_leg ->> 'time_zone', '')) not between 1 and 64
       or char_length(btrim(coalesce(v_leg ->> 'name', ''))) not between 1 and 200 then
      raise exception '%: the % is malformed', p_fn, v_label using errcode = '22023';
    end if;
  end loop;
end;
$$;
revoke execute on function public.grow_check_sale_legs(jsonb, jsonb, text) from public, anon, authenticated;

-- 08.1-02: the sale money in and the final payment of a debt, written once for Grow's record_debt_sale and Decide's
-- record_decide_go. The caller has checked the legs' shape (grow_check_sale_legs), locked and owner-checked the debt, and
-- checked the expected version. p_debt_id is null for a sale that pays no debt (no payment then). Returns
-- {paid_off, still_owed, version, ops}: ops is the undo ops in order (sale line, payment line, series inverses, debt restore).
create or replace function public.grow_sale_and_payoff(
  p_household_id uuid,
  p_debt_id uuid,
  p_sale jsonb,
  p_payment jsonb,
  p_fn text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_debt public.debts%rowtype;
  v_category uuid;
  v_sale_id uuid;
  v_payment_id uuid;
  v_payment_amount bigint := 0;
  v_paid_off boolean := false;
  v_still_owed bigint := 0;
  v_series public.recurring_series%rowtype;
  v_sid uuid;
  v_changes jsonb := '[]'::jsonb;
  v_change jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_new_version integer;
  v_paid_off_on date;
  v_more jsonb;
begin
  if p_debt_id is not null then
    select * into v_debt from public.debts where id = p_debt_id;
    if not found or v_debt.household_id is distinct from p_household_id then
      raise exception '%: the debt is not in your household', p_fn using errcode = '42501';
    end if;
    v_still_owed := v_debt.balance;
    v_new_version := v_debt.version;
  end if;
  if p_payment is not null and p_debt_id is null then
    raise exception '%: a payment needs a debt', p_fn using errcode = '22023';
  end if;
  -- 06 review P1-WR-03: the final payment comes off a balance kept in the debt's currency, so it is in that currency.
  if p_payment is not null and p_payment ->> 'currency' is distinct from v_debt.currency then
    raise exception '%: the payment must be in the debt''s currency', p_fn using errcode = '22023';
  end if;

  if (p_sale is not null and not exists (select 1 from public.accounts a
                  where a.id = (p_sale ->> 'account_id')::uuid and a.household_id = p_household_id and a.deleted_at is null
                    and public.hh_account_usable(a.id, v_uid)))
     or (p_payment is not null and not exists (
           select 1 from public.accounts a
            where a.id = (p_payment ->> 'account_id')::uuid and a.household_id = p_household_id and a.deleted_at is null
                    and public.hh_account_usable(a.id, v_uid))) then
    raise exception '%: the account is not in your household', p_fn using errcode = '42501';
  end if;

  -- The sale: money in, linked to the debt when there is one, so Decide reads it as the one-time money in of a sale,
  -- never as pay. Money in never moves the balance (debt_balance_follows_line).
  if p_sale is not null then
    v_sale_id := (p_sale ->> 'id')::uuid;
    insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                     local_date, time_zone, name, status, debt_id)
    values (v_sale_id, p_household_id, (p_sale ->> 'account_id')::uuid, v_uid, (p_sale ->> 'amount')::bigint,
            p_sale ->> 'currency', (p_sale ->> 'local_date')::date, p_sale ->> 'time_zone',
            public.grow_line_name(p_sale ->> 'name'), 'paid', p_debt_id);
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'transactions', 'id', v_sale_id, 'expectedVersion', 1, 'patch', jsonb_build_object('deleted_at', '$now')));
  end if;

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
    -- The final payment: money out, linked to the debt (debt_id). debt_balance_follows_line takes it off the balance (at
    -- most what is owed) and remembers how much, so Undo (deleting the line) puts back exactly that, once.
    insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                     local_date, time_zone, name, category_id, status, debt_id)
    values (v_payment_id, p_household_id, (p_payment ->> 'account_id')::uuid, v_uid, -v_payment_amount,
            p_payment ->> 'currency', (p_payment ->> 'local_date')::date, p_payment ->> 'time_zone',
            public.grow_line_name(p_payment ->> 'name'), v_category, 'paid', p_debt_id);
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'transactions', 'id', v_payment_id, 'expectedVersion', 1, 'patch', jsonb_build_object('deleted_at', '$now')));

    select d.balance into v_still_owed from public.debts d where d.id = p_debt_id;

    if v_still_owed = 0 then
      v_paid_off := true;
      v_paid_off_on := (p_payment ->> 'local_date')::date;
      -- Both the payment series and the Expected extra series stop at the payoff date.
      foreach v_sid in array array[v_debt.series_id, v_debt.extra_series_id] loop
        continue when v_sid is null;
        select * into v_series from public.recurring_series
         where id = v_sid and deleted_at is null and household_id = v_debt.household_id
           and created_by = v_uid;
        continue when not found or (v_series.end_date is not null and v_series.end_date <= v_paid_off_on);
        -- 06 review P1-WR-07: the debt's own payment series is never dropped (debts.series_id keeps pointing at it). On a
        -- sale dated before its first payment it ends on its anchor, and the anchor's Expected line goes by hand.
        if v_sid = v_debt.series_id and v_paid_off_on < v_series.anchor_date then
          v_change := public.grow_end_series(v_sid, v_series.anchor_date);
          with d as (
            update public.transactions set deleted_at = now()
             where recurring_series_id = v_sid and status = 'pending' and deleted_at is null
               and occurrence_date > v_paid_off_on
            returning id, version
          )
          select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'version', d.version) order by d.id), '[]'::jsonb)
            into v_more from d;
          v_change := jsonb_set(v_change, '{soft_deleted}', (v_change -> 'soft_deleted') || v_more);
        else
          v_change := public.grow_end_series(v_sid, v_paid_off_on);
        end if;
        v_changes := v_changes || jsonb_build_array(v_change);
      end loop;

      -- The balance is the trigger's; this write is only the payoff date.
      update public.debts set paid_off_on = v_paid_off_on
       where id = p_debt_id
      returning version into v_new_version;
    end if;
  end if;

  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
  -- No balance op: deleting the payment line already puts back what it took off. Only a payoff moved paid_off_on.
  if v_paid_off then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
      'patch', jsonb_build_object('paid_off_on', to_jsonb(v_debt.paid_off_on))));
  end if;

  return jsonb_build_object('paid_off', v_paid_off, 'still_owed', v_still_owed, 'version', v_new_version, 'ops', v_ops);
end;
$$;
revoke execute on function public.grow_sale_and_payoff(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;


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
  v_res jsonb;  -- 08.1-02
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
  perform public.grow_check_sale_legs(p_sale, p_payment, 'record_debt_sale');  -- 08.1-02: shared with record_decide_go
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
  -- 08.1-02: the sale, the payment, the payoff and their undo ops are written by the one function Decide also calls.
  v_res := public.grow_sale_and_payoff(v_debt.household_id, p_debt_id, p_sale, p_payment, 'record_debt_sale');
  v_ops := v_res -> 'ops';
  v_paid_off := (v_res ->> 'paid_off')::boolean;
  v_still_owed := (v_res ->> 'still_owed')::bigint;
  v_new_version := (v_res ->> 'version')::integer;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtSaleRecorded', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'paid_off', v_paid_off, 'still_owed', v_still_owed,
                            'undo_step_id', v_step_id, 'version', v_new_version);  -- 06 review P3-WR-01
end;
$$;

-- The 7-argument overloads give way to the 10-argument ones (the new arguments default to null).
drop function if exists public.record_decide_go(uuid, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb);
drop function if exists public.record_decide_go(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb);

create or replace function public.record_decide_go(
  p_check_id uuid,
  p_row_ids uuid[],
  p_series jsonb,
  p_end_series jsonb,
  p_debt jsonb,
  p_decision jsonb,
  p_undo_step jsonb,
  p_sale jsonb default null,  -- 08.1-02: the sale money in (null = not ticked)
  p_payoff jsonb default null,  -- 08.1-02: the old loan's final payment (null = not ticked)
  p_goal_close jsonb default null  -- 08.1-02: {goal_id} to close (null = not ticked)
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_check public.decide_checks%rowtype;
  v_check_version integer;
  v_n_rows integer := coalesce(cardinality(p_row_ids), 0);
  v_n_series integer;
  v_key text;
  v_row_roles jsonb;
  v_series_roles jsonb;
  v_cooling boolean := false;
  v_item jsonb;
  v_ord bigint;
  v_series_ids uuid[] := '{}'::uuid[];
  v_payment_ids uuid[] := '{}'::uuid[];
  v_series_id uuid;
  v_change jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_debt_id uuid;
  v_debt_account uuid;
  v_debt_series uuid;
  v_debt_term integer;
  v_debt_start date;
  v_debt_secured boolean;
  v_link_ids uuid[] := '{}'::uuid[];
  v_link_id uuid;
  v_found integer;
  v_end_id uuid;
  v_end_version integer;
  v_end_date date;
  v_end_cur_version integer;
  v_end_anchor date;
  v_ops jsonb := '[]'::jsonb;
  v_row_ops jsonb;
  v_sp jsonb;
  v_sp_ops jsonb := '[]'::jsonb;
  v_sp_debt uuid;
  v_sp_version integer;
  v_debt_row public.debts%rowtype;
  v_goal public.savings_goals%rowtype;
  v_goal_id uuid;
  v_goal_version integer;
  v_goal_ops jsonb := '[]'::jsonb;
begin
  -- 1. The undo step, and a replay of the action that already landed (D-WR-03).
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception 'record_decide_go: p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'record_decide_go: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'record_decide_go: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  -- 2. Lock the check: the caller's own, still open.
  select * into v_check from public.decide_checks where id = p_check_id and deleted_at is null for update;
  if not found
     or v_check.created_by is distinct from (select auth.uid())
     or v_check.household_id not in (select public.user_household_ids()) then
    raise exception 'record_decide_go: the check is not yours' using errcode = '42501';
  end if;
  if v_check.status <> 'open' then
    raise exception 'record_decide_go: the check is already decided' using errcode = '22023';
  end if;

  -- 3. Bounds. Own limits: a loan with no deposit writes zero rows (not record_entry_list's 1..200).
  if v_n_rows > 60 then
    raise exception 'record_decide_go: at most 60 rows' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(coalesce(p_row_ids, '{}'::uuid[])) x) <> v_n_rows then
    raise exception 'record_decide_go: p_row_ids must be unique' using errcode = '22023';
  end if;
  if jsonb_typeof(p_series) is distinct from 'array' or jsonb_array_length(p_series) > 24 then
    raise exception 'record_decide_go: p_series must be an array of at most 24' using errcode = '22023';
  end if;
  if jsonb_typeof(p_end_series) is distinct from 'array' or jsonb_array_length(p_end_series) > 24 then
    raise exception 'record_decide_go: p_end_series must be an array of at most 24' using errcode = '22023';
  end if;
  if p_debt is not null and jsonb_typeof(p_debt) not in ('object', 'null') then
    raise exception 'record_decide_go: p_debt must be an object or null' using errcode = '22023';
  end if;
  if jsonb_typeof(p_debt) = 'null' then
    p_debt := null;
  end if;
  -- 08.1-02: the optional parts are an object, or null when not ticked.
  if p_sale is not null and jsonb_typeof(p_sale) not in ('object', 'null') then
    raise exception 'record_decide_go: p_sale must be an object or null' using errcode = '22023';
  end if;
  if p_payoff is not null and jsonb_typeof(p_payoff) not in ('object', 'null') then
    raise exception 'record_decide_go: p_payoff must be an object or null' using errcode = '22023';
  end if;
  if p_goal_close is not null and jsonb_typeof(p_goal_close) not in ('object', 'null') then
    raise exception 'record_decide_go: p_goal_close must be an object or null' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sale) = 'null' then p_sale := null; end if;
  if jsonb_typeof(p_payoff) = 'null' then p_payoff := null; end if;
  if jsonb_typeof(p_goal_close) = 'null' then p_goal_close := null; end if;
  v_n_series := jsonb_array_length(p_series);
  if v_n_rows + v_n_series + (case when p_debt is null then 0 else 1 end)
     + (case when p_sale is null then 0 else 1 end) + (case when p_payoff is null then 0 else 1 end) < 1 then
    raise exception 'record_decide_go: nothing to write' using errcode = '22023';
  end if;

  if jsonb_typeof(p_decision) is distinct from 'object'
     or coalesce(p_decision ->> 'verdict', '') not in ('fits', 'adjust', 'no', 'missing')
     or jsonb_typeof(p_decision -> 'broke_line') is distinct from 'boolean' then
    raise exception 'record_decide_go: p_decision is malformed' using errcode = '22023';
  end if;
  foreach v_key in array array['estimate_day_one', 'estimate_monthly', 'estimate_monthly_payment', 'estimate_running'] loop
    if jsonb_typeof(p_decision -> v_key) is distinct from 'number'
       or coalesce(p_decision ->> v_key, '') !~ '^-?[0-9]{1,14}$'
       or abs((p_decision ->> v_key)::bigint) > 10000000000000 then
      raise exception 'record_decide_go: % must be an integer within bounds', v_key using errcode = '22023';
    end if;
  end loop;
  if p_decision ? 'cooling_off' and jsonb_typeof(p_decision -> 'cooling_off') is distinct from 'boolean' then
    raise exception 'record_decide_go: cooling_off must be a boolean' using errcode = '22023';
  end if;
  v_cooling := coalesce((p_decision ->> 'cooling_off')::boolean, false);

  -- Roles (D-36, 04 D-48): one per row and one per series, in the same order.
  v_row_roles := coalesce(p_decision -> 'row_roles', '[]'::jsonb);
  v_series_roles := coalesce(p_decision -> 'series_roles', '[]'::jsonb);
  if jsonb_typeof(v_row_roles) is distinct from 'array' or jsonb_typeof(v_series_roles) is distinct from 'array'
     or jsonb_array_length(v_row_roles) <> v_n_rows
     or jsonb_array_length(v_series_roles) <> v_n_series then
    raise exception 'record_decide_go: roles do not match the writes' using errcode = '22023';
  end if;
  if exists (
       select 1 from jsonb_array_elements(v_row_roles || v_series_roles) e
        where jsonb_typeof(e.value) is distinct from 'string'
           or (e.value #>> '{}') not in ('day_one', 'payment', 'running_cost')) then
    raise exception 'record_decide_go: roles do not match the writes' using errcode = '22023';
  end if;

  -- 4. Rows: only rows this caller just inserted (live, own, untouched, not in a series, this household).
  select count(*) into v_found
    from public.transactions t
   where t.id = any (coalesce(p_row_ids, '{}'::uuid[]))
     and t.deleted_at is null
     and t.household_id = v_check.household_id
     and t.created_by = (select auth.uid())
     and t.version = 1
     and t.recurring_series_id is null;
  if v_found <> v_n_rows then
    raise exception 'record_decide_go: every row must be a new row of the caller' using errcode = '22023';
  end if;
  -- A transfer leg (investment lump into a tracked account, 05-20) goes only with its partner leg.
  if exists (
       select 1 from public.transactions t
        where t.id = any (coalesce(p_row_ids, '{}'::uuid[]))
          and t.transfer_id is not null
          and not exists (
            select 1 from public.transactions u
             where u.transfer_id = t.transfer_id and u.id <> t.id and u.id = any (p_row_ids))) then
    raise exception 'record_decide_go: a transfer needs both legs' using errcode = '22023';
  end if;
  if v_check.kind = 'invest' and p_debt is not null then
    raise exception 'record_decide_go: an investment writes no debt' using errcode = '22023';
  end if;

  perform set_config('fincwin.decide_rpc', 'on', true);

  -- 6. Series (anchorless; create_recurring_series checks membership, this checks the check's household).
  for v_item, v_ord in
    select e.value, e.ord from jsonb_array_elements(p_series) with ordinality as e(value, ord) order by e.ord
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'record_decide_go: each series must be an object' using errcode = '22023';
    end if;
    begin
      v_series_id := (v_item ->> 'id')::uuid;
      if (v_item ->> 'household_id')::uuid is distinct from v_check.household_id then
        raise exception 'record_decide_go: a series is in another household' using errcode = '22023';
      end if;
    exception
      when sqlstate '22023' then raise;
      when others then
        raise exception 'record_decide_go: a series payload is malformed' using errcode = '22023';
    end;
    if v_series_id is null or v_series_id = any (v_series_ids) then
      raise exception 'record_decide_go: series ids must be unique uuids' using errcode = '22023';
    end if;
    v_change := public.create_recurring_series(v_item, null, '{}'::uuid[], null, false);
    if v_change ->> 'status' is distinct from 'applied' then
      raise exception 'record_decide_go: series % was not created (%)', v_series_id, v_change ->> 'status' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_array(v_change);
    v_series_ids := v_series_ids || v_series_id;
    if (v_series_roles ->> (v_ord::integer - 1)) = 'payment' then
      v_payment_ids := v_payment_ids || v_series_id;
    end if;
  end loop;

  -- 7. Replaced expenses that end: through grow_end_series (end_date + end_reason 'stopped'), clamped to the anchor.
  for v_item in select e.value from jsonb_array_elements(p_end_series) e loop
    begin
      v_end_id := (v_item ->> 'id')::uuid;
      v_end_version := (v_item ->> 'expected_version')::integer;
      v_end_date := (v_item ->> 'end_date')::date;
    exception when others then
      raise exception 'record_decide_go: an ended series is malformed' using errcode = '22023';
    end;
    if v_end_id is null or v_end_version is null or v_end_date is null
       or not exists (select 1 from public.recurring_series s
                       where s.id = v_end_id and s.deleted_at is null and s.household_id = v_check.household_id) then
      raise exception 'record_decide_go: an ended series is not in this household' using errcode = '22023';
    end if;
    select s.version, s.anchor_date into v_end_cur_version, v_end_anchor
      from public.recurring_series s where s.id = v_end_id for update;
    if v_end_cur_version <> v_end_version then
      raise exception 'record_decide_go: series % could not be ended (stale)', v_end_id using errcode = '22023';
    end if;
    v_change := public.grow_end_series(v_end_id, greatest(v_end_date, v_end_anchor));
    if v_change ->> 'status' is distinct from 'applied' then
      raise exception 'record_decide_go: series % could not be ended (%)', v_end_id, v_change ->> 'status' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_array(v_change);
  end loop;

  -- 7b. 08.1-02 (D-10): the sale money in and the old loan's payoff, through the steps Grow's record_debt_sale uses.
  if p_sale is not null or p_payoff is not null then
    begin
      v_sp_debt := nullif(coalesce(nullif(p_payoff ->> 'debt_id', ''), nullif(p_sale ->> 'debt_id', '')), '')::uuid;
      v_sp_version := nullif(coalesce(nullif(p_payoff ->> 'expected_version', ''), nullif(p_sale ->> 'expected_version', '')), '')::integer;
      if p_sale is not null and p_payoff is not null
         and nullif(p_sale ->> 'debt_id', '') is not null and nullif(p_payoff ->> 'debt_id', '') is not null
         and (p_sale ->> 'debt_id')::uuid <> (p_payoff ->> 'debt_id')::uuid then
        raise exception 'record_decide_go: the sale and the payoff name different loans' using errcode = '22023';
      end if;
    exception
      when sqlstate '22023' then raise;
      when others then
        raise exception 'record_decide_go: the sale or payoff is malformed' using errcode = '22023';
    end;
    perform public.grow_check_sale_legs(p_sale, p_payoff, 'record_decide_go');
    if p_payoff is not null and v_sp_debt is null then
      raise exception 'record_decide_go: a payoff needs the loan it pays' using errcode = '22023';
    end if;
    if p_sale is not null and p_payoff is not null and (p_sale ->> 'id') = (p_payoff ->> 'id') then
      raise exception 'record_decide_go: the sale and payoff ids must differ' using errcode = '22023';
    end if;
    if v_sp_debt is not null then
      select * into v_debt_row from public.debts where id = v_sp_debt and deleted_at is null for update;
      if not found
         or v_debt_row.created_by is distinct from (select auth.uid())
         or v_debt_row.household_id is distinct from v_check.household_id then
        raise exception 'record_decide_go: the loan is not yours' using errcode = '42501';
      end if;
      if p_payoff is not null and v_debt_row.paid_off_on is not null then
        raise exception 'record_decide_go: the loan is already paid off' using errcode = '22023';
      end if;
      if v_sp_version is null or v_debt_row.version <> v_sp_version then
        raise exception 'record_decide_go: loan % could not be paid off (stale)', v_sp_debt using errcode = '22023';
      end if;
    end if;
    v_sp := public.grow_sale_and_payoff(v_check.household_id, v_sp_debt, p_sale, p_payoff, 'record_decide_go');
    v_sp_ops := v_sp -> 'ops';
  end if;

  -- 8. The debt, secured from the item.
  if p_debt is not null then
    begin
      v_debt_id := (p_debt ->> 'id')::uuid;
      v_debt_account := nullif(p_debt ->> 'account_id', '')::uuid;
      v_debt_series := nullif(p_debt ->> 'series_id', '')::uuid;
      v_debt_start := nullif(p_debt ->> 'start_date', '')::date;
      v_debt_secured := (p_debt ->> 'secured')::boolean;
      v_debt_term := nullif(p_debt ->> 'term_months', '')::integer;
    exception when others then
      raise exception 'record_decide_go: the debt is malformed' using errcode = '22023';
    end;
    if v_debt_id is null or v_debt_secured is null
       or jsonb_typeof(p_debt -> 'secured') is distinct from 'boolean'
       or coalesce(p_debt ->> 'kind', '') <> 'loan'
       or char_length(btrim(coalesce(p_debt ->> 'name', ''))) not between 1 and 80
       or coalesce(p_debt ->> 'currency', '') !~ '^[A-Z0-9]{2,4}$'
       or (p_debt ->> 'apr' is not null and p_debt ->> 'apr' !~ '^\d{1,4}(\.\d{1,10})?$')
       or jsonb_typeof(p_debt -> 'balance') is distinct from 'number'
       or coalesce(p_debt ->> 'balance', '') !~ '^[0-9]{1,14}$'
       or (p_debt ->> 'balance')::bigint > 10000000000000
       or jsonb_typeof(p_debt -> 'minimum_payment') is distinct from 'number'
       or coalesce(p_debt ->> 'minimum_payment', '') !~ '^[0-9]{1,14}$'
       or (p_debt ->> 'minimum_payment')::bigint > 10000000000000
       or (v_debt_term is not null and v_debt_term not between 1 and 600) then
      raise exception 'record_decide_go: the debt is malformed' using errcode = '22023';
    end if;
    if v_debt_series is not null and not (v_debt_series = any (v_payment_ids)) then
      raise exception 'record_decide_go: the debt can only name a series written in this call' using errcode = '22023';
    end if;
    insert into public.debts (id, household_id, created_by, account_id, check_id, series_id, name, kind, currency,
                              balance, apr, minimum_payment, secured, term_months, start_date)
    values (v_debt_id, v_check.household_id, (select auth.uid()), v_debt_account, p_check_id, v_debt_series,
            btrim(p_debt ->> 'name'), 'loan', p_debt ->> 'currency',
            (p_debt ->> 'balance')::bigint, p_debt ->> 'apr', (p_debt ->> 'minimum_payment')::bigint,
            v_debt_secured, v_debt_term, v_debt_start);
  end if;

  -- 8b. 08.1-02 (D-11): close the goal this check made, only the caller's own goal that is linked to this check.
  if p_goal_close is not null then
    begin
      v_goal_id := (p_goal_close ->> 'goal_id')::uuid;
    exception when others then
      raise exception 'record_decide_go: p_goal_close is malformed' using errcode = '22023';
    end;
    if v_goal_id is null then
      raise exception 'record_decide_go: p_goal_close is malformed' using errcode = '22023';
    end if;
    select * into v_goal from public.savings_goals where id = v_goal_id for update;
    if not found
       or v_goal.created_by is distinct from (select auth.uid())
       or v_goal.household_id is distinct from v_check.household_id
       or v_goal.deleted_at is not null
       or v_goal.check_id is distinct from p_check_id then
      raise exception 'record_decide_go: goal_not_linked' using errcode = '22023';
    end if;
    -- Already closed (elsewhere): nothing to do, and nothing to undo.
    if v_goal.done_at is null then
      update public.savings_goals set done_at = now() where id = v_goal_id returning version into v_goal_version;
      v_goal_ops := jsonb_build_array(jsonb_build_object(
        'entity', 'savings_goals', 'id', v_goal_id, 'expectedVersion', v_goal_version,
        'patch', jsonb_build_object('done_at', null)));
    end if;
  end if;

  -- 9. The check becomes 'bought'; the server clock decides the cooling-off moment (D-35, A15).
  update public.decide_checks
     set status = 'bought',
         decided_at = now(),
         verdict_at_decision = p_decision ->> 'verdict',
         estimate_day_one = (p_decision ->> 'estimate_day_one')::bigint,
         estimate_monthly = (p_decision ->> 'estimate_monthly')::bigint,
         estimate_monthly_payment = (p_decision ->> 'estimate_monthly_payment')::bigint,
         estimate_running = (p_decision ->> 'estimate_running')::bigint,
         broke_line = (p_decision ->> 'broke_line')::boolean,
         cooling_off_at = case when v_cooling then now() + interval '48 hours' else null end
   where id = p_check_id
  returning version into v_check_version;

  -- 10. Links: 'written', with the role of each row and series (the debt link has none).
  for v_ord in 1 .. v_n_rows loop
    v_link_id := gen_random_uuid();
    insert into public.decide_links (id, household_id, created_by, check_id, entity, target_id, source, role)
    values (v_link_id, v_check.household_id, (select auth.uid()), p_check_id, 'transactions', p_row_ids[v_ord::integer], 'written',
            v_row_roles ->> (v_ord::integer - 1));
    v_link_ids := v_link_ids || v_link_id;
  end loop;
  for v_ord in 1 .. v_n_series loop
    v_link_id := gen_random_uuid();
    insert into public.decide_links (id, household_id, created_by, check_id, entity, target_id, source, role)
    values (v_link_id, v_check.household_id, (select auth.uid()), p_check_id, 'recurring_series', v_series_ids[v_ord::integer], 'written',
            v_series_roles ->> (v_ord::integer - 1));
    v_link_ids := v_link_ids || v_link_id;
  end loop;
  if p_debt is not null then
    v_link_id := gen_random_uuid();
    insert into public.decide_links (id, household_id, created_by, check_id, entity, target_id, source, role)
    values (v_link_id, v_check.household_id, (select auth.uid()), p_check_id, 'debts', v_debt_id, 'written', null);
    v_link_ids := v_link_ids || v_link_id;
  end if;

  -- 11. Ops, in order: links, debt, rows, series inverses, then the check restore.
  select coalesce(jsonb_agg(jsonb_build_object(
           'entity', 'decide_links', 'id', l.id, 'expectedVersion', l.version,
           'patch', jsonb_build_object('deleted_at', '$now'))), '[]'::jsonb)
    into v_ops
    from public.decide_links l where l.id = any (v_link_ids);
  if p_debt is not null then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'debts', 'id', v_debt_id, 'expectedVersion', 1,
      'patch', jsonb_build_object('deleted_at', '$now')));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'entity', 'transactions', 'id', t.id, 'expectedVersion', t.version,
           'patch', jsonb_build_object('deleted_at', '$now')) order by o.ord), '[]'::jsonb)
    into v_row_ops
    from unnest(coalesce(p_row_ids, '{}'::uuid[])) with ordinality as o(id, ord)
    join public.transactions t on t.id = o.id;
  v_ops := v_ops || v_row_ops;
  v_ops := v_ops || v_sp_ops;  -- 08.1-02: sale, payoff and the loan's series, undone before the series inverses below
  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
  v_ops := v_ops || v_goal_ops;  -- 08.1-02
  v_ops := v_ops || jsonb_build_array(jsonb_build_object(
    'entity', 'decide_checks', 'id', p_check_id, 'expectedVersion', v_check_version,
    'patch', jsonb_build_object(
      'status', 'open', 'decided_at', null, 'verdict_at_decision', null,
      'estimate_day_one', null, 'estimate_monthly', null,
      'estimate_monthly_payment', null, 'estimate_running', null,
      'cooling_off_at', null, 'broke_line', false)));

  -- 12. One undo step; allow_system_keys lets the restore patch the server-only columns on replay.
  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, (select auth.uid()), coalesce(p_undo_step ->> 'label_key', 'decisionWritten'),
          coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, true);

  -- 13.
  perform set_config('fincwin.decide_rpc', '', true);
  return jsonb_build_object('status', 'applied', 'undo_step_id', v_step_id);
end;
$$;

revoke execute on function public.record_decide_go(uuid, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_decide_go(uuid, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;


create or replace function public.record_decide_go(
  p_check_id uuid,
  p_rows jsonb,
  p_series jsonb,
  p_end_series jsonb,
  p_debt jsonb,
  p_decision jsonb,
  p_undo_step jsonb,
  p_sale jsonb default null,  -- 08.1-02
  p_payoff jsonb default null,  -- 08.1-02
  p_goal_close jsonb default null  -- 08.1-02
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_check public.decide_checks%rowtype;
  v_item jsonb;
  v_row public.transactions%rowtype;
  v_ids uuid[] := '{}'::uuid[];
  v_bad_key text;
begin
  -- 1. The undo step, and a replay of the action that already landed (D-WR-03): nothing is written.
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception 'record_decide_go: p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'record_decide_go: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'record_decide_go: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  -- 2. The check: the caller's own, still open, locked before any row is written.
  select * into v_check from public.decide_checks where id = p_check_id and deleted_at is null for update;
  if not found
     or v_check.created_by is distinct from (select auth.uid())
     or v_check.household_id not in (select public.user_household_ids()) then
    raise exception 'record_decide_go: the check is not yours' using errcode = '42501';
  end if;
  if v_check.status <> 'open' then
    raise exception 'record_decide_go: the check is already decided' using errcode = '22023';
  end if;

  -- 3. The rows.
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 60 then
    raise exception 'record_decide_go: p_rows must be an array of at most 60' using errcode = '22023';
  end if;
  for v_item in
    select e.value from jsonb_array_elements(p_rows) with ordinality as e(value, ord) order by e.ord
  loop
    if jsonb_typeof(v_item) is distinct from 'object' then
      raise exception 'record_decide_go: each row must be an object' using errcode = '22023';
    end if;
    select k into v_bad_key
      from jsonb_object_keys(v_item) as k
     where k not in ('id', 'household_id', 'account_id', 'original_amount', 'original_currency', 'local_date',
                     'time_zone', 'note', 'name', 'category_id', 'payment_type', 'status', 'transfer_id', 'one_off')
     limit 1;
    if v_bad_key is not null then
      raise exception 'record_decide_go: a row cannot write %', v_bad_key using errcode = '42501';
    end if;
    begin
      select * into strict v_row from jsonb_populate_record(null::public.transactions, v_item);
    exception when others then
      raise exception 'record_decide_go: a row is malformed' using errcode = '22023';
    end;
    if v_row.id is null then
      raise exception 'record_decide_go: each row needs an id' using errcode = '22023';
    end if;
    if v_item ? 'household_id' and v_row.household_id is distinct from v_check.household_id then
      raise exception 'record_decide_go: a row is in another household' using errcode = '42501';
    end if;
    insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency,
                                     local_date, time_zone, note, name, category_id, payment_type, status,
                                     transfer_id, one_off)
    values (v_row.id, v_check.household_id, (select auth.uid()), v_row.account_id, v_row.original_amount,
            v_row.original_currency, v_row.local_date, v_row.time_zone, v_row.note, v_row.name, v_row.category_id,
            v_row.payment_type, coalesce(v_row.status, 'paid'), v_row.transfer_id, coalesce(v_row.one_off, false))
    on conflict (id) do nothing;
    v_ids := v_ids || v_row.id;
  end loop;

  -- 4. Everything else, in this same transaction: a refusal there undoes the inserts above.
  return public.record_decide_go(p_check_id, v_ids, p_series, p_end_series, p_debt, p_decision, p_undo_step,
                                 p_sale, p_payoff, p_goal_close);  -- 08.1-02
end;
$$;
revoke execute on function public.record_decide_go(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_decide_go(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;

