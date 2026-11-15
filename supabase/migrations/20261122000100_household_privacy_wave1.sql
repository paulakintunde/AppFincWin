-- Phase 8 wave 1 (CMP-F18, ARC-22, D-01, D-43): every record personal unless marked shared.
-- Proven by supabase/tests/database/101_household_privacy_two_user.test.sql (plan 08-07).

-- 1. Columns ------------------------------------------------------------------------------------------------
-- paid_by null means "the creator paid" (D-18).
alter table public.transactions
  add column is_shared boolean not null default false,
  add column paid_by uuid references auth.users(id) on delete set null;
alter table public.accounts add column is_shared boolean not null default false;          -- Joint account (D-13)
alter table public.recurring_series add column is_shared boolean not null default false;  -- D-16

create index transactions_household_shared_idx on public.transactions (household_id) where is_shared;
create index accounts_household_shared_idx on public.accounts (household_id) where is_shared;
create index recurring_series_household_shared_idx on public.recurring_series (household_id) where is_shared;

-- 2. Backfill (before any policy switch) -------------------------------------------------------------------
-- Some tables pin created_by on update, which would silently undo the backfill, so user triggers are off for the
-- one-time update. Version bumps are skipped on purpose: the value is the same row, now attributed.
alter table public.transactions disable trigger user;
alter table public.accounts disable trigger user;
alter table public.recurring_series disable trigger user;
alter table public.debts disable trigger user;
alter table public.recurring_dismissals disable trigger user;
alter table public.income_payer_prompts disable trigger user;

update public.transactions t set created_by = h.owner_id from public.households h
  where t.household_id = h.id and t.created_by is null;
update public.accounts t set created_by = h.owner_id from public.households h
  where t.household_id = h.id and t.created_by is null;
update public.recurring_series t set created_by = h.owner_id from public.households h
  where t.household_id = h.id and t.created_by is null;
update public.debts t set created_by = h.owner_id from public.households h
  where t.household_id = h.id and t.created_by is null;
update public.recurring_dismissals t set created_by = h.owner_id from public.households h
  where t.household_id = h.id and t.created_by is null;
update public.income_payer_prompts t set created_by = h.owner_id from public.households h
  where t.household_id = h.id and t.created_by is null;

alter table public.transactions enable trigger user;
alter table public.accounts enable trigger user;
alter table public.recurring_series enable trigger user;
alter table public.debts enable trigger user;
alter table public.recurring_dismissals enable trigger user;
alter table public.income_payer_prompts enable trigger user;

do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['transactions', 'accounts', 'recurring_series', 'debts', 'recurring_dismissals', 'income_payer_prompts'] loop
    execute format('select count(*) from public.%I where created_by is null', t) into n;
    if n > 0 then
      raise exception 'privacy_wave1: % still has null created_by', t;
    end if;
  end loop;
end $$;

-- 3. Policies -----------------------------------------------------------------------------------------------
-- transactions
drop policy if exists "members read household transactions" on public.transactions;
drop policy if exists "members insert household transactions" on public.transactions;
drop policy if exists "members update household transactions" on public.transactions;
create policy "read own or shared transactions" on public.transactions for select to authenticated
  using (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())));
create policy "insert own transactions" on public.transactions for insert to authenticated
  with check (household_id in (select public.user_household_ids()) and created_by = (select auth.uid()));
create policy "update own or shared transactions" on public.transactions for update to authenticated
  using (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())))
  with check (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())));

-- accounts. is_shared is client-writable (the creator sets "Joint account"); plan 08-05 adds the creator-only flip guard.
drop policy if exists "members read household accounts" on public.accounts;
drop policy if exists "members insert household accounts" on public.accounts;
drop policy if exists "members update household accounts" on public.accounts;
create policy "read own or shared accounts" on public.accounts for select to authenticated
  using (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())));
create policy "insert own accounts" on public.accounts for insert to authenticated
  with check (household_id in (select public.user_household_ids()) and created_by = (select auth.uid()));
create policy "update own or shared accounts" on public.accounts for update to authenticated
  using (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())))
  with check (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())));
grant insert (is_shared), update (is_shared) on public.accounts to authenticated;

-- recurring_series: the table has only a select policy today (writes go through security-definer RPCs and have no
-- client grant), so only the select policy is replaced. created_by already defaults to auth.uid().
drop policy if exists "members read household series" on public.recurring_series;
create policy "read own or shared series" on public.recurring_series for select to authenticated
  using (household_id in (select public.user_household_ids()) and (is_shared or created_by = (select auth.uid())));

-- debts, recurring_dismissals, income_payer_prompts: creator only
drop policy if exists "household debts" on public.debts;
create policy "own debts" on public.debts for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

drop policy if exists "household dismissals" on public.recurring_dismissals;
create policy "own dismissals" on public.recurring_dismissals for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

drop policy if exists "household payer prompts" on public.income_payer_prompts;
create policy "own payer prompts" on public.income_payer_prompts for all to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));

-- statement_periods follow their card account (D-43); only the card's creator imports statements.
drop policy if exists "household reads statement periods" on public.statement_periods;
drop policy if exists "household inserts statement periods" on public.statement_periods;
create policy "read statement periods of visible accounts" on public.statement_periods for select to authenticated
  using (household_id in (select public.user_household_ids())
    and exists (select 1 from public.accounts a
      where a.id = statement_periods.account_id and (a.is_shared or a.created_by = (select auth.uid()))));
create policy "insert statement periods of own accounts" on public.statement_periods for insert to authenticated
  with check (household_id in (select public.user_household_ids())
    and exists (select 1 from public.accounts a
      where a.id = statement_periods.account_id and a.created_by = (select auth.uid())));

-- 4. Views --------------------------------------------------------------------------------------------------
-- `select *` freezes its column list at creation: re-create so is_shared and paid_by are selectable. Definition,
-- security_invoker and grants are those of 20261106000400.
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- statement_periods_live reads statement_periods, whose columns did not change: it inherits the new
-- statement_periods policy through security_invoker, so it is not re-created.

comment on column public.transactions.is_shared is 'D-13: personal unless shared. Only the creator flips it, through share_transaction/make_line_private (plan 08-10).';
