-- Recurring materialisation: the daily/on-demand generator and the three
-- series RPCs (create, edit "this and future", end) that plan 02-12
-- (db/recurringSeries.ts) calls and turns into an engine SeriesChangeSet
-- (D-02, D-03, D-07, D-08, D-09, RESEARCH Pitfalls 2 and 3).
--
-- Every function here is `language plpgsql security definer set search_path
-- = ''`, with every reference fully qualified, and re-implements whatever
-- membership check RLS would have done -- these functions bypass RLS by
-- being security definer, so each one checks
-- `household_id in (select public.user_household_ids())` itself before
-- touching a row (T-02-08-01).
--
-- materialise_series()/materialise_recurring() are service_role-only: the
-- daily pg_cron job and the three RPCs below call them internally (as the
-- function owner, not the caller), but no client ever calls them directly
-- (T-02-08-04).
--
-- materialise_series()'s own materialised_through bookkeeping update runs
-- under `fincwin.system_restamp = 'on'` (the same GUC convention
-- 20260926000100_categories.sql's set_updated_by() and
-- 20260924000700_fx_monitor_jobs.sql's fx_restamp_pending() already use), so
-- it never bumps the series' version and never blocks a user's undo -- only
-- a genuine template edit (edit_recurring_series_from/end_recurring_series)
-- does that.
--
-- D-WR-04: each of the three series RPCs takes an optional p_undo_step
-- ({id, label_key, label_params}) and, when given, records the inverse of
-- its own change set in undo_log in the same transaction
-- (public.record_series_undo_step, defined with undo_log in
-- 20260926000500_undo_log.sql and resolved at call time), so "one action is
-- one step" (D-24) holds even if the app dies between the write and a
-- separate insertUndoStep call.

-- 1. materialise_series(): generate every not-yet-materialised occurrence of
-- one series through the horizon (or its end date, if sooner), skipping
-- anything before the series' own materialised_through high-water mark so a
-- soft-deleted or skipped occurrence is never recreated (D-08) and the
-- unique index below absorbs any remaining double-write race (Pitfall 3).
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
  v_through := public.recurring_horizon(v_today);
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
        local_date, time_zone, name, category_id, payment_type, status, recurring_series_id, occurrence_date
      ) values (
        gen_random_uuid(), s.household_id, s.account_id, v_author, s.amount, s.currency,
        v_date, s.time_zone, s.name, s.category_id, s.payment_type, 'pending', s.id, v_date
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

-- 2. materialise_recurring(): the daily job's entry point -- materialise
-- every still-active series (not ended more than a day ago, so an
-- end-dated series still gets one final pass) and return the total number
-- of new rows inserted.
create or replace function public.materialise_recurring()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  total integer := 0;
  s record;
begin
  for s in
    select id from public.recurring_series
     where deleted_at is null
       and (end_date is null or end_date >= current_date - 1)
  loop
    -- D-WR-01: each series in its own subtransaction, so one series that
    -- raises (a dropped time zone, a guard, a missing author profile) is
    -- logged and skipped instead of rolling back the whole run for every
    -- household -- and failing again every day after. Its row lock is
    -- released with the subtransaction.
    begin
      total := total + (select count(*) from public.materialise_series(s.id));
    exception when others then
      raise warning 'materialise_series % failed: % (%)', s.id, sqlerrm, sqlstate;
    end;
  end loop;
  return total;
end;
$$;

-- 3. create_recurring_series(): a series id that already exists in the
-- caller's own household replays as already-applied (client-generated UUID
-- retry safety, mirrors every other insertX in this codebase); in another
-- household it is 42501, never a silent no-op. An anchor transaction
-- becomes the series' first occurrence (D-09); additional rows can be
-- linked at creation (D-21's accept path, one per local_date so a caller
-- can never create two rows for one occurrence). A brand-new series never
-- back-fills earlier months as overdue (materialised_through starts at the
-- anchor's own month when nothing is linked).
create or replace function public.create_recurring_series(
  p_series jsonb,
  p_anchor_transaction_id uuid default null,
  p_link_transaction_ids uuid[] default '{}',
  p_undo_step jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid := (p_series ->> 'household_id')::uuid;
  v_series_id uuid := (p_series ->> 'id')::uuid;
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
  end if;

  v_today := (now() at time zone coalesce(v_time_zone, 'UTC'))::date;

  insert into public.recurring_series (
    id, household_id, created_by, updated_by, account_id, name, amount, currency, category_id,
    payment_type, freq, anchor_date, time_zone, end_date, occurrence_count
  ) values (
    v_series_id, v_household_id, (select auth.uid()), (select auth.uid()), (p_series ->> 'account_id')::uuid,
    p_series ->> 'name', (p_series ->> 'amount')::bigint, p_series ->> 'currency',
    nullif(p_series ->> 'category_id', '')::uuid, nullif(p_series ->> 'payment_type', ''),
    p_series ->> 'freq', v_anchor_date, v_time_zone,
    nullif(p_series ->> 'end_date', '')::date, nullif(p_series ->> 'occurrence_count', '')::integer
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

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', v_series_id, 'version', 1, 'before', null),
    'inserted', v_inserted,
    'soft_deleted', '[]'::jsonb,
    'linked', v_linked
  ));
end;
$$;

-- 4. edit_recurring_series_from(): "This and future" (D-07). Only
-- status = 'pending' rows on or after p_effective_from are ever touched
-- (Pitfall 2: a naive date-only filter would also rewrite a paid row dated
-- after the edit). materialised_through is rewound to just before the
-- effective date in the same statement as the template patch, so the whole
-- template change plus the rewind is exactly one version bump; the
-- subsequent materialise_series() call's own bookkeeping update is a system
-- restamp and bumps nothing further.
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
    'payment_type', 'freq', 'anchor_date', 'end_date', 'occurrence_count'];
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

-- 5. end_recurring_series(): sets the end date and soft-deletes pending
-- occurrences after it; paid history is untouched (D-08).
create or replace function public.end_recurring_series(
  p_series_id uuid,
  p_expected_version integer,
  p_end_date date,
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
  v_soft_deleted jsonb := '[]'::jsonb;
  v_new_version integer;
begin
  select * into s from public.recurring_series where id = p_series_id and deleted_at is null for update;
  if not found then
    return jsonb_build_object('status', 'not-found');
  end if;
  if s.household_id not in (select public.user_household_ids()) then
    raise exception 'not a member of household %', s.household_id using errcode = '42501';
  end if;
  -- D-WR-03: replay of this same action -> already-applied.
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
  -- D-WR-09: a null end date used to pass the check below (NULL < x is
  -- NULL) and silently turn "End series" into "remove the end date".
  if p_end_date is null then
    raise exception 'end_recurring_series: p_end_date is required' using errcode = '22023';
  end if;
  if p_end_date < s.anchor_date then
    raise exception 'end_date % is before anchor_date %', p_end_date, s.anchor_date using errcode = '22023';
  end if;

  v_before := jsonb_build_object('end_date', to_jsonb(s.end_date), 'occurrence_count', to_jsonb(s.occurrence_count));

  update public.recurring_series set end_date = p_end_date where id = p_series_id
  returning version into v_new_version;

  with to_delete as (
    update public.transactions
       set deleted_at = now()
     where recurring_series_id = p_series_id
       and status = 'pending'
       and deleted_at is null
       and occurrence_date > p_end_date
    returning id, version
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'version', version)), '[]'::jsonb)
    into v_soft_deleted
    from to_delete;

  return public.record_series_undo_step(p_undo_step, jsonb_build_object(
    'status', 'applied',
    'series', jsonb_build_object('id', p_series_id, 'version', v_new_version, 'before', v_before),
    'inserted', '[]'::jsonb,
    'soft_deleted', v_soft_deleted,
    'linked', '[]'::jsonb
  ));
end;
$$;

-- 6. Grants (T-02-08-04). The materialiser is service_role-only -- no
-- client, however privileged, calls it directly; the three RPCs are
-- authenticated-callable and enforce membership internally (T-02-08-01).
revoke execute on function public.materialise_series(uuid, date) from public, anon, authenticated;
grant execute on function public.materialise_series(uuid, date) to service_role;

revoke execute on function public.materialise_recurring() from public, anon, authenticated;
grant execute on function public.materialise_recurring() to service_role;

revoke execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb) from public, anon;
grant execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb) to authenticated;

revoke execute on function public.edit_recurring_series_from(uuid, integer, jsonb, date, jsonb) from public, anon;
grant execute on function public.edit_recurring_series_from(uuid, integer, jsonb, date, jsonb) to authenticated;

revoke execute on function public.end_recurring_series(uuid, integer, date, jsonb) from public, anon;
grant execute on function public.end_recurring_series(uuid, integer, date, jsonb) to authenticated;

-- 7. Daily materialisation schedule: 00:20 UTC, well clear of the FX jobs
-- (16:00/17:00 UTC), pure SQL with no HTTP call and no Vault secret needed.
select cron.schedule('recurring-materialise-daily', '20 0 * * *', $$ select public.materialise_recurring(); $$);
