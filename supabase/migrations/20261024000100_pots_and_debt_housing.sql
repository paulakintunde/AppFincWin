-- Phase 5 (05-119, R18.2 and R18.4; D-101, D-103): pots on savings_goals and the debts.is_housing flag.
-- Additive: new columns, a named shape check, an index, widened grants, and three functions re-created from their
-- LATEST definitions (guard_savings_goal and guard_debt from 20261021000100, apply_patches from 20261016000200).
-- No second table: a pot is a savings_goals row with kind = 'pot'; Wait goals are kind = 'wait'.
-- This file is applied locally by the pgTAP suite. It reaches production only through plan 05-132.

-- 1. savings_goals: kind, done_at, shape check, live index -------------------------------------------------
alter table public.savings_goals add column if not exists kind text not null default 'wait';
alter table public.savings_goals drop constraint if exists savings_goals_kind_check;
alter table public.savings_goals add constraint savings_goals_kind_check check (kind in ('wait', 'pot'));
alter table public.savings_goals add column if not exists done_at timestamptz;
alter table public.savings_goals drop constraint if exists savings_goals_pot_shape;
alter table public.savings_goals add constraint savings_goals_pot_shape
  check (kind <> 'pot' or (target is not null and ready_by is not null and monthly_amount is null and check_id is null));
create index if not exists savings_goals_live_idx on public.savings_goals (household_id)
  where deleted_at is null and done_at is null;

-- The policy "own savings goals" (owner-private, household-of-one) and `revoke all ... from anon` are unchanged.
grant insert (id, household_id, kind, name, currency, target, ready_by, opening_saved) on public.savings_goals to authenticated;
grant update (name, target, ready_by, opening_saved, done_at, deleted_at) on public.savings_goals to authenticated;

-- 2. guard_savings_goal(): insert forces 'pot' unless the Wait RPC is running; per-kind freezes on update ----
create or replace function public.guard_savings_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('fincwin.decide_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_rpc then new.kind := 'pot'; end if;
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  new.kind := old.kind;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  if new.check_id is not null then new.check_id := old.check_id; end if;  -- WR-A01: only SET NULL may land
  if old.kind = 'pot' then
    new.currency := old.currency;
    new.monthly_amount := old.monthly_amount;
  elsif not v_rpc then
    new.name := old.name;
    new.currency := old.currency;
    new.target := old.target;
    new.monthly_amount := old.monthly_amount;
    new.ready_by := old.ready_by;
    new.opening_saved := old.opening_saved;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_savings_goal() from public, anon, authenticated;

-- 3. debts.is_housing -------------------------------------------------------------------------------------
alter table public.debts add column if not exists is_housing boolean not null default false;
grant update (is_housing) on public.debts to authenticated;

-- Backfill: on where the old automatic signals match (a Housing-category series pays it, or it came from a
-- property check). Loans only; every other row stays off.
update public.debts set is_housing = true
 where deleted_at is null and kind <> 'card' and not is_housing
   and (series_id in (select s.id from public.recurring_series s join public.categories c on c.id = s.category_id
                       where c.builtin_key = 'Housing')
        or check_id in (select id from public.decide_checks where inputs ->> 'itemType' = 'property'));

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
revoke execute on function public.guard_debt() from public, anon, authenticated;

-- 4. apply_patches, re-created from 20261016000200 (its latest definition) -------------------------------
-- Changed only where marked `05-119`: savings_goals widens to name, target, ready_by, opening_saved, done_at,
-- deleted_at; debts gains is_housing.
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
        or v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts', 'category_rules', 'decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals'); -- 02.3, 05
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
      elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals') then  -- 05: owner-private
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
    if v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts', 'households', 'category_rules', 'decide_checks', 'debts', 'decide_links', 'decide_changes', 'savings_goals') then -- 02.3, 05
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
        'one_off', 'goal_id']  -- 2.2, 05 (D-29, D-34)
      when 'categories' then array['name', 'color_key', 'archived_at', 'monthly_cap']  -- 2.2
      when 'recurring_series' then array['name', 'amount', 'currency', 'account_id', 'category_id',
        'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'deleted_at', 'is_automatic']  -- 2.2
        || case when v_system then array['materialised_through'] else '{}'::text[] end
      when 'accounts' then array['name', 'kind', 'opening_balance', 'archived_at', 'overdraft_limit', 'credit_limit',
        'deleted_at']  -- 2.2
      when 'households' then case when v_system then array['horizon_month'] else '{}'::text[] end  -- 2.2
      when 'category_rules' then array['keyword', 'keyword_norm', 'category_id', 'target_builtin_key', 'target_name', 'deleted_at']  -- 02.3
      when 'decide_checks' then array['deleted_at']
        || case when v_system then array['status', 'decided_at', 'verdict_at_decision', 'estimate_day_one', 'estimate_monthly',
          'wait_monthly', 'ready_by', 'broke_line', 'cooling_off_at', 'estimate_monthly_payment', 'estimate_running'] else '{}'::text[] end  -- 05
      when 'debts' then array['name', 'balance', 'apr', 'minimum_payment', 'secured', 'term_months', 'deleted_at', 'is_housing']  -- 05-119 (R18.4)
        || case when v_system then array['check_id'] else '{}'::text[] end  -- 05
      when 'decide_links' then array['deleted_at']  -- 05
      when 'decide_changes' then array['kind', 'name', 'monthly_amount', 'currency', 'start_month', 'end_month', 'deleted_at']  -- 05 (D-27)
      when 'savings_goals' then array['name', 'target', 'ready_by', 'opening_saved', 'done_at', 'deleted_at']  -- 05 (D-34), 05-119 (R18.2)
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
    elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals') then -- 05: owner-private
      if not ((v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid())
              and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    elsif v_entity = 'debts' then -- 05: household-scoped
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
