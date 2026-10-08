-- W6-13 review WR-08 (forward fix; 20260926000400 is already in production
-- and is never edited): create_recurring_series no longer trusts
-- p_anchor_is_new.
--
--   * The flag is accepted only for an anchor that is new: still at version 1
--     (never edited) and created by the caller. Otherwise 22023, and nothing
--     is written (the whole call is one transaction).
--   * anchor_created is recorded only for the row this call actually linked.
--     Before, a requested link row on the anchor's date with a smaller id won
--     the one-per-date dedup, the anchor stayed unlinked, and the step still
--     soft-deleted it on undo.
--
-- Same signature, so existing grants carry over; they are re-applied below
-- anyway so this file is self-contained. security definer and
-- search_path = '' are unchanged. Replays (series id already present) still
-- return already-applied before any of these checks run.
--
-- Additive and idempotent: create or replace of one function body, no
-- schema change (FND-10, Phase 1 D-26/D-27).

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

revoke execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb, boolean) from public, anon;
grant execute on function public.create_recurring_series(jsonb, uuid, uuid[], jsonb, boolean) to authenticated;
