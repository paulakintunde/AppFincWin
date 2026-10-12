-- Phase 02.3 (REC-30; CONTEXT D-14, D-28): the entry-sheet list saved as ONE undo step.
-- The client inserts every listed row first (client uuids, ON CONFLICT DO NOTHING) and
-- then calls this with: every inserted row id, one item per repeating listed entry
-- ({series: <create_recurring_series p_series>, anchor_transaction_id}), and the step.
-- Each item's series is created with p_anchor_is_new (the anchor was inserted by the same
-- action) and no per-item step; the one undo_log row holds: a soft delete for every
-- non-anchor row, then each series' series_change_inverse (which also removes its anchor
-- and every materialised occurrence). All or nothing. A replay (same step id) is
-- 'already-applied'. Additive: no existing row is written by this migration.
--
-- Client contract (plan 02.3-13):
--   record_entry_list(p_row_ids uuid[]  -- every inserted row id, 1..200, unique
--                     p_items jsonb     -- [{series, anchor_transaction_id}] 0..61
--                     p_undo_step jsonb -- {id, label_key:'addedMany', label_params:{n}})
--   -> {status:'applied', undo_step_id, changes:[...]} | {status:'already-applied', undo_step_id}
create or replace function public.record_entry_list(p_row_ids uuid[], p_items jsonb, p_undo_step jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_step_id uuid;
  v_item jsonb;
  v_anchor uuid;
  v_anchors uuid[] := '{}'::uuid[];
  v_change jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_found integer;
begin
  if jsonb_typeof(p_undo_step) is distinct from 'object' then
    raise exception 'record_entry_list: p_undo_step must be an object' using errcode = '22023';
  end if;
  begin
    v_step_id := (p_undo_step ->> 'id')::uuid;
  exception when others then
    raise exception 'record_entry_list: p_undo_step.id must be a uuid' using errcode = '22023';
  end;
  if v_step_id is null then
    raise exception 'record_entry_list: p_undo_step.id must be a uuid' using errcode = '22023';
  end if;

  -- D-WR-03: a replay of the action that already landed is success, before any row check.
  if exists (select 1 from public.undo_log u where u.id = v_step_id and u.owner_id = (select auth.uid())) then
    return jsonb_build_object('status', 'already-applied', 'undo_step_id', v_step_id);
  end if;

  if p_row_ids is null or cardinality(p_row_ids) not between 1 and 200 then
    raise exception 'record_entry_list: p_row_ids must hold 1 to 200 ids' using errcode = '22023';
  end if;
  if (select count(distinct x) from unnest(p_row_ids) x) <> cardinality(p_row_ids) then
    raise exception 'record_entry_list: p_row_ids must be unique' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 61 then
    raise exception 'record_entry_list: p_items must be an array of at most 61 items' using errcode = '22023';
  end if;

  -- Only rows this caller just inserted: live, own household, own row, untouched, not in a series.
  select count(*) into v_found
    from public.transactions t
   where t.id = any (p_row_ids)
     and t.deleted_at is null
     and t.household_id in (select public.user_household_ids())
     and t.created_by = (select auth.uid())
     and t.version = 1
     and t.recurring_series_id is null;
  if v_found <> cardinality(p_row_ids) then
    raise exception 'record_entry_list: every row must be a new row of the caller' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_item) is distinct from 'object' or jsonb_typeof(v_item -> 'series') is distinct from 'object' then
      raise exception 'record_entry_list: each item needs a series object' using errcode = '22023';
    end if;
    begin
      v_anchor := (v_item ->> 'anchor_transaction_id')::uuid;
    exception when others then
      raise exception 'record_entry_list: anchor_transaction_id must be a uuid' using errcode = '22023';
    end;
    if v_anchor is null or not (v_anchor = any (p_row_ids)) or v_anchor = any (v_anchors) then
      raise exception 'record_entry_list: each anchor must be one of p_row_ids, once' using errcode = '22023';
    end if;
    v_change := public.create_recurring_series(v_item -> 'series', v_anchor, '{}'::uuid[], null, true);
    if v_change ->> 'status' is distinct from 'applied' then
      raise exception 'record_entry_list: series % was not created (%)',
        v_item -> 'series' ->> 'id', v_change ->> 'status' using errcode = '22023';
    end if;
    v_anchors := v_anchors || v_anchor;
    v_changes := v_changes || jsonb_build_array(v_change);
  end loop;

  -- Plain rows first, in the caller's order (both legs of a transfer go together).
  select coalesce(jsonb_agg(jsonb_build_object(
           'entity', 'transactions', 'id', t.id, 'expectedVersion', t.version,
           'patch', jsonb_build_object('deleted_at', '$now')) order by o.ord), '[]'::jsonb)
    into v_ops
    from unnest(p_row_ids) with ordinality as o(id, ord)
    join public.transactions t on t.id = o.id
   where not (o.id = any (v_anchors));

  for v_change in select value from jsonb_array_elements(v_changes) loop
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

revoke execute on function public.record_entry_list(uuid[], jsonb, jsonb) from public, anon;
grant execute on function public.record_entry_list(uuid[], jsonb, jsonb) to authenticated;
