-- Phase 9 (09-02) plan core: D-13 store-neutral plan record, D-10 seats, D-16 trial ledger, D-30 private setup,
-- launch switch (owner P1). No lock trigger (09-03), no invite changes (09-04), no plan_apply (09-05).

-- 1. plan_products: store product ids -> plan --------------------------------------------------------------------
create table public.plan_products (
  product_id text primary key,
  store text not null check (store in ('APP_STORE','PLAY_STORE')),
  plan_key text not null check (plan_key in ('solo','duo','household','extended')),
  plan_size smallint not null check (plan_size in (1,2,6,12)),
  period text not null check (period in ('month','year')),
  has_trial boolean not null,
  rank smallint not null check (rank between 1 and 4));
alter table public.plan_products enable row level security;
create policy plan_products_read on public.plan_products for select to authenticated using (true);
revoke all on public.plan_products from anon;
revoke insert, update, delete, truncate on public.plan_products from authenticated;

insert into public.plan_products (product_id, store, plan_key, plan_size, period, has_trial, rank) values
  ('fincwin.solo.month', 'APP_STORE', 'solo', 1, 'month', true, 1),
  ('fincwin.solo.year', 'APP_STORE', 'solo', 1, 'year', true, 1),
  ('fincwin.solo.month.notrial', 'APP_STORE', 'solo', 1, 'month', false, 1),
  ('fincwin.solo.year.notrial', 'APP_STORE', 'solo', 1, 'year', false, 1),
  ('fincwin.duo.month', 'APP_STORE', 'duo', 2, 'month', true, 2),
  ('fincwin.duo.year', 'APP_STORE', 'duo', 2, 'year', true, 2),
  ('fincwin.duo.month.notrial', 'APP_STORE', 'duo', 2, 'month', false, 2),
  ('fincwin.duo.year.notrial', 'APP_STORE', 'duo', 2, 'year', false, 2),
  ('fincwin.household.month', 'APP_STORE', 'household', 6, 'month', false, 3),
  ('fincwin.household.year', 'APP_STORE', 'household', 6, 'year', false, 3),
  ('fincwin.extended.month', 'APP_STORE', 'extended', 12, 'month', false, 4),
  ('fincwin.extended.year', 'APP_STORE', 'extended', 12, 'year', false, 4),
  ('fincwin_solo:monthly', 'PLAY_STORE', 'solo', 1, 'month', true, 1),
  ('fincwin_solo:yearly', 'PLAY_STORE', 'solo', 1, 'year', true, 1),
  ('fincwin_duo:monthly', 'PLAY_STORE', 'duo', 2, 'month', true, 2),
  ('fincwin_duo:yearly', 'PLAY_STORE', 'duo', 2, 'year', true, 2),
  ('fincwin_household:monthly', 'PLAY_STORE', 'household', 6, 'month', false, 3),
  ('fincwin_household:yearly', 'PLAY_STORE', 'household', 6, 'year', false, 3),
  ('fincwin_extended:monthly', 'PLAY_STORE', 'extended', 12, 'month', false, 4),
  ('fincwin_extended:yearly', 'PLAY_STORE', 'extended', 12, 'year', false, 4);

-- 2. household_plans: one record per household (D-13) -----------------------------------------------------------
create table public.household_plans (
  household_id uuid primary key references public.households(id) on delete cascade,
  payer_id uuid references auth.users(id) on delete set null,
  store text not null check (store in ('APP_STORE','PLAY_STORE','PROMOTIONAL','BACKFILL','NONE')),
  environment text not null default 'PRODUCTION' check (environment in ('PRODUCTION','SANDBOX')),
  product_id text,
  plan_key text check (plan_key in ('solo','duo','household','extended')),
  plan_size smallint not null check (plan_size in (1,2,6,12)),
  period text check (period in ('month','year')),
  status text not null check (status in ('trial','active','grace','lapsed','promo','left_grace')),
  promo_kind text check (promo_kind in ('tester','owner')),
  store_expires_at timestamptz,
  grace_until timestamptz,
  covered_until timestamptz,
  will_renew boolean not null default true,
  billing_issue_at timestamptz,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  original_transaction_id text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1);
create index household_plans_payer_idx on public.household_plans (payer_id);
alter table public.household_plans enable row level security;
create policy household_plans_member_read on public.household_plans for select to authenticated
  using (exists (select 1 from public.household_members m
                  where m.household_id = household_plans.household_id and m.user_id = (select auth.uid())));
revoke all on public.household_plans from anon;
revoke insert, update, delete, truncate on public.household_plans from authenticated;
grant select on public.household_plans to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_plans') then
    alter publication supabase_realtime add table public.household_plans;
  end if;
end
$$;

-- 3. plan_events: webhook ledger, server only -------------------------------------------------------------------
create table public.plan_events (
  id bigint generated always as identity primary key,
  rc_event_id text not null unique,
  type text not null,
  app_user_id text,
  environment text,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  applied_at timestamptz,
  note text);
alter table public.plan_events enable row level security;
revoke all on public.plan_events from anon, authenticated;

-- 4. trial_ledger (owner P8: deleting the account deletes the row) ----------------------------------------------
create table public.trial_ledger (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null,
  product_id text,
  started_at timestamptz not null default now());
create unique index trial_ledger_household_once on public.trial_ledger (household_id);
alter table public.trial_ledger enable row level security;
revoke all on public.trial_ledger from anon, authenticated;

-- 5. household_leave_log ----------------------------------------------------------------------------------------
create table public.household_leave_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null,
  left_at timestamptz not null default now(),
  reason text not null check (reason in ('left','removed','household_closed')),
  exception_until timestamptz);
create index household_leave_log_user_idx on public.household_leave_log (user_id, left_at desc);
alter table public.household_leave_log enable row level security;
revoke all on public.household_leave_log from anon, authenticated;
comment on table public.household_leave_log is
  'D-39; purged after 13 months by the 09-05 sweep; DPIA in Phase 11; store country is never stored.';

-- 6. plan_join_requests -----------------------------------------------------------------------------------------
create table public.plan_join_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invite_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  needed_plan_size smallint not null check (needed_plan_size in (2,6,12)),
  status text not null default 'waiting' check (status in ('waiting','admitted','cancelled','expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz);
create unique index plan_join_requests_one_waiting on public.plan_join_requests (household_id, user_id) where status = 'waiting';
alter table public.plan_join_requests enable row level security;
create policy plan_join_requests_read on public.plan_join_requests for select to authenticated
  using (user_id = (select auth.uid())
    or exists (select 1 from public.household_plans p
                where p.household_id = plan_join_requests.household_id and p.payer_id = (select auth.uid())));
revoke all on public.plan_join_requests from anon;
revoke insert, update, delete, truncate on public.plan_join_requests from authenticated;
grant select on public.plan_join_requests to authenticated;

-- 7. plan_settings: launch switch -------------------------------------------------------------------------------
create table public.plan_settings (
  id boolean primary key default true check (id),
  paid_from timestamptz,
  enforce_for uuid[] not null default '{}',
  tester_until timestamptz);
insert into public.plan_settings default values;
alter table public.plan_settings enable row level security;
revoke all on public.plan_settings from anon, authenticated;
comment on table public.plan_settings is
  'Owner P1 launch switch: before paid_from, households with no plan row are writable (prelaunch). enforce_for puts named test accounts on the paywall early. Never grants paid access to a household that has lapsed.';

-- 8. user_setup -------------------------------------------------------------------------------------------------
create table public.user_setup (
  user_id uuid primary key references auth.users(id) on delete cascade,
  level smallint check (level between 1 and 4),
  level_source text check (level_source in ('answers','skipped','existing','manual')),
  answers jsonb not null default '{}'::jsonb,
  resume_step text,
  completed_at timestamptz,
  partner_version boolean not null default false,
  existing_card text check (existing_card in ('pending','dismissed','done')),
  records_applied_at timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1);
alter table public.user_setup enable row level security;
create policy user_setup_select on public.user_setup for select to authenticated using (user_id = (select auth.uid()));
create policy user_setup_insert on public.user_setup for insert to authenticated with check (user_id = (select auth.uid()));
create policy user_setup_update on public.user_setup for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.user_setup from anon;
revoke delete, truncate on public.user_setup from authenticated;
comment on table public.user_setup is 'D-30: private by default, never read by other members.';

-- 9. feature_switches -------------------------------------------------------------------------------------------
create table public.feature_switches (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_id text not null check (feature_id ~ '^[a-z][a-zA-Z0-9.]{1,40}$'),
  is_on boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_id));
alter table public.feature_switches enable row level security;
create policy feature_switches_select on public.feature_switches for select to authenticated using (user_id = (select auth.uid()));
create policy feature_switches_insert on public.feature_switches for insert to authenticated with check (user_id = (select auth.uid()));
create policy feature_switches_update on public.feature_switches for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy feature_switches_delete on public.feature_switches for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.feature_switches from anon;
revoke truncate on public.feature_switches from authenticated;

-- 10. Functions -------------------------------------------------------------------------------------------------
create or replace function public.household_plan_state(p_household uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.household_plans%rowtype;
  s public.plan_settings%rowtype;
begin
  select * into r from public.household_plans where household_id = p_household;
  if not found then
    select * into s from public.plan_settings limit 1;
    if (s.paid_from is null or now() < s.paid_from)
       and not exists (select 1 from public.household_members m
                        where m.household_id = p_household and m.user_id = any(s.enforce_for)) then
      return 'prelaunch';
    end if;
    return 'none';
  end if;
  if r.status = 'lapsed' or (r.covered_until is not null and r.covered_until <= now()) then
    return 'lapsed';
  end if;
  return r.status;
end;
$$;
revoke execute on function public.household_plan_state(uuid) from public, anon, authenticated;

create or replace function public.household_writable(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.household_plan_state(p_household) in ('prelaunch','trial','active','grace','promo','left_grace')
$$;
revoke execute on function public.household_writable(uuid) from public, anon, authenticated;

create or replace function public.household_seats(p_household uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  st text := public.household_plan_state(p_household);
  r public.household_plans%rowtype;
begin
  select * into r from public.household_plans where household_id = p_household;
  return case st
    when 'trial' then 2
    when 'active' then r.plan_size::integer
    when 'grace' then r.plan_size::integer
    when 'promo' then coalesce(r.plan_size, 6)::integer
    when 'left_grace' then 1
    when 'prelaunch' then 6
    else (select count(*)::integer from public.household_members where household_id = p_household)
  end;
end;
$$;
revoke execute on function public.household_seats(uuid) from public, anon, authenticated;

create or replace function public.plan_trial_available(p_user uuid, p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (select 1 from public.trial_ledger where user_id = p_user or household_id = p_household)
$$;
revoke execute on function public.plan_trial_available(uuid, uuid) from public, anon, authenticated;

create or replace function public.plan_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  r public.household_plans%rowtype;
  have boolean;
  payer_nm text;
begin
  select household_id into hid from public.household_members where user_id = uid order by created_at limit 1;
  select * into r from public.household_plans where household_id = hid;
  have := found;
  if have and r.payer_id is not null then
    select case when m.name_hidden then null else m.display_name end into payer_nm
      from public.household_members m where m.household_id = hid and m.user_id = r.payer_id;
  end if;
  return jsonb_build_object(
    'household_id', hid,
    'state', public.household_plan_state(hid),
    'plan_key', case when have then r.plan_key end,
    'plan_size', case when have then r.plan_size end,
    'period', case when have then r.period end,
    'payer_id', case when have then r.payer_id end,
    'payer_is_me', have and r.payer_id is not distinct from uid,
    'payer_name', payer_nm,
    'store', case when have then r.store end,
    'product_id', case when have then r.product_id end,
    'environment', case when have then r.environment end,
    'will_renew', case when have then r.will_renew end,
    'covered_until', case when have then r.covered_until end,
    'store_expires_at', case when have then r.store_expires_at end,
    'grace_until', case when have then r.grace_until end,
    'trial_ends_at', case when have then r.trial_ends_at end,
    'promo_kind', case when have then r.promo_kind end,
    'trial_available', public.plan_trial_available(uid, hid),
    'members', (select count(*) from public.household_members where household_id = hid),
    'seats', public.household_seats(hid),
    'writable', public.household_writable(hid),
    'billing_issue_at', case when have then r.billing_issue_at end,
    'last_synced_at', case when have then r.last_synced_at end);
end;
$$;
revoke execute on function public.plan_state() from public, anon;
grant execute on function public.plan_state() to authenticated;
