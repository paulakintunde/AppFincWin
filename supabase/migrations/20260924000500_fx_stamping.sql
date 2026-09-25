-- FX rate stamping: the server is the authority on FX (MON-05, MON-13,
-- D-02, D-03, D-04, D-05, D-07, D-16, D-17).
--
-- Every function here mirrors src/engine/money exactly; the shared fixture
-- proves it (supabase/tests/database/07_money_rounding_mirror.test.sql,
-- generated from supabase/tests/fixtures/money-conversion-cases.json).
-- All functions pin `search_path = ''` and fully qualify every reference.
--
-- stamp_fx_rate() (a BEFORE INSERT OR UPDATE trigger on transactions) fills
-- rate, orig_per_eur, home_per_eur, rate_date, rate_source and home_amount
-- from the project's own fx_rates (or a custom currency's declared rate),
-- using the rate for the transaction's local_date or the nearest earlier
-- publication (D-02). home_currency is stamped once at insert from the
-- author's profile and never changes afterwards (D-05). Editing local_date
-- or original_currency re-rates the row; an amount-only edit keeps the
-- stored rates and only recomputes home_amount (D-04). A date with no
-- stored rate within 7 days before it is stamped rate_pending = true with a
-- provisional value from the nearest later rate (D-03, D-17) -- the trigger
-- never blocks on an HTTP fetch; the resolve-rate Edge Function (plan
-- 01-11) backfills fx_rates and calls restamp_transaction below. Custom
-- currencies (D-07) convert through their user-declared reference currency
-- and unit value, with rate_source 'custom'.
--
-- restamp_transaction() is the service-role-only path used after backfill.
-- It sets the transaction-local GUC fincwin.system_restamp = 'on', which
-- both stamp_fx_rate() (to force a re-rate) and bump_version() (to avoid
-- counting a system restamp as a user edit) read, and
-- fincwin.restamp_relax_quotes to the quotes the backfill actually stored:
-- only those legs may accept a rate older than 7 days (WR-B01). A client
-- cannot set a GUC through PostgREST table writes, so this cannot be
-- spoofed from the outside.
--
-- A transaction dated more than one day after the server's current_date
-- (one day of slack covers every time zone ahead of UTC) is never stamped
-- exact: its own day's rate does not exist yet, so it stays rate_pending
-- until fx_restamp_pending() (20260924000700_fx_monitor_jobs.sql, run
-- daily by fx-monitor) re-stamps it after its day arrives. local_date must
-- fall between 1900-01-01 and one year after current_date.

-- 1. Pure functions mirroring engine/money/rounding.ts and rates.ts.
-- `div()` on numeric truncates toward zero, and both operands here are
-- always non-negative, so it is floor -- matching BigInt division in the
-- TS mirror. `power(10::numeric, n)` returns numeric; never use the caret
-- exponent operator (double precision) or a bare Postgres rounding call,
-- which rounds half-to-even on ties rather than half-up-away-from-zero
-- (D-21).

create or replace function public.div_half_up(num numeric, den numeric)
returns bigint
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
begin
  if den <= 0 then
    raise exception 'div_half_up: denominator must be positive' using errcode = '22012';
  end if;
  return (sign(num) * div(2 * abs(num) + den, 2 * den))::bigint;
end
$$;

create or replace function public.convert_minor(amount bigint, from_per_eur numeric, from_exp int, to_per_eur numeric, to_exp int)
returns bigint
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select public.div_half_up(
    amount::numeric * (to_per_eur * 10000000000) * power(10::numeric, to_exp),
    (from_per_eur * 10000000000) * power(10::numeric, from_exp))
$$;

create or replace function public.cross_rate(from_per_eur numeric, to_per_eur numeric)
returns numeric(24,10)
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select (public.div_half_up((to_per_eur * 10000000000) * 10000000000, from_per_eur * 10000000000)::numeric / 10000000000)::numeric(24,10)
$$;

create or replace function public.custom_per_eur(reference_per_eur numeric, unit_value numeric)
returns numeric(24,10)
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select (public.div_half_up((reference_per_eur * 10000000000) * 10000000000, unit_value * 10000000000)::numeric / 10000000000)::numeric(24,10)
$$;

-- 2. Currency exponent (MON-13). Keep in lockstep with
-- src/engine/money/currencyExponents.ts; 07_money_rounding_mirror asserts
-- every fixture exponent against this function. A custom currency's own
-- declared decimals (D-07) take priority over the ISO table when p_owner
-- has one registered under p_code.
create or replace function public.currency_exponent(p_code text, p_owner uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  custom_decimals smallint;
begin
  if p_owner is not null then
    select c.decimals into custom_decimals
      from public.custom_currencies c
     where c.owner_id = p_owner and c.code = p_code;
    if custom_decimals is not null then
      return custom_decimals;
    end if;
  end if;

  return case p_code
    when 'BIF' then 0 when 'CLP' then 0 when 'DJF' then 0 when 'GNF' then 0
    when 'ISK' then 0 when 'JPY' then 0 when 'KMF' then 0 when 'KRW' then 0
    when 'PYG' then 0 when 'RWF' then 0 when 'UGX' then 0 when 'UYI' then 0
    when 'VND' then 0 when 'VUV' then 0 when 'XAF' then 0 when 'XOF' then 0
    when 'XPF' then 0
    when 'BHD' then 3 when 'IQD' then 3 when 'JOD' then 3 when 'KWD' then 3
    when 'LYD' then 3 when 'OMR' then 3 when 'TND' then 3
    when 'CLF' then 4 when 'UYW' then 4
    else 2
  end;
end;
$$;

-- 3. per_eur_rate: the one place that reads fx_rates/custom_currencies for
-- a rate. Never reads fx_rate_holds (a separate table, plan 01-08) -- a
-- held rate can never be served (D-11).
--
-- p_code = 'EUR' -> rate 1, exact.
-- a custom currency owned by p_owner -> recurse through its ISO reference
--   currency, then apply custom_per_eur and the custom rate_source (D-07).
-- otherwise ISO: nearest earlier fx_rates row within the 7-day exact
--   window (D-02), frankfurter-v2 preferred over a same-date duplicate;
--   else the nearest later row as a provisional value (D-17, exact=false);
--   else, only when this quote's window was not already relaxed, the
--   nearest earlier row beyond the 7-day window (also provisional); else
--   nulls.
-- p_relax_quotes (set only through restamp_transaction) lists the quotes
-- the resolve-rate backfill just stored for this transaction's date. For
-- those quotes alone the earlier-rate window widens past 7 days, since a
-- Frankfurter historical backfill returns the last publication on or
-- before the needed date regardless of age. Any other quote keeps the
-- 7-day window (WR-B01).
create or replace function public.per_eur_rate(
  p_code text,
  p_on date,
  p_owner uuid,
  p_relax_quotes text[] default null,
  out rate numeric,
  out rate_date date,
  out source text,
  out exact boolean
)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.custom_currencies%rowtype;
  ref record;
  relax boolean := p_code = any(coalesce(p_relax_quotes, '{}'::text[]));
begin
  exact := false;

  if p_code = 'EUR' then
    rate := 1; rate_date := p_on; source := null; exact := true;
    return;
  end if;

  select * into c from public.custom_currencies where owner_id = p_owner and code = p_code;
  if found then
    select * into ref from public.per_eur_rate(c.reference_currency, p_on, p_owner, p_relax_quotes);
    if ref.rate is null then
      rate := null; rate_date := null; source := null; exact := false;
      return;
    end if;
    rate := public.custom_per_eur(ref.rate, c.unit_value);
    rate_date := least(ref.rate_date, c.as_of);
    source := 'custom';
    exact := ref.exact;
    return;
  end if;

  -- Nearest earlier row within the exact window (D-02).
  select r.rate, r.rate_date, r.source into rate, rate_date, source
    from public.fx_rates r
   where r.base = 'EUR' and r.quote = p_code and r.rate_date <= p_on
     and (relax or r.rate_date >= p_on - 7)
   order by r.rate_date desc, (r.source = 'frankfurter-v2') desc
   limit 1;
  if found then
    exact := true;
    return;
  end if;

  -- Nearest later row: provisional, D-17.
  select r.rate, r.rate_date, r.source into rate, rate_date, source
    from public.fx_rates r
   where r.base = 'EUR' and r.quote = p_code and r.rate_date > p_on
   order by r.rate_date asc, (r.source = 'frankfurter-v2') desc
   limit 1;
  if found then
    exact := false;
    return;
  end if;

  -- Fallback: an older-than-7-days earlier row, only when this call did
  -- not already relax the window itself.
  if not relax then
    select r.rate, r.rate_date, r.source into rate, rate_date, source
      from public.fx_rates r
     where r.base = 'EUR' and r.quote = p_code and r.rate_date <= p_on
     order by r.rate_date desc, (r.source = 'frankfurter-v2') desc
     limit 1;
    if found then
      exact := false;
      return;
    end if;
  end if;

  rate := null; rate_date := null; source := null; exact := false;
  return;
end;
$$;

-- 4. bump_version(): a system restamp (service_role only, via
-- restamp_transaction) does not count as a user edit, so an edit queued
-- offline against version 1 still applies after a background restamp
-- (D-18 groundwork). Only restamp_transaction ever sets this
-- transaction-local GUC; a client cannot set a GUC through PostgREST table
-- writes.
create or replace function public.bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('fincwin.system_restamp', true), '') = 'on' then
    new.updated_at := now();
    return new;
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end;
$$;

-- 5. stamp_fx_rate(): the BEFORE INSERT OR UPDATE trigger on transactions.
-- security definer so it can read the author's profile and custom
-- currencies even when another household member edits (Phase 8).
create or replace function public.stamp_fx_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  o record;
  h record;
  system_restamp boolean := coalesce(current_setting('fincwin.system_restamp', true), '') = 'on';
  relax_quotes text[] := case when coalesce(current_setting('fincwin.system_restamp', true), '') = 'on'
    then string_to_array(nullif(coalesce(current_setting('fincwin.restamp_relax_quotes', true), ''), ''), ',')
    end;
  owner uuid;
  needs_rerate boolean;
  o_exp int;
  h_exp int;
begin
  owner := coalesce(new.created_by, (select auth.uid()));

  -- WR-B01: a plausible calendar date. One year ahead covers planned
  -- entries; 1900 only rules out typos, since same-currency rows need no
  -- rate at all.
  if (tg_op = 'INSERT' or new.local_date is distinct from old.local_date)
     and (new.local_date < date '1900-01-01' or new.local_date > current_date + 366) then
    raise exception 'local_date % is out of range', new.local_date using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    select p.home_currency into new.home_currency from public.profiles p where p.id = owner;
    if new.home_currency is null then
      raise exception 'no profile for transaction author' using errcode = '23502';
    end if;
  else
    new.home_currency := old.home_currency; -- D-05: fixed at write time, never changes
  end if;

  needs_rerate := tg_op = 'INSERT'
    or new.local_date is distinct from old.local_date
    or new.original_currency is distinct from old.original_currency
    or old.rate_pending
    or system_restamp;

  if needs_rerate then
    if new.original_currency = new.home_currency then
      new.rate := 1;
      new.orig_per_eur := null;
      new.home_per_eur := null;
      new.rate_date := new.local_date;
      new.rate_source := 'same-currency';
      new.rate_pending := false;
      new.home_amount := new.original_amount;
      return new;
    end if;

    select * into o from public.per_eur_rate(new.original_currency, new.local_date, owner, relax_quotes);
    select * into h from public.per_eur_rate(new.home_currency, new.local_date, owner, relax_quotes);

    if o.rate is null or h.rate is null then
      new.rate := null;
      new.orig_per_eur := null;
      new.home_per_eur := null;
      new.rate_date := null;
      new.rate_source := null;
      new.home_amount := null;
      new.rate_pending := true;
      return new;
    end if;

    o_exp := public.currency_exponent(new.original_currency, owner);
    h_exp := public.currency_exponent(new.home_currency, owner);

    new.orig_per_eur := o.rate;
    new.home_per_eur := h.rate;
    new.rate := public.cross_rate(o.rate, h.rate);
    new.rate_date := least(o.rate_date, h.rate_date);
    -- Attribution must never be lost (MON-12): open-er-api beats custom
    -- beats the frankfurter-v2 default whenever either leg used it. EUR's
    -- own leg contributes a null source, so an `in (...)` check would be
    -- unsafe against null -- write it as explicit equality checks instead.
    new.rate_source := case
      when o.source = 'open-er-api' or h.source = 'open-er-api' then 'open-er-api'
      when o.source = 'custom' or h.source = 'custom' then 'custom'
      else 'frankfurter-v2'
    end;
    -- A row dated after tomorrow (server time) is never exact: its own
    -- day's rate cannot exist yet (WR-B01).
    new.rate_pending := not (o.exact and h.exact) or new.local_date > current_date + 1;
    new.home_amount := public.convert_minor(new.original_amount, o.rate, o_exp, h.rate, h_exp);
  else
    -- Amount-only or note/account edit: keep every stamp column (D-04).
    new.rate := old.rate;
    new.orig_per_eur := old.orig_per_eur;
    new.home_per_eur := old.home_per_eur;
    new.rate_date := old.rate_date;
    new.rate_source := old.rate_source;
    new.rate_pending := old.rate_pending;

    if new.original_amount is distinct from old.original_amount then
      if old.rate_source = 'same-currency' then
        new.home_amount := new.original_amount;
      else
        new.home_amount := public.convert_minor(
          new.original_amount,
          old.orig_per_eur,
          public.currency_exponent(new.original_currency, owner),
          old.home_per_eur,
          public.currency_exponent(new.home_currency, owner)
        );
      end if;
    else
      new.home_amount := old.home_amount;
    end if;
  end if;

  return new;
end;
$$;

create trigger stamp_fx_rate before insert or update on public.transactions
  for each row execute function public.stamp_fx_rate();

revoke execute on function public.stamp_fx_rate() from public, anon, authenticated;

-- 6. restamp_transaction(): called only by the resolve-rate Edge Function
-- (plan 01-11) after it has verified household membership with the
-- caller's JWT and backfilled fx_rates. p_relax_quotes names the quotes
-- that backfill actually stored; for those legs alone the row accepts the
-- backfilled rate even though it may be older than 7 days (Frankfurter
-- returns the last publication on or before the date). Every other leg
-- keeps the 7-day window (WR-B01). Guarded to only touch rows that are
-- actually still rate_pending, and does not bump version (see
-- bump_version() above).
create or replace function public.restamp_transaction(p_id uuid, p_relax_quotes text[] default null)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.transactions;
begin
  perform set_config('fincwin.system_restamp', 'on', true);
  perform set_config('fincwin.restamp_relax_quotes', coalesce(array_to_string(p_relax_quotes, ','), ''), true);
  update public.transactions set updated_at = now() where id = p_id and rate_pending returning * into r;
  perform set_config('fincwin.system_restamp', '', true);
  perform set_config('fincwin.restamp_relax_quotes', '', true);
  if r.id is null then
    select * into r from public.transactions where id = p_id;
  end if;
  return r;
end;
$$;

revoke execute on function public.restamp_transaction(uuid, text[]) from public, anon, authenticated;
grant execute on function public.restamp_transaction(uuid, text[]) to service_role;

-- 7. Grants. The pure maths functions (div_half_up, convert_minor,
-- cross_rate, custom_per_eur) take no user data and stay callable by
-- authenticated and service_role. The lookups that take an owner UUID
-- (currency_exponent, per_eur_rate) are SECURITY DEFINER and would let any
-- signed-in user read another user's custom currency (decimals, unit value,
-- reference) past the owner-only RLS on custom_currencies (CR-B03). Only
-- the definer triggers call them, so they are service_role-only. The
-- trigger functions themselves (stamp_fx_rate, bump_version) are never
-- called directly by any role -- they only fire via the triggers above.
revoke execute on function public.div_half_up(numeric, numeric) from public, anon;
grant execute on function public.div_half_up(numeric, numeric) to authenticated, service_role;

revoke execute on function public.convert_minor(bigint, numeric, int, numeric, int) from public, anon;
grant execute on function public.convert_minor(bigint, numeric, int, numeric, int) to authenticated, service_role;

revoke execute on function public.cross_rate(numeric, numeric) from public, anon;
grant execute on function public.cross_rate(numeric, numeric) to authenticated, service_role;

revoke execute on function public.custom_per_eur(numeric, numeric) from public, anon;
grant execute on function public.custom_per_eur(numeric, numeric) to authenticated, service_role;

revoke execute on function public.currency_exponent(text, uuid) from public, anon, authenticated;
grant execute on function public.currency_exponent(text, uuid) to service_role;

revoke execute on function public.per_eur_rate(text, date, uuid, text[]) from public, anon, authenticated;
grant execute on function public.per_eur_rate(text, date, uuid, text[]) to service_role;
