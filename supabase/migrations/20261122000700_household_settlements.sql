-- Phase 8 settle-up state machine (HH-07, HH-08; D-19..D-25, D-42). Proven by pgTAP 108.
-- pending -> confirmed | rejected ("Not yet") | cancelled | lapsed;  confirmed -> undone (24 hours);  written_off (balance with
-- someone who left). A settle-up covers exactly the ticked lines, which lock while it is pending or confirmed. A settlement
-- is a transfer between people: both records carry is_settlement and move account balances, and never count as spending
-- or income (ARC-18).
--
-- Decision on the ROADMAP research flag (settlement expiry window lapses unresolved): D-20. A reminder goes to the receiver
-- on day 7; on day 14 the settle-up lapses, its lines unlock, the balance is owed again and BOTH people get a settle_lapsed
-- notice. Nothing settles silently. The hourly sweep does this, but nothing depends on it: hh_line_locked treats an expired
-- pending settle-up as unlocked, every RPC lapses an expired pending row it touches (writing the same notice, once), and
-- confirming one after day 14 answers "lapsed" and settles nothing.
--
-- ARC-18 reviewed (server totals over transactions; the full list found by grepping every migration for sum( ):
--   -- ARC-18 reviewed: public.account_balances         no spend/income total (per-account balance; settlements MUST count, they move balances)
--   -- ARC-18 reviewed: public.account_pending_split    no spend/income total (pending in/out per account; settlements are never pending)
--   -- ARC-18 reviewed: public.account_paid_before      no spend/income total (opening balance of a month; settlements move the balance)
--   -- ARC-18 reviewed: public.joint_account_balances   no spend/income total (balance of a joint account; settlements move it)
--   -- ARC-18 reviewed: public.transaction_months       no spend/income total (months with data)
--   -- ARC-18 reviewed: public.change_home_currency     no spend/income total (converts caps and the home currency)
-- No SQL function totals spending or income for a user-facing figure (month totals, category cap use and Decide inputs are
-- computed on the device from the engine, where excludeSettlements applies: plans 08-30 and 05.5). So no function changed.

-- 1. transactions: server-written columns -------------------------------------------------------------------------------
alter table public.transactions
  add column is_settlement boolean not null default false,
  add column settlement_id uuid;

-- `select *` freezes the column list: re-create so the new columns are selectable (definition and grants as 20261122000600).
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;
revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- 2. Tables ------------------------------------------------------------------------------------------------------------
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null default 'payment' check (kind in ('payment', 'write_off')),
  payer_id uuid references auth.users(id) on delete set null,
  receiver_id uuid references auth.users(id) on delete set null,
  payer_former_key uuid, receiver_former_key uuid,           -- the user ids at creation: stable once an account is deleted (D-29)
  amount bigint not null check (amount > 0),                 -- household currency minor units
  currency text not null,
  status text not null check (status in ('pending', 'confirmed', 'rejected', 'cancelled', 'lapsed', 'undone', 'written_off')),
  created_by uuid references auth.users(id) on delete set null,
  payer_account_id uuid references public.accounts(id) on delete set null,
  receiver_account_id uuid references public.accounts(id) on delete set null,
  payer_tx_id uuid, receiver_tx_id uuid,
  payer_fx_rate numeric, receiver_fx_rate numeric,           -- D-08: household -> account currency, stored
  remind_at timestamptz, expires_at timestamptz,
  confirmed_at timestamptz, resolved_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index settlements_household_idx on public.settlements (household_id);
create index settlements_pending_idx on public.settlements (expires_at) where status = 'pending';
create trigger set_version before update on public.settlements
  for each row execute function public.bump_version();

create table public.settlement_lines (
  settlement_id uuid not null references public.settlements(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  amount bigint not null,                                    -- this line's contribution, for traceability (D-23)
  live boolean not null default true,
  primary key (settlement_id, transaction_id));
create unique index settlement_lines_one_live on public.settlement_lines (transaction_id) where live;
create index settlement_lines_tx_idx on public.settlement_lines (transaction_id);

create table public.settlement_nudges (
  household_id uuid not null references public.households(id) on delete cascade,
  from_id uuid not null references auth.users(id) on delete cascade,
  to_id uuid not null references auth.users(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (household_id, from_id, to_id));

alter table public.transactions
  add constraint transactions_settlement_fk foreign key (settlement_id) references public.settlements(id) on delete set null;

alter table public.settlements enable row level security;
create policy "parties read their settlements" on public.settlements for select to authenticated
  using (household_id in (select public.user_household_ids())
    and (payer_id = (select auth.uid()) or receiver_id = (select auth.uid())));
revoke all on public.settlements from anon;
revoke insert, update, delete, truncate on public.settlements from authenticated;
grant select on public.settlements to authenticated;

alter table public.settlement_lines enable row level security;
create policy "read lines of my settlements" on public.settlement_lines for select to authenticated
  using (household_id in (select public.user_household_ids())
    and exists (select 1 from public.settlements s
                 where s.id = settlement_lines.settlement_id
                   and (s.payer_id = (select auth.uid()) or s.receiver_id = (select auth.uid()))));
revoke all on public.settlement_lines from anon;
revoke insert, update, delete, truncate on public.settlement_lines from authenticated;
grant select on public.settlement_lines to authenticated;

-- No client access at all: rate limit bookkeeping for "Ask to settle up" (D-24).
alter table public.settlement_nudges enable row level security;
revoke all on public.settlement_nudges from anon, authenticated;

-- 3. hh_line_locked (was a stub returning false in 20261122000600) ----------------------------------------------------
-- A live settlement line locks its transaction while the settle-up is confirmed or written off, or pending and not yet
-- expired. An expired pending settle-up no longer locks (lazy lapse: D-20 holds even when the sweep job is down).
create or replace function public.hh_line_locked(p_tx uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.settlement_lines l
      join public.settlements s on s.id = l.settlement_id
     where l.transaction_id = p_tx and l.live
       and (s.status in ('confirmed', 'written_off') or (s.status = 'pending' and now() < s.expires_at)))
$$;
revoke execute on function public.hh_line_locked(uuid) from public, anon, authenticated;

-- guard_shared_line_edit: the 20261122000300 body plus two checks, both after the household-RPC skip:
--   * a locked line's amount, currency, date and deletion cannot change, even for the creator (D-19);
--   * a settlement record's amount, currency, date, account and deletion change only inside the settlement RPCs.
create or replace function public.guard_shared_line_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_flag boolean := coalesce(current_setting('fincwin.household_rpc', true), '') = 'on';
begin
  if v_uid is null or v_flag then
    return new;
  end if;
  if old.is_settlement and (new.original_amount is distinct from old.original_amount
     or new.original_currency is distinct from old.original_currency or new.local_date is distinct from old.local_date
     or new.account_id is distinct from old.account_id or new.deleted_at is distinct from old.deleted_at) then
    raise exception 'settlement_record_locked' using errcode = '23514';
  end if;
  if (new.original_amount is distinct from old.original_amount or new.original_currency is distinct from old.original_currency
      or new.local_date is distinct from old.local_date or new.deleted_at is distinct from old.deleted_at)
     and public.hh_line_locked(old.id) then
    raise exception 'line_locked' using errcode = '23514';
  end if;
  if new.household_id is distinct from old.household_id or new.is_shared is distinct from old.is_shared
     or (new.paid_by is distinct from old.paid_by and new.paid_by is not null)
     or (new.created_by is distinct from old.created_by and new.created_by is not null) then  -- clearing is ON DELETE SET NULL
    raise exception 'shared_line_creator_only' using errcode = '42501';
  end if;
  if old.created_by is null or v_uid = old.created_by then
    return new;
  end if;
  -- someone other than the creator: only client-writable columns matter, the rest is stamped by triggers
  if (new.account_id is distinct from old.account_id or new.time_zone is distinct from old.time_zone
      or new.name is distinct from old.name or new.category_id is distinct from old.category_id
      or new.payment_type is distinct from old.payment_type or new.status is distinct from old.status
      or new.deleted_at is distinct from old.deleted_at or new.transfer_id is distinct from old.transfer_id
      or new.is_refund is distinct from old.is_refund or new.is_automatic is distinct from old.is_automatic
      or new.one_off is distinct from old.one_off or new.goal_id is distinct from old.goal_id
      or new.income_kind is distinct from old.income_kind or new.counts_as is distinct from old.counts_as
      or new.refund_of is distinct from old.refund_of or new.debt_id is distinct from old.debt_id
      or new.recurring_series_id is distinct from old.recurring_series_id
      or new.occurrence_date is distinct from old.occurrence_date)
     or (v_uid is distinct from coalesce(old.paid_by, old.created_by)
         and (new.original_amount is distinct from old.original_amount
              or new.original_currency is distinct from old.original_currency
              or new.local_date is distinct from old.local_date or new.note is distinct from old.note)) then
    raise exception 'shared_line_creator_only' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_shared_line_edit() from public, anon, authenticated;

-- hh_share_on_insert: the 20261122000600 body plus one line. A settlement record on a joint account is never shared and
-- never split: it is a movement of money between two people, not a household cost.
create or replace function public.hh_share_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Money going out of a joint account is shared at once. Money going in (a top-up or pay into it) is not tracked (D-17) and
  -- stays the person's own line.
  v_joint boolean := new.account_id is not null and new.original_amount < 0
    and exists (select 1 from public.accounts a where a.id = new.account_id and a.is_shared);
  v_srule text;
  v_cur text;
  st record;
begin
  if new.is_settlement then
    new.is_shared := false;
    return new;
  end if;
  if not (new.is_shared or v_joint) then
    return new;
  end if;
  if new.debt_id is not null or new.goal_id is not null
     or (select count(*) from public.household_members m where m.household_id = new.household_id) < 2 then
    new.is_shared := false;
    return new;
  end if;
  if new.recurring_series_id is not null then
    select r.split_rule into v_srule from public.recurring_series r where r.id = new.recurring_series_id;
  end if;
  select h.reporting_currency into v_cur from public.households h where h.id = new.household_id;
  select * into st from public.hh_compute_stamp(new.original_amount, new.original_currency, new.local_date, new.created_by, v_cur);
  new.is_shared := true;
  new.shared_at := now();
  new.split_rule := coalesce(v_srule, public.hh_resolve_rule(new.household_id, new.category_id));
  if st.ok then
    new.household_amount := st.amount;
    new.household_currency := v_cur;
    new.household_rate := st.rate;
    new.household_rate_pending := false;
  else
    new.household_rate_pending := true;
  end if;
  return new;
end;
$$;
revoke execute on function public.hh_share_on_insert() from public, anon, authenticated;

-- 4. Internal helpers (not client-callable) -------------------------------------------------------------------------
-- What p_payer owes p_receiver across the listed lines (D-21; mirrors the engine's settleUpTotal). A line counts when it is
-- shared, live, not on a joint account (D-17), not locked, and one of the two paid it (paid_by, else creator) while the other
-- has a non-zero stored share. Expenses are stored negative, so: the receiver paid -> payer owes minus the payer's share;
-- the payer paid -> the receiver's share (negative) is deducted. Positive = payer owes receiver. Either id may be a user id
-- or the stable former-member key of someone whose account is gone.
create or replace function public.hh_pair_owed(p_household uuid, p_payer uuid, p_receiver uuid, p_line_ids uuid[])
returns table (transaction_id uuid, amount bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         case
           when coalesce(t.paid_by, t.created_by) = p_receiver
             then -(select sum(s.share) from public.transaction_splits s
                     where s.transaction_id = t.id and (s.member_id = p_payer or s.former_member_key = p_payer))
           else (select sum(s.share) from public.transaction_splits s
                  where s.transaction_id = t.id and (s.member_id = p_receiver or s.former_member_key = p_receiver))
         end::bigint
    from public.transactions t
   where t.id = any(p_line_ids)
     and t.household_id = p_household
     and t.is_shared and t.deleted_at is null and not t.is_settlement
     and not exists (select 1 from public.accounts a where a.id = t.account_id and a.is_shared)
     and not public.hh_line_locked(t.id)
     and (coalesce(t.paid_by, t.created_by) = p_receiver or coalesce(t.paid_by, t.created_by) = p_payer)
     and coalesce((select sum(s.share) from public.transaction_splits s
                    where s.transaction_id = t.id
                      and (s.member_id = case when coalesce(t.paid_by, t.created_by) = p_receiver then p_payer else p_receiver end
                           or s.former_member_key = case when coalesce(t.paid_by, t.created_by) = p_receiver then p_payer else p_receiver end)), 0) <> 0
$$;
revoke execute on function public.hh_pair_owed(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

-- Lapses one pending settle-up (D-20): status, unlock the lines, tell both people once. Used by the sweep and by every RPC
-- that meets an expired pending row. Returns true when it changed a row.
create or replace function public.hh_settlement_lapse(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settlements%rowtype;
begin
  update public.settlements set status = 'lapsed', resolved_at = now()
   where id = p_id and status = 'pending' returning * into s;
  if not found then return false; end if;
  update public.settlement_lines set live = false where settlement_id = p_id;
  insert into public.household_events (household_id, kind, actor_id, subject_id, ref_id, audience, params)
  values (s.household_id, 'settle_lapsed', null, s.payer_id, s.id,
          array_remove(array[s.payer_id, s.receiver_id], null),
          jsonb_build_object('amount', s.amount, 'currency', s.currency))
  on conflict do nothing;
  return true;
end;
$$;
revoke execute on function public.hh_settlement_lapse(uuid) from public, anon, authenticated;

-- Writes the account records of a settlement (D-22): the payer's is negative, the receiver's positive, both is_settlement,
-- both converted from the household currency at today's rate with the rate stored (D-08). A side with a null account is
-- skipped. Nothing is written when a rate is missing. The caller sets the status.
create or replace function public.hh_write_settlement_records(p_id uuid, p_payer_account uuid, p_receiver_account uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settlements%rowtype;
  pa public.accounts%rowtype;
  ra public.accounts%rowtype;
  pst record;
  rst record;
  v_ptx uuid := gen_random_uuid();
  v_rtx uuid := gen_random_uuid();
begin
  select * into s from public.settlements where id = p_id;
  if p_payer_account is not null then
    select * into pa from public.accounts where id = p_payer_account;
    select * into pst from public.hh_compute_stamp(s.amount, s.currency, current_date, pa.created_by, pa.currency);
    if not pst.ok then return jsonb_build_object('ok', false, 'reason', 'rate_unavailable'); end if;
  end if;
  if p_receiver_account is not null then
    select * into ra from public.accounts where id = p_receiver_account;
    select * into rst from public.hh_compute_stamp(s.amount, s.currency, current_date, ra.created_by, ra.currency);
    if not rst.ok then return jsonb_build_object('ok', false, 'reason', 'rate_unavailable'); end if;
  end if;

  perform set_config('fincwin.household_rpc', 'on', true);
  if p_payer_account is not null then
    insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                     time_zone, name, status, is_settlement, settlement_id, is_shared)
    values (v_ptx, s.household_id, pa.created_by, pa.id, -pst.amount, pa.currency, current_date, 'UTC', 'Settle up', 'paid', true, s.id, false);
    update public.settlements set payer_account_id = pa.id, payer_tx_id = v_ptx, payer_fx_rate = pst.rate where id = s.id;
  end if;
  if p_receiver_account is not null then
    insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                     time_zone, name, status, is_settlement, settlement_id, is_shared)
    values (v_rtx, s.household_id, ra.created_by, ra.id, rst.amount, ra.currency, current_date, 'UTC', 'Settle up', 'paid', true, s.id, false);
    update public.settlements set receiver_account_id = ra.id, receiver_tx_id = v_rtx, receiver_fx_rate = rst.rate where id = s.id;
  end if;
  perform set_config('fincwin.household_rpc', '', true);
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.hh_write_settlement_records(uuid, uuid, uuid) from public, anon, authenticated;

-- 5. RPCs --------------------------------------------------------------------------------------------------------------
-- security definer, empty search_path, jsonb results {ok, reason}; only a missing session raises (42501). A settle-up the
-- caller is not a party to is refused exactly like a missing id (08-05 privacy rule): third members learn nothing.

create or replace function public.propose_settlement(p_receiver uuid, p_line_ids uuid[], p_payer_account uuid, p_expected_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v_h uuid;
  v_cur text;
  v_ids uuid[];
  v_n integer;
  v_sum bigint;
  v_count integer;
  v_id uuid := gen_random_uuid();
  r record;
begin
  select m.household_id into v_h from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_h is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if p_receiver is null or p_receiver = uid or not exists (
       select 1 from public.household_members m where m.household_id = v_h and m.user_id = p_receiver) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_payer_account and a.created_by = uid
                  and a.household_id = v_h and a.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'account_not_yours');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_line_ids) x where x is not null;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;

  -- lazy lapse: an expired pending settle-up that still names one of these lines no longer holds it
  for r in select distinct s.id from public.settlement_lines l join public.settlements s on s.id = l.settlement_id
            where l.transaction_id = any(v_ids) and l.live and s.status = 'pending' and s.expires_at <= now() loop
    perform public.hh_settlement_lapse(r.id);
  end loop;

  select coalesce(sum(o.amount), 0), count(*) into v_sum, v_count from public.hh_pair_owed(v_h, uid, p_receiver, v_ids) o;
  if v_count <> v_n or v_sum <> p_expected_amount then
    if v_count > 0 and v_sum <= 0 and v_count = v_n then
      return jsonb_build_object('ok', false, 'reason', 'nothing_owed');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end if;
  if v_sum <= 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;

  select h.reporting_currency into v_cur from public.households h where h.id = v_h;
  begin
    insert into public.settlements (id, household_id, payer_id, receiver_id, payer_former_key, receiver_former_key, amount, currency,
                                    status, created_by, payer_account_id, remind_at, expires_at)
    values (v_id, v_h, uid, p_receiver, uid, p_receiver, v_sum, v_cur, 'pending', uid, p_payer_account,
            now() + interval '7 days', now() + interval '14 days');
    insert into public.settlement_lines (settlement_id, transaction_id, household_id, amount)
      select v_id, o.transaction_id, v_h, o.amount from public.hh_pair_owed(v_h, uid, p_receiver, v_ids) o;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end;
  perform public.hh_event(v_h, 'settle_request', uid, v_id, array[p_receiver], jsonb_build_object('amount', v_sum, 'currency', v_cur));
  return jsonb_build_object('ok', true, 'settlement_id', v_id, 'amount', v_sum);
end;
$$;

create or replace function public.confirm_settlement(p_id uuid, p_receiver_account uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  s public.settlements%rowtype;
  w jsonb;
begin
  select * into s from public.settlements x
   where x.id = p_id and (x.payer_id = uid or x.receiver_id = uid) and x.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.receiver_id is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_receiver'); end if;
  if s.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', s.status); end if;
  if now() >= s.expires_at then
    perform public.hh_settlement_lapse(s.id);
    return jsonb_build_object('ok', false, 'reason', 'lapsed');
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_receiver_account and a.created_by = uid
                  and a.household_id = s.household_id and a.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'account_not_yours');
  end if;
  if not exists (select 1 from public.accounts a where a.id = s.payer_account_id and a.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'payer_account_gone');
  end if;
  w := public.hh_write_settlement_records(s.id, s.payer_account_id, p_receiver_account);
  if not (w ->> 'ok')::boolean then return w; end if;
  update public.settlements set status = 'confirmed', confirmed_at = now() where id = s.id;
  perform public.hh_event(s.household_id, 'settled', uid, s.id, array_remove(array[s.payer_id, s.receiver_id], null),
                          jsonb_build_object('amount', s.amount, 'currency', s.currency));
  return jsonb_build_object('ok', true);
end;
$$;

-- D-24: the receiver records a payment; it settles at once because the receiver is the confirmer. The payer is told and
-- chooses the account the money left later (set_settlement_payer_account).
create or replace function public.record_received(p_payer uuid, p_line_ids uuid[], p_receiver_account uuid, p_expected_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v_h uuid;
  v_cur text;
  v_ids uuid[];
  v_n integer;
  v_sum bigint;
  v_count integer;
  v_id uuid := gen_random_uuid();
  r record;
  w jsonb;
begin
  select m.household_id into v_h from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_h is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if p_payer is null or p_payer = uid or not exists (
       select 1 from public.household_members m where m.household_id = v_h and m.user_id = p_payer) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_receiver_account and a.created_by = uid
                  and a.household_id = v_h and a.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'account_not_yours');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_line_ids) x where x is not null;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;
  for r in select distinct s.id from public.settlement_lines l join public.settlements s on s.id = l.settlement_id
            where l.transaction_id = any(v_ids) and l.live and s.status = 'pending' and s.expires_at <= now() loop
    perform public.hh_settlement_lapse(r.id);
  end loop;
  select coalesce(sum(o.amount), 0), count(*) into v_sum, v_count from public.hh_pair_owed(v_h, p_payer, uid, v_ids) o;
  if v_count <> v_n or v_sum <> p_expected_amount then
    if v_count > 0 and v_sum <= 0 and v_count = v_n then
      return jsonb_build_object('ok', false, 'reason', 'nothing_owed');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end if;
  if v_sum <= 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;

  select h.reporting_currency into v_cur from public.households h where h.id = v_h;
  begin
    insert into public.settlements (id, household_id, payer_id, receiver_id, payer_former_key, receiver_former_key, amount, currency,
                                    status, created_by, confirmed_at)
    values (v_id, v_h, p_payer, uid, p_payer, uid, v_sum, v_cur, 'confirmed', uid, now());
    insert into public.settlement_lines (settlement_id, transaction_id, household_id, amount)
      select v_id, o.transaction_id, v_h, o.amount from public.hh_pair_owed(v_h, p_payer, uid, v_ids) o;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end;
  w := public.hh_write_settlement_records(v_id, null, p_receiver_account);
  if not (w ->> 'ok')::boolean then
    raise exception 'record_received: %', w ->> 'reason' using errcode = 'HH002';  -- rolled back by the caller's statement
  end if;
  perform public.hh_event(v_h, 'settled', uid, v_id, array[p_payer, uid],
                          jsonb_build_object('amount', v_sum, 'currency', v_cur, 'needs_account', true));
  return jsonb_build_object('ok', true, 'settlement_id', v_id, 'amount', v_sum);
exception when sqlstate 'HH002' then
  return jsonb_build_object('ok', false, 'reason', 'rate_unavailable');
end;
$$;

create or replace function public.set_settlement_payer_account(p_id uuid, p_account uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  s public.settlements%rowtype;
  w jsonb;
begin
  select * into s from public.settlements x
   where x.id = p_id and (x.payer_id = uid or x.receiver_id = uid) and x.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.payer_id is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_payer'); end if;
  if s.status <> 'confirmed' then return jsonb_build_object('ok', false, 'reason', 'not_confirmed', 'status', s.status); end if;
  if s.payer_tx_id is not null then return jsonb_build_object('ok', false, 'reason', 'already_set'); end if;
  if not exists (select 1 from public.accounts a where a.id = p_account and a.created_by = uid
                  and a.household_id = s.household_id and a.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'account_not_yours');
  end if;
  w := public.hh_write_settlement_records(s.id, p_account, null);
  if not (w ->> 'ok')::boolean then return w; end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- "Not yet" (D-19): the receiver turns it down; the lines unlock and the payer is told.
create or replace function public.reject_settlement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  s public.settlements%rowtype;
begin
  select * into s from public.settlements x
   where x.id = p_id and (x.payer_id = uid or x.receiver_id = uid) and x.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.receiver_id is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_receiver'); end if;
  if s.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', s.status); end if;
  if now() >= s.expires_at then
    perform public.hh_settlement_lapse(s.id);
    return jsonb_build_object('ok', false, 'reason', 'lapsed');
  end if;
  update public.settlements set status = 'rejected', resolved_at = now() where id = s.id;
  update public.settlement_lines set live = false where settlement_id = s.id;
  perform public.hh_event(s.household_id, 'settle_not_yet', uid, s.id, array_remove(array[s.payer_id], null),
                          jsonb_build_object('amount', s.amount, 'currency', s.currency));
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.cancel_settlement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  s public.settlements%rowtype;
begin
  select * into s from public.settlements x
   where x.id = p_id and (x.payer_id = uid or x.receiver_id = uid) and x.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.payer_id is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_payer'); end if;
  if s.status <> 'pending' then return jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', s.status); end if;
  if now() >= s.expires_at then
    perform public.hh_settlement_lapse(s.id);
    return jsonb_build_object('ok', false, 'reason', 'lapsed');
  end if;
  update public.settlements set status = 'cancelled', resolved_at = now() where id = s.id;
  update public.settlement_lines set live = false where settlement_id = s.id;
  perform public.hh_event(s.household_id, 'settle_cancelled', uid, s.id, array_remove(array[s.receiver_id], null),
                          jsonb_build_object('amount', s.amount, 'currency', s.currency));
  return jsonb_build_object('ok', true);
end;
$$;

-- D-42: either person, for 24 hours after confirming. Both records are removed (balances move back), the lines unlock.
create or replace function public.undo_settlement(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  s public.settlements%rowtype;
begin
  select * into s from public.settlements x
   where x.id = p_id and (x.payer_id = uid or x.receiver_id = uid) and x.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if s.status <> 'confirmed' then return jsonb_build_object('ok', false, 'reason', 'not_confirmed', 'status', s.status); end if;
  if now() >= s.confirmed_at + interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'undo_window_closed');
  end if;
  -- no undo once a party has left, been removed or deleted their account (an account that is gone has a null id here)
  if s.payer_id is null or s.receiver_id is null
     or (select count(*) from public.household_members m
          where m.household_id = s.household_id and m.user_id in (s.payer_id, s.receiver_id)) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'party_left');
  end if;
  perform set_config('fincwin.household_rpc', 'on', true);
  update public.transactions set deleted_at = now()
   where id in (s.payer_tx_id, s.receiver_tx_id) and deleted_at is null;
  perform set_config('fincwin.household_rpc', '', true);
  update public.settlements set status = 'undone', resolved_at = now() where id = s.id;
  update public.settlement_lines set live = false where settlement_id = s.id;
  perform public.hh_event(s.household_id, 'settle_undone', uid, s.id, array_remove(array[s.payer_id, s.receiver_id], null),
                          jsonb_build_object('amount', s.amount, 'currency', s.currency));
  return jsonb_build_object('ok', true);
end;
$$;

-- D-25: a balance with someone who is no longer a member can be written off by the person still here. No money moves and no
-- records are written; the lines stay locked so the balance never returns. p_other is the user id, or the stable
-- former-member key when their account was deleted.
create or replace function public.write_off_balance(p_other uuid, p_line_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v_h uuid;
  v_cur text;
  v_ids uuid[];
  v_n integer;
  v_net bigint;
  v_count integer;
  v_id uuid := gen_random_uuid();
  v_payer uuid;
  v_receiver uuid;
  v_amount bigint;
begin
  select m.household_id into v_h from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_h is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if p_other is null or p_other = uid then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if exists (select 1 from public.household_members m where m.household_id = v_h and m.user_id = p_other) then
    return jsonb_build_object('ok', false, 'reason', 'member_still_here');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_line_ids) x where x is not null;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;
  select coalesce(sum(o.amount), 0), count(*) into v_net, v_count from public.hh_pair_owed(v_h, uid, p_other, v_ids) o;
  if v_count <> v_n then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_net);
  end if;
  if v_net = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;
  -- v_net > 0: the caller owes the other person; < 0: the other person owes the caller
  if v_net > 0 then v_payer := uid; v_receiver := p_other; v_amount := v_net;
  else v_payer := p_other; v_receiver := uid; v_amount := -v_net; end if;
  select h.reporting_currency into v_cur from public.households h where h.id = v_h;
  begin
    insert into public.settlements (id, household_id, kind, payer_id, receiver_id, payer_former_key, receiver_former_key, amount, currency,
                                    status, created_by, resolved_at)
    values (v_id, v_h, 'write_off',
            case when exists (select 1 from auth.users u where u.id = v_payer) then v_payer end,
            case when exists (select 1 from auth.users u where u.id = v_receiver) then v_receiver end,
            v_payer, v_receiver, v_amount, v_cur, 'written_off', uid, now());
    insert into public.settlement_lines (settlement_id, transaction_id, household_id, amount)
      select v_id, o.transaction_id, v_h, o.amount from public.hh_pair_owed(v_h, uid, p_other, v_ids) o;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_net);
  end;
  perform public.hh_event(v_h, 'written_off', uid, v_id, array[uid], jsonb_build_object('amount', v_amount, 'currency', v_cur));
  return jsonb_build_object('ok', true, 'settlement_id', v_id, 'amount', v_amount);
end;
$$;

-- D-24: "Ask Sam to settle up", at most once per 24 hours per pair.
create or replace function public.ask_to_settle(p_other uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v_h uuid;
  v_last timestamptz;
begin
  select m.household_id into v_h from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_h is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if p_other is null or p_other = uid or not exists (
       select 1 from public.household_members m where m.household_id = v_h and m.user_id = p_other) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  select n.sent_at into v_last from public.settlement_nudges n
   where n.household_id = v_h and n.from_id = uid and n.to_id = p_other for update;
  if found and v_last > now() - interval '24 hours' then
    return jsonb_build_object('ok', false, 'reason', 'too_soon', 'sent_at', v_last);
  end if;
  insert into public.settlement_nudges (household_id, from_id, to_id, sent_at) values (v_h, uid, p_other, now())
  on conflict (household_id, from_id, to_id) do update set sent_at = excluded.sent_at;
  perform public.hh_event(v_h, 'settle_ask', uid, null, array[p_other], '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

-- 6. Sweep (D-20) ------------------------------------------------------------------------------------------------------
-- Reminder to the receiver once pending past day 7 (and not yet expired); lapse past day 14. Idempotent (the unique index on
-- household_events (ref_id, kind) makes a second run write nothing). Everything it does is also done lazily on touch.
create or replace function public.hh_settlement_sweep()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rem integer;
  v_lapsed integer := 0;
  r record;
begin
  insert into public.household_events (household_id, kind, actor_id, subject_id, ref_id, audience, params)
  select s.household_id, 'settle_reminder', null, s.payer_id, s.id, array_remove(array[s.receiver_id], null),
         jsonb_build_object('amount', s.amount, 'currency', s.currency)
    from public.settlements s
   where s.status = 'pending' and s.remind_at <= now() and s.expires_at > now()
  on conflict do nothing;
  get diagnostics v_rem = row_count;
  for r in select s.id from public.settlements s where s.status = 'pending' and s.expires_at <= now() loop
    if public.hh_settlement_lapse(r.id) then v_lapsed := v_lapsed + 1; end if;
  end loop;
  return jsonb_build_object('reminders', v_rem, 'lapsed', v_lapsed);
end;
$$;
revoke execute on function public.hh_settlement_sweep() from public, anon, authenticated;
grant execute on function public.hh_settlement_sweep() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'household-settlement-sweep') then
    perform cron.unschedule('household-settlement-sweep');
  end if;
end;
$$;
select cron.schedule('household-settlement-sweep', '17 * * * *', $$select public.hh_settlement_sweep()$$);

-- 7. Grants for the client RPCs ----------------------------------------------------------------------------------------
revoke execute on function public.propose_settlement(uuid, uuid[], uuid, bigint) from public, anon;
grant execute on function public.propose_settlement(uuid, uuid[], uuid, bigint) to authenticated;
revoke execute on function public.confirm_settlement(uuid, uuid) from public, anon;
grant execute on function public.confirm_settlement(uuid, uuid) to authenticated;
revoke execute on function public.record_received(uuid, uuid[], uuid, bigint) from public, anon;
grant execute on function public.record_received(uuid, uuid[], uuid, bigint) to authenticated;
revoke execute on function public.set_settlement_payer_account(uuid, uuid) from public, anon;
grant execute on function public.set_settlement_payer_account(uuid, uuid) to authenticated;
revoke execute on function public.reject_settlement(uuid) from public, anon;
grant execute on function public.reject_settlement(uuid) to authenticated;
revoke execute on function public.cancel_settlement(uuid) from public, anon;
grant execute on function public.cancel_settlement(uuid) to authenticated;
revoke execute on function public.undo_settlement(uuid) from public, anon;
grant execute on function public.undo_settlement(uuid) to authenticated;
revoke execute on function public.write_off_balance(uuid, uuid[]) from public, anon;
grant execute on function public.write_off_balance(uuid, uuid[]) to authenticated;
revoke execute on function public.ask_to_settle(uuid) from public, anon;
grant execute on function public.ask_to_settle(uuid) to authenticated;
