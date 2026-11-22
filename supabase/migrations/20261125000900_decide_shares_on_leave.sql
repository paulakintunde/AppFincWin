-- 08.1 review C-CR-01 (and C-WR-01): a shared safety net, the partner opt-ins and the published figure end when their owner leaves
-- the household or is removed. Until now hh_depart left these rows behind (they sit on 106's stay-list), so the remaining members
-- kept seeing the leaver's net size and saved amount, the leaver's device kept publishing into the old household, the leaver
-- could not switch the net off (set_shared_safety_net answered no_partner in a household of one), and a rejoin silently brought
-- old "count my money" consents back. A rejoin now starts from off.
-- 20261125000200 is live in production and is not edited: this file re-issues its functions. The tables stay where they are (they
-- are still household tables on 106's stay-list); only rows whose owner has gone are removed.

-- 1. One-time tidy of what is already wrong ---------------------------------------------------------------------------------
-- A share whose owner is no longer a member of its household, or whose goal is no longer in that household.
delete from public.safety_net_shares s
 where not exists (select 1 from public.household_members m where m.household_id = s.household_id and m.user_id = s.owner_id)
    or not exists (select 1 from public.savings_goals g where g.id = s.goal_id and g.household_id = s.household_id);

-- An opt-in where either side is no longer a member of its household.
delete from public.decide_partner_optins o
 where not exists (select 1 from public.household_members m where m.household_id = o.household_id and m.user_id = o.owner_id)
    or not exists (select 1 from public.household_members m where m.household_id = o.household_id and m.user_id = o.partner_id);

-- A figure whose owner is no longer a member, or who no longer has an opt-in switched on in that household.
delete from public.partner_figures f
 where not exists (select 1 from public.household_members m where m.household_id = f.household_id and m.user_id = f.owner_id)
    or not exists (select 1 from public.decide_partner_optins o
                    where o.owner_id = f.owner_id and o.household_id = f.household_id and o.enabled);

-- 2. Departure: the rows end with the membership --------------------------------------------------------------------------
-- Fires on leave, removal and account deletion (every path deletes the household_members row). Like hh_strip_spend_share.
create or replace function public.hh_end_decide_shares()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.safety_net_shares where household_id = old.household_id and owner_id = old.user_id;
  delete from public.decide_partner_optins
   where household_id = old.household_id and (owner_id = old.user_id or partner_id = old.user_id);
  -- The leaver's figure, and the figure of anyone whose only switched-on opt-in named the leaver ("off is immediate").
  delete from public.partner_figures f
   where f.household_id = old.household_id
     and (f.owner_id = old.user_id
          or not exists (select 1 from public.decide_partner_optins o
                          where o.owner_id = f.owner_id and o.household_id = f.household_id and o.enabled));
  return null;
end;
$$;
revoke execute on function public.hh_end_decide_shares() from public, anon, authenticated;
create trigger end_decide_shares after delete on public.household_members
  for each row execute function public.hh_end_decide_shares();

-- 3. RPCs: every read and publish checks the owner is still a member ------------------------------------------------------
-- The opt-in used for publishing must name two people who are both still in its household.
create or replace function public.publish_partner_figure(p_rounded_left bigint, p_currency text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hh uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_rounded_left is null or p_rounded_left % 1000 <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_rounded');
  end if;
  if p_currency is null or p_currency !~ '^[A-Z0-9]{2,4}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_currency');
  end if;
  select o.household_id into hh from public.decide_partner_optins o
   where o.owner_id = uid and o.enabled
     and exists (select 1 from public.household_members m where m.household_id = o.household_id and m.user_id = uid)
     and exists (select 1 from public.household_members m where m.household_id = o.household_id and m.user_id = o.partner_id)
   limit 1;
  if hh is null then return jsonb_build_object('ok', false, 'reason', 'no_optin'); end if;
  insert into public.partner_figures (household_id, owner_id, rounded_left, currency, as_of)
  values (hh, uid, p_rounded_left, p_currency, now())
  on conflict (owner_id) do update
    set household_id = excluded.household_id, rounded_left = excluded.rounded_left,
        currency = excluded.currency, as_of = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- Both opt-ins and the figure must belong to the household the two people share now.
create or replace function public.partner_money_total(p_partner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hh uuid;
  f public.partner_figures%rowtype;
begin
  if uid is null or p_partner is null or p_partner = uid then
    return jsonb_build_object('ok', false, 'reason', 'not_both_on');
  end if;
  hh := public.hh_common_household(uid, p_partner);
  if hh is null then return jsonb_build_object('ok', false, 'reason', 'not_both_on'); end if;
  if not exists (select 1 from public.decide_partner_optins
                  where owner_id = uid and partner_id = p_partner and household_id = hh and enabled)
     or not exists (select 1 from public.decide_partner_optins
                     where owner_id = p_partner and partner_id = uid and household_id = hh and enabled) then
    return jsonb_build_object('ok', false, 'reason', 'not_both_on');
  end if;
  select * into f from public.partner_figures where owner_id = p_partner and household_id = hh;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_figure'); end if;
  return jsonb_build_object('ok', true, 'rounded_left', f.rounded_left, 'currency', f.currency, 'as_of', f.as_of);
end;
$$;

-- Switching off always works (even in a household of one, so a leaver is never stuck); switching on needs a partner. A share that
-- is switched on again follows the goal to its current household, and its saved figure restarts from the goal's own.
create or replace function public.set_shared_safety_net(p_goal_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  g public.savings_goals%rowtype;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  select * into g from public.savings_goals
   where id = p_goal_id and created_by = uid and is_safety_net and deleted_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_your_safety_net'); end if;
  if not coalesce(p_enabled, false) then
    update public.safety_net_shares set enabled = false, updated_at = now() where goal_id = g.id and owner_id = uid;
    return jsonb_build_object('ok', true, 'enabled', false);
  end if;
  if (select count(*) from public.household_members where household_id = g.household_id) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'no_partner');
  end if;
  insert into public.safety_net_shares (household_id, goal_id, owner_id, enabled, rounded_saved, updated_at)
  values (g.household_id, g.id, uid, true, (g.opening_saved / 1000) * 1000, now())
  on conflict (goal_id) do update
    set enabled = true,
        rounded_saved = case when public.safety_net_shares.household_id = excluded.household_id
                             then public.safety_net_shares.rounded_saved else excluded.rounded_saved end,
        household_id = excluded.household_id,
        updated_at = now();
  return jsonb_build_object('ok', true, 'enabled', true);
end;
$$;

-- The owner's device publishes the saved amount only while the owner and the goal are still in the share's household.
create or replace function public.publish_safety_net_saved(p_goal_id uuid, p_rounded_saved bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_rounded_saved is null or p_rounded_saved < 0 or p_rounded_saved % 1000 <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_rounded');
  end if;
  update public.safety_net_shares s set rounded_saved = p_rounded_saved, updated_at = now()
   where s.goal_id = p_goal_id and s.owner_id = uid and s.enabled
     and exists (select 1 from public.household_members m where m.household_id = s.household_id and m.user_id = uid)
     and exists (select 1 from public.savings_goals g
                  where g.id = s.goal_id and g.household_id = s.household_id and g.deleted_at is null);
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_shared'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A net another member shared with me: size and saved only. The owner must still be a member and the goal still in the household.
create or replace function public.shared_safety_net()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  r record;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  select s.owner_id, g.currency, (coalesce(g.target, 0) / 1000) * 1000 as size, coalesce(s.rounded_saved, 0) as saved
    into r
    from public.safety_net_shares s
    join public.savings_goals g on g.id = s.goal_id and g.deleted_at is null and g.household_id = s.household_id
   where s.enabled and s.owner_id <> uid
     and exists (select 1 from public.household_members o where o.household_id = s.household_id and o.user_id = s.owner_id)
     and s.household_id in (select m.household_id from public.household_members m where m.user_id = uid)
   order by s.updated_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'none_shared'); end if;
  return jsonb_build_object('ok', true, 'owner_id', r.owner_id, 'size', r.size, 'saved', r.saved, 'currency', r.currency);
end;
$$;

revoke execute on function public.publish_partner_figure(bigint, text), public.partner_money_total(uuid),
  public.set_shared_safety_net(uuid, boolean), public.publish_safety_net_saved(uuid, bigint), public.shared_safety_net()
  from public, anon;
grant execute on function public.publish_partner_figure(bigint, text), public.partner_money_total(uuid),
  public.set_shared_safety_net(uuid, boolean), public.publish_safety_net_saved(uuid, bigint), public.shared_safety_net()
  to authenticated;
