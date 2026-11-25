-- pgTAP: Phase 10.1 (D-14..D-17, SCN-06/07, SPL-03/05). set_split_by_item recomputes every share on the server from the items;
-- stale versions, settled and private lines, outsiders and bad items are refused; restore_line_split puts the previous split,
-- parts and item list back; shared_line_categories learns parts; the over-cap sum counts a part of a split line.
-- The six '-- case:' lines are read by src/engine/receipt/__tests__/itemShares.sqlParity.test.ts and checked against the
-- engine's itemShares: members A, B, C are the household in join order (letters stand for the user ids below).
-- Needs migration 20261127000400_split_by_item.sql (and every migration before it).
-- Run only on a local stack (supabase test db); never against the linked project.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(40);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create function public.t135_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
-- letters A..D stand for users 1..4
create function public.t135_u(p_text text) returns text language sql immutable as $$
  select replace(replace(replace(replace(p_text, '"A"', '"11111111-1111-1111-1111-111111111111"'), '"B"', '"22222222-2222-2222-2222-222222222222"'),
                 '"C"', '"33333333-3333-3333-3333-333333333333"'), '"D"', '"44444444-4444-4444-4444-444444444444"')
$$;
create function public.t135_ver(p_id text) returns int language sql security definer as $$
  select version from public.transactions where id = ('e1350000-0000-0000-0000-0000000000' || p_id)::uuid
$$;
create function public.t135_shares(p_id text) returns jsonb language sql security definer as $$
  select coalesce(jsonb_object_agg(s.member_id::text, -s.share) filter (where s.share <> 0), '{}'::jsonb)
    from public.transaction_splits s where s.transaction_id = ('e1350000-0000-0000-0000-0000000000' || p_id)::uuid
$$;
create function public.t135_case(p_line text, p_items jsonb, p_tax int, p_tip int, p_dis int, p_expected jsonb) returns boolean language plpgsql as $$
declare
  r jsonb;
  e jsonb := public.t135_u(p_expected::text)::jsonb;
begin
  r := public.set_split_by_item(('e1350000-0000-0000-0000-0000000000' || p_line)::uuid, public.t135_ver(p_line),
         public.t135_u(p_items::text)::jsonb, jsonb_build_object('tax', p_tax, 'tip', p_tip, 'discounts', p_dis), null);
  return (r ->> 'ok') = 'true' and public.t135_shares(p_line) = e and (r -> 'shares') = e;
end;
$$;
create temp table res (k text primary key, v jsonb);
grant all on res to authenticated;

-- B and C join A's household; D stays alone.
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight)
  select h.id, u, false, 50 from public.households h,
         (values ('22222222-2222-2222-2222-222222222222'::uuid), ('33333333-3333-3333-3333-333333333333'::uuid)) v(u)
   where h.owner_id = '11111111-1111-1111-1111-111111111111';

insert into public.categories (id, owner_id, name, color_key, monthly_cap) values
  ('c1350000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Eating out', 'plum', 2500),
  ('c1350000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B pets', 'green', null);
create temp table cats as
  select 'a_' || lower(builtin_key) as k, id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key is not null
  union all select 'b_' || lower(builtin_key), id from public.categories where owner_id = '22222222-2222-2222-2222-222222222222' and builtin_key is not null
  union all select 'a_eatout', 'c1350000-0000-0000-0000-000000000001'
  union all select 'b_pets', 'c1350000-0000-0000-0000-000000000002';
grant select on cats to authenticated;

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared)
  select 'a1350000-0000-0000-0000-000000000001', h.id, '11111111-1111-1111-1111-111111111111', 'Joint', 'checking', 'USD', 0, true
    from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111';
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared)
  select 'a1350000-0000-0000-0000-000000000002', h.id, '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false
    from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111';

-- Lines on the joint account are shared on arrival. Arguments: id suffix, account suffix, creator, amount, category key.
create function public.t135_line(p_id text, p_acct text, p_by text, p_amount bigint, p_cat text, p_date date default '2026-10-02') returns void language sql as $$
  insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, category_id)
  select ('e1350000-0000-0000-0000-0000000000' || p_id)::uuid, h.id, p_by::uuid,
         ('a1350000-0000-0000-0000-00000000000' || p_acct)::uuid, p_amount, 'USD', p_date, 'UTC', 'Line ' || p_id, 'paid',
         (select id from cats where k = p_cat)
    from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111'
$$;
select public.t135_line('01', '1', '11111111-1111-1111-1111-111111111111', -1500, 'a_groceries');
select public.t135_line('02', '1', '11111111-1111-1111-1111-111111111111', -2800, 'a_groceries');
select public.t135_line('03', '1', '11111111-1111-1111-1111-111111111111', -1001, 'a_groceries');
select public.t135_line('04', '1', '11111111-1111-1111-1111-111111111111', -1540, 'a_groceries');
select public.t135_line('05', '1', '11111111-1111-1111-1111-111111111111', -1550, 'a_groceries');
select public.t135_line('06', '1', '11111111-1111-1111-1111-111111111111', -1000, 'a_groceries');
select public.t135_line('07', '1', '11111111-1111-1111-1111-111111111111', -1500, 'a_groceries');
select public.t135_line('08', '1', '11111111-1111-1111-1111-111111111111', -1500, 'a_groceries');
select public.t135_line('09', '2', '11111111-1111-1111-1111-111111111111', -1500, 'a_groceries');
select public.t135_line('10', '1', '11111111-1111-1111-1111-111111111111', -5000, 'a_groceries', current_date);
select public.t135_line('12', '1', '22222222-2222-2222-2222-222222222222', -4000, 'b_groceries');

-- 1. Setup
select extensions.ok((select is_shared from public.transactions where id = 'e1350000-0000-0000-0000-000000000001')
  and not (select is_shared from public.transactions where id = 'e1350000-0000-0000-0000-000000000009')
  and (select household_amount from public.transactions where id = 'e1350000-0000-0000-0000-000000000001') = -1500,
  'setup: joint line shared with a household amount, personal line private');

set local role authenticated;
select public.t135_as('11111111-1111-1111-1111-111111111111');

-- 2-7. Six parity cases (the Jest test checks the same numbers against itemShares)
-- case: {"members":["A","B","C"],"items":[{"price":1000,"discount":0,"people":["A","B"]},{"price":500,"discount":0,"people":["A"]}],"tax":0,"tip":0,"discounts":0,"expected":{"A":1000,"B":500,"C":0}}
select extensions.ok(public.t135_case('01', '[{"price":1000,"discount":0,"people":["A","B"]},{"price":500,"discount":0,"people":["A"]}]'::jsonb, 0, 0, 0, '{"A":1000,"B":500}'::jsonb), 'case 1: even two people, no tax');
-- case: {"members":["A","B","C"],"items":[{"price":1200,"discount":0,"people":["A","B"]},{"price":900,"discount":0,"people":["B","C"]},{"price":500,"discount":50,"people":["A"]}],"tax":250,"tip":0,"discounts":0,"expected":{"A":1153,"B":1153,"C":494}}
select extensions.ok(public.t135_case('02', '[{"price":1200,"discount":0,"people":["A","B"]},{"price":900,"discount":0,"people":["B","C"]},{"price":500,"discount":50,"people":["A"]}]'::jsonb, 250, 0, 0, '{"A":1153,"B":1153,"C":494}'::jsonb), 'case 2: three items, mixed people, tax shared by largest remainder');
-- case: {"members":["A","B","C"],"items":[{"price":1001,"discount":0,"people":["B","A"]}],"tax":0,"tip":0,"discounts":0,"expected":{"A":500,"B":501,"C":0}}
select extensions.ok(public.t135_case('03', '[{"price":1001,"discount":0,"people":["B","A"]}]'::jsonb, 0, 0, 0, '{"A":500,"B":501}'::jsonb), 'case 3: odd cent goes to the first person of the item');
-- case: {"members":["A","B","C"],"items":[{"price":800,"discount":0,"people":["A"]},{"price":600,"discount":0,"people":["B"]}],"tax":0,"tip":140,"discounts":0,"expected":{"A":880,"B":660,"C":0}}
select extensions.ok(public.t135_case('04', '[{"price":800,"discount":0,"people":["A"]},{"price":600,"discount":0,"people":["B"]}]'::jsonb, 0, 140, 0, '{"A":880,"B":660}'::jsonb), 'case 4: tip follows items, a person with no items is left out');
-- case: {"members":["A","B","C"],"items":[{"price":1000,"discount":0,"people":["A","B"]},{"price":700,"discount":0,"people":["C"]}],"tax":50,"tip":0,"discounts":200,"expected":{"A":456,"B":456,"C":638}}
select extensions.ok(public.t135_case('05', '[{"price":1000,"discount":0,"people":["A","B"]},{"price":700,"discount":0,"people":["C"]}]'::jsonb, 50, 0, 200, '{"A":456,"B":456,"C":638}'::jsonb), 'case 5: discounts larger than tax and tip');
-- case: {"members":["A","B","C"],"items":[{"price":300,"discount":0,"people":["A"]},{"price":300,"discount":0,"people":["B"]},{"price":300,"discount":0,"people":["C"]}],"tax":100,"tip":0,"discounts":0,"expected":{"A":334,"B":333,"C":333}}
select extensions.ok(public.t135_case('06', '[{"price":300,"discount":0,"people":["A"]},{"price":300,"discount":0,"people":["B"]},{"price":300,"discount":0,"people":["C"]}]'::jsonb, 100, 0, 0, '{"A":334,"B":333,"C":333}'::jsonb), 'case 6: remainder tie goes to the lowest join index');

-- 8. The split is stored as a hand-set amount rule, and the total adds up to the line
select extensions.is((select split_rule || ':' || split_manual::text from public.transactions where id = 'e1350000-0000-0000-0000-000000000002'),
  'amount:true', 'stored as the amount rule set by hand');
select extensions.is((select -sum(share) from public.transaction_splits where transaction_id = 'e1350000-0000-0000-0000-000000000002'), 2800::numeric,
  'transaction_splits adds up to the line');

-- 10-13. Refusals on line 07 (before the line is touched)
insert into res select 'stale', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', 99,
  public.t135_u('[{"price":1500,"discount":0,"people":["A"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' from res where k = 'stale'), 'version_conflict', 'a stale version is refused');
select extensions.ok((select v ? 'current_version' and v ? 'updated_by' from res where k = 'stale'), 'the refusal names the current version and who changed it');
insert into res select 'short', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  public.t135_u('[{"price":1000,"discount":0,"people":["A"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' || ':' || (v ->> 'diff') from res where k = 'short'), 'items_not_total:-500', 'items that do not add up to the line are refused with the gap');
insert into res select 'outsider', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  public.t135_u('[{"price":1500,"discount":0,"people":["D"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' || ':' || (v ->> 'detail') from res where k = 'outsider'), 'items_invalid:unknown_member', 'a person outside the household is refused');
insert into res select 'noitems', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'), '[]'::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' from res where k = 'noitems'), 'no_items', 'an empty item list is refused');
insert into res select 'badprice', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  public.t135_u('[{"price":0,"discount":0,"people":["A"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' || ':' || (v ->> 'detail') from res where k = 'badprice'), 'items_invalid:bad_price', 'a zero price is refused');
insert into res select 'emptyitem', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  '[{"price":1500,"discount":0,"people":[]}]'::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'detail' from res where k = 'emptyitem'), 'empty_item', 'an item with nobody on it is refused');
insert into res select 'toomany', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  (select jsonb_agg(jsonb_build_object('price', 1, 'discount', 0, 'people', jsonb_build_array('11111111-1111-1111-1111-111111111111'))) from generate_series(1, 201)),
  '{}'::jsonb, null);
select extensions.is((select v ->> 'detail' from res where k = 'toomany'), 'too_many', 'more than 200 items is refused');
select extensions.is((select version from public.transactions where id = 'e1350000-0000-0000-0000-000000000007'), 1, 'a refusal writes nothing');

-- 19-26. Success with parts: item names, discount, categories; event; before for Undo
insert into res select 'ok', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  public.t135_u(jsonb_build_array(
    jsonb_build_object('name', 'Milk', 'price', 1200, 'discount', 200, 'c', (select id from cats where k = 'a_groceries'), 'people', '["A","B"]'::jsonb),
    jsonb_build_object('name', 'Fries', 'price', 500, 'discount', 0, 'c', 'c1350000-0000-0000-0000-000000000001', 'people', '["A"]'::jsonb))::text)::jsonb,
  '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('c', (select id from cats where k = 'a_groceries'), 'a', -1000), jsonb_build_object('c', 'c1350000-0000-0000-0000-000000000001', 'a', -500)),
  null, 'Corner shop', '2026-11-02');
select extensions.is((select v ->> 'ok' from res where k = 'ok'), 'true', 'a split by item with parts is accepted');
select extensions.is((select v -> 'shares' from res where k = 'ok'), (public.t135_u('{"A":1000,"B":500}'))::jsonb, 'shares come from the items, with the item discount taken off');
select extensions.is(public.t135_shares('07'), (public.t135_u('{"A":1000,"B":500}'))::jsonb, 'transaction_splits holds those shares');
select extensions.is((select (item_split ->> 'by')::uuid from public.transactions where id = 'e1350000-0000-0000-0000-000000000007'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'item_split records who split it');
select extensions.is((select item_split ->> 'store' from public.transactions where id = 'e1350000-0000-0000-0000-000000000007'), 'Corner shop', 'item_split keeps the store');
select extensions.is((select jsonb_array_length(category_parts) from public.transactions where id = 'e1350000-0000-0000-0000-000000000007'), 2, 'the category parts are written in the same step');
select extensions.is((select count(*)::int from public.household_events where kind = 'split_changed' and ref_id = 'e1350000-0000-0000-0000-000000000007'
                         and (params ->> 'by_item') = 'true' and params ? 'before' and params ? 'after'
                         and actor_id = '11111111-1111-1111-1111-111111111111'), 1, 'one household event names who split it, with before and after');
select extensions.is((select v #>> '{before,rule}' from res where k = 'ok'), 'even', 'before holds the previous rule for Undo');

-- 27-29. Restore (Undo) puts back rule, shares, parts and the item list
insert into res select 'restore', public.restore_line_split('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'), (select v -> 'before' from res where k = 'ok'));
select extensions.is((select v ->> 'ok' from res where k = 'restore'), 'true', 'restore is accepted');
select extensions.ok((select t.split_rule = 'even' and not t.split_manual and t.category_parts is null and t.item_split is null
                             and t.category_id = (select id from cats where k = 'a_groceries')
                        from public.transactions t where t.id = 'e1350000-0000-0000-0000-000000000007'), 'rule, manual flag, parts and item list are back');
select extensions.is(public.t135_shares('07'), (public.t135_u('{"A":500,"B":500,"C":500}'))::jsonb, 'the previous even split (all three members) is back');

-- 30. A later hand edit of the parts ends the item link
insert into res select 'again', public.set_split_by_item('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  public.t135_u('[{"price":1500,"discount":0,"people":["A","B"]}]')::jsonb, '{}'::jsonb, null);
select public.set_category_parts('e1350000-0000-0000-0000-000000000007', public.t135_ver('07'),
  jsonb_build_array(jsonb_build_object('c', (select id from cats where k = 'a_groceries'), 'a', -1000), jsonb_build_object('c', (select id from cats where k = 'a_eatout'), 'a', -500)));
select extensions.ok((select item_split is null and category_parts is not null from public.transactions where id = 'e1350000-0000-0000-0000-000000000007'), 'a later parts edit clears item_split');

-- 31. A private line cannot be split by item; an outsider cannot see the line
insert into res select 'private', public.set_split_by_item('e1350000-0000-0000-0000-000000000009', public.t135_ver('09'),
  public.t135_u('[{"price":1500,"discount":0,"people":["A"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' from res where k = 'private'), 'not_shared', 'a private line is refused');
select public.t135_as('44444444-4444-4444-4444-444444444444');
insert into res select 'ghost', public.set_split_by_item('e1350000-0000-0000-0000-000000000008', 1,
  public.t135_u('[{"price":1500,"discount":0,"people":["A"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' from res where k = 'ghost'), 'not_found', 'an outsider gets not_found');
select public.t135_as('11111111-1111-1111-1111-111111111111');

-- 33. A settled line is locked, for the split and for Undo
reset role;
create or replace function public.hh_line_locked(p_tx uuid) returns boolean language sql as $$ select true $$;
set local role authenticated;
select public.t135_as('11111111-1111-1111-1111-111111111111');
insert into res select 'locked', public.set_split_by_item('e1350000-0000-0000-0000-000000000008', public.t135_ver('08'),
  public.t135_u('[{"price":1500,"discount":0,"people":["A"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'reason' from res where k = 'locked'), 'line_locked', 'a settled line is refused');
insert into res select 'lockedr', public.restore_line_split('e1350000-0000-0000-0000-000000000008', public.t135_ver('08'), '{}'::jsonb);
select extensions.is((select v ->> 'reason' from res where k = 'lockedr'), 'line_locked', 'a settled line cannot be restored over');
reset role;
create or replace function public.hh_line_locked(p_tx uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.settlement_lines l
      join public.settlements s on s.id = l.settlement_id
     where l.transaction_id = p_tx and l.live
       and (s.status in ('confirmed', 'written_off') or (s.status = 'pending' and now() < s.expires_at)))
$$;
set local role authenticated;
select public.t135_as('11111111-1111-1111-1111-111111111111');

-- 35. Restore refuses a before that is not what set_split_by_item returned
insert into res select 'badbefore', public.restore_line_split('e1350000-0000-0000-0000-000000000008', public.t135_ver('08'), '{"x":1}'::jsonb);
select extensions.is((select v ->> 'reason' from res where k = 'badbefore'), 'before_invalid', 'a malformed before is refused');

-- 36-37. The partner who did not create the line can split it, and A sees the category of its parts
select public.t135_as('22222222-2222-2222-2222-222222222222');
insert into res select 'bsplit', public.set_split_by_item('e1350000-0000-0000-0000-000000000012', public.t135_ver('12'),
  public.t135_u('[{"price":4000,"discount":0,"people":["A","B"]}]')::jsonb, '{}'::jsonb, null);
select extensions.is((select v ->> 'ok' from res where k = 'bsplit'), 'true', 'a partner can split a shared line');
select public.set_category_parts('e1350000-0000-0000-0000-000000000012', public.t135_ver('12'),
  jsonb_build_array(jsonb_build_object('c', (select id from cats where k = 'b_groceries'), 'a', -3000), jsonb_build_object('c', 'c1350000-0000-0000-0000-000000000002', 'a', -1000)));
select public.t135_as('11111111-1111-1111-1111-111111111111');
select extensions.ok(exists (select 1 from public.shared_line_categories((select household_id from public.transactions where id = 'e1350000-0000-0000-0000-000000000012'))
                              where id = 'c1350000-0000-0000-0000-000000000002'), 'a partner category used only inside parts of a shared line comes back');

-- 38-40. Over cap counts the capped category''s part of a split line (Eating out cap 2500): a -5000 line split Groceries -3000 /
-- Eating out -2000 adds 2000 to Eating out; a further plain Eating out line of -1000 then crosses the cap by 500.
reset role;
insert into public.alert_settings (user_id, kind, enabled) values ('11111111-1111-1111-1111-111111111111', 'over_cap', true);
set local role authenticated;
select public.t135_as('11111111-1111-1111-1111-111111111111');
select public.set_category_parts('e1350000-0000-0000-0000-000000000010', public.t135_ver('10'),
  jsonb_build_array(jsonb_build_object('c', (select id from cats where k = 'a_groceries'), 'a', -3000), jsonb_build_object('c', 'c1350000-0000-0000-0000-000000000001', 'a', -2000)));
reset role;
select extensions.is((select count(*)::int from public.alert_log where kind = 'over_cap'), 0, 'over cap: a part of 2000 is under the cap of 2500');
select public.t135_line('11', '1', '11111111-1111-1111-1111-111111111111', -1000, 'a_groceries', current_date);
update public.transactions set category_id = 'c1350000-0000-0000-0000-000000000001' where id = 'e1350000-0000-0000-0000-000000000011';
select extensions.is((select params from public.alert_log where kind = 'over_cap'),
  '{"currency": "USD", "category": "Eating out", "over_minor": 500}'::jsonb, 'over cap: the part counts, so a further Eating out line crosses the cap');
select extensions.is((select count(*)::int from public.alert_log where kind = 'over_cap'), 1, 'over cap: raised once');

select * from extensions.finish();
rollback;
