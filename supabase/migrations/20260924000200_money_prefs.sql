-- Money preferences on profiles and households (MON-04, D-01, D-06, D-25).
--
-- home_currency drives personal totals and must be a known currency (an
-- fx_rates quote, EUR, or the user's own custom currency, via
-- is_known_currency() from 20260924000100_custom_currencies.sql).
-- show_cents and lead_figure are pure display preferences (D-25, D-01);
-- engine/ never reads them -- the formatter takes them as parameters.
--
-- The 'USD' default on both new columns is a placeholder until onboarding
-- (Phase 9) asks; the client may set home_currency from the device region
-- earlier than that.

alter table public.profiles
  add column home_currency text not null default 'USD' check (home_currency ~ '^[A-Z0-9]{2,4}$'),
  add column show_cents boolean not null default false,                       -- D-25
  add column lead_figure text not null default 'home' check (lead_figure in ('home', 'original')); -- D-01: display preference only

alter table public.households
  add column reporting_currency text not null default 'USD' check (reporting_currency ~ '^[A-Z0-9]{2,4}$'); -- D-06

-- Extends, not replaces, the profiles column grant from
-- 20260922000100_household_of_one.sql -- that earlier grant stays in force.
grant update (home_currency, show_cents, lead_figure) on public.profiles to authenticated;

-- home_currency must resolve through is_known_currency() -- an ISO code the
-- fx store carries, EUR, or one of the user's own custom currencies.
create or replace function public.validate_home_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.home_currency is distinct from old.home_currency and not public.is_known_currency(new.home_currency, new.id) then
    raise exception 'unknown home currency %', new.home_currency using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger validate_home_currency
  before update of home_currency on public.profiles
  for each row execute function public.validate_home_currency();

-- D-06: in a household of one, reporting_currency stays equal to the
-- owner's home_currency. A multi-member household keeps its own value --
-- this sync only fires while the household has exactly one member.
create or replace function public.sync_reporting_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.households h
     set reporting_currency = new.home_currency
   where h.owner_id = new.id
     and (select count(*) from public.household_members m where m.household_id = h.id) = 1;
  return new;
end;
$$;

create trigger sync_reporting_currency
  after update of home_currency on public.profiles
  for each row execute function public.sync_reporting_currency();

revoke execute on function public.validate_home_currency() from public, anon, authenticated;
revoke execute on function public.sync_reporting_currency() from public, anon, authenticated;
