-- Phase 2.2 REC-23 sample figures. CONTEXT D-09, D-10, D-11, D-12; server RPC
-- by Claude's discretion (RESEARCH Pattern 6): a client generator would need
-- an is_sample write grant, which would let any client mark real rows for
-- deletion. Instead the three functions below are security definer and the
-- flag is never client-writable.
--
-- Synthetic data only: names are English (the catalogue is English-only
-- today) and no figure claims to describe a real user.
--
-- seed_sample_data inserts through normal inserts, so the currency/time-zone
-- guards and the FX stamping trigger apply; fincwin.system_restamp is left
-- off. clear_sample_data hard-deletes only rows still flagged is_sample, and
-- converts (is_sample = false) any sample account, category or series that a
-- real or edited row still uses. It is not undoable: no undo_log row.

-- 1. sample_data_exists: does the banner show (D-11)?
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
  v_fexp int;
  v_foreign text;
  v_mult numeric;
  v_month date;
  v_last int;
  v_today_day int;
  v_tz text;
  v_acct_main uuid := gen_random_uuid();
  v_acct_card uuid := gen_random_uuid();
  v_acct_cash uuid := gen_random_uuid();
  v_trips uuid := gen_random_uuid();
  v_series uuid := gen_random_uuid();
  v_n int;
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

  v_foreign := case when v_home <> 'EUR' then 'EUR' else 'USD' end;
  v_fexp := public.currency_exponent(v_foreign, v_user);

  v_month := date_trunc('month', p_today)::date;
  v_last := extract(day from (v_month + interval '1 month' - interval '1 day'))::int;
  v_today_day := extract(day from p_today)::int;

  select t.time_zone into v_tz from public.transactions t
   where t.household_id = p_household_id order by t.created_at desc limit 1;
  v_tz := coalesce(v_tz, 'UTC');

  -- Accounts.
  insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, credit_limit, is_sample)
  values
    (v_acct_main, p_household_id, v_user, 'Everyday account', 'checking', v_home,
       (round(2400 * v_mult) * 10 ^ v_exp)::bigint, null, true),
    (v_acct_card, p_household_id, v_user, 'Credit card', 'credit', v_home,
       0, (round(3000 * v_mult) * 10 ^ v_exp)::bigint, true),
    (v_acct_cash, p_household_id, v_user, 'Cash', 'cash', v_home,
       (round(80 * v_mult) * 10 ^ v_exp)::bigint, null, true);

  -- One sample category.
  insert into public.categories (id, owner_id, name, color_key, is_sample)
  values (v_trips, v_user, 'Weekend trips', 'blue', true);

  -- About 20 lines in the current month. acct: 1 main, 2 card, 3 cash.
  with raw (day, name, major, key, acct, refund) as (values
    (1,  'Salary',          3200,  'Income',    1, false),
    (2,  'Rent',           -1150,  'Housing',   1, false),
    (3,  'Weekly shop',      -62,  'Groceries', 1, false),
    (9,  'Weekly shop',      -48,  'Groceries', 1, false),
    (16, 'Weekly shop',      -71,  'Groceries', 1, false),
    (23, 'Weekly shop',      -55,  'Groceries', 1, false),
    (4,  'Coffee',            -4,  'Dining',    3, false),
    (11, 'Coffee',            -4,  'Dining',    3, false),
    (18, 'Coffee',            -5,  'Dining',    3, false),
    (5,  'Bus pass',         -38,  'Transport', 1, false),
    (19, 'Taxi',             -27,  'Transport', 2, false),
    (7,  'Dinner out',       -34,  'Dining',    2, false),
    (21, 'Dinner out',       -46,  'Dining',    2, false),
    (6,  'Electricity',      -88,  'Utilities', 1, false),
    (8,  'Phone',            -25,  'Utilities', 1, false),
    (10, 'Gym',              -32,  'Health',    1, false),
    (12, 'Dinner refund',     24,  'Dining',    2, true),
    (15, 'Weekend away',    -140,  null,        2, false)
  )
  insert into public.transactions (
    id, household_id, account_id, created_by, original_amount, original_currency,
    local_date, time_zone, name, category_id, status, is_refund, is_sample
  )
  select gen_random_uuid(), p_household_id,
         case r.acct when 1 then v_acct_main when 2 then v_acct_card else v_acct_cash end,
         v_user,
         (round(r.major * v_mult) * 10 ^ v_exp)::bigint,
         v_home,
         v_month + (least(r.day, v_last) - 1),
         v_tz, r.name,
         case when r.key is null then v_trips
              else (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = r.key) end,
         case when r.day <= v_today_day then 'paid' else 'pending' end,
         r.refund, true
    from raw r;
  get diagnostics v_n = row_count;

  -- Exactly one foreign-currency line, on the home-currency credit card.
  insert into public.transactions (
    id, household_id, account_id, created_by, original_amount, original_currency,
    local_date, time_zone, name, category_id, status, is_sample
  ) values (
    gen_random_uuid(), p_household_id, v_acct_card, v_user,
    (case when v_foreign = 'EUR' then -45 else -180 end * 10 ^ v_fexp)::bigint,
    v_foreign, v_month + (least(13, v_last) - 1), v_tz,
    case when v_foreign = 'EUR' then 'Train in Lisbon' else 'Hotel in New York' end,
    (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = 'Transport'),
    case when 13 <= v_today_day then 'paid' else 'pending' end, true
  );
  v_n := v_n + 1;

  -- One monthly recurring set; occurrences inherit is_sample (plan 10).
  insert into public.recurring_series (
    id, household_id, created_by, account_id, name, amount, currency, category_id,
    freq, anchor_date, time_zone, is_sample
  ) values (
    v_series, p_household_id, v_user, v_acct_card, 'Streaming',
    (0 - round(12.99 * v_mult * 10 ^ v_exp))::bigint, v_home,
    (select c.id from public.categories c where c.owner_id = v_user and c.builtin_key = 'Subscriptions'),
    'monthly', v_month + (least(14, v_last) - 1), v_tz, true
  );
  perform public.materialise_series(v_series, p_today);

  return jsonb_build_object('status', 'applied', 'accounts', 3, 'transactions', v_n, 'series', 1);
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
  v_kept int := 0;
  k int;
begin
  if v_user is null or p_household_id is null
     or p_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', p_household_id using errcode = '42501';
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);

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
                            'accounts', v_accts, 'categories', v_cats, 'kept', v_kept);
end;
$$;

revoke execute on function public.sample_data_exists(uuid) from public, anon;
revoke execute on function public.seed_sample_data(uuid, date) from public, anon;
revoke execute on function public.clear_sample_data(uuid) from public, anon;
grant execute on function public.sample_data_exists(uuid) to authenticated;
grant execute on function public.seed_sample_data(uuid, date) to authenticated;
grant execute on function public.clear_sample_data(uuid) to authenticated;
