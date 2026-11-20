-- Phase 9 (09-04): D-10 seats, D-21 approval, D-39 switch rule, D-41/D-42 departures. Newest bodies of create_invite,
-- restore_invite, preview_invite, redeem_invite, reinvite_removed, hh_depart (and hh_before_user_delete) now live here.
-- Needs 20261124000100_plans_core.sql (household_seats, household_plan_state, plan_join_requests, household_leave_log).

-- 1. New notice kinds -------------------------------------------------------------------------------------------
do $$
declare
  c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.household_events'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%kind%' loop
    execute format('alter table public.household_events drop constraint %I', c);
  end loop;
end
$$;
alter table public.household_events add constraint household_events_kind_check check (kind in (
  'joined','left','removed','departure_undone','made_private','split_changed','weights_changed','default_changed',
  'category_default_changed','settle_request','settle_reminder','settle_lapsed','settle_not_yet','settled','settle_undone',
  'settle_cancelled','settle_departed','settle_ask','written_off','owner_changed','renamed','currency_changed',
  'plan_approval_needed','plan_payer_left','plan_takeover','plan_grace','plan_locked','plan_downgrade_offer',
  'plan_recovered_after_takeover','plan_double_cover'));

-- 2. A notice written by the plan machinery (no acting person) ---------------------------------------------------
create or replace function public.plan_event_notice(p_household uuid, p_kind text, p_subject uuid, p_ref uuid, p_audience uuid[], p_params jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_events (household_id, kind, actor_id, subject_id, ref_id, audience, params)
  values (p_household, p_kind, null, p_subject, p_ref, p_audience, coalesce(p_params, '{}'::jsonb));
end;
$$;
revoke execute on function public.plan_event_notice(uuid, text, uuid, uuid, uuid[], jsonb) from public, anon, authenticated;

-- 3. D-39: the countries where the once-a-year switch rule does not apply (US, CA, EU/EEA, UK, CH, AU, NZ) --------
-- Apple storefronts report alpha-3, Google alpha-2. Unknown (null) is handled by the caller: no rule (owner answer 6).
create or replace function public.plan_country_rule_free(p_code text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(upper(btrim(p_code)) = any (array[
    'US','CA','AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT',
    'RO','SK','SI','ES','SE','IS','LI','NO','GB','UK','CH','AU','NZ',
    'USA','CAN','AUT','BEL','BGR','HRV','CYP','CZE','DNK','EST','FIN','FRA','DEU','GRC','HUN','IRL','ITA','LVA','LTU','LUX',
    'MLT','NLD','POL','PRT','ROU','SVK','SVN','ESP','SWE','ISL','LIE','NOR','GBR','CHE','AUS','NZL']), false)
$$;
revoke execute on function public.plan_country_rule_free(text) from public, anon, authenticated;

-- The date a person may next join a different household, or null when they may join now. The country is read here and
-- nowhere else; it is never written (T-09-15).
create or replace function public.plan_switch_blocked_until(p_user uuid, p_target uuid, p_country text)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_last timestamptz;
begin
  if p_country is null or btrim(p_country) = '' or public.plan_country_rule_free(p_country) then
    return null;
  end if;
  select max(l.left_at) into v_last
    from public.household_leave_log l
   where l.user_id = p_user and l.reason = 'left' and l.household_id <> p_target
     and l.left_at > now() - interval '12 months'
     and (l.exception_until is null or l.exception_until < now())
     and exists (select 1 from public.households h where h.id = l.household_id)
     and public.household_plan_state(l.household_id) <> 'lapsed';
  if v_last is null then return null; end if;
  return v_last + interval '12 months';
end;
$$;
revoke execute on function public.plan_switch_blocked_until(uuid, uuid, text) from public, anon, authenticated;

-- 4. The join steps of redeem_invite, for any person (redeem_invite itself and plan_admit_waiting) -----------------
create or replace function public.hh_join_member(p_user uuid, p_household uuid, p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.household_invites%rowtype;
  d public.member_departures%rowtype;
  v_old uuid;
  v_old_name text;
  v_hname text;
  v_n integer;
  v_before jsonb;
  v_after jsonb;
begin
  select * into v from public.household_invites i where i.id = p_invite_id and i.household_id = p_household for update;
  if not found or v.used_at is not null or v.cancelled_at is not null or v.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  if v.departure_id is not null then
    select * into d from public.member_departures x where x.id = v.departure_id for update;
    if not found or d.user_id is distinct from p_user or d.household_id <> v.household_id
       or d.restored_at is not null or now() >= d.undo_until then
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
  end if;
  if exists (select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = p_user) then
    return jsonb_build_object('ok', true, 'household_id', v.household_id, 'already_member', true);
  end if;
  select m.household_id, m.display_name into v_old, v_old_name
    from public.household_members m where m.user_id = p_user order by m.created_at limit 1;
  if v_old is not null and (select count(*) from public.household_members where household_id = v_old) > 1 then
    return jsonb_build_object('ok', false, 'reason', 'in_other_household');
  end if;
  select h.name into v_hname from public.households h where h.id = v.household_id;

  select jsonb_object_agg(m.user_id::text, m.weight) into v_before
    from public.household_members m where m.household_id = v.household_id;

  perform set_config('fincwin.plan_bypass', 'on', true);
  if d.id is not null then
    -- reconnect (D-28)
    perform public.hh_reconnect(d.id);
  else
    -- move in. Everything stays personal (D-01). The flag lets the pinned household_id change inside this statement only.
    perform set_config('fincwin.household_rpc', 'on', true);
    if v_old is not null then
      perform public.hh_move_rows(p_user, v_old, v.household_id, true);
      perform public.hh_personalise_category_rules(p_user, v_old);  -- before v_old goes: its shared rules cascade away with it
    end if;
    insert into public.household_members (household_id, user_id, is_owner, weight, display_name, created_at)
      values (v.household_id, p_user, false, 0, v_old_name, clock_timestamp());
    if v_old is not null then
      delete from public.households where id = v_old;  -- the household of one; its membership cascades
    end if;

    -- weights re-split evenly in join order: floor(100/n) each, +1 to the first 100 % n (the engine's evenWeights)
    select count(*) into v_n from public.household_members where household_id = v.household_id;
    update public.household_members m
       set weight = (100 / v_n) + case when o.pos <= (100 % v_n) then 1 else 0 end
      from (select r.user_id, row_number() over (order by r.created_at, r.user_id) as pos
              from public.household_members r where r.household_id = v.household_id) o
     where m.household_id = v.household_id and m.user_id = o.user_id;
  end if;
  select jsonb_object_agg(m.user_id::text, m.weight) into v_after
    from public.household_members m where m.household_id = v.household_id;

  update public.household_invites set used_at = now(), used_by = p_user, code = null where id = v.id;
  perform public.hh_log_attempt(p_user, true);

  if d.id is null then
    perform public.hh_event(v.household_id, 'joined', p_user, v.id, null, '{}'::jsonb);
  end if;
  perform public.hh_event(v.household_id, 'weights_changed', null, v.id, null,
    jsonb_build_object('before', v_before, 'after', v_after));

  perform set_config('fincwin.household_rpc', '', true);
  perform set_config('fincwin.plan_bypass', '', true);
  return jsonb_build_object('ok', true, 'household_id', v.household_id, 'household_name', v_hname);
end;
$$;
revoke execute on function public.hh_join_member(uuid, uuid, uuid) from public, anon, authenticated;

-- 5. redeem_invite: switch rule (D-39), plan seats (D-10) and payer approval (D-21) ---------------------------------
-- Older builds call redeem_invite with p_code only; the replacement keeps p_code first and gives p_store_country a
-- default, so their named-argument call resolves to the new function unchanged.
-- contract-ok: min_version >= 0.2.0
drop function public.redeem_invite(text);
create function public.redeem_invite(p_code text, p_store_country text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
  d public.member_departures%rowtype;
  v_old uuid;
  v_n integer;
  v_block timestamptz;
  v_state text;
  v_need integer;
  v_req uuid;
  v_payer uuid;
begin
  -- (a) per-user rate limit
  if public.hh_rate_limited(uid) then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;
  -- (b) the invite row is locked: two people redeeming one code are serialised, the second sees it used
  select * into v from public.household_invites i
   where i.code_hash = public.hh_code_hash(p_code) and length(public.hh_normalise_code(p_code)) = 12
   for update;
  if not found or v.used_at is not null or v.cancelled_at is not null or v.expires_at <= now() then
    perform public.hh_log_attempt(uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- (b2) a reconnect invite works only for the removed person, once, inside the 24 hours
  if v.departure_id is not null then
    select * into d from public.member_departures x where x.id = v.departure_id for update;
    if not found or d.user_id is distinct from uid or d.household_id <> v.household_id
       or d.restored_at is not null or now() >= d.undo_until then
      perform public.hh_log_attempt(uid, false);
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
  end if;
  -- (c) already in that household: nothing to do
  if exists (select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = uid) then
    return jsonb_build_object('ok', true, 'household_id', v.household_id, 'already_member', true);
  end if;
  -- (d) a household with other members must be left first (D-06); a household of one joins freely (D-01). Not a failed guess.
  select m.household_id into v_old from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_old is not null and (select count(*) from public.household_members where household_id = v_old) > 1 then
    return jsonb_build_object('ok', false, 'reason', 'in_other_household');
  end if;
  -- (e) the seat count: the household row is locked while members are counted (T-09-14)
  perform 1 from public.households h where h.id = v.household_id for update;
  -- (e1) the once-a-year switch rule (D-39); the country is used for this one check and never stored (T-09-15)
  v_block := public.plan_switch_blocked_until(uid, v.household_id, p_store_country);
  if v_block is not null then
    return jsonb_build_object('ok', false, 'reason', 'switch_rule', 'open_from', v_block);
  end if;
  select count(*) into v_n from public.household_members where household_id = v.household_id;
  if v_n >= public.household_seats(v.household_id) then
    v_state := public.household_plan_state(v.household_id);
    if v_state in ('trial', 'active', 'grace') and v_n < 12 then
      -- beyond the plan size: the person waits, the payer is told (D-21, D-17)
      v_need := (select min(s) from unnest(array[2, 6, 12]) s where s >= v_n + 1);
      insert into public.plan_join_requests (household_id, invite_id, user_id, needed_plan_size)
        values (v.household_id, v.id, uid, v_need)
        on conflict (household_id, user_id) where status = 'waiting' do nothing
        returning id into v_req;
      if v_req is not null then
        select p.payer_id into v_payer from public.household_plans p where p.household_id = v.household_id;
        if v_payer is not null then
          perform public.plan_event_notice(v.household_id, 'plan_approval_needed', uid, v_req, array[v_payer],
                                           jsonb_build_object('needed_plan_size', v_need));
        end if;
      else
        select r.id into v_req from public.plan_join_requests r
         where r.household_id = v.household_id and r.user_id = uid and r.status = 'waiting';
      end if;
      return jsonb_build_object('ok', false, 'reason', 'needs_approval', 'request_id', v_req);
    end if;
    return jsonb_build_object('ok', false, 'reason', 'full');
  end if;
  return public.hh_join_member(uid, v.household_id, v.id);
end;
$$;
revoke execute on function public.redeem_invite(text, text) from public, anon;
grant execute on function public.redeem_invite(text, text) to authenticated;

-- 6. Admitting the people who were waiting for a bigger plan (called when the plan size rises) -------------------------
create or replace function public.plan_admit_waiting(p_household uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.plan_join_requests%rowtype;
  v_res jsonb;
  v_admitted integer := 0;
begin
  perform 1 from public.households h where h.id = p_household for update;
  for r in select * from public.plan_join_requests q
            where q.household_id = p_household and q.status = 'waiting' order by q.created_at, q.id loop
    if not exists (select 1 from public.household_invites i
                    where i.id = r.invite_id and i.used_at is null and i.cancelled_at is null and i.expires_at > now()) then
      update public.plan_join_requests set status = 'expired', decided_at = now() where id = r.id;
      continue;
    end if;
    if (select count(*) from public.household_members m where m.household_id = p_household) >= public.household_seats(p_household) then
      exit;
    end if;
    v_res := public.hh_join_member(r.user_id, p_household, r.invite_id);
    if v_res ->> 'ok' = 'true' then
      update public.plan_join_requests set status = 'admitted', decided_at = now() where id = r.id;
      v_admitted := v_admitted + 1;
    else
      update public.plan_join_requests set status = 'expired', decided_at = now() where id = r.id;
    end if;
  end loop;
  return v_admitted;
end;
$$;
revoke execute on function public.plan_admit_waiting(uuid) from public, anon, authenticated;

-- 7. Withdrawing or declining a waiting request: the person or the payer -------------------------------------------------
create or replace function public.cancel_join_request(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  r public.plan_join_requests%rowtype;
begin
  select * into r from public.plan_join_requests q where q.id = p_request for update;
  if not found
     or not (r.user_id = uid
             or exists (select 1 from public.household_plans p where p.household_id = r.household_id and p.payer_id = uid)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if r.status <> 'waiting' then return jsonb_build_object('ok', false, 'reason', 'not_open'); end if;
  update public.plan_join_requests set status = 'cancelled', decided_at = now() where id = r.id;
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.cancel_join_request(uuid) from public, anon;
grant execute on function public.cancel_join_request(uuid) to authenticated;

-- 8. Plan moves when a person leaves, is removed or deletes their account (D-41, D-42, D-21a, D-19) ---------------------
create or replace function public.plan_on_departure(p_user uuid, p_old uuid, p_new uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.household_plans%rowtype;
  have boolean;
  st text;
  v_rest integer;
  v_aud uuid[];
  v_small integer;
  v_until timestamptz := now() + interval '7 days';
begin
  if p_kind in ('left', 'removed') then
    insert into public.household_leave_log (user_id, household_id, reason)
      values (p_user, p_old, case p_kind when 'removed' then 'removed' else 'left' end);
  end if;
  st := public.household_plan_state(p_old);
  select * into r from public.household_plans where household_id = p_old;
  have := found;
  select count(*)::integer, array_agg(m.user_id) into v_rest, v_aud from public.household_members m where m.household_id = p_old;

  if have and r.payer_id = p_user and st in ('trial', 'active', 'grace') then
    -- the payer takes the plan with them; the people left get 7 days of grace (D-42)
    if p_new is not null then
      update public.household_plans set household_id = p_new, updated_at = now(), version = version + 1
       where household_id = p_old;
      insert into public.household_plans (household_id, payer_id, store, plan_size, plan_key, status, covered_until, grace_until, will_renew)
        values (p_old, null, 'NONE', r.plan_size, r.plan_key, 'grace', v_until, v_until, false);
    else
      -- the payer's account is going: the same grace in place, no store link left
      update public.household_plans
         set payer_id = null, store = 'NONE', product_id = null, period = null, original_transaction_id = null,
             store_expires_at = null, billing_issue_at = null, status = 'grace', covered_until = v_until,
             grace_until = v_until, will_renew = false, updated_at = now(), version = version + 1
       where household_id = p_old;
    end if;
    if v_rest > 0 then
      perform public.plan_event_notice(p_old, 'plan_payer_left', p_user, null, v_aud, jsonb_build_object('grace_until', v_until));
    end if;
  elsif have and st in ('trial', 'active', 'grace') and p_new is not null then
    -- a member leaves a covered household: 7 days of full access alone, no new trial (D-41)
    insert into public.household_plans (household_id, payer_id, store, plan_size, status, covered_until, will_renew)
      values (p_new, null, 'NONE', 1, 'left_grace', v_until, false)
      on conflict (household_id) do nothing;
    if st in ('active', 'grace') and r.payer_id is not null and v_rest > 0 then
      select min(s)::integer into v_small from unnest(array[1, 2, 6, 12]) s where s >= v_rest;
      if v_small < r.plan_size then
        perform public.plan_event_notice(p_old, 'plan_downgrade_offer', r.payer_id, null, array[r.payer_id],
                                         jsonb_build_object('plan_size', v_small));
      end if;
    end if;
  elsif have and st = 'promo' and p_new is not null then
    insert into public.household_plans (household_id, payer_id, store, plan_size, status, promo_kind, covered_until, will_renew)
      values (p_new, null, 'PROMOTIONAL', 6, 'promo', r.promo_kind, r.covered_until, false)
      on conflict (household_id) do nothing;
  end if;
end;
$$;
revoke execute on function public.plan_on_departure(uuid, uuid, uuid, text) from public, anon, authenticated;

-- 9. Invite cap from the plan (D-10). Bodies copied from 20261122000500 / 20261122000800, only the cap changed ---------
create or replace function public.create_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_members integer;
  v_open integer;
  v_code text;
  v_id uuid;
  v_exp timestamptz;
  v_limit integer;
begin
  select m.household_id into hid from public.household_members m
   where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  perform 1 from public.households h where h.id = hid for update;
  select count(*) into v_members from public.household_members where household_id = hid;
  select count(*) into v_open from public.household_invites i
   where i.household_id = hid and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  -- D-10: the plan's size, or 12 in total while a paid plan can still grow to take the people waiting (D-21)
  v_limit := case when public.household_plan_state(hid) in ('trial', 'active', 'grace') then 12 else public.household_seats(hid) end;
  if v_members + v_open >= v_limit then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  for attempt in 1..2 loop
    v_code := public.hh_new_invite_code();
    begin
      insert into public.household_invites (household_id, created_by, code_hash, code)
        values (hid, uid, public.hh_code_hash(v_code), v_code)
        returning id, expires_at into v_id, v_exp;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'try_again'); end if;
  return jsonb_build_object('ok', true, 'invite_id', v_id, 'code', public.hh_group_code(v_code), 'expires_at', v_exp);
end;
$$;

create or replace function public.restore_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
  v_members integer;
  v_open integer;
  v_limit integer;
begin
  select * into v from public.household_invites i
   where i.id = p_invite_id and i.created_by = uid and i.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.used_at is not null or v.cancelled_at is null or v.expires_at <= now()
     or v.cancelled_at < now() - interval '24 hours' or v.code is null then
    return jsonb_build_object('ok', false, 'reason', 'not_restorable');
  end if;
  perform 1 from public.households h where h.id = v.household_id for update;
  select count(*) into v_members from public.household_members where household_id = v.household_id;
  select count(*) into v_open from public.household_invites i
   where i.household_id = v.household_id and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  v_limit := case when public.household_plan_state(v.household_id) in ('trial', 'active', 'grace') then 12 else public.household_seats(v.household_id) end;
  if v_members + v_open >= v_limit then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  update public.household_invites set cancelled_at = null where id = v.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.preview_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
  v_members integer;
  v_inviter public.household_members%rowtype;
  v_name text;
  v_mine uuid;
  v_state text;
  v_seats integer;
  v_plan_key text;
begin
  if public.hh_rate_limited(uid) then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;
  select * into v from public.household_invites i
   where i.code_hash = public.hh_code_hash(p_code) and length(public.hh_normalise_code(p_code)) = 12
     and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  if not found then
    perform public.hh_log_attempt(uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select count(*) into v_members from public.household_members where household_id = v.household_id;
  select * into v_inviter from public.household_members m where m.household_id = v.household_id and m.user_id = v.created_by;
  select h.name into v_name from public.households h where h.id = v.household_id;
  select m.household_id into v_mine from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  v_state := public.household_plan_state(v.household_id);
  v_seats := public.household_seats(v.household_id);
  select p.plan_key into v_plan_key from public.household_plans p where p.household_id = v.household_id;
  return jsonb_build_object('ok', true, 'household_name', v_name,
    'inviter_display_name', case when v_inviter.name_hidden then null else v_inviter.display_name end,
    'inviter_colour_key', v_inviter.colour_key, 'member_count', v_members,
    'in_other_household', v_mine is not null and v_mine <> v.household_id
      and (select count(*) from public.household_members where household_id = v_mine) > 1,
    'already_member', exists (select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = uid),
    'full', v_members >= case when v_state in ('trial', 'active', 'grace') then 12 else v_seats end,
    'needs_approval', v_state in ('trial', 'active', 'grace') and v_members >= v_seats and v_members < 12,
    'plan_key', v_plan_key, 'seats', v_seats);
end;
$$;

create or replace function public.reinvite_removed(p_departure_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  d public.member_departures%rowtype;
  v_members integer;
  v_open integer;
  v_code text;
  v_id uuid;
  v_exp timestamptz;
  v_limit integer;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  select * into d from public.member_departures x
   where x.id = p_departure_id and x.household_id = hid and x.kind = 'removed' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if d.restored_at is not null then return jsonb_build_object('ok', false, 'reason', 'already_restored'); end if;
  if now() >= d.undo_until then return jsonb_build_object('ok', false, 'reason', 'window_closed'); end if;
  perform 1 from public.households h where h.id = hid for update;
  -- an earlier invite for the same departure is replaced
  update public.household_invites set cancelled_at = now()
   where departure_id = d.id and used_at is null and cancelled_at is null;
  select count(*) into v_members from public.household_members where household_id = hid;
  select count(*) into v_open from public.household_invites i
   where i.household_id = hid and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  v_limit := case when public.household_plan_state(hid) in ('trial', 'active', 'grace') then 12 else public.household_seats(hid) end;
  if v_members + v_open >= v_limit then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  for attempt in 1..2 loop
    v_code := public.hh_new_invite_code();
    begin
      insert into public.household_invites (household_id, created_by, code_hash, code, expires_at, departure_id)
        values (hid, uid, public.hh_code_hash(v_code), v_code, d.undo_until, d.id)
        returning id, expires_at into v_id, v_exp;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'try_again'); end if;
  return jsonb_build_object('ok', true, 'invite_id', v_id, 'code', public.hh_group_code(v_code), 'expires_at', v_exp);
end;
$$;

-- 10. hh_depart: plan move on leave and removal; D-03 bypass of the lock -----------------------------------------------
create or replace function public.hh_depart(p_user uuid, p_household uuid, p_kind text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mem public.household_members%rowtype;
  v_hh public.households%rowtype;
  v_h2 uuid := gen_random_uuid();
  v_dep uuid := gen_random_uuid();
  v_home text;
  v_first text;
  v_track uuid;
  v_tomb jsonb;
  v_copies uuid[] := '{}';
  v_id uuid;
  l record;
  v_paid_own boolean;
  v_cat uuid;
  v_before jsonb;
  v_after jsonb;
begin
  -- D-03: leaving and removal keep working while the household is locked
  perform set_config('fincwin.plan_bypass', 'on', true);
  set constraints public.transactions_account_same_household, public.recurring_series_account_same_household,
    public.statement_periods_account_same_household deferred;
  perform set_config('fincwin.household_rpc', 'on', true);

  select * into v_mem from public.household_members where household_id = p_household and user_id = p_user for update;
  if not found or v_mem.is_owner then
    raise exception 'hh_depart: the person is not a non-owner member' using errcode = 'HH003';
  end if;
  select * into v_hh from public.households where id = p_household;
  select p.home_currency into v_home from public.profiles p where p.id = p_user;
  v_first := nullif(left(split_part(btrim(coalesce(v_mem.display_name, '')), ' ', 1), 40), '');
  select jsonb_object_agg(m.user_id::text, m.weight) into v_before from public.household_members m where m.household_id = p_household;

  -- a. the new household of one
  insert into public.households (id, owner_id, name, reporting_currency)
    values (v_h2, p_user, coalesce(v_first || '''s household', 'My household'), coalesce(v_home, 'USD'));
  insert into public.household_members (household_id, user_id, is_owner, weight, colour_key, display_name, name_hidden)
    values (v_h2, p_user, true, 100, 0, v_mem.display_name, v_mem.name_hidden);

  -- b. tombstones for personal accounts that carry shared lines
  v_tomb := public.hh_tombstone_accounts(p_user, p_household);

  -- c. personal copies of every shared line the person was on. Paid from their own account: the copy goes on that account with
  -- the FULL original amount and copy_share = their share (their balance stays right). Otherwise it goes on one archived
  -- tracking account with their share in the household currency. A line they paid for others with no share of their own is
  -- copied in full too (copy_share 0), or their account would lose money they really spent.
  for l in select t.*, s.share as my_share, ta.tombstone_of as own_account
             from public.transactions t
             left join public.transaction_splits s on s.transaction_id = t.id and s.member_id = p_user
             left join public.accounts ta on ta.id = t.account_id and ta.tombstone_of is not null and ta.created_by = p_user
            where t.household_id = p_household and t.is_shared and t.deleted_at is null and not t.is_settlement
              and t.status <> 'skipped'
              and (s.id is not null or (coalesce(t.paid_by, t.created_by) = p_user and ta.id is not null))
            order by t.local_date, t.created_at loop
    v_paid_own := coalesce(l.paid_by, l.created_by) = p_user and l.own_account is not null;
    v_cat := coalesce(
      (select c.category_id from public.transaction_member_categories c where c.transaction_id = l.id and c.user_id = p_user),
      (select k.id from public.categories k where k.id = l.category_id and k.owner_id = p_user));
    v_id := gen_random_uuid();
    if v_paid_own then
      insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                       time_zone, name, note, category_id, status, copied_from, copy_share, is_shared)
      values (v_id, v_h2, p_user, l.own_account, l.original_amount, l.original_currency, l.local_date,
              l.time_zone, l.name, l.note, v_cat, l.status, l.id, coalesce(l.my_share, 0), false);
      v_copies := v_copies || v_id;
    elsif coalesce(l.my_share, 0) <> 0 then
      if v_track is null then
        insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, archived_at)
        values (gen_random_uuid(), v_h2, p_user, left(coalesce(v_hh.name, 'Household'), 60), 'other', v_hh.reporting_currency, 0, now())
        returning id into v_track;
      end if;
      insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                       time_zone, name, note, category_id, status, copied_from, is_shared)
      values (v_id, v_h2, p_user, v_track, l.my_share, v_hh.reporting_currency, l.local_date,
              l.time_zone, l.name, l.note, v_cat, l.status, l.id, false);
      v_copies := v_copies || v_id;
    end if;
  end loop;

  -- c2. Personal rows that rest on a joint account cannot move with the person: lines and series are re-pointed to the
  -- tracking account, and links from goals, holdings, debts and Decide's reserve to it are cleared.
  if exists (select 1 from public.transactions t join public.accounts a on a.id = t.account_id
              where t.household_id = p_household and t.created_by = p_user and not t.is_shared and a.is_shared)
     or exists (select 1 from public.recurring_series r join public.accounts a on a.id = r.account_id
                 where r.household_id = p_household and r.created_by = p_user and not r.is_shared and a.is_shared) then
    if v_track is null then
      insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, archived_at)
      values (gen_random_uuid(), v_h2, p_user, left(coalesce(v_hh.name, 'Household'), 60), 'other', v_hh.reporting_currency, 0, now())
      returning id into v_track;
    end if;
    update public.transactions t set account_id = v_track
     where t.household_id = p_household and t.created_by = p_user and not t.is_shared
       and t.account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
    update public.recurring_series r set account_id = v_track
     where r.household_id = p_household and r.created_by = p_user and not r.is_shared
       and r.account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
  end if;
  update public.debts set account_id = null
   where household_id = p_household and created_by = p_user
     and account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
  update public.savings_goals set account_id = null
   where household_id = p_household and created_by = p_user
     and account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
  update public.holdings set account_id = case when account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared) then null else account_id end,
                             paid_from_account_id = case when paid_from_account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared) then null else paid_from_account_id end
   where household_id = p_household and created_by = p_user;
  update public.decide_settings set reserve_account_id = null
   where user_id = p_user and reserve_account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);

  -- c3. shared lines a personal series of the person wrote (joint account lines) stay in the household and let go of the
  -- series, which moves with the person: no line may point across households at a series the person alone can see.
  update public.transactions set recurring_series_id = null, occurrence_date = null
   where household_id = p_household and is_shared
     and recurring_series_id in (select s.id from public.recurring_series s
                                  where s.household_id = p_household and s.created_by = p_user and not s.is_shared);

  -- d. the person's own rows go with them (allow-list only)
  perform public.hh_move_personal_rows(p_user, p_household, v_h2);

  -- e. the former member, the departure record, the membership, the weights, the notices
  insert into public.household_former_members (household_id, user_id, display_name, colour_key, name_hidden, reason)
    values (p_household, p_user, v_mem.display_name, v_mem.colour_key, v_mem.name_hidden,
            case p_kind when 'left' then 'left' else 'removed' end);
  insert into public.member_departures (id, household_id, user_id, actor_id, kind, new_household_id, copy_ids, tombstone_account_ids,
                                        tracking_account_id, prior)
    values (v_dep, p_household, p_user, p_actor, p_kind, v_h2, v_copies,
            (select coalesce(array_agg(x::uuid), '{}') from jsonb_array_elements_text(v_tomb -> 'tombs') x), v_track,
            jsonb_build_object('role_label', v_mem.role_label, 'colour_key', v_mem.colour_key, 'weight', v_mem.weight,
                               'display_name', v_mem.display_name, 'name_hidden', v_mem.name_hidden,
                               'series_ends', v_tomb -> 'series_ends'));
  perform public.hh_cancel_pending_settlements(p_household, p_user, case p_kind when 'left' then 'left' else 'removed' end);
  delete from public.household_members where household_id = p_household and user_id = p_user;
  v_after := public.hh_resplit_weights(p_household);
  perform public.plan_on_departure(p_user, p_household, v_h2, p_kind);
  perform public.hh_event(p_household, case p_kind when 'left' then 'left' else 'removed' end, p_user, v_dep, null,
                          jsonb_build_object('household_name', v_hh.name));
  if v_before - p_user::text is distinct from v_after then
    perform public.hh_event(p_household, 'weights_changed', null, v_dep, null, jsonb_build_object('before', v_before - p_user::text, 'after', v_after));
  end if;
  if p_kind = 'removed' then
    -- "You're no longer in [household]" (D-28): the removed person sees it in their new household
    perform public.hh_event(v_h2, 'removed', p_user, v_dep, array[p_user], jsonb_build_object('household_name', v_hh.name));
  end if;

  perform set_config('fincwin.household_rpc', '', true);
  perform set_config('fincwin.plan_bypass', '', true);
  return v_dep;
end;
$$;

-- 11. Account deletion: a leaving payer's household gets the same 7 days of grace -------------------------------------
create or replace function public.hh_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mem record;
  f record;
  v_next uuid;
  v_key uuid;
  v_n integer;
  v_before jsonb;
  v_after jsonb;
begin
  begin
    perform set_config('fincwin.household_rpc', 'on', true);
    perform set_config('fincwin.plan_bypass', 'on', true);

    -- households this person left earlier: their splits and settle-ups there keep a stable key, their name is erased
    for f in select * from public.household_former_members where user_id = old.id loop
      perform public.hh_cancel_pending_settlements(f.household_id, old.id, 'deleted');
      perform public.hh_stamp_former(f.household_id, old.id, f.former_key);
      update public.household_former_members set display_name = null, reason = 'deleted' where id = f.id;
    end loop;

    -- the household they are in now
    for mem in select * from public.household_members where user_id = old.id loop
      select count(*) into v_n from public.household_members where household_id = mem.household_id;
      if v_n <= 1 then
        -- alone: the whole household goes with them
        delete from public.households where id = mem.household_id;
        continue;
      end if;

      select jsonb_object_agg(m.user_id::text, m.weight) into v_before from public.household_members m where m.household_id = mem.household_id;
      if mem.is_owner then
        -- ownership passes to the member who joined earliest, who is told (D-27)
        select m.user_id into v_next from public.household_members m
         where m.household_id = mem.household_id and m.user_id <> old.id order by m.created_at, m.user_id limit 1;
        perform public.hh_transfer_owner(mem.household_id, old.id, v_next, array[v_next]);
      end if;

      perform public.hh_cancel_pending_settlements(mem.household_id, old.id, 'deleted');
      v_key := gen_random_uuid();
      insert into public.household_former_members (household_id, user_id, former_key, display_name, colour_key, name_hidden, reason)
        values (mem.household_id, old.id, v_key, null, mem.colour_key, mem.name_hidden, 'deleted');
      perform public.hh_stamp_former(mem.household_id, old.id, v_key);
      perform public.hh_tombstone_accounts(old.id, mem.household_id);
      perform public.hh_erase_personal_rows(old.id, mem.household_id);
      delete from public.household_members where household_id = mem.household_id and user_id = old.id;
      v_after := public.hh_resplit_weights(mem.household_id);
      -- D-42: a leaving payer's household gets 7 days of grace and a notice
      perform public.plan_on_departure(old.id, mem.household_id, null, 'deleted');
      perform public.hh_event(mem.household_id, 'left', null, null, null, jsonb_build_object('deleted', true));
      if v_before - old.id::text is distinct from v_after then
        perform public.hh_event(mem.household_id, 'weights_changed', null, null, null,
                                jsonb_build_object('before', v_before - old.id::text, 'after', v_after));
      end if;
    end loop;
    perform set_config('fincwin.household_rpc', '', true);
    perform set_config('fincwin.plan_bypass', '', true);
  exception
    when integrity_constraint_violation then
      raise;
    when others then
      raise warning 'hh_before_user_delete: %, deletion continues', sqlerrm;
  end;
  return old;
end;
$$;
