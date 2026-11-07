-- 06 Grow (GRW-08, GRW-09, D-13, D-16, D-20, APP-30). New RPCs only.
--
-- Two atomic debt saves, each ONE transaction and ONE undo step:
--
--   save_debt_plan(p_debt_id uuid, p_expected_version int, p_extra bigint, p_order text 'rate'|'balance'|null,
--                  p_series jsonb, p_undo_step jsonb)
--     p_series (required when p_extra > 0): {id uuid, account_id uuid, anchor_date 'YYYY-MM-DD', time_zone, name,
--                  category_id uuid|null}. The amount is taken from p_extra (money out, negative); freq is monthly.
--     -> {status:'applied', series_id uuid|null, undo_step_id} | {status:'already-applied'} | {status:'conflict'}
--     undo label_key: 'debtPlanSaved' (registered by 06-09).
--
--   record_debt_sale(p_debt_id uuid, p_expected_version int, p_sale jsonb, p_payment jsonb|null, p_undo_step jsonb)
--     p_sale / p_payment: {id uuid, account_id uuid, amount > 0, currency, local_date, time_zone, name,
--                  category_id uuid|null (payment only)}
--     -> {status:'applied', paid_off bool, still_owed bigint, undo_step_id} | {status:'already-applied'} | {status:'conflict'}
--     undo label_key: 'debtSaleRecorded' (registered by 06-09).
--
-- debts.payoff_extra and debts.extra_series_id have no client grant (20261106000100); only save_debt_plan writes them.
-- Independent of 20261106000200 (06-06): nothing here reads an object created there.
--
-- Undo note: apply_patches' debts allowlist covers payoff_order, balance and paid_off_on but not payoff_extra or
-- extra_series_id, so Undo of a plan save restores the Expected series and the order; the client reads the extra
-- from the live series, not from payoff_extra alone.

-- Validates an undo step before anything is locked or written (record_decide_outcome pattern). Returns the step id.
create or replace function public.grow_check_undo_step(p_undo_step jsonb, p_label_key text, p_fn text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_params jsonb;
begin
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception '%: p_undo_step must be an object', p_fn using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception '%: p_undo_step.id must be a uuid', p_fn using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception '%: p_undo_step.id must be a uuid', p_fn using errcode = '22023';
  end if;
  if p_undo_step ->> 'label_key' is distinct from p_label_key then
    raise exception '%: the undo step label is not allowed here', p_fn using errcode = '22023';
  end if;
  v_params := coalesce(p_undo_step -> 'label_params', '{}'::jsonb);
  if jsonb_typeof(v_params) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(v_params) k where k <> 'name')
     or (v_params ? 'name' and (jsonb_typeof(v_params -> 'name') is distinct from 'string'
                                or char_length(v_params ->> 'name') > 80)) then
    raise exception '%: the undo step label params are malformed', p_fn using errcode = '22023';
  end if;
  return v_step_id;
end;
$$;
revoke execute on function public.grow_check_undo_step(jsonb, text, text) from public, anon, authenticated;

-- Ends one series on p_end (clamped by the caller to >= anchor_date) with end_reason 'stopped', deleting its unpaid
-- pending rows after p_end, and returns the series change envelope with end_reason restored on Undo.
create or replace function public.grow_end_series(p_series_id uuid, p_end date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_reason text;
  v_version integer;
  v_change jsonb;
begin
  select s.end_reason into v_old_reason from public.recurring_series s where s.id = p_series_id for update;
  update public.recurring_series set end_reason = 'stopped' where id = p_series_id
  returning version into v_version;
  v_change := public.end_recurring_series(p_series_id, v_version, p_end, null);
  if v_change ->> 'status' is distinct from 'applied' then
    raise exception 'grow_end_series: series % could not be ended (%)', p_series_id, v_change ->> 'status'
      using errcode = '22023';
  end if;
  return jsonb_set(v_change, '{series,before,end_reason}', coalesce(to_jsonb(v_old_reason), 'null'::jsonb));
end;
$$;
revoke execute on function public.grow_end_series(uuid, date) from public, anon, authenticated;

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
  if not found or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'save_debt_plan: the debt is not in your household' using errcode = '42501';
  end if;

  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'series_id', v_debt.extra_series_id, 'undo_step_id', v_step_id);
  end if;
  if v_debt.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  -- The existing Expected extra series, when it is still running.
  if v_debt.extra_series_id is not null then
    select * into v_old from public.recurring_series
     where id = v_debt.extra_series_id and deleted_at is null and household_id = v_debt.household_id;
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
       or char_length(v_name) not between 1 and 80 then
      raise exception 'save_debt_plan: the series is malformed' using errcode = '22023';
    end if;
    if not exists (select 1 from public.accounts a
                    where a.id = v_account and a.household_id = v_debt.household_id and a.deleted_at is null) then
      raise exception 'save_debt_plan: the account is not in your household' using errcode = '42501';
    end if;
  end if;

  -- Same amount on a running series: the series stays as it is.
  if p_extra > 0 and v_old_live and v_old.amount = -p_extra then
    v_new_series := v_old.id;
  else
    if v_old_live then
      v_next := (select min(t.occurrence_date) from public.transactions t
                  where t.recurring_series_id = v_old.id and t.status = 'pending' and t.deleted_at is null
                    and t.occurrence_date >= v_today);
      v_end := greatest(coalesce(v_next - 1, v_today), v_old.anchor_date);
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

  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
  v_ops := v_ops || jsonb_build_array(jsonb_build_object(
    'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
    'patch', jsonb_build_object('payoff_order', to_jsonb(v_debt.payoff_order))));

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtPlanSaved', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'series_id', v_new_series, 'undo_step_id', v_step_id);
end;
$$;

revoke execute on function public.save_debt_plan(uuid, integer, bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_debt_plan(uuid, integer, bigint, text, jsonb, jsonb) to authenticated;

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
       or char_length(btrim(coalesce(v_leg ->> 'name', ''))) not between 1 and 80 then
      raise exception 'record_debt_sale: the % is malformed', v_label using errcode = '22023';
    end if;
  end loop;
  if p_payment is not null and (p_payment ->> 'id') = (p_sale ->> 'id') then
    raise exception 'record_debt_sale: the sale and payment ids must differ' using errcode = '22023';
  end if;

  select * into v_debt from public.debts where id = p_debt_id and deleted_at is null for update;
  if not found or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'record_debt_sale: the debt is not in your household' using errcode = '42501';
  end if;

  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;
  if v_debt.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  if not exists (select 1 from public.accounts a
                  where a.id = (p_sale ->> 'account_id')::uuid and a.household_id = v_debt.household_id and a.deleted_at is null)
     or (p_payment is not null and not exists (
           select 1 from public.accounts a
            where a.id = (p_payment ->> 'account_id')::uuid and a.household_id = v_debt.household_id and a.deleted_at is null)) then
    raise exception 'record_debt_sale: the account is not in your household' using errcode = '42501';
  end if;

  -- The sale: money in.
  v_sale_id := (p_sale ->> 'id')::uuid;
  insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                   local_date, time_zone, name, status)
  values (v_sale_id, v_debt.household_id, (p_sale ->> 'account_id')::uuid, v_uid, (p_sale ->> 'amount')::bigint,
          p_sale ->> 'currency', (p_sale ->> 'local_date')::date, p_sale ->> 'time_zone',
          btrim(p_sale ->> 'name'), 'paid');

  v_still_owed := v_debt.balance;
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
    -- The final payment: money out.
    insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                     local_date, time_zone, name, category_id, status)
    values (v_payment_id, v_debt.household_id, (p_payment ->> 'account_id')::uuid, v_uid, -v_payment_amount,
            p_payment ->> 'currency', (p_payment ->> 'local_date')::date, p_payment ->> 'time_zone',
            btrim(p_payment ->> 'name'), v_category, 'paid');

    if v_payment_amount >= v_debt.balance then
      v_paid_off := true;
      v_still_owed := 0;
      v_paid_off_on := (p_payment ->> 'local_date')::date;
      -- Both the payment series and the Expected extra series stop at the payoff date.
      foreach v_sid in array array[v_debt.series_id, v_debt.extra_series_id] loop
        continue when v_sid is null;
        select * into v_series from public.recurring_series
         where id = v_sid and deleted_at is null and household_id = v_debt.household_id;
        continue when not found or (v_series.end_date is not null and v_series.end_date <= v_paid_off_on);
        v_changes := v_changes || jsonb_build_array(
          public.grow_end_series(v_sid, greatest(v_paid_off_on, v_series.anchor_date)));
      end loop;
    else
      v_still_owed := v_debt.balance - v_payment_amount;
    end if;

    update public.debts
       set balance = v_still_owed, paid_off_on = case when v_paid_off then v_paid_off_on else paid_off_on end
     where id = p_debt_id
    returning version into v_new_version;
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
  if p_payment is not null then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
      'patch', jsonb_build_object('balance', v_debt.balance, 'paid_off_on', to_jsonb(v_debt.paid_off_on))));
  end if;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtSaleRecorded', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'paid_off', v_paid_off, 'still_owed', v_still_owed,
                            'undo_step_id', v_step_id);
end;
$$;

revoke execute on function public.record_debt_sale(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_debt_sale(uuid, integer, jsonb, jsonb, jsonb) to authenticated;
