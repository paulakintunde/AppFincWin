-- Phase 2.2: read RPCs behind Account detail (ACT-17, D-26) and the running
-- balance (ACT-06, D-25), plus the atomic home-currency change that also
-- converts category caps (REC-25, D-22, Confirmed Decision 11).
--
-- The two read RPCs are security invoker: RLS on transactions_active is the
-- only access control (T-02-09-08 precedent). Sums are returned as text so
-- minor units never pass through a JS double.
-- change_home_currency is security definer but acts only on auth.uid()'s own
-- profile and categories. Cap conversion reuses convert_minor/div_half_up so
-- the rounding is never written twice (money mirror test).

create or replace function public.account_pending_split(p_household_id uuid)
returns table (account_id uuid, currency text, pending_in text, pending_out text, pending_count integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.account_id,
         t.original_currency,
         coalesce(sum(t.original_amount) filter (where t.original_amount > 0), 0)::text,
         coalesce(sum(t.original_amount) filter (where t.original_amount < 0), 0)::text,
         count(*)::integer
    from public.transactions_active t
   where t.household_id = p_household_id
     and t.status = 'pending'
   group by t.account_id, t.original_currency
$$;

create or replace function public.account_paid_before(p_household_id uuid, p_before date)
returns table (account_id uuid, currency text, paid_sum text, paid_home_sum text, unconverted integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.account_id,
         t.original_currency,
         coalesce(sum(t.original_amount), 0)::text,
         coalesce(sum(t.home_amount), 0)::text,
         (count(*) filter (where t.home_amount is null))::integer
    from public.transactions_active t
   where t.household_id = p_household_id
     and t.status = 'paid'
     and t.local_date < p_before
   group by t.account_id, t.original_currency
$$;

create or replace function public.change_home_currency(p_new text, p_from text, p_today date)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_current text;
  v_has_caps boolean;
  v_from record;
  v_to record;
  v_from_exp int;
  v_to_exp int;
  v_n integer := 0;
  v_to_date date;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_today is null or abs(p_today - current_date) > 2 then
    raise exception 'rate date out of range' using errcode = '22023';
  end if;

  select home_currency into v_current from public.profiles where id = v_user for update;
  if v_current is distinct from p_from then
    raise exception 'home currency changed elsewhere' using errcode = '40001';
  end if;
  if p_new = p_from then
    return jsonb_build_object('status', 'unchanged', 'caps_converted', 0);
  end if;

  select exists (select 1 from public.categories c where c.owner_id = v_user and c.monthly_cap is not null)
    into v_has_caps;

  if v_has_caps then
    select * into v_from from public.per_eur_rate(p_from, p_today, v_user);
    select * into v_to from public.per_eur_rate(p_new, p_today, v_user);
    if v_from.rate is null or v_to.rate is null
       or v_from.rate_date < p_today - 7 or v_to.rate_date < p_today - 7 then
      raise exception 'rates unavailable' using errcode = 'P0001', hint = 'rates-unavailable';
    end if;
    v_from_exp := public.currency_exponent(p_from, v_user);
    v_to_exp := public.currency_exponent(p_new, v_user);
    v_to_date := v_to.rate_date;

    perform set_config('fincwin.system_restamp', 'on', true);
    update public.categories c
       set monthly_cap = least(
             10000000000000::bigint,
             greatest(
               power(10::numeric, v_to_exp)::bigint,
               (public.div_half_up(
                  public.convert_minor(c.monthly_cap, v_from.rate, v_from_exp, v_to.rate, v_to_exp)::numeric,
                  power(10::numeric, v_to_exp)) * power(10::numeric, v_to_exp))::bigint))
     where c.owner_id = v_user and c.monthly_cap is not null;
    get diagnostics v_n = row_count;
    perform set_config('fincwin.system_restamp', 'off', true);
  end if;

  -- validate_home_currency raises 23514 for an unknown code, rolling back the caps.
  update public.profiles set home_currency = p_new where id = v_user;

  return jsonb_build_object('status', 'applied', 'caps_converted', v_n, 'rate_date', v_to_date);
end
$$;

revoke execute on function public.account_pending_split(uuid) from public, anon;
revoke execute on function public.account_paid_before(uuid, date) from public, anon;
revoke execute on function public.change_home_currency(text, text, date) from public, anon;
grant execute on function public.account_pending_split(uuid) to authenticated;
grant execute on function public.account_paid_before(uuid, date) to authenticated;
grant execute on function public.change_home_currency(text, text, date) to authenticated;
