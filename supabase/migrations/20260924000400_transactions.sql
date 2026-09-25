-- Transactions (MON-08, MON-09, MON-14, D-16, D-26).
--
-- The full money shape for a single transaction row: signed minor-unit
-- amount in its original currency, plus the columns a future server-side
-- stamping trigger (plan 01-05) fills in -- home_currency conversion,
-- the cross-rate, its EUR-based components and its publication date/source.
-- Every one of those stamp columns is server-only (D-16): the insert/update
-- column grants below exclude them entirely, so a client payload naming one
-- fails with 42501 before any trigger runs. Until 01-05 lands, rate_pending
-- defaults to true, which is an honest state -- an unstamped row really is
-- pending, not silently wrong.
--
-- local_date/time_zone (MON-14) are the user's own calendar date and IANA
-- zone, never derived from created_at -- a transaction happens on a day,
-- not a timestamp, and late-evening entries must not drift into the wrong
-- month or across a clock change.
--
-- Version-conditional updates (D-18) are expressed by the client as
-- `update ... where id = $1 and version = $2`; zero rows affected means
-- conflict or not found.

create table public.transactions (
  id uuid primary key,                                                 -- client-generated (MON-08)
  household_id uuid not null references public.households(id) on delete cascade,
  account_id uuid not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  original_amount bigint not null check (original_amount <> 0 and abs(original_amount) <= 10000000000000), -- signed minor units, outflow negative
  original_currency text not null check (original_currency ~ '^[A-Z0-9]{2,4}$'),
  home_currency text not null default 'USD' check (home_currency ~ '^[A-Z0-9]{2,4}$'), -- overwritten by the server stamp (01-05); fixed at insert (D-05)
  home_amount bigint check (home_amount is null or abs(home_amount) <= 9007199254740991),
  rate numeric(24,10) check (rate is null or rate > 0),               -- display cross rate: home units per 1 original unit
  orig_per_eur numeric(24,10) check (orig_per_eur is null or orig_per_eur > 0), -- D-05: stored EUR base for post-switch re-conversion
  home_per_eur numeric(24,10) check (home_per_eur is null or home_per_eur > 0),
  orig_exp smallint check (orig_exp is null or orig_exp between 0 and 4), -- WR-B08: minor-unit exponents stamped at write time, so an edit never
  home_exp smallint check (home_exp is null or home_exp between 0 and 4), -- re-derives them from a custom definition that may since be gone
  rate_date date,                                                     -- MON-07: publication date of the rate used
  rate_source text check (rate_source is null or rate_source in ('same-currency', 'frankfurter-v2', 'open-er-api', 'custom')),
  rate_pending boolean not null default true,                         -- true until the server stamp (01-05) finds an exact rate (D-17)
  local_date date not null,                                           -- MON-14: the user's calendar date, never derived from created_at
  time_zone text not null check (char_length(time_zone) between 1 and 64), -- MON-14: IANA zone, e.g. America/Vancouver
  note text check (note is null or char_length(note) <= 500),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_account_same_household foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete restrict,
  constraint transactions_stamp_complete check (
    rate_pending or (home_amount is not null and rate is not null and rate_date is not null and rate_source is not null)
  )
);
create index transactions_household_date_idx on public.transactions (household_id, local_date desc);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_created_by_idx on public.transactions (created_by);
create index transactions_rate_pending_idx on public.transactions (created_at) where rate_pending;
create trigger set_version before update on public.transactions for each row execute function public.bump_version();

create or replace function public.guard_transaction_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_known_currency(new.original_currency, coalesce(new.created_by, (select auth.uid()))) then
    raise exception 'unknown currency %', new.original_currency using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_transaction_currency
  before insert or update of original_currency on public.transactions
  for each row execute function public.guard_transaction_currency();

-- MON-14 / IN-B04: time_zone must be a real IANA zone name the database
-- knows (e.g. America/Vancouver, UTC), not any 1-64 character string. Only
-- checked when the zone is written, so the pg_timezone_names lookup never
-- runs on amount or note edits.
create or replace function public.guard_transaction_time_zone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- null is left to the column's not-null constraint (23502).
  if new.time_zone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'unknown time zone %', new.time_zone using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger guard_transaction_time_zone
  before insert or update of time_zone on public.transactions
  for each row execute function public.guard_transaction_time_zone();

revoke execute on function public.guard_transaction_time_zone() from public, anon, authenticated;

alter table public.transactions enable row level security;

create policy "members read household transactions" on public.transactions for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "members insert household transactions" on public.transactions for insert to authenticated
  with check (household_id in (select public.user_household_ids()) and created_by = (select auth.uid()));
create policy "members update household transactions" on public.transactions for update to authenticated
  using (household_id in (select public.user_household_ids()))
  with check (household_id in (select public.user_household_ids()));

revoke all on public.transactions from anon;
revoke insert, update, delete, truncate on public.transactions from authenticated;
grant select on public.transactions to authenticated;
grant insert (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, note) on public.transactions to authenticated;
grant update (account_id, original_amount, original_currency, local_date, time_zone, note) on public.transactions to authenticated;
-- Every stamp column (rate, rate_date, rate_source, home_amount,
-- home_currency, orig_per_eur, home_per_eur, orig_exp, home_exp,
-- rate_pending) is server-only
-- (D-16); a client payload naming one fails with 42501 before any trigger
-- runs.
