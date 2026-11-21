-- 08.1-22 (CMP-F19, UX-21, ENG-26): the household's spending rule and account setup.
-- Owner 2026-11-20: each group chooses how spendable money is split among its members: "What each person brings" (bring),
-- "A set spending split" (custom, shares per member) or "Same as the bill split" (bill). With no rule saved the setup type
-- picks the default; with no setup saved the app infers it from the accounts. Any member may change it; a notice with the
-- before and after names who did (Undo travels with the notice like a bill-weight change). Additive only.

create table public.household_spend_rules (
  household_id uuid primary key references public.households(id) on delete cascade,
  rule text check (rule in ('bring', 'custom', 'bill')),
  setup text check (setup in ('separate', 'joint', 'mixed')),
  shares jsonb check (shares is null or jsonb_typeof(shares) = 'object'),
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (rule is distinct from 'custom' or shares is not null));
comment on table public.household_spend_rules is
  'One row per household: rule null = the setup default, setup null = inferred by the app. Changes travel as household_events (spend_rule_changed), not through the realtime publication.';
create trigger set_version before update on public.household_spend_rules
  for each row execute function public.bump_version();

alter table public.household_spend_rules enable row level security;
create policy "members read spend rule" on public.household_spend_rules for select to authenticated
  using (household_id in (select public.user_household_ids()));
revoke all on public.household_spend_rules from anon;
revoke insert, update, delete, truncate on public.household_spend_rules from authenticated;
grant select on public.household_spend_rules to authenticated;

-- The notice kinds: the full list as created in 20261122000200, plus the two this plan announces.
alter table public.household_events drop constraint if exists household_events_kind_check;
alter table public.household_events add constraint household_events_kind_check check (kind in ('joined','left','removed','departure_undone','made_private','split_changed','weights_changed','default_changed','category_default_changed','settle_request','settle_reminder','settle_lapsed','settle_not_yet','settled','settle_undone','settle_cancelled','settle_departed','settle_ask','written_off','owner_changed','renamed','currency_changed','spend_rule_changed','joint_purpose_changed'));

-- Any member may set the rule (owner decision Q2). Failures return {"ok": false, "reason": ...}; only a missing session raises.
-- p_shares: for 'custom', every current member once, whole numbers 0..100, not all zero, total 100. For bring/bill the stored
-- shares are kept as they were (so switching back keeps the group's numbers).
create or replace function public.set_household_spend_rule(p_rule text, p_setup text, p_shares jsonb, p_expected_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  cur public.household_spend_rules%rowtype;
  k text;
  v jsonb;
  n int := 0;
  total int := 0;
  biggest int := 0;
  keep jsonb;
  new_version int;
begin
  select household_id into hid from public.household_members where user_id = uid order by created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if (select count(*) from public.household_members where household_id = hid) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'too_few');
  end if;
  if p_rule is not null and p_rule not in ('bring', 'custom', 'bill') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rule');
  end if;
  if p_setup is not null and p_setup not in ('separate', 'joint', 'mixed') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_setup');
  end if;
  if p_rule = 'custom' then
    if p_shares is null or jsonb_typeof(p_shares) <> 'object' then
      return jsonb_build_object('ok', false, 'reason', 'members_mismatch');
    end if;
    for k, v in select * from jsonb_each(p_shares) loop
      n := n + 1;
      if k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.household_members where household_id = hid and user_id = k::uuid) then
        return jsonb_build_object('ok', false, 'reason', 'members_mismatch');
      end if;
    end loop;
    if n <> (select count(*) from public.household_members where household_id = hid) then
      return jsonb_build_object('ok', false, 'reason', 'members_mismatch');
    end if;
    for k, v in select * from jsonb_each(p_shares) loop
      if jsonb_typeof(v) <> 'number' or v::text !~ '^[0-9]{1,3}$' or (v::text)::int > 100 then
        return jsonb_build_object('ok', false, 'reason', 'invalid_share');
      end if;
      total := total + (v::text)::int;
      biggest := greatest(biggest, (v::text)::int);
    end loop;
    if biggest = 0 then return jsonb_build_object('ok', false, 'reason', 'all_zero'); end if;
    if total <> 100 then return jsonb_build_object('ok', false, 'reason', 'not_100'); end if;
  end if;

  select * into cur from public.household_spend_rules where household_id = hid for update;
  if found then
    if p_expected_version is distinct from cur.version then
      return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', cur.version, 'updated_by', cur.updated_by);
    end if;
  elsif p_expected_version is not null and p_expected_version <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', 0, 'updated_by', null);
  end if;

  keep := case when p_rule = 'custom' then p_shares else cur.shares end;
  if found then
    update public.household_spend_rules
       set rule = p_rule, setup = p_setup, shares = keep, updated_by = uid, updated_at = now()
     where household_id = hid;
    new_version := cur.version + 1;
  else
    insert into public.household_spend_rules (household_id, rule, setup, shares, updated_by)
      values (hid, p_rule, p_setup, keep, uid);
    new_version := 1;
  end if;
  perform public.hh_event(hid, 'spend_rule_changed', null, null, null, jsonb_build_object(
    'before', jsonb_build_object('rule', cur.rule, 'setup', cur.setup, 'shares', cur.shares),
    'after', jsonb_build_object('rule', p_rule, 'setup', p_setup, 'shares', keep)));
  return jsonb_build_object('ok', true, 'version', new_version);
end;
$$;
revoke execute on function public.set_household_spend_rule(text, text, jsonb, int) from public, anon;
grant execute on function public.set_household_spend_rule(text, text, jsonb, int) to authenticated;

-- GDPR purge: a member who goes (left, removed, account deleted) leaves no user id in the saved shares.
create or replace function public.hh_strip_spend_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.household_spend_rules
     set shares = shares - old.user_id::text
   where household_id = old.household_id and shares is not null and shares ? old.user_id::text;
  return null;
end;
$$;
revoke execute on function public.hh_strip_spend_share() from public, anon, authenticated;
create trigger strip_spend_share after delete on public.household_members
  for each row execute function public.hh_strip_spend_share();
