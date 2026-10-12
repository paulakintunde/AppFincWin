-- pgTAP: Phase 2.3 plan 03 -- record_entry_list saves an entry-sheet list as ONE
-- undo step (D-14, D-28): plain rows, a transfer pair and a repeating item.
--
-- Needs 20261012000300_entry_list.sql.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(31);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'checking', 'USD', 0);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, transfer_id) values
  ('70000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'r1', null),
  ('70000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -2000, 'USD', current_date, 'UTC', 'r2', null),
  ('70000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -3000, 'USD', current_date, 'UTC', 'r3 anchor', null),
  ('70000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -500, 'USD', current_date, 'UTC', 't1', '7f000000-0000-0000-0000-000000000001'),
  ('70000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000002', 500, 'USD', current_date, 'UTC', 't2', '7f000000-0000-0000-0000-000000000001'),
  -- extra rows for the refusals
  ('70000000-0000-0000-0000-000000000011', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -100, 'USD', current_date, 'UTC', 'edited', null),
  ('70000000-0000-0000-0000-000000000012', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -100, 'USD', current_date, 'UTC', 'deleted', null),
  ('70000000-0000-0000-0000-000000000013', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -100, 'USD', current_date, 'UTC', 'spare anchor', null);

update public.transactions set name = 'edited again' where id = '70000000-0000-0000-0000-000000000011';
update public.transactions set deleted_at = now() where id = '70000000-0000-0000-0000-000000000012';

-- B's own row in A's household.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('70000000-0000-0000-0000-000000000021', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -100, 'USD', current_date, 'UTC', 'by B');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table items as
select jsonb_build_array(jsonb_build_object(
  'series', jsonb_build_object(
    'id', '5e000000-0000-0000-0000-000000000001',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1000000-0000-0000-0000-000000000001',
    'name', 'r3 anchor', 'amount', -3000, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', current_date, 'time_zone', 'UTC'),
  'anchor_transaction_id', '70000000-0000-0000-0000-000000000003')) as j;
grant select on items to authenticated;

create temp table before_count as select count(*)::int as n from public.undo_log;
grant select on before_count to authenticated;

-- ---------------------------------------------------------------------
-- 1. The happy path.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_entry_list(
    array['70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000005']::uuid[],
    (select j from items),
    '{"id":"e0000000-0000-0000-0000-000000000001","label_key":"addedMany","label_params":{"n":4}}'::jsonb
  ) ->> 'status'),
  'applied',
  'the list save applies'
);

select extensions.is(
  (select count(*) from public.undo_log)::int - (select n from before_count),
  1,
  'exactly one undo step was recorded'
);

select extensions.is(
  (select label_key from public.undo_log where id = 'e0000000-0000-0000-0000-000000000001'),
  'addedMany',
  'the step carries the addedMany label'
);

select extensions.is(
  (select owner_id from public.undo_log where id = 'e0000000-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the step is owned by the caller'
);

select extensions.is(
  (select count(*) from public.recurring_series where id = '5e000000-0000-0000-0000-000000000001')::int,
  1,
  'the repeating item created its series'
);

select extensions.is(
  (select recurring_series_id from public.transactions where id = '70000000-0000-0000-0000-000000000003'),
  '5e000000-0000-0000-0000-000000000001'::uuid,
  'the anchor row is linked to the series'
);

select extensions.is(
  (select count(*) from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-000000000001' and deleted_at is null) > 1,
  true,
  'the series materialised occurrences beyond the anchor'
);

select extensions.is(
  (select count(*) from public.undo_log u, jsonb_array_elements(u.ops) o
    where u.id = 'e0000000-0000-0000-0000-000000000001'
      and o ->> 'entity' = 'transactions'
      and o ->> 'id' in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000005')
      and o -> 'patch' ->> 'deleted_at' = '$now')::int,
  4,
  'one soft-delete op per plain row and transfer leg'
);

select extensions.is(
  (select count(*) from public.undo_log u, jsonb_array_elements(u.ops) o
    where u.id = 'e0000000-0000-0000-0000-000000000001'
      and o ->> 'entity' = 'transactions' and o ->> 'id' = '70000000-0000-0000-0000-000000000003')::int,
  1,
  'the anchor has one op (removed with its series)'
);

select extensions.is(
  (select count(*) from public.undo_log u, jsonb_array_elements(u.ops) o
    where u.id = 'e0000000-0000-0000-0000-000000000001'
      and o ->> 'entity' = 'recurring_series' and o ->> 'id' = '5e000000-0000-0000-0000-000000000001')::int,
  1,
  'the series has one reversing op'
);

-- ---------------------------------------------------------------------
-- 2. Replay.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_entry_list(
    array['70000000-0000-0000-0000-000000000001']::uuid[],
    '[]'::jsonb,
    '{"id":"e0000000-0000-0000-0000-000000000001","label_key":"addedMany","label_params":{"n":4}}'::jsonb
  ) ->> 'status'),
  'already-applied',
  'a replay with the same step id is already-applied'
);

select extensions.is(
  (select count(*) from public.undo_log)::int - (select n from before_count),
  1,
  'a replay writes no second step'
);

-- ---------------------------------------------------------------------
-- 3. One undo reverses everything.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.apply_undo_step('e0000000-0000-0000-0000-000000000001') ->> 'status'),
  'undone',
  'undoing the step reports undone'
);

select extensions.is(
  (select count(*) from public.transactions
    where id in ('70000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000003','70000000-0000-0000-0000-000000000004','70000000-0000-0000-0000-000000000005')
      and deleted_at is null)::int,
  0,
  'every listed row is soft-deleted after the undo'
);

select extensions.isnt(
  (select deleted_at from public.recurring_series where id = '5e000000-0000-0000-0000-000000000001'),
  null,
  'the series is soft-deleted after the undo'
);

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = '5e000000-0000-0000-0000-000000000001' and deleted_at is null)::int,
  0,
  'no live occurrence remains in the series'
);

select extensions.lives_ok('set constraints all immediate', 'the transfer pair check holds after the undo');

-- ---------------------------------------------------------------------
-- 4. Refusals (each leaves no new step).
-- ---------------------------------------------------------------------
create temp table before2 as select count(*)::int as n from public.undo_log;
grant select on before2 to authenticated;

select extensions.throws_ok(
  $$select public.record_entry_list('{}'::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'an empty row array is refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013','70000000-0000-0000-0000-000000000013']::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'duplicate row ids are refused');

select extensions.throws_ok(
  $$select public.record_entry_list((select array_agg(gen_random_uuid()) from generate_series(1, 201)), '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, '201 row ids are refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000021']::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'a row created by another member is refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000011']::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'a row edited past version 1 is refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000012']::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'a soft-deleted row is refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[],
      '[{"series":{"id":"5e000000-0000-0000-0000-000000000002","household_id":"00000000-0000-0000-0000-000000000000"},"anchor_transaction_id":"70000000-0000-0000-0000-000000000099"}]'::jsonb,
      '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'an anchor not in p_row_ids is refused');

select extensions.throws_ok(
  format($f$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[], %L::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$f$,
    (select jsonb_build_array(
       jsonb_build_object('series', jsonb_set(j -> 0 -> 'series', '{id}', '"5e000000-0000-0000-0000-000000000003"'), 'anchor_transaction_id', '70000000-0000-0000-0000-000000000013'),
       jsonb_build_object('series', jsonb_set(j -> 0 -> 'series', '{id}', '"5e000000-0000-0000-0000-000000000004"'), 'anchor_transaction_id', '70000000-0000-0000-0000-000000000013')
     )::text from items)),
  '22023', null, 'the same anchor twice is refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[], '{}'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'p_items that is not an array is refused');

select extensions.throws_ok(
  format($f$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[], %L::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"addedMany"}'::jsonb)$f$,
    (select jsonb_agg(j -> 0) from items, generate_series(1, 62))::text),
  '22023', null, '62 items are refused');

select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[], '[]'::jsonb, '{"label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'a step without a uuid id is refused');

select extensions.is(
  (select count(*) from public.undo_log)::int - (select n from before2),
  0,
  'no refusal left a step behind'
);

-- ---------------------------------------------------------------------
-- 5. Tenancy and anon.
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000003","label_key":"addedMany"}'::jsonb)$$,
  '22023', null, 'an unrelated user cannot record another household rows');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.record_entry_list(array['70000000-0000-0000-0000-000000000013']::uuid[], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000004","label_key":"addedMany"}'::jsonb)$$,
  '42501', null, 'anon cannot execute record_entry_list');

reset role;
select * from extensions.finish();
rollback;
