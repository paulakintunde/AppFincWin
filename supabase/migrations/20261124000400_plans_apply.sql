-- Phase 9 (09-05): D-13 plan_apply, D-16 trial ledger, D-18 sweep, D-19 takeover + double-cover choice (Owner P4 2026-11-19),
-- D-39 leave-log retention. Needs 20261124000100..000300 (household_plans, plan_products, plan_event_notice, plan_admit_waiting).

-- 0. Double-cover columns -------------------------------------------------------------------------------------------
-- Owner P4 2026-11-19: when the old payer's subscription recovers after a takeover, the second live subscription is held
-- here and both payers pick. dc_* always holds the subscription that is NOT covering; dc_new_payer remembers who took
-- over (the 7-day default). The app never ends a store subscription; it only tells the payer who was not picked.
alter table public.household_plans
  add column dc_payer_id uuid references auth.users(id) on delete set null,
  add column dc_store text check (dc_store in ('APP_STORE','PLAY_STORE')),
  add column dc_environment text,
  add column dc_product_id text,
  add column dc_original_transaction_id text,
  add column dc_expires_at timestamptz,
  add column dc_will_renew boolean,
  add column dc_new_payer uuid,
  add column double_cover_since timestamptz,
  add column chosen_payer uuid,
  add column chosen_by text check (chosen_by in ('payer','default','fallback')),
  add column chosen_at timestamptz;

-- 1. Marking webhook rows applied (every return path of plan_apply) -------------------------------------------------
create or replace function public.plan_events_mark_applied(p_app_user_id uuid, p_rc_event_id text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.plan_events
     set applied_at = coalesce(applied_at, now()), note = coalesce(note, p_note)
   where rc_event_id = p_rc_event_id;
  update public.plan_events
     set applied_at = now(), note = coalesce(note, 'superseded')
   where app_user_id = p_app_user_id::text and applied_at is null and rc_event_id <> p_rc_event_id;
end;
$$;
revoke execute on function public.plan_events_mark_applied(uuid, text, text) from public, anon, authenticated;

-- 2. The body: one snapshot becomes one covering row ----------------------------------------------------------------
create or replace function public.plan_apply_inner(p_app_user_id uuid, p_snapshot jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
  r public.household_plans%rowtype;
  p public.plan_products%rowtype;
  v_entitled boolean := coalesce((p_snapshot ->> 'entitled')::boolean, false);
  v_exp timestamptz := nullif(p_snapshot ->> 'expires_at', '')::timestamptz;
  v_bi timestamptz := nullif(p_snapshot ->> 'billing_issue_detected_at', '')::timestamptz;
  v_store_grace timestamptz := nullif(p_snapshot ->> 'grace_period_expires_at', '')::timestamptz;
  v_grace timestamptz;
  v_store text := p_snapshot ->> 'store';
  v_state text;
  v_takeover boolean;
  v_status text;
  v_prev_status text;
begin
  select m.household_id into hid from public.household_members m where m.user_id = p_app_user_id limit 1;
  if hid is null then
    return jsonb_build_object('household_id', null, 'note', 'no_household');
  end if;
  perform 1 from public.households h where h.id = hid for update;
  select * into r from public.household_plans where household_id = hid;
  v_grace := case when v_bi is null then null
                  else greatest(v_bi + interval '7 days', coalesce(v_store_grace, v_bi + interval '7 days')) end;

  -- The non-covering payer of a double cover: never touches the covering columns.
  if r.household_id is not null and r.dc_payer_id = p_app_user_id and r.payer_id is distinct from p_app_user_id then
    if not v_entitled then
      update public.household_plans
         set dc_payer_id = null, dc_store = null, dc_environment = null, dc_product_id = null,
             dc_original_transaction_id = null, dc_expires_at = null, dc_will_renew = null,
             version = version + 1, updated_at = now()
       where household_id = hid;
      return jsonb_build_object('household_id', hid, 'note', 'double_cover_ended');
    elsif r.chosen_payer is null then
      update public.household_plans
         set dc_store = coalesce(v_store, dc_store), dc_environment = coalesce(p_snapshot ->> 'environment', dc_environment),
             dc_product_id = coalesce(p_snapshot ->> 'product_id', dc_product_id),
             dc_original_transaction_id = coalesce(p_snapshot ->> 'original_transaction_id', dc_original_transaction_id),
             dc_expires_at = v_exp, dc_will_renew = (p_snapshot ->> 'unsubscribe_detected_at') is null,
             version = version + 1, updated_at = now()
       where household_id = hid;
      return jsonb_build_object('household_id', hid, 'note', 'double_cover_updated');
    else
      if not exists (select 1 from public.household_events e
                      where e.household_id = hid and e.kind = 'plan_recovered_after_takeover'
                        and e.audience @> array[p_app_user_id] and e.created_at > now() - interval '30 days') then
        perform public.plan_event_notice(hid, 'plan_recovered_after_takeover', p_app_user_id, null, array[p_app_user_id],
          jsonb_build_object('payer', r.chosen_payer, 'chosen_by', r.chosen_by));
      end if;
      update public.household_plans set dc_expires_at = v_exp, updated_at = now() where household_id = hid;
      return jsonb_build_object('household_id', hid, 'note', 'not_chosen');
    end if;
  end if;

  -- Not entitled -------------------------------------------------------------------------------------------------
  if not v_entitled then
    if r.household_id is not null and r.payer_id = p_app_user_id and r.store in ('APP_STORE','PLAY_STORE','PROMOTIONAL') then
      if r.dc_payer_id is not null and r.dc_expires_at > now()
         and exists (select 1 from public.plan_products pp where pp.product_id = r.dc_product_id) then
        -- The covering plan ended while the other is still live: the home switches straight to the other plan.
        update public.household_plans hp
           set payer_id = hp.dc_payer_id, store = hp.dc_store, environment = coalesce(hp.dc_environment, 'PRODUCTION'),
               product_id = hp.dc_product_id,
               plan_key = (select pp.plan_key from public.plan_products pp where pp.product_id = hp.dc_product_id),
               plan_size = (select pp.plan_size from public.plan_products pp where pp.product_id = hp.dc_product_id),
               period = (select pp.period from public.plan_products pp where pp.product_id = hp.dc_product_id),
               original_transaction_id = hp.dc_original_transaction_id,
               store_expires_at = hp.dc_expires_at, covered_until = hp.dc_expires_at,
               status = 'active', billing_issue_at = null, grace_until = null,
               will_renew = coalesce(hp.dc_will_renew, true), trial_started_at = null, trial_ends_at = null,
               dc_payer_id = null, dc_store = null, dc_environment = null, dc_product_id = null,
               dc_original_transaction_id = null, dc_expires_at = null, dc_will_renew = null,
               chosen_payer = hp.dc_payer_id, chosen_by = 'fallback', chosen_at = now(),
               version = hp.version + 1, updated_at = now()
         where hp.household_id = hid;
        return jsonb_build_object('household_id', hid, 'note', 'double_cover_fallback');
      end if;
      if v_grace is not null and now() < v_grace then
        if r.status is distinct from 'grace' then
          perform public.plan_event_notice(hid, 'plan_grace', p_app_user_id, null, null, jsonb_build_object('grace_until', v_grace));
        end if;
        update public.household_plans
           set status = 'grace', grace_until = v_grace, covered_until = v_grace, billing_issue_at = v_bi,
               last_synced_at = now(), version = version + 1, updated_at = now()
         where household_id = hid;
        return jsonb_build_object('household_id', hid, 'note', 'grace');
      end if;
      if not exists (select 1 from public.household_events e
                      where e.household_id = hid and e.kind = 'plan_locked' and e.created_at >= r.updated_at) then
        perform public.plan_event_notice(hid, 'plan_locked', p_app_user_id, null, null, '{}'::jsonb);
      end if;
      update public.household_plans
         set status = 'lapsed', covered_until = least(coalesce(v_exp, now()), now()), will_renew = false,
             last_synced_at = now(), version = version + 1, updated_at = now()
       where household_id = hid;
      return jsonb_build_object('household_id', hid, 'note', 'lapsed');
    end if;
    return jsonb_build_object('household_id', hid, 'note', 'not_entitled');
  end if;

  -- Promotional grant ----------------------------------------------------------------------------------------------
  if v_store = 'PROMOTIONAL' then
    if r.household_id is null or r.status in ('promo','lapsed') or r.store in ('BACKFILL','NONE','PROMOTIONAL') then
      insert into public.household_plans (household_id, payer_id, store, environment, plan_size, status, promo_kind, covered_until,
                                          will_renew, last_synced_at)
      values (hid, p_app_user_id, 'PROMOTIONAL', coalesce(p_snapshot ->> 'environment', 'PRODUCTION'),
              coalesce(r.plan_size, 6), 'promo', coalesce(r.promo_kind, 'tester'), v_exp, false, now())
      on conflict (household_id) do update
        set payer_id = excluded.payer_id, store = 'PROMOTIONAL', status = 'promo', plan_size = excluded.plan_size,
            promo_kind = excluded.promo_kind, covered_until = excluded.covered_until, will_renew = false,
            last_synced_at = now(), updated_at = now(), version = public.household_plans.version + 1;
      return jsonb_build_object('household_id', hid, 'note', 'applied');
    end if;
    return jsonb_build_object('household_id', hid, 'note', 'not_entitled');
  end if;

  -- Store plan ---------------------------------------------------------------------------------------------------
  select * into p from public.plan_products pp where pp.product_id = p_snapshot ->> 'product_id';
  if p.product_id is null then
    return jsonb_build_object('household_id', hid, 'note', 'unknown_product');
  end if;
  v_state := public.household_plan_state(hid);

  if r.household_id is not null and r.payer_id is not null and r.payer_id <> p_app_user_id
     and r.status in ('trial','active') and v_state in ('trial','active') then
    if r.dc_payer_id is null
       and exists (select 1 from public.household_events e
                    where e.household_id = hid and e.kind = 'plan_takeover' and e.created_at > now() - interval '90 days'
                      and e.params ->> 'previous_payer' = p_app_user_id::text) then
      -- D-19, Owner P4: the old payer's plan recovered after a takeover. The takeover plan keeps covering while both pick.
      update public.household_plans
         set dc_payer_id = p_app_user_id, dc_store = v_store, dc_environment = coalesce(p_snapshot ->> 'environment', 'PRODUCTION'),
             dc_product_id = p.product_id, dc_original_transaction_id = p_snapshot ->> 'original_transaction_id',
             dc_expires_at = v_exp, dc_will_renew = (p_snapshot ->> 'unsubscribe_detected_at') is null,
             dc_new_payer = r.payer_id, double_cover_since = now(), chosen_payer = null, chosen_by = null, chosen_at = null,
             version = version + 1, updated_at = now()
       where household_id = hid;
      perform public.plan_event_notice(hid, 'plan_double_cover', p_app_user_id, null, array[r.payer_id, p_app_user_id],
        jsonb_build_object('mode', 'choose', 'new_payer', r.payer_id, 'old_payer', p_app_user_id,
                           'new_plan_key', r.plan_key, 'old_plan_key', p.plan_key, 'choose_by', now() + interval '7 days'));
      return jsonb_build_object('household_id', hid, 'note', 'double_cover_opened');
    end if;
    -- A member bought while another member's plan already covers: first purchase wins (D-19).
    if not exists (select 1 from public.household_events e
                    where e.household_id = hid and e.kind = 'plan_double_cover' and e.audience @> array[p_app_user_id]
                      and e.params ->> 'mode' = 'extra' and e.created_at > now() - interval '30 days') then
      perform public.plan_event_notice(hid, 'plan_double_cover', p_app_user_id, null, array[p_app_user_id],
        jsonb_build_object('mode', 'extra', 'payer', r.payer_id));
    end if;
    return jsonb_build_object('household_id', hid, 'note', 'double_cover');
  end if;

  v_takeover := r.household_id is not null and r.payer_id is distinct from p_app_user_id and r.status <> 'promo'
                and (r.payer_id is null or r.status in ('grace','lapsed','left_grace') or v_state in ('grace','lapsed'));
  v_prev_status := r.status;
  v_status := case when p_snapshot ->> 'period_type' = 'TRIAL' then 'trial' when v_bi is not null then 'grace' else 'active' end;

  insert into public.household_plans (household_id, payer_id, store, environment, product_id, plan_key, plan_size, period, status,
      store_expires_at, billing_issue_at, grace_until, covered_until, will_renew, trial_started_at, trial_ends_at,
      original_transaction_id, last_synced_at)
  values (hid, p_app_user_id, v_store, coalesce(p_snapshot ->> 'environment', 'PRODUCTION'), p.product_id, p.plan_key, p.plan_size,
      p.period, v_status, v_exp, v_bi, v_grace, greatest(v_exp, v_grace), (p_snapshot ->> 'unsubscribe_detected_at') is null,
      case when v_status = 'trial' then coalesce(nullif(p_snapshot ->> 'purchased_at', '')::timestamptz, now()) end,
      case when v_status = 'trial' then v_exp end, p_snapshot ->> 'original_transaction_id', now())
  on conflict (household_id) do update
    set payer_id = excluded.payer_id, store = excluded.store, environment = excluded.environment, product_id = excluded.product_id,
        plan_key = excluded.plan_key, plan_size = excluded.plan_size, period = excluded.period, status = excluded.status,
        promo_kind = null, store_expires_at = excluded.store_expires_at, billing_issue_at = excluded.billing_issue_at,
        grace_until = excluded.grace_until, covered_until = excluded.covered_until, will_renew = excluded.will_renew,
        trial_started_at = coalesce(excluded.trial_started_at, public.household_plans.trial_started_at),
        trial_ends_at = case when excluded.status = 'trial' then excluded.trial_ends_at else public.household_plans.trial_ends_at end,
        original_transaction_id = excluded.original_transaction_id, last_synced_at = now(), updated_at = now(),
        version = public.household_plans.version + 1;

  if v_takeover then
    update public.household_plans
       set dc_payer_id = null, dc_store = null, dc_environment = null, dc_product_id = null, dc_original_transaction_id = null,
           dc_expires_at = null, dc_will_renew = null, dc_new_payer = null, double_cover_since = null,
           chosen_payer = null, chosen_by = null, chosen_at = null
     where household_id = hid;
  end if;

  if v_status = 'trial' then
    insert into public.trial_ledger (user_id, household_id, product_id) values (p_app_user_id, hid, p.product_id)
    on conflict do nothing;
  end if;
  if v_status = 'grace' and v_prev_status is distinct from 'grace' then
    perform public.plan_event_notice(hid, 'plan_grace', p_app_user_id, null, null, jsonb_build_object('grace_until', v_grace));
  end if;
  if v_takeover then
    perform public.plan_event_notice(hid, 'plan_takeover', p_app_user_id, null, null,
      jsonb_build_object('previous_payer', r.payer_id, 'payer', p_app_user_id));
  end if;
  return jsonb_build_object('household_id', hid, 'note', case when v_takeover then 'takeover' else 'applied' end);
end;
$$;
revoke execute on function public.plan_apply_inner(uuid, jsonb) from public, anon, authenticated;

-- 3. The entry point the webhook and refresh functions call ------------------------------------------------------------
create or replace function public.plan_apply(p_app_user_id uuid, p_snapshot jsonb, p_rc_event_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
  hid uuid;
  v_note text;
begin
  perform set_config('fincwin.plan_bypass', 'on', true);
  v := public.plan_apply_inner(p_app_user_id, p_snapshot);
  hid := nullif(v ->> 'household_id', '')::uuid;
  v_note := v ->> 'note';
  perform public.plan_events_mark_applied(p_app_user_id, p_rc_event_id, v_note);
  if hid is not null then
    perform public.plan_admit_waiting(hid);
  end if;
  perform set_config('fincwin.plan_bypass', '', true);
  return jsonb_build_object('ok', true, 'household_id', hid,
    'state', case when hid is null then null else public.household_plan_state(hid) end, 'note', v_note);
end;
$$;
revoke execute on function public.plan_apply(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.plan_apply(uuid, jsonb, text) to service_role;

-- 4. The payer picks which plan covers the home (Owner P4) --------------------------------------------------------------
create or replace function public.plan_double_cover_choose(p_household uuid, p_keep_payer uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  r public.household_plans%rowtype;
  v_other uuid;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  perform 1 from public.households h where h.id = p_household for update;
  select * into r from public.household_plans where household_id = p_household;
  if r.household_id is null or v_uid is distinct from r.payer_id and v_uid is distinct from r.dc_payer_id then
    raise exception 'not a payer of this plan' using errcode = '42501';
  end if;
  if r.double_cover_since is null or r.dc_payer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_double_cover');
  end if;
  if p_keep_payer is distinct from r.payer_id and p_keep_payer is distinct from r.dc_payer_id then
    raise exception 'keep payer must be one of the two payers' using errcode = '22023';
  end if;
  if r.chosen_payer is not null then
    return jsonb_build_object('ok', true, 'note', 'already_chosen', 'chosen_payer', r.chosen_payer);
  end if;
  perform set_config('fincwin.plan_bypass', 'on', true);
  if p_keep_payer = r.payer_id then
    v_other := r.dc_payer_id;
    update public.household_plans
       set chosen_payer = p_keep_payer, chosen_by = 'payer', chosen_at = now(), version = version + 1, updated_at = now()
     where household_id = p_household;
  else
    v_other := r.payer_id;
    if (select pp.plan_size from public.plan_products pp where pp.product_id = r.dc_product_id)
       < (select count(*) from public.household_members m where m.household_id = p_household) then
      perform set_config('fincwin.plan_bypass', '', true);
      return jsonb_build_object('ok', false, 'reason', 'plan_too_small');
    end if;
    update public.household_plans hp
       set payer_id = hp.dc_payer_id, store = hp.dc_store, environment = coalesce(hp.dc_environment, 'PRODUCTION'),
           product_id = hp.dc_product_id,
           plan_key = (select pp.plan_key from public.plan_products pp where pp.product_id = hp.dc_product_id),
           plan_size = (select pp.plan_size from public.plan_products pp where pp.product_id = hp.dc_product_id),
           period = (select pp.period from public.plan_products pp where pp.product_id = hp.dc_product_id),
           original_transaction_id = hp.dc_original_transaction_id,
           store_expires_at = hp.dc_expires_at, covered_until = hp.dc_expires_at,
           will_renew = coalesce(hp.dc_will_renew, true), status = 'active', billing_issue_at = null, grace_until = null,
           trial_started_at = null, trial_ends_at = null,
           dc_payer_id = hp.payer_id, dc_store = hp.store, dc_environment = hp.environment, dc_product_id = hp.product_id,
           dc_original_transaction_id = hp.original_transaction_id, dc_expires_at = hp.store_expires_at,
           dc_will_renew = hp.will_renew,
           chosen_payer = p_keep_payer, chosen_by = 'payer', chosen_at = now(),
           version = hp.version + 1, updated_at = now()
     where hp.household_id = p_household;
  end if;
  perform public.plan_event_notice(p_household, 'plan_recovered_after_takeover', p_keep_payer, null, array[v_other],
    jsonb_build_object('payer', p_keep_payer, 'chosen_by', 'payer'));
  perform set_config('fincwin.plan_bypass', '', true);
  return jsonb_build_object('ok', true, 'note', 'chosen', 'chosen_payer', p_keep_payer);
end;
$$;
revoke execute on function public.plan_double_cover_choose(uuid, uuid) from public, anon;
grant execute on function public.plan_double_cover_choose(uuid, uuid) to authenticated;

-- 5. What the choice screen reads ----------------------------------------------------------------------------------------
create or replace function public.plan_double_cover_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  hid uuid;
  r public.household_plans%rowtype;
  v_members integer;
  v_cover jsonb;
  v_other jsonb;
begin
  if v_uid is null then
    return null;
  end if;
  select m.household_id into hid from public.household_members m where m.user_id = v_uid order by m.created_at limit 1;
  select * into r from public.household_plans where household_id = hid;
  if r.household_id is null or r.double_cover_since is null or r.dc_payer_id is null
     or v_uid is distinct from r.payer_id and v_uid is distinct from r.dc_payer_id then
    return null;
  end if;
  select count(*) into v_members from public.household_members m where m.household_id = hid;
  v_cover := jsonb_build_object('payer_id', r.payer_id, 'plan_key', r.plan_key, 'fits', r.plan_size >= v_members);
  v_other := jsonb_build_object('payer_id', r.dc_payer_id,
    'plan_key', (select pp.plan_key from public.plan_products pp where pp.product_id = r.dc_product_id),
    'fits', coalesce((select pp.plan_size from public.plan_products pp where pp.product_id = r.dc_product_id) >= v_members, false));
  return jsonb_build_object('household_id', hid, 'since', r.double_cover_since,
    'choose_by', r.double_cover_since + interval '7 days', 'chosen_payer', r.chosen_payer, 'chosen_by', r.chosen_by,
    'new', case when r.payer_id = r.dc_new_payer then v_cover else v_other end,
    'old', case when r.payer_id = r.dc_new_payer then v_other else v_cover end);
end;
$$;
revoke execute on function public.plan_double_cover_state() from public, anon;
grant execute on function public.plan_double_cover_state() to authenticated;

-- 6. The daily sweep -------------------------------------------------------------------------------------------------------
create or replace function public.plan_sweep()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform set_config('fincwin.plan_bypass', 'on', true);
  -- (a) one plan_locked notice per lapse
  for r in select hp.household_id, hp.payer_id from public.household_plans hp
            where public.household_plan_state(hp.household_id) = 'lapsed'
              and not exists (select 1 from public.household_events e
                               where e.household_id = hp.household_id and e.kind = 'plan_locked' and e.created_at >= hp.updated_at) loop
    perform public.plan_event_notice(r.household_id, 'plan_locked', r.payer_id, null, null, '{}'::jsonb);
  end loop;
  -- (b) Owner P4: nobody picked within 7 days, so the takeover plan stays and the old payer is told
  for r in select hp.household_id, hp.dc_new_payer, hp.dc_payer_id from public.household_plans hp
            where hp.double_cover_since is not null and hp.chosen_payer is null and hp.dc_payer_id is not null
              and hp.double_cover_since <= now() - interval '7 days' loop
    update public.household_plans
       set chosen_payer = r.dc_new_payer, chosen_by = 'default', chosen_at = now(), version = version + 1, updated_at = now()
     where household_id = r.household_id;
    perform public.plan_event_notice(r.household_id, 'plan_recovered_after_takeover', r.dc_new_payer, null, array[r.dc_payer_id],
      jsonb_build_object('payer', r.dc_new_payer, 'chosen_by', 'default'));
  end loop;
  -- (c) D-39 retention
  delete from public.household_leave_log where left_at < now() - interval '13 months';
  perform set_config('fincwin.plan_bypass', '', true);
end;
$$;
revoke execute on function public.plan_sweep() from public, anon, authenticated;

-- 7. Who the reconcile job should re-fetch ---------------------------------------------------------------------------------
create or replace function public.plan_sweep_targets()
returns table(app_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select hp.payer_id as app_user_id from public.household_plans hp
   where hp.payer_id is not null
     and (hp.covered_until between now() and now() + interval '24 hours'
          or hp.last_synced_at is null or hp.last_synced_at < now() - interval '1 day')
     and hp.store in ('APP_STORE','PLAY_STORE','PROMOTIONAL')
  union
  select e.app_user_id::uuid from public.plan_events e
   where e.applied_at is null and e.type <> 'TEST'
     and e.received_at < now() - interval '10 minutes' and e.received_at > now() - interval '7 days'
     and e.app_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  union
  select hp.dc_payer_id as app_user_id from public.household_plans hp where hp.dc_payer_id is not null
$$;
revoke execute on function public.plan_sweep_targets() from public, anon, authenticated;
grant execute on function public.plan_sweep_targets() to service_role;

-- 8. Cron ------------------------------------------------------------------------------------------------------------------
select cron.schedule('plan-sweep-daily', '35 0 * * *', $$ select public.plan_sweep(); $$);

select cron.schedule(
  'plan-reconcile-daily',
  '50 0 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'plan_refresh_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-plan-sweep-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'plan_sweep_secret')),
    body := '{"mode":"sweep"}'::jsonb
  );
  $$
);
