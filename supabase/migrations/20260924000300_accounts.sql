-- Accounts (MON-08, MON-09, D-26).
--
-- A household-scoped money account. The id is client-generated with no
-- server default (MON-08) -- the optimistic local row is the final row,
-- there is no server-id swap to reconcile. version is server-incremented
-- via the existing bump_version() trigger (MON-09). currency is fixed at
-- creation (checked against is_known_currency() at insert time) and is not
-- in the update grant -- changing an account's currency after transactions
-- exist against it is a data-integrity question for a later phase, not this
-- one. Archival is soft (archived_at); there is no delete policy in Phase 1.

create table public.accounts (
  id uuid primary key,                                                 -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'cash' check (kind in ('cash', 'checking', 'savings', 'credit', 'investment', 'loan', 'other')),
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  opening_balance bigint not null default 0 check (abs(opening_balance) <= 10000000000000), -- minor units (MON-01); bound mirrors MAX_ABS_AMOUNT_MINOR
  archived_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, household_id)                                           -- target of the transactions composite FK
);
create index accounts_household_id_idx on public.accounts (household_id);
create trigger set_version before update on public.accounts for each row execute function public.bump_version();

create or replace function public.guard_account_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_known_currency(new.currency, coalesce(new.created_by, (select auth.uid()))) then
    raise exception 'unknown currency %', new.currency using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_account_currency
  before insert on public.accounts
  for each row execute function public.guard_account_currency();

alter table public.accounts enable row level security;

create policy "members read household accounts" on public.accounts for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "members insert household accounts" on public.accounts for insert to authenticated
  with check (household_id in (select public.user_household_ids()) and created_by = (select auth.uid()));
create policy "members update household accounts" on public.accounts for update to authenticated
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

revoke all on public.accounts from anon;
revoke insert, update, delete, truncate on public.accounts from authenticated;
grant select on public.accounts to authenticated;
grant insert (id, household_id, name, kind, currency, opening_balance) on public.accounts to authenticated;
grant update (name, kind, opening_balance, archived_at) on public.accounts to authenticated; -- currency is fixed at creation
