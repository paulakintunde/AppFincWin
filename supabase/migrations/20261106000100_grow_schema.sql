-- 06 Grow (GRW-01..07, 10, 11; D-05, D-09, D-10, D-12, D-22, D-23). Additive. guard_savings_goal re-created from 20261028000700; apply_patches re-created from 20261103000200; only lines marked 06 changed.

-- 1. savings_goals: open-ended, locked, safety net ---------------------------------------------------------------
alter table public.savings_goals add column if not exists is_safety_net boolean not null default false;
-- D-22: every goal that exists before this migration reads as Locked; the client always sends locked on insert (D-23).
alter table public.savings_goals add column if not exists locked boolean not null default true;
alter table public.savings_goals add column if not exists protect boolean not null default true;
alter table public.savings_goals add column if not exists up_front_only boolean not null default false;
alter table public.savings_goals add column if not exists icon text
  check (icon is null or icon in ('calendar', 'laptop', 'phone', 'camera', 'savings', 'housing', 'transport', 'headphones'));
alter table public.savings_goals add column if not exists net_confirmed_at timestamptz;

alter table public.savings_goals drop constraint if exists savings_goals_pot_shape;
alter table public.savings_goals add constraint savings_goals_pot_shape
  check (kind <> 'pot' or bucket is null or ready_by is null);  -- 06: open-ended goals allowed; a bucket still has no date
alter table public.savings_goals drop constraint if exists savings_goals_safety_net_shape;
alter table public.savings_goals add constraint savings_goals_safety_net_shape
  check (not is_safety_net or (kind = 'pot' and bucket is null and locked));  -- 06

create unique index if not exists savings_goals_one_safety_net
  on public.savings_goals (household_id, created_by) where is_safety_net and deleted_at is null;  -- 06

grant insert (id, household_id, kind, name, currency, target, ready_by, opening_saved, bucket, account_id, monthly_amount,
  color_key, is_safety_net, locked, protect, up_front_only, icon, check_id) on public.savings_goals to authenticated;  -- 06
grant update (name, target, ready_by, opening_saved, done_at, deleted_at, account_id, monthly_amount, color_key,
  locked, protect, up_front_only, icon, net_confirmed_at) on public.savings_goals to authenticated;  -- 06

-- 2. guard_savings_goal() ---------------------------------------------------------------------------------------
create or replace function public.guard_savings_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('fincwin.decide_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_rpc then new.kind := 'pot'; end if;
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    if new.is_safety_net then new.locked := true; end if;  -- 06
    if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
      raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
    end if;  -- 05.2
    -- 06: compare to the stamped created_by (auth.uid() for every client; clients have no created_by grant), so the
    -- Wait RPC and owner-role writers with no JWT still link their own check. Same rule as guard_holding_lot.
    if new.check_id is not null and not exists (select 1 from public.decide_checks c where c.id = new.check_id and c.household_id = new.household_id and c.created_by = new.created_by) then  -- 06
      raise exception 'savings_goals: check is not yours' using errcode = '42501';  -- 06
    end if;  -- 06
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  new.kind := old.kind;
  new.bucket := old.bucket;  -- 05.2
  if new.created_by is not null then new.created_by := old.created_by; end if;
  if new.check_id is not null then new.check_id := old.check_id; end if;  -- WR-A01: only SET NULL may land
  -- 06: the safety-net flag moves only inside set_safety_net (D-29) or an undo replay of that swap
  if coalesce(current_setting('fincwin.safety_net_rpc', true), '') <> 'on'
     and coalesce(current_setting('fincwin.undo_replay', true), '') <> 'on' then  -- 06
    new.is_safety_net := old.is_safety_net;  -- 06
  end if;  -- 06
  if new.is_safety_net then new.locked := true; end if;  -- 06
  if old.is_safety_net and new.deleted_at is not null and old.deleted_at is null then  -- 06
    raise exception 'savings_goals: the safety net cannot be removed' using errcode = '42501';  -- 06
  end if;  -- 06
  if old.kind = 'pot' then
    new.currency := old.currency;
    -- 06: monthly_amount is editable on every pot (D-17, D-20); the 05.2 pin for non-bucket pots is gone
  elsif not v_rpc then
    new.name := old.name;
    new.currency := old.currency;
    new.target := old.target;
    new.monthly_amount := old.monthly_amount;
    new.ready_by := old.ready_by;
    new.opening_saved := old.opening_saved;
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
    raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
  end if;  -- 05.2
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_savings_goal() from public, anon, authenticated;

-- 3. accounts: interest rate (APY, GRW-11) ----------------------------------------------------------------------
alter table public.accounts add column if not exists interest_rate text
  check (interest_rate is null or interest_rate ~ '^\d{1,4}(\.\d{1,10})?$');  -- 06
grant insert (interest_rate) on public.accounts to authenticated;  -- 06
grant update (interest_rate) on public.accounts to authenticated;  -- 06

-- 4. debts: Grow payoff fields (paid_off_on and due_day already exist) -----------------------------------------
alter table public.debts add column if not exists started_balance bigint
  check (started_balance is null or started_balance between 0 and 10000000000000);  -- 06
alter table public.debts add column if not exists payoff_order text
  check (payoff_order is null or payoff_order in ('rate', 'balance'));  -- 06
alter table public.debts add column if not exists payoff_extra bigint not null default 0
  check (payoff_extra between 0 and 10000000000000);  -- 06
alter table public.debts add column if not exists extra_series_id uuid references public.recurring_series(id) on delete set null;  -- 06
grant insert (started_balance, payoff_order) on public.debts to authenticated;  -- 06
grant update (started_balance, payoff_order) on public.debts to authenticated;  -- 06
-- payoff_extra and extra_series_id: no client grant; written only by save_debt_plan (plan 07).

-- 5. holdings (owner-private) -----------------------------------------------------------------------------------
create table public.holdings (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  type text not null check (type in ('brokerage', 'retirement', 'pension', 'crypto', 'other')),
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  value bigint not null check (value between 0 and 10000000000000),
  value_as_of date not null,
  opening_put_in bigint not null default 0 check (opening_put_in between 0 and 10000000000000),
  account_id uuid references public.accounts(id) on delete set null,
  paid_from_account_id uuid references public.accounts(id) on delete set null,
  monthly_amount bigint check (monthly_amount is null or monthly_amount between 0 and 10000000000000),
  day smallint check (day is null or day between 1 and 31),
  rate text check (rate is null or rate ~ '^\d{1,4}(\.\d{1,10})?$'),
  is_sample boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index holdings_household_idx on public.holdings (household_id) where deleted_at is null;

create or replace function public.guard_holding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
  else
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    new.created_by := old.created_by;
    new.currency := old.currency;
    if coalesce(current_setting('fincwin.holding_sync', true), '') <> 'on' then
      new.value := old.value;
      new.value_as_of := old.value_as_of;
    end if;
    new.updated_at := now();
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'holdings: account is not in this household' using errcode = '42501';
  end if;
  if new.paid_from_account_id is not null and not exists (select 1 from public.accounts a where a.id = new.paid_from_account_id and a.household_id = new.household_id) then
    raise exception 'holdings: paid-from account is not in this household' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_holding() from public, anon, authenticated;
create trigger guard_holding before insert or update on public.holdings
  for each row execute function public.guard_holding();
create trigger set_version before update on public.holdings
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.holdings
  for each row execute function public.set_updated_by();

alter table public.holdings enable row level security;
create policy "own holdings" on public.holdings for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.holdings from anon;
revoke insert, update, delete, truncate on public.holdings from authenticated;
grant select on public.holdings to authenticated;
grant insert (id, household_id, name, type, currency, value, value_as_of, opening_put_in, account_id, paid_from_account_id,
  monthly_amount, day, rate) on public.holdings to authenticated;
grant update (name, type, opening_put_in, account_id, paid_from_account_id, monthly_amount, day, rate, deleted_at)
  on public.holdings to authenticated;

-- 6. holding_lots (owner-private) -------------------------------------------------------------------------------
create table public.holding_lots (
  id uuid primary key,
  holding_id uuid not null references public.holdings(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('buy', 'sell', 'dividend', 'fee', 'value')),
  amount bigint not null check (amount between 0 and 10000000000000),
  units text check (units is null or units ~ '^\d{1,12}(\.\d{1,8})?$'),
  local_date date not null,
  note text check (note is null or char_length(note) <= 200),
  is_sample boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index holding_lots_holding_idx on public.holding_lots (holding_id, local_date) where deleted_at is null;
create index holding_lots_household_idx on public.holding_lots (household_id);

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
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_holding_lot() from public, anon, authenticated;
create trigger guard_holding_lot before insert or update on public.holding_lots
  for each row execute function public.guard_holding_lot();
create trigger set_version before update on public.holding_lots
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.holding_lots
  for each row execute function public.set_updated_by();

alter table public.holding_lots enable row level security;
create policy "own holding lots" on public.holding_lots for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.holding_lots from anon;
revoke insert, update, delete, truncate on public.holding_lots from authenticated;
grant select on public.holding_lots to authenticated;
grant insert (id, holding_id, household_id, kind, amount, units, local_date, note) on public.holding_lots to authenticated;
grant update (amount, units, local_date, note, deleted_at) on public.holding_lots to authenticated;

-- 7. value sync: the latest live 'value' lot is the holding's current value ------------------------------------
create or replace function public.sync_holding_value()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_amount bigint;
  v_date date;
begin
  select l.amount, l.local_date into v_amount, v_date
    from public.holding_lots l
   where l.holding_id = new.holding_id and l.kind = 'value' and l.deleted_at is null
   order by l.local_date desc, l.created_at desc
   limit 1;
  if v_date is null then return null; end if;  -- no live value lot left: the holding is unchanged
  perform set_config('fincwin.holding_sync', 'on', true);
  update public.holdings set value = v_amount, value_as_of = v_date where id = new.holding_id;
  perform set_config('fincwin.holding_sync', '', true);
  return null;
end;
$$;
revoke execute on function public.sync_holding_value() from public, anon, authenticated;
create trigger sync_holding_value after insert or update of amount, local_date, deleted_at on public.holding_lots
  for each row when (new.kind = 'value') execute function public.sync_holding_value();

create or replace function public.seed_holding_value()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.holding_lots (id, holding_id, household_id, created_by, kind, amount, local_date, is_sample)
  values (gen_random_uuid(), new.id, new.household_id, new.created_by, 'value', new.value, new.value_as_of, new.is_sample);
  return null;
end;
$$;
revoke execute on function public.seed_holding_value() from public, anon, authenticated;
create trigger seed_holding_value after insert on public.holdings
  for each row execute function public.seed_holding_value();

-- 8. apply_patches (re-issued from 20261103000200; changed lines marked 06) -------------------------------------
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
        'one_off', 'goal_id', 'income_kind', 'counts_as', 'refund_of']  -- 2.2, 05 (D-29, D-34), 05.2
      when 'categories' then array['name', 'color_key', 'archived_at', 'monthly_cap']  -- 2.2
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
      when 'debts' then array['name', 'balance', 'apr', 'minimum_payment', 'secured', 'term_months', 'deleted_at', 'is_housing', 'pays_in_full', 'paid_off_on', 'due_day', 'started_balance', 'payoff_order']  -- 05-119 (R18.4), 05.2, 05.2 paid off, 05.4
        || case when v_system then array['check_id'] else '{}'::text[] end  -- 05
      when 'decide_links' then array['deleted_at']  -- 05
      when 'decide_changes' then array['kind', 'name', 'monthly_amount', 'currency', 'start_month', 'end_month', 'deleted_at']  -- 05 (D-27)
      when 'savings_goals' then array['name', 'target', 'ready_by', 'opening_saved', 'done_at', 'deleted_at',
        'account_id', 'monthly_amount', 'color_key', 'locked', 'protect', 'up_front_only', 'icon', 'net_confirmed_at']  -- 05 (D-34), 05-119 (R18.2), 05.2, 06
        || case when v_system then array['is_safety_net'] else '{}'::text[] end  -- 06 (D-29 swap undo only)
      when 'decide_settings' then array['currency', 'rough_income', 'rough_spending', 'reserve', 'dsr_line', 'housing_line',
        'unsecured_multiple', 'investing_floor', 'saving_floor', 'basis_override',
        'income_types', 'income_pattern', 'income_pattern_confirmed', 'variable_method', 'steady_amount', 'spread_months',
        'hold_months', 'share_pct', 'detail', 'remind_plan', 'remind_unspent', 'setup_done_at', 'everyday_override',
        'everyday_override_at', 'month_marks', 'unspent_anchor', 'unspent_anchor_at', 'reserve_account_id', 'reserve_goal',
        'rough_saving', 'rough_debt', 'rough_invest', 'rough_as_of', 'unexplained_amount', 'unexplained_use', 'unexplained_at',
        'refine_last_at', 'refine_snooze_until', 'custom_options']  -- 05.2, 05.3-81
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
    elsif v_entity = 'decide_settings' then -- 05.2: scoped by user_id
      if (v_row_json ->> 'user_id')::uuid is distinct from (select auth.uid()) then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    elsif v_entity in ('decide_checks', 'decide_links', 'decide_changes', 'savings_goals', 'decide_answers', 'holdings', 'holding_lots') then -- 05, 05.2: owner-private
      if not ((v_row_json ->> 'created_by')::uuid is not distinct from (select auth.uid())
              and (v_row_json ->> 'household_id')::uuid in (select public.user_household_ids())) then
        raise exception 'apply_patches: op % is not writable by the caller', v_idx using errcode = '42501';
      end if;
    elsif v_entity in ('debts', 'recurring_dismissals', 'income_payer_prompts') then -- 05, 05.2: household-scoped
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
        when 'decide_settings.share_pct' then 'smallint'  -- 05.2
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
        when 'savings_goals.locked' then 'boolean'  -- 06
        when 'savings_goals.protect' then 'boolean'  -- 06
        when 'savings_goals.up_front_only' then 'boolean'  -- 06
        when 'savings_goals.icon' then 'text'  -- 06
        when 'savings_goals.net_confirmed_at' then 'timestamptz'  -- 06
        when 'savings_goals.is_safety_net' then 'boolean'  -- 06
        when 'debts.started_balance' then 'bigint'  -- 06
        when 'debts.payoff_order' then 'text'  -- 06
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
