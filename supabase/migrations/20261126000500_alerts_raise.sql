-- Phase 10 (10-15): server-side alert evaluation (ALR-01/02/05/06). Figures compare saved thresholds only; defaults are computed on the phone (engine/alerts, D-10).
-- Alerts must fire with the app closed and Deno cannot import engine/, so each kind is decided here against the thresholds the client saved.
-- Delivery (quiet hours, digest, Expo push) is plan 10-23; this migration only writes alert_log and alert_outbox.

-- 1. Outbox ------------------------------------------------------------------------------------------------------------
create table public.alert_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_id uuid not null references public.alert_log(id) on delete cascade,
  kind text not null,
  params jsonb not null,
  dedupe_key text not null unique,
  deliver_after timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'digest', 'dropped')),
  attempts smallint not null default 0,
  created_at timestamptz not null default now()
);
create index alert_outbox_status_idx on public.alert_outbox (status, deliver_after);
create index alert_outbox_log_idx on public.alert_outbox (log_id);
create index alert_outbox_user_idx on public.alert_outbox (user_id);

alter table public.alert_outbox enable row level security;
revoke all on public.alert_outbox from anon, authenticated;

-- 2. raise_alert: log row + outbox row, once per dedupe key ---------------------------------------------------------------
-- Only the keys of the params contract may appear; a stray key (a note, a payee) is a bug, so it raises instead of leaking.
create function public.raise_alert(p_user uuid, p_kind text, p_params jsonb, p_ref_table text, p_ref_id uuid, p_dedupe text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed text[];
  v_log uuid;
  v_out uuid;
begin
  v_allowed := case p_kind
    when 'bills_due' then array['bill', 'amount_minor', 'currency', 'lead_days']
    when 'over_cap' then array['category', 'over_minor', 'currency']
    when 'goal_reached' then array['goal', 'amount_minor', 'currency']
    when 'large_txn' then array['category', 'amount_minor', 'currency']
    when 'low_balance' then array['account', 'amount_minor', 'currency']
    when 'partner_large' then array['who', 'hidden', 'category', 'amount_minor', 'currency']
    else null
  end;
  if v_allowed is null then
    raise exception 'raise_alert: unknown kind %', p_kind using errcode = '22023';
  end if;
  if (p_params - v_allowed) <> '{}'::jsonb then
    raise exception 'raise_alert: params carry a key outside the contract' using errcode = '22023';
  end if;
  if p_user is null or exists (select 1 from public.alert_outbox o where o.dedupe_key = p_dedupe) then
    return null;
  end if;

  v_log := gen_random_uuid();
  insert into public.alert_log (id, user_id, kind, params, ref_table, ref_id)
  values (v_log, p_user, p_kind, p_params, p_ref_table, p_ref_id);
  insert into public.alert_outbox (user_id, log_id, kind, params, dedupe_key)
  values (p_user, v_log, p_kind, p_params, p_dedupe)
  on conflict (dedupe_key) do nothing
  returning id into v_out;
  if v_out is null then
    delete from public.alert_log where id = v_log;
    return null;
  end if;
  return v_log;
end;
$$;
revoke execute on function public.raise_alert(uuid, text, jsonb, text, uuid, text) from public, anon, authenticated;

-- 3. Helpers --------------------------------------------------------------------------------------------------------------
-- Compare a threshold only in a currency the row actually carries; no other conversion is made here.
create function public.alerts_pick_amount(p_cur text, o_cur text, o_amt bigint, h_cur text, h_amt bigint, hh_cur text, hh_amt bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when p_cur = h_cur and h_amt is not null then h_amt
    when p_cur = hh_cur and hh_amt is not null then hh_amt
    when p_cur = o_cur then o_amt
  end
$$;
revoke execute on function public.alerts_pick_amount(text, text, bigint, text, bigint, text, bigint) from public, anon, authenticated;

create function public.alerts_user_tz(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select z.name from public.alert_prefs p join pg_catalog.pg_timezone_names z on z.name = p.time_zone
                    where p.user_id = p_user), 'UTC')
$$;
revoke execute on function public.alerts_user_tz(uuid) from public, anon, authenticated;

-- 4. Goal reached ---------------------------------------------------------------------------------------------------------
create function public.alerts_on_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
begin
  if old.done_at is not null or new.done_at is null or new.deleted_at is not null or new.is_sample then
    return null;
  end if;
  select * into s from public.alert_setting(new.created_by, 'goal_reached');
  if s.enabled then
    perform public.raise_alert(new.created_by, 'goal_reached',
      jsonb_build_object('goal', new.name, 'amount_minor', coalesce(new.target, 0), 'currency', new.currency),
      'savings_goals', new.id, 'goal:' || new.id || ':' || new.created_by);
  end if;
  return null;
end;
$$;
revoke execute on function public.alerts_on_goal() from public, anon, authenticated;
create trigger alerts_on_goal after update of done_at on public.savings_goals
  for each row execute function public.alerts_on_goal();

-- 5. Transactions: over cap, low balance, large, partner large -------------------------------------------------------------
create function public.alerts_on_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s record;
  v_amt bigint;
  v_cat text;
  v_cat_row record;
  v_acct record;
  v_hc text;
  v_total bigint;
  v_this bigint;
  v_after bigint;
  v_delta bigint;
  v_month_start date;
  r record;
  v_sender record;
  v_who text;
  v_hidden boolean;
  v_pcat text;
  v_bkey text;
begin
  -- Skip rules (T-10-15-04, T-10-15-06): cheap early return before any lookup.
  if new.deleted_at is not null or new.import_batch_id is not null or new.is_sample or new.transfer_id is not null
     or new.is_settlement or new.status <> 'paid' or new.local_date < current_date - 2 or new.created_by is null then
    return null;
  end if;

  select coalesce(c.name, c.builtin_key) into v_cat from public.categories c where c.id = new.category_id;

  -- 5a. Over cap: the category owner's own cap, in their home currency, crossed by this row.
  if new.original_amount < 0 and new.category_id is not null then
    select c.owner_id, c.monthly_cap into v_cat_row from public.categories c
     where c.id = new.category_id and not c.is_system and c.monthly_cap is not null;
    if found then
      select * into s from public.alert_setting(v_cat_row.owner_id, 'over_cap');
      if s.enabled then
        select p.home_currency into v_hc from public.profiles p where p.id = v_cat_row.owner_id;
        if v_hc is not null then
          v_month_start := date_trunc('month', new.local_date)::date;
          v_this := case when new.home_currency = v_hc and new.home_amount is not null then new.home_amount
                         when new.original_currency = v_hc then new.original_amount end;
          if v_this is not null and v_this < 0 then
            select coalesce(sum(-a.amt), 0) into v_total from (
              select case when t.home_currency = v_hc and t.home_amount is not null then t.home_amount
                          when t.original_currency = v_hc then t.original_amount end as amt
                from public.transactions_active t
               where t.category_id = new.category_id and t.status = 'paid' and t.transfer_id is null and not t.is_settlement
                 and not t.is_sample and t.original_amount < 0
                 and t.local_date >= v_month_start and t.local_date < (v_month_start + interval '1 month')::date
            ) a where a.amt < 0;
            if v_total > v_cat_row.monthly_cap and v_total + v_this <= v_cat_row.monthly_cap then
              perform public.raise_alert(v_cat_row.owner_id, 'over_cap',
                jsonb_build_object('category', v_cat, 'over_minor', v_total - v_cat_row.monthly_cap, 'currency', v_hc),
                'categories', new.category_id,
                'cap:' || new.category_id || ':' || to_char(new.local_date, 'YYYY-MM') || ':' || v_cat_row.owner_id);
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  -- 5b. Low balance: this row moved the account from at-or-above the saved amount to below it.
  select a.created_by, a.currency, a.opening_balance into v_acct from public.accounts a where a.id = new.account_id;
  if found and v_acct.created_by is not null then
    v_delta := new.original_amount;
    if tg_op = 'UPDATE' then
      if old.status = 'paid' and old.deleted_at is null and old.account_id = new.account_id then
        v_delta := v_delta - old.original_amount;
      end if;
    end if;
    if v_delta < 0 and new.original_currency = v_acct.currency then
      select * into s from public.alert_setting(v_acct.created_by, 'low_balance');
      if s.enabled and s.threshold_minor is not null and s.threshold_currency = v_acct.currency then
        select v_acct.opening_balance + coalesce(sum(t.original_amount), 0) into v_after
          from public.transactions_active t where t.account_id = new.account_id and t.status = 'paid';
        if v_after < s.threshold_minor and v_after - v_delta >= s.threshold_minor then
          perform public.raise_alert(v_acct.created_by, 'low_balance',
            jsonb_build_object('account', (select a.name from public.accounts a where a.id = new.account_id),
                               'amount_minor', v_after, 'currency', v_acct.currency),
            'accounts', new.account_id,
            'low:' || new.account_id || ':' || new.local_date || ':' || v_acct.created_by);
        end if;
      end if;
    end if;
  end if;

  -- 5c. Large transaction (own) and 5d. partner large: outflows that are not automatic.
  if new.original_amount < 0 and not new.is_automatic then
    select * into s from public.alert_setting(new.created_by, 'large_txn');
    if s.enabled and s.threshold_minor is not null then
      v_amt := public.alerts_pick_amount(s.threshold_currency, new.original_currency, new.original_amount,
        new.home_currency, new.home_amount, new.household_currency, new.household_amount);
      if v_amt is not null and abs(v_amt) >= s.threshold_minor then
        perform public.raise_alert(new.created_by, 'large_txn',
          jsonb_build_object('category', v_cat, 'amount_minor', abs(v_amt), 'currency', s.threshold_currency),
          'transactions', new.id, 'large:' || new.id);
      end if;
    end if;

    if new.is_shared then
      select m.name_hidden, m.display_name into v_sender from public.household_members m
       where m.household_id = new.household_id and m.user_id = new.created_by;
      select c.builtin_key into v_bkey from public.categories c where c.id = new.category_id;
      for r in select m.user_id from public.household_members m
                where m.household_id = new.household_id and m.user_id <> new.created_by loop
        if not coalesce((select p.partner_alerts from public.alert_prefs p where p.user_id = r.user_id), true) then
          continue;
        end if;
        select * into s from public.alert_setting(r.user_id, 'large_txn');
        if s.threshold_minor is null then
          continue;
        end if;
        v_amt := public.alerts_pick_amount(s.threshold_currency, new.original_currency, new.original_amount,
          new.home_currency, new.home_amount, new.household_currency, new.household_amount);
        if v_amt is null or abs(v_amt) < s.threshold_minor then
          continue;
        end if;
        -- The receiver's own category for the row wins; else a built-in name; else the sender's private category stays private.
        select coalesce(c.name, c.builtin_key) into v_pcat
          from public.transaction_member_categories x join public.categories c on c.id = x.category_id
         where x.transaction_id = new.id and x.user_id = r.user_id;
        v_who := case when coalesce(v_sender.name_hidden, false) then null else v_sender.display_name end;
        v_hidden := coalesce(v_sender.name_hidden, false);
        if v_pcat is null then
          if new.category_id is null then
            v_pcat := null;
          elsif v_bkey is not null then
            v_pcat := v_bkey;
          else
            v_pcat := null;
            v_who := null;
            v_hidden := true;
          end if;
        end if;
        perform public.raise_alert(r.user_id, 'partner_large',
          jsonb_build_object('who', v_who, 'hidden', v_hidden, 'category', v_pcat,
                             'amount_minor', abs(v_amt), 'currency', s.threshold_currency),
          'transactions', new.id, 'plarge:' || new.id || ':' || r.user_id);
      end loop;
    end if;
  end if;

  return null;
end;
$$;
revoke execute on function public.alerts_on_transaction() from public, anon, authenticated;
create trigger alerts_on_transaction
  after insert or update of status, original_amount, home_amount, household_amount, category_id, deleted_at
  on public.transactions
  for each row execute function public.alerts_on_transaction();

-- 6. Bills due (hourly) -----------------------------------------------------------------------------------------------------
-- A pending recurring occurrence is due when its date is the person's own "today" plus their lead (0, 1 or 3 days).
-- Shared occurrences go to every household member; each person's setting and time zone decide for themselves.
create function public.alerts_bills_due()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  u uuid;
  s record;
  v_today date;
  v_n integer := 0;
  v_key text;
begin
  for r in select t.id, t.created_by, t.household_id, t.is_shared, t.name, t.original_amount, t.original_currency, t.local_date
             from public.transactions_active t
            where t.status = 'pending' and t.recurring_series_id is not null and not t.is_sample
              and t.local_date between current_date - 1 and current_date + 4 loop
    for u in select r.created_by where r.created_by is not null
             union
             select m.user_id from public.household_members m where r.is_shared and m.household_id = r.household_id loop
      select * into s from public.alert_setting(u, 'bills_due');
      if not s.enabled then
        continue;
      end if;
      v_today := (now() at time zone public.alerts_user_tz(u))::date;
      if r.local_date - v_today = coalesce(s.lead_days, 1) then
        v_key := 'bill:' || r.id || ':' || coalesce(s.lead_days, 1) || case when u is distinct from r.created_by then ':' || u else '' end;
        if public.raise_alert(u, 'bills_due',
             jsonb_build_object('bill', coalesce(r.name, 'Bill'), 'amount_minor', abs(r.original_amount),
                                'currency', r.original_currency, 'lead_days', coalesce(s.lead_days, 1)),
             'transactions', r.id, v_key) is not null then
          v_n := v_n + 1;
        end if;
      end if;
    end loop;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.alerts_bills_due() from public, anon, authenticated;
grant execute on function public.alerts_bills_due() to service_role;

-- 7. Purge (nightly) ------------------------------------------------------------------------------------------------------------
create function public.alerts_purge()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a integer;
  v_b integer;
begin
  delete from public.alert_log where raised_at < now() - interval '30 days';
  get diagnostics v_a = row_count;
  delete from public.alert_outbox where status in ('sent', 'dropped') and created_at < now() - interval '7 days';
  get diagnostics v_b = row_count;
  return v_a + v_b;
end;
$$;
revoke execute on function public.alerts_purge() from public, anon, authenticated;
grant execute on function public.alerts_purge() to service_role;

-- 8. Schedules (idempotent) ---------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'alerts-bills-due-hourly') then
    perform cron.unschedule('alerts-bills-due-hourly');
  end if;
  if exists (select 1 from cron.job where jobname = 'alerts-purge-nightly') then
    perform cron.unschedule('alerts-purge-nightly');
  end if;
end;
$$;
select cron.schedule('alerts-bills-due-hourly', '7 * * * *', $$select public.alerts_bills_due()$$);
select cron.schedule('alerts-purge-nightly', '45 3 * * *', $$select public.alerts_purge()$$);
