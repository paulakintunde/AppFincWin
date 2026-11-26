-- Phase 10.1 plan 30 (D-28): a repeat bill made from a split line keeps the split, and every line it creates carries the parts
-- scaled to that line's amount. Proven by supabase/tests/database/136_series_category_parts.test.sql.
-- Additive: recurring_series.category_parts (nullable jsonb, same {"c","a","l"} shape as transactions.category_parts),
-- a shape and ownership guard, series_scaled_parts, and create or replace of create_recurring_series (decide_go copy, parts
-- kept from the request or the anchor line) and materialise_series (privacy_rpcs copy, parts passed to each new line).
-- The transactions guard trigger re-checks each materialised line and sets its category_id to the largest part.

alter table public.recurring_series add column if not exists category_parts jsonb;

comment on column public.recurring_series.category_parts is
  '10.1 D-28: null = not split. Same shape as transactions.category_parts; each materialised line gets these parts scaled (largest remainder) to its own amount.';

create or replace function public.tg_series_category_parts_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
begin
  if new.category_parts is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.category_parts is not distinct from old.category_parts then
    return new;
  end if;
  v_reason := public.parts_invalid_reason(new.category_parts, new.amount, true);
  if v_reason is not null then
    raise exception using errcode = 'PT001', message = v_reason;
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.category_parts) e
     where (e ->> 'c') is not null
       and not exists (select 1 from public.categories c where c.id = (e ->> 'c')::uuid and c.owner_id = new.created_by)) then
    raise exception using errcode = 'PT001', message = 'category_not_owned';
  end if;
  return new;
end;
$$;
revoke execute on function public.tg_series_category_parts_guard() from public, anon, authenticated;

drop trigger if exists recurring_series_category_parts_guard on public.recurring_series;
create trigger recurring_series_category_parts_guard
  before insert or update of category_parts on public.recurring_series
  for each row execute function public.tg_series_category_parts_guard();

-- The series' parts scaled to one line's amount: largest remainder on the part sizes, odd cents to the largest part, the
-- order and the taxTip label kept. Null parts give null.
create or replace function public.series_scaled_parts(p_parts jsonb, p_total bigint)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_w numeric[];
  v_new bigint[];
begin
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) < 2 then
    return null;
  end if;
  select array_agg(abs((x.e ->> 'a')::numeric) order by x.ord) into v_w
    from jsonb_array_elements(p_parts) with ordinality x(e, ord);
  v_new := public.parts_allocate(p_total, v_w);
  return (select jsonb_agg(jsonb_set(x.e, '{a}', to_jsonb(v_new[x.ord::int])) order by x.ord)
            from jsonb_array_elements(p_parts) with ordinality x(e, ord));
end;
$$;
revoke execute on function public.series_scaled_parts(jsonb, bigint) from public, anon, authenticated;

create or replace function public.materialise_series(p_series_id uuid, p_today date default null)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_today date;
  v_through date;
  v_floor date;
  v_date date;
  v_id uuid;
  v_author uuid;
  v_added boolean := false;
  v_tripped boolean := false;
  v_months integer;
  n integer := 0;
  n_start integer := 0;
begin
  select * into s from public.recurring_series
   where id = p_series_id and deleted_at is null
   for update;
  if not found then
    return;
  end if;
  -- 06 review P1-CR-03: a removed goal's contribution and a removed debt's Expected extra write no more lines. remove_goal
  -- and remove_debt stop these series themselves; this covers a goal or debt removed by an older app build's plain patch,
  -- whose new lines could never be confirmed or paid. Undo of that removal brings the goal back, and the next run fills in.
  if s.goal_id is not null  -- 06 review
     and not exists (select 1 from public.savings_goals g where g.id = s.goal_id and g.deleted_at is null) then  -- 06 review
    return;  -- 06 review
  end if;  -- 06 review
  if exists (select 1 from public.debts d where d.extra_series_id = s.id and d.deleted_at is not null) then  -- 06 review
    return;  -- 06 review
  end if;  -- 06 review

  v_today := coalesce(p_today, (now() at time zone s.time_zone)::date);
  -- 2.2 (D-16, user decision 2026-10-09): materialise through the later of the
  -- default horizon and the end of the household's horizon_month, so a series
  -- created after a month was added still reaches it.
  v_through := greatest(
    public.recurring_horizon(v_today),
    coalesce(
      (select (to_date(h.horizon_month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date
         from public.households h
        where h.id = s.household_id and h.horizon_month is not null),
      public.recurring_horizon(v_today)
    )
  );
  if s.end_date is not null and s.end_date < v_through then
    v_through := s.end_date;
  end if;
  v_floor := greatest(coalesce(s.materialised_through + 1, s.anchor_date), s.anchor_date);
  -- D-WR-01: a series outlives a non-owner author (created_by is ON DELETE
  -- SET NULL), but stamp_fx_rate needs an author profile, so fall back to
  -- the household owner rather than fail every day from then on.
  v_author := coalesce(s.created_by, (select h.owner_id from public.households h where h.id = s.household_id));

  -- D-IN-06: start one step below the first n that can reach v_floor
  -- (occurrence dates never decrease in n, and every n below this one is
  -- dated before v_floor) instead of at n = 0, so the 5000-step guard bounds
  -- the work done per run rather than the series' whole lifetime. n stays
  -- absolute, so occurrence_count is still counted from the anchor.
  v_months := ((extract(year from v_floor) - extract(year from s.anchor_date)) * 12
               + (extract(month from v_floor) - extract(month from s.anchor_date)))::integer;
  n_start := greatest(0, case s.freq
    when 'weekly' then (v_floor - s.anchor_date) / 7
    when 'fortnightly' then (v_floor - s.anchor_date) / 14
    when 'monthly' then v_months
    when 'quarterly' then v_months / 3
    when 'yearly' then v_months / 12
    else 0
  end - 1);
  n := n_start;

  loop
    exit when s.occurrence_count is not null and n >= s.occurrence_count;
    if n - n_start > 5000 then -- hard guard (T-02-08-05): no series ever loops unbounded
      v_tripped := true;
      exit;
    end if;
    v_date := public.recurring_occurrence_date(s.anchor_date, s.freq, n);
    exit when v_date > v_through;

    if v_date >= v_floor then
      insert into public.transactions (
        id, household_id, account_id, created_by, original_amount, original_currency,
        local_date, time_zone, name, category_id, payment_type, status, recurring_series_id, occurrence_date,
        is_automatic, is_sample, goal_id, is_shared, category_parts -- 2.2: D-02, D-09; 06: D-25; 08-05: D-16; 10.1-30: D-28
      ) values (
        gen_random_uuid(), s.household_id, s.account_id, v_author, s.amount, s.currency,
        v_date, s.time_zone, s.name, s.category_id, s.payment_type, 'pending', s.id, v_date,
        s.is_automatic, s.is_sample, s.goal_id, s.is_shared, -- 06: D-25; 08-05: lines copy is_shared from the series, created_by is the series creator (v_author)
        public.series_scaled_parts(s.category_parts, s.amount)  -- 10.1-30 D-28: the series' parts scaled to this line's amount
      )
      on conflict (recurring_series_id, occurrence_date) where recurring_series_id is not null and deleted_at is null
      do nothing
      returning id into v_id;

      if v_id is not null then
        v_added := true;
        return next v_id;
      end if;
    end if;

    n := n + 1;
  end loop;

  -- D-CR-01: generation moves whenever this run adds rows, so a stored undo
  -- step for a template edit/end can tell that the occurrence set it was
  -- built against has grown since (apply_undo_step refuses it, D-26).
  -- D-IN-06: if the guard tripped, the high-water mark only moves as far as
  -- the last date actually generated, never silently past skipped dates.
  if v_tripped then
    raise warning 'materialise_series %: step guard tripped before %', s.id, v_through;
    v_through := least(v_through, v_date);
  end if;

  if v_through > coalesce(s.materialised_through, '-infinity'::date) or v_added then
    perform set_config('fincwin.system_restamp', 'on', true);
    update public.recurring_series
       set materialised_through = greatest(v_through, coalesce(materialised_through, v_through)),
           generation = generation + case when v_added then 1 else 0 end
     where id = s.id;
    perform set_config('fincwin.system_restamp', '', true);
  end if;

  return;
end;
$$;

create or replace function public.create_recurring_series(
  p_series jsonb,
  p_anchor_transaction_id uuid default null,
  p_link_transaction_ids uuid[] default '{}',
  p_undo_step jsonb default null,
  p_anchor_is_new boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := (p_series ->> 'household_id')::uuid;
  v_series_id uuid := (p_series ->> 'id')::uuid;
  v_anchor_created jsonb := null;
  v_existing public.recurring_series%rowtype;
  v_anchor_date date := nullif(p_series ->> 'anchor_date', '')::date;
  v_anchor_txn public.transactions%rowtype;
  v_time_zone text := p_series ->> 'time_zone';
  v_materialised_through date;
  v_today date;
  v_linked jsonb := '[]'::jsonb;
  v_inserted jsonb := '[]'::jsonb;
begin
  if v_household_id is null or v_household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', v_household_id using errcode = '42501';
  end if;

  -- 08.1-02: the kind of amount, exact or expected
  if nullif(p_series ->> 'amount_kind', '') is not null and (p_series ->> 'amount_kind') not in ('exact', 'expected') then
    raise exception 'create_recurring_series: amount_kind must be exact or expected' using errcode = '22023';
  end if;

  -- 08-05: the paying account must be the caller's own or a joint account
  if nullif(p_series ->> 'account_id', '') is not null
     and not public.hh_account_usable((p_series ->> 'account_id')::uuid, (select auth.uid())) then
    raise exception 'create_recurring_series: the account is not yours or joint' using errcode = '42501';
  end if;

  select * into v_existing from public.recurring_series where id = v_series_id;
  if found then
    if v_existing.household_id <> v_household_id then
      raise exception 'series % belongs to a different household', v_series_id using errcode = '42501';
    end if;
    return jsonb_build_object('status', 'already-applied', 'series_id', v_series_id);
  end if;

  -- 2026-10-06 user decision: p_anchor_is_new says the anchor row was created
  -- in this same user action, so its undo also removes the anchor. It is only
  -- meaningful with an anchor; a flag with nothing to apply to is malformed.
  if coalesce(p_anchor_is_new, false) and p_anchor_transaction_id is null then
    raise exception 'p_anchor_is_new requires p_anchor_transaction_id' using errcode = '22023';
  end if;

  if p_anchor_transaction_id is not null then
    select * into v_anchor_txn from public.transactions
     where id = p_anchor_transaction_id
       and household_id = v_household_id
       and created_by = (select auth.uid())  -- 08-05: only the caller's own line becomes a series
       and deleted_at is null
       and recurring_series_id is null
     for update;
    if not found then
      raise exception 'anchor transaction % is not eligible to become a series', p_anchor_transaction_id using errcode = '22023';
    end if;
    v_anchor_date := v_anchor_txn.local_date;

    -- W6-13 WR-08: the flag is verified, not trusted. "New" means the anchor
    -- is untouched since it was inserted (version 1: no user edit has bumped
    -- it; FX restamps run under system_restamp and do not) and was inserted
    -- by this caller. Anything else is an existing entry, and making an
    -- existing entry repeat must leave it alone on undo (D-24 amendment).
    if coalesce(p_anchor_is_new, false)
       and (v_anchor_txn.version <> 1 or v_anchor_txn.created_by is distinct from (select auth.uid())) then
      raise exception 'anchor transaction % is not new', p_anchor_transaction_id using errcode = '22023';
    end if;
  end if;

  v_today := (now() at time zone coalesce(v_time_zone, 'UTC'))::date;

  insert into public.recurring_series (
    id, household_id, created_by, updated_by, account_id, name, amount, currency, category_id,
    payment_type, freq, anchor_date, time_zone, end_date, occurrence_count, is_automatic, is_shared, amount_kind, category_parts -- 10.1-30; 2.2: D-02; 08-05: D-16; 08.1-02
  ) values (
    v_series_id, v_household_id, (select auth.uid()), (select auth.uid()), (p_series ->> 'account_id')::uuid,
    p_series ->> 'name', (p_series ->> 'amount')::bigint, p_series ->> 'currency',
    nullif(p_series ->> 'category_id', '')::uuid, nullif(p_series ->> 'payment_type', ''),
    p_series ->> 'freq', v_anchor_date, v_time_zone,
    nullif(p_series ->> 'end_date', '')::date, nullif(p_series ->> 'occurrence_count', '')::integer,
    coalesce((p_series ->> 'is_automatic')::boolean, false), -- is_sample is never read from client JSON (T-02.2-10-03)
    coalesce(nullif(p_series ->> 'is_shared', '')::boolean, v_anchor_txn.is_shared, false),  -- 08-05: D-16, the creator's choice
    coalesce(nullif(p_series ->> 'amount_kind', ''), 'exact'),  -- 08.1-02
    -- 10.1-30 D-28: a split line that becomes a repeat bill keeps its parts (the guard trigger re-checks them)
    case when p_series ? 'category_parts' then p_series -> 'category_parts' else v_anchor_txn.category_parts end
  );

  -- Link the anchor row plus any explicitly requested rows, one per
  -- local_date (first by id) so the caller can never create two occurrence
  -- rows for the same date.
  with candidates as (
    select id from public.transactions
     where household_id = v_household_id
       and created_by = (select auth.uid())  -- 08-05: only the caller's own lines are linked
       and deleted_at is null
       and recurring_series_id is null
       and (id = p_anchor_transaction_id or id = any (p_link_transaction_ids))
  ),
  deduped as (
    select distinct on (t.local_date) t.id, t.local_date
      from public.transactions t join candidates c on c.id = t.id
     order by t.local_date, t.id
  ),
  updated as (
    update public.transactions t
       set recurring_series_id = v_series_id, occurrence_date = t.local_date
      from deduped d
     where t.id = d.id
     returning t.id, t.version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_linked
    from updated;

  select max(local_date) into v_materialised_through
    from public.transactions where recurring_series_id = v_series_id;

  if v_materialised_through is null then
    v_materialised_through := greatest(v_anchor_date, date_trunc('month', v_today)::date) - 1;
  end if;

  perform set_config('fincwin.system_restamp', 'on', true);
  update public.recurring_series set materialised_through = v_materialised_through where id = v_series_id;
  perform set_config('fincwin.system_restamp', '', true);

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', 1)), '[]'::jsonb) into v_inserted
    from public.materialise_series(v_series_id) as id;

  -- The anchor's version is read after the link above, so the undo op's
  -- expectedVersion is the row as this action left it: any later edit makes
  -- the undo refuse (D-26) rather than silently deleting the user's change.
  -- W6-13 WR-08: only an anchor this call actually linked. The link CTE keeps
  -- one row per local_date (smallest id first), so a requested link row on
  -- the anchor's date can win over the anchor; the step must then never
  -- soft-delete the unlinked anchor.
  if coalesce(p_anchor_is_new, false) then
    select jsonb_build_object('id', t.id, 'version', t.version) into v_anchor_created
      from public.transactions t
     where t.id = p_anchor_transaction_id
       and t.recurring_series_id = v_series_id
       and exists (
         select 1 from jsonb_array_elements(v_linked) l where (l ->> 'id')::uuid = t.id
       );
  end if;

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', v_series_id, 'version', 1, 'before', null),
    'inserted', v_inserted,
    'soft_deleted', '[]'::jsonb,
    'linked', v_linked
  ) || case when v_anchor_created is null then '{}'::jsonb
            else jsonb_build_object('anchor_created', v_anchor_created) end);
end;
$$;

revoke execute on function public.materialise_series(uuid, date) from public, anon, authenticated;
grant execute on function public.materialise_series(uuid, date) to service_role;
revoke execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb, boolean) to authenticated;
