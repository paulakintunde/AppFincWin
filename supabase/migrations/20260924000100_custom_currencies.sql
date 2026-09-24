-- Custom currencies (MON-04, MON-13, D-07).
--
-- A user may declare a currency the app's own FX store (fx_rates, EUR-based,
-- ~171 ISO currencies from Frankfurter v2) does not carry -- a loyalty
-- point, a household unit, a currency the operator hasn't synced. The user
-- picks its code, symbol, decimal places and what one unit is worth in an
-- ISO reference currency the user also picks (not hard-pinned to USD as in
-- the prototype). Code and decimals are immutable once created, because
-- changing decimals would reinterpret every minor-unit amount already
-- stored against this currency (D-07). Custom currencies are exempt from
-- staleness alerts and plausibility holds -- there is no feed to check them
-- against; `as_of` is a hand-set publication-style date, shown the way
-- MON-07 shows fx_rates' rate_date.

create table public.custom_currencies (
  id uuid primary key,                                   -- client-generated (MON-08); no default on purpose
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9]{2,4}$'),
  symbol text not null check (char_length(symbol) between 1 and 4),
  decimals smallint not null check (decimals between 0 and 4),          -- MON-13: custom declares its own
  reference_currency char(3) not null check (reference_currency ~ '^[A-Z]{3}$'), -- D-07: user-chosen, not pinned to USD
  unit_value numeric(24,10) not null check (unit_value > 0),            -- one custom unit is worth this many reference units
  as_of date not null default current_date,                              -- D-07: shown like a publication date
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, code)
);
create index custom_currencies_owner_id_idx on public.custom_currencies (owner_id);
create trigger set_version before update on public.custom_currencies for each row execute function public.bump_version();

-- Currency-knowledge helpers, reused by money_prefs, accounts and
-- transactions (Task 2) to validate any currency code a client supplies.
create or replace function public.is_iso_currency(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_code = 'EUR' or exists (select 1 from public.fx_rates r where r.quote = p_code)
$$;

create or replace function public.is_known_currency(p_code text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_iso_currency(p_code)
    or exists (select 1 from public.custom_currencies c where c.owner_id = p_user and c.code = p_code)
$$;

revoke execute on function public.is_iso_currency(text) from public, anon;
grant execute on function public.is_iso_currency(text) to authenticated, service_role;
revoke execute on function public.is_known_currency(text, uuid) from public, anon;
grant execute on function public.is_known_currency(text, uuid) to authenticated, service_role;

-- Guard trigger: a custom code cannot shadow an ISO code, the reference
-- currency must itself be a real ISO currency, and code/decimals are
-- immutable once set (D-07).
create or replace function public.guard_custom_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_iso_currency(new.code) then
      raise exception 'custom currency % shadows an ISO currency', new.code using errcode = '23514';
    end if;
    if not public.is_iso_currency(new.reference_currency) then
      raise exception 'reference currency % is not a known ISO currency', new.reference_currency using errcode = '23514';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.code is distinct from old.code or new.decimals is distinct from old.decimals then
      raise exception 'code and decimals are immutable' using errcode = '23514';
    end if;
    if new.reference_currency is distinct from old.reference_currency and not public.is_iso_currency(new.reference_currency) then
      raise exception 'reference currency % is not a known ISO currency', new.reference_currency using errcode = '23514';
    end if;
    new.owner_id := old.owner_id;
  end if;
  return new;
end;
$$;

create trigger guard_custom_currency
  before insert or update on public.custom_currencies
  for each row execute function public.guard_custom_currency();

-- RLS: strictly owner-only (D-07 "stored per user"). No delete policy --
-- transactions keep the code; deletion arrives with account-deletion work.
alter table public.custom_currencies enable row level security;

create policy "owner reads own custom currencies" on public.custom_currencies for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "owner inserts own custom currencies" on public.custom_currencies for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "owner updates own custom currencies" on public.custom_currencies for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

revoke all on public.custom_currencies from anon;
revoke insert, update, delete, truncate on public.custom_currencies from authenticated;
grant select on public.custom_currencies to authenticated;
grant insert (id, code, symbol, decimals, reference_currency, unit_value, as_of) on public.custom_currencies to authenticated;
grant update (symbol, reference_currency, unit_value, as_of) on public.custom_currencies to authenticated;
