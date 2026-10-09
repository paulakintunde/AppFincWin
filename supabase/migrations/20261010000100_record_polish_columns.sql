-- Phase 2.2 record polish. Every change here is additive (Phase 1 D-26/D-27,
-- FND-10): new defaulted or nullable columns, one re-created view, two
-- guard triggers and one new owner-only table. Nothing is dropped, retyped
-- or narrowed.
--
-- Cites CONTEXT D-02, D-03, D-09, D-10, D-16, D-18, D-23, D-24 and the
-- 2026-10-09 user decision that the activity horizon is per household
-- (households.horizon_month), not per user.

-- 1. Columns.
alter table public.transactions
  add column is_refund boolean not null default false,
  add column is_automatic boolean not null default false,
  add column is_sample boolean not null default false;
-- D-03: a refund is money back in and never a transfer leg.
alter table public.transactions
  add constraint transactions_refund_shape
  check (not is_refund or (original_amount > 0 and transfer_id is null));

alter table public.recurring_series
  add column is_automatic boolean not null default false,
  add column is_sample boolean not null default false;

alter table public.accounts
  add column deleted_at timestamptz,
  add column is_sample boolean not null default false;

alter table public.categories
  add column monthly_cap bigint check (monthly_cap is null or monthly_cap between 1 and 10000000000000),
  add column is_sample boolean not null default false;
alter table public.categories
  add constraint categories_cap_not_system check (monthly_cap is null or not is_system);

alter table public.profiles
  add column week_start smallint check (week_start is null or week_start in (0, 1)),
  add column sample_prompt_answered_at timestamptz;

alter table public.households
  add column horizon_month text check (horizon_month is null or horizon_month ~ '^\d{4}-(0[1-9]|1[0-2])$');

-- 2. Partial indexes so Start fresh finds sample rows cheaply.
create index transactions_sample_idx on public.transactions (household_id) where is_sample;
create index accounts_sample_idx on public.accounts (household_id) where is_sample;
create index recurring_series_sample_idx on public.recurring_series (household_id) where is_sample;
create index categories_sample_idx on public.categories (owner_id) where is_sample;

-- 3. transactions_active selects * and so froze its column list at creation
-- (RESEARCH Pitfall 1). Re-create it so the new columns are selectable, and
-- re-issue its D-WR-07 grants.
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;

revoke all on public.transactions_active from anon, public;
-- D-WR-07: Supabase's default privileges grant authenticated every table
-- privilege on a new relation, views included. Revoke them so the view is
-- never a write path; writes go to public.transactions.
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- 4. Additive grants. is_sample and horizon_month deliberately get NO client
-- grant: they are written only by the 2.2 security-definer RPCs, so a client
-- payload naming them fails 42501 (D-09 tamper rule).
grant insert (is_refund, is_automatic) on public.transactions to authenticated;
grant update (is_refund, is_automatic) on public.transactions to authenticated;
grant update (deleted_at) on public.accounts to authenticated;
grant insert (monthly_cap) on public.categories to authenticated;
grant update (monthly_cap) on public.categories to authenticated;
grant update (week_start, sample_prompt_answered_at) on public.profiles to authenticated;

-- 5. Editing a sample row clears its flag server-side (D-10). Soft-delete,
-- restore, version/updated_* bookkeeping and system writes under
-- fincwin.system_restamp keep it, so Start fresh can still hard-delete a
-- soft-deleted sample line. Undoing an edit does not restore the flag (a
-- documented consequence of D-10).
create or replace function public.clear_sample_on_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not old.is_sample or coalesce(current_setting('fincwin.system_restamp', true), '') = 'on' then
    return new;
  end if;
  if (to_jsonb(new) - array['deleted_at','version','updated_at','updated_by','is_sample','materialised_through','generation'])
     is distinct from
     (to_jsonb(old) - array['deleted_at','version','updated_at','updated_by','is_sample','materialised_through','generation']) then
    new.is_sample := false;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_sample_on_edit() from public, anon, authenticated;

create trigger clear_sample_on_edit before update on public.transactions
  for each row execute function public.clear_sample_on_edit();
create trigger clear_sample_on_edit before update on public.accounts
  for each row execute function public.clear_sample_on_edit();
create trigger clear_sample_on_edit before update on public.categories
  for each row execute function public.clear_sample_on_edit();
create trigger clear_sample_on_edit before update on public.recurring_series
  for each row execute function public.clear_sample_on_edit();

-- 6. An account can only be soft-deleted with no live lines and no active
-- series pointing at it (D-24), enforced server-side.
create or replace function public.guard_account_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null and (
    exists (select 1 from public.transactions t
            where t.account_id = new.id and t.deleted_at is null)
    or exists (select 1 from public.recurring_series s
               where s.account_id = new.id and s.deleted_at is null
                 and (s.end_date is null or s.end_date >= current_date))
  ) then
    raise exception 'account % still has live lines or an active series', new.id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_account_soft_delete() from public, anon, authenticated;

create trigger guard_account_soft_delete before update of deleted_at on public.accounts
  for each row execute function public.guard_account_soft_delete();

-- 7. "Not now" on a detected-series offer persists across devices (D-18).
-- The cascade on auth.users keeps 36_account_deletion green (GDPR erasure).
create table public.dismissed_series_offers (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  offer_key text not null check (char_length(offer_key) between 1 and 300),
  created_at timestamptz not null default now(),
  primary key (owner_id, offer_key)
);

alter table public.dismissed_series_offers enable row level security;

create policy "owner reads own dismissed offers" on public.dismissed_series_offers
  for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own dismissed offers" on public.dismissed_series_offers
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

revoke all on public.dismissed_series_offers from anon;
revoke insert, update, delete, truncate on public.dismissed_series_offers from authenticated;
grant select on public.dismissed_series_offers to authenticated;
grant insert (offer_key) on public.dismissed_series_offers to authenticated;
