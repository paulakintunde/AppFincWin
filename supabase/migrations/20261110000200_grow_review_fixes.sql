-- 06 Grow code review fixes (06-REVIEW.md, part 1 and the data side of parts 3 to 5). Additive. Live migrations are not
-- edited: every function below is re-issued from its LATEST definition and only the lines marked "-- 06 review" change.
--
--  1. grow_line_name: a derived line name ("<debt> final payment") longer than 80 characters is cut to 80 with an ellipsis
--     instead of failing the whole save (P3-WR-07).
--  2. sync_holding_value: the holding's value follows its latest value entry WITHOUT moving the holding's version, so the
--     "holding added" Undo and an edit made right after a value update are no longer refused (P1-CR-01).
--  3. guard_holding_lot: the last live value entry of a live holding cannot be removed (P1-IN-02).
--  4. grow_check_undo_step(jsonb, text, text) becomes a wrapper of the 4-argument check (P1-IN-03).
--  5. debt_balance_follows_line, owner decision 2026-11-10 (a paid one-off lowers the debt; unpaid, delete and Undo put it
--     back). The amount actually taken off is stored per line in debt_line_applied, and the reverse move adds back exactly
--     that, so pay and unpay are inverses even when the balance would have gone below 0 (P1-CR-02). The balance moves
--     under fincwin.system_restamp, so the debt's version does not move behind the client's back (P1-WR-02). Only money
--     out in the debt's own currency moves it (P1-WR-03). It now also runs on INSERT, so record_debt_sale tags its final
--     payment with debt_id and lets this trigger lower the balance (P1-WR-06, P5-WR-05).
--  6. record_debt_one_off: the payment must be in the debt's currency (P1-WR-03); long names are cut (P3-WR-07).
--  7. save_debt_plan: a new paid-from account is no longer ignored when the amount is unchanged (P1-WR-04); returns the
--     debt's new version (P3-WR-01); long names are cut (P3-WR-07).
--  8. record_debt_sale: the final payment carries debt_id (and so does the sale line, so both show under the debt and
--     Decide can tell them apart); the balance moves through the trigger only, so Undo restores it once; the payment
--     series keeps the anchor clamp on a back-dated sale (P1-WR-07); the payment must be in the debt's currency
--     (P1-WR-03); returns the debt's version (P3-WR-01); long names are cut (P3-WR-07).
--  9. materialise_series: a removed goal's contribution and a removed debt's Expected extra write no more lines (P1-CR-03,
--     defence for older app builds that remove with a plain patch).
-- 10. remove_goal / remove_debt, owner decision 2026-11-10: removing a goal or a debt stops its monthly series (the goal's
--     contribution; the debt's payment and Expected extra) and removes their unpaid Expected lines. Paid lines stay. One
--     RPC, one server-built Undo step that brings every row back (P1-CR-03, P1-WR-01, P5-CR-01).
-- 11. save_goal_plan: a new safety net starts confirmed (P1-WR-08); a change to a Wait goal's plan fields is refused with
--     an error instead of being silently reset by guard_savings_goal (P4-WR-02).
-- 12. guard_goal_line_paid: an Expected goal line of a live goal becomes paid only through confirm_goal_contribution (or
--     an Undo replay), never by a plain status patch (P5-WR-01). confirm_goal_contribution and undo_replay re-issued to
--     set the flags this guard reads.

-- 1. grow_line_name -------------------------------------------------------------------------------------------------
create or replace function public.grow_line_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(btrim(coalesce(p_name, ''))) <= 80 then btrim(coalesce(p_name, ''))
              else left(btrim(p_name), 79) || chr(8230) end;
$$;
revoke execute on function public.grow_line_name(text) from public, anon, authenticated;

-- 2. sync_holding_value (re-issued from 20261106000100) ----------------------------------------------------------------
create or replace function public.sync_holding_value()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_amount bigint;
  v_date date;
  v_restamp text := coalesce(current_setting('fincwin.system_restamp', true), '');  -- 06 review P1-CR-01
begin
  select l.amount, l.local_date into v_amount, v_date
    from public.holding_lots l
   where l.holding_id = new.holding_id and l.kind = 'value' and l.deleted_at is null
   order by l.local_date desc, l.created_at desc
   limit 1;
  if v_date is null then return null; end if;  -- no live value lot left: the holding is unchanged
  perform set_config('fincwin.holding_sync', 'on', true);
  -- 06 review P1-CR-01: the value follows the entry without moving the holding's version (bump_version skips a system
  -- restamp, the materialise_series pattern). The caller's own restamp setting is put back afterwards.
  perform set_config('fincwin.system_restamp', 'on', true);  -- 06 review
  update public.holdings set value = v_amount, value_as_of = v_date where id = new.holding_id;
  perform set_config('fincwin.system_restamp', v_restamp, true);  -- 06 review
  perform set_config('fincwin.holding_sync', '', true);
  return null;
end;
$$;
revoke execute on function public.sync_holding_value() from public, anon, authenticated;

-- 3. guard_holding_lot (re-issued from 20261106000100) -----------------------------------------------------------------
create or replace function public.guard_holding_lot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    if not exists (select 1 from public.holdings h
                    where h.id = new.holding_id and h.household_id = new.household_id and h.created_by = new.created_by) then
      raise exception 'holding_lots: holding is not yours' using errcode = '42501';
    end if;
    return new;
  end if;
  new.id := old.id;
  new.holding_id := old.holding_id;
  new.household_id := old.household_id;
  new.kind := old.kind;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.is_sample := old.is_sample;
  -- 06 review P1-IN-02: a live holding keeps at least one live value entry; removing the last would leave the holding
  -- showing a value with no history behind it.
  if old.kind = 'value' and old.deleted_at is null and new.deleted_at is not null  -- 06 review
     and exists (select 1 from public.holdings h where h.id = old.holding_id and h.deleted_at is null)  -- 06 review
     and not exists (select 1 from public.holding_lots l  -- 06 review
                      where l.holding_id = old.holding_id and l.kind = 'value' and l.deleted_at is null and l.id <> old.id) then  -- 06 review
    raise exception 'holding_lots: the last value entry of a holding cannot be removed' using errcode = '22023';  -- 06 review
  end if;  -- 06 review
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_holding_lot() from public, anon, authenticated;

-- 4. grow_check_undo_step(jsonb, text, text): the 3-argument form is the 4-argument check without the ops check -------
-- (P1-IN-03). Same checks, same errors; one body to keep right.
create or replace function public.grow_check_undo_step(p_undo_step jsonb, p_label_key text, p_fn text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.grow_check_undo_step(p_undo_step, p_label_key, p_fn, false);  -- 06 review P1-IN-03
$$;
revoke execute on function public.grow_check_undo_step(jsonb, text, text) from public, anon, authenticated;

-- 5. debt_balance_follows_line (re-issued from 20261110000100; rewritten, so every line of the body is new) -------------
-- What a paid line actually took off its debt. Server-only bookkeeping: RLS on, no policy, no grant. It goes with the line
-- (and with the debt) on a hard delete, so the account-deletion purge needs nothing of its own.
create table if not exists public.debt_line_applied (
  transaction_id uuid primary key references public.transactions(id) on delete cascade,
  debt_id uuid not null references public.debts(id) on delete cascade,
  amount bigint not null check (amount between 0 and 10000000000000)
);
create index if not exists debt_line_applied_debt_idx on public.debt_line_applied (debt_id);
alter table public.debt_line_applied enable row level security;
revoke all on public.debt_line_applied from public, anon, authenticated;

-- A line counts toward its debt while it is linked (debt_id), paid, not deleted, money out (original_amount < 0) and in
-- the debt's own currency. On every change the old amount taken off is added back in full and the new one is taken off
-- again, at most what is still owed. The amount actually taken off is remembered, so a later reverse adds back exactly
-- that: paying 800 on a 200 balance takes 200, and un-paying it puts 200 back, never 800. A line paid before this
-- migration has no record; the old trigger took abs(original_amount) off it, so that is what its reverse adds back.
-- The debt's version does not move (fincwin.system_restamp): the balance follows a line, it is not a debt edit, so a
-- queued debt edit or an earlier debt Undo step is not refused because of it. The caller's setting is put back.
create or replace function public.debt_balance_follows_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restamp text := coalesce(current_setting('fincwin.system_restamp', true), '');
  v_had boolean := false;
  v_prev_debt uuid;
  v_prev_amount bigint := 0;
  v_old_want bigint := 0;
  v_want bigint := 0;
  v_applied bigint := 0;
begin
  if new.debt_id is not null and new.status = 'paid' and new.deleted_at is null and new.original_amount < 0
     and exists (select 1 from public.debts d where d.id = new.debt_id and d.currency = new.original_currency) then
    v_want := -new.original_amount;
  end if;

  if tg_op = 'UPDATE' then
    select a.debt_id, a.amount into v_prev_debt, v_prev_amount
      from public.debt_line_applied a where a.transaction_id = old.id;
    v_had := found;
    if not v_had and old.debt_id is not null and old.status = 'paid' and old.deleted_at is null then
      v_prev_debt := old.debt_id;
      v_prev_amount := abs(old.original_amount);
    end if;
    if old.debt_id is not null and old.status = 'paid' and old.deleted_at is null and old.original_amount < 0
       and exists (select 1 from public.debts d where d.id = old.debt_id and d.currency = old.original_currency) then
      v_old_want := -old.original_amount;
    end if;
    -- The same debt asked for the same amount: nothing moves, and the record stays as it is.
    if old.debt_id is not distinct from new.debt_id and v_old_want = v_want then
      return null;
    end if;
  elsif v_want = 0 then
    return null;
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);
  if v_prev_debt is not null and v_prev_amount > 0 then
    update public.debts set balance = least(10000000000000, balance + v_prev_amount) where id = v_prev_debt;
  end if;
  if v_want > 0 then
    select least(v_want, d.balance) into v_applied from public.debts d where d.id = new.debt_id for update;
    update public.debts set balance = balance - v_applied where id = new.debt_id;
  end if;
  perform set_config('fincwin.system_restamp', v_restamp, true);

  if v_want > 0 then
    insert into public.debt_line_applied (transaction_id, debt_id, amount) values (new.id, new.debt_id, v_applied)
    on conflict (transaction_id) do update set debt_id = excluded.debt_id, amount = excluded.amount;
  elsif v_had then
    delete from public.debt_line_applied where transaction_id = new.id;
  end if;
  return null;
end;
$$;
revoke execute on function public.debt_balance_follows_line() from public, anon, authenticated;

drop trigger if exists debt_balance_follows_line on public.transactions;
create trigger debt_balance_follows_line after update of status, deleted_at, original_amount, original_currency, debt_id
  on public.transactions
  for each row
  when (old.debt_id is not null or new.debt_id is not null)
  execute function public.debt_balance_follows_line();
-- An INSERT trigger's WHEN cannot read OLD, so the insert side is its own trigger (record_debt_sale's final payment).
drop trigger if exists debt_balance_follows_line_insert on public.transactions;
create trigger debt_balance_follows_line_insert after insert on public.transactions
  for each row
  when (new.debt_id is not null)
  execute function public.debt_balance_follows_line();

-- 6. record_debt_one_off (re-issued from 20261106000400) -----------------------------------------------------------
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
     or char_length(btrim(coalesce(p_payment ->> 'name', ''))) not between 1 and 200 then  -- 06 review P3-WR-07: cut to 80 below
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
  -- 06 review P1-WR-03: the balance is in the debt's currency, so the payment is too (a 0-decimal yen line must never
  -- move a dollar balance by its raw minor units).
  if p_payment ->> 'currency' is distinct from v_debt.currency then  -- 06 review
    raise exception 'record_debt_one_off: the payment must be in the debt''s currency' using errcode = '22023';  -- 06 review
  end if;  -- 06 review

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
          p_payment ->> 'time_zone', public.grow_line_name(p_payment ->> 'name'), v_category, 'pending', p_debt_id);  -- 06 review P3-WR-07

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

-- 7. save_debt_plan (re-issued from 20261110000100) ----------------------------------------------------------------
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
  v_other public.debts%rowtype;  -- 06 review P3-WR-03
  v_oseries public.recurring_series%rowtype;  -- 06 review
  v_ochange jsonb;  -- 06 review
  v_oversion integer;  -- 06 review
  v_other_ops jsonb := '[]'::jsonb;  -- 06 review
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
    return jsonb_build_object('status', 'already-applied', 'series_id', v_debt.extra_series_id, 'undo_step_id', v_step_id,
                              'version', v_debt.version);  -- 06 review P3-WR-01
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
       or char_length(v_name) not between 1 and 200 then  -- 06 review P3-WR-07
      raise exception 'save_debt_plan: the series is malformed' using errcode = '22023';
    end if;
    v_name := public.grow_line_name(v_name);  -- 06 review P3-WR-07: a long debt name is cut to 80, not refused
    if not exists (select 1 from public.accounts a
                    where a.id = v_account and a.household_id = v_debt.household_id and a.deleted_at is null) then
      raise exception 'save_debt_plan: the account is not in your household' using errcode = '42501';
    end if;
  end if;

  -- Same amount from the same account on a running series: the series stays as it is. A new paid-from account takes the
  -- end-and-create branch below (06 review P1-WR-04: it was silently ignored).
  if p_extra > 0 and v_old_live and v_old.amount = -p_extra and v_old.account_id = v_account then  -- 06 review
    v_new_series := v_old.id;
  else
    if v_old_live then
      v_next := (select min(t.occurrence_date) from public.transactions t
                  where t.recurring_series_id = v_old.id and t.status = 'pending' and t.deleted_at is null
                    and t.occurrence_date >= v_today);
      -- Before the first date, grow_end_series drops the series rather than keeping its first line.
      v_end := coalesce(v_next - 1, v_today);
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

  -- 06 review P3-WR-03: one extra a month per household. Putting the extra on this debt takes it off any other debt in the
  -- same save (its Expected extra series is ended, or dropped before its first date, as above), so moving the extra is ONE
  -- Undo and the payoff segment never counts two extras. Each other debt row moves by one version, as the step needs.
  if p_extra > 0 then  -- 06 review
    for v_other in  -- 06 review
      select * from public.debts d  -- 06 review
       where d.household_id = v_debt.household_id and d.id <> p_debt_id and d.deleted_at is null  -- 06 review
         and (d.payoff_extra > 0 or d.extra_series_id is not null)  -- 06 review
       order by d.id  -- 06 review
       for update  -- 06 review
    loop  -- 06 review
      v_ochange := null;  -- 06 review
      select * into v_oseries from public.recurring_series  -- 06 review
       where id = v_other.extra_series_id and deleted_at is null and household_id = v_debt.household_id;  -- 06 review
      if found then  -- 06 review
        v_today := (now() at time zone v_oseries.time_zone)::date;  -- 06 review
        if v_oseries.end_date is null or v_oseries.end_date >= v_today then  -- 06 review
          v_next := (select min(t.occurrence_date) from public.transactions t  -- 06 review
                      where t.recurring_series_id = v_oseries.id and t.status = 'pending' and t.deleted_at is null  -- 06 review
                        and t.occurrence_date >= v_today);  -- 06 review
          v_ochange := public.grow_end_series(v_oseries.id, coalesce(v_next - 1, v_today));  -- 06 review
        end if;  -- 06 review
      end if;  -- 06 review
      update public.debts set payoff_extra = 0, extra_series_id = null where id = v_other.id  -- 06 review
      returning version into v_oversion;  -- 06 review
      if v_ochange is not null then  -- 06 review
        v_other_ops := v_other_ops || public.series_change_inverse(v_ochange);  -- 06 review
      end if;  -- 06 review
      v_other_ops := v_other_ops || jsonb_build_array(jsonb_build_object(  -- 06 review
        'entity', 'debts', 'id', v_other.id, 'expectedVersion', v_oversion,  -- 06 review
        'patch', jsonb_build_object('payoff_extra', v_other.payoff_extra, 'extra_series_id', to_jsonb(v_other.extra_series_id))));  -- 06 review
    end loop;  -- 06 review
  end if;  -- 06 review

  for v_change in select e.value from jsonb_array_elements(v_changes) e loop
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;
  -- The debt restore goes last: the series rows are back first, so extra_series_id points at a restored series.
  v_ops := v_ops || jsonb_build_array(jsonb_build_object(
    'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
    'patch', jsonb_build_object('payoff_order', to_jsonb(v_debt.payoff_order),
                                'payoff_extra', v_debt.payoff_extra,
                                'extra_series_id', to_jsonb(v_debt.extra_series_id))));

  v_ops := v_ops || v_other_ops;  -- 06 review P3-WR-03: the other debts' extras come back too

  -- allow_system_keys: payoff_extra and extra_series_id are server-only, so only this server-built step may restore them.
  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, v_uid, 'debtPlanSaved', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, true);

  -- 06 review P3-WR-01: the debt's new version, so the client chains its next write on it instead of waiting for a refetch.
  return jsonb_build_object('status', 'applied', 'series_id', v_new_series, 'undo_step_id', v_step_id,
                            'version', v_new_version);  -- 06 review
end;
$$;

revoke execute on function public.save_debt_plan(uuid, integer, bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.save_debt_plan(uuid, integer, bigint, text, jsonb, jsonb) to authenticated;

-- 8. record_debt_sale (re-issued from 20261110000100) --------------------------------------------------------------
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
       or char_length(btrim(coalesce(v_leg ->> 'name', ''))) not between 1 and 200 then  -- 06 review P3-WR-07: cut to 80 below
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
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id,
                              'version', v_debt.version);  -- 06 review P3-WR-01
  end if;
  if v_debt.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;
  -- 06 review P1-WR-03: the final payment comes off a balance kept in the debt's currency, so it is in that currency.
  if p_payment is not null and p_payment ->> 'currency' is distinct from v_debt.currency then  -- 06 review
    raise exception 'record_debt_sale: the payment must be in the debt''s currency' using errcode = '22023';  -- 06 review
  end if;  -- 06 review

  if not exists (select 1 from public.accounts a
                  where a.id = (p_sale ->> 'account_id')::uuid and a.household_id = v_debt.household_id and a.deleted_at is null)
     or (p_payment is not null and not exists (
           select 1 from public.accounts a
            where a.id = (p_payment ->> 'account_id')::uuid and a.household_id = v_debt.household_id and a.deleted_at is null)) then
    raise exception 'record_debt_sale: the account is not in your household' using errcode = '42501';
  end if;

  -- The sale: money in. 06 review P5-WR-05: linked to the debt, so it shows under the debt and Decide reads it as the
  -- one-time money in of a sale, never as pay. Money in never moves the balance (debt_balance_follows_line).
  v_sale_id := (p_sale ->> 'id')::uuid;
  insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                   local_date, time_zone, name, status, debt_id)  -- 06 review
  values (v_sale_id, v_debt.household_id, (p_sale ->> 'account_id')::uuid, v_uid, (p_sale ->> 'amount')::bigint,
          p_sale ->> 'currency', (p_sale ->> 'local_date')::date, p_sale ->> 'time_zone',
          public.grow_line_name(p_sale ->> 'name'), 'paid', p_debt_id);  -- 06 review P3-WR-07, P5-WR-05

  v_still_owed := v_debt.balance;
  v_new_version := v_debt.version;  -- 06 review P3-WR-01: unchanged unless the debt is paid off below
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
    -- The final payment: money out. 06 review P1-WR-06 / P5-WR-05: linked to the debt (debt_id), so it is in the debt's
    -- payment list and Decide reads it as a debt payment. debt_balance_follows_line takes it off the balance (at most what
    -- is owed) and remembers how much, so Undo (deleting the line) puts back exactly that, once.
    insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency,
                                     local_date, time_zone, name, category_id, status, debt_id)  -- 06 review
    values (v_payment_id, v_debt.household_id, (p_payment ->> 'account_id')::uuid, v_uid, -v_payment_amount,
            p_payment ->> 'currency', (p_payment ->> 'local_date')::date, p_payment ->> 'time_zone',
            public.grow_line_name(p_payment ->> 'name'), v_category, 'paid', p_debt_id);  -- 06 review P3-WR-07

    select d.balance into v_still_owed from public.debts d where d.id = p_debt_id;  -- 06 review: what the trigger left

    if v_still_owed = 0 then  -- 06 review
      v_paid_off := true;
      v_paid_off_on := (p_payment ->> 'local_date')::date;
      -- Both the payment series and the Expected extra series stop at the payoff date.
      foreach v_sid in array array[v_debt.series_id, v_debt.extra_series_id] loop
        continue when v_sid is null;
        select * into v_series from public.recurring_series
         where id = v_sid and deleted_at is null and household_id = v_debt.household_id;
        continue when not found or (v_series.end_date is not null and v_series.end_date <= v_paid_off_on);
        -- 06 review P1-WR-07: the debt's own payment series is never dropped (debts.series_id keeps pointing at it). On a
        -- sale dated before its first payment it ends on its anchor, and the anchor's Expected line goes by hand.
        if v_sid = v_debt.series_id and v_paid_off_on < v_series.anchor_date then  -- 06 review
          v_change := public.grow_end_series(v_sid, v_series.anchor_date);  -- 06 review
          with d as (  -- 06 review
            update public.transactions set deleted_at = now()  -- 06 review
             where recurring_series_id = v_sid and status = 'pending' and deleted_at is null  -- 06 review
               and occurrence_date > v_paid_off_on  -- 06 review
            returning id, version  -- 06 review
          )  -- 06 review
          select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'version', d.version) order by d.id), '[]'::jsonb)  -- 06 review
            into v_more from d;  -- 06 review
          v_change := jsonb_set(v_change, '{soft_deleted}', (v_change -> 'soft_deleted') || v_more);  -- 06 review
        else  -- 06 review
          v_change := public.grow_end_series(v_sid, v_paid_off_on);  -- 06 review
        end if;  -- 06 review
        v_changes := v_changes || jsonb_build_array(v_change);  -- 06 review
      end loop;

      -- 06 review: the balance is the trigger's; this write is only the payoff date.
      update public.debts set paid_off_on = v_paid_off_on  -- 06 review
       where id = p_debt_id
      returning version into v_new_version;
    end if;
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
  -- 06 review P5-WR-05: no balance op. Deleting the payment line (above) already puts back what it took off; restoring
  -- the balance here as well would add it twice. Only a payoff moved paid_off_on, so only then is there a debt op.
  if v_paid_off then  -- 06 review
    v_ops := v_ops || jsonb_build_array(jsonb_build_object(
      'entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_new_version,
      'patch', jsonb_build_object('paid_off_on', to_jsonb(v_debt.paid_off_on))));  -- 06 review
  end if;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtSaleRecorded', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'paid_off', v_paid_off, 'still_owed', v_still_owed,
                            'undo_step_id', v_step_id, 'version', v_new_version);  -- 06 review P3-WR-01
end;
$$;

revoke execute on function public.record_debt_sale(uuid, integer, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.record_debt_sale(uuid, integer, jsonb, jsonb, jsonb) to authenticated;

-- 9. materialise_series (re-issued from 20261106000200) ------------------------------------------------------------
create or replace function public.materialise_series(p_series_id uuid, p_today date default null)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_today date;
  v_through date;
  v_floor date;
  v_date date;
  v_id uuid;
  v_author uuid;
  v_added boolean := false;
  v_tripped boolean := false;
  v_months integer;
  n integer := 0;
  n_start integer := 0;
begin
  select * into s from public.recurring_series
   where id = p_series_id and deleted_at is null
   for update;
  if not found then
    return;
  end if;
  -- 06 review P1-CR-03: a removed goal's contribution and a removed debt's Expected extra write no more lines. remove_goal
  -- and remove_debt stop these series themselves; this covers a goal or debt removed by an older app build's plain patch,
  -- whose new lines could never be confirmed or paid. Undo of that removal brings the goal back, and the next run fills in.
  if s.goal_id is not null  -- 06 review
     and not exists (select 1 from public.savings_goals g where g.id = s.goal_id and g.deleted_at is null) then  -- 06 review
    return;  -- 06 review
  end if;  -- 06 review
  if exists (select 1 from public.debts d where d.extra_series_id = s.id and d.deleted_at is not null) then  -- 06 review
    return;  -- 06 review
  end if;  -- 06 review

  v_today := coalesce(p_today, (now() at time zone s.time_zone)::date);
  -- 2.2 (D-16, user decision 2026-10-09): materialise through the later of the
  -- default horizon and the end of the household's horizon_month, so a series
  -- created after a month was added still reaches it.
  v_through := greatest(
    public.recurring_horizon(v_today),
    coalesce(
      (select (to_date(h.horizon_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
         from public.households h
        where h.id = s.household_id and h.horizon_month is not null),
      public.recurring_horizon(v_today)
    )
  );
  if s.end_date is not null and s.end_date < v_through then
    v_through := s.end_date;
  end if;
  v_floor := greatest(coalesce(s.materialised_through + 1, s.anchor_date), s.anchor_date);
  -- D-WR-01: a series outlives a non-owner author (created_by is ON DELETE
  -- SET NULL), but stamp_fx_rate needs an author profile, so fall back to
  -- the household owner rather than fail every day from then on.
  v_author := coalesce(s.created_by, (select h.owner_id from public.households h where h.id = s.household_id));

  -- D-IN-06: start one step below the first n that can reach v_floor
  -- (occurrence dates never decrease in n, and every n below this one is
  -- dated before v_floor) instead of at n = 0, so the 5000-step guard bounds
  -- the work done per run rather than the series' whole lifetime. n stays
  -- absolute, so occurrence_count is still counted from the anchor.
  v_months := ((extract(year from v_floor) - extract(year from s.anchor_date)) * 12
               + (extract(month from v_floor) - extract(month from s.anchor_date)))::integer;
  n_start := greatest(0, case s.freq
    when 'weekly' then (v_floor - s.anchor_date) / 7
    when 'fortnightly' then (v_floor - s.anchor_date) / 14
    when 'monthly' then v_months
    when 'quarterly' then v_months / 3
    when 'yearly' then v_months / 12
    else 0
  end - 1);
  n := n_start;

  loop
    exit when s.occurrence_count is not null and n >= s.occurrence_count;
    if n - n_start > 5000 then -- hard guard (T-02-08-05): no series ever loops unbounded
      v_tripped := true;
      exit;
    end if;
    v_date := public.recurring_occurrence_date(s.anchor_date, s.freq, n);
    exit when v_date > v_through;

    if v_date >= v_floor then
      insert into public.transactions (
        id, household_id, account_id, created_by, original_amount, original_currency,
        local_date, time_zone, name, category_id, payment_type, status, recurring_series_id, occurrence_date,
        is_automatic, is_sample, goal_id -- 2.2: D-02, D-09; 06: D-25
      ) values (
        gen_random_uuid(), s.household_id, s.account_id, v_author, s.amount, s.currency,
        v_date, s.time_zone, s.name, s.category_id, s.payment_type, 'pending', s.id, v_date,
        s.is_automatic, s.is_sample, s.goal_id -- 06: D-25
      )
      on conflict (recurring_series_id, occurrence_date) where recurring_series_id is not null and deleted_at is null
      do nothing
      returning id into v_id;

      if v_id is not null then
        v_added := true;
        return next v_id;
      end if;
    end if;

    n := n + 1;
  end loop;

  -- D-CR-01: generation moves whenever this run adds rows, so a stored undo
  -- step for a template edit/end can tell that the occurrence set it was
  -- built against has grown since (apply_undo_step refuses it, D-26).
  -- D-IN-06: if the guard tripped, the high-water mark only moves as far as
  -- the last date actually generated, never silently past skipped dates.
  if v_tripped then
    raise warning 'materialise_series %: step guard tripped before %', s.id, v_through;
    v_through := least(v_through, v_date);
  end if;

  if v_through > coalesce(s.materialised_through, '-infinity'::date) or v_added then
    perform set_config('fincwin.system_restamp', 'on', true);
    update public.recurring_series
       set materialised_through = greatest(v_through, coalesce(materialised_through, v_through)),
           generation = generation + case when v_added then 1 else 0 end
     where id = s.id;
    perform set_config('fincwin.system_restamp', '', true);
  end if;

  return;
end;
$$;

revoke execute on function public.materialise_series(uuid, date) from public, anon, authenticated;
grant execute on function public.materialise_series(uuid, date) to service_role;

-- 10. remove_goal and remove_debt (owner decision 2026-11-10) ------------------------------------------------------------
-- Stops one series for a removal: no line from today on, and every unpaid (pending) line of it goes, overdue ones too
-- (their goal or debt is gone, so they could never be confirmed or paid). Paid and skipped lines stay as history; the end
-- date never falls before the last of them. A series that never reached its first date is soft-deleted (grow_end_series).
-- Returns the Undo ops (series_change_inverse shape: the lines back, then the series back). The callers check ownership;
-- this checks the household again.
create or replace function public.grow_stop_series_for_removal(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_today date;
  v_end date;
  v_change jsonb := null;
  v_more jsonb;
begin
  select * into s from public.recurring_series
   where id = p_series_id and deleted_at is null and household_id in (select public.user_household_ids())
   for update;
  if not found then
    return '[]'::jsonb;
  end if;
  v_today := (now() at time zone s.time_zone)::date;
  v_end := greatest(v_today - 1,
                    coalesce((select max(t.occurrence_date) from public.transactions t
                               where t.recurring_series_id = s.id and t.deleted_at is null and t.status <> 'pending'),
                             v_today - 1));
  if s.end_date is null or s.end_date > v_end then
    v_change := public.grow_end_series(s.id, v_end);
  end if;
  with d as (
    update public.transactions set deleted_at = now()
     where recurring_series_id = s.id and status = 'pending' and deleted_at is null
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'version', d.version) order by d.id), '[]'::jsonb)
    into v_more from d;
  if v_change is not null then
    return public.series_change_inverse(jsonb_set(v_change, '{soft_deleted}', (v_change -> 'soft_deleted') || v_more));
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', e.value ->> 'id',
                                                       'expectedVersion', (e.value ->> 'version')::integer,
                                                       'patch', jsonb_build_object('deleted_at', null)) order by e.ordinality)
                     from jsonb_array_elements(v_more) with ordinality e), '[]'::jsonb);
end;
$$;
revoke execute on function public.grow_stop_series_for_removal(uuid) from public, anon, authenticated;

-- remove_goal(p_goal_id, p_expected_version, p_undo_step) -> {status:'applied', goal_id, goal_version, undo_step_id}
--   | {status:'already-applied', undo_step_id} | {status:'conflict'}
-- Removes one of the caller's goals with its monthly contribution and its unpaid Expected lines, as ONE undo step
-- labelled 'goalRemoved' built here (p_undo_step carries only id, label_key and label_params). Undo puts the goal back
-- first (a restored line keeps its goal tag), then the series and every line, at the versions this save left them.
-- The safety net cannot be removed (guard_savings_goal refuses it too).
create or replace function public.remove_goal(p_goal_id uuid, p_expected_version integer, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_goal public.savings_goals%rowtype;
  v_sid uuid;
  v_ops jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_version integer;
begin
  if v_uid is null then
    raise exception 'remove_goal: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'goalRemoved', 'remove_goal', false);
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  select * into v_goal from public.savings_goals g where g.id = p_goal_id for update;
  if not found or v_goal.created_by is distinct from v_uid or v_goal.household_id not in (select public.user_household_ids()) then
    raise exception 'remove_goal: that goal is not yours' using errcode = '42501';
  end if;
  if v_goal.deleted_at is not null or v_goal.version is distinct from p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;
  if v_goal.is_safety_net then
    raise exception 'remove_goal: the safety net cannot be removed' using errcode = '22023';
  end if;

  for v_sid in
    select s.id from public.recurring_series s
     where s.goal_id = p_goal_id and s.household_id = v_goal.household_id and s.deleted_at is null
     order by s.id
  loop
    v_ops := v_ops || public.grow_stop_series_for_removal(v_sid);
  end loop;

  -- Any other unpaid line still tagged to the goal (not from its series) goes too.
  with d as (
    update public.transactions set deleted_at = now()
     where goal_id = p_goal_id and household_id = v_goal.household_id and status = 'pending' and deleted_at is null
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', d.id, 'expectedVersion', d.version,
                                               'patch', jsonb_build_object('deleted_at', null)) order by d.id), '[]'::jsonb)
    into v_lines from d;

  update public.savings_goals set deleted_at = now() where id = p_goal_id returning version into v_version;

  v_ops := jsonb_build_array(jsonb_build_object('entity', 'savings_goals', 'id', p_goal_id, 'expectedVersion', v_version,
                                                'patch', jsonb_build_object('deleted_at', null)))
           || v_ops || v_lines;
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'goalRemoved', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'goal_id', p_goal_id, 'goal_version', v_version, 'undo_step_id', v_step_id);
end;
$$;
revoke execute on function public.remove_goal(uuid, integer, jsonb) from public, anon;
grant execute on function public.remove_goal(uuid, integer, jsonb) to authenticated;

-- remove_debt(p_debt_id, p_expected_version, p_undo_step) -> {status:'applied', debt_id, version, undo_step_id}
--   | {status:'already-applied', undo_step_id, version} | {status:'conflict'}
-- Removes a debt of the caller's household with its payment series, its Expected extra series and their unpaid Expected
-- lines (and an Expected one-off still linked to it), as ONE undo step labelled 'debtRemoved' built here. Paid payments
-- stay in Activity. Undo puts the debt back first, then the series and every line.
create or replace function public.remove_debt(p_debt_id uuid, p_expected_version integer, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_debt public.debts%rowtype;
  v_sid uuid;
  v_ops jsonb := '[]'::jsonb;
  v_lines jsonb;
  v_version integer;
begin
  if v_uid is null then
    raise exception 'remove_debt: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'debtRemoved', 'remove_debt', false);

  select * into v_debt from public.debts where id = p_debt_id for update;
  if not found or v_debt.household_id not in (select public.user_household_ids()) then
    raise exception 'remove_debt: the debt is not in your household' using errcode = '42501';
  end if;
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id, 'version', v_debt.version);
  end if;
  if v_debt.deleted_at is not null or v_debt.version is distinct from p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  for v_sid in
    select distinct s.id from public.recurring_series s
     where s.id in (v_debt.series_id, v_debt.extra_series_id)
       and s.household_id = v_debt.household_id and s.deleted_at is null
     order by s.id
  loop
    v_ops := v_ops || public.grow_stop_series_for_removal(v_sid);
  end loop;

  with d as (
    update public.transactions set deleted_at = now()
     where debt_id = p_debt_id and household_id = v_debt.household_id and status = 'pending' and deleted_at is null
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', d.id, 'expectedVersion', d.version,
                                               'patch', jsonb_build_object('deleted_at', null)) order by d.id), '[]'::jsonb)
    into v_lines from d;

  update public.debts set deleted_at = now() where id = p_debt_id returning version into v_version;

  v_ops := jsonb_build_array(jsonb_build_object('entity', 'debts', 'id', p_debt_id, 'expectedVersion', v_version,
                                                'patch', jsonb_build_object('deleted_at', null)))
           || v_ops || v_lines;
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, 'debtRemoved', coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops);

  return jsonb_build_object('status', 'applied', 'debt_id', p_debt_id, 'version', v_version, 'undo_step_id', v_step_id);
end;
$$;
revoke execute on function public.remove_debt(uuid, integer, jsonb) from public, anon;
grant execute on function public.remove_debt(uuid, integer, jsonb) to authenticated;

-- 11. save_goal_plan (re-issued from 20261106000200) ---------------------------------------------------------------
create or replace function public.save_goal_plan(p_goal jsonb, p_expected_version integer, p_series jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_insert boolean := p_expected_version is null;
  v_flag boolean := false;
  v_label text;
  v_step_id uuid;
  v_clean jsonb;
  v_in public.savings_goals%rowtype;
  v_goal public.savings_goals%rowtype;
  v_id uuid;
  v_s public.recurring_series%rowtype;
  v_series_id uuid;
  v_series_version integer;
  v_goal_version integer;
  v_sid uuid;
  v_acc uuid;
  v_acc_currency text;
  v_amount bigint;
  v_anchor date;
  v_tz text;
  v_name text;
  v_cat uuid;
  v_today date;
  v_next date;
  v_end date;
  v_patch jsonb;
  v_prev public.savings_goals%rowtype;
  v_change jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_restore jsonb;
  v_ver integer;
begin
  if v_uid is null then
    raise exception 'save_goal_plan: sign in first' using errcode = '42501';
  end if;
  if jsonb_typeof(p_goal) is distinct from 'object' then
    raise exception 'save_goal_plan: p_goal must be an object' using errcode = '22023';
  end if;
  v_clean := coalesce((
    select jsonb_object_agg(e.key, e.value)
      from jsonb_each(p_goal) as e(key, value)
     where e.key = any (array['id', 'household_id', 'name', 'currency', 'target', 'ready_by', 'monthly_amount', 'opening_saved',
                              'account_id', 'locked', 'icon', 'color_key', 'is_safety_net', 'up_front_only', 'check_id', 'protect'])
  ), '{}'::jsonb);
  if v_clean ? 'is_safety_net' then
    if jsonb_typeof(v_clean -> 'is_safety_net') is distinct from 'boolean' then
      raise exception 'save_goal_plan: is_safety_net must be a boolean' using errcode = '22023';
    end if;
    v_flag := (v_clean ->> 'is_safety_net')::boolean;
  end if;
  v_label := case when not v_insert then 'goalPlanChanged' when v_flag then 'safetyNetSizeSaved' else 'goalMade' end;
  v_step_id := public.grow_check_undo_step(p_undo_step, v_label, 'save_goal_plan', false);

  -- Replay of an action that already landed: nothing is written.
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  begin
    select * into strict v_in from jsonb_populate_record(null::public.savings_goals, v_clean);
  exception when others then
    raise exception 'save_goal_plan: p_goal is malformed' using errcode = '22023';
  end;
  if v_in.id is null then
    raise exception 'save_goal_plan: the goal needs an id' using errcode = '22023';
  end if;

  if v_insert then
    if v_in.household_id is null or v_in.household_id not in (select public.user_household_ids()) then
      raise exception 'save_goal_plan: not a member of that household' using errcode = '42501';
    end if;
    if char_length(btrim(coalesce(v_in.name, ''))) not between 1 and 80
       or coalesce(v_in.currency, '') !~ '^[A-Z0-9]{2,4}$'
       or (v_in.target is not null and v_in.target not between 1 and 10000000000000)
       or (v_in.opening_saved is not null and v_in.opening_saved not between 0 and 10000000000000)
       or (v_in.monthly_amount is not null and v_in.monthly_amount not between 0 and 10000000000000) then
      raise exception 'save_goal_plan: the goal is malformed' using errcode = '22023';
    end if;
    -- 06 review P1-WR-08: a safety net the user makes here is confirmed from the start (20261106000400 point 3), so
    -- "We moved your safety net here" never shows for it.
    insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, monthly_amount,
                                      opening_saved, account_id, locked, icon, color_key, is_safety_net, up_front_only,
                                      check_id, protect, net_confirmed_at)  -- 06 review
    values (v_in.id, v_in.household_id, v_uid, 'pot', btrim(v_in.name), v_in.currency, v_in.target, v_in.ready_by,
            v_in.monthly_amount, coalesce(v_in.opening_saved, 0), v_in.account_id,
            coalesce(v_in.locked, true) or v_flag, v_in.icon, v_in.color_key, v_flag,
            coalesce(v_in.up_front_only, false), v_in.check_id, coalesce(v_in.protect, true),
            case when v_flag then now() end);  -- 06 review
    v_id := v_in.id;
  else
    v_id := v_in.id;
    select * into v_goal from public.savings_goals g where g.id = v_id for update;
    if not found or v_goal.deleted_at is not null then
      return jsonb_build_object('status', 'conflict');
    end if;
    if v_goal.created_by is distinct from v_uid or v_goal.household_id not in (select public.user_household_ids()) then
      raise exception 'save_goal_plan: that goal is not yours' using errcode = '42501';
    end if;
    if v_goal.version <> p_expected_version then
      return jsonb_build_object('status', 'conflict');
    end if;
    if (v_clean ? 'name' and char_length(btrim(coalesce(v_in.name, ''))) not between 1 and 80)
       or (v_in.target is not null and v_in.target not between 1 and 10000000000000)
       or (v_in.opening_saved is not null and v_in.opening_saved not between 0 and 10000000000000)
       or (v_in.monthly_amount is not null and v_in.monthly_amount not between 0 and 10000000000000) then
      raise exception 'save_goal_plan: the goal is malformed' using errcode = '22023';
    end if;
    -- 06 review P4-WR-02: a Wait goal's name and plan belong to its Decide check. guard_savings_goal would put the old values
    -- back without a word while this save reported success, so a change to any of them is refused here instead.
    if v_goal.kind <> 'pot' and (  -- 06 review
         (v_clean ? 'name' and btrim(v_in.name) is distinct from v_goal.name)  -- 06 review
         or (v_clean ? 'target' and v_in.target is distinct from v_goal.target)  -- 06 review
         or (v_clean ? 'ready_by' and v_in.ready_by is distinct from v_goal.ready_by)  -- 06 review
         or (v_clean ? 'monthly_amount' and v_in.monthly_amount is distinct from v_goal.monthly_amount)  -- 06 review
         or (v_clean ? 'opening_saved' and coalesce(v_in.opening_saved, v_goal.opening_saved) is distinct from v_goal.opening_saved)) then  -- 06 review
      raise exception 'save_goal_plan: a Wait goal''s plan is set by its Decide check' using errcode = '22023';  -- 06 review
    end if;  -- 06 review
    v_prev := v_goal;
    update public.savings_goals g set
      name = case when v_clean ? 'name' then btrim(v_in.name) else g.name end,
      target = case when v_clean ? 'target' then v_in.target else g.target end,
      ready_by = case when v_clean ? 'ready_by' then v_in.ready_by else g.ready_by end,
      monthly_amount = case when v_clean ? 'monthly_amount' then v_in.monthly_amount else g.monthly_amount end,
      opening_saved = case when v_clean ? 'opening_saved' then coalesce(v_in.opening_saved, g.opening_saved) else g.opening_saved end,
      account_id = case when v_clean ? 'account_id' then v_in.account_id else g.account_id end,
      locked = case when v_clean ? 'locked' then coalesce(v_in.locked, g.locked) else g.locked end,
      protect = case when v_clean ? 'protect' then coalesce(v_in.protect, g.protect) else g.protect end,
      up_front_only = case when v_clean ? 'up_front_only' then coalesce(v_in.up_front_only, g.up_front_only) else g.up_front_only end,
      icon = case when v_clean ? 'icon' then v_in.icon else g.icon end,
      color_key = case when v_clean ? 'color_key' then v_in.color_key else g.color_key end
    where g.id = v_id;
  end if;

  select * into v_goal from public.savings_goals g where g.id = v_id;

  -- The goal's monthly contribution series (D-25).
  select * into v_s from public.recurring_series s
   where s.goal_id = v_id and s.deleted_at is null and s.end_date is null for update;
  v_series_id := v_s.id;

  if p_series is null or jsonb_typeof(p_series) = 'null' then
    if v_s.id is not null then
      v_today := (now() at time zone v_s.time_zone)::date;
      select min(t.occurrence_date) into v_next
        from public.transactions t
       where t.recurring_series_id = v_s.id and t.status = 'pending' and t.deleted_at is null and t.occurrence_date >= v_today;
      v_end := coalesce(v_next - 1, v_today);
      if v_end < v_s.anchor_date then
        -- nothing of it has come due yet: the series goes, with its Expected lines. Undo brings both back.
        with d as (
          update public.transactions set deleted_at = now()
           where recurring_series_id = v_s.id and status = 'pending' and deleted_at is null
          returning id, version
        )
        select coalesce(jsonb_agg(jsonb_build_object('entity', 'transactions', 'id', d.id, 'expectedVersion', d.version,
                                                     'patch', jsonb_build_object('deleted_at', null)) order by d.id), '[]'::jsonb)
          into v_restore from d;
        update public.recurring_series set deleted_at = now() where id = v_s.id returning version into v_ver;
        v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'recurring_series', 'id', v_s.id, 'expectedVersion', v_ver,
                                                               'patch', jsonb_build_object('deleted_at', null)))
                       || v_restore;
      else
        -- One statement sets end_date and end_reason (one version), and the Expected lines after the end go.
        v_change := public.edit_recurring_series_from(v_s.id, v_s.version,
          jsonb_build_object('end_date', v_end, 'end_reason', 'stopped'), v_end + 1, null);
        if v_change ->> 'status' is distinct from 'applied' then
          raise exception 'save_goal_plan: the contribution could not be stopped (%)', v_change ->> 'status' using errcode = '22023';
        end if;
        v_ops := v_ops || public.series_change_inverse(v_change);
      end if;
    end if;
  elsif jsonb_typeof(p_series) = 'object' then
    begin
      v_sid := (p_series ->> 'id')::uuid;
      v_acc := (p_series ->> 'account_id')::uuid;
      v_anchor := (p_series ->> 'anchor_date')::date;
      v_cat := nullif(p_series ->> 'category_id', '')::uuid;
    exception when others then
      raise exception 'save_goal_plan: the contribution is malformed' using errcode = '22023';
    end;
    v_tz := p_series ->> 'time_zone';
    v_name := coalesce(nullif(btrim(p_series ->> 'name'), ''), v_goal.name);
    if v_sid is null or v_acc is null or v_anchor is null or v_tz is null
       or jsonb_typeof(p_series -> 'amount') is distinct from 'number'
       or coalesce(p_series ->> 'amount', '') !~ '^-?[0-9]{1,14}$'
       or abs((p_series ->> 'amount')::bigint) not between 1 and 10000000000000
       or char_length(v_name) not between 1 and 200 then
      raise exception 'save_goal_plan: the contribution is malformed' using errcode = '22023';
    end if;
    v_amount := -abs((p_series ->> 'amount')::bigint);
    select a.currency into v_acc_currency from public.accounts a where a.id = v_acc and a.household_id = v_goal.household_id;
    if not found then
      raise exception 'save_goal_plan: the paid-from account is not in this household' using errcode = '42501';
    end if;
    if v_s.id is null then
      v_today := (now() at time zone v_tz)::date;
      insert into public.recurring_series (id, household_id, created_by, updated_by, account_id, name, amount, currency,
                                           category_id, freq, anchor_date, time_zone, goal_id, materialised_through)
      values (v_sid, v_goal.household_id, v_uid, v_uid, v_acc, v_name, v_amount, v_acc_currency,
              v_cat, 'monthly', v_anchor, v_tz, v_id, greatest(v_anchor, date_trunc('month', v_today)::date) - 1);
      perform public.materialise_series(v_sid);
      v_series_id := v_sid;
      -- Undo soft-deletes the new series; undo_replay takes its untouched Expected lines with it.
      select s.version into v_ver from public.recurring_series s where s.id = v_sid;
      v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'recurring_series', 'id', v_sid, 'expectedVersion', v_ver,
                                                             'patch', jsonb_build_object('deleted_at', '$now')));
    else
      v_today := (now() at time zone v_s.time_zone)::date;
      v_patch := '{}'::jsonb;
      if v_name is distinct from v_s.name then v_patch := v_patch || jsonb_build_object('name', v_name); end if;
      if v_amount is distinct from v_s.amount then v_patch := v_patch || jsonb_build_object('amount', v_amount); end if;
      if v_acc is distinct from v_s.account_id then
        v_patch := v_patch || jsonb_build_object('account_id', v_acc, 'currency', v_acc_currency);
      end if;
      if v_anchor is distinct from v_s.anchor_date then v_patch := v_patch || jsonb_build_object('anchor_date', v_anchor); end if;
      if v_patch <> '{}'::jsonb then
        v_change := public.edit_recurring_series_from(v_s.id, v_s.version, v_patch, v_today, null);
        if v_change ->> 'status' is distinct from 'applied' then
          raise exception 'save_goal_plan: the contribution could not be changed (%)', v_change ->> 'status' using errcode = '22023';
        end if;
        v_ops := v_ops || public.series_change_inverse(v_change);
      end if;
      v_series_id := v_s.id;
    end if;
  else
    raise exception 'save_goal_plan: p_series must be an object or null' using errcode = '22023';
  end if;

  if v_series_id is not null then
    select s.version into v_series_version from public.recurring_series s where s.id = v_series_id;
  end if;

  select g.version into v_goal_version from public.savings_goals g where g.id = v_id;

  -- The goal op goes last, after the series ops.
  if v_insert and v_flag then
    -- A flagged goal cannot be soft-deleted, so the new safety net is un-flagged first. Both ops carry the same version:
    -- apply_patches checks every op before it writes any.
    v_ops := v_ops || jsonb_build_array(
      jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
                         'patch', jsonb_build_object('is_safety_net', false)),
      jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
                         'patch', jsonb_build_object('deleted_at', '$now')));
  elsif v_insert then
    v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
                                                           'patch', jsonb_build_object('deleted_at', '$now')));
  else
    v_ops := v_ops || jsonb_build_array(jsonb_build_object('entity', 'savings_goals', 'id', v_id, 'expectedVersion', v_goal_version,
      'patch', jsonb_build_object('name', v_prev.name, 'target', v_prev.target, 'ready_by', v_prev.ready_by,
                                  'monthly_amount', v_prev.monthly_amount, 'opening_saved', v_prev.opening_saved,
                                  'account_id', v_prev.account_id, 'locked', v_prev.locked, 'protect', v_prev.protect,
                                  'up_front_only', v_prev.up_front_only, 'icon', v_prev.icon, 'color_key', v_prev.color_key)));
  end if;

  -- allow_system_keys only for the new safety net (its un-flag op patches is_safety_net, a system key).
  insert into public.undo_log (id, owner_id, label_key, label_params, ops, allow_system_keys)
  values (v_step_id, v_uid, v_label, coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops, v_insert and v_flag);

  return jsonb_build_object('status', 'applied', 'goal_id', v_id, 'goal_version', v_goal_version,
                            'series_id', v_series_id, 'series_version', v_series_version, 'undo_step_id', v_step_id);
end;
$$;
revoke execute on function public.save_goal_plan(jsonb, integer, jsonb, jsonb) from public, anon;
grant execute on function public.save_goal_plan(jsonb, integer, jsonb, jsonb) to authenticated;

-- 12. guard_goal_line_paid (P5-WR-01) -----------------------------------------------------------------------------------
-- An Expected line tagged to a live goal becomes paid only through confirm_goal_contribution, which pairs it with the
-- goal-side leg when the goal has its own account. A plain status patch (apply_patches or a direct update, e.g. an old
-- "Mark paid" path or the statement-import matcher) would leave the goal counting money that never reached its account,
-- so it is refused (22023: apply_patches reports it as a rejected write, undo_replay as a refusal). An Undo replay may put
-- a paid state back. A line of a removed goal is a plain line again: it can be marked paid as usual.
create or replace function public.guard_goal_line_paid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status = 'paid' and new.goal_id is not null and new.transfer_id is null
     and coalesce(current_setting('fincwin.goal_confirm', true), '') <> 'on'
     and coalesce(current_setting('fincwin.undo_any', true), '') <> 'on'
     and exists (select 1 from public.savings_goals g where g.id = new.goal_id and g.deleted_at is null) then
    raise exception 'transactions: an Expected goal line is confirmed through confirm_goal_contribution' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_goal_line_paid() from public, anon, authenticated;

drop trigger if exists guard_goal_line_paid on public.transactions;
create trigger guard_goal_line_paid before update of status on public.transactions
  for each row
  when (old.status = 'pending' and new.status = 'paid' and new.goal_id is not null)
  execute function public.guard_goal_line_paid();

-- confirm_goal_contribution (re-issued from 20261106000200) --------------------------------------------------------------
create or replace function public.confirm_goal_contribution(p_transaction_id uuid, p_expected_version integer, p_in_leg jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_step_id uuid;
  v_row public.transactions%rowtype;
  v_goal public.savings_goals%rowtype;
  v_leg_id uuid;
  v_transfer_id uuid;
  v_row_version integer;
  v_leg_version integer;
begin
  if v_uid is null then
    raise exception 'confirm_goal_contribution: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'goalContributionConfirmed', 'confirm_goal_contribution', false);
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = v_uid) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  select * into v_row from public.transactions t where t.id = p_transaction_id for update;
  if not found or v_row.deleted_at is not null then
    raise exception 'confirm_goal_contribution: that line does not exist' using errcode = '22023';
  end if;
  if v_row.household_id not in (select public.user_household_ids()) then
    raise exception 'confirm_goal_contribution: not a member of that household' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' or v_row.goal_id is null then
    raise exception 'confirm_goal_contribution: only an Expected goal line can be confirmed' using errcode = '22023';
  end if;
  select * into v_goal from public.savings_goals g where g.id = v_row.goal_id for update;
  if not found or v_goal.deleted_at is not null then
    raise exception 'confirm_goal_contribution: the goal is gone' using errcode = '22023';
  end if;
  if v_goal.created_by is distinct from v_uid or v_goal.household_id <> v_row.household_id then
    raise exception 'confirm_goal_contribution: that goal is not yours' using errcode = '42501';
  end if;
  if v_row.version <> p_expected_version then
    return jsonb_build_object('status', 'conflict');
  end if;

  -- 06 review P5-WR-01: this is the one writer guard_goal_line_paid lets turn an Expected goal line paid.
  perform set_config('fincwin.goal_confirm', 'on', true);  -- 06 review
  if v_goal.account_id is null or v_goal.account_id = v_row.account_id or v_goal.currency <> v_row.original_currency then
    update public.transactions set status = 'paid' where id = v_row.id returning version into v_row_version;
    perform set_config('fincwin.goal_confirm', '', true);  -- 06 review
    return public.grow_store_step(v_step_id, 'goalContributionConfirmed', p_undo_step,
      jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', v_row.id, 'expectedVersion', v_row_version,
                                           'patch', jsonb_build_object('status', 'pending'))),
      jsonb_build_object('status', 'applied', 'transaction_id', v_row.id, 'transaction_version', v_row_version,
                         'in_leg_id', null, 'in_leg_version', null, 'transfer_id', null, 'undo_step_id', v_step_id));
  end if;

  perform set_config('fincwin.goal_confirm', '', true);  -- 06 review: nothing above wrote; the paired branch sets it again
  if jsonb_typeof(p_in_leg) is distinct from 'object' then
    raise exception 'confirm_goal_contribution: p_in_leg must be an object' using errcode = '22023';
  end if;
  begin
    v_leg_id := (p_in_leg ->> 'id')::uuid;
    v_transfer_id := (p_in_leg ->> 'transfer_id')::uuid;
  exception when others then
    raise exception 'confirm_goal_contribution: p_in_leg is malformed' using errcode = '22023';
  end;
  if v_leg_id is null or v_transfer_id is null or v_row.original_amount >= 0 then
    raise exception 'confirm_goal_contribution: p_in_leg is malformed' using errcode = '22023';
  end if;

  -- The pair check is deferred to commit, so the order of the two writes is free; the in-leg goes first.
  insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                   time_zone, name, category_id, payment_type, note, status, transfer_id, goal_id)
  values (v_leg_id, v_row.household_id, v_uid, v_goal.account_id, abs(v_row.original_amount), v_row.original_currency,
          v_row.local_date, v_row.time_zone, v_row.name, v_row.category_id, v_row.payment_type, v_row.note, 'paid',
          v_transfer_id, v_goal.id)
  returning version into v_leg_version;
  perform set_config('fincwin.goal_confirm', 'on', true);  -- 06 review
  update public.transactions set status = 'paid', transfer_id = v_transfer_id, goal_id = null
   where id = v_row.id returning version into v_row_version;
  perform set_config('fincwin.goal_confirm', '', true);  -- 06 review

  return public.grow_store_step(v_step_id, 'goalContributionConfirmed', p_undo_step,
    jsonb_build_array(
      jsonb_build_object('entity', 'transactions', 'id', v_leg_id, 'expectedVersion', v_leg_version,
                         'patch', jsonb_build_object('deleted_at', '$now')),
      jsonb_build_object('entity', 'transactions', 'id', v_row.id, 'expectedVersion', v_row_version,
                         'patch', jsonb_build_object('status', 'pending', 'transfer_id', null, 'goal_id', v_row.goal_id))),
    jsonb_build_object('status', 'applied', 'transaction_id', v_row.id, 'transaction_version', v_row_version,
                       'in_leg_id', v_leg_id, 'in_leg_version', v_leg_version, 'transfer_id', v_transfer_id, 'undo_step_id', v_step_id));
end;
$$;
revoke execute on function public.confirm_goal_contribution(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_goal_contribution(uuid, integer, jsonb, jsonb) to authenticated;

-- undo_replay (re-issued from 20261030000100) ----------------------------------------------------------------------------
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
    -- 06 review P5-WR-01: an Undo puts back a state that existed, so guard_goal_line_paid lets it turn a goal line paid.
    perform set_config('fincwin.undo_any', 'on', true);  -- 06 review
    v_result := public.apply_patches(public.undo_adjusted_ops(p_step)); -- 05.3 D-15
    perform set_config('fincwin.undo_any', '', true);  -- 06 review
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
      perform set_config('fincwin.undo_any', '', true);  -- 06 review
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

revoke execute on function public.undo_replay(public.undo_log) from public, anon, authenticated;
