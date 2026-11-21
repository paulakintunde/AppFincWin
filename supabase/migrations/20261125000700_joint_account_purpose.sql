-- 08.1-22 (CMP-F19, UX-21, ENG-26): what each joint account is for, and the month totals Decide needs to count joint money once.
-- Owner 2026-11-20: the group sets a purpose per joint account (joint bills, joint savings, joint everyday); a joint savings account
-- may be marked spendable. A joint account with no purpose yet counts as everyday (client rule). Additive only.

alter table public.accounts
  add column joint_purpose text check (joint_purpose in ('bills', 'savings', 'everyday')),
  add column joint_savings_spendable boolean not null default false;
alter table public.accounts add constraint accounts_joint_purpose_joint_only check (joint_purpose is null or is_shared);
alter table public.accounts add constraint accounts_joint_spendable_savings_only check (not joint_savings_spendable or joint_purpose = 'savings');
-- No column grant: the purpose changes every member's answers, so the client writes it only through the RPC below.

-- An account that stops being joint loses its purpose (a BEFORE trigger, so the checks above see the cleared values).
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
  end if;
  return new;
end;
$$;
revoke execute on function public.hh_clear_joint_purpose() from public, anon, authenticated;
create trigger clear_joint_purpose before update of is_shared on public.accounts
  for each row execute function public.hh_clear_joint_purpose();

-- Any member of the household may set it (owner decision Q2). Failures return {"ok": false, "reason": ...}.
-- accounts carries a version (bump_version), so a stale p_expected_version is a version_conflict; null skips the check.
create or replace function public.set_joint_account_purpose(p_account uuid, p_purpose text, p_spendable boolean, p_expected_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  a public.accounts%rowtype;
  spend boolean := coalesce(p_spendable, false);
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
  update public.accounts set joint_purpose = p_purpose, joint_savings_spendable = (p_purpose = 'savings' and spend) where id = a.id;
  perform public.hh_event(a.household_id, 'joint_purpose_changed', null, a.id, null, jsonb_build_object(
    'before', jsonb_build_object('purpose', a.joint_purpose, 'spendable', a.joint_savings_spendable),
    'after', jsonb_build_object('purpose', p_purpose, 'spendable', (p_purpose = 'savings' and spend)),
    'account_name', a.name));
  return jsonb_build_object('ok', true, 'version', a.version + 1);
end;
$$;
revoke execute on function public.set_joint_account_purpose(uuid, text, boolean, int) from public, anon;
grant execute on function public.set_joint_account_purpose(uuid, text, boolean, int) to authenticated;

-- Totals for each joint account between two dates: money in, money out (paid lines, full amounts) and, per member, how much
-- they paid in (owner decision Q3 B: joint money under "What each person brings" splits by what each paid in this month).
-- Totals only: no line id, name or date is returned (T-08.1-66). A member sees only their own household's joint accounts.
-- p_to is exclusive.
create or replace function public.joint_account_month(p_household_id uuid, p_from date, p_to date)
returns table (account_id uuid, currency text, money_in bigint, money_out bigint, paid_in_by jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with lines as (
    select t.account_id, t.original_currency as cur, t.created_by, t.original_amount
      from public.transactions t
      join public.accounts a on a.id = t.account_id
     where p_household_id in (select public.user_household_ids())
       and a.household_id = p_household_id
       and a.is_shared
       and a.deleted_at is null
       and t.household_id = p_household_id
       and t.deleted_at is null
       and t.status = 'paid'
       and t.local_date >= p_from and t.local_date < p_to),
  per_member as (
    select l.account_id, l.cur, l.created_by, sum(l.original_amount)::bigint as paid_in
      from lines l where l.original_amount > 0 group by l.account_id, l.cur, l.created_by),
  totals as (
    select l.account_id, l.cur,
           coalesce(sum(l.original_amount) filter (where l.original_amount > 0), 0)::bigint as money_in,
           coalesce(-sum(l.original_amount) filter (where l.original_amount < 0), 0)::bigint as money_out
      from lines l group by l.account_id, l.cur)
  select t.account_id, t.cur, t.money_in, t.money_out,
         coalesce((select jsonb_object_agg(m.created_by::text, m.paid_in) from per_member m
                    where m.account_id = t.account_id and m.cur = t.cur), '{}'::jsonb)
    from totals t
$$;
revoke execute on function public.joint_account_month(uuid, date, date) from public, anon;
grant execute on function public.joint_account_month(uuid, date, date) to authenticated;
