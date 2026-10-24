-- pgTAP: Phase 5 (05-119, R18.2 and R18.4; D-101, D-103) -- pots on savings_goals, debts.is_housing, the apply_patches
-- allow-list and the cascade purge. Migration 20261024000100.
--
-- Needs 20261016000100 .. 20261016000400, 20261021000100 and 20261024000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(55);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now()),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- ---------------------------------------------------------------------
-- Fixtures, written as the table owner.
-- ---------------------------------------------------------------------
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a6100000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Card', 'credit', 'USD', 0);

insert into public.recurring_series (id, household_id, created_by, account_id, category_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5e610000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a6100000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Housing'),
   'Mortgage payment', -90000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC'),
  ('5e610000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a6100000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Plain payment', -5000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC');

insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c6100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'House', '{"kind":"buy","itemType":"property"}'),
  ('c6100000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Car', '{"kind":"buy","itemType":"car"}');

-- Debts. The guard turns is_housing on by itself at insert for the signalled rows, so the "old" state (every
-- is_housing false) is rebuilt below to prove the backfill statement.
insert into public.debts (id, household_id, created_by, series_id, check_id, account_id, name, kind, currency) values
  ('d6100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', '5e610000-0000-0000-0000-000000000001', null, null, 'Housing series loan', 'loan', 'USD'),
  ('d6100000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', null, 'c6100000-0000-0000-0000-000000000001', null, 'Property check loan', 'loan', 'USD'),
  ('d6100000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', null, null, null, 'Plain loan', 'loan', 'USD'),
  ('d6100000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', '5e610000-0000-0000-0000-000000000001', null, 'a6100000-0000-0000-0000-000000000002', 'Housing series card', 'card', 'USD'),
  ('d6100000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', '5e610000-0000-0000-0000-000000000002', null, null, 'Groceries series loan', 'loan', 'USD'),
  ('d6100000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', null, 'c6100000-0000-0000-0000-000000000002', null, 'Car check loan', 'loan', 'USD');

-- ---------------------------------------------------------------------
-- 1. Defaults and the guard_debt insert default (tests 1-8).
-- ---------------------------------------------------------------------
select extensions.is(
  (select string_agg(id::text || '=' || is_housing::text, ',' order by id) from public.debts where id::text like 'd6100000%'),
  'd6100000-0000-0000-0000-000000000001=true,d6100000-0000-0000-0000-000000000002=true,d6100000-0000-0000-0000-000000000003=false,d6100000-0000-0000-0000-000000000004=false,d6100000-0000-0000-0000-000000000005=false,d6100000-0000-0000-0000-000000000006=false',
  'the insert default turns is_housing on for a Housing series and a property check only, and never for a card');

select extensions.is(
  (select column_default || '/' || is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'debts' and column_name = 'is_housing'),
  'false/NO', 'debts.is_housing is boolean not null default false');

insert into public.debts (id, household_id, created_by, name, kind, currency, is_housing) values
  ('d6100000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Explicit on', 'loan', 'USD', true),
  ('d6100000-0000-0000-0000-000000000008', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Explicit off', 'other', 'USD', false);
select extensions.is(
  (select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000007'),
  true, 'an explicitly-on row stays on (the default never turns it off)');

select extensions.is(
  (select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000008'),
  false, 'an explicitly-off row without a signal stays off');

select extensions.lives_ok(
  $$insert into public.debts (id, household_id, created_by, name, kind, currency, is_housing, account_id)
    values ('d6100000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'Card forced on', 'card', 'USD', true, 'a6100000-0000-0000-0000-000000000001')$$,
  'a card inserted with is_housing on is accepted');
select extensions.is(
  (select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000009'),
  false, 'guard_debt forces is_housing off for a card');

-- On update, the default fires only under the Decide RPC, and only turns on.
select set_config('fincwin.decide_rpc', 'on', true);
update public.debts set series_id = '5e610000-0000-0000-0000-000000000001' where id = 'd6100000-0000-0000-0000-000000000003';
select set_config('fincwin.decide_rpc', '', true);
select extensions.is(
  (select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000003'),
  true, 'under the Decide RPC an update that sets a Housing series turns is_housing on');

update public.debts set series_id = '5e610000-0000-0000-0000-000000000002' where id = 'd6100000-0000-0000-0000-000000000003';
select extensions.is(
  (select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000003'),
  true, 'a later update never turns is_housing off');

-- ---------------------------------------------------------------------
-- 2. The backfill statement (tests 9-14): rebuild the old state, run the statement from the migration.
-- ---------------------------------------------------------------------
update public.debts set is_housing = false where id::text like 'd6100000%';
select extensions.is(
  (select count(*)::int from public.debts where id::text like 'd6100000%' and is_housing), 0,
  'old state: every is_housing is off before the backfill');

update public.debts set is_housing = true
 where deleted_at is null and kind <> 'card' and not is_housing
   and (series_id in (select s.id from public.recurring_series s join public.categories c on c.id = s.category_id
                       where c.builtin_key = 'Housing')
        or check_id in (select id from public.decide_checks where inputs ->> 'itemType' = 'property'));

select extensions.is((select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000001'), true,
  'backfill: a loan paid by a Housing-category series is on');
select extensions.is((select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000002'), true,
  'backfill: a loan made from a property check is on');
select extensions.is((select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000003'), false,
  'backfill: a plain loan stays off (its series is now a Groceries one)');
select extensions.is((select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000004'), false,
  'backfill: a card stays off even when its series matches');
select extensions.is(
  (select string_agg(id::text, ',' order by id) from public.debts where id::text like 'd6100000%' and is_housing),
  'd6100000-0000-0000-0000-000000000001,d6100000-0000-0000-0000-000000000002',
  'backfill: nothing else is on (Groceries series, car check, explicit rows)');

-- ---------------------------------------------------------------------
-- 3. savings_goals: backfill, defaults, shape constraint (tests 15-27).
-- ---------------------------------------------------------------------
select extensions.is(
  (select column_default from information_schema.columns where table_schema = 'public' and table_name = 'savings_goals' and column_name = 'kind'),
  '''wait''::text', 'savings_goals.kind defaults to wait (existing rows backfill to wait)');

select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by) values
  ('b6100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111',
   'c6100000-0000-0000-0000-000000000002', 'Car wait', 'USD', 500000, 50000, current_date + 90);
select set_config('fincwin.decide_rpc', '', true);
select extensions.is((select kind from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000001'), 'wait',
  'an insert under the Wait RPC keeps kind wait');

select extensions.lives_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by)
    values ('b6100000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'Car service', 'USD', 60000, current_date + 120)$$,
  'a pot with a target and a ready-by date is accepted');

select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, ready_by)
    values ('b6100000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'No target', 'USD', current_date + 30)$$,
  '23514', null, 'the shape check refuses a pot with no target');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target)
    values ('b6100000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'No date', 'USD', 1000)$$,
  '23514', null, 'the shape check refuses a pot with no ready_by');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, monthly_amount)
    values ('b6100000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'Monthly', 'USD', 1000, current_date + 30, 100)$$,
  '23514', null, 'the shape check refuses a pot with a monthly_amount');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, check_id)
    values ('b6100000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'pot', 'Checked', 'USD', 1000, current_date + 30, 'c6100000-0000-0000-0000-000000000002')$$,
  '23514', null, 'the shape check refuses a pot with a check_id');
select set_config('fincwin.decide_rpc', 'on', true);
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by)
    values ('b6100000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '11111111-1111-1111-1111-111111111111', 'bogus', 'Bogus', 'USD', 1000, current_date + 30)$$,
  '23514', null, 'kind accepts only wait and pot');
select set_config('fincwin.decide_rpc', '', true);

-- ---------------------------------------------------------------------
-- 4. As A: client inserts and the per-kind freezes (tests 28-47).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.savings_goals (id, household_id, kind, name, currency, target, ready_by, opening_saved)
    values ('b6100000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'wait', 'Asked for wait', 'USD', 80000, current_date + 60, 5000)$$,
  'a client insert asking for kind wait is accepted');
select extensions.is((select kind from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000004'), 'pot',
  'a client insert becomes kind pot even when it asks for wait');
select extensions.is((select created_by from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000004'),
  '11111111-1111-1111-1111-111111111111'::uuid, 'created_by is filled from the caller');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, name, currency, target, ready_by, monthly_amount)
    values ('b6100000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'M', 'USD', 1000, current_date + 30, 100)$$,
  '42501', null, 'monthly_amount has no client insert grant');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, name, currency, target, ready_by, check_id)
    values ('b6100000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'M', 'USD', 1000, current_date + 30, 'c6100000-0000-0000-0000-000000000002')$$,
  '42501', null, 'check_id has no client insert grant');

-- wait row: freezes outside the RPC, done_at / deleted_at change
update public.savings_goals set target = 1, name = 'Renamed', ready_by = current_date, opening_saved = 9
 where id = 'b6100000-0000-0000-0000-000000000001';
select extensions.is(
  (select target::text || '/' || name || '/' || opening_saved::text || '/' || (ready_by > current_date)::text
     from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000001'),
  '500000/Car wait/0/true', 'a wait row''s target, name, ready_by and opening_saved are frozen outside the RPC');
select extensions.lives_ok(
  $$update public.savings_goals set done_at = now() where id = 'b6100000-0000-0000-0000-000000000001'$$,
  'a wait row''s done_at may change');
select extensions.isnt(
  (select done_at from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000001'),
  null::timestamptz, 'the wait row''s done_at landed');
select extensions.lives_ok(
  $$update public.savings_goals set deleted_at = now() where id = 'b6100000-0000-0000-0000-000000000001'$$,
  'a wait row''s deleted_at may change');
select extensions.isnt(
  (select deleted_at from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000001'),
  null::timestamptz, 'the wait row''s deleted_at landed');

-- pot row: kind, check_id, currency, monthly_amount have no client grant
select extensions.throws_ok(
  $$update public.savings_goals set kind = 'wait' where id = 'b6100000-0000-0000-0000-000000000002'$$,
  '42501', null, 'a pot''s kind has no client update grant');
select extensions.throws_ok(
  $$update public.savings_goals set check_id = 'c6100000-0000-0000-0000-000000000002' where id = 'b6100000-0000-0000-0000-000000000002'$$,
  '42501', null, 'a pot''s check_id has no client update grant');
select extensions.throws_ok(
  $$update public.savings_goals set currency = 'EUR' where id = 'b6100000-0000-0000-0000-000000000002'$$,
  '42501', null, 'a pot''s currency has no client update grant');
select extensions.throws_ok(
  $$update public.savings_goals set monthly_amount = 5 where id = 'b6100000-0000-0000-0000-000000000002'$$,
  '42501', null, 'a pot''s monthly_amount has no client update grant');

-- pot row: name, target, ready_by, opening_saved, done_at, deleted_at change
select extensions.lives_ok(
  $$update public.savings_goals set name = 'Car service 2', target = 70000, ready_by = current_date + 150, opening_saved = 2500
     where id = 'b6100000-0000-0000-0000-000000000002'$$,
  'a pot''s name, target, ready_by and opening_saved may change');
select extensions.is(
  (select name || '/' || target::text || '/' || opening_saved::text || '/' || (ready_by = current_date + 150)::text
     from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000002'),
  'Car service 2/70000/2500/true', 'the pot edits landed');
select extensions.lives_ok(
  $$update public.savings_goals set done_at = now(), deleted_at = now() where id = 'b6100000-0000-0000-0000-000000000002'$$,
  'a pot''s done_at and deleted_at may change');
select extensions.ok(
  (select done_at is not null and deleted_at is not null from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000002'),
  'the pot''s done_at and deleted_at landed');
select extensions.throws_ok(
  $$update public.savings_goals set target = null where id = 'b6100000-0000-0000-0000-000000000004'$$,
  '23514', null, 'clearing a pot''s target is refused by the shape check');

-- the guard's own freezes, for a writer with the grants out of the way (the table owner)
reset role;
update public.savings_goals set kind = 'wait', currency = 'EUR', monthly_amount = 5, check_id = 'c6100000-0000-0000-0000-000000000002'
 where id = 'b6100000-0000-0000-0000-000000000004';
select extensions.is(
  (select kind || '/' || currency || '/' || coalesce(monthly_amount::text, 'null') || '/' || coalesce(check_id::text, 'null')
     from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000004'),
  'pot/USD/null/null', 'the guard freezes a pot''s kind, currency, monthly_amount and check_id even for the table owner');

-- ---------------------------------------------------------------------
-- 5. RLS: another user, and anon (tests 48-51).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.savings_goals where id in ('b6100000-0000-0000-0000-000000000002', 'b6100000-0000-0000-0000-000000000004')),
  0, 'another user cannot read A''s pots');
update public.savings_goals set name = 'Hijack' where id = 'b6100000-0000-0000-0000-000000000004';
select extensions.is(
  (select name from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000004'), null,
  'another user''s update of A''s pot matches no row (and still cannot read it)');
select extensions.throws_ok(
  $$insert into public.savings_goals (id, household_id, name, currency, target, ready_by)
    values ('b6100000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Plant', 'USD', 1000, current_date + 30)$$,
  '42501', null, 'another user cannot write a pot into A''s household');
reset role;
select extensions.is(
  (select name from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000004'), 'Asked for wait',
  'A''s pot is unchanged after the other user''s attempts');

set local role anon;
select extensions.throws_ok(
  $$select count(*) from public.savings_goals$$, '42501', null, 'anon has no access to savings_goals');
reset role;

-- ---------------------------------------------------------------------
-- 6. apply_patches (tests 53-59).
-- ---------------------------------------------------------------------
-- a fresh live pot (reset role keeps the last JWT claims, so clear them: auth.uid() would fill created_by)
select set_config('request.jwt.claims', '', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by) values
  ('b6100000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Patch me', 'USD', 10000, current_date + 30);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (public.apply_patches(jsonb_build_array(jsonb_build_object(
     'entity', 'savings_goals', 'id', 'b6100000-0000-0000-0000-000000000007',
     'expectedVersion', (select version from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000007'),
     'patch', jsonb_build_object('name', 'Patched', 'target', 20000, 'ready_by', (current_date + 45)::text, 'opening_saved', 1500)))) ->> 'status'),
  'applied', 'apply_patches accepts name, target, ready_by and opening_saved on savings_goals');
select extensions.is(
  (select name || '/' || target::text || '/' || opening_saved::text || '/' || (ready_by = current_date + 45)::text
     from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000007'),
  'Patched/20000/1500/true', 'the patched pot columns landed with the right types');
select extensions.is(
  (public.apply_patches(jsonb_build_array(jsonb_build_object(
     'entity', 'savings_goals', 'id', 'b6100000-0000-0000-0000-000000000007',
     'expectedVersion', (select version from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000007'),
     'patch', jsonb_build_object('done_at', '$now', 'deleted_at', '$now')))) ->> 'status'),
  'applied', 'apply_patches accepts done_at and deleted_at on savings_goals');
select extensions.ok(
  (select done_at is not null and deleted_at is not null from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000007'),
  'done_at and deleted_at landed through apply_patches');
select extensions.throws_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object(
     'entity', 'savings_goals', 'id', 'b6100000-0000-0000-0000-000000000007',
     'expectedVersion', (select version from public.savings_goals where id = 'b6100000-0000-0000-0000-000000000007'),
     'patch', jsonb_build_object('kind', 'wait'))))$$,
  '22023', null, 'apply_patches still rejects a column that is not listed (kind)');
select extensions.is(
  (public.apply_patches(jsonb_build_array(jsonb_build_object(
     'entity', 'debts', 'id', 'd6100000-0000-0000-0000-000000000003',
     'expectedVersion', (select version from public.debts where id = 'd6100000-0000-0000-0000-000000000003'),
     'patch', jsonb_build_object('is_housing', true)))) ->> 'status'),
  'applied', 'apply_patches accepts is_housing on debts');
select extensions.is(
  (select is_housing from public.debts where id = 'd6100000-0000-0000-0000-000000000003'), true,
  'is_housing landed as a boolean, and a user can update it on their own loan');

-- ---------------------------------------------------------------------
-- 7. Account deletion purges pots and debts (tests 60).
-- ---------------------------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by) values
  ('b6100000-0000-0000-0000-0000000000d1', (select id from hh where owner_id = '44444444-4444-4444-4444-444444444444'),
   '44444444-4444-4444-4444-444444444444', 'pot', 'D pot', 'USD', 1000, current_date + 30);
insert into public.debts (id, household_id, created_by, name, kind, currency, is_housing) values
  ('d6100000-0000-0000-0000-0000000000d1', (select id from hh where owner_id = '44444444-4444-4444-4444-444444444444'),
   '44444444-4444-4444-4444-444444444444', 'D loan', 'loan', 'USD', true);
create temp table d_hh as select id from hh where owner_id = '44444444-4444-4444-4444-444444444444';
delete from auth.users where id = '44444444-4444-4444-4444-444444444444';
select extensions.is(
  (select (select count(*) from public.savings_goals where id = 'b6100000-0000-0000-0000-0000000000d1')
        + (select count(*) from public.savings_goals where kind = 'pot' and household_id in (select id from d_hh))
        + (select count(*) from public.debts where household_id in (select id from d_hh))
        + (select count(*) from public.debts where id = 'd6100000-0000-0000-0000-0000000000d1'))::int,
  0, 'deleting the user purges their pot and their debt');

select * from extensions.finish();
rollback;
