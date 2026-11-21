-- 08.1-23 (CMP-F19, UX-21, HH-34; owner 2026-11-21 Q10): the group can mark a joint savings account as its shared safety net.
-- Decide then counts it once for everyone as the net's saved amount and never spends it. A safety net is never "can be spent".
-- Additive only. File only: plan 08.1-15 runs it with the other 08.1 migrations on a local reset first, then pushes.

alter table public.accounts
  add column joint_safety_net boolean not null default false;
alter table public.accounts add constraint accounts_joint_safety_net_savings_only check (not joint_safety_net or joint_purpose = 'savings');
alter table public.accounts add constraint accounts_joint_safety_net_not_spendable check (not (joint_safety_net and joint_savings_spendable));
-- No column grant: like the purpose, it changes every member's answers, so the client writes it only through the RPC below.

-- An account that stops being joint loses its purpose, its spendable mark and its safety-net mark.
create or replace function public.hh_clear_joint_purpose()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.is_shared then
    new.joint_purpose := null;
    new.joint_savings_spendable := false;
    new.joint_safety_net := false;
  end if;
  return new;
end;
$$;
revoke execute on function public.hh_clear_joint_purpose() from public, anon, authenticated;

-- The purpose RPC gains p_safety_net (default false). Older clients keep working: PostgREST resolves their four named arguments to
-- the five-argument function through the default. Keeping both overloads would make those calls ambiguous.
-- contract-ok: min_version >= 0.2.0
drop function if exists public.set_joint_account_purpose(uuid, text, boolean, int);

-- Any member of the household may set it (owner decision 22 Q2). Failures return {"ok": false, "reason": ...}. The safety-net mark is
-- kept only on joint savings, and it switches "can be spent" off.
create or replace function public.set_joint_account_purpose(
  p_account uuid,
  p_purpose text,
  p_spendable boolean,
  p_expected_version int default null,
  p_safety_net boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  a public.accounts%rowtype;
  net boolean := (p_purpose = 'savings' and coalesce(p_safety_net, false));
  spend boolean := (p_purpose = 'savings' and coalesce(p_spendable, false) and not (p_purpose = 'savings' and coalesce(p_safety_net, false)));
begin
  select * into a from public.accounts x
   where x.id = p_account and x.household_id in (select public.user_household_ids()) and x.deleted_at is null for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if not a.is_shared then return jsonb_build_object('ok', false, 'reason', 'not_joint'); end if;
  if p_purpose is not null and p_purpose not in ('bills', 'savings', 'everyday') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_purpose');
  end if;
  if p_expected_version is not null and p_expected_version <> a.version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', a.version);
  end if;
  update public.accounts
     set joint_purpose = p_purpose,
         joint_savings_spendable = coalesce(spend, false),
         joint_safety_net = coalesce(net, false)
   where id = a.id;
  perform public.hh_event(a.household_id, 'joint_purpose_changed', null, a.id, null, jsonb_build_object(
    'before', jsonb_build_object('purpose', a.joint_purpose, 'spendable', a.joint_savings_spendable, 'safety_net', a.joint_safety_net),
    'after', jsonb_build_object('purpose', p_purpose, 'spendable', coalesce(spend, false), 'safety_net', coalesce(net, false)),
    'account_name', a.name));
  return jsonb_build_object('ok', true, 'version', a.version + 1);
end;
$$;
revoke execute on function public.set_joint_account_purpose(uuid, text, boolean, int, boolean) from public, anon;
grant execute on function public.set_joint_account_purpose(uuid, text, boolean, int, boolean) to authenticated;
