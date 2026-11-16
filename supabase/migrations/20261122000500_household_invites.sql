-- Phase 8 invites and joining (HH-01, HH-02, HH-15; D-01..D-07, D-10). Proven by 105 (lifecycle, guessing futility) and
-- 106 (move-in). Invite codes: 12 Crockford symbols = 60 bits, stored as a sha256 hash, rate-limited per user.

create extension if not exists pgcrypto with schema extensions;

-- 1. Tables ---------------------------------------------------------------------------------------------------
create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code_hash text not null unique,
  code text,                          -- plain code kept only while open, for the owner's "Copy link"; nulled on use/expiry
  expires_at timestamptz not null default now() + interval '7 days',   -- D-02
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now());
create index household_invites_household_idx on public.household_invites (household_id);

create table public.redeem_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  ok boolean not null,
  at timestamptz not null default now());
create index redeem_attempts_user_at on public.redeem_attempts (user_id, at desc);
create index redeem_attempts_fail_at on public.redeem_attempts (at desc) where not ok;

alter table public.household_invites enable row level security;
create policy "owner reads own invites" on public.household_invites for select to authenticated
  using (created_by = (select auth.uid()) and household_id in (select public.user_household_ids()));
revoke all on public.household_invites from anon;
revoke insert, update, delete, truncate on public.household_invites from authenticated;
revoke select on public.household_invites from authenticated;
grant select (id, household_id, created_by, expires_at, used_at, cancelled_at, created_at) on public.household_invites to authenticated;

alter table public.redeem_attempts enable row level security;
revoke all on public.redeem_attempts from anon, authenticated;

-- 2. Code helpers (not client-callable) -----------------------------------------------------------------------
-- 12 symbols x 5 bits = 60 bits. 256 is a multiple of 32, so `byte % 32` is unbiased.
create or replace function public.hh_new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  b bytea := extensions.gen_random_bytes(12);
  res text := '';
  i int;
begin
  for i in 0..11 loop
    res := res || substr(alphabet, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  return res;
end;
$$;
revoke execute on function public.hh_new_invite_code() from public, anon, authenticated;

create or replace function public.hh_normalise_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(upper(regexp_replace(coalesce(p, ''), '[[:space:]-]', '', 'g')), 'OIL', '011')
$$;
revoke execute on function public.hh_normalise_code(text) from public, anon, authenticated;

create or replace function public.hh_code_hash(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(public.hh_normalise_code(p), 'sha256'), 'hex')
$$;
revoke execute on function public.hh_code_hash(text) from public, anon, authenticated;

create or replace function public.hh_group_code(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select substr(p, 1, 4) || '-' || substr(p, 5, 4) || '-' || substr(p, 9, 4)
$$;
revoke execute on function public.hh_group_code(text) from public, anon, authenticated;

-- 3. Rate limit -----------------------------------------------------------------------------------------------
-- Per user only: 5 failures in the last hour or 20 in the last 24 hours. Global rate is alert-only by design
-- (DoS trade-off, T-08-109): a global brake would let a few attacker accounts lock every legitimate joiner out, and it
-- buys no security because the 60-bit space already makes guessing futile.
create or replace function public.hh_rate_limited(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select count(*) from public.redeem_attempts a
           where a.user_id = p_user and not a.ok and a.at > now() - interval '1 hour') >= 5
      or (select count(*) from public.redeem_attempts a
           where a.user_id = p_user and not a.ok and a.at > now() - interval '24 hours') >= 20
$$;
revoke execute on function public.hh_rate_limited(uuid) from public, anon, authenticated;

-- Global rate is alert-only by design (DoS trade-off, T-08-109). Service role and dashboards only.
create or replace function public.hh_redeem_failure_rate()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.redeem_attempts a where not a.ok and a.at > now() - interval '1 hour'
$$;
revoke execute on function public.hh_redeem_failure_rate() from public, anon, authenticated;

-- Records one attempt. Callers return jsonb afterwards and never raise, so a failure row is committed with the call.
create or replace function public.hh_log_attempt(p_user uuid, p_ok boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_ok then
    insert into public.redeem_attempts (user_id, ok) values (p_user, true);
    return;
  end if;
  insert into public.redeem_attempts (user_id, ok) values (p_user, false);
  n := public.hh_redeem_failure_rate();
  if n >= 200 then
    -- Global rate is alert-only by design (DoS trade-off, T-08-109): logged, never blocks anyone.
    raise log 'hh_redeem_global_failure_rate %', n;
  end if;
end;
$$;
revoke execute on function public.hh_log_attempt(uuid, boolean) from public, anon, authenticated;

-- 4. Moving rows between households ---------------------------------------------------------------------------
-- A person's account and its transactions, series and statement periods name a household in a composite FK. A move
-- changes the household of every row in turn, so these three constraints are deferred for the move (checked at commit,
-- when every row has moved). Normal client writes still check immediately.
alter table public.transactions alter constraint transactions_account_same_household deferrable initially immediate;
alter table public.recurring_series alter constraint recurring_series_account_same_household deferrable initially immediate;
alter table public.statement_periods alter constraint statement_periods_account_same_household deferrable initially immediate;

-- Dismissals and payer prompts are personal (owner-only since 08-01) but their live-key indexes were household-wide, so a
-- second member dismissing the same payee would hit an invisible duplicate. Keys are now per person.
drop index if exists public.recurring_dismissals_live_key;
create unique index recurring_dismissals_live_key
  on public.recurring_dismissals (household_id, created_by, payee_key, direction) where deleted_at is null;
drop index if exists public.income_payer_prompts_live_key;
create unique index income_payer_prompts_live_key
  on public.income_payer_prompts (household_id, created_by, payer_key) where deleted_at is null;

-- Allow-list: tables with household_id + an owner column that move with a person. User-keyed tables (no household_id)
-- follow the user id and never need moving. category_rules has its own join-only step (hh_personalise_category_rules).
-- Phase 8 household tables (household_invites, transaction_splits, transaction_member_categories, household_split_defaults,
-- settlements, settlement_lines, settlement_nudges, household_former_members, member_departures, decide_partner_optins,
-- partner_figures, safety_net_shares) never move: they belong to the household and keep the remaining members' balances
-- intact. A new personal household_id table must be added here; pgTAP 106 fails until it is. Order matters: a table
-- comes after the tables its guard triggers compare against (accounts, series, debts, checks, holdings).
create or replace function public.hh_move_tables()
returns table (table_name text, owner_column text)
language plpgsql
immutable
set search_path = ''
as $$
begin
  return query values
    ('accounts', 'created_by'), ('transactions', 'created_by'), ('recurring_series', 'created_by'),
    ('debts', 'created_by'), ('recurring_dismissals', 'created_by'), ('income_payer_prompts', 'created_by'),
    ('decide_checks', 'created_by'), ('decide_links', 'created_by'), ('decide_changes', 'created_by'),
    ('decide_answers', 'created_by'), ('savings_goals', 'created_by'), ('holdings', 'created_by'),
    ('holding_lots', 'created_by');
end;
$$;
revoke execute on function public.hh_move_tables() from public, anon, authenticated;

create or replace function public.hh_move_rows(p_user uuid, p_from uuid, p_to uuid, p_make_personal boolean)
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
    v_shared := p_make_personal and exists (
      select 1 from pg_attribute a
       where a.attrelid = to_regclass('public.' || quote_ident(m.table_name)) and a.attname = 'is_shared' and not a.attisdropped);
    execute format('update public.%I set household_id = $1%s where household_id = $2 and %I = $3',
                   m.table_name, case when v_shared then ', is_shared = false' else '' end, m.owner_column)
      using p_to, p_from, p_user;
  end loop;

  -- statement_periods has no owner column: it moves with its card account.
  update public.statement_periods sp set household_id = p_to
   where sp.household_id = p_from
     and sp.account_id in (select a.id from public.accounts a where a.household_id = p_to and a.created_by = p_user);
end;
$$;
revoke execute on function public.hh_move_rows(uuid, uuid, uuid, boolean) from public, anon, authenticated;

-- Join-only. Shared rules belong to a household; on join the joiner's own shared rules become personal, mapped to their own
-- category by builtin key or name. No match or keyword clash -> soft-deleted, then gone with the old household. Leaving
-- never converts or moves shared rules.
create or replace function public.hh_personalise_category_rules(p_user uuid, p_from uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('fincwin.household_rpc', 'on', true);

  -- 1. Clash: the user's existing personal rule wins.
  update public.category_rules r set deleted_at = now()
   where r.household_id = p_from and r.scope = 'shared' and r.created_by = p_user and r.deleted_at is null
     and exists (select 1 from public.category_rules p
                  where p.scope = 'personal' and p.owner_id = p_user and p.deleted_at is null and p.keyword_norm = r.keyword_norm);

  -- 2. No matching category of the user's own.
  update public.category_rules r set deleted_at = now()
   where r.household_id = p_from and r.scope = 'shared' and r.created_by = p_user and r.deleted_at is null
     and not exists (
       select 1 from public.categories c
        where c.owner_id = p_user and not c.is_system and c.archived_at is null
          and ((r.target_builtin_key is not null and c.builtin_key = r.target_builtin_key)
            or (r.target_name is not null and c.builtin_key is null and lower(btrim(c.name)) = lower(btrim(r.target_name)))));

  -- 3. Convert the rest in place (keeps id, keyword, created_by, history).
  update public.category_rules r
     set scope = 'personal', owner_id = p_user, household_id = null,
         category_id = (select c.id from public.categories c
                         where c.owner_id = p_user and not c.is_system and c.archived_at is null
                           and ((r.target_builtin_key is not null and c.builtin_key = r.target_builtin_key)
                             or (r.target_name is not null and c.builtin_key is null and lower(btrim(c.name)) = lower(btrim(r.target_name))))
                         order by c.created_at limit 1),
         target_builtin_key = null, target_name = null
   where r.household_id = p_from and r.scope = 'shared' and r.created_by = p_user and r.deleted_at is null;
end;
$$;
revoke execute on function public.hh_personalise_category_rules(uuid, uuid) from public, anon, authenticated;

-- 5. Pin triggers: household_id is pinned on update except inside the household RPCs (Pitfall 7) -----------------
-- Each function below is re-issued from its newest body with the one `household_id` pin made conditional on
-- fincwin.household_rpc. A normal client update is still pinned.

-- guard_recurring_series (newest body: 20260926000300_recurring_series.sql)
create or replace function public.guard_recurring_series()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- D-WR-08 (and D-WR-01): on UPDATE, only re-validate what actually
  -- changed. Re-checking an untouched currency/time zone/category on every
  -- update made unrelated writes fail -- the materialiser's bookkeeping
  -- update after a tzdata upgrade drops a zone, or the ON DELETE SET NULL of
  -- created_by during account deletion (the category's owner is the user
  -- being deleted, so the ownership check can no longer pass).
  if (tg_op = 'INSERT' or new.currency is distinct from old.currency)
     and not public.is_known_currency(new.currency, coalesce(new.created_by, (select auth.uid()))) then
    raise exception 'unknown currency %', new.currency using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.time_zone is distinct from old.time_zone)
     and not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'unknown time zone %', new.time_zone using errcode = '23514';
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and new.category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = new.category_id
      and (c.owner_id = (select auth.uid()) or c.owner_id = new.created_by)
  ) then
    raise exception 'unknown category' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
    -- D-WR-08: pinned against any change except being cleared, which only
    -- the ON DELETE SET NULL action from auth.users does (no client can
    -- write this table at all); reverting that would fail the FK and abort
    -- the departing member's account deletion.
    new.created_by := case when new.created_by is null then null else old.created_by end;
  end if;
  return new;
end;
$$;

-- guard_decide_check (newest body: 20261021000100_decide_review_fixes.sql)
create or replace function public.guard_decide_check()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.created_at := old.created_at;
  if new.reopened_from is not null then new.reopened_from := old.reopened_from; end if;  -- WR-A01
  new.is_sample := old.is_sample;
  -- an ON DELETE SET NULL / cascade from auth.users may touch created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  if old.status <> 'open' and (
       new.inputs is distinct from old.inputs
       or new.name is distinct from old.name
       or new.furthest_step is distinct from old.furthest_step
       or new.kind is distinct from old.kind) then
    raise exception 'decide_checks: a decided check is read-only' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- guard_debt (newest body: 20261122000300_household_privacy_rpcs.sql)
create or replace function public.guard_debt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.account_id is not null and not exists (
       select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'debts: account is not in this household' using errcode = '42501';
  end if;
  if new.series_id is not null and not exists (
       select 1 from public.recurring_series s where s.id = new.series_id and s.household_id = new.household_id) then
    raise exception 'debts: series is not in this household' using errcode = '42501';
  end if;
  -- 08-05: a debt's account is the owner's own or joint, and its series is the owner's own (checked when set or changed)
  if new.account_id is not null and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'debts: account is not yours or joint' using errcode = '42501';
  end if;
  if new.series_id is not null and new.created_by is not null and (tg_op = 'INSERT' or new.series_id is distinct from old.series_id)
     and not exists (select 1 from public.recurring_series s where s.id = new.series_id and s.created_by = new.created_by) then
    raise exception 'debts: series is not yours' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    new.id := old.id;
    if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    if new.created_by is not null then new.created_by := old.created_by; end if;
    if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' and new.check_id is not null then  -- WR-A01
      new.check_id := old.check_id;
    end if;
    new.updated_at := now();
  end if;
  -- R18.4: a card is never housing; otherwise the flag turns ON (never off) from the old signals, on insert and
  -- on a server-run update that sets series_id or check_id.
  if new.kind = 'card' then
    new.is_housing := false;
  elsif not new.is_housing
        and (tg_op = 'INSERT' or coalesce(current_setting('fincwin.decide_rpc', true), '') = 'on')
        and (new.series_id is not null or new.check_id is not null)
        and (exists (select 1 from public.recurring_series s join public.categories c on c.id = s.category_id
                      where s.id = new.series_id and c.builtin_key = 'Housing')
             or exists (select 1 from public.decide_checks k
                         where k.id = new.check_id and k.inputs ->> 'itemType' = 'property')) then
    new.is_housing := true;
  end if;
  return new;
end;
$$;

-- guard_decide_link (newest body: 20261016000110_decide_depth_tables.sql)
create or replace function public.guard_decide_link()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    if coalesce(current_setting('fincwin.decide_rpc', true), '') <> 'on' then
      new.source := 'attached';
    end if;
    if not exists (
         select 1 from public.decide_checks c
          where c.id = new.check_id and c.household_id = new.household_id and c.created_by = new.created_by) then
      raise exception 'decide_links: check is not yours in this household' using errcode = '42501';
    end if;
    if not (case new.entity
              when 'transactions' then exists (
                select 1 from public.transactions t where t.id = new.target_id and t.household_id = new.household_id)
              when 'recurring_series' then exists (
                select 1 from public.recurring_series s where s.id = new.target_id and s.household_id = new.household_id)
              else exists (
                select 1 from public.debts d where d.id = new.target_id and d.household_id = new.household_id)
            end) then
      raise exception 'decide_links: target is not in this household' using errcode = '42501';
    end if;
  else
    new.id := old.id;
    if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.check_id := old.check_id;
    new.entity := old.entity;
    new.target_id := old.target_id;
    new.source := old.source;
    new.role := old.role;  -- 05-32
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- guard_decide_change (newest body: 20261016000110_decide_depth_tables.sql)
create or replace function public.guard_decide_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  -- an ON DELETE SET NULL / cascade from auth.users may touch created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- guard_savings_goal (newest body: 20261122000300_household_privacy_rpcs.sql)
create or replace function public.guard_savings_goal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('fincwin.decide_rpc', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_rpc then new.kind := 'pot'; end if;
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    if new.is_safety_net then new.locked := true; end if;  -- 06
    if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
      raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
    end if;  -- 05.2
    -- 06: compare to the stamped created_by (auth.uid() for every client; clients have no created_by grant), so the
    -- Wait RPC and owner-role writers with no JWT still link their own check. Same rule as guard_holding_lot.
    if new.account_id is not null and not public.hh_account_usable(new.account_id, new.created_by) then  -- 08-05
      raise exception 'savings_goals: account is not yours or joint' using errcode = '42501';
    end if;
    if new.check_id is not null and not exists (select 1 from public.decide_checks c where c.id = new.check_id and c.household_id = new.household_id and c.created_by = new.created_by) then  -- 06
      raise exception 'savings_goals: check is not yours' using errcode = '42501';  -- 06
    end if;  -- 06
    return new;
  end if;
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.created_at := old.created_at;
  new.is_sample := old.is_sample;
  new.kind := old.kind;
  new.bucket := old.bucket;  -- 05.2
  if new.created_by is not null then new.created_by := old.created_by; end if;
  if new.check_id is not null then new.check_id := old.check_id; end if;  -- WR-A01: only SET NULL may land
  -- 06: the safety-net flag moves only inside set_safety_net (D-29) or an undo replay of that swap
  if coalesce(current_setting('fincwin.safety_net_rpc', true), '') <> 'on'
     and coalesce(current_setting('fincwin.undo_replay', true), '') <> 'on' then  -- 06
    new.is_safety_net := old.is_safety_net;  -- 06
  end if;  -- 06
  if new.is_safety_net then new.locked := true; end if;  -- 06
  if old.is_safety_net and new.deleted_at is not null and old.deleted_at is null then  -- 06
    raise exception 'savings_goals: the safety net cannot be removed' using errcode = '42501';  -- 06
  end if;  -- 06
  if old.kind = 'pot' then
    new.currency := old.currency;
    -- 06: monthly_amount is editable on every pot (D-17, D-20); the 05.2 pin for non-bucket pots is gone
  elsif not v_rpc then
    new.name := old.name;
    new.currency := old.currency;
    new.target := old.target;
    new.monthly_amount := old.monthly_amount;
    new.ready_by := old.ready_by;
    new.opening_saved := old.opening_saved;
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then  -- 05.2
    raise exception 'savings_goals: account is not in this household' using errcode = '42501';  -- 05.2
  end if;  -- 05.2
  if new.account_id is not null and new.account_id is distinct from old.account_id  -- 08-05
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'savings_goals: account is not yours or joint' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- guard_recurring_dismissal (newest body: 20261028000800_recurring_dismissals.sql)
create or replace function public.guard_recurring_dismissal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.payee_key := old.payee_key;
  new.direction := old.direction;
  new.dismissed_at := old.dismissed_at;
  new.created_at := old.created_at;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- guard_income_payer_prompt (newest body: 20261028000900_income_payer_prompts.sql)
create or replace function public.guard_income_payer_prompt()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.payer_key := old.payer_key;
  new.created_at := old.created_at;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- guard_decide_answer (newest body: 20261028001000_decide_answers.sql)
create or replace function public.guard_decide_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.check_id is not null and not exists (
       select 1 from public.decide_checks k where k.id = new.check_id and k.household_id = new.household_id) then
    raise exception 'decide_answers: check is not in this household' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    return new;
  end if;
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.kind := old.kind;
  new.key := old.key;
  new.check_id := old.check_id;
  new.created_at := old.created_at;
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- guard_holding (newest body: 20261122000300_household_privacy_rpcs.sql)
create or replace function public.guard_holding()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
  else
    new.id := old.id;
    if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
    new.created_at := old.created_at;
    new.is_sample := old.is_sample;
    new.created_by := old.created_by;
    new.currency := old.currency;
    if coalesce(current_setting('fincwin.holding_sync', true), '') <> 'on' then
      new.value := old.value;
      new.value_as_of := old.value_as_of;
    end if;
    new.updated_at := now();
  end if;
  if new.account_id is not null and not exists (select 1 from public.accounts a where a.id = new.account_id and a.household_id = new.household_id) then
    raise exception 'holdings: account is not in this household' using errcode = '42501';
  end if;
  if new.paid_from_account_id is not null and not exists (select 1 from public.accounts a where a.id = new.paid_from_account_id and a.household_id = new.household_id) then
    raise exception 'holdings: paid-from account is not in this household' using errcode = '42501';
  end if;
  -- 08-05: the accounts are the owner's own or joint (checked when set or changed)
  if new.account_id is not null and (tg_op = 'INSERT' or new.account_id is distinct from old.account_id)
     and not public.hh_account_usable(new.account_id, new.created_by) then
    raise exception 'holdings: account is not yours or joint' using errcode = '42501';
  end if;
  if new.paid_from_account_id is not null and (tg_op = 'INSERT' or new.paid_from_account_id is distinct from old.paid_from_account_id)
     and not public.hh_account_usable(new.paid_from_account_id, new.created_by) then
    raise exception 'holdings: paid-from account is not yours or joint' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- guard_holding_lot (newest body: 20261110000200_grow_review_fixes.sql)
create or replace function public.guard_holding_lot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce((select auth.uid()), new.created_by);
    new.updated_by := new.created_by;
    if not exists (select 1 from public.holdings h
                    where h.id = new.holding_id and h.household_id = new.household_id and h.created_by = new.created_by) then
      raise exception 'holding_lots: holding is not yours' using errcode = '42501';
    end if;
    return new;
  end if;
  new.id := old.id;
  new.holding_id := old.holding_id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then new.household_id := old.household_id; end if;  -- 08-09: join/leave moves
  new.kind := old.kind;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.is_sample := old.is_sample;
  -- 06 review P1-IN-02: a live holding keeps at least one live value entry; removing the last would leave the holding
  -- showing a value with no history behind it.
  if old.kind = 'value' and old.deleted_at is null and new.deleted_at is not null  -- 06 review
     and exists (select 1 from public.holdings h where h.id = old.holding_id and h.deleted_at is null)  -- 06 review
     and not exists (select 1 from public.holding_lots l  -- 06 review
                      where l.holding_id = old.holding_id and l.kind = 'value' and l.deleted_at is null and l.id <> old.id) then  -- 06 review
    raise exception 'holding_lots: the last value entry of a holding cannot be removed' using errcode = '22023';  -- 06 review
  end if;  -- 06 review
  new.updated_at := now();
  return new;
end;
$$;

-- guard_category_rule (newest body: 20261012000100_category_rules.sql). Inside the household RPCs scope, owner and household
-- may change (join converts a shared rule to a personal one); id, created_at and created_by stay pinned always, and the
-- scope-shape CHECK still validates the result.
create or replace function public.guard_category_rule()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.id := old.id;
  if coalesce(current_setting('fincwin.household_rpc', true), '') <> 'on' then  -- 08-09
    new.scope := old.scope;
    new.owner_id := old.owner_id;
    new.household_id := old.household_id;
  end if;
  new.created_at := old.created_at;
  -- an ON DELETE SET NULL from auth.users may clear created_by; nothing else may change it
  if new.created_by is not null then new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- 6. RPCs -----------------------------------------------------------------------------------------------------
-- security definer, empty search_path, jsonb results. Only a missing session raises (42501, through hh_uid()).
-- A row the caller cannot see (someone else's invite) is refused exactly like a missing id.

create or replace function public.create_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  v_members integer;
  v_open integer;
  v_code text;
  v_id uuid;
  v_exp timestamptz;
begin
  select m.household_id into hid from public.household_members m
   where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  perform 1 from public.households h where h.id = hid for update;
  select count(*) into v_members from public.household_members where household_id = hid;
  select count(*) into v_open from public.household_invites i
   where i.household_id = hid and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  if v_members + v_open >= 6 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;  -- D-10
  for attempt in 1..2 loop
    v_code := public.hh_new_invite_code();
    begin
      insert into public.household_invites (household_id, created_by, code_hash, code)
        values (hid, uid, public.hh_code_hash(v_code), v_code)
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

create or replace function public.my_open_invites()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  res jsonb;
begin
  -- lazy clean-up of plain codes that can no longer be used (expiry is also checked on every use)
  update public.household_invites i set code = null
   where i.created_by = uid and i.code is not null
     and (i.expires_at <= now() or i.used_at is not null or (i.cancelled_at is not null and i.cancelled_at < now() - interval '24 hours'));
  select coalesce(jsonb_agg(jsonb_build_object('invite_id', i.id, 'code', public.hh_group_code(i.code),
           'expires_at', i.expires_at, 'created_at', i.created_at) order by i.created_at), '[]'::jsonb)
    into res
    from public.household_invites i
   where i.created_by = uid and i.household_id in (select public.user_household_ids())
     and i.used_at is null and i.cancelled_at is null and i.expires_at > now() and i.code is not null;
  return jsonb_build_object('ok', true, 'invites', res);
end;
$$;

create or replace function public.cancel_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
begin
  select * into v from public.household_invites i
   where i.id = p_invite_id and i.created_by = uid and i.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.used_at is not null or v.expires_at <= now() then return jsonb_build_object('ok', false, 'reason', 'not_open'); end if;
  if v.cancelled_at is null then
    update public.household_invites set cancelled_at = now() where id = v.id;
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- Undo of a cancel: only while not used, not expired, cancelled within the last 24 hours, and the household has room.
create or replace function public.restore_invite(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
  v_members integer;
  v_open integer;
begin
  select * into v from public.household_invites i
   where i.id = p_invite_id and i.created_by = uid and i.household_id in (select public.user_household_ids())
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v.used_at is not null or v.cancelled_at is null or v.expires_at <= now()
     or v.cancelled_at < now() - interval '24 hours' or v.code is null then
    return jsonb_build_object('ok', false, 'reason', 'not_restorable');
  end if;
  perform 1 from public.households h where h.id = v.household_id for update;
  select count(*) into v_members from public.household_members where household_id = v.household_id;
  select count(*) into v_open from public.household_invites i
   where i.household_id = v.household_id and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  if v_members + v_open >= 6 then return jsonb_build_object('ok', false, 'reason', 'full'); end if;
  update public.household_invites set cancelled_at = null where id = v.id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.preview_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
  v_members integer;
  v_inviter public.household_members%rowtype;
  v_name text;
  v_mine uuid;
begin
  if public.hh_rate_limited(uid) then return jsonb_build_object('ok', false, 'reason', 'slow_down'); end if;
  select * into v from public.household_invites i
   where i.code_hash = public.hh_code_hash(p_code) and length(public.hh_normalise_code(p_code)) = 12
     and i.used_at is null and i.cancelled_at is null and i.expires_at > now();
  if not found then
    perform public.hh_log_attempt(uid, false);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select count(*) into v_members from public.household_members where household_id = v.household_id;
  select * into v_inviter from public.household_members m where m.household_id = v.household_id and m.user_id = v.created_by;
  select h.name into v_name from public.households h where h.id = v.household_id;
  select m.household_id into v_mine from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  return jsonb_build_object('ok', true, 'household_name', v_name,
    'inviter_display_name', case when v_inviter.name_hidden then null else v_inviter.display_name end,
    'inviter_colour_key', v_inviter.colour_key, 'member_count', v_members,
    'in_other_household', v_mine is not null and v_mine <> v.household_id
      and (select count(*) from public.household_members where household_id = v_mine) > 1,
    'already_member', exists (select 1 from public.household_members m where m.household_id = v.household_id and m.user_id = uid),
    'full', v_members >= 6);
end;
$$;

create or replace function public.redeem_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  v public.household_invites%rowtype;
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
  select jsonb_object_agg(m.user_id::text, m.weight) into v_after
    from public.household_members m where m.household_id = v.household_id;

  -- (h) the invite is spent
  update public.household_invites set used_at = now(), used_by = uid, code = null where id = v.id;
  perform public.hh_log_attempt(uid, true);

  -- (i) the household is told
  perform public.hh_event(v.household_id, 'joined', uid, v.id, null, '{}'::jsonb);
  perform public.hh_event(v.household_id, 'weights_changed', null, v.id, null,
    jsonb_build_object('before', v_before, 'after', v_after));

  perform set_config('fincwin.household_rpc', '', true);
  return jsonb_build_object('ok', true, 'household_id', v.household_id, 'household_name', v_hname);
end;
$$;

revoke execute on function public.create_invite() from public, anon;
grant execute on function public.create_invite() to authenticated;
revoke execute on function public.my_open_invites() from public, anon;
grant execute on function public.my_open_invites() to authenticated;
revoke execute on function public.cancel_invite(uuid) from public, anon;
grant execute on function public.cancel_invite(uuid) to authenticated;
revoke execute on function public.restore_invite(uuid) from public, anon;
grant execute on function public.restore_invite(uuid) to authenticated;
revoke execute on function public.preview_invite(text) from public, anon;
grant execute on function public.preview_invite(text) to authenticated;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
