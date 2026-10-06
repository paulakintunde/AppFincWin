-- Server-side undo and the generic version-checked patch primitive (D-23,
-- D-24, D-25, D-26, D-27, D-28, D-30, D-50, D-55, REC-11, REC-12, ACT-05).
--
-- undo_log is per-user (RLS-scoped to owner_id), holds one row per user
-- action ("one action is one step" -- D-24), and survives restarts and a
-- device change because it lives on the server, not in local state
-- (D-23). Every step's ops carry the record version the forward step left
-- behind, so replaying it later can only ever succeed if nothing else has
-- touched those rows since (D-26). touched_ids is server-derived from ops
-- at insert time -- the client never supplies it -- so the tombstone purge
-- job below can trust it.
--
-- apply_patches is the one place any multi-row write happens: a bulk
-- action, an import, a series edit and every undo step all go through it.
-- It is entity/column-allowlisted, household/owner scope-checked and
-- all-or-nothing (every expected version is checked before any row
-- changes -- D-26). It is SECURITY DEFINER, so RLS on the four target
-- tables does not apply inside it; every scope check it performs is doing
-- the job RLS would otherwise have done (mirrors 02-08's series RPCs).
--
-- apply_undo_step and rollback_undo_to are the undo/history read-and-apply
-- functions plan 02-12's data layer calls; purge_record_tombstones is the
-- daily job that hard-deletes a soft-deleted row once no undo step still
-- references it (D-30), run by pg_cron the same way as the FX jobs
-- (20260924000700_fx_monitor_jobs.sql).

-- 1. Table.
create table public.undo_log (
  id uuid primary key,                                            -- client-generated at the moment of the action
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label_key text not null check (label_key ~ '^[a-zA-Z]{1,40}$'),
  label_params jsonb not null default '{}'::jsonb check (jsonb_typeof(label_params) = 'object' and pg_column_size(label_params) <= 2048),
  ops jsonb not null check (jsonb_typeof(ops) = 'array' and jsonb_array_length(ops) between 1 and 6000),
  touched_ids uuid[] not null default '{}',
  series_generations jsonb not null default '{}'::jsonb,           -- D-CR-01: server-derived {series id: generation} at insert time
  status text not null default 'available' check (status in ('available', 'undone', 'refused')),
  refusal jsonb,
  created_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz
);
create index undo_log_owner_created_idx on public.undo_log (owner_id, created_at desc, id desc);
create index undo_log_touched_ids_idx on public.undo_log using gin (touched_ids);

-- 2. touched_ids is derived from ops at insert time, never trusted from the
-- client (T-02-09-04 groundwork: the purge job below relies on this being
-- accurate).
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
       or coalesce(e ->> 'entity', '') not in ('transactions', 'categories', 'recurring_series', 'accounts')
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

create trigger undo_log_fill
  before insert on public.undo_log
  for each row execute function public.undo_log_fill();

-- 3. Trim to the 12 newest available/refused steps per owner (D-25); once
-- that floor moves, any 'undone' row older than the newest-remaining
-- available/refused step is pointless history and is purged with it
-- (D-28: only an available or refused step needs to stay visible in
-- history; an already-undone step ages out with the rest).
create or replace function public.undo_log_trim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_floor_created_at timestamptz;
  v_floor_id uuid;
begin
  delete from public.undo_log u
   where u.owner_id = new.owner_id
     and u.status in ('available', 'refused')
     and u.id not in (
       select k.id from public.undo_log k
        where k.owner_id = new.owner_id and k.status in ('available', 'refused')
        order by k.created_at desc, k.id desc
        limit 12
     );

  select k.created_at, k.id into v_floor_created_at, v_floor_id
    from public.undo_log k
   where k.owner_id = new.owner_id and k.status in ('available', 'refused')
   order by k.created_at asc, k.id asc
   limit 1;

  if v_floor_created_at is not null then
    delete from public.undo_log
     where owner_id = new.owner_id
       and status = 'undone'
       and (created_at, id) < (v_floor_created_at, v_floor_id);
  end if;

  return null; -- AFTER trigger: return value is ignored
end;
$$;

create trigger undo_log_trim
  after insert on public.undo_log
  for each row execute function public.undo_log_trim();

-- 4. RLS: owner-only, and only ever inserted as a fresh 'available' step --
-- every status transition after that happens inside a definer function
-- (T-02-09-05).
alter table public.undo_log enable row level security;

create policy "owner reads own undo steps" on public.undo_log for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own undo steps" on public.undo_log for insert to authenticated
  with check (owner_id = (select auth.uid()) and status = 'available' and refusal is null and resolved_at is null);

revoke all on public.undo_log from anon;
revoke insert, update, delete, truncate on public.undo_log from authenticated;
grant select on public.undo_log to authenticated;
grant insert (id, label_key, label_params, ops) on public.undo_log to authenticated;

-- 4b. D-WR-03: replay detection. The client generates an action's undo
-- step id at the moment of the action, so a step id that is already in
-- undo_log means this exact action already landed and its response was
-- lost; the paused-mutation queue is replaying it. Returns true for the
-- caller's own step, false when the id is unused, and raises 42501 when the
-- id belongs to someone else (never a silent no-op).
create or replace function public.undo_step_replayed(p_undo_step jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_owner uuid;
begin
  if p_undo_step is null or jsonb_typeof(p_undo_step) <> 'object' then
    return false;
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    return false;
  end if;

  select u.owner_id into v_owner from public.undo_log u where u.id = v_step_id;
  if not found then
    return false;
  end if;
  if v_owner is distinct from (select auth.uid()) then
    raise exception 'undo step % belongs to another user', v_step_id using errcode = '42501';
  end if;
  return true;
end;
$$;

-- 5. apply_patches: the one generic, atomic, version-checked patch
-- primitive. p_ops is a JSON array of
-- `{entity, id, expectedVersion, patch}` (interfaces block, plan 02-05).
-- Phase A checks every op (row exists, caller's scope, expected version)
-- before Phase B writes a single row -- one mismatch anywhere in the list
-- refuses the whole list (D-26, T-02-09-03). Every table name and column
-- name reaching dynamic SQL comes from a fixed allowlist below, never from
-- client text, and is only ever substituted via %I/%L (T-02-09-01).
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
    if v_entity is null or v_entity not in ('transactions', 'categories', 'recurring_series', 'accounts') then
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
        'recurring_series_id', 'occurrence_date']
      when 'categories' then array['name', 'color_key', 'archived_at']
      when 'recurring_series' then array['name', 'amount', 'currency', 'account_id', 'category_id',
        'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'deleted_at']
      when 'accounts' then array['name', 'kind', 'opening_balance', 'archived_at', 'overdraft_limit', 'credit_limit']
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

    if v_entity in ('transactions', 'recurring_series', 'accounts') then
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

-- 5b. undo_replay: the one replay path apply_undo_step and rollback_undo_to
-- share (D-CR-01). A series step's ops are a fixed list built from the RPC's
-- own change set, but the daily materialiser keeps adding occurrences after
-- the step is recorded -- rows the step has never heard of. So before the
-- ops run, every recurring_series op in the step is reconciled with what the
-- system did since:
--   * undo of a create (the op soft-deletes the series): every live
--     occurrence of that series the step does not reference was added by the
--     materialiser (any user-driven series change bumps the series version,
--     which apply_patches already refuses). If they are all still untouched
--     system rows (pending, version 1) they are soft-deleted with the series,
--     so nothing is left hanging off a deleted series. If a user has acted on
--     one (paid, skipped, edited), the step is refused naming that row --
--     D-26, it never clobbers.
--   * undo of a template edit or end: if the materialiser has added rows
--     since the step (generation moved), those rows were built from the
--     template the undo would revert and cannot be rebuilt from a fixed op
--     list, so the step is refused (D-26: "...or a system job"). The refusal
--     names the series, with updated_by null (the system).
-- The caller has already locked the step row; this only reads before
-- apply_patches, which still does the scope and version checks.
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
    v_result := public.apply_patches(p_step.ops);

    if v_result ->> 'status' = 'applied' and cardinality(v_cleanup) > 0 then
      update public.transactions set deleted_at = now()
       where id = any (v_cleanup) and deleted_at is null;
    end if;

    set constraints public.transfer_pair_check immediate;
    set constraints public.transfer_pair_check deferred;
  exception
    when integrity_constraint_violation or insufficient_privilege or invalid_parameter_value then
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

-- 5c. D-WR-04: the series RPCs' undo step, built and stored server-side in
-- the same transaction as the series write. series_change_inverse is the
-- SQL mirror of src/engine/undo/inverse.ts's inverseOfSeriesChange, and its
-- op order is the same load-bearing order (T-02-05-02): inserted rows are
-- soft-deleted first, then soft-deleted rows restored, then linked rows
-- unlinked, and the series template patch (or the series' own delete, for
-- a create) goes last.
create or replace function public.series_change_inverse(p_change jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select
    coalesce((select jsonb_agg(jsonb_build_object(
                'entity', 'transactions', 'id', e.value ->> 'id', 'expectedVersion', (e.value ->> 'version')::integer,
                'patch', jsonb_build_object('deleted_at', '$now')) order by e.ordinality)
                from jsonb_array_elements(p_change -> 'inserted') with ordinality e), '[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object(
                'entity', 'transactions', 'id', e.value ->> 'id', 'expectedVersion', (e.value ->> 'version')::integer,
                'patch', jsonb_build_object('deleted_at', null)) order by e.ordinality)
                from jsonb_array_elements(p_change -> 'soft_deleted') with ordinality e), '[]'::jsonb)
    || coalesce((select jsonb_agg(jsonb_build_object(
                'entity', 'transactions', 'id', e.value ->> 'id', 'expectedVersion', (e.value ->> 'version')::integer,
                'patch', jsonb_build_object('recurring_series_id', null, 'occurrence_date', null)) order by e.ordinality)
                from jsonb_array_elements(p_change -> 'linked') with ordinality e), '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object(
         'entity', 'recurring_series', 'id', p_change -> 'series' ->> 'id',
         'expectedVersion', (p_change -> 'series' ->> 'version')::integer,
         'patch', case when jsonb_typeof(p_change -> 'series' -> 'before') is distinct from 'object'
                       then jsonb_build_object('deleted_at', '$now')
                       else p_change -> 'series' -> 'before' end));
$$;

-- Records the step (when the caller asked for one) and returns the applied
-- envelope with undo_step_id added. With p_undo_step null this is a no-op,
-- so a caller that still records its own step keeps working.
create or replace function public.record_series_undo_step(p_undo_step jsonb, p_change jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
begin
  if p_undo_step is null then
    return p_change;
  end if;
  if jsonb_typeof(p_undo_step) <> 'object' then
    raise exception 'p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'p_undo_step.id must be a uuid' using errcode = '22023';
  end if;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (
    v_step_id, (select auth.uid()), p_undo_step ->> 'label_key',
    coalesce(p_undo_step -> 'label_params', '{}'::jsonb),
    public.series_change_inverse(p_change)
  );

  return p_change || jsonb_build_object('undo_step_id', v_step_id);
end;
$$;

-- 6. apply_undo_step: replay one stored step's ops through apply_patches.
create or replace function public.apply_undo_step(p_step_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.undo_log%rowtype;
  v_result jsonb;
begin
  select * into s from public.undo_log where id = p_step_id and owner_id = (select auth.uid()) for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if s.status = 'undone' then
    return jsonb_build_object('status', 'already-undone');
  end if;
  if s.status = 'refused' then
    return jsonb_build_object('status', 'refused', 'refusal', s.refusal);
  end if;

  v_result := public.undo_replay(s);

  if v_result ->> 'status' = 'conflict' then
    update public.undo_log
       set status = 'refused', refusal = v_result -> 'conflict', resolved_at = now()
     where id = p_step_id;
    return jsonb_build_object('status', 'refused', 'refusal', v_result -> 'conflict');
  end if;

  update public.undo_log set status = 'undone', resolved_at = now() where id = p_step_id;
  return jsonb_build_object('status', 'undone', 'rows', v_result -> 'rows');
end;
$$;

-- 7. rollback_undo_to: undo every step from newest back to (and including)
-- the target, stopping at the first conflict or already-refused step
-- (D-27); steps already undone along the way stay undone and are skipped.
create or replace function public.rollback_undo_to(p_step_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.undo_log%rowtype;
  s public.undo_log%rowtype;
  v_result jsonb;
  v_undone integer := 0;
begin
  select * into t from public.undo_log where id = p_step_id and owner_id = (select auth.uid());
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;

  for s in
    select * from public.undo_log
     where owner_id = (select auth.uid())
       and (created_at, id) >= (t.created_at, t.id)
     order by created_at desc, id desc
     for update
  loop
    if s.status = 'undone' then
      continue;
    end if;
    if s.status = 'refused' then
      return jsonb_build_object('status', 'blocked', 'undone', v_undone, 'blocked_by', s.id, 'refusal', s.refusal);
    end if;

    v_result := public.undo_replay(s);
    if v_result ->> 'status' = 'conflict' then
      update public.undo_log set status = 'refused', refusal = v_result -> 'conflict', resolved_at = now() where id = s.id;
      return jsonb_build_object('status', 'refused', 'undone', v_undone, 'step_id', s.id, 'refusal', v_result -> 'conflict');
    end if;

    update public.undo_log set status = 'undone', resolved_at = now() where id = s.id;
    v_undone := v_undone + 1;
  end loop;

  return jsonb_build_object('status', 'undone', 'undone', v_undone);
end;
$$;

-- 8. purge_record_tombstones: hard-delete a soft-deleted row once no
-- available/refused undo step still references it (D-30). Recurring series
-- tombstones are purged the same way, and only once no transaction (live
-- or itself a tombstone) still points at them -- the FK from transactions
-- to recurring_series is ON DELETE RESTRICT (02-08), so this is not just a
-- courtesy, it is required for the delete to succeed at all.
create or replace function public.purge_record_tombstones(p_older_than interval default interval '1 day')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n1 integer;
  n2 integer;
begin
  with deleted as (
    delete from public.transactions t
     where t.deleted_at is not null
       and t.deleted_at < now() - p_older_than
       and not exists (
         select 1 from public.undo_log u
          where u.status in ('available', 'refused') and u.touched_ids @> array[t.id]
       )
    returning 1
  )
  select count(*) into n1 from deleted;

  with deleted as (
    delete from public.recurring_series s
     where s.deleted_at is not null
       and s.deleted_at < now() - p_older_than
       and not exists (
         select 1 from public.undo_log u
          where u.status in ('available', 'refused') and u.touched_ids @> array[s.id]
       )
       and not exists (select 1 from public.transactions t where t.recurring_series_id = s.id)
    returning 1
  )
  select count(*) into n2 from deleted;

  return coalesce(n1, 0) + coalesce(n2, 0);
end;
$$;

-- 9. Grants (T-02-09-01, T-02-09-02, T-02-09-05). purge_record_tombstones
-- is a maintenance job, called only by pg_cron as service_role, exactly
-- like fx_auto_accept_holds and materialise_recurring.
revoke execute on function public.undo_log_fill() from public, anon, authenticated;
revoke execute on function public.undo_log_trim() from public, anon, authenticated;

revoke execute on function public.apply_patches(jsonb, jsonb) from public, anon;
grant execute on function public.apply_patches(jsonb, jsonb) to authenticated;

revoke execute on function public.undo_replay(public.undo_log) from public, anon, authenticated;
revoke execute on function public.undo_step_replayed(jsonb) from public, anon, authenticated;
revoke execute on function public.series_change_inverse(jsonb) from public, anon, authenticated;
revoke execute on function public.record_series_undo_step(jsonb, jsonb) from public, anon, authenticated;

revoke execute on function public.apply_undo_step(uuid) from public, anon;
grant execute on function public.apply_undo_step(uuid) to authenticated;

revoke execute on function public.rollback_undo_to(uuid) from public, anon;
grant execute on function public.rollback_undo_to(uuid) to authenticated;

revoke execute on function public.purge_record_tombstones(interval) from public, anon, authenticated;
grant execute on function public.purge_record_tombstones(interval) to service_role;

-- 10. Daily purge, well clear of the FX (16:00/17:00 UTC) and recurring
-- (00:20 UTC) jobs.
select cron.schedule('record-tombstone-purge-daily', '40 3 * * *', $$ select public.purge_record_tombstones(); $$);
