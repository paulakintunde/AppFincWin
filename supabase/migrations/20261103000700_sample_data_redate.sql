-- 05.4 M8 (APP-15): keep the sample (demo, review) household current. When the newest sample transaction is in an earlier
-- month than p_today, clear the sample rows and seed them again for p_today. Security invoker: RLS and the household
-- membership rule still apply. Rows the user made themselves are not sample rows and are never touched (clear_sample_data keeps them).
create or replace function public.redate_sample_data_if_stale(p_household_id uuid, p_today date)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_newest date;
begin
  if p_household_id is null or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;
  if p_today is null then
    raise exception 'p_today is required' using errcode = '22023';
  end if;

  select max(t.local_date) into v_newest
    from public.transactions t
   where t.household_id = p_household_id and t.is_sample;

  if v_newest is null or date_trunc('month', v_newest) >= date_trunc('month', p_today) then
    return false;
  end if;

  perform public.clear_sample_data(p_household_id);
  perform public.seed_sample_data(p_household_id, p_today);
  return true;
end;
$$;
revoke execute on function public.redate_sample_data_if_stale(uuid, date) from public, anon;
grant execute on function public.redate_sample_data_if_stale(uuid, date) to authenticated;
