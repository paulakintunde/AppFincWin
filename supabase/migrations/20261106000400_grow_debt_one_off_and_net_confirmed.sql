-- 06 Grow gap closure (D-33 one-off debt payment; audit 4.2 safety net starts confirmed). Additive only.
--
-- 1. transactions.debt_id: a nullable link from a payment line to its debt, written only by record_debt_one_off.
--    There is no client insert or update grant on it, and a guard trigger refuses a debt from another household
--    even for a writer that bypasses grants (the table owner).
-- 2. record_debt_one_off(p_debt_id, p_payment, p_undo_step): "Use $1,000 once" on a debt records ONE Expected (pending)
--    payment out in a single save, with ONE server-built Undo step labelled 'debtOneOffRecorded'.
--    debts.balance is not changed: balances are the user's own figure and the line stays Expected until marked paid.
-- 3. savings_goals.net_confirmed_at joins the client insert grant, so a safety net made in the app starts confirmed.
-- 4. set_safety_net re-issued: the goal it flags gets net_confirmed_at = coalesce(net_confirmed_at, now()), so
--    "We moved your safety net here" never shows for a net the user chose. Undo does not restore net_confirmed_at: it is
--    only read while is_safety_net is true, and an un-flagged goal ignores it.
-- The live migrations 20261106000100, 200 and 300 are not edited.

-- 1. transactions.debt_id ---------------------------------------------------------------------------------------
alter table public.transactions add column if not exists debt_id uuid references public.debts(id) on delete set null;

create index if not exists transactions_debt_idx on public.transactions (debt_id)
  where debt_id is not null and deleted_at is null;

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
         and d.household_id = new.household_id) then
      raise exception 'transactions: debt is not in this household' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_transaction_debt() from public, anon, authenticated;

drop trigger if exists guard_transaction_debt on public.transactions;
create trigger guard_transaction_debt before insert or update of debt_id on public.transactions
  for each row execute function public.guard_transaction_debt();

-- The view is `select *`, whose column list Postgres freezes at creation: re-create it so debt_id is selectable.
-- debt_id is the last column of the table, so it appends at the end. Definition, security_invoker and grants are
-- exactly those of 20261028001300.
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- 2. record_debt_one_off ----------------------------------------------------------------------------------------
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
     or char_length(btrim(coalesce(p_payment ->> 'name', ''))) not between 1 and 80 then
    raise exception 'record_debt_one_off: the payment is malformed' using errcode = '22023';
  end if;
  v_amount := (p_payment ->> 'amount')::bigint;

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'record_debt_one_off: the debt is not in your household' using errcode = '42501';
  end if;
  if v_debt.deleted_at is not null or v_debt.paid_off_on is not null then
    raise exception 'record_debt_one_off: the debt is already paid off or removed' using errcode = '22023';
  end if;
  if v_amount > v_debt.balance then
    raise exception 'record_debt_one_off: the payment is more than the debt' using errcode = '22023';
  end if;

  if not exists (select 1 from public.accounts a
                  where a.id = v_account and a.household_id = v_debt.household_id and a.deleted_at is null) then
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
          p_payment ->> 'time_zone', btrim(p_payment ->> 'name'), v_category, 'pending', p_debt_id);

  -- Undo removes the line (record_debt_sale op shape). No system column is patched, so allow_system_keys stays off.
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtOneOffRecorded', coalesce(p_undo_step -> 'label_params', '{}'::jsonb),
          jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', v_id, 'expectedVersion', 1,
                                               'patch', jsonb_build_object('deleted_at', '$now'))));

  return jsonb_build_object('status', 'applied', 'transaction_id', v_id, 'undo_step_id', v_step_id);
end;
$$;

revoke execute on function public.record_debt_one_off(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_debt_one_off(uuid, jsonb, jsonb) to authenticated;

-- 3. A safety net made in the app starts confirmed ------------------------------------------------------------------
grant insert (net_confirmed_at) on public.savings_goals to authenticated;

-- 4. set_safety_net re-issued (body of 20261106000200, plus net_confirmed_at) -------------------------------------
create or replace function public.set_safety_net(p_goal_id uuid, p_expected_versions jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_target public.savings_goals%rowtype;
  v_old public.savings_goals%rowtype;
  v_has_old boolean;
  v_tv integer;
  v_ov integer;
  v_target_version integer;
  v_old_version integer;
  v_ops jsonb;
begin
  if v_uid is null then
    raise exception 'set_safety_net: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'safetyNetChanged', 'set_safety_net', false);
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;
  if p_goal_id is null or jsonb_typeof(p_expected_versions) is distinct from 'object' then
    raise exception 'set_safety_net: the goal and its versions are required' using errcode = '22023';
  end if;

  select * into v_target from public.savings_goals g where g.id = p_goal_id for update;
  if not found then
    raise exception 'set_safety_net: that goal does not exist' using errcode = '22023';
  end if;
  if v_target.created_by is distinct from v_uid or v_target.household_id not in (select public.user_household_ids()) then
    raise exception 'set_safety_net: that goal is not yours' using errcode = '42501';
  end if;
  if v_target.deleted_at is not null or v_target.kind <> 'pot' or v_target.bucket is not null then
    raise exception 'set_safety_net: that goal cannot be the safety net' using errcode = '22023';
  end if;
  if v_target.is_safety_net then
    return jsonb_build_object('status', 'unchanged', 'goal_id', v_target.id);
  end if;

  select * into v_old from public.savings_goals g
   where g.household_id = v_target.household_id and g.created_by = v_uid and g.is_safety_net and g.deleted_at is null
     and g.id <> v_target.id
   for update;
  v_has_old := found;

  begin
    v_tv := (p_expected_versions ->> v_target.id::text)::integer;
    if v_has_old then
      v_ov := (p_expected_versions ->> v_old.id::text)::integer;
    end if;
  exception when others then
    raise exception 'set_safety_net: p_expected_versions is malformed' using errcode = '22023';
  end;
  if v_tv is distinct from v_target.version or (v_has_old and v_ov is distinct from v_old.version) then
    return jsonb_build_object('status', 'conflict');
  end if;

  perform set_config('fincwin.safety_net_rpc', 'on', true);
  if v_has_old then
    update public.savings_goals set is_safety_net = false where id = v_old.id returning version into v_old_version;
  end if;
  -- net_confirmed_at: a net the user chose here is confirmed from the start (audit 4.2). Undo leaves it: it is only
  -- read while is_safety_net is true.
  update public.savings_goals
     set is_safety_net = true, locked = true, protect = true, net_confirmed_at = coalesce(net_confirmed_at, now())
   where id = v_target.id returning version into v_target_version;
  perform set_config('fincwin.safety_net_rpc', 'off', true);

  -- Undo: un-flag the target (restoring its own Locked and Protect), then put the flag back on the old net, in that order
  -- so the one-net index holds while the ops replay.
  v_ops := jsonb_build_array(jsonb_build_object(
    'entity', 'savings_goals', 'id', v_target.id, 'expectedVersion', v_target_version,
    'patch', jsonb_build_object('is_safety_net', false, 'locked', v_target.locked, 'protect', v_target.protect)));
  if v_has_old then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'savings_goals', 'id', v_old.id, 'expectedVersion', v_old_version,
      'patch', jsonb_build_object('is_safety_net', true)));
  end if;
  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, v_uid, 'safetyNetChanged', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, true);

  return jsonb_build_object('status', 'applied', 'goal_id', v_target.id,
                            'previous_goal_id', case when v_has_old then v_old.id else null end,
                            'goal_version', v_target_version, 'previous_version', v_old_version, 'undo_step_id', v_step_id);
end;
$$;
revoke execute on function public.set_safety_net(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.set_safety_net(uuid, jsonb, jsonb) to authenticated;
