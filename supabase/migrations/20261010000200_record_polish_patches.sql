-- Phase 2.2 record polish: write-path patches.
--
-- Extends apply_patches for the new client-writable columns (RESEARCH
-- Pitfall 2, allowlist drift) and adds a server-only key gate for the
-- add-month undo (RESEARCH Pattern 7, assumption A7): the recurring_series
-- high-water mark (materialised_through) and households.horizon_month are
-- patchable only while undo_replay replays a step flagged allow_system_keys.
-- That flag is set only by security-definer RPCs (add_activity_month, plan
-- 14); it is NOT in the client column grant on undo_log
-- (grant insert (id, label_key, label_params, ops)), so a client insert that
-- names it fails 42501, and a client step naming a households op fails
-- undo_log_fill's validation (22023). This protects the D-08 never-rewind
-- invariant. Every function below is copied in full from
-- 20260926000500_undo_log.sql and changed only where marked `2.2`.

alter table public.undo_log add column allow_system_keys boolean not null default false;

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
       or (coalesce(e ->> 'entity', '') not in ('transactions', 'categories', 'recurring_series', 'accounts')
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
     where rs.id in (
       select (e3 ->> 'id')::uuid from jsonb_array_elements(new.ops) e3
        where e3 ->> 'entity' = 'recurring_series'
     )
  ), '{}'::jsonb);
  return new;
end;
$$;

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
        or v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts');
      begin
        v_id := (v_op ->> 'id')::uuid;
      exception when others then
        continue;
      end;
      execute format('select to_jsonb(t) from public.%I t where t.id = $1', v_entity) using v_id into v_row_json;
      continue when v_row_json is null;
      if v_entity = 'categories' then
        continue when (v_row_json ->> 'owner_id')::uuid is distinct from (select auth.uid());
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
    if v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts', 'households') then
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
        'recurring_series_id', 'occurrence_date', 'is_refund', 'is_automatic']  -- 2.2
      when 'categories' then array['name', 'color_key', 'archived_at', 'monthly_cap']  -- 2.2
      when 'recurring_series' then array['name', 'amount', 'currency', 'account_id', 'category_id',
        'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'deleted_at', 'is_automatic']  -- 2.2
        || case when v_system then array['materialised_through'] else '{}'::text[] end
      when 'accounts' then array['name', 'kind', 'opening_balance', 'archived_at', 'overdraft_limit', 'credit_limit',
        'deleted_at']  -- 2.2
      when 'households' then case when v_system then array['horizon_month'] else '{}'::text[] end  -- 2.2
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
          'record_name', v_row_json ->> 'name',
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
    v_result := public.apply_patches(p_step.ops);
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

-- Grants re-issued verbatim (create or replace keeps them, restated for review).
revoke execute on function public.undo_log_fill() from public, anon, authenticated;
revoke execute on function public.apply_patches(jsonb, jsonb) from public, anon;
grant execute on function public.apply_patches(jsonb, jsonb) to authenticated;
revoke execute on function public.undo_replay(public.undo_log) from public, anon, authenticated;
