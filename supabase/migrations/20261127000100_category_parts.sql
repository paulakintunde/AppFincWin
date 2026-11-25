-- Phase 10.1 (D-01..D-04, SPL-01/02/05/06): category parts inside one line. Proven by supabase/tests/database/131_category_parts.test.sql.
-- Additive only: two nullable jsonb columns, helper functions, two guard triggers, the set_category_parts RPC, and the
-- apply_patches body copied from 20261125001100 with category_parts and item_split added to the transactions allowlist and
-- type map. No grants change on transactions: the columns are written only by the RPCs below, apply_patches and triggers.
--
--   transactions.category_parts  jsonb, nullable   [{"c": <category uuid>|null, "a": <signed bigint>, "l": "taxTip"|null}], null = not split
--   transactions.item_split      jsonb, nullable   written only by set_split_by_item (10.1-14); a hand edit ends the link
--
-- Not done here (later plans): the transactions_active view and the client read path do not expose these columns yet.

alter table public.transactions add column if not exists category_parts jsonb;
alter table public.transactions add column if not exists item_split jsonb;

comment on column public.transactions.category_parts is
  '10.1 D-01: null = not split. Array of {"c": category uuid or null (Uncategorised), "a": signed bigint like original_amount, "l": "taxTip" or null}. 2 to 20 parts, integer, non-zero, same sign as the line, sum never past the total (a shortfall is the gap, D-03). category_id always equals the largest part.';
comment on column public.transactions.item_split is
  '10.1 D-17: null = not split by item. {"store": text|null, "date": "YYYY-MM-DD"|null, "items": [{"name","price","discount","c","people"}], "extras": {"tax","tip","discounts"}, "by": uuid, "at": timestamptz}. Cleared by any later hand edit of the parts, the split rule or the total.';

-- 1. Same rule set as src/engine/parts/validateParts.ts (first failing check wins) -----------------------------------
create or replace function public.parts_invalid_reason(p_parts jsonb, p_total bigint, p_allow_gap boolean)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  e jsonb;
  n integer;
  v_a numeric;
  v_sum numeric := 0;
  v_nonint boolean := false;
  v_zero boolean := false;
  v_mixed boolean := false;
  v_neg boolean := p_total < 0;
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' then return 'bad_shape'; end if;
  for e in select value from jsonb_array_elements(p_parts) loop
    if jsonb_typeof(e) <> 'object' or jsonb_typeof(e -> 'a') is distinct from 'number' then return 'bad_shape'; end if;
    if jsonb_typeof(e -> 'c') not in ('null', 'string') then return 'bad_shape'; end if;
    if jsonb_typeof(e -> 'c') = 'string'
       and (e ->> 'c') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'bad_shape'; end if;
    if jsonb_typeof(e -> 'l') not in ('null', 'string') then return 'bad_shape'; end if;
    if jsonb_typeof(e -> 'l') = 'string' and (e ->> 'l') <> 'taxTip' then return 'bad_shape'; end if;
  end loop;
  n := jsonb_array_length(p_parts);
  if n < 2 then return 'too_few'; end if;
  if n > 20 then return 'too_many'; end if;
  for e in select value from jsonb_array_elements(p_parts) loop
    v_a := (e ->> 'a')::numeric;
    if v_a <> trunc(v_a) or abs(v_a) > 9007199254740991 then v_nonint := true; end if;
    if v_a = 0 then v_zero := true; end if;
    if (v_a < 0) <> v_neg then v_mixed := true; end if;
    v_sum := v_sum + v_a;
  end loop;
  if v_nonint then return 'not_integer'; end if;
  if v_zero then return 'zero_part'; end if;
  if p_total = 0 then return 'over_total'; end if;
  if v_mixed then return 'mixed_sign'; end if;
  if abs(v_sum) > abs(p_total::numeric) then return 'over_total'; end if;
  if not coalesce(p_allow_gap, false) and v_sum <> p_total then return 'not_total'; end if;
  return null;
end;
$$;
revoke execute on function public.parts_invalid_reason(jsonb, bigint, boolean) from public, anon, authenticated;

-- Largest absolute amount wins, ties to the lowest array position (engine primaryCategory).
create or replace function public.parts_primary_category(p_parts jsonb)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select (x.e ->> 'c')::uuid
    from jsonb_array_elements(p_parts) with ordinality x(e, ord)
   order by abs((x.e ->> 'a')::numeric) desc, x.ord asc
   limit 1
$$;
revoke execute on function public.parts_primary_category(jsonb) from public, anon, authenticated;

-- Largest-remainder split like hh_allocate, but weights are numeric: a part can be larger than an int4 (hh_allocate takes
-- int[]). Zero weights get 0; ties to the lowest position; a negative total splits on its magnitude; all zero is 22023.
create or replace function public.parts_allocate(p_total bigint, p_weights numeric[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := coalesce(array_length(p_weights, 1), 0);
  v_sum numeric := 0;
  v_abs numeric := abs(p_total::numeric);
  floors numeric[] := '{}';
  rems numeric[] := '{}';
  v_left numeric;
  res bigint[] := '{}';
  i integer;
  r record;
begin
  if n = 0 then
    raise exception 'parts_allocate: weights must be a non-empty array' using errcode = '22023';
  end if;
  for i in 1..n loop
    if p_weights[i] is null or p_weights[i] < 0 then
      raise exception 'parts_allocate: weight % must be non-negative', p_weights[i] using errcode = '22023';
    end if;
    v_sum := v_sum + p_weights[i];
  end loop;
  if v_sum = 0 then
    raise exception 'parts_allocate: at least one weight must be above 0' using errcode = '22023';
  end if;
  for i in 1..n loop
    floors := floors || div(v_abs * p_weights[i], v_sum);
    rems := rems || mod(v_abs * p_weights[i], v_sum);
  end loop;
  v_left := v_abs - (select sum(f) from unnest(floors) f);
  for r in select o.i from (select g as i from generate_series(1, n) g) o order by rems[o.i] desc, o.i asc limit v_left::int loop
    floors[r.i] := floors[r.i] + 1;
  end loop;
  for i in 1..n loop
    res := res || (case when p_total < 0 then -floors[i] else floors[i] end)::bigint;
  end loop;
  return res;
end;
$$;
revoke execute on function public.parts_allocate(bigint, numeric[]) from public, anon, authenticated;

-- 2. Item link: any later hand edit of the parts, the split rule or the total ends it (UI-SPEC), unless the writing RPC
-- says so (fincwin.item_split_rpc = 'on') or the same statement writes item_split itself (an Undo restore).
create or replace function public.tg_item_split_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.item_split is not null
     and new.item_split is not distinct from old.item_split
     and coalesce(current_setting('fincwin.item_split_rpc', true), '') <> 'on' then
    new.item_split := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_item_split_unlink() from public, anon, authenticated;

drop trigger if exists transactions_item_split_unlink on public.transactions;
create trigger transactions_item_split_unlink
  before update of category_parts, split_rule, split_manual, original_amount on public.transactions
  for each row execute function public.tg_item_split_unlink();

-- 3. Guard: the database re-checks parts whenever they are written (clients are never trusted) -------------------------
create or replace function public.tg_category_parts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean;
  v_reason text;
begin
  if new.category_parts is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := new.category_parts is distinct from old.category_parts;
  end if;
  if v_changed then
    v_reason := public.parts_invalid_reason(new.category_parts, new.original_amount, true);
    if v_reason is not null then
      raise exception using errcode = 'PT001', message = v_reason;
    end if;
    if exists (
      select 1 from jsonb_array_elements(new.category_parts) e
       where (e ->> 'c') is not null
         and not exists (select 1 from public.categories c where c.id = (e ->> 'c')::uuid and c.owner_id = new.created_by)) then
      raise exception using errcode = 'PT001', message = 'category_not_owned';
    end if;
    if new.transfer_id is not null and exists (
      select 1 from jsonb_array_elements(new.category_parts) e
        join public.categories c on c.id = (e ->> 'c')::uuid
       where c.builtin_key = 'Transfer') then
      raise exception using errcode = 'PT001', message = 'transfer_part_on_transfer_line';
    end if;
  end if;
  -- also after a pure total or category edit: category_id is always the largest part (D-04). The parts are never re-spread (D-03).
  new.category_id := public.parts_primary_category(new.category_parts);
  return new;
end;
$$;
revoke execute on function public.tg_category_parts_guard() from public, anon, authenticated;

drop trigger if exists transactions_category_parts_guard on public.transactions;
create trigger transactions_category_parts_guard
  before insert or update of category_parts, category_id, original_amount on public.transactions
  for each row execute function public.tg_category_parts_guard();

-- 4. Deleting a category turns its parts into Uncategorised -------------------------------------------------------------
create or replace function public.tg_categories_parts_unlink()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.transactions t
     set category_parts = (
       select jsonb_agg(case when (x.e ->> 'c')::uuid = old.id then jsonb_set(x.e, '{c}', 'null'::jsonb) else x.e end order by x.ord)
         from jsonb_array_elements(t.category_parts) with ordinality x(e, ord))
   where t.category_parts is not null
     and t.category_parts @> jsonb_build_array(jsonb_build_object('c', old.id::text));
  return old;
end;
$$;
revoke execute on function public.tg_categories_parts_unlink() from public, anon, authenticated;

drop trigger if exists categories_parts_unlink on public.categories;
create trigger categories_parts_unlink
  before delete on public.categories
  for each row execute function public.tg_categories_parts_unlink();

-- 5. Partner mapping: parts are stored in the line creator's categories ---------------------------------------------------
-- One category: kept when the creator owns it; a category the caller owns maps to the creator's category with the same
-- builtin_key (else null = Uncategorised); anything else raises PT001 category_not_owned.
create or replace function public.map_category_to_creator(p_c uuid, p_creator uuid, p_caller uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_key text;
  v_mapped uuid;
begin
  if p_c is null then return null; end if;
  select c.owner_id, c.builtin_key into v_owner, v_key from public.categories c where c.id = p_c;
  if not found then
    raise exception using errcode = 'PT001', message = 'category_not_owned';
  end if;
  if v_owner = p_creator then return p_c; end if;
  if v_owner = p_caller then
    if v_key is null then return null; end if;
    select c2.id into v_mapped from public.categories c2
     where c2.owner_id = p_creator and c2.builtin_key = v_key and c2.archived_at is null;
    return v_mapped;
  end if;
  raise exception using errcode = 'PT001', message = 'category_not_owned';
end;
$$;
revoke execute on function public.map_category_to_creator(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.map_parts_to_creator(p_parts jsonb, p_creator uuid, p_caller uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_out jsonb := '[]'::jsonb;
  v_c uuid;
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' then
    return p_parts;
  end if;
  for r in select x.e, x.ord from jsonb_array_elements(p_parts) with ordinality x(e, ord) order by x.ord loop
    if jsonb_typeof(r.e) <> 'object' or jsonb_typeof(r.e -> 'c') not in ('null', 'string')
       or (jsonb_typeof(r.e -> 'c') = 'string'
           and (r.e ->> 'c') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
      return p_parts;  -- not valid shape: parts_invalid_reason reports bad_shape
    end if;
    v_c := public.map_category_to_creator((r.e ->> 'c')::uuid, p_creator, p_caller);
    v_out := v_out || jsonb_build_array(jsonb_set(r.e, '{c}', coalesce(to_jsonb(v_c::text), 'null'::jsonb)));
  end loop;
  return v_out;
end;
$$;
revoke execute on function public.map_parts_to_creator(jsonb, uuid, uuid) from public, anon, authenticated;

-- 6. set_category_parts: the version-checked write, with the before state for Undo --------------------------------------
create or replace function public.set_category_parts(
  p_id uuid, p_expected_version int, p_parts jsonb, p_keep_as uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
  v_mapped jsonb;
  v_keep uuid;
  v_reason text;
  v_before jsonb;
  v_after jsonb;
  v_new_cat uuid;
begin
  select * into t from public.transactions x
   where x.id = p_id and x.deleted_at is null
     and (x.created_by = uid or (x.is_shared and x.household_id in (select public.user_household_ids())))
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', t.version, 'updated_by', t.updated_by);
  end if;
  if t.is_shared and public.hh_line_locked(t.id) then
    return jsonb_build_object('ok', false, 'reason', 'line_locked');
  end if;

  begin
    v_mapped := public.map_parts_to_creator(p_parts, t.created_by, uid);
    v_keep := public.map_category_to_creator(p_keep_as, t.created_by, uid);
  exception when sqlstate 'PT001' then
    return jsonb_build_object('ok', false, 'reason', 'category_not_owned');
  end;

  if p_parts is not null then
    v_reason := public.parts_invalid_reason(v_mapped, t.original_amount, false);
    if v_reason is not null then
      return jsonb_build_object('ok', false, 'reason', 'parts_invalid', 'detail', v_reason);
    end if;
    if t.transfer_id is not null and exists (
      select 1 from jsonb_array_elements(v_mapped) e
        join public.categories c on c.id = (e ->> 'c')::uuid
       where c.builtin_key = 'Transfer') then
      return jsonb_build_object('ok', false, 'reason', 'transfer_part_on_transfer_line');
    end if;
  end if;

  v_before := jsonb_build_object('parts', t.category_parts, 'category_id', t.category_id);
  perform set_config('fincwin.household_rpc', 'on', true);
  if p_parts is null then
    update public.transactions set category_parts = null, category_id = coalesce(v_keep, t.category_id) where id = t.id
      returning category_id into v_new_cat;
  else
    update public.transactions set category_parts = v_mapped where id = t.id
      returning category_id into v_new_cat;
  end if;
  perform set_config('fincwin.household_rpc', '', true);
  v_after := jsonb_build_object('parts', v_mapped, 'category_id', v_new_cat);

  if t.is_shared then
    perform public.hh_event(t.household_id, 'split_changed', null, t.id, null,
      jsonb_build_object('parts', true, 'before', v_before, 'after', v_after));
  end if;
  return jsonb_build_object('ok', true, 'before', v_before, 'version', t.version + 1);
end;
$$;
revoke execute on function public.set_category_parts(uuid, int, jsonb, uuid) from public, anon;
grant execute on function public.set_category_parts(uuid, int, jsonb, uuid) to authenticated;

-- 7. Server-side readers: the SQL mirror of engine scaleParts ---------------------------------------------------------
-- Rows in part order, the gap last. Weights are abs(part) plus abs(gap) when the gap has the line's sign; an "over" gap is
-- dropped. All weights zero: the first row takes the amount. Not callable by clients.
create or replace function public.line_category_amounts(p_tx uuid, p_amount bigint)
returns table (category_id uuid, amount bigint, is_gap boolean, label text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  t record;
  r record;
  v_cats uuid[] := '{}';
  v_amts numeric[] := '{}';
  v_labels text[] := '{}';
  v_gaps boolean[] := '{}';
  v_sum numeric := 0;
  v_gap numeric;
  v_weights numeric[] := '{}';
  v_shares bigint[];
  i integer;
begin
  select x.category_id, x.category_parts, x.original_amount into t from public.transactions x where x.id = p_tx;
  if not found then return; end if;
  if t.category_parts is null or jsonb_array_length(t.category_parts) < 2 then
    return query select t.category_id, p_amount, false, null::text;
    return;
  end if;
  for r in select x.e, x.ord from jsonb_array_elements(t.category_parts) with ordinality x(e, ord) order by x.ord loop
    v_cats := array_append(v_cats, (r.e ->> 'c')::uuid);
    v_amts := array_append(v_amts, (r.e ->> 'a')::numeric);
    v_labels := array_append(v_labels, r.e ->> 'l');
    v_gaps := array_append(v_gaps, false);
    v_sum := v_sum + (r.e ->> 'a')::numeric;
  end loop;
  v_gap := t.original_amount::numeric - v_sum;
  if v_gap <> 0 and (v_gap < 0) = (t.original_amount < 0) then
    v_cats := array_append(v_cats, null::uuid);
    v_amts := array_append(v_amts, v_gap);
    v_labels := array_append(v_labels, null::text);
    v_gaps := array_append(v_gaps, true);
  end if;
  for i in 1..cardinality(v_amts) loop
    v_weights := array_append(v_weights, abs(v_amts[i]));
  end loop;
  if (select sum(w) from unnest(v_weights) w) = 0 then
    v_shares := array_fill(0::bigint, array[cardinality(v_weights)]);
    v_shares[1] := p_amount;
  else
    v_shares := public.parts_allocate(p_amount, v_weights);
  end if;
  for i in 1..cardinality(v_amts) loop
    category_id := v_cats[i];
    amount := v_shares[i];
    is_gap := v_gaps[i];
    label := v_labels[i];
    return next;
  end loop;
end;
$$;
revoke execute on function public.line_category_amounts(uuid, bigint) from public, anon, authenticated;

-- 8. apply_patches: body of 20261125001100 with category_parts and item_split added so Undo can restore a split. ----------
-- Changed lines are marked 10.1 (D-01, D-17). Same argument list, so create or replace keeps the grants; repeated below.

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
        'one_off', 'goal_id', 'income_kind', 'counts_as', 'refund_of',
        'category_parts', 'item_split']  -- 2.2, 05 (D-29, D-34), 05.2; 10.1 (D-01, D-17)
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
        when 'transactions.category_parts' then 'jsonb'  -- 10.1 (D-01)
        when 'transactions.item_split' then 'jsonb'  -- 10.1 (D-17)
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
