-- 05-51 (D-19, split from 05-18): sample data v2 = the demo scenario. Copied in full from 20261010000600 and changed only where marked `05`.
-- Every demo constant carries a `-- demo:<key>=<value>` marker checked by scripts/check-decide-demo-mirror.mjs.
--
-- The seed is the demo account's data (App Review, store screenshots): six full past months plus the current month from one
-- monthly template, a confirmed monthly Salary series, savings and investment transfers, a Student loan, a Credit card that is
-- paid in full, a decide settings row with investing_floor = 0 (05-18 deviation 1) and two open checks (Sofa, Car).
-- The figures are USD whole units; non-USD homes are scaled by v_mult like v1. The check inputs are stored as typed (USD minor
-- units): the screenshot account is USD-home. Nothing here is a default rate: the car loan APR is typed text (04 D-07).

-- 1. sample_data_exists: unchanged.
create or replace function public.sample_data_exists(p_household_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.transactions t where t.household_id = p_household_id and t.is_sample)
      or exists (select 1 from public.accounts a where a.household_id = p_household_id and a.is_sample and a.deleted_at is null)
$$;

-- 2. seed_sample_data.
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
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;
  if p_today is null or abs(p_today - current_date) > 2 then
    raise exception 'p_today must be within 2 days of today' using errcode = '22023';
  end if;
  if public.sample_data_exists(p_household_id) then
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
   where t.household_id = p_household_id order by t.created_at desc limit 1;
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
  insert into public.decide_settings (user_id, currency, investing_floor)
  values (v_user, v_home, 0)   -- demo:settings.investingFloor=0
  on conflict (user_id) do update set investing_floor = 0 where public.decide_settings.investing_floor is null;

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

  return jsonb_build_object('status', 'applied', 'accounts', 5, 'transactions', v_n, 'series', 1, 'checks', 2, 'debts', 2);
end;
$$;

-- 3. clear_sample_data (D-09, D-10): not undoable.
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
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);

  -- 05: sample checks, their links and both sample debts rows go first. User-made checks, debts and rows written by
  -- Go ahead (never is_sample) are untouched.
  delete from public.decide_links where check_id in (select id from public.decide_checks where household_id = p_household_id and is_sample);
  with d as (
    delete from public.decide_checks where household_id = p_household_id and is_sample returning 1
  ) select count(*) into v_checks from d;
  with d as (
    delete from public.debts where household_id = p_household_id and is_sample returning 1
  ) select count(*) into v_debts from d;
  -- 05: the seed's typed limits row (investing_floor 0 and nothing else typed) goes with the sample figures.
  delete from public.decide_settings
   where user_id = v_user and investing_floor = 0 and rough_income is null and rough_spending is null and reserve is null
     and dsr_line is null and unsecured_multiple is null and saving_floor is null and basis_override is null;

  -- Transactions still flagged, soft-deleted ones included.
  with d as (
    delete from public.transactions where household_id = p_household_id and is_sample returning 1
  ) select count(*) into v_tx from d;

  -- Series: delete when no row references them, else convert.
  with d as (
    delete from public.recurring_series s
     where s.household_id = p_household_id and s.is_sample
       and not exists (select 1 from public.transactions t where t.recurring_series_id = s.id)
    returning 1
  ) select count(*) into v_series from d;
  update public.recurring_series set is_sample = false
   where household_id = p_household_id and is_sample;
  get diagnostics k = row_count;
  v_kept := v_kept + k;

  -- Accounts.
  with d as (
    delete from public.accounts a
     where a.household_id = p_household_id and a.is_sample
       and not exists (select 1 from public.transactions t where t.account_id = a.id)
       and not exists (select 1 from public.recurring_series s where s.account_id = a.id)
    returning 1
  ) select count(*) into v_accts from d;
  update public.accounts set is_sample = false
   where household_id = p_household_id and is_sample;
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

  return jsonb_build_object('status', 'applied', 'transactions', v_tx, 'series', v_series,
                            'accounts', v_accts, 'categories', v_cats, 'checks', v_checks, 'debts', v_debts, 'kept', v_kept);
end;
$$;

revoke execute on function public.sample_data_exists(uuid) from public, anon;
revoke execute on function public.seed_sample_data(uuid, date) from public, anon;
revoke execute on function public.clear_sample_data(uuid) from public, anon;
grant execute on function public.sample_data_exists(uuid) to authenticated;
grant execute on function public.seed_sample_data(uuid, date) to authenticated;
grant execute on function public.clear_sample_data(uuid) to authenticated;
