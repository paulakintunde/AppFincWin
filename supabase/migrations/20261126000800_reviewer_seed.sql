-- Phase 10 (10-25): D-26 reviewer account life and nightly reset (no service key in CI). Reviewer accounts are never Decide testers (05.4 D-29).
--
-- reset_reviewer_account() puts the store-review household back to one fixed sample life: about six months of records
-- (the existing demo seed), a savings goal, a debt, a second sample member with shared lines, Decide checks ready, and the top
-- plan. It finds the two accounts only through reviewer_allowlist.note ('reviewer' / 'reviewer-partner'); with either missing
-- it does nothing. It never touches any other household, and it never switches Decide testing on for these accounts
-- (that flag is server-only and owned by the tester list; this function does not write it).

create or replace function public.reset_reviewer_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev uuid;
  v_par uuid;
  v_hh uuid;
  v_home text;
  r record;
  v_pass int;
  v_left int;
  v_goal int;
  v_debt int;
  v_acct uuid;
  v_exp int;
begin
  select user_id into v_rev from public.reviewer_allowlist where note = 'reviewer' and user_id is not null limit 1;
  select user_id into v_par from public.reviewer_allowlist where note = 'reviewer-partner' and user_id is not null limit 1;
  if v_rev is null or v_par is null then
    return jsonb_build_object('status', 'skipped');
  end if;
  select h.id into v_hh from public.households h where h.owner_id = v_rev order by h.created_at limit 1;
  if v_hh is null then
    return jsonb_build_object('status', 'skipped');
  end if;

  -- No session while wiping: guards that judge the caller stand aside for a job, as they do for cron.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('fincwin.plan_bypass', 'on', true);
  perform set_config('fincwin.system_restamp', 'on', true);
  perform set_config('fincwin.household_rpc', 'on', true);

  -- 1. Wipe every household-scoped row of the reviewer household, retrying so foreign-key order sorts itself out.
  for v_pass in 1..8 loop
    v_left := 0;
    for r in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'household_id' and t.table_type = 'BASE TABLE'
         and c.table_name not in ('households', 'household_members', 'household_plans')
    loop
      begin
        execute format('delete from public.%I where household_id = $1', r.table_name) using v_hh;
      exception when others then
        v_left := v_left + 1;
      end;
    end loop;
    exit when v_left = 0;
  end loop;

  -- 2. Top plan, then the second member.
  insert into public.household_plans (household_id, payer_id, store, plan_key, plan_size, status, promo_kind, covered_until, will_renew)
  values (v_hh, v_rev, 'PROMOTIONAL', 'extended', 12, 'promo', 'owner', now() + interval '400 days', false)
  on conflict (household_id) do update
    set payer_id = excluded.payer_id, store = excluded.store, plan_key = excluded.plan_key, plan_size = excluded.plan_size,
        status = excluded.status, promo_kind = excluded.promo_kind, covered_until = excluded.covered_until,
        will_renew = excluded.will_renew, grace_until = null, billing_issue_at = null;

  insert into public.household_members (household_id, user_id, is_owner, weight, role_label, display_name)
  values (v_hh, v_par, false, 50, 'Partner', 'Sample partner')
  on conflict (household_id, user_id) do nothing;
  update public.household_members set weight = 50 where household_id = v_hh and user_id = v_rev;

  -- 3. The demo scenario, seeded as the reviewer.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_rev, 'role', 'authenticated')::text, true);
  perform public.seed_sample_data(v_hh, current_date);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('fincwin.plan_bypass', 'on', true);
  perform set_config('fincwin.system_restamp', 'on', true);
  perform set_config('fincwin.household_rpc', 'on', true);

  select p.home_currency into v_home from public.profiles p where p.id = v_rev;
  v_home := coalesce(v_home, 'USD');
  v_exp := public.currency_exponent(v_home, v_rev);

  -- 4. A goal and a debt, in case the demo seed made none.
  select count(*) into v_goal from public.savings_goals where household_id = v_hh and deleted_at is null;
  if v_goal = 0 then
    insert into public.savings_goals (id, household_id, created_by, name, currency, target, monthly_amount, opening_saved)
    values (gen_random_uuid(), v_hh, v_rev, 'Holiday', v_home,
            (3000 * 10 ^ v_exp)::bigint, (200 * 10 ^ v_exp)::bigint, (500 * 10 ^ v_exp)::bigint);
  end if;
  select count(*) into v_debt from public.debts where household_id = v_hh;
  if v_debt = 0 then
    insert into public.debts (id, household_id, created_by, name, kind, currency, balance, apr, minimum_payment, secured)
    values (gen_random_uuid(), v_hh, v_rev, 'Student loan', 'loan', v_home,
            (6200 * 10 ^ v_exp)::bigint, '5.5', (190 * 10 ^ v_exp)::bigint, false);
  end if;

  -- 5. Second-member activity: the everyday account becomes joint, and its few latest spends are shared and paid by the partner.
  select a.id into v_acct from public.accounts a where a.household_id = v_hh and a.kind = 'checking' order by a.created_at limit 1;
  if v_acct is not null then
    update public.accounts set is_shared = true where id = v_acct;
    update public.transactions set is_shared = true, paid_by = v_par
     where id in (select t.id from public.transactions t
                   where t.household_id = v_hh and t.account_id = v_acct and t.original_amount < 0
                     and t.deleted_at is null and t.local_date <= current_date
                   order by t.local_date desc, t.id limit 6);
  end if;

  -- 6. Nothing here is "sample" any more: the review account is a normal full account. The guards that pin is_sample are
  -- triggers, so this step runs with user triggers off (no foreign key is touched by it).
  begin
    perform set_config('session_replication_role', 'replica', true);
  exception when others then
    null;
  end;
  for r in
    select c.table_name,
           bool_or(c.column_name = 'household_id') as by_household
      from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
       and c.column_name in ('household_id', 'owner_id')
       and c.table_name in (select table_name from information_schema.columns
                             where table_schema = 'public' and column_name = 'is_sample')
     group by c.table_name
  loop
    if r.by_household then
      execute format('update public.%I set is_sample = false where household_id = $1 and is_sample', r.table_name) using v_hh;
    else
      execute format('update public.%I set is_sample = false where owner_id = any($1) and is_sample', r.table_name)
        using array[v_rev, v_par];
    end if;
  end loop;
  perform set_config('session_replication_role', 'origin', true);

  perform set_config('fincwin.plan_bypass', 'off', true);
  perform set_config('fincwin.system_restamp', '', true);
  perform set_config('fincwin.household_rpc', '', true);
  return jsonb_build_object('status', 'reset');
end;
$$;

revoke execute on function public.reset_reviewer_account() from public, anon, authenticated;
grant execute on function public.reset_reviewer_account() to service_role;

-- 09:30 UTC, nightly.
do $$
begin
  perform cron.unschedule('reviewer-reset-nightly');
exception when others then
  null;
end
$$;
select cron.schedule('reviewer-reset-nightly', '30 9 * * *', $$select public.reset_reviewer_account()$$);
