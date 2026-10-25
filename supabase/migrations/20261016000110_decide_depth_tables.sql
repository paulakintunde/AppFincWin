-- Phase 5 part 2 (05-32): dated changes (D-27, per user), the minimal savings goal (D-34, owner-private, household_id carried for Phase 8;
-- Phase 6 builds on this table and inherits check_id provenance and computed saved-so-far), cooling-off (D-35) and the three-way
-- estimate plus link roles (D-36, 04 D-48). Decision state has no client write grant: record_decide_go / record_decide_outcome (05-04)
-- write it. Every FK to a user or household cascades. Additive.

-- 1. decide_changes (D-27) ----------------------------------------------------------------------------------
create table public.decide_changes (
  id uuid primary key,                                                    -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('income', 'spending')),
  name text check (name is null or char_length(btrim(name)) between 1 and 80),
  monthly_amount bigint not null check (monthly_amount <> 0 and abs(monthly_amount) <= 10000000000000),  -- sign from "Goes up / Goes down"
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month text check (end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  is_sample boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decide_changes_order check (end_month is null or end_month >= start_month)
);
create index decide_changes_owner_idx on public.decide_changes (created_by, household_id) where deleted_at is null;
create index decide_changes_household_idx on public.decide_changes (household_id);

create or replace function public.fill_decide_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  new.updated_by := new.created_by;
  return new;
end;
$$;
revoke execute on function public.fill_decide_change() from public, anon, authenticated;
create trigger fill_decide_change before insert on public.decide_changes
  for each row execute function public.fill_decide_change();

create or replace function public.guard_decide_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  -- an ON DELETE SET NULL / cascade from auth.users may touch created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_decide_change() from public, anon, authenticated;
create trigger guard_decide_change before update on public.decide_changes
  for each row execute function public.guard_decide_change();
create trigger set_version before update on public.decide_changes
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.decide_changes
  for each row execute function public.set_updated_by();

alter table public.decide_changes enable row level security;
create policy "own decide changes" on public.decide_changes for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.decide_changes from anon;
revoke insert, update, delete, truncate on public.decide_changes from authenticated;
grant select on public.decide_changes to authenticated;
grant insert (id, household_id, kind, name, monthly_amount, currency, start_month, end_month)
  on public.decide_changes to authenticated;
grant update (kind, name, monthly_amount, currency, start_month, end_month, deleted_at)
  on public.decide_changes to authenticated;

-- 2. savings_goals (D-34) -----------------------------------------------------------------------------------
-- No stored balance: the amount saved so far is computed from the transfers tagged to the goal, so undo cannot desync it.
create table public.savings_goals (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  check_id uuid references public.decide_checks(id) on delete set null,     -- D-34 origin; null for Phase 6 goals
  name text not null check (char_length(btrim(name)) between 1 and 80),
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  target bigint check (target is null or target between 1 and 10000000000000),
  monthly_amount bigint check (monthly_amount is null or monthly_amount between 0 and 10000000000000),
  ready_by date,
  opening_saved bigint not null default 0 check (opening_saved between 0 and 10000000000000),
  is_sample boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index savings_goals_owner_idx on public.savings_goals (created_by, household_id) where deleted_at is null;
create index savings_goals_check_idx on public.savings_goals (check_id) where deleted_at is null;
create index savings_goals_household_idx on public.savings_goals (household_id);

create or replace function public.guard_savings_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' then
    new.check_id := old.check_id;
    new.name := old.name;
    new.currency := old.currency;
    new.target := old.target;
    new.monthly_amount := old.monthly_amount;
    new.ready_by := old.ready_by;
    new.opening_saved := old.opening_saved;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.guard_savings_goal() from public, anon, authenticated;
create trigger guard_savings_goal before insert or update on public.savings_goals
  for each row execute function public.guard_savings_goal();
create trigger set_version before update on public.savings_goals
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.savings_goals
  for each row execute function public.set_updated_by();

alter table public.savings_goals enable row level security;
create policy "own savings goals" on public.savings_goals for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.savings_goals from anon;
revoke insert, update, delete, truncate on public.savings_goals from authenticated;
grant select on public.savings_goals to authenticated;
-- removing a Wait decision soft-deletes its goal in the same undo step (05-19); inserts are RPC-only (05-04)
grant update (deleted_at) on public.savings_goals to authenticated;

-- 3. decide_checks: cooling-off and the split estimates (D-35, D-36) -----------------------------------------
alter table public.decide_checks
  add column cooling_off_at timestamptz,
  add column estimate_monthly_payment bigint check (estimate_monthly_payment is null or abs(estimate_monthly_payment) <= 10000000000000),
  add column estimate_running bigint check (estimate_running is null or abs(estimate_running) <= 10000000000000);
comment on column public.decide_checks.estimate_monthly_payment is
  'estimate_monthly stays the sum shown in Past decisions (05-22); the split feeds estimateBias (D-36).';

-- 4. decide_links.role (D-36, 04 D-48) ----------------------------------------------------------------------
alter table public.decide_links
  add column role text check (role is null or role in ('day_one', 'payment', 'running_cost'));
grant insert (role) on public.decide_links to authenticated;

create or replace function public.guard_decide_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' then
      new.source := 'attached';
    end if;
    if not exists (
         select 1 from public.decide_checks c
          where c.id = new.check_id and c.household_id = new.household_id and c.created_by = new.created_by) then
      raise exception 'decide_links: check is not yours in this household' using errcode = '42501';
    end if;
    if not (case new.entity
              when 'transactions' then exists (
                select 1 from public.transactions t where t.id = new.target_id and t.household_id = new.household_id)
              when 'recurring_series' then exists (
                select 1 from public.recurring_series s where s.id = new.target_id and s.household_id = new.household_id)
              else exists (
                select 1 from public.debts d where d.id = new.target_id and d.household_id = new.household_id)
            end) then
      raise exception 'decide_links: target is not in this household' using errcode = '42501';
    end if;
  else
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.check_id := old.check_id;
    new.entity := old.entity;
    new.target_id := old.target_id;
    new.source := old.source;
    new.role := old.role;  -- 05-32
    new.updated_at := now();
  end if;
  return new;
end;
$$;
