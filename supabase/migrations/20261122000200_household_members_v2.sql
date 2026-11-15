-- Phase 8 members v2 (HH-03, HH-10; D-08, D-11, D-30..D-34): owner flag + label, weights in percent with 0 allowed,
-- member colours, hidden names, a household name, household_events notices, and RPC-only membership writes.
-- Proven by supabase/tests/database/100_household_members_v2.test.sql.

-- 1. household_members -----------------------------------------------------------------------------------------
alter table public.household_members
  add column is_owner boolean not null default false,
  add column role_label text not null default 'Flatmate' check (char_length(btrim(role_label)) between 1 and 24),
  add column colour_key smallint check (colour_key between 0 and 5),
  add column name_hidden boolean not null default false;

update public.household_members
  set is_owner = (role = 'owner'),
      role_label = case when role = 'owner' then 'Owner' else 'Flatmate' end;

-- colours: owners 0, others the lowest free key in created_at order
update public.household_members set colour_key = 0 where is_owner;
do $$
declare
  r record;
  k smallint;
begin
  for r in select household_id, user_id from public.household_members
           where colour_key is null order by created_at, user_id loop
    select g into k from generate_series(0, 5) g
      where not exists (select 1 from public.household_members m
        where m.household_id = r.household_id and m.colour_key = g)
      order by g limit 1;
    update public.household_members set colour_key = k
      where household_id = r.household_id and user_id = r.user_id;
  end loop;
end $$;

-- display_name: first name from the profile where none is set (null stays null; the resolver falls back to colour)
update public.household_members m
  set display_name = left(nullif(split_part(btrim(p.full_name), ' ', 1), ''), 60)
  from public.profiles p
  where p.id = m.user_id and m.display_name is null;

alter table public.household_members alter column colour_key set not null;
create unique index household_members_colour_uniq on public.household_members (household_id, colour_key);
create unique index household_members_one_owner on public.household_members (household_id) where is_owner;
alter table public.household_members drop column role;

-- weights: percent, 0 allowed. Households of one become 100; multi-member rows keep their values (relative).
alter table public.household_members drop constraint if exists household_members_weight_check;
alter table public.household_members add constraint household_members_weight_range check (weight between 0 and 100);
update public.household_members m set weight = 100
  where (select count(*) from public.household_members x where x.household_id = m.household_id) = 1;

-- A household can never have every weight at 0 (D-30, 04 D-15).
create or replace function public.guard_member_weights_not_all_zero()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid := coalesce(new.household_id, old.household_id);
begin
  if exists (select 1 from public.household_members where household_id = hid)
     and (select max(weight) from public.household_members where household_id = hid) = 0 then
    raise exception 'household_weights_all_zero' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke execute on function public.guard_member_weights_not_all_zero() from public, anon, authenticated;

create constraint trigger guard_member_weights_not_all_zero
  after insert or update of weight or delete on public.household_members
  deferrable initially deferred
  for each row execute function public.guard_member_weights_not_all_zero();

-- New members get the lowest free colour; the owner's label is fixed.
create or replace function public.assign_member_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.colour_key is null then
    select g into new.colour_key from generate_series(0, 5) g
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

create trigger assign_member_defaults before insert on public.household_members
  for each row execute function public.assign_member_defaults();

-- 2. households.name (D-11) ------------------------------------------------------------------------------------
alter table public.households add column name text check (name is null or char_length(btrim(name)) between 1 and 60);
update public.households h
  set name = coalesce(nullif(left(split_part(btrim(p.full_name), ' ', 1), 40), '') || '''s household', 'My household')
  from public.profiles p where p.id = h.owner_id;
update public.households set name = 'My household' where name is null;
alter table public.households alter column name set default 'My household';
alter table public.households alter column name set not null;

-- 3. handle_new_user: owner flag, 100 percent, colour 0, first name (body otherwise as 20260926000100) -----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_household_id uuid;
  first_name text := left(nullif(split_part(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ' ', 1), ''), 40);
begin
  insert into public.profiles (id, full_name, email)
  values (new.id,
          nullif(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'), ''),
          new.email);
  insert into public.households (owner_id, name)
    values (new.id, coalesce(first_name || '''s household', 'My household')) returning id into new_household_id;
  insert into public.household_members (household_id, user_id, is_owner, weight, colour_key, display_name)
    values (new_household_id, new.id, true, 100, 0, first_name);
  perform public.seed_user_categories(new.id);
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- 4. household_events (notices) --------------------------------------------------------------------------------
create table public.household_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in ('joined','left','removed','departure_undone','made_private','split_changed','weights_changed','default_changed','category_default_changed','settle_request','settle_reminder','settle_lapsed','settle_not_yet','settled','settle_undone','settle_cancelled','settle_ask','written_off','owner_changed','renamed','currency_changed')),
  actor_id uuid references auth.users(id) on delete set null,
  subject_id uuid references auth.users(id) on delete set null,
  ref_id uuid,
  audience uuid[],             -- null = every member; otherwise only these users
  params jsonb not null default '{}'::jsonb,   -- never carries profiles.full_name or email
  created_at timestamptz not null default now());
create unique index household_events_once on public.household_events (ref_id, kind) where kind in ('settle_reminder','settle_lapsed');
create index household_events_household_idx on public.household_events (household_id, created_at desc);

alter table public.household_events enable row level security;
create policy "members read their events" on public.household_events for select to authenticated
  using (household_id in (select public.user_household_ids())
    and (audience is null or (select auth.uid()) = any(audience)));
revoke all on public.household_events from anon;
revoke insert, update, delete, truncate on public.household_events from authenticated;
grant select on public.household_events to authenticated;

create table public.household_event_reads (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now());
alter table public.household_event_reads enable row level security;
create policy "own event reads" on public.household_event_reads for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.household_event_reads from anon;
revoke insert, update, delete, truncate on public.household_event_reads from authenticated;
grant select on public.household_event_reads to authenticated;

-- Caller id or 42501 (the only raise in the RPCs below).
create or replace function public.hh_uid()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  return uid;
end;
$$;
revoke execute on function public.hh_uid() from public, anon, authenticated;

create or replace function public.hh_event(p_household uuid, p_kind text, p_subject uuid, p_ref uuid, p_audience uuid[], p_params jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.household_events (household_id, kind, actor_id, subject_id, ref_id, audience, params)
  values (p_household, p_kind, (select auth.uid()), p_subject, p_ref, p_audience, coalesce(p_params, '{}'::jsonb));
end;
$$;
revoke execute on function public.hh_event(uuid, text, uuid, uuid, uuid[], jsonb) from public, anon, authenticated;

-- 5. Member RPCs. Failures return {"ok": false, "reason": ...}; only a missing session raises (42501). ------------
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
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', m.version);
  end if;
  if p_display_name is not null and (nm is null or char_length(nm) > 60) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if p_colour_key is null or p_colour_key not between 0 and 5 then
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

create or replace function public.set_member_role(p_user_id uuid, p_role_label text, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.household_members%rowtype;
  lbl text := btrim(p_role_label);
begin
  select * into t from public.household_members
    where user_id = p_user_id and household_id in (select public.user_household_ids())
    order by created_at limit 1 for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_user_id <> uid and not exists (
       select 1 from public.household_members o
       where o.household_id = t.household_id and o.user_id = uid and o.is_owner) then
    return jsonb_build_object('ok', false, 'reason', 'not_allowed');
  end if;
  if t.is_owner then return jsonb_build_object('ok', false, 'reason', 'owner_label_fixed'); end if;
  if lbl is null or char_length(lbl) not between 1 and 24 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_role');
  end if;
  if t.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', t.version);
  end if;
  update public.household_members set role_label = lbl where household_id = t.household_id and user_id = p_user_id;
  return jsonb_build_object('ok', true, 'version', t.version + 1);
end;
$$;

create or replace function public.set_member_weights(p_weights jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  before_w jsonb;
  k text;
  v jsonb;
  total int := 0;
  biggest int := 0;
  n int := 0;
begin
  select household_id into hid from public.household_members where user_id = uid order by created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_weights is null or jsonb_typeof(p_weights) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'members_mismatch');
  end if;
  -- every current member present exactly once
  for k, v in select * from jsonb_each(p_weights) loop
    n := n + 1;
    if k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from public.household_members where household_id = hid and user_id = k::uuid) then
      return jsonb_build_object('ok', false, 'reason', 'members_mismatch');
    end if;
  end loop;
  if n <> (select count(*) from public.household_members where household_id = hid) then
    return jsonb_build_object('ok', false, 'reason', 'members_mismatch');
  end if;
  for k, v in select * from jsonb_each(p_weights) loop
    if jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]{1,3}$' or (v::text)::int > 100 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_weight');
    end if;
    total := total + (v::text)::int;
    biggest := greatest(biggest, (v::text)::int);
  end loop;
  if biggest = 0 then return jsonb_build_object('ok', false, 'reason', 'all_zero'); end if;
  if total <> 100 then return jsonb_build_object('ok', false, 'reason', 'not_100'); end if;

  select jsonb_object_agg(user_id::text, weight) into before_w from public.household_members where household_id = hid;
  update public.household_members m set weight = (p_weights ->> m.user_id::text)::int where m.household_id = hid;
  perform public.hh_event(hid, 'weights_changed', null, null, null,
    jsonb_build_object('before', before_w, 'after', p_weights));
  return jsonb_build_object('ok', true, 'before', before_w);
end;
$$;

create or replace function public.rename_household(p_name text, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  h public.households%rowtype;
  nm text := btrim(p_name);
begin
  select h2.* into h from public.households h2
    join public.household_members m on m.household_id = h2.id and m.user_id = uid and m.is_owner
    order by m.created_at limit 1 for update of h2;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if nm is null or char_length(nm) not between 1 and 60 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_name');
  end if;
  if h.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', h.version);
  end if;
  update public.households set name = nm where id = h.id;
  perform public.hh_event(h.id, 'renamed', null, null, null, jsonb_build_object('name', nm));
  return jsonb_build_object('ok', true, 'version', h.version + 1);
end;
$$;

-- Plan 08-10 re-creates this adding the shared_lines_exist refusal (D-39).
create or replace function public.set_household_currency(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m
    where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if p_code is null or not public.is_known_currency(p_code, uid) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_currency');
  end if;
  update public.households set reporting_currency = p_code where id = hid;
  perform public.hh_event(hid, 'currency_changed', null, null, null, jsonb_build_object('code', p_code));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_household_events_read()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
begin
  insert into public.household_event_reads (user_id, last_read_at) values (uid, now())
    on conflict (user_id) do update set last_read_at = excluded.last_read_at;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.set_my_member_display(int, smallint, boolean, text) from public, anon;
grant execute on function public.set_my_member_display(int, smallint, boolean, text) to authenticated;
revoke execute on function public.set_member_role(uuid, text, int) from public, anon;
grant execute on function public.set_member_role(uuid, text, int) to authenticated;
revoke execute on function public.set_member_weights(jsonb) from public, anon;
grant execute on function public.set_member_weights(jsonb) to authenticated;
revoke execute on function public.rename_household(text, int) from public, anon;
grant execute on function public.rename_household(text, int) to authenticated;
revoke execute on function public.set_household_currency(text) from public, anon;
grant execute on function public.set_household_currency(text) to authenticated;
revoke execute on function public.mark_household_events_read() from public, anon;
grant execute on function public.mark_household_events_read() to authenticated;
