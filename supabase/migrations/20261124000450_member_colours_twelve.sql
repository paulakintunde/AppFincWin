-- Phase 9 (09-26): 12 member colours for Extended (D-06, D-10; owner exception 2026-11-19) and leave/remove while locked
-- (D-03 spirit, Phase 8 D-25/D-26). Newest bodies of assign_member_defaults, set_my_member_display, leave_household and
-- remove_member now live here. Needs 20261124000200 (fincwin.plan_bypass contract).

-- 1. colour_key range 0..11 (was 0..5). The old check is found by lookup, not by name. household_former_members has no range check.
do $$
declare
  c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.household_members'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%colour_key%' loop
    execute format('alter table public.household_members drop constraint %I', c);
  end loop;
end
$$;
alter table public.household_members add constraint household_members_colour_key_check check (colour_key between 0 and 11);

-- 2. New members get the lowest free colour of 12; the owner's label is fixed. household_full when none is free (D-10).
create or replace function public.assign_member_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.colour_key is null then
    select g into new.colour_key from generate_series(0, 11) g
      where not exists (select 1 from public.household_members m
        where m.household_id = new.household_id and m.colour_key = g)
      order by g limit 1;
    if new.colour_key is null then
      raise exception 'household_full' using errcode = '23514';
    end if;
  end if;
  if new.is_owner then
    new.role_label := 'Owner';
  end if;
  return new;
end;
$$;
revoke execute on function public.assign_member_defaults() from public, anon, authenticated;

-- 3. set_my_member_display accepts 0..11.
create or replace function public.set_my_member_display(p_expected_version int, p_colour_key smallint, p_name_hidden boolean, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  m public.household_members%rowtype;
  nm text := nullif(btrim(p_display_name), '');
begin
  select * into m from public.household_members where user_id = uid order by created_at limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if m.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', m.version, 'updated_by', m.updated_by);
  end if;
  if p_display_name is not null and (nm is null or char_length(nm) > 60) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if p_colour_key is null or p_colour_key not between 0 and 11 then
    return jsonb_build_object('ok', false, 'reason', 'colour_taken');
  end if;
  if exists (select 1 from public.household_members x
             where x.household_id = m.household_id and x.colour_key = p_colour_key and x.user_id <> uid) then
    return jsonb_build_object('ok', false, 'reason', 'colour_taken');
  end if;
  update public.household_members
    set colour_key = p_colour_key, name_hidden = coalesce(p_name_hidden, name_hidden),
        display_name = coalesce(nm, display_name)
    where household_id = m.household_id and user_id = uid;
  return jsonb_build_object('ok', true, 'version', m.version + 1);
end;
$$;
revoke execute on function public.set_my_member_display(int, smallint, boolean, text) from public, anon;
grant execute on function public.set_my_member_display(int, smallint, boolean, text) to authenticated;

-- 4. leave_household keeps working while the household is locked.
create or replace function public.leave_household(p_new_owner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_owner boolean;
  v_n integer;
  v_bal jsonb;
  v_dep uuid;
  v_new uuid;
begin
  select m.household_id, m.is_owner into hid, v_owner
    from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  perform 1 from public.households h where h.id = hid for update;
  select count(*) into v_n from public.household_members where household_id = hid;
  if v_n < 2 then return jsonb_build_object('ok', false, 'reason', 'alone'); end if;
  if v_owner then
    if p_new_owner is null then return jsonb_build_object('ok', false, 'reason', 'pick_new_owner'); end if;
    if p_new_owner = uid or not exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p_new_owner) then
      return jsonb_build_object('ok', false, 'reason', 'not_member');
    end if;
  end if;
  -- waiting settle-ups end now, so their lines count in the balance the warning shows (owner answer 10)
  -- D-03 / owner 2026-11-19: leaving keeps working while the household is locked
  perform set_config('fincwin.plan_bypass', 'on', true);
  perform public.hh_cancel_pending_settlements(hid, uid, 'left');
  -- the warning (D-25): signed, positive = the caller owes that person
  select coalesce(jsonb_agg(jsonb_build_object('other_id', m.user_id, 'amount', n.amt) order by m.created_at), '[]'::jsonb) into v_bal
    from public.household_members m
    cross join lateral (select public.hh_pair_net(hid, uid, m.user_id) as amt) n
   where m.household_id = hid and m.user_id <> uid and n.amt <> 0;
  if v_owner then
    perform public.hh_transfer_owner(hid, uid, p_new_owner, null);
  end if;
  v_dep := public.hh_depart(uid, hid, 'left', uid);
  select d.new_household_id into v_new from public.member_departures d where d.id = v_dep;
  perform set_config('fincwin.plan_bypass', 'off', true);
  return jsonb_build_object('ok', true, 'new_household_id', v_new, 'open_balances', v_bal);
end;
$$;

-- 5. remove_member keeps working while the household is locked.
create or replace function public.remove_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_dep uuid;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if p_user is null or p_user = uid
     or not exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  perform 1 from public.households h where h.id = hid for update;
  -- D-03 / owner 2026-11-19: removing keeps working while the household is locked
  perform set_config('fincwin.plan_bypass', 'on', true);
  v_dep := public.hh_depart(p_user, hid, 'removed', uid);
  perform set_config('fincwin.plan_bypass', 'off', true);
  return jsonb_build_object('ok', true, 'departure_id', v_dep);
end;
$$;

-- 6. Grants, as in 20261122000800 (create or replace keeps them; stated again on purpose). Never to anon.
revoke execute on function public.leave_household(uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;
revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;
