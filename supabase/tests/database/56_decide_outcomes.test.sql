-- pgTAP: Phase 5 plan 04 -- record_decide_go writes one decision as ONE undo step (cash, loan with two
-- payment runs and a running cost, investment lump and monthly, replaced expenses that end) and
-- record_decide_outcome stores Wait and Pass (D-09, D-10, D-11, D-34, D-35, D-36; 04 D-48).
-- Server-only columns: nothing here is written through a client grant.
--
-- Needs 20261016000100, 20261016000110, 20261016000120, 20261016000200 and 20261016000300.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(61);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- Fixtures written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Brokerage', 'investment', 'USD', 0),
  ('a1000000-0000-0000-0000-0000000000c1', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'C account', 'checking', 'USD', 0);

insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('c5000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Cash buy'),
  ('c5000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Loan buy'),
  ('c5000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'invest', 'Lump invest'),
  ('c5000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'invest', 'Monthly invest'),
  ('c5000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Plain buy'),
  ('c5000000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Replace buy'),
  ('c5000000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Refusals'),
  ('c5000000-0000-0000-0000-00000000000b', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'invest', 'Invest refusals'),
  ('c5000000-0000-0000-0000-0000000000c3', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'buy', 'C check'),
  ('c5000000-0000-0000-0000-000000000008', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Wait with goal'),
  ('c5000000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Wait no goal'),
  ('c5000000-0000-0000-0000-00000000000a', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Pass'),
  ('c5000000-0000-0000-0000-00000000000c', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Pass with goal'),
  ('c5000000-0000-0000-0000-00000000000d', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Wait zero target'),
  ('c5000000-0000-0000-0000-00000000000e', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Pass cooling');

-- Series payloads, prebuilt (the household id is only known at run time).
create temp table sx as
select v.id, jsonb_build_object(
  'id', v.id, 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1000000-0000-0000-0000-000000000001', 'name', v.name, 'amount', v.amount, 'currency', 'USD',
  'freq', 'monthly', 'anchor_date', current_date, 'time_zone', 'UTC', 'occurrence_count', v.cnt) as j
from (values
  ('5e000000-0000-0000-0000-000000000001'::uuid, 'Loan payment', -30000, 12),
  ('5e000000-0000-0000-0000-000000000002'::uuid, 'Loan payment promo', -35000, 6),
  ('5e000000-0000-0000-0000-000000000003'::uuid, 'Running cost', -2000, 12),
  ('5e000000-0000-0000-0000-000000000004'::uuid, 'Monthly invest', -10000, 24),
  ('5e000000-0000-0000-0000-000000000006'::uuid, 'Not a payment', -1000, 12),
  ('5e000000-0000-0000-0000-000000000007'::uuid, 'Apr test', -1000, 12),
  ('5e000000-0000-0000-0000-000000000008'::uuid, 'Invest debt test', -1000, 12),
  ('5e000000-0000-0000-0000-000000000009'::uuid, 'Roles test', -1000, 12)
) as v(id, name, amount, cnt);
grant select on sx to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- A's rows (each a fresh version-1 row), a transfer pair per case, and an existing open-ended series to replace.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, transfer_id) values
  ('70000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -90000, 'USD', current_date, 'UTC', 'Cash purchase', null),
  ('70000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Plain purchase', null),
  ('70000000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Replace purchase', null),
  ('70000000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Refusal row', null),
  ('70000000-0000-0000-0000-000000000031', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -50000, 'USD', current_date, 'UTC', 'Lump out', '7f000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-000000000032', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000002', 50000, 'USD', current_date, 'UTC', 'Lump in', '7f000000-0000-0000-0000-000000000003'),
  ('70000000-0000-0000-0000-000000000041', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -500, 'USD', current_date, 'UTC', 'Half out', '7f000000-0000-0000-0000-000000000004'),
  ('70000000-0000-0000-0000-000000000042', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000002', 500, 'USD', current_date, 'UTC', 'Half in', '7f000000-0000-0000-0000-000000000004');

select public.create_recurring_series(
  jsonb_build_object('id', '5e000000-0000-0000-0000-000000000005',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1000000-0000-0000-0000-000000000001', 'name', 'Old subscription', 'amount', -1500, 'currency', 'USD',
    'freq', 'monthly', 'anchor_date', current_date, 'time_zone', 'UTC'),
  null, '{}'::uuid[], null, false);

-- C's own row.
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('70000000-0000-0000-0000-0000000000c1', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'a1000000-0000-0000-0000-0000000000c1', -100, 'USD', current_date, 'UTC', 'C row');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ---------------------------------------------------------------------
-- 1. Cash Go ahead (one pending expense), with cooling-off.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000001',
    array['70000000-0000-0000-0000-000000000001']::uuid[],
    '[]'::jsonb, '[]'::jsonb, null,
    '{"verdict":"fits","estimate_day_one":90000,"estimate_monthly":350,"estimate_monthly_payment":300,"estimate_running":50,"broke_line":true,"cooling_off":true,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000001","label_key":"decisionWritten","label_params":{"name":"Cash buy"}}'::jsonb
  ) ->> 'status'),
  'applied', 'a cash Go ahead applies');

select extensions.is(
  (select status || '/' || broke_line::text || '/' || (decided_at is not null)::text || '/' || estimate_day_one::text || '/' || verdict_at_decision
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000001'),
  'bought/true/true/90000/fits', 'the check is bought with its decision stored');

select extensions.is(
  (select estimate_monthly_payment::text || '/' || estimate_running::text
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000001'),
  '300/50', 'the estimate is stored three ways');

select extensions.is(
  (select role || '/' || source from public.decide_links
    where check_id = 'c5000000-0000-0000-0000-000000000001' and target_id = '70000000-0000-0000-0000-000000000001'),
  'day_one/written', 'the row link is written with its role');

select extensions.is(
  (select count(*) from public.undo_log
    where id = 'e6000000-0000-0000-0000-000000000001' and allow_system_keys and label_key = 'decisionWritten')::int,
  1, 'one undo step, flagged allow_system_keys, labelled decisionWritten');

select extensions.ok(
  (select abs(extract(epoch from (cooling_off_at - (now() + interval '48 hours')))) < 1
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000001'),
  'cooling_off_at is now + 48 hours from the server clock');

select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000001',
    array['70000000-0000-0000-0000-000000000001']::uuid[],
    '[]'::jsonb, '[]'::jsonb, null,
    '{"verdict":"fits","estimate_day_one":90000,"estimate_monthly":350,"estimate_monthly_payment":300,"estimate_running":50,"broke_line":true,"cooling_off":true,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000001","label_key":"decisionWritten"}'::jsonb
  ) ->> 'status'),
  'already-applied', 'the same step id replays as already-applied');

select extensions.is(
  (select count(*) from public.undo_log where id = 'e6000000-0000-0000-0000-000000000001')::int,
  1, 'a replay writes no second undo step');

select extensions.is(
  (public.apply_undo_step('e6000000-0000-0000-0000-000000000001') ->> 'status'),
  'undone', 'one undo reverses the Go ahead');

select extensions.is(
  (select (select count(*) from public.transactions where id = '70000000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.decide_links where check_id = 'c5000000-0000-0000-0000-000000000001' and deleted_at is null))::int,
  0, 'the row and its link are soft-deleted after the undo');

select extensions.is(
  (select status || '/' || (decided_at is null)::text || '/' || (cooling_off_at is null)::text || '/' || (estimate_running is null)::text
            || '/' || (estimate_monthly_payment is null)::text
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000001'),
  'open/true/true/true/true', 'the check is open again with cooling-off and estimates cleared');

-- ---------------------------------------------------------------------
-- 2. Loan Go ahead: no deposit, a promotional payment in two runs, a running cost, the debt.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000002',
    '{}'::uuid[],
    (select jsonb_build_array(
       (select j from sx where id = '5e000000-0000-0000-0000-000000000001'),
       (select j from sx where id = '5e000000-0000-0000-0000-000000000002'),
       (select j from sx where id = '5e000000-0000-0000-0000-000000000003'))),
    '[]'::jsonb,
    '{"id":"de000000-0000-0000-0000-000000000001","account_id":null,"series_id":"5e000000-0000-0000-0000-000000000001","name":"Car loan","kind":"loan","currency":"USD","balance":900000,"apr":"9.4","minimum_payment":30000,"secured":true,"term_months":12,"start_date":null}'::jsonb,
    '{"verdict":"adjust","estimate_day_one":0,"estimate_monthly":32000,"estimate_monthly_payment":30000,"estimate_running":2000,"broke_line":false,"cooling_off":false,"row_roles":[],"series_roles":["payment","payment","running_cost"]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000002","label_key":"decisionWritten","label_params":{"name":"Loan buy"}}'::jsonb
  ) ->> 'status'),
  'applied', 'a loan with no deposit writes no transaction rows and still applies');

create temp table occ as
select id from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-000000000001' limit 1;
grant select on occ to authenticated;

select extensions.is(
  (select count(*) from public.debts
    where id = 'de000000-0000-0000-0000-000000000001' and check_id = 'c5000000-0000-0000-0000-000000000002'
      and series_id = '5e000000-0000-0000-0000-000000000001' and secured)::int,
  1, 'the debt names the check and the first payment series, secured as sent');

select extensions.is(
  (select string_agg(role, ',' order by role) from public.decide_links
    where check_id = 'c5000000-0000-0000-0000-000000000002' and entity = 'recurring_series'),
  'payment,payment,running_cost', 'every payment run and the running cost carry their role');

select extensions.is(
  (select count(*) from public.decide_links
    where check_id = 'c5000000-0000-0000-0000-000000000002' and entity = 'debts' and role is null and source = 'written')::int,
  1, 'the debt link has no role');

select extensions.is(
  (public.apply_undo_step('e6000000-0000-0000-0000-000000000002') ->> 'status'),
  'undone', 'one undo removes the loan decision');

select extensions.is(
  (select (select count(*) from public.debts where id = 'de000000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.recurring_series where id in ('5e000000-0000-0000-0000-000000000001','5e000000-0000-0000-0000-000000000002','5e000000-0000-0000-0000-000000000003') and deleted_at is null)
        + (select count(*) from public.decide_links where check_id = 'c5000000-0000-0000-0000-000000000002' and deleted_at is null))::int,
  0, 'the debt, the series and the links are gone after the undo');

-- ---------------------------------------------------------------------
-- 3. Investment: a lump as a transfer pair, a monthly contribution as one series.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000003',
    array['70000000-0000-0000-0000-000000000031','70000000-0000-0000-0000-000000000032']::uuid[],
    '[]'::jsonb, '[]'::jsonb, null,
    '{"verdict":"fits","estimate_day_one":50000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one","day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000003","label_key":"decisionWritten"}'::jsonb
  ) ->> 'status'),
  'applied', 'an investment lump with both transfer legs applies');

select extensions.is(
  (select count(*) from public.decide_links
    where check_id = 'c5000000-0000-0000-0000-000000000003' and entity = 'transactions' and source = 'written')::int,
  2, 'both legs are linked');

select extensions.is(
  (public.apply_undo_step('e6000000-0000-0000-0000-000000000003') ->> 'status'),
  'undone', 'the lump is one undo step');

select extensions.is(
  (select count(*) from public.transactions
    where id in ('70000000-0000-0000-0000-000000000031','70000000-0000-0000-0000-000000000032') and deleted_at is null)::int,
  0, 'both legs are soft-deleted after the undo');

select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000004',
    '{}'::uuid[],
    (select jsonb_build_array((select j from sx where id = '5e000000-0000-0000-0000-000000000004'))),
    '[]'::jsonb, null,
    '{"verdict":"fits","estimate_day_one":0,"estimate_monthly":10000,"estimate_monthly_payment":10000,"estimate_running":0,"broke_line":false,"row_roles":[],"series_roles":["payment"]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000004","label_key":"decisionWritten"}'::jsonb
  ) ->> 'status'),
  'applied', 'a monthly investment applies as one series');

select extensions.is(
  (select occurrence_count from public.recurring_series where id = '5e000000-0000-0000-0000-000000000004'),
  24, 'the series counts the term');

select extensions.is(
  (select count(*) from public.debts where check_id = 'c5000000-0000-0000-0000-000000000004')::int,
  0, 'an investment writes no debt');

-- ---------------------------------------------------------------------
-- 4. A plain Go ahead that stays decided, and one that ends a replaced expense.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000005',
    array['70000000-0000-0000-0000-000000000005']::uuid[],
    '[]'::jsonb, '[]'::jsonb, null,
    '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000005","label_key":"decisionWritten"}'::jsonb
  ) ->> 'status'),
  'applied', 'a plain Go ahead applies and stays decided');

select extensions.is(
  (public.record_decide_go(
    'c5000000-0000-0000-0000-000000000006',
    array['70000000-0000-0000-0000-000000000006']::uuid[],
    '[]'::jsonb,
    jsonb_build_array(jsonb_build_object(
      'id', '5e000000-0000-0000-0000-000000000005',
      'expected_version', (select version from public.recurring_series where id = '5e000000-0000-0000-0000-000000000005'),
      'end_date', current_date + 40)),
    null,
    '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e6000000-0000-0000-0000-000000000006","label_key":"decisionWritten"}'::jsonb
  ) ->> 'status'),
  'applied', 'a Go ahead that ends a replaced expense applies');

select extensions.is(
  (select end_date from public.recurring_series where id = '5e000000-0000-0000-0000-000000000005'),
  current_date + 40, 'the replaced series has its end date');

select extensions.is(
  (public.apply_undo_step('e6000000-0000-0000-0000-000000000006') ->> 'status'),
  'undone', 'undoing restores the replaced series');

select extensions.is(
  (select end_date from public.recurring_series where id = '5e000000-0000-0000-0000-000000000005'),
  null, 'the replaced series is open-ended again');

-- ---------------------------------------------------------------------
-- 5. Refusals (each leaves no new step).
-- ---------------------------------------------------------------------
create temp table before_count as select count(*)::int as n from public.undo_log;
grant select on before_count to authenticated;

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', array['70000000-0000-0000-0000-0000000000c1']::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f1","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', null, 'a row belonging to another user is refused');

select extensions.throws_ok(
  format($f$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', array[%L]::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f2","label_key":"decisionWritten"}'::jsonb)$f$, (select id from occ)),
  '22023', null, 'a row already in a series is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-000000000005', array['70000000-0000-0000-0000-000000000007']::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f3","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', null, 'a check that is already bought is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-0000000000c3', array['70000000-0000-0000-0000-000000000007']::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f4","label_key":"decisionWritten"}'::jsonb)$$,
  '42501', null, 'a check owned by another user is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', '{}'::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":[],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f5","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', null, 'an empty write is refused');

select extensions.throws_ok(
  format($f$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', '{}'::uuid[], %L::jsonb, '[]'::jsonb,
      '{"id":"de000000-0000-0000-0000-000000000007","series_id":"5e000000-0000-0000-0000-000000000007","name":"Bad apr","kind":"loan","currency":"USD","balance":1000,"apr":"9.4.1","minimum_payment":10,"secured":false,"term_months":12}'::jsonb,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":[],"series_roles":["payment"]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f6","label_key":"decisionWritten"}'::jsonb)$f$,
    (select jsonb_build_array(j)::text from sx where id = '5e000000-0000-0000-0000-000000000007')),
  '22023', null, 'an apr of 9.4.1 is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', array['70000000-0000-0000-0000-000000000007']::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one","payment"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f7","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', 'record_decide_go: roles do not match the writes', 'roles of the wrong length are refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', array['70000000-0000-0000-0000-000000000007']::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["sometimes"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f8","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', null, 'an unknown role is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', array['70000000-0000-0000-0000-000000000007']::uuid[], '[]'::jsonb, '[]'::jsonb,
      '{"id":"de000000-0000-0000-0000-000000000008","series_id":"5e000000-0000-0000-0000-000000000005","name":"Old series","kind":"loan","currency":"USD","balance":1000,"apr":null,"minimum_payment":10,"secured":false,"term_months":12}'::jsonb,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000f9","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', 'record_decide_go: the debt can only name a series written in this call', 'a debt naming a series not written in this call is refused');

select extensions.throws_ok(
  format($f$select public.record_decide_go('c5000000-0000-0000-0000-000000000007', '{}'::uuid[], %L::jsonb, '[]'::jsonb,
      '{"id":"de000000-0000-0000-0000-000000000009","series_id":"5e000000-0000-0000-0000-000000000006","name":"Wrong role","kind":"loan","currency":"USD","balance":1000,"apr":null,"minimum_payment":10,"secured":false,"term_months":12}'::jsonb,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":[],"series_roles":["running_cost"]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000fa","label_key":"decisionWritten"}'::jsonb)$f$,
    (select jsonb_build_array(j)::text from sx where id = '5e000000-0000-0000-0000-000000000006')),
  '22023', 'record_decide_go: the debt can only name a series written in this call', 'a debt whose series is not a payment run is refused');

select extensions.throws_ok(
  format($f$select public.record_decide_go('c5000000-0000-0000-0000-00000000000b', '{}'::uuid[], %L::jsonb, '[]'::jsonb,
      '{"id":"de000000-0000-0000-0000-00000000000a","series_id":"5e000000-0000-0000-0000-000000000008","name":"Invest debt","kind":"loan","currency":"USD","balance":1000,"apr":null,"minimum_payment":10,"secured":false,"term_months":12}'::jsonb,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":[],"series_roles":["payment"]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000fb","label_key":"decisionWritten"}'::jsonb)$f$,
    (select jsonb_build_array(j)::text from sx where id = '5e000000-0000-0000-0000-000000000008')),
  '22023', 'record_decide_go: an investment writes no debt', 'an investment with a debt is refused');

select extensions.throws_ok(
  $$select public.record_decide_go('c5000000-0000-0000-0000-00000000000b', array['70000000-0000-0000-0000-000000000041']::uuid[], '[]'::jsonb, '[]'::jsonb, null,
      '{"verdict":"fits","estimate_day_one":1,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
      '{"id":"e6000000-0000-0000-0000-0000000000fc","label_key":"decisionWritten"}'::jsonb)$$,
  '22023', 'record_decide_go: a transfer needs both legs', 'a single transfer leg is refused');

select extensions.is(
  (select count(*) from public.undo_log)::int - (select n from before_count),
  0, 'no refusal left an undo step behind');

-- ---------------------------------------------------------------------
-- 6. Wait and Pass.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.record_decide_outcome('c5000000-0000-0000-0000-000000000008', 'wait',
    jsonb_build_object('verdict', 'adjust', 'wait_monthly', 25000, 'ready_by', current_date + 90, 'cooling_off', true,
      'goal', jsonb_build_object('id', '5a000000-0000-0000-0000-000000000001', 'name', 'Laptop fund', 'currency', 'USD', 'target', 120000))
  ) ->> 'status'),
  'applied', 'Wait with a goal applies');

select extensions.is(
  (select status || '/' || wait_monthly::text || '/' || (ready_by = current_date + 90)::text
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000008'),
  'waiting/25000/true', 'the check is waiting with its monthly amount and ready-by date');

select extensions.is(
  (select count(*) from public.savings_goals
    where id = '5a000000-0000-0000-0000-000000000001' and check_id = 'c5000000-0000-0000-0000-000000000008'
      and target = 120000 and monthly_amount = 25000 and ready_by = current_date + 90 and opening_saved = 0
      and created_by = '11111111-1111-1111-1111-111111111111')::int,
  1, 'Wait creates its savings goal in the same call');

select extensions.ok(
  (select cooling_off_at between now() + interval '47 hours' and now() + interval '49 hours'
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000008'),
  'Wait with cooling-off stores now + 48 hours');

select extensions.is(
  (public.record_decide_outcome('c5000000-0000-0000-0000-000000000008', 'wait',
    jsonb_build_object('verdict', 'adjust', 'wait_monthly', 25000, 'ready_by', current_date + 90, 'cooling_off', true,
      'goal', jsonb_build_object('id', '5a000000-0000-0000-0000-000000000001', 'name', 'Laptop fund', 'currency', 'USD', 'target', 120000))
  ) ->> 'status'),
  'already-applied', 'repeating the Wait is already-applied');

select extensions.is(
  (select count(*) from public.savings_goals where check_id = 'c5000000-0000-0000-0000-000000000008')::int,
  1, 'the repeat inserts no second goal');

select extensions.is(
  (public.record_decide_outcome('c5000000-0000-0000-0000-000000000009', 'wait',
    jsonb_build_object('verdict', 'no', 'wait_monthly', 5000, 'ready_by', null, 'cooling_off', false, 'goal', null)
  ) ->> 'status'),
  'applied', 'Wait without a goal applies');

select extensions.is(
  (select (select count(*) from public.savings_goals where check_id = 'c5000000-0000-0000-0000-000000000009')::text
          || '/' || (cooling_off_at is null)::text || '/' || (ready_by is null)::text
     from public.decide_checks where id = 'c5000000-0000-0000-0000-000000000009'),
  '0/true/true', 'no goal row, no cooling-off and no ready-by date');

select extensions.is(
  (public.record_decide_outcome('c5000000-0000-0000-0000-00000000000a', 'pass',
    jsonb_build_object('verdict', 'no', 'cooling_off', false)
  ) ->> 'status'),
  'applied', 'Pass applies');

select extensions.is(
  (select status || '/' || (cooling_off_at is null)::text || '/' || (wait_monthly is null)::text
     from public.decide_checks where id = 'c5000000-0000-0000-0000-00000000000a'),
  'passed/true/true', 'the check is passed with nothing stored beyond the decision');

select extensions.is(
  (public.record_decide_outcome('c5000000-0000-0000-0000-00000000000a', 'pass',
    jsonb_build_object('verdict', 'no', 'cooling_off', false)
  ) ->> 'status'),
  'already-applied', 'repeating the Pass is already-applied');

select extensions.is(
  (public.record_decide_outcome('c5000000-0000-0000-0000-00000000000e', 'pass',
    jsonb_build_object('verdict', 'adjust', 'cooling_off', true)
  ) ->> 'status'),
  'applied', 'Pass with cooling-off applies');

select extensions.ok(
  (select cooling_off_at is not null from public.decide_checks where id = 'c5000000-0000-0000-0000-00000000000e'),
  'Pass with cooling-off stores the time');

select extensions.throws_ok(
  $$select public.record_decide_outcome('c5000000-0000-0000-0000-000000000005', 'wait',
      '{"verdict":"fits","wait_monthly":100,"ready_by":null,"cooling_off":false}'::jsonb)$$,
  '22023', null, 'Wait on a bought check is refused');

select extensions.throws_ok(
  $$select public.record_decide_outcome('c5000000-0000-0000-0000-000000000007', 'maybe', '{"verdict":"fits"}'::jsonb)$$,
  '22023', null, 'an unknown outcome is refused');

select extensions.throws_ok(
  $$select public.record_decide_outcome('c5000000-0000-0000-0000-00000000000c', 'pass',
      '{"verdict":"fits","cooling_off":false,"goal":{"id":"5a000000-0000-0000-0000-000000000003","name":"No","currency":"USD","target":100}}'::jsonb)$$,
  '22023', null, 'a Pass with a goal is refused');

select extensions.throws_ok(
  $$select public.record_decide_outcome('c5000000-0000-0000-0000-00000000000d', 'wait',
      '{"verdict":"fits","wait_monthly":100,"ready_by":null,"cooling_off":false,"goal":{"id":"5a000000-0000-0000-0000-000000000004","name":"Zero","currency":"USD","target":0}}'::jsonb)$$,
  '22023', null, 'a goal target of 0 is refused');

select extensions.throws_ok(
  $$select public.record_decide_outcome('c5000000-0000-0000-0000-0000000000c3', 'pass', '{"verdict":"fits","cooling_off":false}'::jsonb)$$,
  '42501', null, 'another user''s check is refused');

reset role;
set local role anon;
select extensions.throws_ok(
  $$select public.record_decide_outcome('c5000000-0000-0000-0000-000000000007', 'pass', '{"verdict":"fits"}'::jsonb)$$,
  '42501', null, 'anon cannot execute record_decide_outcome');

reset role;
select * from extensions.finish();
rollback;
