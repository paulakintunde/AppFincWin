-- Phase 2.2 (record polish): series SQL learns the Automatic flag, sample
-- series and the household horizon, and gains a batch create RPC.
--
--   * D-02: is_automatic lives on the series template. create_recurring_series
--     stores it from p_series; edit_recurring_series_from accepts it for
--     "This and future" (future pending occurrences are rebuilt from the
--     template); materialise_series copies it onto every occurrence.
--   * D-09: occurrences of a sample series are written with is_sample true.
--     is_sample is never read from client JSON.
--   * D-16 + user decision 2026-10-09: materialise_series (and so the daily
--     cron) runs through the later of the default horizon and the end of the
--     household's horizon_month.
--   * D-19: create_recurring_series_batch creates N series in one transaction
--     and records exactly ONE undo step.
--
-- Full-body copies of the latest definitions (20260926000400 and
-- 20261007000100), changed only at `2.2` markers. Signatures are unchanged;
-- grants are re-issued below. Additive and idempotent (FND-10).

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
        is_automatic, is_sample -- 2.2: D-02, D-09
      ) values (
        gen_random_uuid(), s.household_id, s.account_id, v_author, s.amount, s.currency,
        v_date, s.time_zone, s.name, s.category_id, s.payment_type, 'pending', s.id, v_date,
        s.is_automatic, s.is_sample
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
    payment_type, freq, anchor_date, time_zone, end_date, occurrence_count, is_automatic -- 2.2: D-02
  ) values (
    v_series_id, v_household_id, (select auth.uid()), (select auth.uid()), (p_series ->> 'account_id')::uuid,
    p_series ->> 'name', (p_series ->> 'amount')::bigint, p_series ->> 'currency',
    nullif(p_series ->> 'category_id', '')::uuid, nullif(p_series ->> 'payment_type', ''),
    p_series ->> 'freq', v_anchor_date, v_time_zone,
    nullif(p_series ->> 'end_date', '')::date, nullif(p_series ->> 'occurrence_count', '')::integer,
    coalesce((p_series ->> 'is_automatic')::boolean, false) -- is_sample is never read from client JSON (T-02.2-10-03)
  );

  -- Link the anchor row plus any explicitly requested rows, one per
  -- local_date (first by id) so the caller can never create two occurrence
  -- rows for the same date.
  with candidates as (
    select id from public.transactions
     where household_id = v_household_id
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

create or replace function public.edit_recurring_series_from(
  p_series_id uuid,
  p_expected_version integer,
  p_patch jsonb,
  p_effective_from date,
  p_undo_step jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.recurring_series%rowtype;
  v_before jsonb;
  v_key text;
  v_allowed text[] := array['name', 'amount', 'currency', 'account_id', 'category_id',
    'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count', 'is_automatic'];
  v_soft_deleted jsonb := '[]'::jsonb;
  v_inserted jsonb := '[]'::jsonb;
  v_new_version integer;
  v_new_anchor date;
  v_count integer;
  v_used integer := 0;
begin
  select * into s from public.recurring_series where id = p_series_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if s.household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', s.household_id using errcode = '42501';
  end if;
  -- D-WR-03: a replay of this same action (its undo step already exists)
  -- is already-applied, not a conflict with its own first attempt.
  if public.undo_step_replayed(p_undo_step) then
    return jsonb_build_object('status', 'already-applied', 'series_id', s.id, 'undo_step_id', p_undo_step ->> 'id');
  end if;
  if s.version <> p_expected_version then
    return jsonb_build_object(
      'status', 'conflict',
      'conflict', jsonb_build_object(
        'entity', 'recurring_series', 'id', s.id, 'updated_by', s.updated_by,
        'record_name', s.name, 'builtin_key', null, 'reason', 'changed'
      )
    );
  end if;

  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb then
    raise exception 'edit_recurring_series_from: p_patch must be a non-empty object' using errcode = '22023';
  end if;

  -- D-WR-09: a null effective date is invalid (it used to bump the version
  -- and regenerate nothing); one far in the past is rejected, because the
  -- rewind would re-materialise every occurrence the user deleted since
  -- (tombstones fall outside the occurrence unique index); and one before
  -- the anchor is clamped to it, so a re-anchor never starts the series
  -- earlier than it began.
  if p_effective_from is null then
    raise exception 'edit_recurring_series_from: p_effective_from is required' using errcode = '22023';
  end if;
  if p_effective_from < (date_trunc('month', (now() at time zone s.time_zone)::date) - interval '12 months')::date then
    raise exception 'edit_recurring_series_from: p_effective_from % is too far in the past', p_effective_from using errcode = '22023';
  end if;
  p_effective_from := greatest(p_effective_from, s.anchor_date);

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'unknown recurring_series patch key %', v_key using errcode = '22023';
    end if;
  end loop;

  v_before := (
    select coalesce(jsonb_object_agg(k, to_jsonb(s) -> k), '{}'::jsonb)
      from jsonb_object_keys(p_patch) as k
  );
  if p_patch ? 'freq' and not (p_patch ? 'anchor_date') then
    v_before := v_before || jsonb_build_object('anchor_date', to_jsonb(s.anchor_date));
  end if;

  -- D-WR-05: occurrence_count counts n = 0..count-1 from anchor_date, so
  -- moving the anchor (a freq change re-anchors at p_effective_from, or an
  -- explicit anchor_date) must carry over only what the old schedule had
  -- not yet used -- otherwise the count restarts and a 12-instalment loan
  -- grows extra instalments. An explicit occurrence_count in the patch wins.
  v_new_anchor := case
    when p_patch ? 'anchor_date' then (p_patch ->> 'anchor_date')::date
    when p_patch ? 'freq' then p_effective_from
    else s.anchor_date
  end;
  v_count := case when p_patch ? 'occurrence_count'
                  then nullif(p_patch ->> 'occurrence_count', '')::integer
                  else s.occurrence_count end;
  if v_new_anchor is distinct from s.anchor_date and s.occurrence_count is not null
     and not (p_patch ? 'occurrence_count') then
    while v_used < s.occurrence_count
      and public.recurring_occurrence_date(s.anchor_date, s.freq, v_used) < v_new_anchor loop
      v_used := v_used + 1;
    end loop;
    if v_used >= s.occurrence_count then
      raise exception 'series % has no occurrences left after %', s.id, v_new_anchor using errcode = '22023';
    end if;
    v_count := s.occurrence_count - v_used;
    v_before := v_before || jsonb_build_object('occurrence_count', to_jsonb(s.occurrence_count));
  end if;

  update public.recurring_series set
    name = case when p_patch ? 'name' then (p_patch ->> 'name') else name end,
    amount = case when p_patch ? 'amount' then (p_patch ->> 'amount')::bigint else amount end,
    currency = case when p_patch ? 'currency' then (p_patch ->> 'currency') else currency end,
    account_id = case when p_patch ? 'account_id' then (p_patch ->> 'account_id')::uuid else account_id end,
    category_id = case when p_patch ? 'category_id' then nullif(p_patch ->> 'category_id', '')::uuid else category_id end,
    payment_type = case when p_patch ? 'payment_type' then nullif(p_patch ->> 'payment_type', '') else payment_type end,
    freq = case when p_patch ? 'freq' then (p_patch ->> 'freq') else freq end,
    anchor_date = v_new_anchor,
    end_date = case when p_patch ? 'end_date' then nullif(p_patch ->> 'end_date', '')::date else end_date end,
    occurrence_count = v_count,
    is_automatic = case when p_patch ? 'is_automatic' then (p_patch ->> 'is_automatic')::boolean else is_automatic end, -- 2.2: D-02
    materialised_through = least(coalesce(materialised_through, p_effective_from - 1), p_effective_from - 1)
  where id = p_series_id
  returning version into v_new_version;

  with to_delete as (
    update public.transactions
       set deleted_at = now()
     where recurring_series_id = p_series_id
       and status = 'pending'
       and deleted_at is null
       and occurrence_date >= p_effective_from
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_soft_deleted
    from to_delete;

  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', 1)), '[]'::jsonb) into v_inserted
    from public.materialise_series(p_series_id) as id;

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', p_series_id, 'version', v_new_version, 'before', v_before),
    'inserted', v_inserted,
    'soft_deleted', v_soft_deleted,
    'linked', '[]'::jsonb
  ));
end;
$$;

-- create_recurring_series_batch(): "Mark all monthly" (D-19). Each item goes
-- through create_recurring_series (its own membership check, 42501) with no
-- per-item undo step; the batch records one undo_log row whose ops are the
-- concatenated inverses, in item order. All or nothing: any exception aborts
-- the whole transaction.
create or replace function public.create_recurring_series_batch(p_items jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_item jsonb;
  v_change jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_links uuid[];
begin
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) not between 1 and 50 then
    raise exception 'create_recurring_series_batch: p_items must be an array of 1 to 50 items' using errcode = '22023';
  end if;
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception 'create_recurring_series_batch: p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'create_recurring_series_batch: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'create_recurring_series_batch: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;

  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item -> 'series') is distinct from 'object' then
      raise exception 'create_recurring_series_batch: each item needs a series object' using errcode = '22023';
    end if;
    v_links := coalesce(
      array(select jsonb_array_elements_text(
        case when jsonb_typeof(v_item -> 'link_transaction_ids') = 'array'
             then v_item -> 'link_transaction_ids' else '[]'::jsonb end))::uuid[],
      '{}'::uuid[]);
    v_change := public.create_recurring_series(
      v_item -> 'series',
      nullif(v_item ->> 'anchor_transaction_id', '')::uuid,
      v_links,
      null,
      false
    );
    if v_change ->> 'status' is distinct from 'applied' then
      raise exception 'create_recurring_series_batch: series % was not created (%)',
        v_item -> 'series' ->> 'id', v_change ->> 'status' using errcode = '22023';
    end if;
    v_changes := v_changes || jsonb_build_array(v_change);
    v_ops := v_ops || public.series_change_inverse(v_change);
  end loop;

  insert into public.undo_log (id, owner_id, label_key, label_params, ops)
  values (
    v_step_id, (select auth.uid()), p_undo_step ->> 'label_key',
    coalesce(p_undo_step -> 'label_params', '{}'::jsonb), v_ops
  );

  return jsonb_build_object('status', 'applied', 'undo_step_id', v_step_id, 'changes', v_changes);
end;
$$;

revoke execute on function public.create_recurring_series_batch(jsonb, jsonb) from public, anon;
grant execute on function public.create_recurring_series_batch(jsonb, jsonb) to authenticated;

revoke execute on function public.materialise_series(uuid, date) from public, anon, authenticated;
grant execute on function public.materialise_series(uuid, date) to service_role;

revoke execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb, boolean) to authenticated;

revoke execute on function public.edit_recurring_series_from(uuid, integer, jsonb, date, jsonb) from public, anon;
grant execute on function public.edit_recurring_series_from(uuid, integer, jsonb, date, jsonb) to authenticated;
