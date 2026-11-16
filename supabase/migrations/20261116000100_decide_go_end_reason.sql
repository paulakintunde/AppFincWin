-- 05.5-27 ARC-23 (owner decision 2026-11-14): Record as bought marks the ended bill Stopped. Band A2 (expand), push order in
-- 05.5-GATE.md. Proven by supabase/tests/database/99_decide_go_end_reason.test.sql.
--
-- record_decide_go (uuid[] overload) ended each replaced bill through end_recurring_series, which sets end_date only, so
-- Activity never showed "Stopped". Step 7 now ends it through grow_end_series (20261110000100): end_date and
-- end_reason = 'stopped' in one statement, undo-safe through series_change_inverse. Two differences from before, both kept
-- here and not in grow_end_series:
--   * the optimistic version check grow_end_series does not take is made here, under the row lock, and refuses a stale
--     series exactly as before (errcode 22023, "could not be ended (stale)");
--   * the end date is clamped to the series' anchor_date, so a Decide save can never take grow_end_series' soft-delete
--     branch (an end before the anchor) and delete a bill.
-- Everything else is the 20261016000300 body unchanged. The p_rows overload (20261021000100) calls this one.
-- Additive: create or replace of one function, same signature and grants. Nothing is dropped or renamed.

create or replace function public.record_decide_go(
  p_check_id uuid,
  p_row_ids uuid[],
  p_series jsonb,
  p_end_series jsonb,
  p_debt jsonb,
  p_decision jsonb,
  p_undo_step jsonb
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
  v_n_series := jsonb_array_length(p_series);
  if v_n_rows + v_n_series + (case when p_debt is null then 0 else 1 end) < 1 then
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
  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
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

revoke execute on function public.record_decide_go(uuid, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_decide_go(uuid, uuid[], jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
