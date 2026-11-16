-- Phase 8 leaving, removal, ownership transfer, 24-hour reconnect and the account-deletion rule (HH-13, HH-14; D-25..D-29,
-- D-40 database part, CMP-F23). Proven by pgTAP 109 (leave / remove / transfer / reconnect) and 110 (deletion rule).
--
-- What happens to a person's records when they go (D-26, D-28): their personal rows move to a new household of one; each
-- shared line they were on becomes a personal copy of their share; the household keeps the originals with the split
-- unchanged, so the remaining members' balances do not move. Shared lines that sat on the leaver's personal account are
-- re-pointed to an archived "tombstone" account in the household first (a line and its account must share a household).
--
-- Settle-ups in flight when someone goes (the plan is silent; chosen so nothing is invented): a pending settle-up between the
-- leaver and a member stays exactly as it is, with its lines locked, and lapses on day 14 like any other (D-20). The member
-- who stays can still say "Not yet" or cancel; "Got it" answers payer_account_gone because the leaver's account has moved.
-- Open balances never include locked lines, so leaving does not change any balance.

-- 1. households.owner_id no longer cascades away everyone's shared data (RESEARCH Pitfall 3) ---------------------------------
alter table public.households alter column owner_id drop not null;
alter table public.households drop constraint households_owner_id_fkey;
alter table public.households
  add constraint households_owner_id_fkey foreign key (owner_id) references auth.users(id) on delete set null;

-- 2. Server-only columns ----------------------------------------------------------------------------------------------------
-- copied_from / copy_share: a personal copy of a shared line. When the copy carries the full paid amount (the person paid it
-- from their own account), copy_share is their share and "my share" readers use it (note for plan 08-25).
-- paid_by_former_key: the stable former-member key of a payer whose account was deleted (paid_by and created_by are then null).
alter table public.transactions
  add column copied_from uuid,
  add column copy_share bigint,
  add column paid_by_former_key uuid;
alter table public.accounts add column tombstone_of uuid;
alter table public.household_invites add column departure_id uuid;

-- `select *` freezes the column list: re-create so the new columns are selectable (definition and grants as 20261122000700).
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;
revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- A payer who is set by hand again is no longer the former member (the FK nulling paid_by runs without the RPC flag).
create or replace function public.hh_clear_former_payer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('fincwin.household_rpc', true), '') = 'on' and new.paid_by is distinct from old.paid_by
     and new.paid_by is not null then
    new.paid_by_former_key := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.hh_clear_former_payer() from public, anon, authenticated;
create trigger hh_clear_former_payer before update of paid_by on public.transactions
  for each row execute function public.hh_clear_former_payer();

-- 3. Tables -----------------------------------------------------------------------------------------------------------------
create table public.household_former_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,   -- null once the account is deleted
  former_key uuid not null default gen_random_uuid(),          -- stable key used in splits and settlements after deletion
  display_name text,
  colour_key smallint not null,
  name_hidden boolean not null default false,
  reason text not null check (reason in ('left', 'removed', 'deleted')),
  left_at timestamptz not null default now());
create index household_former_members_household_idx on public.household_former_members (household_id);
create index household_former_members_user_idx on public.household_former_members (user_id) where user_id is not null;

create table public.member_departures (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('left', 'removed')),
  new_household_id uuid,
  copy_ids uuid[] not null default '{}',
  tombstone_account_ids uuid[] not null default '{}',
  tracking_account_id uuid,
  prior jsonb not null,               -- role_label, colour_key, weight, display_name, name_hidden, series_ends
  undo_until timestamptz not null default now() + interval '24 hours',
  restored_at timestamptz,
  created_at timestamptz not null default now());
create index member_departures_household_idx on public.member_departures (household_id);
create index member_departures_user_idx on public.member_departures (user_id) where user_id is not null;

alter table public.household_former_members enable row level security;
create policy "members read former members" on public.household_former_members for select to authenticated
  using (household_id in (select public.user_household_ids()));
revoke all on public.household_former_members from anon;
revoke insert, update, delete, truncate on public.household_former_members from authenticated;
grant select on public.household_former_members to authenticated;

-- The leaver's new household id and the ids of their personal copies are theirs alone: no client grant on those columns.
alter table public.member_departures enable row level security;
create policy "members read departures" on public.member_departures for select to authenticated
  using (household_id in (select public.user_household_ids()));
revoke all on public.member_departures from anon;
revoke all on public.member_departures from authenticated;
grant select (id, household_id, user_id, actor_id, kind, undo_until, restored_at, created_at) on public.member_departures to authenticated;

-- 4. Internal helpers (not client-callable) ---------------------------------------------------------------------------------
-- Weights re-split proportionally to 100 (largest remainder, join order); evenly when every remaining weight is 0.
create or replace function public.hh_resplit_weights(p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  mem uuid[];
  w int[];
  alloc bigint[];
  i integer;
begin
  select array_agg(m.user_id order by m.created_at, m.user_id), array_agg(m.weight order by m.created_at, m.user_id)
    into mem, w from public.household_members m where m.household_id = p_household;
  if mem is null then
    return '{}'::jsonb;
  end if;
  if (select coalesce(sum(x), 0) from unnest(w) x) = 0 then
    w := array_fill(1, array[array_length(w, 1)]);
  end if;
  alloc := public.hh_allocate(100, w);
  for i in 1..array_length(mem, 1) loop
    update public.household_members set weight = alloc[i] where household_id = p_household and user_id = mem[i];
  end loop;
  return (select jsonb_object_agg(m.user_id::text, m.weight) from public.household_members m where m.household_id = p_household);
end;
$$;
revoke execute on function public.hh_resplit_weights(uuid) from public, anon, authenticated;

-- floor(100/n) each, +1 to the first 100 % n in join order: the join rule of redeem_invite step (g).
create or replace function public.hh_even_weights(p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  select count(*) into v_n from public.household_members where household_id = p_household;
  update public.household_members m
     set weight = (100 / v_n) + case when o.pos <= (100 % v_n) then 1 else 0 end
    from (select r.user_id, row_number() over (order by r.created_at, r.user_id) as pos
            from public.household_members r where r.household_id = p_household) o
   where m.household_id = p_household and m.user_id = o.user_id;
end;
$$;
revoke execute on function public.hh_even_weights(uuid) from public, anon, authenticated;

create or replace function public.hh_transfer_owner(p_household uuid, p_old uuid, p_new uuid, p_audience uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- one owner per household (partial unique index): the old owner is cleared first
  if p_old is not null then
    update public.household_members set is_owner = false, role_label = 'Flatmate'
     where household_id = p_household and user_id = p_old;
  end if;
  update public.household_members set is_owner = true, role_label = 'Owner'
   where household_id = p_household and user_id = p_new;
  update public.households set owner_id = p_new where id = p_household;
  perform public.hh_event(p_household, 'owner_changed', p_new, null, p_audience, '{}'::jsonb);
end;
$$;
revoke execute on function public.hh_transfer_owner(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

-- Net between a person and one other member over every live shared line: positive = p_user owes p_other.
create or replace function public.hh_pair_net(p_household uuid, p_user uuid, p_other uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(o.amount), 0)::bigint
    from public.hh_pair_owed(p_household, p_user, p_other,
           (select coalesce(array_agg(t.id), '{}') from public.transactions t
             where t.household_id = p_household and t.is_shared and t.deleted_at is null)) o
$$;
revoke execute on function public.hh_pair_net(uuid, uuid, uuid) from public, anon, authenticated;

-- hh_pair_owed, re-created from 20261122000700 with two changes: the payer of a line whose payer's account was deleted is
-- found through paid_by_former_key (so balances survive deletion, closing the 08-11 known limitation), and a tombstone
-- account (archived, shared only so that its lines keep a home) is not a joint account: lines on it still create owing.
create or replace function public.hh_pair_owed(p_household uuid, p_payer uuid, p_receiver uuid, p_line_ids uuid[])
returns table (transaction_id uuid, amount bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         case
           when coalesce(t.paid_by, t.paid_by_former_key, t.created_by) = p_receiver
             then -(select sum(s.share) from public.transaction_splits s
                     where s.transaction_id = t.id and (s.member_id = p_payer or s.former_member_key = p_payer))
           else (select sum(s.share) from public.transaction_splits s
                  where s.transaction_id = t.id and (s.member_id = p_receiver or s.former_member_key = p_receiver))
         end::bigint
    from public.transactions t
   where t.id = any(p_line_ids)
     and t.household_id = p_household
     and t.is_shared and t.deleted_at is null and not t.is_settlement
     and not exists (select 1 from public.accounts a where a.id = t.account_id and a.is_shared and a.tombstone_of is null)
     and not public.hh_line_locked(t.id)
     and (coalesce(t.paid_by, t.paid_by_former_key, t.created_by) = p_receiver
          or coalesce(t.paid_by, t.paid_by_former_key, t.created_by) = p_payer)
     and coalesce((select sum(s.share) from public.transaction_splits s
                    where s.transaction_id = t.id
                      and (s.member_id = case when coalesce(t.paid_by, t.paid_by_former_key, t.created_by) = p_receiver then p_payer else p_receiver end
                           or s.former_member_key = case when coalesce(t.paid_by, t.paid_by_former_key, t.created_by) = p_receiver then p_payer else p_receiver end)), 0) <> 0
$$;
revoke execute on function public.hh_pair_owed(uuid, uuid, uuid, uuid[]) from public, anon, authenticated;

-- Stamps the stable key on everything that names a person whose id is about to disappear (account deletion): splits, the payer
-- of their lines and both sides of their settle-ups. Balances then stay computable against the key (D-29, CMP-F23).
create or replace function public.hh_stamp_former(p_household uuid, p_user uuid, p_key uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('fincwin.household_rpc', 'on', true);
  update public.transaction_splits set former_member_key = p_key where household_id = p_household and member_id = p_user;
  update public.transactions set paid_by_former_key = p_key
   where household_id = p_household and is_shared and coalesce(paid_by, created_by) = p_user;
  update public.settlements set payer_former_key = p_key where household_id = p_household and payer_former_key = p_user;
  update public.settlements set receiver_former_key = p_key where household_id = p_household and receiver_former_key = p_user;
end;
$$;
revoke execute on function public.hh_stamp_former(uuid, uuid, uuid) from public, anon, authenticated;

-- Tombstones: a personal account of the person that carries shared lines (or a shared series) gets an archived shared twin in
-- the household, and those lines move onto it, so transactions_account_same_household still holds when the account goes
-- elsewhere (or is erased). A shared series of the person is ended (it would otherwise keep writing lines for someone who is
-- no longer here); its old end date is returned so a reconnect can put it back.
create or replace function public.hh_tombstone_accounts(p_user uuid, p_household uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  s record;
  v_t uuid;
  v_tombs uuid[] := '{}';
  v_ends jsonb := '{}'::jsonb;
begin
  perform set_config('fincwin.household_rpc', 'on', true);
  for a in select x.* from public.accounts x
            where x.household_id = p_household and x.created_by = p_user and not x.is_shared
              and (exists (select 1 from public.transactions t where t.account_id = x.id and t.is_shared)
                or exists (select 1 from public.recurring_series r where r.account_id = x.id and r.is_shared)) loop
    insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, archived_at, is_shared, tombstone_of)
    values (gen_random_uuid(), p_household, p_user, a.name, a.kind, a.currency, 0, now(), true, a.id)
    returning id into v_t;
    update public.transactions set account_id = v_t where account_id = a.id and is_shared;
    for s in select r.id, r.end_date, r.anchor_date from public.recurring_series r where r.account_id = a.id and r.is_shared loop
      v_ends := v_ends || jsonb_build_object(s.id::text, s.end_date);
      update public.recurring_series
         set account_id = v_t,
             end_date = case when end_date is null or end_date > greatest(current_date, anchor_date - 1)
                             then greatest(current_date, anchor_date - 1) else end_date end
       where id = s.id;
    end loop;
    v_tombs := v_tombs || v_t;
  end loop;
  return jsonb_build_object('tombs', to_jsonb(v_tombs), 'series_ends', v_ends);
end;
$$;
revoke execute on function public.hh_tombstone_accounts(uuid, uuid) from public, anon, authenticated;

-- The leave mover: moves a person's PERSONAL rows from one household to another through the 08-09 allow-list only
-- (hh_move_tables). Shared rows the person created stay in the household, and so do the household tables (settlements, splits,
-- former members, departures, shared category rules), which keeps the remaining members' balances intact.
create or replace function public.hh_move_personal_rows(p_user uuid, p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
  v_shared boolean;
begin
  set constraints public.transactions_account_same_household, public.recurring_series_account_same_household,
    public.statement_periods_account_same_household deferred;
  perform set_config('fincwin.household_rpc', 'on', true);

  for m in select * from public.hh_move_tables() loop
    v_shared := exists (
      select 1 from pg_attribute a
       where a.attrelid = to_regclass('public.' || quote_ident(m.table_name)) and a.attname = 'is_shared' and not a.attisdropped);
    execute format('update public.%I set household_id = $1 where household_id = $2 and %I = $3%s',
                   m.table_name, m.owner_column, case when v_shared then ' and not is_shared' else '' end)
      using p_to, p_from, p_user;
  end loop;

  -- statement_periods has no owner column: it moves with its card account.
  update public.statement_periods sp set household_id = p_to
   where sp.household_id = p_from
     and sp.account_id in (select a.id from public.accounts a where a.household_id = p_to and a.created_by = p_user);
end;
$$;
revoke execute on function public.hh_move_personal_rows(uuid, uuid, uuid) from public, anon, authenticated;

-- Cancels every settle-up still waiting that names the person, at the moment they leave, are removed or delete their account
-- (owner answer 10). The lines unlock at once and the balance remains; the other person gets one settle_departed notice
-- (params: amount, currency, reason 'left' | 'removed' | 'deleted') when they are still in the household. Safe to call twice.
create or replace function public.hh_cancel_pending_settlements(p_household uuid, p_user uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.settlements%rowtype;
  v_n integer := 0;
  v_other uuid;
begin
  for s in update public.settlements x set status = 'cancelled', resolved_at = now()
            where x.household_id = p_household and x.status = 'pending' and (x.payer_id = p_user or x.receiver_id = p_user)
            returning x.* loop
    v_n := v_n + 1;
    update public.settlement_lines set live = false where settlement_id = s.id;
    v_other := case when s.payer_id = p_user then s.receiver_id else s.payer_id end;
    if v_other is not null and exists (select 1 from public.household_members m
                                        where m.household_id = p_household and m.user_id = v_other) then
      perform public.hh_event(p_household, 'settle_departed', p_user, s.id, array[v_other],
                              jsonb_build_object('amount', s.amount, 'currency', s.currency, 'reason', p_reason));
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.hh_cancel_pending_settlements(uuid, uuid, text) from public, anon, authenticated;

-- The departure. p_kind 'left' or 'removed'; p_actor is who did it. Returns the member_departures id.
create or replace function public.hh_depart(p_user uuid, p_household uuid, p_kind text, p_actor uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mem public.household_members%rowtype;
  v_hh public.households%rowtype;
  v_h2 uuid := gen_random_uuid();
  v_dep uuid := gen_random_uuid();
  v_home text;
  v_first text;
  v_track uuid;
  v_tomb jsonb;
  v_copies uuid[] := '{}';
  v_id uuid;
  l record;
  v_paid_own boolean;
  v_cat uuid;
  v_before jsonb;
  v_after jsonb;
begin
  set constraints public.transactions_account_same_household, public.recurring_series_account_same_household,
    public.statement_periods_account_same_household deferred;
  perform set_config('fincwin.household_rpc', 'on', true);

  select * into v_mem from public.household_members where household_id = p_household and user_id = p_user for update;
  if not found or v_mem.is_owner then
    raise exception 'hh_depart: the person is not a non-owner member' using errcode = 'HH003';
  end if;
  select * into v_hh from public.households where id = p_household;
  select p.home_currency into v_home from public.profiles p where p.id = p_user;
  v_first := nullif(left(split_part(btrim(coalesce(v_mem.display_name, '')), ' ', 1), 40), '');
  select jsonb_object_agg(m.user_id::text, m.weight) into v_before from public.household_members m where m.household_id = p_household;

  -- a. the new household of one
  insert into public.households (id, owner_id, name, reporting_currency)
    values (v_h2, p_user, coalesce(v_first || '''s household', 'My household'), coalesce(v_home, 'USD'));
  insert into public.household_members (household_id, user_id, is_owner, weight, colour_key, display_name, name_hidden)
    values (v_h2, p_user, true, 100, 0, v_mem.display_name, v_mem.name_hidden);

  -- b. tombstones for personal accounts that carry shared lines
  v_tomb := public.hh_tombstone_accounts(p_user, p_household);

  -- c. personal copies of every shared line the person was on. Paid from their own account: the copy goes on that account with
  -- the FULL original amount and copy_share = their share (their balance stays right). Otherwise it goes on one archived
  -- tracking account with their share in the household currency. A line they paid for others with no share of their own is
  -- copied in full too (copy_share 0), or their account would lose money they really spent.
  for l in select t.*, s.share as my_share, ta.tombstone_of as own_account
             from public.transactions t
             left join public.transaction_splits s on s.transaction_id = t.id and s.member_id = p_user
             left join public.accounts ta on ta.id = t.account_id and ta.tombstone_of is not null and ta.created_by = p_user
            where t.household_id = p_household and t.is_shared and t.deleted_at is null and not t.is_settlement
              and t.status <> 'skipped'
              and (s.id is not null or (coalesce(t.paid_by, t.created_by) = p_user and ta.id is not null))
            order by t.local_date, t.created_at loop
    v_paid_own := coalesce(l.paid_by, l.created_by) = p_user and l.own_account is not null;
    v_cat := coalesce(
      (select c.category_id from public.transaction_member_categories c where c.transaction_id = l.id and c.user_id = p_user),
      (select k.id from public.categories k where k.id = l.category_id and k.owner_id = p_user));
    v_id := gen_random_uuid();
    if v_paid_own then
      insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                       time_zone, name, note, category_id, status, copied_from, copy_share, is_shared)
      values (v_id, v_h2, p_user, l.own_account, l.original_amount, l.original_currency, l.local_date,
              l.time_zone, l.name, l.note, v_cat, l.status, l.id, coalesce(l.my_share, 0), false);
      v_copies := v_copies || v_id;
    elsif coalesce(l.my_share, 0) <> 0 then
      if v_track is null then
        insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, archived_at)
        values (gen_random_uuid(), v_h2, p_user, left(coalesce(v_hh.name, 'Household'), 60), 'other', v_hh.reporting_currency, 0, now())
        returning id into v_track;
      end if;
      insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                       time_zone, name, note, category_id, status, copied_from, is_shared)
      values (v_id, v_h2, p_user, v_track, l.my_share, v_hh.reporting_currency, l.local_date,
              l.time_zone, l.name, l.note, v_cat, l.status, l.id, false);
      v_copies := v_copies || v_id;
    end if;
  end loop;

  -- c2. Personal rows that rest on a joint account cannot move with the person: lines and series are re-pointed to the
  -- tracking account, and links from goals, holdings, debts and Decide's reserve to it are cleared.
  if exists (select 1 from public.transactions t join public.accounts a on a.id = t.account_id
              where t.household_id = p_household and t.created_by = p_user and not t.is_shared and a.is_shared)
     or exists (select 1 from public.recurring_series r join public.accounts a on a.id = r.account_id
                 where r.household_id = p_household and r.created_by = p_user and not r.is_shared and a.is_shared) then
    if v_track is null then
      insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, archived_at)
      values (gen_random_uuid(), v_h2, p_user, left(coalesce(v_hh.name, 'Household'), 60), 'other', v_hh.reporting_currency, 0, now())
      returning id into v_track;
    end if;
    update public.transactions t set account_id = v_track
     where t.household_id = p_household and t.created_by = p_user and not t.is_shared
       and t.account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
    update public.recurring_series r set account_id = v_track
     where r.household_id = p_household and r.created_by = p_user and not r.is_shared
       and r.account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
  end if;
  update public.debts set account_id = null
   where household_id = p_household and created_by = p_user
     and account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
  update public.savings_goals set account_id = null
   where household_id = p_household and created_by = p_user
     and account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);
  update public.holdings set account_id = case when account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared) then null else account_id end,
                             paid_from_account_id = case when paid_from_account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared) then null else paid_from_account_id end
   where household_id = p_household and created_by = p_user;
  update public.decide_settings set reserve_account_id = null
   where user_id = p_user and reserve_account_id in (select a.id from public.accounts a where a.household_id = p_household and a.is_shared);

  -- c3. shared lines a personal series of the person wrote (joint account lines) stay in the household and let go of the
  -- series, which moves with the person: no line may point across households at a series the person alone can see.
  update public.transactions set recurring_series_id = null, occurrence_date = null
   where household_id = p_household and is_shared
     and recurring_series_id in (select s.id from public.recurring_series s
                                  where s.household_id = p_household and s.created_by = p_user and not s.is_shared);

  -- d. the person's own rows go with them (allow-list only)
  perform public.hh_move_personal_rows(p_user, p_household, v_h2);

  -- e. the former member, the departure record, the membership, the weights, the notices
  insert into public.household_former_members (household_id, user_id, display_name, colour_key, name_hidden, reason)
    values (p_household, p_user, v_mem.display_name, v_mem.colour_key, v_mem.name_hidden,
            case p_kind when 'left' then 'left' else 'removed' end);
  insert into public.member_departures (id, household_id, user_id, actor_id, kind, new_household_id, copy_ids, tombstone_account_ids,
                                        tracking_account_id, prior)
    values (v_dep, p_household, p_user, p_actor, p_kind, v_h2, v_copies,
            (select coalesce(array_agg(x::uuid), '{}') from jsonb_array_elements_text(v_tomb -> 'tombs') x), v_track,
            jsonb_build_object('role_label', v_mem.role_label, 'colour_key', v_mem.colour_key, 'weight', v_mem.weight,
                               'display_name', v_mem.display_name, 'name_hidden', v_mem.name_hidden,
                               'series_ends', v_tomb -> 'series_ends'));
  perform public.hh_cancel_pending_settlements(p_household, p_user, case p_kind when 'left' then 'left' else 'removed' end);
  delete from public.household_members where household_id = p_household and user_id = p_user;
  v_after := public.hh_resplit_weights(p_household);
  perform public.hh_event(p_household, case p_kind when 'left' then 'left' else 'removed' end, p_user, v_dep, null,
                          jsonb_build_object('household_name', v_hh.name));
  if v_before - p_user::text is distinct from v_after then
    perform public.hh_event(p_household, 'weights_changed', null, v_dep, null, jsonb_build_object('before', v_before - p_user::text, 'after', v_after));
  end if;
  if p_kind = 'removed' then
    -- "You're no longer in [household]" (D-28): the removed person sees it in their new household
    perform public.hh_event(v_h2, 'removed', p_user, v_dep, array[p_user], jsonb_build_object('household_name', v_hh.name));
  end if;

  perform set_config('fincwin.household_rpc', '', true);
  return v_dep;
end;
$$;
revoke execute on function public.hh_depart(uuid, uuid, text, uuid) from public, anon, authenticated;

-- 5. RPCs -------------------------------------------------------------------------------------------------------------------
-- security definer, empty search_path, jsonb results {ok, reason}; only a missing session raises (42501, through hh_uid()).

create or replace function public.transfer_ownership(p_new_owner uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if p_new_owner is null or p_new_owner = uid
     or not exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p_new_owner) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  perform 1 from public.households h where h.id = hid for update;
  perform public.hh_transfer_owner(hid, uid, p_new_owner, null);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.leave_household(p_new_owner uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_owner boolean;
  v_n integer;
  v_bal jsonb;
  v_dep uuid;
  v_new uuid;
begin
  select m.household_id, m.is_owner into hid, v_owner
    from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  perform 1 from public.households h where h.id = hid for update;
  select count(*) into v_n from public.household_members where household_id = hid;
  if v_n < 2 then return jsonb_build_object('ok', false, 'reason', 'alone'); end if;
  if v_owner then
    if p_new_owner is null then return jsonb_build_object('ok', false, 'reason', 'pick_new_owner'); end if;
    if p_new_owner = uid or not exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p_new_owner) then
      return jsonb_build_object('ok', false, 'reason', 'not_member');
    end if;
  end if;
  -- waiting settle-ups end now, so their lines count in the balance the warning shows (owner answer 10)
  perform public.hh_cancel_pending_settlements(hid, uid, 'left');
  -- the warning (D-25): signed, positive = the caller owes that person
  select coalesce(jsonb_agg(jsonb_build_object('other_id', m.user_id, 'amount', n.amt) order by m.created_at), '[]'::jsonb) into v_bal
    from public.household_members m
    cross join lateral (select public.hh_pair_net(hid, uid, m.user_id) as amt) n
   where m.household_id = hid and m.user_id <> uid and n.amt <> 0;
  if v_owner then
    perform public.hh_transfer_owner(hid, uid, p_new_owner, null);
  end if;
  v_dep := public.hh_depart(uid, hid, 'left', uid);
  select d.new_household_id into v_new from public.member_departures d where d.id = v_dep;
  return jsonb_build_object('ok', true, 'new_household_id', v_new, 'open_balances', v_bal);
end;
$$;

create or replace function public.remove_member(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_dep uuid;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if p_user is null or p_user = uid
     or not exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  perform 1 from public.households h where h.id = hid for update;
  v_dep := public.hh_depart(p_user, hid, 'removed', uid);
  return jsonb_build_object('ok', true, 'departure_id', v_dep);
end;
$$;

-- The 24-hour undo path (D-28): a new invite that, used by the removed person in time, reconnects their lines.
create or replace function public.reinvite_removed(p_departure_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  d public.member_departures%rowtype;
  v_members integer;
  v_open integer;
  v_code text;
  v_id uuid;
  v_exp timestamptz;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  select * into d from public.member_departures x
   where x.id = p_departure_id and x.household_id = hid and x.kind = 'removed' for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if d.restored_at is not null then return jsonb_build_object('ok', false, 'reason', 'already_restored'); end if;
  if now() >= d.undo_until then return jsonb_build_object('ok', false, 'reason', 'window_closed'); end if;
  perform 1 from public.households h where h.id = hid for update;
  -- an earlier invite for the same departure is replaced
  update public.household_invites set cancelled_at = now()
   where departure_id = d.id and used_at is null and cancelled_at is null;
  select count(*) into v_members from public.household_members where household_id = hid;
  select count(*) into v_open from public.household_invites i
   where i.household_id = hid and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  if v_members + v_open >= 6 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  for attempt in 1..2 loop
    v_code := public.hh_new_invite_code();
    begin
      insert into public.household_invites (household_id, created_by, code_hash, code, expires_at, departure_id)
        values (hid, uid, public.hh_code_hash(v_code), v_code, d.undo_until, d.id)
        returning id, expires_at into v_id, v_exp;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;
  if v_id is null then return jsonb_build_object('ok', false, 'reason', 'try_again'); end if;
  return jsonb_build_object('ok', true, 'invite_id', v_id, 'code', public.hh_group_code(v_code), 'expires_at', v_exp);
end;
$$;

-- The reconnect itself (called by redeem_invite): the removed person's rows come back, their lines go back on their own
-- accounts, the copies and the tracking account are erased, and the membership is restored.
create or replace function public.hh_reconnect(p_departure uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.member_departures%rowtype;
  v_old uuid;
  t record;
  e record;
  v_colour smallint;
begin
  select * into d from public.member_departures where id = p_departure for update;
  select m.household_id into v_old from public.household_members m where m.user_id = d.user_id order by m.created_at limit 1;
  set constraints public.transactions_account_same_household, public.recurring_series_account_same_household,
    public.statement_periods_account_same_household deferred;
  perform set_config('fincwin.household_rpc', 'on', true);

  -- 1. the personal copies (never visible to anyone else) and, when nothing else lives on it, the tracking account
  delete from public.transactions where id = any(d.copy_ids);
  if d.tracking_account_id is not null
     and not exists (select 1 from public.transactions x where x.account_id = d.tracking_account_id)
     and not exists (select 1 from public.recurring_series r where r.account_id = d.tracking_account_id) then
    delete from public.accounts where id = d.tracking_account_id;
  end if;

  -- 2. every personal row comes back (the unchanged 08-09 mover; all rows in the current household are the person's)
  perform public.hh_move_rows(d.user_id, v_old, d.household_id, true);

  -- 3. shared lines go back on the original accounts; the tombstones go
  for t in select a.id, a.tombstone_of from public.accounts a where a.id = any(d.tombstone_account_ids) loop
    update public.transactions set account_id = t.tombstone_of where account_id = t.id;
    update public.recurring_series set account_id = t.tombstone_of where account_id = t.id;
    delete from public.accounts where id = t.id;
  end loop;
  for e in select k as series_id, nullif(v, '') as end_date
             from jsonb_each_text(coalesce(d.prior -> 'series_ends', '{}'::jsonb)) as x(k, v) loop
    update public.recurring_series set end_date = case when e.end_date = 'null' then null else e.end_date::date end
     where id = e.series_id::uuid;
  end loop;

  -- 4. the membership: prior label and colour (next free colour when taken), even weights in join order
  v_colour := (d.prior ->> 'colour_key')::smallint;
  if exists (select 1 from public.household_members m where m.household_id = d.household_id and m.colour_key = v_colour) then
    v_colour := null;
  end if;
  insert into public.household_members (household_id, user_id, is_owner, weight, role_label, colour_key, display_name, name_hidden, created_at)
    values (d.household_id, d.user_id, false, 0, d.prior ->> 'role_label', v_colour, d.prior ->> 'display_name',
            coalesce((d.prior ->> 'name_hidden')::boolean, false), clock_timestamp());
  perform public.hh_even_weights(d.household_id);

  -- 5. the household of one they were parked in goes; the former-member row goes; the record closes
  delete from public.households where id = v_old;
  delete from public.household_former_members
   where id = (select f.id from public.household_former_members f
                where f.household_id = d.household_id and f.user_id = d.user_id and f.reason = 'removed'
                order by f.left_at desc limit 1);
  update public.member_departures set restored_at = now() where id = d.id;
  perform public.hh_event(d.household_id, 'departure_undone', d.user_id, d.id, null, '{}'::jsonb);
  perform set_config('fincwin.household_rpc', '', true);
end;
$$;
revoke execute on function public.hh_reconnect(uuid) from public, anon, authenticated;

-- redeem_invite, re-created from 20261122000500 (the normal join path is unchanged, including
-- hh_personalise_category_rules before the old household goes). New: an invite carrying a departure_id, used by that person
-- inside the 24 hours, reconnects them instead of moving in a household of one.
create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
  d public.member_departures%rowtype;
  v_old uuid;
  v_old_name text;
  v_hname text;
  v_n integer;
  v_before jsonb;
  v_after jsonb;
begin
  -- (a) per-user rate limit
  if public.hh_rate_limited(uid) then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;
  -- (b) the invite row is locked: two people redeeming one code are serialised, the second sees it used
  select * into v from public.household_invites i
   where i.code_hash = public.hh_code_hash(p_code) and length(public.hh_normalise_code(p_code)) = 12
   for update;
  if not found or v.used_at is not null or v.cancelled_at is not null or v.expires_at <= now() then
    perform public.hh_log_attempt(uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- (b2) a reconnect invite works only for the removed person, once, inside the 24 hours
  if v.departure_id is not null then
    select * into d from public.member_departures x where x.id = v.departure_id for update;
    if not found or d.user_id is distinct from uid or d.household_id <> v.household_id
       or d.restored_at is not null or now() >= d.undo_until then
      perform public.hh_log_attempt(uid, false);
      return jsonb_build_object('ok', false, 'reason', 'invalid');
    end if;
  end if;
  -- (c) already in that household: nothing to do
  if exists (select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = uid) then
    return jsonb_build_object('ok', true, 'household_id', v.household_id, 'already_member', true);
  end if;
  -- (d) a household with other members must be left first (D-06); a household of one joins freely (D-01). Not a failed guess.
  select m.household_id, m.display_name into v_old, v_old_name
    from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_old is not null and (select count(*) from public.household_members where household_id = v_old) > 1 then
    return jsonb_build_object('ok', false, 'reason', 'in_other_household');
  end if;
  -- (e) the 6th seat: the household row is locked while members are counted
  perform 1 from public.households h where h.id = v.household_id for update;
  select count(*) into v_n from public.household_members where household_id = v.household_id;
  if v_n >= 6 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  select h.name into v_hname from public.households h where h.id = v.household_id;

  select jsonb_object_agg(m.user_id::text, m.weight) into v_before
    from public.household_members m where m.household_id = v.household_id;

  if d.id is not null then
    -- (f') reconnect (D-28)
    perform public.hh_reconnect(d.id);
  else
    -- (f) move in. Everything stays personal (D-01). The flag lets the pinned household_id change inside this statement only.
    perform set_config('fincwin.household_rpc', 'on', true);
    if v_old is not null then
      perform public.hh_move_rows(uid, v_old, v.household_id, true);
      perform public.hh_personalise_category_rules(uid, v_old);  -- before v_old goes: its shared rules cascade away with it
    end if;
    insert into public.household_members (household_id, user_id, is_owner, weight, display_name, created_at)
      values (v.household_id, uid, false, 0, v_old_name, clock_timestamp());
    if v_old is not null then
      delete from public.households where id = v_old;  -- the household of one; its membership cascades
    end if;

    -- (g) weights re-split evenly in join order: floor(100/n) each, +1 to the first 100 % n (the engine's evenWeights)
    select count(*) into v_n from public.household_members where household_id = v.household_id;
    update public.household_members m
       set weight = (100 / v_n) + case when o.pos <= (100 % v_n) then 1 else 0 end
      from (select r.user_id, row_number() over (order by r.created_at, r.user_id) as pos
              from public.household_members r where r.household_id = v.household_id) o
     where m.household_id = v.household_id and m.user_id = o.user_id;
  end if;
  select jsonb_object_agg(m.user_id::text, m.weight) into v_after
    from public.household_members m where m.household_id = v.household_id;

  -- (h) the invite is spent
  update public.household_invites set used_at = now(), used_by = uid, code = null where id = v.id;
  perform public.hh_log_attempt(uid, true);

  -- (i) the household is told
  if d.id is null then
    perform public.hh_event(v.household_id, 'joined', uid, v.id, null, '{}'::jsonb);
  end if;
  perform public.hh_event(v.household_id, 'weights_changed', null, v.id, null,
    jsonb_build_object('before', v_before, 'after', v_after));

  perform set_config('fincwin.household_rpc', '', true);
  return jsonb_build_object('ok', true, 'household_id', v.household_id, 'household_name', v_hname);
end;
$$;

-- 6. Former-member balances (D-25: either person can still settle it or write it off) ---------------------------------------
-- record_received, re-created from 20261122000700: the person who owed may be a former member (a user id, or the stable
-- former-member key when their account is gone). There is no confirmer then, so the caller's record alone settles it.
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
  v_former boolean := false;
  r record;
  w jsonb;
begin
  select m.household_id into v_h from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if v_h is null then return jsonb_build_object('ok', false, 'reason', 'no_household'); end if;
  if p_payer is null or p_payer = uid then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if not exists (select 1 from public.household_members m where m.household_id = v_h and m.user_id = p_payer) then
    if exists (select 1 from public.household_former_members f
                where f.household_id = v_h and (f.user_id = p_payer or f.former_key = p_payer)) then
      v_former := true;
    else
      return jsonb_build_object('ok', false, 'reason', 'not_member');
    end if;
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
    values (v_id, v_h, case when exists (select 1 from auth.users u where u.id = p_payer) then p_payer end, uid, p_payer, uid,
            v_sum, v_cur, 'confirmed', uid, now());
    insert into public.settlement_lines (settlement_id, transaction_id, household_id, amount)
      select v_id, o.transaction_id, v_h, o.amount from public.hh_pair_owed(v_h, p_payer, uid, v_ids) o;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end;
  w := public.hh_write_settlement_records(v_id, null, p_receiver_account);
  if not (w ->> 'ok')::boolean then
    raise exception 'record_received: %', w ->> 'reason' using errcode = 'HH002';  -- rolled back by the caller's statement
  end if;
  if v_former then
    perform public.hh_event(v_h, 'settled', uid, v_id, array[uid], jsonb_build_object('amount', v_sum, 'currency', v_cur));
  else
    perform public.hh_event(v_h, 'settled', uid, v_id, array[p_payer, uid],
                            jsonb_build_object('amount', v_sum, 'currency', v_cur, 'needs_account', true));
  end if;
  return jsonb_build_object('ok', true, 'settlement_id', v_id, 'amount', v_sum);
exception when sqlstate 'HH002' then
  return jsonb_build_object('ok', false, 'reason', 'rate_unavailable');
end;
$$;

-- The mirror: the caller owes a former member and records that they paid. Only the caller's record is written (D-25).
create or replace function public.record_paid(p_other uuid, p_line_ids uuid[], p_payer_account uuid, p_expected_amount bigint)
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
  if p_other is null or p_other = uid then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if exists (select 1 from public.household_members m where m.household_id = v_h and m.user_id = p_other) then
    return jsonb_build_object('ok', false, 'reason', 'member_still_here');
  end if;
  if not exists (select 1 from public.household_former_members f
                  where f.household_id = v_h and (f.user_id = p_other or f.former_key = p_other)) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if not exists (select 1 from public.accounts a where a.id = p_payer_account and a.created_by = uid
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
  select coalesce(sum(o.amount), 0), count(*) into v_sum, v_count from public.hh_pair_owed(v_h, uid, p_other, v_ids) o;
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
    values (v_id, v_h, uid, case when exists (select 1 from auth.users u where u.id = p_other) then p_other end, uid, p_other,
            v_sum, v_cur, 'confirmed', uid, now());
    insert into public.settlement_lines (settlement_id, transaction_id, household_id, amount)
      select v_id, o.transaction_id, v_h, o.amount from public.hh_pair_owed(v_h, uid, p_other, v_ids) o;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end;
  w := public.hh_write_settlement_records(v_id, p_payer_account, null);
  if not (w ->> 'ok')::boolean then
    raise exception 'record_paid: %', w ->> 'reason' using errcode = 'HH002';
  end if;
  perform public.hh_event(v_h, 'settled', uid, v_id, array[uid], jsonb_build_object('amount', v_sum, 'currency', v_cur));
  return jsonb_build_object('ok', true, 'settlement_id', v_id, 'amount', v_sum);
exception when sqlstate 'HH002' then
  return jsonb_build_object('ok', false, 'reason', 'rate_unavailable');
end;
$$;

-- Owner answer 11: the person who left says "I paid". It is a settle-up they propose toward their old household, waiting for the
-- person who stayed (the receiver), who confirms it with confirm_settlement like any other (D-25: either person can settle).
-- The leaver stays read-only otherwise: they must have a live departure from that household, and only lines they owe that
-- person count, exactly as hh_pair_owed answers (a line they cannot see is refused like a missing id). No payer account is
-- recorded in the old household (the leaver's accounts moved with them); they record the money leaving in their own app.
create or replace function public.propose_leaver_payment(p_household uuid, p_receiver uuid, p_line_ids uuid[], p_expected_amount bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v_cur text;
  v_ids uuid[];
  v_n integer;
  v_sum bigint;
  v_count integer;
  v_id uuid := gen_random_uuid();
  r record;
begin
  if p_household is null or not exists (
       select 1 from public.member_departures d
        where d.household_id = p_household and d.user_id = uid and d.restored_at is null)
     or exists (select 1 from public.household_members m where m.household_id = p_household and m.user_id = uid) then
    return jsonb_build_object('ok', false, 'reason', 'not_departed');
  end if;
  if p_receiver is null or p_receiver = uid or not exists (
       select 1 from public.household_members m where m.household_id = p_household and m.user_id = p_receiver) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(p_line_ids) x where x is not null;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;
  for r in select distinct s.id from public.settlement_lines l join public.settlements s on s.id = l.settlement_id
            where l.transaction_id = any(v_ids) and l.live and s.status = 'pending' and s.expires_at <= now() loop
    perform public.hh_settlement_lapse(r.id);
  end loop;
  select coalesce(sum(o.amount), 0), count(*) into v_sum, v_count from public.hh_pair_owed(p_household, uid, p_receiver, v_ids) o;
  if v_count <> v_n or v_sum <> p_expected_amount then
    if v_count > 0 and v_sum <= 0 and v_count = v_n then
      return jsonb_build_object('ok', false, 'reason', 'nothing_owed');
    end if;
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end if;
  if v_sum <= 0 then return jsonb_build_object('ok', false, 'reason', 'nothing_owed'); end if;

  select h.reporting_currency into v_cur from public.households h where h.id = p_household;
  begin
    insert into public.settlements (id, household_id, payer_id, receiver_id, payer_former_key, receiver_former_key, amount, currency,
                                    status, created_by, remind_at, expires_at)
    values (v_id, p_household, uid, p_receiver, uid, p_receiver, v_sum, v_cur, 'pending', uid,
            now() + interval '7 days', now() + interval '14 days');
    insert into public.settlement_lines (settlement_id, transaction_id, household_id, amount)
      select v_id, o.transaction_id, p_household, o.amount from public.hh_pair_owed(p_household, uid, p_receiver, v_ids) o;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'lines_changed', 'server_amount', v_sum);
  end;
  perform public.hh_event(p_household, 'settle_request', uid, v_id, array[p_receiver],
                          jsonb_build_object('amount', v_sum, 'currency', v_cur, 'from_leaver', true));
  return jsonb_build_object('ok', true, 'settlement_id', v_id, 'amount', v_sum);
end;
$$;

-- confirm_settlement, re-created from 20261122000700 with one change: the payer's account must still be in the settle-up's
-- household. After the payer has left, their account has moved with them: "Got it" then answers payer_account_gone instead
-- of failing on the account/household constraint.
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
  v_payer_here boolean;
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
  -- A settle-up the leaver proposed has no payer account in this household (theirs moved with them, and they record the money
  -- leaving in their own app); every other settle-up needs the payer's account.
  v_payer_here := exists (select 1 from public.household_members m where m.household_id = s.household_id and m.user_id = s.payer_id);
  if v_payer_here and not exists (select 1 from public.accounts a where a.id = s.payer_account_id and a.deleted_at is null
                                   and a.household_id = s.household_id) then
    return jsonb_build_object('ok', false, 'reason', 'payer_account_gone');
  end if;
  w := public.hh_write_settlement_records(s.id, case when v_payer_here then s.payer_account_id end, p_receiver_account);
  if not (w ->> 'ok')::boolean then return w; end if;
  update public.settlements set status = 'confirmed', confirmed_at = now() where id = s.id;
  perform public.hh_event(s.household_id, 'settled', uid, s.id, array_remove(array[s.payer_id, s.receiver_id], null),
                          jsonb_build_object('amount', s.amount, 'currency', s.currency));
  return jsonb_build_object('ok', true);
end;
$$;

-- What the leaver still owes or is owed in each household they left (read-only: "You owe Paul $40"). Recomputed live.
-- Signed per person, positive = the caller owes them. Names respect "hide my name".
create or replace function public.my_departed_balances()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  res jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'departure_id', d.id, 'household_id', d.household_id, 'household_name', h.name, 'kind', d.kind,
           'other_id', m.user_id, 'other_display_name', case when m.name_hidden then null else m.display_name end,
           'other_colour_key', m.colour_key, 'amount', n.amt,
           'pending_settlement_id', pd.id, 'pending_amount', pd.amount) order by d.created_at, m.created_at), '[]'::jsonb)
    into res
    from public.member_departures d
    join public.households h on h.id = d.household_id
    join public.household_members m on m.household_id = d.household_id
    cross join lateral (select public.hh_pair_net(d.household_id, uid, m.user_id) as amt) n
    left join lateral (select x.id, x.amount from public.settlements x
                        where x.household_id = d.household_id and x.status = 'pending' and x.expires_at > now()
                          and x.payer_id = uid and x.receiver_id = m.user_id
                        order by x.created_at desc limit 1) pd on true
   where d.user_id = uid and d.restored_at is null and (n.amt <> 0 or pd.id is not null);
  return jsonb_build_object('ok', true, 'balances', res);
end;
$$;

-- The paragraph on the delete-my-account screen (D-27): who becomes the owner, and whether anyone shares the household.
create or replace function public.account_deletion_preview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_owner boolean;
  v_n integer;
  v_next uuid;
  v_name text;
begin
  select m.household_id, m.is_owner into hid, v_owner from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if hid is null then
    return jsonb_build_object('in_shared_household', false, 'is_owner', false, 'next_owner_user_id', null, 'household_name', null);
  end if;
  select count(*) into v_n from public.household_members where household_id = hid;
  select h.name into v_name from public.households h where h.id = hid;
  select m.user_id into v_next from public.household_members m
   where m.household_id = hid and m.user_id <> uid order by m.created_at, m.user_id limit 1;
  return jsonb_build_object('in_shared_household', v_n > 1, 'is_owner', v_owner,
                            'next_owner_user_id', case when v_owner and v_n > 1 then v_next end, 'household_name', v_name);
end;
$$;

-- 7. Account deletion (D-27, D-29, CMP-F23) ---------------------------------------------------------------------------------
-- Everything personal is erased (the rows whose created_by would otherwise only be nulled), in dependency-safe order.
create or replace function public.hh_erase_personal_rows(p_user uuid, p_household uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t text;
  v_shared boolean;
begin
  perform set_config('fincwin.household_rpc', 'on', true);
  -- A personal series can have written shared lines (a joint account shares its outgoing lines at once). Those lines stay as
  -- shared records, so they let go of the series that is about to be erased (transactions.recurring_series_id is RESTRICT).
  update public.transactions set recurring_series_id = null, occurrence_date = null
   where household_id = p_household and is_shared
     and recurring_series_id in (select s.id from public.recurring_series s
                                  where s.household_id = p_household and s.created_by = p_user and not s.is_shared);
  foreach t in array array['transactions', 'holding_lots', 'holdings', 'savings_goals', 'decide_answers', 'decide_changes',
                           'decide_links', 'decide_checks', 'debts', 'recurring_dismissals', 'income_payer_prompts',
                           'recurring_series', 'accounts'] loop
    v_shared := exists (
      select 1 from pg_attribute a
       where a.attrelid = to_regclass('public.' || quote_ident(t)) and a.attname = 'is_shared' and not a.attisdropped);
    execute format('delete from public.%I where household_id = $1 and created_by = $2%s',
                   t, case when v_shared then ' and not is_shared' else '' end)
      using p_household, p_user;
  end loop;
end;
$$;
revoke execute on function public.hh_erase_personal_rows(uuid, uuid) from public, anon, authenticated;

-- Runs before the auth.users row goes, so the household's shared data and the remaining members' balances are settled before
-- the foreign keys null created_by / paid_by / member_id. Deletion is never blocked (D-27): only a data-integrity violation
-- (SQLSTATE class 23) is re-raised, because it would leave rows half erased; any other failure is logged as a warning and the
-- deletion proceeds, the foreign keys then erase or null what they own.
create or replace function public.hh_before_user_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  mem record;
  f record;
  v_next uuid;
  v_key uuid;
  v_n integer;
  v_before jsonb;
  v_after jsonb;
begin
  begin
    perform set_config('fincwin.household_rpc', 'on', true);

    -- households this person left earlier: their splits and settle-ups there keep a stable key, their name is erased
    for f in select * from public.household_former_members where user_id = old.id loop
      perform public.hh_cancel_pending_settlements(f.household_id, old.id, 'deleted');
      perform public.hh_stamp_former(f.household_id, old.id, f.former_key);
      update public.household_former_members set display_name = null, reason = 'deleted' where id = f.id;
    end loop;

    -- the household they are in now
    for mem in select * from public.household_members where user_id = old.id loop
      select count(*) into v_n from public.household_members where household_id = mem.household_id;
      if v_n <= 1 then
        -- alone: the whole household goes with them
        delete from public.households where id = mem.household_id;
        continue;
      end if;

      select jsonb_object_agg(m.user_id::text, m.weight) into v_before from public.household_members m where m.household_id = mem.household_id;
      if mem.is_owner then
        -- ownership passes to the member who joined earliest, who is told (D-27)
        select m.user_id into v_next from public.household_members m
         where m.household_id = mem.household_id and m.user_id <> old.id order by m.created_at, m.user_id limit 1;
        perform public.hh_transfer_owner(mem.household_id, old.id, v_next, array[v_next]);
      end if;

      perform public.hh_cancel_pending_settlements(mem.household_id, old.id, 'deleted');
      v_key := gen_random_uuid();
      insert into public.household_former_members (household_id, user_id, former_key, display_name, colour_key, name_hidden, reason)
        values (mem.household_id, old.id, v_key, null, mem.colour_key, mem.name_hidden, 'deleted');
      perform public.hh_stamp_former(mem.household_id, old.id, v_key);
      perform public.hh_tombstone_accounts(old.id, mem.household_id);
      perform public.hh_erase_personal_rows(old.id, mem.household_id);
      delete from public.household_members where household_id = mem.household_id and user_id = old.id;
      v_after := public.hh_resplit_weights(mem.household_id);
      perform public.hh_event(mem.household_id, 'left', null, null, null, jsonb_build_object('deleted', true));
      if v_before - old.id::text is distinct from v_after then
        perform public.hh_event(mem.household_id, 'weights_changed', null, null, null,
                                jsonb_build_object('before', v_before - old.id::text, 'after', v_after));
      end if;
    end loop;
    perform set_config('fincwin.household_rpc', '', true);
  exception
    when integrity_constraint_violation then
      raise;
    when others then
      raise warning 'hh_before_user_delete: %, deletion continues', sqlerrm;
  end;
  return old;
end;
$$;
revoke execute on function public.hh_before_user_delete() from public, anon, authenticated;

create trigger hh_before_user_delete
  before delete on auth.users
  for each row execute function public.hh_before_user_delete();

-- 8. Grants for the client RPCs ---------------------------------------------------------------------------------------------
revoke execute on function public.transfer_ownership(uuid) from public, anon;
grant execute on function public.transfer_ownership(uuid) to authenticated;
revoke execute on function public.leave_household(uuid) from public, anon;
grant execute on function public.leave_household(uuid) to authenticated;
revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated;
revoke execute on function public.reinvite_removed(uuid) from public, anon;
grant execute on function public.reinvite_removed(uuid) to authenticated;
revoke execute on function public.my_departed_balances() from public, anon;
grant execute on function public.my_departed_balances() to authenticated;
revoke execute on function public.account_deletion_preview() from public, anon;
grant execute on function public.account_deletion_preview() to authenticated;
revoke execute on function public.propose_leaver_payment(uuid, uuid, uuid[], bigint) from public, anon;
grant execute on function public.propose_leaver_payment(uuid, uuid, uuid[], bigint) to authenticated;
revoke execute on function public.record_paid(uuid, uuid[], uuid, bigint) from public, anon;
grant execute on function public.record_paid(uuid, uuid[], uuid, bigint) to authenticated;
revoke execute on function public.record_received(uuid, uuid[], uuid, bigint) from public, anon;
grant execute on function public.record_received(uuid, uuid[], uuid, bigint) to authenticated;
revoke execute on function public.confirm_settlement(uuid, uuid) from public, anon;
grant execute on function public.confirm_settlement(uuid, uuid) to authenticated;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
