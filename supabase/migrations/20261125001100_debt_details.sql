-- Quick 261123 (DD-01..DD-08, owner 2026-11-23): debt details. Proven by supabase/tests/database/119_debt_details.test.sql.
-- Additive only: two nullable columns, grants, and two function bodies copied with marked changes. Nothing existing becomes
-- required: the app asks for these values on new and edited debts and never blocks an old row (DD-05).
--
--   debts.credit_limit  bigint, nullable    DD-03: the limit of a revolving debt (card, line of credit)
--   debts.revolving     boolean, nullable   DD-03: true for a card or line of credit, false for a fixed loan or money owed;
--                                           kind 'other' holds both a line of credit and money owed, so this tells them apart
--   debts.start_date    (exists since 05)   DD-02: the start date of a fixed loan; now updatable from the app
--   debts.paid_off_on   (exists since 05.2) DD-04: a debt already paid off can be added, so it gains an insert grant
--
-- "Rate unknown" (DD-01) needs no column: a null apr on a carried debt is the stored "I don't know" (04 D-07, never invented).
--
-- apply_patches: body of 20261122000300; the debts allowlist and type map gain start_date, credit_limit and revolving, so Undo
-- of an edit that changed them replays. record_decide_go (p_row_ids overload): body of 20261125000400; a financed purchase's
-- debt stores started_balance = the financed amount and start_date = the purchase date (DD-08). Changed lines are marked 261123.
-- Same argument lists, so create or replace keeps every grant; the grants are repeated for clarity.

alter table public.debts add column if not exists credit_limit bigint
  check (credit_limit is null or credit_limit between 0 and 10000000000000);  -- 261123 (DD-03)
alter table public.debts add column if not exists revolving boolean;  -- 261123 (DD-03)

grant insert (credit_limit, revolving, paid_off_on) on public.debts to authenticated;  -- 261123 (DD-03, DD-04)
grant update (start_date, credit_limit, revolving) on public.debts to authenticated;  -- 261123 (DD-02, DD-03)

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
      when 'debts' then array['name', 'balance', 'apr', 'minimum_payment', 'secured', 'term_months', 'deleted_at', 'is_housing', 'pays_in_full', 'paid_off_on', 'due_day', 'started_balance', 'payoff_order',
        'start_date', 'credit_limit', 'revolving']  -- 05-119 (R18.4), 05.2, 05.2 paid off, 05.4; 261123 (DD-02, DD-03)
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
        when 'debts.start_date' then 'date'  -- 261123 (DD-02)
        when 'debts.credit_limit' then 'bigint'  -- 261123 (DD-03)
        when 'debts.revolving' then 'boolean'  -- 261123 (DD-03)
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
  v_prev_status text;
  v_prev_decided_at timestamptz;
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
  if v_check.status not in ('open', 'waiting') then
    raise exception 'record_decide_go: the check is already decided' using errcode = '22023';
  end if;
  -- 08.1-10: a check parked with "Save for it" (waiting) can be recorded as bought; Undo puts it back as it was.
  v_prev_status := v_check.status;
  v_prev_decided_at := v_check.decided_at;

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
    -- 261123 (DD-08): the financed amount is the loan's original amount, and the purchase date is its start date (the date
    -- of the purchase rows written in this call; today when none was written).
    if v_debt_start is null then
      select min(t.local_date) into v_debt_start from public.transactions t where t.id = any (p_row_ids);
      v_debt_start := coalesce(v_debt_start, current_date);
    end if;
    insert into public.debts (id, household_id, created_by, account_id, check_id, series_id, name, kind, currency,
                              balance, apr, minimum_payment, secured, term_months, start_date,
                              started_balance, revolving)  -- 261123 (DD-08)
    values (v_debt_id, v_check.household_id, (select auth.uid()), v_debt_account, p_check_id, v_debt_series,
            btrim(p_debt ->> 'name'), 'loan', p_debt ->> 'currency',
            (p_debt ->> 'balance')::bigint, p_debt ->> 'apr', (p_debt ->> 'minimum_payment')::bigint,
            v_debt_secured, v_debt_term, v_debt_start,
            (p_debt ->> 'balance')::bigint, false);  -- 261123 (DD-08)
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
      'status', v_prev_status, 'decided_at', v_prev_decided_at, 'verdict_at_decision', null,
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
