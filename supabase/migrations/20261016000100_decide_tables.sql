-- Phase 5 (Decide UI, 05-03): checks (inputs only, D-15), per-user limits and rough figures (D-14, D-03),
-- minimal debts ahead of Phase 6 (D-38: balance, APR, secured, minimum terms, paid in full), decision links
-- (D-12) and statement coverage (D-38, OQ3). Owner-private checks/links (OQ5), household debts and periods.
-- Status, decision and estimate columns have no client grant: only record_decide_go / record_decide_outcome
-- (05-04) write them. Every FK to a user or household cascades (GDPR erasure). Additive: no existing row is written.

-- 1. decide_checks ------------------------------------------------------------------------------------------
create table public.decide_checks (
  id uuid primary key,                                                    -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  kind text not null default 'buy' check (kind in ('buy', 'invest')),
  name text not null default '' check (char_length(name) <= 80),
  inputs jsonb not null default '{}'::jsonb check (jsonb_typeof(inputs) = 'object' and pg_column_size(inputs) < 32768),
  status text not null default 'open' check (status in ('open', 'bought', 'waiting', 'passed')),
  furthest_step smallint not null default 1 check (furthest_step between 1 and 5),
  last_seen_state text check (last_seen_state is null or last_seen_state in ('fits', 'adjust', 'no', 'missing')),
  last_seen_basis text check (last_seen_basis is null or last_seen_basis in ('logged_months', 'first_read_rough_figures')),
  reopened_from uuid references public.decide_checks(id) on delete set null,
  decided_at timestamptz,
  verdict_at_decision text check (verdict_at_decision is null or verdict_at_decision in ('fits', 'adjust', 'no', 'missing')),
  estimate_day_one bigint check (estimate_day_one is null or abs(estimate_day_one) <= 10000000000000),
  estimate_monthly bigint check (estimate_monthly is null or abs(estimate_monthly) <= 10000000000000),
  wait_monthly bigint check (wait_monthly is null or wait_monthly between 0 and 10000000000000),
  ready_by date,
  broke_line boolean not null default false,
  is_sample boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint decide_checks_kind_matches_inputs check (not (inputs ? 'kind') or inputs ->> 'kind' = kind),
  constraint decide_checks_decision_shape check (
    (status = 'open' and decided_at is null)
    or (status = 'bought' and decided_at is not null and estimate_day_one is not null and estimate_monthly is not null)
    or (status = 'waiting' and decided_at is not null and wait_monthly is not null)
    or (status = 'passed' and decided_at is not null))
);
create index decide_checks_owner_idx on public.decide_checks (created_by, household_id) where deleted_at is null;
create index decide_checks_household_idx on public.decide_checks (household_id);
create index decide_checks_reopened_from_idx on public.decide_checks (reopened_from) where reopened_from is not null;

create or replace function public.fill_decide_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.created_by := coalesce((select auth.uid()), new.created_by);
  new.updated_by := new.created_by;
  return new;
end;
$$;
revoke execute on function public.fill_decide_check() from public, anon, authenticated;
create trigger fill_decide_check before insert on public.decide_checks
  for each row execute function public.fill_decide_check();

create or replace function public.guard_decide_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  new.household_id := old.household_id;
  new.created_at := old.created_at;
  new.reopened_from := old.reopened_from;
  new.is_sample := old.is_sample;
  -- an ON DELETE SET NULL / cascade from auth.users may touch created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  if old.status <> 'open' and (
       new.inputs is distinct from old.inputs
       or new.name is distinct from old.name
       or new.furthest_step is distinct from old.furthest_step
       or new.kind is distinct from old.kind) then
    raise exception 'decide_checks: a decided check is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_decide_check() from public, anon, authenticated;
create trigger guard_decide_check before update on public.decide_checks
  for each row execute function public.guard_decide_check();
create trigger set_version before update on public.decide_checks
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.decide_checks
  for each row execute function public.set_updated_by();

alter table public.decide_checks enable row level security;
create policy "own decide checks" on public.decide_checks for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.decide_checks from anon;
revoke insert, update, delete, truncate on public.decide_checks from authenticated;
grant select on public.decide_checks to authenticated;
grant insert (id, household_id, kind, name, inputs, furthest_step, last_seen_state, last_seen_basis, reopened_from)
  on public.decide_checks to authenticated;
grant update (kind, name, inputs, furthest_step, last_seen_state, last_seen_basis, deleted_at)
  on public.decide_checks to authenticated;

-- 2. decide_settings ----------------------------------------------------------------------------------------
create table public.decide_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  currency text check (currency is null or currency ~ '^[A-Z0-9]{2,4}$'),   -- home currency the money columns were typed in
  rough_income bigint check (rough_income is null or rough_income between 0 and 10000000000000),
  rough_spending bigint check (rough_spending is null or rough_spending between 0 and 10000000000000),
  reserve bigint check (reserve is null or reserve between 0 and 10000000000000),
  dsr_line text check (dsr_line is null or dsr_line ~ '^\d{1,3}(\.\d{1,4})?$'),
  unsecured_multiple integer check (unsecured_multiple is null or unsecured_multiple between 1 and 120),
  investing_floor bigint check (investing_floor is null or investing_floor between 0 and 10000000000000),
  saving_floor bigint check (saving_floor is null or saving_floor between 0 and 10000000000000),
  basis_override text check (basis_override is null or basis_override in ('average', 'worst')),
  seeded boolean not null default false,   -- true only on the row seed_sample_data wrote; any other write clears it
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.fill_decide_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null then new.user_id := (select auth.uid()); end if;
  -- seeded is set only while seed_sample_data runs (fincwin.decide_seed); every other insert or update ends false
  if coalesce(current_setting('fincwin.decide_seed', true), '') <> 'on' then new.seeded := false; end if;
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.fill_decide_settings() from public, anon, authenticated;
create trigger fill_decide_settings before insert or update on public.decide_settings
  for each row execute function public.fill_decide_settings();
create trigger set_version before update on public.decide_settings
  for each row execute function public.bump_version();

alter table public.decide_settings enable row level security;
create policy "own decide settings" on public.decide_settings for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.decide_settings from anon;
revoke insert, update, delete, truncate on public.decide_settings from authenticated;
grant select on public.decide_settings to authenticated;
grant insert (user_id, currency, rough_income, rough_spending, reserve, dsr_line, unsecured_multiple, investing_floor, saving_floor, basis_override)
  on public.decide_settings to authenticated;
grant update (currency, rough_income, rough_spending, reserve, dsr_line, unsecured_multiple, investing_floor, saving_floor, basis_override)
  on public.decide_settings to authenticated;

-- 3. debts (household-scoped, minimal; Phase 6 extends additively) -----------------------------------------
create table public.debts (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  check_id uuid references public.decide_checks(id) on delete set null,
  series_id uuid references public.recurring_series(id) on delete set null,   -- the series that pays this debt (Go ahead sets it, 05-20); the snapshot then counts the payment once (05-06)
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('loan', 'card', 'other')),
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  balance bigint not null default 0 check (balance between 0 and 10000000000000),
  apr text check (apr is null or apr ~ '^\d{1,4}(\.\d{1,10})?$'),           -- mirrors engine percent(); never defaulted (04 D-07)
  minimum_payment bigint not null default 0 check (minimum_payment between 0 and 10000000000000),
  secured boolean not null default false,                                     -- DEC-11
  term_months integer check (term_months is null or term_months between 1 and 600),
  start_date date,
  min_percent text check (min_percent is null or min_percent ~ '^\d{1,4}(\.\d{1,10})?$'),
  min_interest_added boolean,
  min_floor bigint check (min_floor is null or min_floor between 0 and 10000000000000),
  paid_in_full boolean not null default false,                                 -- D-38 / D-40: a card paid in full every month adds no minimum (its spending lines already count)
  is_sample boolean not null default false,
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index debts_one_card_record on public.debts (account_id) where kind = 'card' and deleted_at is null and account_id is not null;
create index debts_household_idx on public.debts (household_id);
create index debts_series_id_idx on public.debts (series_id) where series_id is not null;
create index debts_check_id_idx on public.debts (check_id) where check_id is not null;

create or replace function public.guard_debt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and not exists (
       select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'debts: account is not in this household' using errcode = '42501';
  end if;
  if new.series_id is not null and not exists (
       select 1 from public.recurring_series s where s.id = new.series_id and s.household_id = new.household_id) then
    raise exception 'debts: series is not in this household' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.household_id := old.household_id;
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    if new.created_by is not null then new.created_by := old.created_by; end if;
    if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' then
      new.check_id := old.check_id;
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_debt() from public, anon, authenticated;
create trigger guard_debt before insert or update on public.debts
  for each row execute function public.guard_debt();
create trigger set_version before update on public.debts
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.debts
  for each row execute function public.set_updated_by();

alter table public.debts enable row level security;
create policy "household debts" on public.debts for all to authenticated
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

revoke all on public.debts from anon;
revoke insert, update, delete, truncate on public.debts from authenticated;
grant select on public.debts to authenticated;
grant insert (id, household_id, account_id, series_id, name, kind, currency, balance, apr, minimum_payment, secured, term_months, start_date, min_percent, min_interest_added, min_floor, paid_in_full)
  on public.debts to authenticated;
grant update (account_id, series_id, name, balance, apr, minimum_payment, secured, term_months, min_percent, min_interest_added, min_floor, paid_in_full, deleted_at)
  on public.debts to authenticated;

-- 4. decide_links -------------------------------------------------------------------------------------------
create table public.decide_links (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  check_id uuid not null references public.decide_checks(id) on delete cascade,
  entity text not null check (entity in ('transactions', 'recurring_series', 'debts')),
  target_id uuid not null,
  source text not null default 'attached' check (source in ('written', 'attached')),
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index decide_links_live_unique on public.decide_links (check_id, entity, target_id) where deleted_at is null;
create index decide_links_household_idx on public.decide_links (household_id);
create index decide_links_created_by_idx on public.decide_links (created_by);

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
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_decide_link() from public, anon, authenticated;
create trigger guard_decide_link before insert or update on public.decide_links
  for each row execute function public.guard_decide_link();
create trigger set_version before update on public.decide_links
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.decide_links
  for each row execute function public.set_updated_by();

alter table public.decide_links enable row level security;
create policy "own decide links" on public.decide_links for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

revoke all on public.decide_links from anon;
revoke insert, update, delete, truncate on public.decide_links from authenticated;
grant select on public.decide_links to authenticated;
grant insert (id, household_id, check_id, entity, target_id) on public.decide_links to authenticated;
grant update (deleted_at) on public.decide_links to authenticated;

-- 5. statement_periods --------------------------------------------------------------------------------------
create table public.statement_periods (
  id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  account_id uuid not null,
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now(),
  constraint statement_periods_order check (period_end >= period_start and period_end - period_start <= 400),
  constraint statement_periods_account_same_household foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete cascade
);
create unique index statement_periods_unique on public.statement_periods (household_id, account_id, period_start, period_end);
create index statement_periods_account_idx on public.statement_periods (account_id, household_id);

alter table public.statement_periods enable row level security;
create policy "household reads statement periods" on public.statement_periods for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "household inserts statement periods" on public.statement_periods for insert to authenticated
  with check (household_id in (select public.user_household_ids()));

revoke all on public.statement_periods from anon;
revoke insert, update, delete, truncate on public.statement_periods from authenticated;
grant select on public.statement_periods to authenticated;
grant insert (id, household_id, account_id, period_start, period_end) on public.statement_periods to authenticated;
