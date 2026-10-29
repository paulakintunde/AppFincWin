-- 05.2 review CR-03 (server half): a home-currency switch must not leave Decide money figures reading as the new currency.
-- change_home_currency (20261010000400) gains two statements, in the same transaction as the switch:
--   1. decide_settings rows with a null currency and any money column set are stamped with p_from (the old home), so the
--      client read guard can treat them as the old currency after the switch.
--   2. the caller's live expected_income and held_bridge answers are soft-deleted. They are cleared, not converted:
--      decide_answers has no currency column (D-59: asked again when the figure behind it changes).
-- Behaviour addition only, no drop. Signature, grants, envelope, cap conversion and errors are unchanged.
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

  update public.decide_settings
     set currency = p_from
   where user_id = v_user
     and currency is null
     and (reserve is not null or investing_floor is not null or saving_floor is not null
          or rough_income is not null or rough_spending is not null or rough_saving is not null
          or rough_debt is not null or rough_invest is not null or steady_amount is not null
          or everyday_override is not null or unspent_anchor is not null or reserve_goal is not null
          or unexplained_amount is not null);

  update public.decide_answers
     set deleted_at = now()
   where created_by = v_user
     and deleted_at is null
     and kind in ('expected_income', 'held_bridge');

  -- validate_home_currency raises 23514 for an unknown code, rolling back the caps and the two updates above.
  update public.profiles set home_currency = p_new where id = v_user;

  return jsonb_build_object('status', 'applied', 'caps_converted', v_n, 'rate_date', v_to_date);
end
$$;

revoke execute on function public.change_home_currency(text, text, date) from public, anon;
grant execute on function public.change_home_currency(text, text, date) to authenticated;
