-- pgTAP: Phase 10.1 (D-01..D-04, SPL-01/02/05/06). Category parts: the guard trigger and set_category_parts re-check the parts with the
-- engine's rules, category_id follows the largest part, a total edit leaves a gap, partner categories map to the creator's,
-- a category delete turns its parts into Uncategorised, Undo can patch category_parts, line_category_amounts mirrors the
-- engine's scaleParts, and a hand edit ends the item link (item_split).
-- Needs migration 20261127000100_category_parts.sql (and every Phase 8 household migration before it).
-- Parity cases below are the same as src/engine/parts/__tests__/scaleParts.test.ts and split/__tests__/allocateWithZeros.test.ts.
-- Run only on a local stack (supabase test db); never against the linked project.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(51);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 3) n;

create function public.t131_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t131_p(c uuid, a bigint) returns jsonb language sql as $$
  select jsonb_build_object('c', c, 'a', a)
$$;

-- B (partner) joins A's household; C (outsider) keeps their own.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight)
  select h.id, '22222222-2222-2222-2222-222222222222', false, 50 from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111';

insert into public.categories (id, owner_id, name, color_key) values
  ('c1310000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pets', 'plum'),
  ('c1310000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B pets', 'green');

create temp table cats as
  select 'a_' || lower(builtin_key) as k, id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key is not null
  union all select 'b_' || lower(builtin_key), id from public.categories where owner_id = '22222222-2222-2222-2222-222222222222' and builtin_key is not null
  union all select 'c_' || lower(builtin_key), id from public.categories where owner_id = '33333333-3333-3333-3333-333333333333' and builtin_key is not null
  union all select 'a_pets', 'c1310000-0000-0000-0000-000000000001'
  union all select 'b_pets', 'c1310000-0000-0000-0000-000000000002';
grant select on cats to authenticated;
create temp table res (k text primary key, v jsonb);
grant all on res to authenticated;

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared)
  select 'a1310000-0000-0000-0000-000000000001', h.id, '11111111-1111-1111-1111-111111111111', 'A joint', 'checking', 'USD', 0, true from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111';
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared)
  select 'a1310000-0000-0000-0000-000000000002', h.id, '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111';

-- Lines (all by A): odd numbers private on the personal account, shared ones on the joint account.
create function public.t131_line(p_id text, p_acct text, p_cat text, p_transfer uuid default null) returns void language sql as $$
  insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, category_id, transfer_id)
  select ('e1310000-0000-0000-0000-0000000000' || p_id)::uuid, h.id, '11111111-1111-1111-1111-111111111111',
         ('a1310000-0000-0000-0000-00000000000' || p_acct)::uuid, -5000, 'USD', '2026-11-02', 'UTC', 'Line ' || p_id, 'paid',
         (select id from cats where k = p_cat), p_transfer
    from public.households h where h.owner_id = '11111111-1111-1111-1111-111111111111'
$$;
select public.t131_line('01', '2', 'a_housing');
select public.t131_line('02', '1', 'a_groceries');
select public.t131_line('03', '2', 'a_housing', 'd1310000-0000-0000-0000-000000000001');
select public.t131_line('04', '2', 'a_housing');
select public.t131_line('05', '2', 'a_pets');
select public.t131_line('06', '2', 'a_housing');
select public.t131_line('07', '2', 'a_housing');
select public.t131_line('08', '1', 'a_groceries');
select public.t131_line('09', '2', 'a_housing');
select public.t131_line('10', '2', 'a_housing');
select public.t131_line('11', '1', 'a_groceries');
create function public.t131_ver(p_id text) returns int language sql as $$
  select version from public.transactions where id = ('e1310000-0000-0000-0000-0000000000' || p_id)::uuid
$$;

-- 1. Setup
select extensions.ok((select is_shared from public.transactions where id = 'e1310000-0000-0000-0000-000000000002')
  and not (select is_shared from public.transactions where id = 'e1310000-0000-0000-0000-000000000001'), 'setup: joint line shared, personal line private');

set local role authenticated;
select public.t131_as('11111111-1111-1111-1111-111111111111');

-- 2-5. A splits a private line in two
insert into res select 'r1', public.set_category_parts('e1310000-0000-0000-0000-000000000001', public.t131_ver('01'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_groceries'), -3000), public.t131_p((select id from cats where k = 'a_pets'), -2000)));
select extensions.is((select v ->> 'ok' from res where k = 'r1'), 'true', 'two parts that add up are accepted');
select extensions.is((select category_id from public.transactions where id = 'e1310000-0000-0000-0000-000000000001'),
  (select id from cats where k = 'a_groceries'), 'category_id follows the largest part');
select extensions.is((select (v ->> 'version')::int from res where k = 'r1'), 2, 'version moved on by one');
select extensions.is((select v -> 'before' from res where k = 'r1'),
  jsonb_build_object('parts', null, 'category_id', (select id from cats where k = 'a_housing')), 'before holds the old parts and category for Undo');

-- 6-7. A stale version is a conflict
insert into res select 'r2', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 1,
  jsonb_build_array(public.t131_p(null, -3000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'reason' from res where k = 'r2'), 'version_conflict', 'a stale version is a version_conflict');
select extensions.is((select (v ->> 'current_version')::int from res where k = 'r2'), 2, 'the conflict carries the current version');

-- 8-11. The same rules as the engine
insert into res select 'r3', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 2,
  jsonb_build_array(public.t131_p(null, -5000)));
select extensions.is((select v ->> 'reason' || ':' || (v ->> 'detail') from res where k = 'r3'), 'parts_invalid:too_few', 'one part is too few');
insert into res select 'r4', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 2,
  jsonb_build_array(public.t131_p(null, -2000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'detail' from res where k = 'r4'), 'not_total', 'parts that fall short are refused from the sheet');
insert into res select 'r5', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 2,
  jsonb_build_array(public.t131_p(null, 100), public.t131_p(null, -5100)));
select extensions.is((select v ->> 'detail' from res where k = 'r5'), 'mixed_sign', 'a part with the other sign is refused');
insert into res select 'r6', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 2,
  jsonb_build_array(public.t131_p(null, 0), public.t131_p(null, -5000)));
select extensions.is((select v ->> 'detail' from res where k = 'r6'), 'zero_part', 'a zero part is refused');

-- 12-13. Ownership and the transfer rule
insert into res select 'r7', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 2,
  jsonb_build_array(public.t131_p((select id from cats where k = 'c_groceries'), -3000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'reason' from res where k = 'r7'), 'category_not_owned', 'another user''s category is refused');
insert into res select 'r8', public.set_category_parts('e1310000-0000-0000-0000-000000000003', public.t131_ver('03'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_transfer'), -3000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'reason' from res where k = 'r8'), 'transfer_part_on_transfer_line', 'a Transfer part on a transfer line is refused');

-- 14. A Savings part is fine
insert into res select 'r9', public.set_category_parts('e1310000-0000-0000-0000-000000000001', 2,
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_savings'), -3000), public.t131_p((select id from cats where k = 'a_groceries'), -2000)));
select extensions.is((select v ->> 'ok' from res where k = 'r9'), 'true', 'a Savings part is allowed');

-- 15-16. Remove the split and keep a category
insert into res select 'r10', public.set_category_parts('e1310000-0000-0000-0000-000000000001', public.t131_ver('01'), null, (select id from cats where k = 'a_dining'));
select extensions.is((select category_parts from public.transactions where id = 'e1310000-0000-0000-0000-000000000001'), null::jsonb, 'removing the split clears the parts');
select extensions.is((select category_id from public.transactions where id = 'e1310000-0000-0000-0000-000000000001'),
  (select id from cats where k = 'a_dining'), 'and keeps the chosen category');

-- 17-18. Private lines are invisible to a household member and an outsider
select public.t131_as('22222222-2222-2222-2222-222222222222');
insert into res select 'r11', public.set_category_parts('e1310000-0000-0000-0000-000000000001', public.t131_ver('01'),
  jsonb_build_array(public.t131_p(null, -3000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'reason' from res where k = 'r11'), 'not_found', 'a household member cannot touch a private line');
select public.t131_as('33333333-3333-3333-3333-333333333333');
insert into res select 'r12', public.set_category_parts('e1310000-0000-0000-0000-000000000002', public.t131_ver('02'),
  jsonb_build_array(public.t131_p(null, -3000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'reason' from res where k = 'r12'), 'not_found', 'an outsider cannot touch a shared line');

-- 19-22. A partner splits a shared line: their built-in maps to A's, their custom category becomes Uncategorised
select public.t131_as('22222222-2222-2222-2222-222222222222');
insert into res select 'r13', public.set_category_parts('e1310000-0000-0000-0000-000000000002', public.t131_ver('02'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'b_groceries'), -3000), public.t131_p((select id from cats where k = 'b_pets'), -2000)));
select extensions.is((select v ->> 'ok' from res where k = 'r13'), 'true', 'a partner can split a shared line');
select extensions.is((select (category_parts -> 0 ->> 'c')::uuid from public.transactions where id = 'e1310000-0000-0000-0000-000000000002'),
  (select id from cats where k = 'a_groceries'), 'the partner''s Groceries maps to the creator''s Groceries');
select extensions.is((select category_parts -> 1 -> 'c' from public.transactions where id = 'e1310000-0000-0000-0000-000000000002'),
  'null'::jsonb, 'the partner''s custom category becomes Uncategorised');
reset role;
select extensions.is((select count(*)::int from public.household_events where kind = 'split_changed' and ref_id = 'e1310000-0000-0000-0000-000000000002' and params ->> 'parts' = 'true'),
  1, 'a shared change writes one split_changed notice');

-- 23-26. A total edit keeps the parts and leaves a gap (D-03)
set local role authenticated;
select public.t131_as('11111111-1111-1111-1111-111111111111');
insert into res select 'r14', public.set_category_parts('e1310000-0000-0000-0000-000000000004', public.t131_ver('04'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_groceries'), -3000), public.t131_p((select id from cats where k = 'a_pets'), -2000)));
select extensions.is((select v ->> 'ok' from res where k = 'r14'), 'true', 'setup: line 04 is split');
select extensions.lives_ok($$update public.transactions set original_amount = -6000 where id = 'e1310000-0000-0000-0000-000000000004'$$, 'a total edit on a split line is allowed');
select extensions.is((select category_parts from public.transactions where id = 'e1310000-0000-0000-0000-000000000004'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_groceries'), -3000), public.t131_p((select id from cats where k = 'a_pets'), -2000)), 'the parts are not re-spread');
select extensions.is((select category_id from public.transactions where id = 'e1310000-0000-0000-0000-000000000004'),
  (select id from cats where k = 'a_groceries'), 'category_id still equals the largest part');

-- 27. A settled shared line is locked
reset role;
create or replace function public.hh_line_locked(p_tx uuid) returns boolean language sql as $$ select true $$;
set local role authenticated;
select public.t131_as('11111111-1111-1111-1111-111111111111');
insert into res select 'r15', public.set_category_parts('e1310000-0000-0000-0000-000000000008', public.t131_ver('08'),
  jsonb_build_array(public.t131_p(null, -3000), public.t131_p(null, -2000)));
select extensions.is((select v ->> 'reason' from res where k = 'r15'), 'line_locked', 'a settled shared line is locked');

-- 28-29. Undo through apply_patches restores the old parts
insert into res select 'r16', public.set_category_parts('e1310000-0000-0000-0000-000000000006', public.t131_ver('06'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_groceries'), -3000), public.t131_p((select id from cats where k = 'a_pets'), -2000)));
insert into res select 'r17', public.set_category_parts('e1310000-0000-0000-0000-000000000006', public.t131_ver('06'),
  jsonb_build_array(public.t131_p((select id from cats where k = 'a_pets'), -4000), public.t131_p((select id from cats where k = 'a_groceries'), -1000)));
select extensions.is((select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'e1310000-0000-0000-0000-000000000006',
  'expectedVersion', public.t131_ver('06'),
  'patch', jsonb_build_object('category_parts', (select v -> 'before' -> 'parts' from res where k = 'r17'),
                              'category_id', (select v -> 'before' -> 'category_id' from res where k = 'r17')))))) ->> 'status', 'applied', 'apply_patches accepts a category_parts patch');
select extensions.is((select category_parts from public.transactions where id = 'e1310000-0000-0000-0000-000000000006'),
  (select v -> 'before' -> 'parts' from res where k = 'r17'), 'Undo restored the previous parts');

-- 30. A client cannot call the server-side reader
select extensions.throws_ok($$select * from public.line_category_amounts('e1310000-0000-0000-0000-000000000001', -5000)$$, '42501', null, 'line_category_amounts is not callable by clients');
reset role;

-- 31. The trigger is the backstop for a direct write
select extensions.throws_ok($$update public.transactions set category_parts = '[{"c": null, "a": -100}]'::jsonb where id = 'e1310000-0000-0000-0000-000000000009'$$,
  'PT001', 'too_few', 'a direct write of invalid parts raises PT001');
select extensions.throws_ok($$update public.transactions set category_parts = jsonb_build_array(public.t131_p(null, -3000), public.t131_p(null, -3000)) where id = 'e1310000-0000-0000-0000-000000000009'$$,
  'PT001', 'over_total', 'a direct write past the total raises PT001');

-- 33-34. line_category_amounts parity with the engine's scaleParts
update public.transactions set category_parts = jsonb_build_array(public.t131_p(null, -3000), public.t131_p((select id from cats where k = 'a_groceries'), -2000))
 where id = 'e1310000-0000-0000-0000-000000000009';
update public.transactions set category_parts = jsonb_build_array(public.t131_p((select id from cats where k = 'a_groceries'), -3000), public.t131_p(null, -1500))
 where id = 'e1310000-0000-0000-0000-000000000010';
select extensions.is((select jsonb_agg(amount) from public.line_category_amounts('e1310000-0000-0000-0000-000000000009', -6250)),
  '[-3750, -2500]'::jsonb, 'parity: -3000/-2000 scaled to -6250 gives -3750/-2500');
select extensions.is((select jsonb_agg(jsonb_build_array(amount, is_gap)) from public.line_category_amounts('e1310000-0000-0000-0000-000000000010', -5000)),
  '[[-3000, false], [-1500, false], [-500, true]]'::jsonb, 'parity: a shortfall comes back as a last gap row');
select extensions.is((select jsonb_agg(amount) from public.line_category_amounts('e1310000-0000-0000-0000-000000000009', -1)),
  '[-1, 0]'::jsonb, 'parity: -1 goes to the first part (ties to the lowest index)');
select extensions.is((select jsonb_agg(jsonb_build_array(amount, is_gap)) from public.line_category_amounts('e1310000-0000-0000-0000-000000000004', -6000)),
  '[[-3000, false], [-2000, false], [-1000, true]]'::jsonb, 'a total edited up leaves a gap row for the engine and SQL alike');
update public.transactions set original_amount = -4000 where id = 'e1310000-0000-0000-0000-000000000009';
select extensions.is((select jsonb_agg(amount) from public.line_category_amounts('e1310000-0000-0000-0000-000000000009', -4000)),
  '[-2400, -1600]'::jsonb, 'an over gap (total edited down) is dropped');
select extensions.is((select jsonb_agg(amount) from public.line_category_amounts('e1310000-0000-0000-0000-000000000007', -123)),
  '[-123]'::jsonb, 'an unsplit line is one row');
select extensions.is(public.parts_allocate(100, array[0, 1, 1]::numeric[]), array[0, 50, 50]::bigint[], 'allocate parity: 100 over 0,1,1');
select extensions.is(public.parts_allocate(101, array[1, 0, 1]::numeric[]), array[51, 0, 50]::bigint[], 'allocate parity: 101 over 1,0,1');
select extensions.throws_ok($$select public.parts_allocate(10, array[0, 0]::numeric[])$$, '22023', null, 'allocate parity: all zero weights is 22023');

-- 42-43. Deleting a category turns its parts into Uncategorised
update public.transactions set category_parts = jsonb_build_array(public.t131_p('c1310000-0000-0000-0000-000000000001', -2000), public.t131_p((select id from cats where k = 'a_groceries'), -3000))
 where id = 'e1310000-0000-0000-0000-000000000005';
delete from public.categories where id = 'c1310000-0000-0000-0000-000000000001';
select extensions.is((select category_parts -> 0 -> 'c' from public.transactions where id = 'e1310000-0000-0000-0000-000000000005'),
  'null'::jsonb, 'a deleted category becomes Uncategorised in its part');
select extensions.is((select category_id from public.transactions where id = 'e1310000-0000-0000-0000-000000000005'),
  (select id from cats where k = 'a_groceries'), 'category_id follows the largest part after the delete');

-- 44-47. A hand edit ends the item link
select set_config('fincwin.item_split_rpc', 'on', true);
update public.transactions set item_split = '{"store": "Shop"}'::jsonb where id = 'e1310000-0000-0000-0000-000000000007';
update public.transactions set original_amount = original_amount where id = 'e1310000-0000-0000-0000-000000000007';
select extensions.ok((select item_split is not null from public.transactions where id = 'e1310000-0000-0000-0000-000000000007'), 'the item link is kept while the item RPC writes');
select set_config('fincwin.item_split_rpc', '', true);
update public.transactions set original_amount = -5100 where id = 'e1310000-0000-0000-0000-000000000007';
select extensions.ok((select item_split is null from public.transactions where id = 'e1310000-0000-0000-0000-000000000007'), 'a total edit ends the item link');
select set_config('fincwin.item_split_rpc', 'on', true);
update public.transactions set item_split = '{"store": "Shop"}'::jsonb where id = 'e1310000-0000-0000-0000-000000000011';
select set_config('fincwin.item_split_rpc', '', true);
update public.transactions set split_rule = split_rule where id = 'e1310000-0000-0000-0000-000000000011';
select extensions.ok((select item_split is null from public.transactions where id = 'e1310000-0000-0000-0000-000000000011'), 'a split rule edit ends the item link');
select set_config('fincwin.item_split_rpc', 'on', true);
update public.transactions set item_split = '{"store": "Shop"}'::jsonb where id = 'e1310000-0000-0000-0000-000000000010';
select set_config('fincwin.item_split_rpc', '', true);
set local role authenticated;
select public.t131_as('11111111-1111-1111-1111-111111111111');
insert into res select 'r18', public.set_category_parts('e1310000-0000-0000-0000-000000000010', public.t131_ver('10'),
  jsonb_build_array(public.t131_p(null, -3000), public.t131_p(null, -2000)));
reset role;
select extensions.ok((select item_split is null from public.transactions where id = 'e1310000-0000-0000-0000-000000000010'), 'changing the parts by hand ends the item link');

-- 48-51. map_parts_to_creator
select extensions.is(public.map_parts_to_creator(jsonb_build_array(public.t131_p((select id from cats where k = 'a_groceries'), -1)),
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') -> 0 ->> 'c', (select id::text from cats where k = 'a_groceries'), 'the creator''s category is kept');
select extensions.is(public.map_parts_to_creator(jsonb_build_array(public.t131_p((select id from cats where k = 'b_dining'), -1)),
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') -> 0 ->> 'c', (select id::text from cats where k = 'a_dining'), 'the caller''s built-in maps by builtin_key');
select extensions.is(public.map_parts_to_creator(jsonb_build_array(public.t131_p((select id from cats where k = 'b_pets'), -1)),
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') -> 0 -> 'c', 'null'::jsonb, 'the caller''s custom category becomes null');
select extensions.throws_ok($$select public.map_parts_to_creator(jsonb_build_array(public.t131_p((select id from cats where k = 'c_groceries'), -1)),
  '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')$$, 'PT001', 'category_not_owned', 'a third user''s category raises PT001');

select * from extensions.finish();
rollback;
