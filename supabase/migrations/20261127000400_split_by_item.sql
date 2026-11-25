-- Phase 10.1 (D-14..D-17, SCN-06/07, SPL-03/05): split by item on a shared line; server category sums read parts.
-- Proven by supabase/tests/database/135_split_by_item.test.sql (and the Jest parity test that reads its '-- case:' lines).
--
-- Adds hh_item_shares (the SQL mirror of src/engine/receipt/itemShares.ts), set_split_by_item, restore_line_split.
-- Re-issues shared_line_categories (partners see the categories of every part of a shared split line) and
-- alerts_on_transaction (the over-cap sum counts parts through line_category_amounts; Phase 10 migration 20261126000500).
-- Server sums by category_id found by grepping every migration: only the over-cap evaluation in alerts_on_transaction.
-- large_txn / partner_large show one category name for a line and keep transactions.category_id (= largest part).
--
-- Default split rule of a split line: hh_resolve_default_rule is unchanged. It reads transactions.category_id, which is
-- always the largest part's category (10.1-05), so the largest part decides the default split rule.
--
-- Tie rule (same as the engine): the lowest index gets the odd cent, in the item's people order within an item, and in
-- household member join order (created_at, user_id) for the extras. Receipt-level discounts and tip/tax follow each
-- person's item totals; a negative extra splits on its magnitude.

-- 1. The share maths. Returns {ok, mem, totals, net_sum, extra} or {ok:false, reason, detail}. Not callable by clients.
create or replace function public.hh_item_shares(p_household uuid, p_items jsonb, p_extras jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_int constant text := '^[0-9]{1,12}$';
  mem uuid[];
  n integer;
  totals bigint[];
  e record;
  p record;
  v_price bigint;
  v_disc bigint;
  v_net bigint;
  v_net_sum bigint := 0;
  v_k integer;
  v_alloc bigint[];
  v_idx integer;
  v_tax bigint;
  v_tip bigint;
  v_dis bigint;
  v_extra bigint;
  v_ex bigint[];
  i integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_items');
  end if;
  if jsonb_array_length(p_items) > 200 then
    return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'too_many');
  end if;
  if p_extras is null or jsonb_typeof(p_extras) <> 'object' then
    return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'bad_price');
  end if;
  for p in select k, p_extras -> k as v from unnest(array['tax', 'tip', 'discounts']) k loop
    if p.v is not null and (jsonb_typeof(p.v) <> 'number' or p.v::text !~ c_int) then
      return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'bad_price');
    end if;
  end loop;
  v_tax := coalesce((p_extras ->> 'tax')::bigint, 0);
  v_tip := coalesce((p_extras ->> 'tip')::bigint, 0);
  v_dis := coalesce((p_extras ->> 'discounts')::bigint, 0);

  select array_agg(m.user_id order by m.created_at, m.user_id) into mem
    from public.household_members m where m.household_id = p_household;
  n := coalesce(array_length(mem, 1), 0);
  if n = 0 then
    return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'unknown_member');
  end if;
  totals := array_fill(0::bigint, array[n]);

  for e in select x.value as item from jsonb_array_elements(p_items) x loop
    if jsonb_typeof(e.item) <> 'object' then
      return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'bad_price');
    end if;
    if jsonb_typeof(e.item -> 'price') is distinct from 'number' or (e.item -> 'price')::text !~ c_int then
      return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'bad_price');
    end if;
    v_price := (e.item ->> 'price')::bigint;
    if e.item -> 'discount' is null or jsonb_typeof(e.item -> 'discount') = 'null' then
      v_disc := 0;
    elsif jsonb_typeof(e.item -> 'discount') <> 'number' or (e.item -> 'discount')::text !~ c_int then
      return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'bad_price');
    else
      v_disc := (e.item ->> 'discount')::bigint;
    end if;
    if v_price <= 0 or v_disc > v_price then
      return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'bad_price');
    end if;
    if jsonb_typeof(e.item -> 'people') is distinct from 'array' or jsonb_array_length(e.item -> 'people') = 0 then
      return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'empty_item');
    end if;
    v_k := jsonb_array_length(e.item -> 'people');
    v_net := v_price - v_disc;
    v_net_sum := v_net_sum + v_net;
    v_alloc := public.hh_allocate(v_net, array_fill(1, array[v_k]));
    i := 0;
    for p in select x.value as who from jsonb_array_elements(e.item -> 'people') x loop
      i := i + 1;
      if jsonb_typeof(p.who) <> 'string' or (p.who #>> '{}') !~* c_uuid then
        return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'unknown_member');
      end if;
      v_idx := array_position(mem, (p.who #>> '{}')::uuid);
      if v_idx is null then
        return jsonb_build_object('ok', false, 'reason', 'items_invalid', 'detail', 'unknown_member');
      end if;
      totals[v_idx] := totals[v_idx] + v_alloc[i];
    end loop;
  end loop;

  v_extra := v_tax + v_tip - v_dis;
  if v_extra <> 0 then
    if (select coalesce(sum(t), 0) from unnest(totals) t) = 0 then
      return jsonb_build_object('ok', false, 'reason', 'no_items');
    end if;
    v_ex := public.parts_allocate(v_extra, totals::numeric[]);
    for i in 1..n loop
      totals[i] := totals[i] + v_ex[i];
    end loop;
  end if;
  return jsonb_build_object('ok', true, 'mem', to_jsonb(mem), 'totals', to_jsonb(totals),
                            'net_sum', v_net_sum, 'extra', v_extra);
end;
$$;
revoke execute on function public.hh_item_shares(uuid, jsonb, jsonb) from public, anon, authenticated;

-- 2. set_split_by_item ----------------------------------------------------------------------------------------------
create or replace function public.set_split_by_item(
  p_id uuid, p_expected_version int, p_items jsonb, p_extras jsonb, p_parts jsonb,
  p_category uuid default null, p_store text default null, p_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  t public.transactions%rowtype;
  v_calc jsonb;
  v_mem uuid[];
  v_totals bigint[];
  v_hs bigint[];
  v_amounts jsonb := '{}'::jsonb;
  v_shares jsonb := '{}'::jsonb;
  v_plan jsonb;
  v_mapped jsonb;
  v_cat uuid;
  v_reason text;
  v_before jsonb;
  v_before_split jsonb;
  v_items jsonb;
  v_diff bigint;
  i integer;
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

  v_calc := public.hh_item_shares(t.household_id, p_items, p_extras);
  if not (v_calc ->> 'ok')::boolean then return v_calc; end if;
  v_diff := (v_calc ->> 'net_sum')::bigint + (v_calc ->> 'extra')::bigint - abs(t.original_amount);
  if v_diff <> 0 then
    return jsonb_build_object('ok', false, 'reason', 'items_not_total', 'diff', v_diff);
  end if;
  if t.household_amount is null then
    return jsonb_build_object('ok', false, 'reason', 'rate_unavailable');
  end if;
  select array_agg(x::uuid order by o), array_agg(x2::bigint order by o)
    into v_mem, v_totals
    from jsonb_array_elements_text(v_calc -> 'mem') with ordinality a(x, o)
    join jsonb_array_elements_text(v_calc -> 'totals') with ordinality b(x2, o2) on o2 = o;

  begin
    v_items := (select jsonb_agg(case when jsonb_typeof(e.item -> 'c') = 'string'
                         then jsonb_set(e.item, '{c}', to_jsonb(public.map_category_to_creator((e.item ->> 'c')::uuid, t.created_by, uid)::text))
                         else e.item end order by e.ord)
                  from jsonb_array_elements(p_items) with ordinality e(item, ord));
    if p_parts is not null then
      v_mapped := public.map_parts_to_creator(p_parts, t.created_by, uid);
      v_reason := public.parts_invalid_reason(v_mapped, t.original_amount, false);
      if v_reason is not null then
        return jsonb_build_object('ok', false, 'reason', 'parts_invalid', 'detail', v_reason);
      end if;
      if t.transfer_id is not null and exists (
        select 1 from jsonb_array_elements(v_mapped) e
          join public.categories c on c.id = (e ->> 'c')::uuid where c.builtin_key = 'Transfer') then
        return jsonb_build_object('ok', false, 'reason', 'transfer_part_on_transfer_line');
      end if;
    elsif p_category is not null then
      v_cat := public.map_category_to_creator(p_category, t.created_by, uid);
    else
      v_cat := t.category_id;  -- no category given: the line keeps the one it has
    end if;
  exception when sqlstate 'PT001' then
    return jsonb_build_object('ok', false, 'reason', 'category_not_owned');
  end;

  -- household-currency shares: line totals spread by largest remainder (equal to the totals when the currencies match)
  v_hs := public.parts_allocate(t.household_amount, v_totals::numeric[]);
  for i in 1..cardinality(v_mem) loop
    if v_totals[i] <> 0 then
      v_amounts := v_amounts || jsonb_build_object(v_mem[i]::text, v_hs[i]);
      v_shares := v_shares || jsonb_build_object(v_mem[i]::text, v_totals[i]);
    end if;
  end loop;
  begin
    v_plan := public.hh_split_plan(t.household_id, coalesce(t.paid_by, t.created_by), t.household_amount, 'amount', null, v_amounts);
  exception when sqlstate 'HH001' then
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;

  v_before_split := public.hh_split_json(t.id);
  v_before := jsonb_build_object('split', v_before_split, 'rule', t.split_rule, 'manual', t.split_manual,
                                 'parts', t.category_parts, 'category_id', t.category_id, 'item_split', t.item_split);
  perform set_config('fincwin.household_rpc', 'on', true);
  perform set_config('fincwin.item_split_rpc', 'on', true);
  begin
    if p_parts is not null then
      update public.transactions
         set split_rule = 'amount', split_manual = true, category_parts = v_mapped,
             item_split = jsonb_build_object('store', p_store, 'date', p_date, 'items', v_items, 'extras', p_extras,
                                             'by', uid, 'at', now())
       where id = t.id;
    else
      update public.transactions
         set split_rule = 'amount', split_manual = true, category_parts = null, category_id = v_cat,
             item_split = jsonb_build_object('store', p_store, 'date', p_date, 'items', v_items, 'extras', p_extras,
                                             'by', uid, 'at', now())
       where id = t.id;
    end if;
  exception when sqlstate 'PT001' then
    perform set_config('fincwin.household_rpc', '', true);
    perform set_config('fincwin.item_split_rpc', '', true);
    return jsonb_build_object('ok', false, 'reason', 'parts_invalid', 'detail', sqlerrm);
  end;
  perform public.hh_store_splits(t.id, t.household_id, v_plan);
  perform set_config('fincwin.household_rpc', '', true);
  perform set_config('fincwin.item_split_rpc', '', true);
  perform public.hh_event(t.household_id, 'split_changed', null, t.id, null,
    jsonb_build_object('by_item', true, 'before', v_before_split, 'after', public.hh_split_json(t.id)));
  return jsonb_build_object('ok', true, 'before', v_before, 'version', t.version + 1, 'shares', v_shares);
end;
$$;
revoke execute on function public.set_split_by_item(uuid, int, jsonb, jsonb, jsonb, uuid, text, date) from public, anon;
grant execute on function public.set_split_by_item(uuid, int, jsonb, jsonb, jsonb, uuid, text, date) to authenticated;

-- 3. restore_line_split: Undo of set_split_by_item (the "before" it returned) ------------------------------------------
create or replace function public.restore_line_split(p_id uuid, p_expected_version int, p_before jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := public.hh_uid();
  c_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  t public.transactions%rowtype;
  v_split jsonb;
  v_rule text;
  v_parts jsonb;
  v_item jsonb;
  v_cat uuid;
  v_manual boolean;
  v_participants uuid[];
  v_amounts jsonb;
  v_plan jsonb;
  v_reason text;
  v_before_split jsonb;
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

  if p_before is null or jsonb_typeof(p_before) <> 'object' or jsonb_typeof(p_before -> 'split') is distinct from 'object'
     or jsonb_typeof(p_before -> 'manual') is distinct from 'boolean'
     or jsonb_typeof(p_before #> '{split,participants}') is distinct from 'array'
     or jsonb_typeof(p_before #> '{split,shares}') is distinct from 'object' then
    return jsonb_build_object('ok', false, 'reason', 'before_invalid');
  end if;
  v_split := p_before -> 'split';
  v_rule := v_split ->> 'rule';
  v_manual := (p_before ->> 'manual')::boolean;
  v_parts := nullif(p_before -> 'parts', 'null'::jsonb);
  v_item := nullif(p_before -> 'item_split', 'null'::jsonb);
  if p_before ->> 'category_id' is not null and (p_before ->> 'category_id') !~* c_uuid then
    return jsonb_build_object('ok', false, 'reason', 'before_invalid');
  end if;
  v_cat := (p_before ->> 'category_id')::uuid;
  if v_parts is not null then
    v_reason := public.parts_invalid_reason(v_parts, t.original_amount, true);
    if v_reason is not null then
      return jsonb_build_object('ok', false, 'reason', 'parts_invalid', 'detail', v_reason);
    end if;
  end if;
  if exists (select 1 from jsonb_array_elements_text(v_split -> 'participants') x where x !~* c_uuid) then
    return jsonb_build_object('ok', false, 'reason', 'before_invalid');
  end if;
  v_participants := array(select x::uuid from jsonb_array_elements_text(v_split -> 'participants') x);
  v_amounts := case when v_rule = 'amount' then v_split -> 'shares' else null end;
  begin
    v_plan := public.hh_split_plan(t.household_id, coalesce(t.paid_by, t.created_by), t.household_amount, v_rule,
                                   case when v_rule = 'amount' then null else v_participants end, v_amounts);
  exception when sqlstate 'HH001' then
    return jsonb_build_object('ok', false, 'reason', sqlerrm);
  end;

  v_before_split := public.hh_split_json(t.id);
  perform set_config('fincwin.household_rpc', 'on', true);
  perform set_config('fincwin.item_split_rpc', 'on', true);
  begin
    update public.transactions
       set split_rule = v_rule, split_manual = v_manual, category_parts = v_parts, category_id = v_cat, item_split = v_item
     where id = t.id;
  exception
    when sqlstate 'PT001' then
      perform set_config('fincwin.household_rpc', '', true);
      perform set_config('fincwin.item_split_rpc', '', true);
      return jsonb_build_object('ok', false, 'reason', 'parts_invalid', 'detail', sqlerrm);
    when foreign_key_violation then
      perform set_config('fincwin.household_rpc', '', true);
      perform set_config('fincwin.item_split_rpc', '', true);
      return jsonb_build_object('ok', false, 'reason', 'category_not_owned');
  end;
  perform public.hh_store_splits(t.id, t.household_id, v_plan);
  perform set_config('fincwin.household_rpc', '', true);
  perform set_config('fincwin.item_split_rpc', '', true);
  perform public.hh_event(t.household_id, 'split_changed', null, t.id, null,
    jsonb_build_object('undo', true, 'by_item', true, 'before', v_before_split, 'after', public.hh_split_json(t.id)));
  return jsonb_build_object('ok', true, 'version', t.version + 1);
end;
$$;
revoke execute on function public.restore_line_split(uuid, int, jsonb) from public, anon;
grant execute on function public.restore_line_split(uuid, int, jsonb) to authenticated;

-- 4. shared_line_categories: copy of 20261125001000 plus the categories used inside parts of a live shared line ----------
create or replace function public.shared_line_categories(p_household uuid)
returns table (id uuid, owner_id uuid, builtin_key text, name text, color_key text, icon_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.owner_id, c.builtin_key::text, c.name, c.color_key::text, c.icon_key::text
    from public.categories c
   where p_household in (select public.user_household_ids())
     and c.owner_id <> (select auth.uid())
     and (exists (select 1 from public.transactions t
                   where t.category_id = c.id
                     and t.household_id = p_household
                     and t.is_shared
                     and t.deleted_at is null)
          or exists (select 1 from public.transactions t2, jsonb_array_elements(t2.category_parts) p
                      where t2.category_parts is not null
                        and (p ->> 'c') = c.id::text
                        and t2.household_id = p_household
                        and t2.is_shared
                        and t2.deleted_at is null)
          or exists (select 1 from public.recurring_series s
                      where s.category_id = c.id
                        and s.household_id = p_household
                        and s.is_shared
                        and s.deleted_at is null))
$$;
revoke execute on function public.shared_line_categories(uuid) from public, anon;
grant execute on function public.shared_line_categories(uuid) to authenticated;

-- 5. alerts_on_transaction: copy of 20261126000500 with 5a (over cap) reading parts (marked 10.1) -------------------------
create or replace function public.alerts_on_transaction()
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
  v_pc uuid;  -- 10.1
begin
  -- Skip rules (T-10-15-04, T-10-15-06): cheap early return before any lookup.
  if new.deleted_at is not null or new.import_batch_id is not null or new.is_sample or new.transfer_id is not null
     or new.is_settlement or new.status <> 'paid' or new.local_date < current_date - 2 or new.created_by is null then
    return null;
  end if;

  select coalesce(c.name, c.builtin_key) into v_cat from public.categories c where c.id = new.category_id;

  -- 5a. Over cap: the category owner's own cap, in their home currency, crossed by this row. 10.1 (D-04): a line with category
  -- parts counts toward each part's category by that part's share (line_category_amounts); one check per category in the row.
  if new.original_amount < 0 then
    for v_pc in select distinct a.category_id from public.line_category_amounts(new.id, new.original_amount) a
                 where a.category_id is not null loop
      select c.owner_id, c.monthly_cap, coalesce(c.name, c.builtin_key) as nm into v_cat_row from public.categories c
       where c.id = v_pc and not c.is_system and c.monthly_cap is not null;
      if found then
        select * into s from public.alert_setting(v_cat_row.owner_id, 'over_cap');
        if s.enabled then
          select p.home_currency into v_hc from public.profiles p where p.id = v_cat_row.owner_id;
          if v_hc is not null then
            v_month_start := date_trunc('month', new.local_date)::date;
            v_this := case when new.home_currency = v_hc and new.home_amount is not null then new.home_amount
                           when new.original_currency = v_hc then new.original_amount end;
            if v_this is not null then
              select sum(q.amount) into v_this from public.line_category_amounts(new.id, v_this) q where q.category_id = v_pc;
            end if;
            if v_this is not null and v_this < 0 then
              select coalesce(sum(-a.amt), 0) into v_total from (
                select case when t.home_currency = v_hc and t.home_amount is not null then t.home_amount
                            when t.original_currency = v_hc then t.original_amount end as amt
                  from public.transactions_active t
                 where t.category_id = v_pc and t.category_parts is null and t.status = 'paid' and t.transfer_id is null and not t.is_settlement
                 and not t.is_sample and t.original_amount < 0
                 and t.local_date >= v_month_start and t.local_date < (v_month_start + interval '1 month')::date
                union all
                select p2.amount
                  from (select t.id as id, case when t.home_currency = v_hc and t.home_amount is not null then t.home_amount
                                                when t.original_currency = v_hc then t.original_amount end as amt
                          from public.transactions_active t
                         where t.category_parts is not null
                           and t.category_parts @> jsonb_build_array(jsonb_build_object('c', v_pc::text))
                           and t.status = 'paid' and t.transfer_id is null and not t.is_settlement
                 and not t.is_sample and t.original_amount < 0
                 and t.local_date >= v_month_start and t.local_date < (v_month_start + interval '1 month')::date) h
                  cross join lateral public.line_category_amounts(h.id, h.amt) p2
                 where h.amt is not null and p2.category_id = v_pc
              ) a where a.amt < 0;
              if v_total > v_cat_row.monthly_cap and v_total + v_this <= v_cat_row.monthly_cap then
                perform public.raise_alert(v_cat_row.owner_id, 'over_cap',
                  jsonb_build_object('category', v_cat_row.nm, 'over_minor', v_total - v_cat_row.monthly_cap, 'currency', v_hc),
                  'categories', v_pc,
                  'cap:' || v_pc || ':' || to_char(new.local_date, 'YYYY-MM') || ':' || v_cat_row.owner_id);
              end if;
            end if;
          end if;
        end if;
      end if;
    end loop;
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
drop trigger if exists alerts_on_transaction on public.transactions;
create trigger alerts_on_transaction
  after insert or update of status, original_amount, home_amount, household_amount, category_id, category_parts, deleted_at
  on public.transactions
  for each row execute function public.alerts_on_transaction();
