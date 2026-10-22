-- pgTAP: Phase 5 code review fixes (20261021000100). CR-A01 the decide_settings upsert in the exact shape PostgREST
-- sends; WR-A01 ON DELETE SET NULL now lands on debts, goals and reopened checks, and the orphan repair; WR-A02 the
-- record_decide_go overload that inserts its own rows, so a refusal leaves none; WR-A08 a late Wait replay; CR-D02 a
-- statement period counts only while its import has a live line.
--
-- Needs 20261016000100 .. 20261016000400 and 20261021000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(46);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Fixtures written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a6000000-0000-0000-0000-0000000000c1', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'C account', 'checking', 'USD', 0);

insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('c6000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Linked'),
  ('c6000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Orphan source'),
  ('c6000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Atomic cash'),
  ('c6000000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Atomic refusals'),
  ('c6000000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Wait late'),
  ('c6000000-0000-0000-0000-000000000008', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Wait future'),
  ('c6000000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Pin target'),
  ('c6000000-0000-0000-0000-0000000000c3', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'buy', 'C check');

insert into public.decide_checks (id, household_id, created_by, kind, name, reopened_from) values
  ('c6000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Reopened', 'c6000000-0000-0000-0000-000000000001'),
  ('c6000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Orphan reopened', 'c6000000-0000-0000-0000-000000000003');

insert into public.debts (id, household_id, created_by, check_id, name, kind, currency) values
  ('d6000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'c6000000-0000-0000-0000-000000000001', 'Linked loan', 'loan', 'USD'),
  ('d6000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'c6000000-0000-0000-0000-000000000003', 'Orphan loan', 'loan', 'USD'),
  ('d6000000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'c6000000-0000-0000-0000-000000000009', 'Pinned loan', 'loan', 'USD');

insert into public.savings_goals (id, household_id, created_by, check_id, name, currency) values
  ('b6000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'c6000000-0000-0000-0000-000000000001', 'Linked goal', 'USD'),
  ('b6000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'c6000000-0000-0000-0000-000000000003', 'Orphan goal', 'USD');

-- Row payloads for the atomic Go ahead, prebuilt (the household ids are only known at run time).
create temp table rx as
select v.k, jsonb_build_array(jsonb_build_object(
  'id', v.id,
  'household_id', coalesce(v.hh, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  'account_id', v.account, 'original_amount', v.amount, 'original_currency', 'USD', 'local_date', current_date,
  'time_zone', 'UTC', 'note', null, 'name', 'Atomic purchase', 'category_id', null, 'status', 'pending', 'one_off', true
) || v.extra) as j
from (values
  ('ok',              '76000000-0000-0000-0000-000000000001'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '-90000'::jsonb, '{}'::jsonb),
  ('replay',          '76000000-0000-0000-0000-000000000002'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '-90000'::jsonb, '{}'::jsonb),
  ('foreign_account', '76000000-0000-0000-0000-000000000003'::uuid, null::uuid, 'a6000000-0000-0000-0000-0000000000c1'::uuid, '-1000'::jsonb, '{}'::jsonb),
  ('roles',           '76000000-0000-0000-0000-000000000004'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '-1000'::jsonb, '{}'::jsonb),
  ('bad_key',         '76000000-0000-0000-0000-000000000005'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '-1000'::jsonb, '{"is_sample":true}'::jsonb),
  ('bad_amount',      '76000000-0000-0000-0000-000000000006'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '"abc"'::jsonb, '{}'::jsonb),
  ('double_end',      '76000000-0000-0000-0000-000000000007'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '-1000'::jsonb, '{}'::jsonb),
  ('other_household', '76000000-0000-0000-0000-000000000008'::uuid,
     (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'a6000000-0000-0000-0000-0000000000c1'::uuid, '-1000'::jsonb, '{}'::jsonb),
  ('c_check',         '76000000-0000-0000-0000-000000000009'::uuid, null::uuid, 'a6000000-0000-0000-0000-000000000001'::uuid, '-1000'::jsonb, '{}'::jsonb)
) as v(k, id, hh, account, amount, extra);
grant select on rx to authenticated;

-- ---------------------------------------------------------------------
-- 1. CR-A01: the settings upsert, as PostgREST sends it (tests 1-7).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.decide_settings (user_id, currency, rough_income) values ('11111111-1111-1111-1111-111111111111', 'USD', 500000)
    on conflict (user_id) do update set user_id = excluded.user_id, currency = excluded.currency, rough_income = excluded.rough_income$$,
  'the first settings upsert, with no row yet, succeeds');

select extensions.lives_ok(
  $$insert into public.decide_settings (user_id, rough_income, reserve) values ('11111111-1111-1111-1111-111111111111', 600000, 200000)
    on conflict (user_id) do update set user_id = excluded.user_id, rough_income = excluded.rough_income, reserve = excluded.reserve$$,
  'a second upsert on the same user succeeds');

select extensions.is(
  (select rough_income::text || '/' || reserve::text || '/' || currency || '/' || version::text
     from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '600000/200000/USD/2', 'the second upsert updated the one row in place');

select extensions.throws_ok(
  $$insert into public.decide_settings (user_id, seeded) values ('11111111-1111-1111-1111-111111111111', true)
    on conflict (user_id) do update set user_id = excluded.user_id, seeded = excluded.seeded$$,
  '42501', null, 'an upsert still cannot write seeded');

select extensions.throws_ok(
  $$update public.decide_settings set seeded = true where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'an update still cannot write seeded');

select extensions.lives_ok(
  $$update public.decide_settings set user_id = '33333333-3333-3333-3333-333333333333' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'an update naming another user id runs');

select extensions.is(
  (select count(*) from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111' and not seeded)::int,
  1, 'the row stays the caller''s and is not seeded');

-- ---------------------------------------------------------------------
-- 2. WR-A01: ON DELETE SET NULL lands (tests 8-12), and the orphan repair (tests 13-16).
-- ---------------------------------------------------------------------
reset role;

select extensions.lives_ok(
  $$delete from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000001'$$,
  'hard-deleting a check that a debt, a goal and a reopened check point at is not refused');

select extensions.is(
  (select check_id from public.debts where id = 'd6000000-0000-0000-0000-000000000001'),
  null::uuid, 'the debt''s check_id is set to NULL');

select extensions.is(
  (select check_id from public.savings_goals where id = 'b6000000-0000-0000-0000-000000000001'),
  null::uuid, 'the goal''s check_id is set to NULL');

select extensions.is(
  (select reopened_from from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000002'),
  null::uuid, 'the reopened check''s reopened_from is set to NULL');

update public.debts set check_id = 'c6000000-0000-0000-0000-000000000005' where id = 'd6000000-0000-0000-0000-000000000009';
update public.decide_checks set reopened_from = 'c6000000-0000-0000-0000-000000000005' where id = 'c6000000-0000-0000-0000-000000000009';

select extensions.is(
  (select (select check_id from public.debts where id = 'd6000000-0000-0000-0000-000000000009')::text || '/'
          || coalesce((select reopened_from from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000009')::text, 'null')),
  'c6000000-0000-0000-0000-000000000009/null', 'outside the Decide RPCs a non-null change to check_id or reopened_from is still put back');

-- Dangling links as the old guards left them: delete the check with the foreign-key actions off.
set local session_replication_role = replica;
delete from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000003';
set local session_replication_role = origin;

select extensions.is(
  (select (select count(*) from public.debts where id = 'd6000000-0000-0000-0000-000000000003' and check_id = 'c6000000-0000-0000-0000-000000000003')
        + (select count(*) from public.savings_goals where id = 'b6000000-0000-0000-0000-000000000003' and check_id = 'c6000000-0000-0000-0000-000000000003')
        + (select count(*) from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000004' and reopened_from = 'c6000000-0000-0000-0000-000000000003'))::int,
  3, 'the fixture holds three links to a check that is gone');

select extensions.is(public.repair_decide_orphan_links(), 3, 'the repair clears the three dangling links');

select extensions.is(
  (select (select count(*) from public.debts where id = 'd6000000-0000-0000-0000-000000000003' and check_id is null)
        + (select count(*) from public.savings_goals where id = 'b6000000-0000-0000-0000-000000000003' and check_id is null)
        + (select count(*) from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000004' and reopened_from is null))::int,
  3, 'each dangling link is now NULL');

select extensions.is(public.repair_decide_orphan_links(), 0, 'a second repair finds nothing');

-- ---------------------------------------------------------------------
-- 3. WR-A02: Go ahead with its rows in ONE call (tests 17-23), and refusals that leave no row (tests 24-33).
-- ---------------------------------------------------------------------
set local role authenticated;

select public.create_recurring_series(
  jsonb_build_object('id', '5e600000-0000-0000-0000-000000000001',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a6000000-0000-0000-0000-000000000001', 'name', 'Old plan', 'amount', -1500, 'currency', 'USD',
    'freq', 'monthly', 'anchor_date', current_date, 'time_zone', 'UTC'),
  null, '{}'::uuid[], null, false);

select extensions.is(
  (public.record_decide_go(
    'c6000000-0000-0000-0000-000000000005'::uuid,
    (select j from rx where k = 'ok'),
    '[]'::jsonb, '[]'::jsonb, null::jsonb,
    '{"verdict":"fits","estimate_day_one":90000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"cooling_off":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6600000-0000-0000-0000-000000000001","label_key":"decisionWritten","label_params":{"name":"Atomic cash"}}'::jsonb
  ) ->> 'status'),
  'applied', 'Go ahead with its rows in one call applies');

select extensions.is(
  (select status || '/' || one_off::text || '/' || (created_by = '11111111-1111-1111-1111-111111111111')::text || '/'
          || (household_id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))::text
     from public.transactions where id = '76000000-0000-0000-0000-000000000001'),
  'pending/true/true/true', 'the RPC wrote the row as the caller''s pending one-off line in the check''s household');

select extensions.is(
  (select c.status || '/' || l.role || '/' || l.source
     from public.decide_checks c
     join public.decide_links l on l.check_id = c.id and l.entity = 'transactions'
    where c.id = 'c6000000-0000-0000-0000-000000000005'),
  'bought/day_one/written', 'the check is bought and the row is linked with its role');

select extensions.is(
  (public.record_decide_go(
    'c6000000-0000-0000-0000-000000000005'::uuid,
    (select j from rx where k = 'replay'),
    '[]'::jsonb, '[]'::jsonb, null::jsonb,
    '{"verdict":"fits","estimate_day_one":90000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"cooling_off":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6600000-0000-0000-0000-000000000001","label_key":"decisionWritten"}'::jsonb
  ) ->> 'status'),
  'already-applied', 'a replay with the same step id is already-applied');

select extensions.is(
  (select count(*) from public.transactions
    where id in ('76000000-0000-0000-0000-000000000001', '76000000-0000-0000-0000-000000000002'))::int,
  1, 'the replay inserts no second row');

select extensions.is(
  (public.apply_undo_step('e6600000-0000-0000-0000-000000000001') ->> 'status'),
  'undone', 'one undo removes the Go ahead');

select extensions.ok(
  (select deleted_at is not null from public.transactions where id = '76000000-0000-0000-0000-000000000001'),
  'the row the RPC inserted is part of its undo step');

select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, (select j from rx where k = 'foreign_account'),
      '[]'::jsonb, '[]'::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f1","label_key":"decisionWritten"}'::jsonb)$$,
  '23503', null, 'a row on another household''s account is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, (select j from rx where k = 'other_household'),
      '[]'::jsonb, '[]'::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f2","label_key":"decisionWritten"}'::jsonb)$$,
  '42501', 'record_decide_go: a row is in another household', 'a row naming another household is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, (select j from rx where k = 'roles'),
      '[]'::jsonb, '[]'::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":[],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f3","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', 'record_decide_go: roles do not match the writes', 'a refusal after the row is inserted is refused as a whole');

select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, (select j from rx where k = 'bad_key'),
      '[]'::jsonb, '[]'::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f4","label_key":"decisionWritten"}'::jsonb)$$,
  '42501', 'record_decide_go: a row cannot write is_sample', 'a row naming a server-only column is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, (select j from rx where k = 'bad_amount'),
      '[]'::jsonb, '[]'::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f5","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', 'record_decide_go: a row is malformed', 'a malformed row is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-0000000000c3'::uuid, (select j from rx where k = 'c_check'),
      '[]'::jsonb, '[]'::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f6","label_key":"decisionWritten"}'::jsonb)$$,
  '42501', 'record_decide_go: the check is not yours', 'another user''s check is refused before any row is written');

select extensions.throws_ok(
  format($f$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, (select j from rx where k = 'double_end'),
      '[]'::jsonb, %L::jsonb, null::jsonb,
      '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6600000-0000-0000-0000-0000000000f7","label_key":"decisionWritten"}'::jsonb)$f$,
    (select jsonb_build_array(e, e)::text
       from (select jsonb_build_object('id', s.id, 'expected_version', s.version, 'end_date', current_date + 30) as e
               from public.recurring_series s where s.id = '5e600000-0000-0000-0000-000000000001') q)),
  '22023', null, 'ending the same replaced series twice is refused (CR-C02)');

select extensions.is(
  (select count(*) from public.transactions where id in (
     '76000000-0000-0000-0000-000000000003', '76000000-0000-0000-0000-000000000004', '76000000-0000-0000-0000-000000000005',
     '76000000-0000-0000-0000-000000000006', '76000000-0000-0000-0000-000000000007', '76000000-0000-0000-0000-000000000008',
     '76000000-0000-0000-0000-000000000009'))::int,
  0, 'no refused call left a row behind');

select extensions.is(
  (select c.status || '/' || coalesce(s.end_date::text, 'open-ended')
     from public.decide_checks c, public.recurring_series s
    where c.id = 'c6000000-0000-0000-0000-000000000006' and s.id = '5e600000-0000-0000-0000-000000000001'),
  'open/open-ended', 'the check stays open and the replaced series is not ended');

select extensions.is(
  (select count(*) from public.undo_log where id in (
     'e6600000-0000-0000-0000-0000000000f1', 'e6600000-0000-0000-0000-0000000000f2', 'e6600000-0000-0000-0000-0000000000f3',
     'e6600000-0000-0000-0000-0000000000f4', 'e6600000-0000-0000-0000-0000000000f5', 'e6600000-0000-0000-0000-0000000000f6',
     'e6600000-0000-0000-0000-0000000000f7'))::int,
  0, 'no refusal recorded an undo step');

-- ---------------------------------------------------------------------
-- 4. WR-A08: a Wait replayed late (tests 34-37).
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_decide_outcome('c6000000-0000-0000-0000-000000000007', 'wait',
    jsonb_build_object('verdict', 'adjust', 'wait_monthly', 25000, 'ready_by', current_date - 10, 'cooling_off', false,
      'goal', jsonb_build_object('id', 'b6000000-0000-0000-0000-000000000007', 'name', 'Late fund', 'currency', 'USD', 'target', 120000))
  ) ->> 'status'),
  'applied', 'a Wait replayed ten days late is applied, not refused');

select extensions.is(
  (select (c.ready_by = current_date)::text || '/' || (g.ready_by = current_date)::text
     from public.decide_checks c
     join public.savings_goals g on g.check_id = c.id
    where c.id = 'c6000000-0000-0000-0000-000000000007'),
  'true/true', 'its past ready-by date is stored as today on the check and on its goal');

select extensions.is(
  (public.record_decide_outcome('c6000000-0000-0000-0000-000000000008', 'wait',
    jsonb_build_object('verdict', 'fits', 'wait_monthly', 1000, 'ready_by', current_date + 30, 'cooling_off', false, 'goal', null)
  ) ->> 'status'),
  'applied', 'a Wait with a future ready-by date applies');

select extensions.is(
  (select ready_by from public.decide_checks where id = 'c6000000-0000-0000-0000-000000000008'),
  current_date + 30, 'a future ready-by date is kept as sent');

-- ---------------------------------------------------------------------
-- 5. Grants (test 38).
-- ---------------------------------------------------------------------
reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.record_decide_go('c6000000-0000-0000-0000-000000000006'::uuid, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null::jsonb, '{}'::jsonb, '{}'::jsonb)$$,
  '42501', null, 'anon cannot execute the row-payload overload');

reset role;

-- ---------------------------------------------------------------------
-- 6. CR-D02: a statement period follows its import (tests 39-46).
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date,
                                 time_zone, name, import_batch_id) values
  ('7d000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a6000000-0000-0000-0000-000000000001', -2500, 'USD', '2026-08-10', 'UTC',
   'Imported line', '7b000000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.statement_periods (id, household_id, account_id, period_start, period_end, import_batch_id)
    values ('7a000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a6000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '7b000000-0000-0000-0000-000000000001'),
           ('7a000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a6000000-0000-0000-0000-000000000001', '2026-07-01', '2026-07-31', '7b000000-0000-0000-0000-000000000002'),
           ('7a000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a6000000-0000-0000-0000-000000000001', '2026-06-01', '2026-06-30', null)$$,
  'A records statement periods with and without an import batch');

select extensions.is(
  (select string_agg(id::text, ',' order by id) from public.statement_periods_live),
  '7a000000-0000-0000-0000-000000000001,7a000000-0000-0000-0000-000000000003',
  'the live view keeps a period whose import has a live line and a period with no batch, not one whose import never landed');

reset role;
update public.transactions set deleted_at = now() where id = '7d000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (select count(*) from public.statement_periods_live where id = '7a000000-0000-0000-0000-000000000001')::int,
  0, 'once the import''s lines are soft-deleted (an undo) its period no longer counts');

select extensions.is(
  (select count(*) from public.statement_periods where id = '7a000000-0000-0000-0000-000000000001')::int,
  1, 'the period row itself is kept, so a restored import counts again');

select extensions.lives_ok(
  $$insert into public.statement_periods (id, household_id, account_id, period_start, period_end, import_batch_id)
    values ('7a000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a6000000-0000-0000-0000-000000000001', '2026-08-01', '2026-08-31', '7b000000-0000-0000-0000-000000000004')$$,
  're-importing the same statement after an undo records its own period');

select extensions.throws_ok(
  $$insert into public.statement_periods (id, household_id, account_id, period_start, period_end, import_batch_id)
    values ('7a000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a6000000-0000-0000-0000-000000000001', '2026-06-01', '2026-06-30', null)$$,
  '23505', null, 'two periods with no batch over the same range are still one');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.statement_periods_live)::int,
  0, 'another household sees none of A''s live periods');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select count(*) from public.statement_periods_live$$,
  '42501', null, 'anon cannot read the live period view');

reset role;
select * from extensions.finish();
rollback;
