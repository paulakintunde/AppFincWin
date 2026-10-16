-- Phase 5 part 2 (05-32): Record's one-off flag (D-29: left out of Decide's averages) and the savings-goal tag on a transfer leg
-- (D-34, design A: transactions.goal_id; saved-so-far is computed). transactions_active is re-created because a select * view freezes
-- its column list (RESEARCH Pitfall 1, as 20261010000100). Additive; existing rows default to false / null.

-- 1. Columns and index.
alter table public.transactions
  add column one_off boolean not null default false,
  add column goal_id uuid references public.savings_goals(id) on delete set null;
create index transactions_goal_idx on public.transactions (goal_id) where goal_id is not null and deleted_at is null;

-- 2. A tag may only point at one of the caller's own live goals in the same household (D-34).
create or replace function public.guard_transaction_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.goal_id is not null
     and (tg_op = 'INSERT' or new.goal_id is distinct from old.goal_id) then
    if not exists (
      select 1 from public.savings_goals g
       where g.id = new.goal_id
         and g.household_id = new.household_id
         and g.deleted_at is null
         and (g.created_by = (select auth.uid()) or (select auth.uid()) is null)) then
      raise exception 'transactions: goal is not one of your live goals in this household' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_transaction_goal() from public, anon, authenticated;
create trigger guard_transaction_goal before insert or update of goal_id on public.transactions
  for each row execute function public.guard_transaction_goal();

-- 3. Re-create the view so one_off and goal_id are selectable (RESEARCH Pitfall 1), and re-issue its grants. -- 05-32
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- 4. Additive column grants.
grant insert (one_off, goal_id) on public.transactions to authenticated;
grant update (one_off, goal_id) on public.transactions to authenticated;
