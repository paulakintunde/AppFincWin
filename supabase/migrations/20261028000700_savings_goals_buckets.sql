-- 05.2 D-05, D-22: saving buckets and envelope location. guard_savings_goal re-created from the LATEST definition in
-- 20261024000100_pots_and_debt_housing.sql; only lines marked 05.2 changed.
-- Additive: new columns, a re-added shape check, widened grants. A bucket is a pot with a bucket kind, a writable
-- monthly amount, an optional goal and no date. Ordinary pots still need a target and a ready-by date.

-- 1. savings_goals: bucket, account_id, color_key --------------------------------------------------------------
alter table public.savings_goals add column if not exists bucket text
  check (bucket is null or bucket in ('college', 'house', 'car', 'trip', 'business', 'wedding', 'other'));
alter table public.savings_goals add column if not exists account_id uuid references public.accounts(id) on delete set null;
alter table public.savings_goals add column if not exists color_key text
  check (color_key is null or color_key in ('green', 'slate', 'teal', 'blue', 'plum', 'rust', 'ochre'));

alter table public.savings_goals drop constraint if exists savings_goals_bucket_kind;
alter table public.savings_goals add constraint savings_goals_bucket_kind check (bucket is null or kind = 'pot');
alter table public.savings_goals drop constraint if exists savings_goals_pot_shape;
alter table public.savings_goals add constraint savings_goals_pot_shape
  check (kind <> 'pot' or (check_id is null and (bucket is not null or (target is not null and ready_by is not null and monthly_amount is null))));

create index if not exists savings_goals_account_idx on public.savings_goals (account_id) where account_id is not null;

grant insert (id, household_id, kind, name, currency, target, ready_by, opening_saved, bucket, account_id, monthly_amount, color_key)
  on public.savings_goals to authenticated;
grant update (name, target, ready_by, opening_saved, done_at, deleted_at, account_id, monthly_amount, color_key)
  on public.savings_goals to authenticated;

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
    if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
      raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
    end if;  -- 05.2
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
  if old.kind = 'pot' then
    new.currency := old.currency;
    if old.bucket is null then new.monthly_amount := old.monthly_amount; end if;  -- 05.2
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
