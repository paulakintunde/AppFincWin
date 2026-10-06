-- Recurring series: table, RLS, guards, and the SQL mirror of the schedule
-- maths (D-02, D-04, D-07, D-08, D-09).
--
-- A recurring series is a first-class household-scoped entity holding a
-- template (amount, currency, account, category, name, payment type, sign
-- via the signed amount) and a schedule (anchor date, freq, optional end
-- date/occurrence count). Rows are never written directly by clients --
-- every write goes through the security-definer RPCs in
-- 20260926000400_recurring_materialisation.sql, so this table has no
-- insert/update/delete policy at all, only select.
--
-- recurring_occurrence_date()/recurring_horizon() are the plpgsql mirror of
-- src/engine/recurring/schedule.ts's occurrenceDate()/materialisationHorizon(),
-- proven to agree via the shared fixture
-- supabase/tests/fixtures/recurring-schedule-cases.json (generated into
-- 27_recurring_schedule_mirror.test.sql by scripts/gen-recurring-mirror-test.mjs),
-- exactly the way 07_money_rounding_mirror.test.sql proves engine/money and
-- stamp_fx_rate() agree.

-- 1. Table.
create table public.recurring_series (
  id uuid primary key,                                                 -- client-generated (MON-08 pattern)
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  account_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  amount bigint not null check (amount <> 0 and abs(amount) <= 10000000000000), -- signed minor units, mirrors transactions.original_amount
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  category_id uuid references public.categories(id) on delete set null,
  payment_type text check (payment_type is null or payment_type in (
    'card', 'bank_transfer', 'direct_debit', 'standing_order', 'cash',
    'direct_deposit', 'invoice', 'transfer', 'card_payout'
  )),
  freq text not null check (freq in ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly')),
  anchor_date date not null,
  time_zone text not null check (char_length(time_zone) between 1 and 64),
  end_date date,
  occurrence_count integer check (occurrence_count is null or occurrence_count between 1 and 1000),
  materialised_through date,                                           -- the materialiser's high-water mark; never rewinds except via edit-from
  generation integer not null default 0,                               -- D-CR-01: bumped (without a version bump) each time the materialiser adds rows
  deleted_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recurring_series_end_after_anchor check (end_date is null or end_date >= anchor_date),
  constraint recurring_series_account_same_household foreign key (account_id, household_id)
    references public.accounts (id, household_id) on delete restrict
);
create index recurring_series_household_id_idx on public.recurring_series (household_id);

-- 2. Triggers: version bump, updated_by stamping (set_updated_by is defined
-- in 20260926000100_categories.sql, earlier in this wave), and a defensive
-- guard validating currency/time zone/category ownership on every write and
-- pinning household_id/created_by on update. Trigger firing order is
-- alphabetical by name, so guard_recurring_series (g) runs before
-- set_updated_by/set_version (s), validating before any bookkeeping trigger
-- touches the row.
create trigger set_version before update on public.recurring_series
  for each row execute function public.bump_version();
create trigger set_updated_by before update on public.recurring_series
  for each row execute function public.set_updated_by();

create or replace function public.guard_recurring_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_known_currency(new.currency, coalesce(new.created_by, (select auth.uid()))) then
    raise exception 'unknown currency %', new.currency using errcode = '23514';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'unknown time zone %', new.time_zone using errcode = '23514';
  end if;
  if new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and (c.owner_id = (select auth.uid()) or c.owner_id = new.created_by)
  ) then
    raise exception 'unknown category' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    new.household_id := old.household_id;
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_recurring_series() from public, anon, authenticated;

create trigger guard_recurring_series
  before insert or update on public.recurring_series
  for each row execute function public.guard_recurring_series();

-- 3. RLS: members read household series (D-02); no insert/update/delete
-- policy at all -- every write goes through the definer RPCs in
-- 20260926000400_recurring_materialisation.sql, which enforce membership
-- themselves before touching a row.
alter table public.recurring_series enable row level security;

create policy "members read household series" on public.recurring_series for select to authenticated
  using (household_id in (select public.user_household_ids()));

revoke all on public.recurring_series from anon;
revoke insert, update, delete, truncate on public.recurring_series from authenticated;
grant select on public.recurring_series to authenticated;

-- 4. Transaction linkage. recurring_series_id, occurrence_date and status
-- already exist on transactions (20260926000200_transactions_record_fields.sql);
-- this migration adds the FK now that recurring_series exists, plus the
-- partial unique index the materialiser's `on conflict` relies on (Pitfall
-- 3: two write paths -- user-triggered regeneration and the daily cron --
-- can both target the same (series, date) pair) and the two shape checks
-- (D-08: an occurrence always carries both series id and date together; a
-- skipped row must belong to a series).
alter table public.transactions
  add constraint transactions_recurring_series_fk foreign key (recurring_series_id)
    references public.recurring_series(id) on delete restrict;

create unique index transactions_series_occurrence_uidx
  on public.transactions (recurring_series_id, occurrence_date)
  where recurring_series_id is not null and deleted_at is null;

alter table public.transactions
  add constraint transactions_series_pair check ((recurring_series_id is null) = (occurrence_date is null));

alter table public.transactions
  add constraint transactions_skipped_needs_series check (status <> 'skipped' or recurring_series_id is not null);

-- 5. Pure SQL mirror of src/engine/recurring/schedule.ts's occurrenceDate()/
-- materialisationHorizon() (D-04). Immutable/strict/parallel safe: no
-- table access, deterministic for a given input, safe to run in a parallel
-- worker. p_n must be a non-negative integer computed directly from the
-- anchor (never by stepping from the previous occurrence), exactly as the
-- TS engine does, so month-end clamping never drifts across calls.
create or replace function public.recurring_occurrence_date(p_anchor date, p_freq text, p_n integer)
returns date
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
begin
  if p_n < 0 then
    raise exception 'recurring_occurrence_date: n must be >= 0, got %', p_n using errcode = '22023';
  end if;
  case p_freq
    when 'weekly' then
      return p_anchor + 7 * p_n;
    when 'fortnightly' then
      return p_anchor + 14 * p_n;
    when 'monthly' then
      return (p_anchor + make_interval(months => p_n))::date;
    when 'quarterly' then
      return (p_anchor + make_interval(months => 3 * p_n))::date;
    when 'yearly' then
      return (p_anchor + make_interval(years => p_n))::date;
    else
      raise exception 'recurring_occurrence_date: unknown freq %', p_freq using errcode = '22023';
  end case;
end;
$$;

revoke execute on function public.recurring_occurrence_date(date, text, integer) from public;
grant execute on function public.recurring_occurrence_date(date, text, integer) to authenticated, service_role;

-- The last day of the month after `p_today`'s month (D-03): the current and
-- next month always hold real materialised rows.
create or replace function public.recurring_horizon(p_today date)
returns date
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select (date_trunc('month', p_today) + interval '2 months' - interval '1 day')::date;
$$;

revoke execute on function public.recurring_horizon(date) from public;
grant execute on function public.recurring_horizon(date) to authenticated, service_role;
