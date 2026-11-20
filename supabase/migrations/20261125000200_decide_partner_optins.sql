-- 08.1-03 (CMP-F19, carry-over 08-28; D-36, D-37). Partner opt-in for Decide: a partner's money counts in my checks only when
-- both of us switch it on, as one rounded total, never items. Shared safety net: size and saved only. Off by default.
-- These three tables stay on 106's hh_move_rows stay-list (not in hh_move_tables()).

-- 1. Tables ------------------------------------------------------------------------------------------------------------
create table public.decide_partner_optins (
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (owner_id, partner_id),
  check (owner_id <> partner_id));
create index decide_partner_optins_household_idx on public.decide_partner_optins (household_id);
create index decide_partner_optins_partner_idx on public.decide_partner_optins (partner_id);

create table public.partner_figures (
  household_id uuid not null references public.households(id) on delete cascade,
  owner_id uuid primary key references auth.users(id) on delete cascade,
  rounded_left bigint not null check (rounded_left % 1000 = 0),
  currency text not null check (currency ~ '^[A-Z0-9]{2,4}$'),
  as_of timestamptz not null default now());
create index partner_figures_household_idx on public.partner_figures (household_id);

create table public.safety_net_shares (
  household_id uuid not null references public.households(id) on delete cascade,
  goal_id uuid primary key references public.savings_goals(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  rounded_saved bigint check (rounded_saved is null or rounded_saved % 1000 = 0),
  updated_at timestamptz not null default now());
create index safety_net_shares_household_idx on public.safety_net_shares (household_id);
create index safety_net_shares_owner_idx on public.safety_net_shares (owner_id);

-- 2. RLS: the owner may read their own rows; every write goes through an RPC ---------------------------------------------
alter table public.decide_partner_optins enable row level security;
create policy "owner or partner reads the opt-in" on public.decide_partner_optins for select to authenticated
  using (owner_id = (select auth.uid()) or partner_id = (select auth.uid()));
revoke all on public.decide_partner_optins from anon;
revoke insert, update, delete, truncate on public.decide_partner_optins from authenticated;
grant select on public.decide_partner_optins to authenticated;

alter table public.partner_figures enable row level security;
create policy "owner reads own figure" on public.partner_figures for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.partner_figures from anon, authenticated;

alter table public.safety_net_shares enable row level security;
create policy "owner reads own net share" on public.safety_net_shares for select to authenticated
  using (owner_id = (select auth.uid()));
revoke all on public.safety_net_shares from anon, authenticated;
grant select on public.safety_net_shares to authenticated;

-- 3. RPCs ---------------------------------------------------------------------------------------------------------------
-- The household both people belong to, or null.
create or replace function public.hh_common_household(p_a uuid, p_b uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select a.household_id from public.household_members a
    join public.household_members b on b.household_id = a.household_id
   where a.user_id = p_a and b.user_id = p_b limit 1
$$;
revoke execute on function public.hh_common_household(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_partner_optin(p_partner uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hh uuid;
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_partner is null or p_partner = uid then return jsonb_build_object('ok', false, 'reason', 'not_a_member'); end if;
  hh := public.hh_common_household(uid, p_partner);
  if hh is null then return jsonb_build_object('ok', false, 'reason', 'not_a_member'); end if;
  insert into public.decide_partner_optins (household_id, owner_id, partner_id, enabled, updated_at)
  values (hh, uid, p_partner, coalesce(p_enabled, false), now())
  on conflict (owner_id, partner_id) do update
    set enabled = excluded.enabled, household_id = excluded.household_id, updated_at = now();
  if not coalesce(p_enabled, false) then
    -- Off is immediate: when no opt-in of mine remains on, my published figure goes.
    if not exists (select 1 from public.decide_partner_optins where owner_id = uid and enabled) then
      delete from public.partner_figures where owner_id = uid;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
end;
$$;

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
  select household_id into hh from public.decide_partner_optins where owner_id = uid and enabled limit 1;
  if hh is null then return jsonb_build_object('ok', false, 'reason', 'no_optin'); end if;
  insert into public.partner_figures (household_id, owner_id, rounded_left, currency, as_of)
  values (hh, uid, p_rounded_left, p_currency, now())
  on conflict (owner_id) do update
    set household_id = excluded.household_id, rounded_left = excluded.rounded_left,
        currency = excluded.currency, as_of = now();
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.partner_money_total(p_partner uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  f public.partner_figures%rowtype;
begin
  if uid is null or p_partner is null or p_partner = uid
     or public.hh_common_household(uid, p_partner) is null then
    return jsonb_build_object('ok', false, 'reason', 'not_both_on');
  end if;
  if not exists (select 1 from public.decide_partner_optins where owner_id = uid and partner_id = p_partner and enabled)
     or not exists (select 1 from public.decide_partner_optins where owner_id = p_partner and partner_id = uid and enabled) then
    return jsonb_build_object('ok', false, 'reason', 'not_both_on');
  end if;
  select * into f from public.partner_figures where owner_id = p_partner;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_figure'); end if;
  return jsonb_build_object('ok', true, 'rounded_left', f.rounded_left, 'currency', f.currency, 'as_of', f.as_of);
end;
$$;

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
  if (select count(*) from public.household_members where household_id = g.household_id) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'no_partner');
  end if;
  insert into public.safety_net_shares (household_id, goal_id, owner_id, enabled, rounded_saved, updated_at)
  values (g.household_id, g.id, uid, coalesce(p_enabled, false), (g.opening_saved / 1000) * 1000, now())
  on conflict (goal_id) do update set enabled = excluded.enabled, updated_at = now();
  return jsonb_build_object('ok', true, 'enabled', coalesce(p_enabled, false));
end;
$$;

-- The owner's device publishes the saved amount it computed, rounded down to a multiple of 1000 minor units.
create or replace function public.publish_safety_net_saved(p_goal_id uuid, p_rounded_saved bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  if p_rounded_saved is null or p_rounded_saved < 0 or p_rounded_saved % 1000 <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'not_rounded');
  end if;
  update public.safety_net_shares set rounded_saved = p_rounded_saved, updated_at = now()
   where goal_id = p_goal_id and owner_id = uid and enabled;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_shared'); end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- A net another member shared with me: size and saved only, nothing else about the goal.
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
    join public.savings_goals g on g.id = s.goal_id and g.deleted_at is null
   where s.enabled and s.owner_id <> uid
     and s.household_id in (select m.household_id from public.household_members m where m.user_id = uid)
   order by s.updated_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'none_shared'); end if;
  return jsonb_build_object('ok', true, 'owner_id', r.owner_id, 'size', r.size, 'saved', r.saved, 'currency', r.currency);
end;
$$;

-- Dates only (D-37): the latest day each other member logged a shared line.
create or replace function public.partner_last_shared_line()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then return jsonb_build_object('ok', false, 'reason', 'not_signed_in'); end if;
  return jsonb_build_object('ok', true, 'members', coalesce((
    select jsonb_agg(jsonb_build_object('member_id', m.user_id, 'last_date', (
        select max(t.local_date) from public.transactions t
         where t.household_id = m.household_id and t.created_by = m.user_id and t.is_shared and t.deleted_at is null)))
      from public.household_members m
     where m.user_id <> uid
       and m.household_id in (select h.household_id from public.household_members h where h.user_id = uid)), '[]'::jsonb));
end;
$$;

revoke execute on function public.set_partner_optin(uuid, boolean), public.publish_partner_figure(bigint, text),
  public.partner_money_total(uuid), public.set_shared_safety_net(uuid, boolean),
  public.publish_safety_net_saved(uuid, bigint), public.shared_safety_net(), public.partner_last_shared_line()
  from public, anon;
grant execute on function public.set_partner_optin(uuid, boolean), public.publish_partner_figure(bigint, text),
  public.partner_money_total(uuid), public.set_shared_safety_net(uuid, boolean),
  public.publish_safety_net_saved(uuid, bigint), public.shared_safety_net(), public.partner_last_shared_line()
  to authenticated;
