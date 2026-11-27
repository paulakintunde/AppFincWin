-- 10-30 (ALR-01/ALR-06; device check step 9): a large-transaction threshold set in one currency never fired for a line
-- whose stamped amounts are all in other currencies. Seen live: a partner's shared CAD line in a CAD household against a
-- USD threshold; alerts_pick_amount found no USD amount, returned null, and the alert was skipped with no trace.
-- Same arguments, so alerts_on_transaction is unchanged: when no stamped amount is already in the threshold's
-- currency, the original amount is converted at the stored EUR-based rates (per_eur_rate: nearest rate, provisional is
-- fine for a threshold check), rounded by convert_minor like every other conversion. Custom currencies are not resolved
-- here (no owner in scope); with no rate the result stays null and nothing is raised, as before.
-- Was immutable sql; now stable (it reads fx_rates).
create or replace function public.alerts_pick_amount(p_cur text, o_cur text, o_amt bigint, h_cur text, h_amt bigint, hh_cur text, hh_amt bigint)
returns bigint
language plpgsql
stable
set search_path = ''
as $$
declare
  f record;
  t record;
begin
  if p_cur = h_cur and h_amt is not null then return h_amt; end if;
  if p_cur = hh_cur and hh_amt is not null then return hh_amt; end if;
  if p_cur = o_cur then return o_amt; end if;
  if p_cur is null or o_cur is null or o_amt is null then return null; end if;
  select * into f from public.per_eur_rate(o_cur, current_date, null);
  select * into t from public.per_eur_rate(p_cur, current_date, null);
  if f.rate is null or t.rate is null then return null; end if;
  return public.convert_minor(o_amt, f.rate, public.currency_exponent(o_cur, null), t.rate, public.currency_exponent(p_cur, null));
end;
$$;
revoke execute on function public.alerts_pick_amount(text, text, bigint, text, bigint, text, bigint) from public, anon, authenticated;
