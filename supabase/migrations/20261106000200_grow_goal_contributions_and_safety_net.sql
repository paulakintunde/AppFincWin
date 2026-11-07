-- 06 Grow (GRW-03, D-07, D-14, D-25, D-29). materialise_series re-created from 20261010000300; changed lines marked 06.
-- Additive. Nothing dropped or renamed (old builds still read the interim decide_settings columns).

-- Part A: goal contributions (GRW-03, D-25) ---------------------------------------------------------------------------

-- 1. A repeating series can belong to a goal. RPC-only: recurring_series has no client insert/update grant at all.
alter table public.recurring_series add column if not exists goal_id uuid references public.savings_goals(id) on delete set null;  -- 06
create index if not exists recurring_series_goal_idx on public.recurring_series (goal_id)
  where goal_id is not null and deleted_at is null;  -- 06
-- One live (not ended, not deleted) contribution per goal.
create unique index if not exists recurring_series_one_goal_contribution on public.recurring_series (goal_id)
  where goal_id is not null and deleted_at is null and end_date is null;  -- 06

-- The goal must be live, in the series' household and the author's. The author is the stamped created_by (auth.uid() for
-- every client RPC; the materialiser and pgTAP fixtures run with no JWT), the same rule as guard_holding_lot (06-04).
create or replace function public.guard_series_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.goal_id is not null and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id) then
    if not exists (
      select 1 from public.savings_goals g
       where g.id = new.goal_id
         and g.household_id = new.household_id
         and g.deleted_at is null
         and (g.created_by = new.created_by or g.created_by = (select auth.uid()))) then
      raise exception 'recurring_series: goal is not one of your live goals in this household' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_series_goal() from public, anon, authenticated;
drop trigger if exists guard_series_goal on public.recurring_series;
create trigger guard_series_goal before insert or update of goal_id on public.recurring_series
  for each row execute function public.guard_series_goal();

-- 2. materialise_series (copied in full from 20261010000300; the only changes are the two lines marked 06) -------------
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

-- 3. Shared undo-step check: object, uuid id, the one registered label key, well-formed params, optional ops ----------
create or replace function public.grow_check_undo_step(p_undo_step jsonb, p_label_key text, p_fn text, p_need_ops boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_params jsonb;
begin
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception '%: p_undo_step must be an object', p_fn using errcode = '22023';
  end if;
  begin
    v_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception '%: p_undo_step.id must be a uuid', p_fn using errcode = '22023';
  end;
  if v_id is null then
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
  if p_need_ops and (jsonb_typeof(p_undo_step -> 'ops') is distinct from 'array'
                     or jsonb_array_length(p_undo_step -> 'ops') not between 1 and 200) then
    raise exception '%: p_undo_step.ops must be an array of 1 to 200', p_fn using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke execute on function public.grow_check_undo_step(jsonb, text, text, boolean) from public, anon, authenticated;

-- Stores the client-built step (already checked by grow_check_undo_step) and hands the result back.
create or replace function public.grow_store_step(p_step_id uuid, p_label_key text, p_undo_step jsonb, p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (p_step_id, (select auth.uid()), p_label_key, coalesce(p_undo_step -> 'label_params', '{}'::jsonb), p_undo_step -> 'ops');
  return p_result;
end;
$$;
revoke execute on function public.grow_store_step(uuid, text, jsonb, jsonb) from public, anon, authenticated;

-- 4. save_goal_plan: make a goal, change its plan, set or stop its monthly contribution, in one save (D-25) ------------
-- p_goal keys read: id, household_id, name, currency, target, ready_by, monthly_amount, opening_saved, account_id, locked,
-- icon, color_key, is_safety_net, up_front_only, check_id, protect. p_expected_version null inserts a pot; otherwise the
-- patchable keys (not currency, check_id or is_safety_net: only set_safety_net flags an existing goal, D-29) are updated.
-- p_series null stops the goal's live contribution; { id, account_id, amount, anchor_date, time_zone, name, category_id }
-- starts or updates it. The amount is a positive monthly figure; the series stores it as money out of the paid-from account.
-- The client builds the undo ops; the versions it needs are predictable: a new row is version 1, an update adds 1 per
-- statement, and the response returns goal_version and series_version as the action left them.
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
  v_step_id := public.grow_check_undo_step(p_undo_step, v_label, 'save_goal_plan', true);

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
    insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, monthly_amount,
                                      opening_saved, account_id, locked, icon, color_key, is_safety_net, up_front_only,
                                      check_id, protect)
    values (v_in.id, v_in.household_id, v_uid, 'pot', btrim(v_in.name), v_in.currency, v_in.target, v_in.ready_by,
            v_in.monthly_amount, coalesce(v_in.opening_saved, 0), v_in.account_id,
            coalesce(v_in.locked, true) or v_flag, v_in.icon, v_in.color_key, v_flag,
            coalesce(v_in.up_front_only, false), v_in.check_id, coalesce(v_in.protect, true));
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
        -- nothing of it has come due yet: the series goes, with its Expected lines
        update public.transactions set deleted_at = now()
         where recurring_series_id = v_s.id and status = 'pending' and deleted_at is null;
        update public.recurring_series set deleted_at = now() where id = v_s.id;
      else
        perform public.end_recurring_series(v_s.id, v_s.version, v_end, null);
        update public.recurring_series set end_reason = 'stopped' where id = v_s.id;
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
        perform public.edit_recurring_series_from(v_s.id, v_s.version, v_patch, v_today, null);
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
  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (v_step_id, v_uid, v_label, coalesce(p_undo_step -> 'label_params', '{}'::jsonb), p_undo_step -> 'ops');

  return jsonb_build_object('status', 'applied', 'goal_id', v_id, 'goal_version', v_goal_version,
                            'series_id', v_series_id, 'series_version', v_series_version, 'undo_step_id', v_step_id);
end;
$$;
revoke execute on function public.save_goal_plan(jsonb, integer, jsonb, jsonb) from public, anon;
grant execute on function public.save_goal_plan(jsonb, integer, jsonb, jsonb) to authenticated;

-- 5. confirm_goal_contribution: an Expected line tagged with a goal becomes real, nothing moves by itself (D-25) --------
-- A goal kept in Savings (its own account, a different one from the line's, same currency) gets the second leg of a
-- transfer pair in the same save. Otherwise the single line is simply marked paid and keeps its goal tag. The line's
-- version after the save is p_expected_version + 1; the in-leg is version 1. Both are returned for the client's undo ops.
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
begin
  if v_uid is null then
    raise exception 'confirm_goal_contribution: sign in first' using errcode = '42501';
  end if;
  v_step_id := public.grow_check_undo_step(p_undo_step, 'goalContributionConfirmed', 'confirm_goal_contribution', true);
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

  if v_goal.account_id is null or v_goal.account_id = v_row.account_id or v_goal.currency <> v_row.original_currency then
    update public.transactions set status = 'paid' where id = v_row.id returning version into v_row_version;
    return public.grow_store_step(v_step_id, 'goalContributionConfirmed', p_undo_step,
      jsonb_build_object('status', 'applied', 'transaction_id', v_row.id, 'transaction_version', v_row_version,
                         'in_leg_id', null, 'in_leg_version', null, 'transfer_id', null, 'undo_step_id', v_step_id));
  end if;

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
          v_transfer_id, v_goal.id);
  update public.transactions set status = 'paid', transfer_id = v_transfer_id, goal_id = null
   where id = v_row.id returning version into v_row_version;

  return public.grow_store_step(v_step_id, 'goalContributionConfirmed', p_undo_step,
    jsonb_build_object('status', 'applied', 'transaction_id', v_row.id, 'transaction_version', v_row_version,
                       'in_leg_id', v_leg_id, 'in_leg_version', 1, 'transfer_id', v_transfer_id, 'undo_step_id', v_step_id));
end;
$$;
revoke execute on function public.confirm_goal_contribution(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.confirm_goal_contribution(uuid, integer, jsonb, jsonb) to authenticated;

-- Part B: safety net (D-07, D-29) -------------------------------------------------------------------------------------

-- Pre-check for the push task (plan 11): how many testers ever unlocked the net. The safety net is always Locked from
-- here on (D-23), so these rows read as Locked after the copy below. The parity test (plan 05) documents this cell.
do $$ begin raise notice 'decide_settings rows with safety_net_locked = false: %', (select count(*) from public.decide_settings where safety_net_locked = false); end $$;

-- 6. set_safety_net (D-29): "Use as my safety net" on an existing goal, with an atomic swap of the current net ----------
-- Exactly one live flagged goal per owner at every point: the old net is un-flagged FIRST (it stays Locked), then the
-- target is flagged, Locked and protected, inside one transaction under row locks. Saved amount, target, monthly amount,
-- account and contribution series of both goals are untouched. The undo step is built here, never from client ops.
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
  update public.savings_goals set is_safety_net = true, locked = true, protect = true
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

-- 7. D-07 data step: each tester's Decide safety-net settings become their one flagged, locked safety-net goal ----------
-- Idempotent (skips anyone who already has a live flagged goal). The account is linked ONLY where the old reserve amount is
-- not null: a linked account with a null reserve would make Decide read the whole live balance as the fund (06-05 parity
-- finding, mirrored by migrateSafetyNetRow in the parity test). A size of 0 reads as no size (a goal target is at least 1).
-- No JWT runs here, so guard_savings_goal keeps created_by as given. Additive only.
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, opening_saved, account_id,
                                  protect, locked, is_safety_net, net_confirmed_at)
select gen_random_uuid(), hm.household_id, ds.user_id, 'pot', 'Safety net',
       coalesce(ds.currency, p.home_currency, 'USD'), nullif(ds.safety_net_size, 0), coalesce(ds.reserve, 0),
       case when ds.reserve is null then null
            else (select a.id from public.accounts a where a.id = ds.reserve_account_id and a.household_id = hm.household_id) end,
       ds.safety_net_protect, true, true, null
  from public.decide_settings ds
  join lateral (select m.household_id from public.household_members m where m.user_id = ds.user_id
                 order by m.created_at, m.household_id limit 1) hm on true
  left join public.profiles p on p.id = ds.user_id
 where not exists (select 1 from public.savings_goals g
                    where g.household_id = hm.household_id and g.created_by = ds.user_id
                      and g.is_safety_net and g.deleted_at is null);

-- 8. Interim columns stay (old builds read them); marked for scheduled removal ----------------------------------------
comment on column public.decide_settings.safety_net_size is 'migrated to savings_goals.is_safety_net (06 D-07); drop after a minimum supported app version bump';
comment on column public.decide_settings.safety_net_protect is 'migrated to savings_goals.is_safety_net (06 D-07); drop after a minimum supported app version bump';
comment on column public.decide_settings.safety_net_locked is 'migrated to savings_goals.is_safety_net (06 D-07); drop after a minimum supported app version bump';
comment on column public.decide_settings.reserve is 'migrated to savings_goals.is_safety_net (06 D-07); drop after a minimum supported app version bump';
comment on column public.decide_settings.reserve_account_id is 'migrated to savings_goals.is_safety_net (06 D-07); drop after a minimum supported app version bump';
