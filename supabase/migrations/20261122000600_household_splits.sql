-- Phase 8 shared lines and splits (HH-04, HH-05, HH-06; D-13..D-18, D-34, D-35, D-39). Proven by pgTAP 107.
-- A line becomes shared only through share_transaction (creator), bulk_share_transactions, a joint account, or a shared series.
-- Each shared line stores its own split and a household-currency amount stamped once at share time. Debt- and goal-linked
-- lines stay personal (owner decision 2026-11-15).

-- 1. Columns (server-written only: no insert or update grant) -------------------------------------------------------
alter table public.transactions
  add column household_amount bigint,
  add column household_currency text,
  add column household_rate numeric,
  add column household_rate_pending boolean not null default false,
  add column split_rule text check (split_rule in ('even', 'weight', 'amount', 'mine')),
  add column shared_at timestamptz,
  -- true when a member chose the split by hand (set_line_split, or an explicit rule at share time); false when it came from
  -- a default. A default re-split (apply_rule_to_unsettled) leaves these lines alone (owner 2026-11-15).
  add column split_manual boolean not null default false;
alter table public.recurring_series
  add column split_rule text check (split_rule in ('even', 'weight', 'mine')),
  add column split_participants uuid[];

-- `select *` freezes a view's column list at creation: re-create so the new columns are selectable. Definition,
-- security_invoker and grants are those of 20261122000100.
create or replace view public.transactions_active
  with (security_invoker = true) as
  select * from public.transactions where deleted_at is null;
revoke all on public.transactions_active from anon, public;
revoke all on public.transactions_active from authenticated;
grant select on public.transactions_active to authenticated;

-- 2. Largest-remainder split, the same rule as src/engine/split/allocate.ts ----------------------------------------
-- Integer maths only; zero weights get 0; the remainder goes to the largest fractional parts, ties to the lowest index
-- (join order); a negative total is split on its magnitude and the sign put back; all weights 0 is 22023.
create or replace function public.hh_allocate(p_total bigint, p_weights int[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer := coalesce(array_length(p_weights, 1), 0);
  v_sum numeric := 0;
  v_abs numeric := abs(p_total::numeric);
  floors numeric[] := '{}';
  rems numeric[] := '{}';
  v_left numeric;
  res bigint[] := '{}';
  i integer;
  r record;
begin
  if n = 0 then
    raise exception 'hh_allocate: weights must be a non-empty array' using errcode = '22023';
  end if;
  for i in 1..n loop
    if p_weights[i] is null or p_weights[i] < 0 then
      raise exception 'hh_allocate: weight % must be a non-negative integer', p_weights[i] using errcode = '22023';
    end if;
    v_sum := v_sum + p_weights[i];
  end loop;
  if v_sum = 0 then
    raise exception 'hh_allocate: at least one weight must be above 0' using errcode = '22023';
  end if;
  for i in 1..n loop
    floors := floors || div(v_abs * p_weights[i], v_sum);
    rems := rems || mod(v_abs * p_weights[i], v_sum);
  end loop;
  v_left := v_abs - (select sum(f) from unnest(floors) f);
  for r in select o.i from (select g as i from generate_series(1, n) g) o order by rems[o.i] desc, o.i asc limit v_left::int loop
    floors[r.i] := floors[r.i] + 1;
  end loop;
  for i in 1..n loop
    res := res || (case when p_total < 0 then -floors[i] else floors[i] end)::bigint;
  end loop;
  return res;
end;
$$;
revoke execute on function public.hh_allocate(bigint, int[]) from public, anon;
grant execute on function public.hh_allocate(bigint, int[]) to authenticated;

-- 3. Tables ---------------------------------------------------------------------------------------------------------
create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid references auth.users(id) on delete set null,     -- null = Former member (D-29)
  former_member_key uuid,                                            -- stable key kept when member_id is nulled
  position smallint not null,                                        -- join order at share time (D-35)
  share bigint not null,
  weight_snapshot int,
  created_at timestamptz not null default now(),
  unique (transaction_id, position));
create index transaction_splits_household_idx on public.transaction_splits (household_id);
create index transaction_splits_member_idx on public.transaction_splits (member_id) where member_id is not null;

create table public.household_split_defaults (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_ref text,                    -- null = household default; 'builtin:<key>' or 'custom:<category uuid>'
  rule text not null check (rule in ('even', 'weight', 'mine')),
  version integer not null default 1,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now());
create unique index household_split_defaults_uniq on public.household_split_defaults (household_id, coalesce(category_ref, ''));
create trigger set_version before update on public.household_split_defaults
  for each row execute function public.bump_version();

create table public.transaction_member_categories (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  primary key (transaction_id, user_id));

alter table public.transaction_splits enable row level security;
create policy "read splits of visible lines" on public.transaction_splits for select to authenticated
  using (household_id in (select public.user_household_ids())
    and exists (select 1 from public.transactions t
                 where t.id = transaction_splits.transaction_id and (t.is_shared or t.created_by = (select auth.uid()))));
revoke all on public.transaction_splits from anon;
revoke insert, update, delete, truncate on public.transaction_splits from authenticated;
grant select on public.transaction_splits to authenticated;

alter table public.household_split_defaults enable row level security;
create policy "members read split defaults" on public.household_split_defaults for select to authenticated
  using (household_id in (select public.user_household_ids()));
revoke all on public.household_split_defaults from anon;
revoke insert, update, delete, truncate on public.household_split_defaults from authenticated;
grant select on public.household_split_defaults to authenticated;

alter table public.transaction_member_categories enable row level security;
create policy "own member category" on public.transaction_member_categories for all to authenticated
  using (user_id = (select auth.uid()) and household_id in (select public.user_household_ids()))
  with check (user_id = (select auth.uid()) and household_id in (select public.user_household_ids()));
revoke all on public.transaction_member_categories from anon;
revoke insert, update, delete, truncate on public.transaction_member_categories from authenticated;
grant select on public.transaction_member_categories to authenticated;
grant insert (transaction_id, user_id, household_id, category_id), update (category_id), delete on public.transaction_member_categories to authenticated;

-- A member's own category on a shared line (02 D-33): the category must be the caller's, the line shared and in their household.
create or replace function public.guard_member_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return new;
  end if;
  if not exists (select 1 from public.categories c where c.id = new.category_id and c.owner_id = v_uid) then
    raise exception 'transaction_member_categories: category is not yours' using errcode = '42501';
  end if;
  if not exists (select 1 from public.transactions t
                  where t.id = new.transaction_id and t.is_shared and t.deleted_at is null
                    and t.household_id = new.household_id and t.household_id in (select public.user_household_ids())) then
    raise exception 'transaction_member_categories: the line is not a shared line of your household' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_member_category() from public, anon, authenticated;
create trigger guard_member_category before insert or update on public.transaction_member_categories
  for each row execute function public.guard_member_category();

-- 4. Internal helpers (not client-callable) -------------------------------------------------------------------------
-- False here; plan 08-11 re-creates it to check live settlement lines. Every RPC that edits amount, split or sharing
-- calls it and answers 'line_locked' when it is true.
create or replace function public.hh_line_locked(p_tx uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false
$$;
revoke execute on function public.hh_line_locked(uuid) from public, anon, authenticated;

-- The household-currency figure of a line, from its own date (D-39). ok = false when no rate exists at all.
create or replace function public.hh_compute_stamp(
  p_amount bigint, p_currency text, p_date date, p_owner uuid, p_reporting text,
  out ok boolean, out amount bigint, out rate numeric)
returns record
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r1 record;
  r2 record;
begin
  if p_currency = p_reporting then
    ok := true; amount := p_amount; rate := 1;
    return;
  end if;
  select * into r1 from public.per_eur_rate(p_currency, p_date, p_owner);
  select * into r2 from public.per_eur_rate(p_reporting, p_date, p_owner);
  if r1.rate is null or r2.rate is null then
    ok := false; amount := null; rate := null;
    return;
  end if;
  ok := true;
  amount := public.convert_minor(p_amount, r1.rate, public.currency_exponent(p_currency, p_owner),
                                 r2.rate, public.currency_exponent(p_reporting, p_owner));
  rate := r2.rate / r1.rate;
end;
$$;
revoke execute on function public.hh_compute_stamp(bigint, text, date, uuid, text) from public, anon, authenticated;

-- Stamps a line once (D-39). Called at share time and by the restamp job; never on a later read. Returns false (and marks the
-- line pending) when no rate exists.
create or replace function public.hh_stamp_household_amount(p_tx uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.transactions%rowtype;
  v_cur text;
  st record;
begin
  select * into t from public.transactions where id = p_tx;
  if not found then return false; end if;
  select h.reporting_currency into v_cur from public.households h where h.id = t.household_id;
  select * into st from public.hh_compute_stamp(t.original_amount, t.original_currency, t.local_date, t.created_by, v_cur);
  perform set_config('fincwin.household_rpc', 'on', true);
  if st.ok then
    update public.transactions set household_amount = st.amount, household_currency = v_cur, household_rate = st.rate,
           household_rate_pending = false where id = p_tx;
  else
    update public.transactions set household_rate_pending = true where id = p_tx;
  end if;
  perform set_config('fincwin.household_rpc', '', true);
  return st.ok;
end;
$$;
revoke execute on function public.hh_stamp_household_amount(uuid) from public, anon, authenticated;

-- Category default (the creator's category), else the household default, else even (HH-06).
create or replace function public.hh_category_ref(p_category uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when c.builtin_key is not null then 'builtin:' || c.builtin_key else 'custom:' || c.id::text end
    from public.categories c where c.id = p_category
$$;
revoke execute on function public.hh_category_ref(uuid) from public, anon, authenticated;

create or replace function public.hh_resolve_rule(p_household uuid, p_category uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select d.rule from public.household_split_defaults d
      where d.household_id = p_household and d.category_ref is not null and d.category_ref = public.hh_category_ref(p_category)),
    (select d.rule from public.household_split_defaults d where d.household_id = p_household and d.category_ref is null),
    'even')
$$;
revoke execute on function public.hh_resolve_rule(uuid, uuid) from public, anon, authenticated;

create or replace function public.hh_resolve_default_rule(p_household uuid, p_tx uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.hh_resolve_rule(p_household, (select t.category_id from public.transactions t where t.id = p_tx))
$$;
revoke execute on function public.hh_resolve_default_rule(uuid, uuid) from public, anon, authenticated;

-- The split a rule gives: a jsonb array of {pos, member, share, weight} for the people in it, in join order. Raises HH001 with
-- the reason as its message; callers catch it before writing anything. p_total null (rate pending) gives zero shares, which
-- the restamp job fills in from the stored weights.
create or replace function public.hh_split_plan(p_household uuid, p_payer uuid, p_total bigint, p_rule text, p_participants uuid[], p_amounts jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  mem uuid[];
  mw int[];
  n integer;
  w int[];
  sh bigint[];
  inside boolean[];
  k text;
  v jsonb;
  i integer;
  v_sum bigint := 0;
  out jsonb := '[]'::jsonb;
begin
  select array_agg(m.user_id order by m.created_at, m.user_id), array_agg(m.weight order by m.created_at, m.user_id)
    into mem, mw from public.household_members m where m.household_id = p_household;
  n := coalesce(array_length(mem, 1), 0);
  if p_rule is null or p_rule not in ('even', 'weight', 'amount', 'mine') then
    raise exception using errcode = 'HH001', message = 'invalid_rule';
  end if;
  if n = 0 or not (p_payer = any(mem)) then
    raise exception using errcode = 'HH001', message = 'not_member';
  end if;
  w := array_fill(0, array[n]);
  sh := array_fill(0::bigint, array[n]);
  inside := array_fill(false, array[n]);

  if p_rule = 'amount' then
    if p_amounts is null or jsonb_typeof(p_amounts) <> 'object' then
      raise exception using errcode = 'HH001', message = 'amounts_not_total';
    end if;
    if p_total is null then
      raise exception using errcode = 'HH001', message = 'rate_unavailable';
    end if;
    for k, v in select * from jsonb_each(p_amounts) loop
      if k !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or not (k::uuid = any(mem)) then
        raise exception using errcode = 'HH001', message = 'not_member';
      end if;
      if jsonb_typeof(v) <> 'number' or v::text !~ '^-?[0-9]{1,15}$' then
        raise exception using errcode = 'HH001', message = 'amounts_not_total';
      end if;
      i := array_position(mem, k::uuid);
      sh[i] := (v::text)::bigint;
      inside[i] := true;
      v_sum := v_sum + sh[i];
    end loop;
    if v_sum <> p_total then
      raise exception using errcode = 'HH001', message = 'amounts_not_total';
    end if;
  else
    if p_rule = 'mine' then
      inside[array_position(mem, p_payer)] := true;
      w[array_position(mem, p_payer)] := 1;
    else
      for i in 1..n loop
        if p_participants is null or mem[i] = any(p_participants) then
          inside[i] := true;
          w[i] := case when p_rule = 'even' then 1 else mw[i] end;
        end if;
      end loop;
      if p_participants is not null and exists (select 1 from unnest(p_participants) u where not (u = any(mem))) then
        raise exception using errcode = 'HH001', message = 'not_member';
      end if;
      if not exists (select 1 from generate_series(1, n) g where inside[g] and mem[g] <> p_payer) then
        raise exception using errcode = 'HH001', message = 'no_other_member';
      end if;
      if (select coalesce(sum(x), 0) from unnest(w) x) = 0 then
        raise exception using errcode = 'HH001', message = 'split_weights_zero';
      end if;
    end if;
    if p_total is not null then
      sh := public.hh_allocate(p_total, w);
    end if;
  end if;

  for i in 1..n loop
    if inside[i] then
      out := out || jsonb_build_object('pos', i - 1, 'member', mem[i], 'share', sh[i],
                                       'weight', case when p_rule = 'amount' then null else w[i] end);
    end if;
  end loop;
  return out;
end;
$$;
revoke execute on function public.hh_split_plan(uuid, uuid, bigint, text, uuid[], jsonb) from public, anon, authenticated;

create or replace function public.hh_store_splits(p_tx uuid, p_household uuid, p_plan jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.transaction_splits where transaction_id = p_tx;
  insert into public.transaction_splits (transaction_id, household_id, member_id, position, share, weight_snapshot)
  select p_tx, p_household, (e ->> 'member')::uuid, (e ->> 'pos')::smallint, (e ->> 'share')::bigint, (e ->> 'weight')::int
    from jsonb_array_elements(p_plan) e;
end;
$$;
revoke execute on function public.hh_store_splits(uuid, uuid, jsonb) from public, anon, authenticated;

-- A line's split as the notices and Undo see it.
create or replace function public.hh_split_json(p_tx uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'rule', t.split_rule,
    'participants', coalesce((select jsonb_agg(s.member_id order by s.position) from public.transaction_splits s
                               where s.transaction_id = t.id and s.member_id is not null), '[]'::jsonb),
    'shares', coalesce((select jsonb_object_agg(s.member_id::text, s.share) from public.transaction_splits s
                         where s.transaction_id = t.id and s.member_id is not null), '{}'::jsonb))
    from public.transactions t where t.id = p_tx
$$;
revoke execute on function public.hh_split_json(uuid) from public, anon, authenticated;

-- 5. Joint accounts and shared series (D-13, D-16, D-17) ------------------------------------------------------------
-- A line is born shared when its account is joint, or when it is materialised from a shared series (the materialiser copies
-- is_shared). Debt- and goal-linked lines stay personal; so do lines of a household of one. The household figure is stamped
-- once here (a missing rate leaves it pending for the hourly job). Joint lines create no owing (D-17) but store a split anyway.
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
create trigger share_on_insert before insert on public.transactions
  for each row execute function public.hh_share_on_insert();

create or replace function public.hh_store_splits_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parts uuid[];
begin
  if not new.is_shared or new.split_rule is null then
    return null;
  end if;
  if new.recurring_series_id is not null then
    select r.split_participants into v_parts from public.recurring_series r where r.id = new.recurring_series_id;
  end if;
  begin
    perform public.hh_store_splits(new.id, new.household_id,
      public.hh_split_plan(new.household_id, coalesce(new.paid_by, new.created_by), new.household_amount, new.split_rule, v_parts, null));
  exception when sqlstate 'HH001' then
    null;  -- the line stays shared; the split can be set by hand
  end;
  return null;
end;
$$;
revoke execute on function public.hh_store_splits_on_insert() from public, anon, authenticated;
create trigger store_splits_on_insert after insert on public.transactions
  for each row execute function public.hh_store_splits_on_insert();

-- 6. RPCs -----------------------------------------------------------------------------------------------------------
-- security definer, empty search_path, jsonb results {ok, reason}; only a missing session raises (42501). A line the caller
-- cannot see is refused exactly like a missing id (08-05 privacy rule). Stale writes answer version_conflict naming who
-- changed it (D-14).

create or replace function public.share_transaction(
  p_id uuid, p_expected_version int, p_rule text default null, p_participants uuid[] default null,
  p_amounts jsonb default null, p_series_scope text default 'one')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
  s public.recurring_series%rowtype;
  f record;
  v_cur text;
  v_rule text;
  v_plan jsonb;
  st record;
  fst record;
  v_count integer := 1;
begin
  select * into t from public.transactions x
   where x.id = p_id and x.deleted_at is null and x.household_id in (select public.user_household_ids())
     and (x.is_shared or x.created_by = uid)
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.created_by is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  if t.is_shared then return jsonb_build_object('ok', false, 'reason', 'already_shared'); end if;
  if t.debt_id is not null or t.goal_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'linked_line_personal');
  end if;
  if t.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', t.version, 'updated_by', t.updated_by);
  end if;
  if public.hh_line_locked(t.id) then return jsonb_build_object('ok', false, 'reason', 'line_locked'); end if;
  if (select count(*) from public.household_members m where m.household_id = t.household_id) < 2 then
    return jsonb_build_object('ok', false, 'reason', 'no_household');
  end if;
  if p_series_scope not in ('one', 'series') then return jsonb_build_object('ok', false, 'reason', 'invalid_scope'); end if;
  v_rule := coalesce(p_rule, public.hh_resolve_rule(t.household_id, t.category_id));
  select h.reporting_currency into v_cur from public.households h where h.id = t.household_id;
  select * into st from public.hh_compute_stamp(t.original_amount, t.original_currency, t.local_date, t.created_by, v_cur);
  if not st.ok then return jsonb_build_object('ok', false, 'reason', 'rate_unavailable'); end if;

  if p_series_scope = 'series' then
    if t.recurring_series_id is null then return jsonb_build_object('ok', false, 'reason', 'not_in_series'); end if;
    select * into s from public.recurring_series r
     where r.id = t.recurring_series_id and r.deleted_at is null and r.created_by = uid for update;
    if not found then return jsonb_build_object('ok', false, 'reason', 'not_in_series'); end if;
    if s.goal_id is not null or exists (select 1 from public.debts d
         where (d.series_id = s.id or d.extra_series_id = s.id) and d.deleted_at is null) then
      return jsonb_build_object('ok', false, 'reason', 'linked_line_personal');
    end if;
    if v_rule = 'amount' then return jsonb_build_object('ok', false, 'reason', 'amount_rule_not_for_series'); end if;
  end if;

  begin
    v_plan := public.hh_split_plan(t.household_id, coalesce(t.paid_by, t.created_by), st.amount, v_rule, p_participants, p_amounts);
  exception when sqlstate 'HH001' then
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;

  perform set_config('fincwin.household_rpc', 'on', true);
  update public.transactions
     set is_shared = true, shared_at = now(), household_amount = st.amount, household_currency = v_cur,
         household_rate = st.rate, household_rate_pending = false, split_rule = v_rule,
         split_manual = p_rule is not null
   where id = t.id;
  perform public.hh_store_splits(t.id, t.household_id, v_plan);

  if p_series_scope = 'series' then
    update public.recurring_series set is_shared = true, split_rule = v_rule, split_participants = p_participants where id = s.id;
    -- D-16: every already-materialised future line; past lines stay as they are
    for f in select x.* from public.transactions x
              where x.recurring_series_id = s.id and x.deleted_at is null and not x.is_shared and x.local_date > t.local_date
                and x.debt_id is null and x.goal_id is null and not public.hh_line_locked(x.id)
              order by x.local_date loop
      select * into fst from public.hh_compute_stamp(f.original_amount, f.original_currency, f.local_date, f.created_by, v_cur);
      begin
        v_plan := public.hh_split_plan(f.household_id, coalesce(f.paid_by, f.created_by), case when fst.ok then fst.amount end,
                                       v_rule, p_participants, null);
        update public.transactions
           set is_shared = true, shared_at = now(), split_rule = v_rule, split_manual = p_rule is not null,
               household_amount = fst.amount, household_currency = case when fst.ok then v_cur end,
               household_rate = fst.rate, household_rate_pending = not fst.ok
         where id = f.id;
        perform public.hh_store_splits(f.id, f.household_id, v_plan);
        v_count := v_count + 1;
      exception when sqlstate 'HH001' then
        null;
      end;
    end loop;
  end if;
  perform set_config('fincwin.household_rpc', '', true);
  return jsonb_build_object('ok', true, 'shared_count', v_count, 'version', t.version + 1);
end;
$$;

create or replace function public.bulk_share_transactions(p_ids uuid[], p_rule text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
  v_id uuid;
  v_cur text;
  v_rule text;
  v_plan jsonb;
  st record;
  v_done integer := 0;
  v_skipped integer := 0;
begin
  if p_ids is null or array_length(p_ids, 1) is null then
    return jsonb_build_object('ok', true, 'shared_count', 0, 'skipped_count', 0);
  end if;
  if p_rule is not null and p_rule not in ('even', 'weight', 'mine') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rule');
  end if;
  for v_id in select distinct u from unnest(p_ids) u loop
    select * into t from public.transactions x
     where x.id = v_id and x.created_by = uid and x.deleted_at is null and not x.is_shared
       and x.debt_id is null and x.goal_id is null
       and x.household_id in (select public.user_household_ids())
     for update;
    if not found or public.hh_line_locked(t.id)
       or (select count(*) from public.household_members m where m.household_id = t.household_id) < 2 then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    select h.reporting_currency into v_cur from public.households h where h.id = t.household_id;
    select * into st from public.hh_compute_stamp(t.original_amount, t.original_currency, t.local_date, t.created_by, v_cur);
    if not st.ok then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    v_rule := coalesce(p_rule, public.hh_resolve_rule(t.household_id, t.category_id));
    begin
      v_plan := public.hh_split_plan(t.household_id, coalesce(t.paid_by, t.created_by), st.amount, v_rule, null, null);
    exception when sqlstate 'HH001' then
      v_skipped := v_skipped + 1;
      continue;
    end;
    perform set_config('fincwin.household_rpc', 'on', true);
    update public.transactions
       set is_shared = true, shared_at = now(), household_amount = st.amount, household_currency = v_cur,
           household_rate = st.rate, household_rate_pending = false, split_rule = v_rule,
           split_manual = p_rule is not null
     where id = t.id;
    perform public.hh_store_splits(t.id, t.household_id, v_plan);
    perform set_config('fincwin.household_rpc', '', true);
    v_done := v_done + 1;
  end loop;
  return jsonb_build_object('ok', true, 'shared_count', v_done, 'skipped_count', v_skipped);
end;
$$;

create or replace function public.make_line_private(p_id uuid, p_expected_version int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
begin
  select * into t from public.transactions x
   where x.id = p_id and x.deleted_at is null and x.household_id in (select public.user_household_ids())
     and (x.is_shared or x.created_by = uid)
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.created_by is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;  -- D-15
  if not t.is_shared then return jsonb_build_object('ok', false, 'reason', 'not_shared'); end if;
  if t.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', t.version, 'updated_by', t.updated_by);
  end if;
  if public.hh_line_locked(t.id) then return jsonb_build_object('ok', false, 'reason', 'line_locked'); end if;
  if exists (select 1 from public.accounts a where a.id = t.account_id and a.is_shared) then
    return jsonb_build_object('ok', false, 'reason', 'joint_account_line');
  end if;
  perform set_config('fincwin.household_rpc', 'on', true);
  delete from public.transaction_splits where transaction_id = t.id;
  delete from public.transaction_member_categories where transaction_id = t.id;
  update public.transactions
     set is_shared = false, shared_at = null, split_rule = null, paid_by = null, household_amount = null,
         household_currency = null, household_rate = null, household_rate_pending = false, split_manual = false
   where id = t.id;
  perform set_config('fincwin.household_rpc', '', true);
  -- other clients drop the line from their cache on this notice (Realtime Pitfall 6); no name or amount travels
  perform public.hh_event(t.household_id, 'made_private', null, t.id, null, '{}'::jsonb);
  return jsonb_build_object('ok', true, 'version', t.version + 1);
end;
$$;

create or replace function public.set_line_split(
  p_id uuid, p_expected_version int, p_rule text, p_participants uuid[], p_amounts jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
  v_before jsonb;
  v_plan jsonb;
begin
  select * into t from public.transactions x
   where x.id = p_id and x.deleted_at is null and x.household_id in (select public.user_household_ids())
     and (x.is_shared or x.created_by = uid)
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not t.is_shared then return jsonb_build_object('ok', false, 'reason', 'not_shared'); end if;
  if t.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', t.version, 'updated_by', t.updated_by);
  end if;
  if public.hh_line_locked(t.id) then return jsonb_build_object('ok', false, 'reason', 'line_locked'); end if;
  begin
    v_plan := public.hh_split_plan(t.household_id, coalesce(t.paid_by, t.created_by), t.household_amount, p_rule, p_participants, p_amounts);
  exception when sqlstate 'HH001' then
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;
  v_before := public.hh_split_json(t.id);
  perform set_config('fincwin.household_rpc', 'on', true);
  update public.transactions set split_rule = p_rule, split_manual = true where id = t.id;
  perform public.hh_store_splits(t.id, t.household_id, v_plan);
  perform set_config('fincwin.household_rpc', '', true);
  perform public.hh_event(t.household_id, 'split_changed', null, t.id, null,
    jsonb_build_object('before', v_before, 'after', public.hh_split_json(t.id)));
  return jsonb_build_object('ok', true, 'before', v_before, 'version', t.version + 1);
end;
$$;

create or replace function public.set_paid_by(p_id uuid, p_expected_version int, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
  v_parts uuid[];
  v_plan jsonb;
begin
  select * into t from public.transactions x
   where x.id = p_id and x.deleted_at is null and x.household_id in (select public.user_household_ids())
     and (x.is_shared or x.created_by = uid)
   for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if t.created_by is distinct from uid then return jsonb_build_object('ok', false, 'reason', 'not_creator'); end if;
  if not t.is_shared then return jsonb_build_object('ok', false, 'reason', 'not_shared'); end if;
  if p_user is not null and not exists (select 1 from public.household_members m where m.household_id = t.household_id and m.user_id = p_user) then
    return jsonb_build_object('ok', false, 'reason', 'not_member');
  end if;
  if t.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', t.version, 'updated_by', t.updated_by);
  end if;
  if public.hh_line_locked(t.id) then return jsonb_build_object('ok', false, 'reason', 'line_locked'); end if;
  -- the split is unchanged unless it is built around the payer ('mine') or would leave the payer alone in it
  select array_agg(s.member_id order by s.position) into v_parts from public.transaction_splits s
   where s.transaction_id = t.id and s.member_id is not null;
  begin
    if t.split_rule = 'mine' then
      v_plan := public.hh_split_plan(t.household_id, coalesce(p_user, t.created_by), t.household_amount, 'mine', null, null);
    elsif t.split_rule in ('even', 'weight') then
      perform public.hh_split_plan(t.household_id, coalesce(p_user, t.created_by), coalesce(t.household_amount, 0), t.split_rule, v_parts, null);
    end if;
  exception when sqlstate 'HH001' then
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;
  perform set_config('fincwin.household_rpc', 'on', true);
  update public.transactions set paid_by = p_user where id = t.id;
  if v_plan is not null then
    perform public.hh_store_splits(t.id, t.household_id, v_plan);
  end if;
  perform set_config('fincwin.household_rpc', '', true);
  return jsonb_build_object('ok', true, 'version', t.version + 1);
end;
$$;

create or replace function public.set_split_default(p_category_ref text, p_rule text, p_expected_version int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  d public.household_split_defaults%rowtype;
  v_before jsonb;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_category_ref is not null and p_category_ref !~ '^(builtin:[A-Za-z]{1,40}|custom:[0-9a-fA-F-]{36})$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_category');
  end if;
  if p_rule is not null and p_rule not in ('even', 'weight', 'mine') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rule');
  end if;
  if p_rule is null and p_category_ref is null then
    return jsonb_build_object('ok', false, 'reason', 'invalid_rule');
  end if;
  select * into d from public.household_split_defaults x
   where x.household_id = hid and coalesce(x.category_ref, '') = coalesce(p_category_ref, '') for update;
  if found and p_expected_version is not null and d.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'reason', 'version_conflict', 'current_version', d.version, 'updated_by', d.updated_by);
  end if;
  v_before := jsonb_build_object('rule', case when found then d.rule end);
  if p_rule is null then
    delete from public.household_split_defaults where id = d.id;  -- "Use household default"
  elsif found then
    update public.household_split_defaults set rule = p_rule, updated_by = uid where id = d.id;
  else
    insert into public.household_split_defaults (household_id, category_ref, rule, updated_by) values (hid, p_category_ref, p_rule, uid);
  end if;
  perform public.hh_event(hid, case when p_category_ref is null then 'default_changed' else 'category_default_changed' end, null, null, null,
    jsonb_build_object('category_ref', p_category_ref, 'before', v_before ->> 'rule', 'after', p_rule));
  return jsonb_build_object('ok', true, 'before', v_before);
end;
$$;

-- The shared, unsettled lines a rule decides (D-35): a category default decides the lines of that category; the household
-- default decides the lines whose category has no default of its own. Lines a member split by hand (any rule) and lines split by exact amounts are left alone.
create or replace function public.hh_rule_lines(p_household uuid, p_category_ref text)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.transactions t
   where t.household_id = p_household and t.is_shared and t.deleted_at is null
     and t.split_rule is distinct from 'amount' and not t.split_manual and not public.hh_line_locked(t.id)
     and case when p_category_ref is not null then public.hh_category_ref(t.category_id) is not distinct from p_category_ref
              else not exists (select 1 from public.household_split_defaults d
                                where d.household_id = p_household and d.category_ref is not null
                                  and d.category_ref = public.hh_category_ref(t.category_id)) end
$$;
revoke execute on function public.hh_rule_lines(uuid, text) from public, anon, authenticated;

create or replace function public.count_unsettled_for_rule(p_category_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  return jsonb_build_object('ok', true, 'count', (select count(*) from public.hh_rule_lines(hid, p_category_ref)));
end;
$$;

create or replace function public.apply_rule_to_unsettled(p_category_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
  t public.transactions%rowtype;
  v_id uuid;
  v_rule text;
  v_parts uuid[];
  v_plan jsonb;
  v_changed integer := 0;
begin
  select m.household_id into hid from public.household_members m where m.user_id = uid order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_member'); end if;
  for v_id in select l from public.hh_rule_lines(hid, p_category_ref) l loop
    select * into t from public.transactions where id = v_id for update;
    v_rule := public.hh_resolve_rule(t.household_id, t.category_id);
    select array_agg(s.member_id order by s.position) into v_parts from public.transaction_splits s
     where s.transaction_id = t.id and s.member_id is not null;
    begin
      v_plan := public.hh_split_plan(t.household_id, coalesce(t.paid_by, t.created_by), t.household_amount, v_rule, v_parts, null);
    exception when sqlstate 'HH001' then
      continue;
    end;
    perform set_config('fincwin.household_rpc', 'on', true);
    update public.transactions set split_rule = v_rule where id = t.id;
    perform public.hh_store_splits(t.id, t.household_id, v_plan);
    perform set_config('fincwin.household_rpc', '', true);
    v_changed := v_changed + 1;
  end loop;
  return jsonb_build_object('ok', true, 'changed_count', v_changed);
end;
$$;

-- Plan 08-02's set_household_currency, with the D-39 refusal: no change while any shared line exists, because every
-- line carries its stamped household figure.
create or replace function public.set_household_currency(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  hid uuid;
begin
  select m.household_id into hid from public.household_members m
    where m.user_id = uid and m.is_owner order by m.created_at limit 1;
  if hid is null then return jsonb_build_object('ok', false, 'reason', 'not_owner'); end if;
  if p_code is null or not public.is_known_currency(p_code, uid) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_currency');
  end if;
  if exists (select 1 from public.transactions t where t.household_id = hid and t.is_shared and t.deleted_at is null)
     and p_code is distinct from (select h.reporting_currency from public.households h where h.id = hid) then
    return jsonb_build_object('ok', false, 'reason', 'shared_lines_exist');
  end if;
  update public.households set reporting_currency = p_code where id = hid;
  perform public.hh_event(hid, 'currency_changed', null, null, null, jsonb_build_object('code', p_code));
  return jsonb_build_object('ok', true);
end;
$$;

-- 7. Hourly restamp of lines that had no rate when they were shared (service role only) -------------------------------
create or replace function public.hh_restamp_pending()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_n integer := 0;
  v_w int[];
  v_sh bigint[];
begin
  for r in select t.id from public.transactions t
            where t.is_shared and t.household_rate_pending and t.deleted_at is null order by t.created_at limit 500 loop
    if public.hh_stamp_household_amount(r.id) then
      select array_agg(s.weight_snapshot order by s.position) into v_w from public.transaction_splits s where s.transaction_id = r.id;
      if v_w is not null and not exists (select 1 from unnest(v_w) x where x is null) and (select sum(x) from unnest(v_w) x) > 0 then
        v_sh := public.hh_allocate((select t.household_amount from public.transactions t where t.id = r.id), v_w);
        update public.transaction_splits s set share = v_sh[o.position_index]
          from (select ss.id, row_number() over (order by ss.position) as position_index from public.transaction_splits ss where ss.transaction_id = r.id) o
         where s.id = o.id;
      end if;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.hh_restamp_pending() from public, anon, authenticated;
grant execute on function public.hh_restamp_pending() to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'household-restamp-hourly') then
    perform cron.unschedule('household-restamp-hourly');
  end if;
end;
$$;
select cron.schedule('household-restamp-hourly', '17 * * * *', $$select public.hh_restamp_pending()$$);

-- 8. Grants ---------------------------------------------------------------------------------------------------------
revoke execute on function public.share_transaction(uuid, int, text, uuid[], jsonb, text) from public, anon;
grant execute on function public.share_transaction(uuid, int, text, uuid[], jsonb, text) to authenticated;
revoke execute on function public.bulk_share_transactions(uuid[], text) from public, anon;
grant execute on function public.bulk_share_transactions(uuid[], text) to authenticated;
revoke execute on function public.make_line_private(uuid, int) from public, anon;
grant execute on function public.make_line_private(uuid, int) to authenticated;
revoke execute on function public.set_line_split(uuid, int, text, uuid[], jsonb) from public, anon;
grant execute on function public.set_line_split(uuid, int, text, uuid[], jsonb) to authenticated;
revoke execute on function public.set_paid_by(uuid, int, uuid) from public, anon;
grant execute on function public.set_paid_by(uuid, int, uuid) to authenticated;
revoke execute on function public.set_split_default(text, text, int) from public, anon;
grant execute on function public.set_split_default(text, text, int) to authenticated;
revoke execute on function public.count_unsettled_for_rule(text) from public, anon;
grant execute on function public.count_unsettled_for_rule(text) to authenticated;
revoke execute on function public.apply_rule_to_unsettled(text) from public, anon;
grant execute on function public.apply_rule_to_unsettled(text) to authenticated;
revoke execute on function public.set_household_currency(text) from public, anon;
grant execute on function public.set_household_currency(text) to authenticated;
