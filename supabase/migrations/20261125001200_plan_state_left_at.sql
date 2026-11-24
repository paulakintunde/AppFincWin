-- quick 261124-2bs: plan_state() also returns left_at and left_home_name (closes 09-HUMAN-UAT C2 row 1).
-- Needs 20261124000100_plans_core.sql (plan_state, household_leave_log) and 20261124000300_plans_seats_invites.sql (hh_depart log write).
-- Additive: same signature, security definer, search_path and grants; two new jsonb keys.

create or replace function public.plan_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  r public.household_plans%rowtype;
  have boolean;
  payer_nm text;
  v_left timestamptz;
  v_left_hid uuid;
  v_left_name text;
begin
  select household_id into hid from public.household_members where user_id = uid order by created_at limit 1;
  select * into r from public.household_plans where household_id = hid;
  have := found;
  -- left_at / left_home_name (quick 261124-2bs, UAT C2-1). Returned only when the caller is alone AND their current
  -- household exists because of that leave: hh_depart writes the leave-log row and the new household of one in the same
  -- transaction, so the household's created_at is not before the leave's left_at. A Duo payer who never invited anyone
  -- has no such row (null), and an old leave that came before an unrelated household does not count.
  -- The log is the caller's own (user_id = uid); the table stays closed to clients.
  if (select count(*) from public.household_members where household_id = hid) = 1 then
    select l.left_at, l.household_id into v_left, v_left_hid
      from public.household_leave_log l
      join public.households h on h.id = hid
     where l.user_id = uid and l.household_id <> hid and h.created_at >= l.left_at
     order by l.left_at desc limit 1;
    if v_left_hid is not null then
      select name into v_left_name from public.households where id = v_left_hid;
    end if;
  end if;
  if have and r.payer_id is not null then
    select case when m.name_hidden then null else m.display_name end into payer_nm
      from public.household_members m where m.household_id = hid and m.user_id = r.payer_id;
  end if;
  return jsonb_build_object(
    'household_id', hid,
    'state', public.household_plan_state(hid),
    'plan_key', case when have then r.plan_key end,
    'plan_size', case when have then r.plan_size end,
    'period', case when have then r.period end,
    'payer_id', case when have then r.payer_id end,
    'payer_is_me', have and r.payer_id is not distinct from uid,
    'payer_name', payer_nm,
    'store', case when have then r.store end,
    'product_id', case when have then r.product_id end,
    'environment', case when have then r.environment end,
    'will_renew', case when have then r.will_renew end,
    'covered_until', case when have then r.covered_until end,
    'store_expires_at', case when have then r.store_expires_at end,
    'grace_until', case when have then r.grace_until end,
    'trial_ends_at', case when have then r.trial_ends_at end,
    'promo_kind', case when have then r.promo_kind end,
    'trial_available', public.plan_trial_available(uid, hid),
    'members', (select count(*) from public.household_members where household_id = hid),
    'seats', public.household_seats(hid),
    'writable', public.household_writable(hid),
    'billing_issue_at', case when have then r.billing_issue_at end,
    'last_synced_at', case when have then r.last_synced_at end,
    'left_at', v_left,
    'left_home_name', v_left_name);
end;
$$;
revoke execute on function public.plan_state() from public, anon;
grant execute on function public.plan_state() to authenticated;
