-- 08.1-12 (D-12): a Household purchase is recorded as shared money. Proven by supabase/tests/database/112_decide_go_one_save.test.sql.
-- Not pushed by this plan: plan 15 pushes it, after 20261125000400.
--
-- Additive: the jsonb-rows overload of record_decide_go accepts an optional boolean `is_shared` on a row and inserts it. The Phase 8
-- trigger share_on_insert (20261122000600) does the rest exactly as it does for any shared line: the household's split rule, the
-- household-currency stamp, and the stored split. A household of one, a debt-linked or a goal-linked line stays personal there.
-- Joint-account lines are shared by the same trigger whatever the row says. The p_row_ids overload and every other rule are unchanged.
-- Series need no change: create_recurring_series already reads `is_shared` from the series object (Phase 8 D-16).
-- Body is the 20261125000400 body; changed lines are marked 08.1-12.

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

  -- 2. The check: the caller's own, still open or waiting (08.1-10), locked before any row is written.
  select * into v_check from public.decide_checks where id = p_check_id and deleted_at is null for update;
  if not found
     or v_check.created_by is distinct from (select auth.uid())
     or v_check.household_id not in (select public.user_household_ids()) then
    raise exception 'record_decide_go: the check is not yours' using errcode = '42501';
  end if;
  if v_check.status not in ('open', 'waiting') then
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
                     'time_zone', 'note', 'name', 'category_id', 'payment_type', 'status', 'transfer_id', 'one_off',
                     'is_shared')  -- 08.1-12
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
                                     transfer_id, one_off, is_shared)  -- 08.1-12: share_on_insert applies the split
    values (v_row.id, v_check.household_id, (select auth.uid()), v_row.account_id, v_row.original_amount,
            v_row.original_currency, v_row.local_date, v_row.time_zone, v_row.note, v_row.name, v_row.category_id,
            v_row.payment_type, coalesce(v_row.status, 'paid'), v_row.transfer_id, coalesce(v_row.one_off, false),
            coalesce(v_row.is_shared, false))  -- 08.1-12
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
