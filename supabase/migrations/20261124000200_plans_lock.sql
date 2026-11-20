-- Phase 9 (09-03): D-02/D-40 server lock, D-29 tester backfill. The backfill runs in this same migration so the lock never ships alone.

-- 1. The guard (RESEARCH Pitfall 5: triggers fire for SECURITY DEFINER code, RLS does not) ------------------------
create or replace function public.guard_plan_lock() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  hid uuid := nullif(rec ->> 'household_id', '')::uuid;
  uid uuid := (select auth.uid());
begin
  -- No session (service role, cron, signup triggers) or a named bypass RPC: never locked.
  if uid is null or coalesce(current_setting('fincwin.plan_bypass', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- Owner-scoped tables (categories, rules, ...) have no household_id: judge the caller's household.
  if hid is null then
    select m.household_id into hid from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  end if;
  if hid is not null and not public.household_writable(hid) then
    raise exception 'plan locked' using errcode = 'PT402', hint = 'plan_locked';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
revoke execute on function public.guard_plan_lock() from public, anon, authenticated;

-- 2. The trigger on every client-writable records table ---------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'transactions','accounts','categories','category_rules','recurring_series','recurring_dismissals','dismissed_series_offers',
    'custom_currencies','import_profiles','undo_log','decide_checks','decide_settings','decide_answers','decide_links',
    'decide_changes','decide_check_history','debts','savings_goals','holdings','holding_lots','statement_periods',
    'income_payer_prompts','transaction_splits','transaction_member_categories','settlements','settlement_lines',
    'household_split_defaults']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists plan_lock on public.%I', t);
      execute format('create trigger plan_lock before insert or update or delete on public.%I for each row execute function public.guard_plan_lock()', t);
    end if;
  end loop;
end
$$;

-- 3. Tester backfill (Owner Answer 8) ---------------------------------------------------------------------------
create or replace function public.plan_backfill_testers() returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  insert into public.household_plans (household_id, store, plan_size, status, promo_kind, covered_until, will_renew)
  select h.id, 'BACKFILL', 6, 'promo', 'tester', null, false from public.households h
  on conflict (household_id) do nothing;
  get diagnostics n = row_count;

  insert into public.user_setup (user_id, level, level_source, completed_at, existing_card)
  select u.id, 4, 'existing', now(), 'pending' from auth.users u
  on conflict (user_id) do nothing;

  return n;
end
$$;
revoke execute on function public.plan_backfill_testers() from public, anon, authenticated;

-- Owner Answer 8: every current production household becomes a tester household; the end date is set at launch by
-- plan-grant (09-06) and shown in the app.
select public.plan_backfill_testers();

-- 4. Sample RPCs with the plan bypass (D-17b)
-- newest body: 20261124000200_plans_lock.sql (09-03 adds the plan bypass). Copied verbatim from 20261122000300_household_privacy_rpcs.sql;
-- the only changes are the set_config('fincwin.plan_bypass', 'on', true) first statement and an 'off' reset before every return,
-- so the bypass cannot outlive the call inside one transaction. Grants are unchanged (create or replace keeps them).
create or replace function public.seed_sample_data(p_household_id uuid, p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_home text;
  v_exp int;
  v_mult numeric;
  v_month date;
  v_m date;
  v_last int;
  v_tz text;
  v_i int;
  v_acct_main uuid := gen_random_uuid();
  v_acct_card uuid := gen_random_uuid();
  v_acct_cash uuid := gen_random_uuid();
  v_acct_sav uuid := gen_random_uuid();   -- 05
  v_acct_inv uuid := gen_random_uuid();   -- 05
  v_series uuid := gen_random_uuid();
  v_transfer_cat uuid;
  v_n int := 0;
  v_k int;
begin
  perform set_config('fincwin.plan_bypass', 'on', true);
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;
  if p_today is null or abs(p_today - current_date) > 2 then
    raise exception 'p_today must be within 2 days of today' using errcode = '22023';
  end if;
  if public.sample_data_exists(p_household_id) then
    perform set_config('fincwin.plan_bypass', 'off', true);
    return jsonb_build_object('status', 'already-seeded');
  end if;

  select p.home_currency into v_home from public.profiles p where p.id = v_user;
  if v_home is null then
    raise exception 'no profile for user' using errcode = '42501';
  end if;
  v_exp := public.currency_exponent(v_home, v_user);
  v_mult := coalesce(
    (('{"JPY":150,"KRW":1300,"INR":80,"IDR":15000,"VND":25000,"HUF":350,"CLP":900,"COP":4000,"NGN":1500,"PKR":280,"LKR":300,"PHP":55,"THB":35,"TWD":32,"CZK":23,"SEK":10,"NOK":10,"DKK":7,"ZAR":18,"MXN":18,"BRL":5,"TRY":30,"RUB":90,"UAH":40,"EGP":48}'::jsonb) ->> v_home)::numeric,
    1);

  v_month := date_trunc('month', p_today)::date;
  -- demo:pastMonths=6

  select t.time_zone into v_tz from public.transactions t
   where t.household_id = p_household_id and t.created_by = v_user order by t.created_at desc limit 1;  -- 08-05: own lines only
  v_tz := coalesce(v_tz, 'UTC');

  select c.id into v_transfer_cat from public.categories c where c.owner_id = v_user and c.builtin_key = 'Transfer';

  -- Accounts. 05: Savings and Investments added.
  insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, credit_limit, is_sample)
  values
    (v_acct_main, p_household_id, v_user, 'Everyday account', 'checking', v_home,
       (round(2400 * v_mult) * 10 ^ v_exp)::bigint, null, true),   -- demo:account.everyday.opening=2400
    (v_acct_card, p_household_id, v_user, 'Credit card', 'credit', v_home,
       0, (round(3000 * v_mult) * 10 ^ v_exp)::bigint, true),
    (v_acct_cash, p_household_id, v_user, 'Cash', 'cash', v_home,
       (round(80 * v_mult) * 10 ^ v_exp)::bigint, null, true),   -- demo:account.cash.opening=80
    (v_acct_sav, p_household_id, v_user, 'Savings', 'savings', v_home,
       (round(7200 * v_mult) * 10 ^ v_exp)::bigint, null, true),   -- demo:account.savings.opening=7200
    (v_acct_inv, p_household_id, v_user, 'Investments', 'investment', v_home,
       (round(2000 * v_mult) * 10 ^ v_exp)::bigint, null, true);   -- demo:account.investments.opening=2000

  -- 05: the confirmed monthly Salary series (OQ-A7): anchored on the 5th of the first seeded month, materialised through the
  -- end of the current month (the daily job carries it on from there). Occurrences inherit is_sample.
  insert into public.recurring_series (
    id, household_id, created_by, account_id, name, amount, currency, category_id,
    freq, anchor_date, time_zone, materialised_through, is_sample
  ) values (
    v_series, p_household_id, v_user, v_acct_main, 'Salary',
    (round(4400 * v_mult) * 10 ^ v_exp)::bigint, v_home,   -- demo:salary.major=4400
    (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = 'Income'),
    'monthly',
    (v_month - interval '6 months')::date + (5 - 1),   -- demo:salary.day=5
    v_tz, (v_month + interval '1 month' - interval '1 day')::date, true
  );

  -- 05: the current month and the 6 months before it (part 2, OQ-A7), one template for every month.
  for v_i in 0..6 loop
    v_m := (v_month - make_interval(months => v_i))::date;
    v_last := extract(day from (v_m + interval '1 month' - interval '1 day'))::int;

    -- Salary, linked to the series the way materialised occurrences are.
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample, recurring_series_id, occurrence_date
    ) values (
      gen_random_uuid(), p_household_id, v_acct_main, v_user,
      (round(4400 * v_mult) * 10 ^ v_exp)::bigint, v_home,
      v_m + (least(5, v_last) - 1), v_tz, 'Salary',
      (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = 'Income'),
      case when v_m + (least(5, v_last) - 1) <= p_today then 'paid' else 'pending' end,
      true, v_series, v_m + (least(5, v_last) - 1)
    );
    v_n := v_n + 1;

    with raw (idx, day, name, major, key) as (values
      (0,
        2,  -- demo:template.0.day=2
        'Rent',
        -1600,  -- demo:template.0.major=-1600
        'Housing'),
      (1,
        4,  -- demo:template.1.day=4
        'Weekly shop',
        -140,  -- demo:template.1.major=-140
        'Groceries'),
      (2,
        11,  -- demo:template.2.day=11
        'Weekly shop',
        -140,  -- demo:template.2.major=-140
        'Groceries'),
      (3,
        18,  -- demo:template.3.day=18
        'Weekly shop',
        -140,  -- demo:template.3.major=-140
        'Groceries'),
      (4,
        25,  -- demo:template.4.day=25
        'Weekly shop',
        -140,  -- demo:template.4.major=-140
        'Groceries'),
      (5,
        6,  -- demo:template.5.day=6
        'Utilities',
        -170,  -- demo:template.5.major=-170
        'Utilities'),
      (6,
        8,  -- demo:template.6.day=8
        'Transport',
        -220,  -- demo:template.6.major=-220
        'Transport'),
      (7,
        12,  -- demo:template.7.day=12
        'Dining out',
        -180,  -- demo:template.7.major=-180
        'Dining'),
      (8,
        1,  -- demo:template.8.day=1
        'Subscriptions',
        -40,  -- demo:template.8.major=-40
        'Subscriptions'),
      (9,
        20,  -- demo:template.9.day=20
        'Insurance',
        -150,  -- demo:template.9.major=-150
        'Insurance'),
      (10,
        22,  -- demo:template.10.day=22
        'Student loan',
        -190,  -- demo:template.10.major=-190
        'Debt')
    )
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample
    )
    select gen_random_uuid(), p_household_id, v_acct_main, v_user,
           (round(r.major * v_mult) * 10 ^ v_exp)::bigint, v_home,
           v_m + (least(r.day, v_last) - 1), v_tz, r.name,
           (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = r.key),
           case when v_m + (least(r.day, v_last) - 1) <= p_today then 'paid' else 'pending' end,
           true
      from raw r;
    get diagnostics v_k = row_count;
    v_n := v_n + v_k;

    -- Savings transfer (two legs sharing a transfer_id) on the 3rd.
    with t (tid) as (select gen_random_uuid())
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample, transfer_id
    )
    select gen_random_uuid(), p_household_id, leg.acct, v_user,
           (round(leg.major * v_mult) * 10 ^ v_exp)::bigint, v_home,
           v_m + (least(3, v_last) - 1), v_tz, 'To savings', v_transfer_cat,
           case when v_m + (least(3, v_last) - 1) <= p_today then 'paid' else 'pending' end,
           true, t.tid
      from t,
           (values (v_acct_main, -500), (v_acct_sav, 500)) as leg (acct, major);   -- demo:transfer.savings=500
    v_n := v_n + 2;

    -- Investment transfer on the 3rd.
    with t (tid) as (select gen_random_uuid())
    insert into public.transactions (
      id, household_id, account_id, created_by, original_amount, original_currency,
      local_date, time_zone, name, category_id, status, is_sample, transfer_id
    )
    select gen_random_uuid(), p_household_id, leg.acct, v_user,
           (round(leg.major * v_mult) * 10 ^ v_exp)::bigint, v_home,
           v_m + (least(3, v_last) - 1), v_tz, 'To investments', v_transfer_cat,
           case when v_m + (least(3, v_last) - 1) <= p_today then 'paid' else 'pending' end,
           true, t.tid
      from t,
           (values (v_acct_main, -400), (v_acct_inv, 400)) as leg (acct, major);   -- demo:transfer.investing=400
    v_n := v_n + 2;
  end loop;

  -- 05: debts. The Student loan, and the Credit card's terms row (D-40: paid in full every month adds no minimum).
  insert into public.debts (id, household_id, created_by, name, kind, currency, balance, apr, minimum_payment, secured, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, 'Student loan', 'loan', v_home,
    (round(6200 * v_mult) * 10 ^ v_exp)::bigint,   -- demo:debt.balance=6200
    '5.5',   -- demo:debt.apr=5.5
    (round(190 * v_mult) * 10 ^ v_exp)::bigint,   -- demo:debt.minimum=190
    false, true);
  insert into public.debts (id, household_id, created_by, account_id, name, kind, currency, balance, apr, minimum_payment, secured,
                            min_percent, min_interest_added, min_floor, paid_in_full, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, v_acct_card, 'Credit card', 'card', v_home, 0, null, 0, false,
    null, null, null, true, true);   -- demo:cardDebt.paidInFull=true

  -- 05: the typed limits the demo needs. investing_floor 0 (05-18 deviation 1); a row the user already has is kept.
  -- A new row is marked seeded (the guard trigger honours fincwin.decide_seed); an existing row is never marked.
  perform set_config('fincwin.decide_seed', 'on', true);
  insert into public.decide_settings (user_id, currency, investing_floor, seeded)
  values (v_user, v_home, 0, true)   -- demo:settings.investingFloor=0
  on conflict (user_id) do update set investing_floor = 0 where public.decide_settings.investing_floor is null;
  perform set_config('fincwin.decide_seed', '', true);

  -- 05: the two open checks.
  insert into public.decide_checks (id, household_id, created_by, kind, name, inputs, status, furthest_step, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, 'buy', 'Sofa',
    -- demo:sofaInputs={"name":"Sofa","itemType":"general","advertised":180000,"method":"cash","combine":false}
    '{"name":"Sofa","itemType":"general","advertised":180000,"method":"cash","combine":false}'::jsonb,
    'open', 3, true);
  insert into public.decide_checks (id, household_id, created_by, kind, name, inputs, status, furthest_step, is_sample)
  values (
    gen_random_uuid(), p_household_id, v_user, 'buy', 'Car',
    -- demo:carInputs={"name":"Car","itemType":"vehicle","advertised":1450000,"method":"loan","combine":true,"loan":{"deposit":700000,"termMonths":24,"aprText":"6.9","secured":true},"runningCosts":[{"name":"Insurance","amount":16000,"category":"insurance"},{"name":"Fuel","amount":14000,"category":"fuel"},{"name":"Parking","amount":6000,"category":null}],"replaces":[{"name":"Bus pass","amount":12000,"category":null}]}
    '{"name":"Car","itemType":"vehicle","advertised":1450000,"method":"loan","combine":true,"loan":{"deposit":700000,"termMonths":24,"aprText":"6.9","secured":true},"runningCosts":[{"name":"Insurance","amount":16000,"category":"insurance"},{"name":"Fuel","amount":14000,"category":"fuel"},{"name":"Parking","amount":6000,"category":null}],"replaces":[{"name":"Bus pass","amount":12000,"category":null}]}'::jsonb,
    'open', 3, true);

  perform set_config('fincwin.plan_bypass', 'off', true);

  return jsonb_build_object('status', 'applied', 'accounts', 5, 'transactions', v_n, 'series', 1, 'checks', 2, 'debts', 2);
end;
$$;

-- 08-05: sample data acts only on rows the caller created (a member clearing theirs must not clear another member's).
create or replace function public.clear_sample_data(p_household_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_tx int := 0;
  v_series int := 0;
  v_accts int := 0;
  v_cats int := 0;
  v_checks int := 0;
  v_debts int := 0;
  v_kept int := 0;
  k int;
begin
  perform set_config('fincwin.plan_bypass', 'on', true);
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);

  -- 05: sample checks, their links and both sample debts rows go first. User-made checks, debts and rows written by
  -- Go ahead (never is_sample) are untouched.
  delete from public.decide_links where check_id in (select id from public.decide_checks where household_id = p_household_id and created_by = v_user and is_sample);
  with d as (
    delete from public.decide_checks where household_id = p_household_id and created_by = v_user and is_sample returning 1
  ) select count(*) into v_checks from d;
  with d as (
    delete from public.debts where household_id = p_household_id and created_by = v_user and is_sample returning 1
  ) select count(*) into v_debts from d;
  -- 05: the seed's typed limits row goes with the sample figures, only while it is still marked seeded (a user edit clears the mark).
  delete from public.decide_settings where user_id = v_user and seeded;

  -- Transactions still flagged, soft-deleted ones included.
  with d as (
    delete from public.transactions where household_id = p_household_id and created_by = v_user and is_sample returning 1
  ) select count(*) into v_tx from d;

  -- Series: delete when no row references them, else convert.
  with d as (
    delete from public.recurring_series s
     where s.household_id = p_household_id and s.created_by = v_user and s.is_sample
       and not exists (select 1 from public.transactions t where t.recurring_series_id = s.id)
    returning 1
  ) select count(*) into v_series from d;
  update public.recurring_series set is_sample = false
   where household_id = p_household_id and created_by = v_user and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  -- Accounts.
  with d as (
    delete from public.accounts a
     where a.household_id = p_household_id and a.created_by = v_user and a.is_sample
       and not exists (select 1 from public.transactions t where t.account_id = a.id)
       and not exists (select 1 from public.recurring_series s where s.account_id = a.id)
    returning 1
  ) select count(*) into v_accts from d;
  update public.accounts set is_sample = false
   where household_id = p_household_id and created_by = v_user and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  -- Categories owned by the caller.
  with d as (
    delete from public.categories c
     where c.owner_id = v_user and c.is_sample
       and not exists (select 1 from public.transactions t where t.category_id = c.id)
       and not exists (select 1 from public.recurring_series s where s.category_id = c.id)
    returning 1
  ) select count(*) into v_cats from d;
  update public.categories set is_sample = false
   where owner_id = v_user and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  perform set_config('fincwin.system_restamp', '', true);

  perform set_config('fincwin.plan_bypass', 'off', true);

  return jsonb_build_object('status', 'applied', 'transactions', v_tx, 'series', v_series,
                            'accounts', v_accts, 'categories', v_cats, 'checks', v_checks, 'debts', v_debts, 'kept', v_kept);
end;
$$;


-- 5. Who may bypass the lock -------------------------------------------------------------------------------------
-- - service role / cron / signup triggers: auth.uid() is null (recurring materialisation keeps running for locked households)
-- - sample RPCs in this file (seed_sample_data, clear_sample_data; redate_sample_data_if_stale calls them)
-- - hh_depart (09-04) and plan_apply (09-05) will set fincwin.plan_bypass inside their own bodies
-- The GUC is transaction-local, set only inside those named definer RPCs, and reset before they return.
