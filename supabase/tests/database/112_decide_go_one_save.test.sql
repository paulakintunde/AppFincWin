-- pgTAP: 08.1-02 ARC-24 -- Record as bought is one save: an 'expected' kind of monthly line (recurring_series.amount_kind),
-- the sale money in, the old loan's payoff and the goal close, all inside record_decide_go with ONE undo step.
-- Migration 20261123000100 (D-09, D-10, D-11). The sale and payoff run through the same private function Grow's
-- record_debt_sale uses (grow_sale_and_payoff).
--
-- Needs 20261016000300, 20261021000100, 20261110000100, 20261116000100, 20261122000300 and 20261123000100.
-- Dates are relative to current_date so the monthly materialiser horizon never changes what is asserted.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(44);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1120000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a1120000-0000-0000-0000-0000000000c1', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'C account', 'checking', 'USD', 0);

insert into public.decide_checks (id, household_id, created_by, kind, name)
select ('c1120000-0000-0000-0000-0000000000' || n)::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       '11111111-1111-1111-1111-111111111111', 'buy', 'Check ' || n
  from (values ('01'), ('02'), ('03'), ('04'), ('05'), ('06'), ('07'), ('08'), ('09'), ('10')) v(n);

insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('c1120000-0000-0000-0000-0000000000c1', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'buy', 'Their check');

-- Goals: g1 is the caller's and linked to check 04; g2 is the caller's and linked to check 05 (the big save);
-- g3 is the caller's but linked to nothing; g4 is another member's goal on their own check.
insert into public.savings_goals (id, household_id, created_by, check_id, name, currency, target) values
  ('90112000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'c1120000-0000-0000-0000-000000000004', 'Car fund', 'USD', 900000),
  ('90112000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'c1120000-0000-0000-0000-000000000005', 'Big fund', 'USD', 900000),
  ('90112000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', null, 'Loose fund', 'USD', 900000),
  ('90112000-0000-0000-0000-000000000004', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'c1120000-0000-0000-0000-0000000000c1', 'Their fund', 'USD', 900000);

-- Payment series of the old loans, their pending lines, and the loans themselves.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5e112000-0000-0000-0000-0000000000d1', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a1120000-0000-0000-0000-000000000001', 'Old loan payment', -45000, 'USD', 'monthly', current_date - 20, 'UTC'),
  ('5e112000-0000-0000-0000-0000000000d4', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a1120000-0000-0000-0000-000000000001', 'Big loan payment', -30000, 'USD', 'monthly', current_date - 20, 'UTC');
do $$ begin
  perform public.materialise_series('5e112000-0000-0000-0000-0000000000d1');
  perform public.materialise_series('5e112000-0000-0000-0000-0000000000d4');
end $$;
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment, series_id) values
  ('d1120000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Old loan', 'loan', 'USD', 500000, 45000, '5e112000-0000-0000-0000-0000000000d1'),
  ('d1120000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Grow loan', 'loan', 'USD', 500000, 45000, null),
  ('d1120000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Decide loan', 'loan', 'USD', 500000, 45000, null),
  ('d1120000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Big loan', 'loan', 'USD', 400000, 30000, '5e112000-0000-0000-0000-0000000000d4'),
  ('d1120000-0000-0000-0000-000000000009', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'Their loan', 'loan', 'USD', 500000, 20000, null);

create function public.t112_ver(e text, i uuid) returns integer language plpgsql as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) into v using i;
  return v;
end;
$$;

-- A leg of the sale or the payoff. p_debt/p_ver are only sent on the payoff.
create function public.t112_leg(p_id uuid, p_amount bigint, p_name text, p_debt uuid default null, p_ver integer default null)
returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'account_id', 'a1120000-0000-0000-0000-000000000001', 'amount', p_amount,
           'currency', 'USD', 'local_date', (current_date + 1), 'time_zone', 'UTC', 'name', p_name)
         || case when p_debt is null then '{}'::jsonb else jsonb_build_object('debt_id', p_debt, 'expected_version', p_ver) end
$$;

create function public.t112_series(p_id uuid, p_name text, p_kind text default null) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
           'account_id', 'a1120000-0000-0000-0000-000000000001', 'name', p_name, 'amount', -2000, 'currency', 'USD',
           'freq', 'monthly', 'anchor_date', current_date + 3, 'time_zone', 'UTC')
         || case when p_kind is null then '{}'::jsonb else jsonb_build_object('amount_kind', p_kind) end
$$;

-- record_decide_go with no rows: p_series (an array), the optional parts and a step id. Roles are one per series.
create function public.t112_go(p_check uuid, p_series jsonb, p_end jsonb, p_sale jsonb, p_payoff jsonb, p_goal jsonb, p_step uuid,
                               p_rows uuid[] default '{}')
returns jsonb language sql as $$
  select public.record_decide_go(p_check, p_rows, p_series, p_end, null::jsonb,
    jsonb_build_object('verdict', 'fits', 'estimate_day_one', 1000, 'estimate_monthly', 0, 'estimate_monthly_payment', 0,
      'estimate_running', 0, 'broke_line', false,
      'row_roles', (select coalesce(jsonb_agg('day_one'::text), '[]'::jsonb) from unnest(p_rows)),
      'series_roles', (select coalesce(jsonb_agg('running_cost'::text), '[]'::jsonb) from jsonb_array_elements(p_series))),
    jsonb_build_object('id', p_step, 'label_key', 'decisionWritten'), p_sale, p_payoff, p_goal)
$$;

create function public.t112_txn_count() returns integer language sql as $$
  select count(*)::integer from public.transactions where original_currency = 'USD' and name in ('Sold the car', 'Final payment') and deleted_at is null
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- (a) amount_kind -------------------------------------------------------------------------------------------------
select extensions.is(
  public.t112_go('c1120000-0000-0000-0000-000000000001',
    jsonb_build_array(public.t112_series('5e112000-0000-0000-0000-0000000000a1', 'Fuel', 'expected'),
                      public.t112_series('5e112000-0000-0000-0000-0000000000a2', 'Insurance')),
    '[]'::jsonb, null, null, null, 'e1120000-0000-0000-0000-000000000001') ->> 'status',
  'applied', 'a save with an expected line and a plain line applies');
select extensions.is((select amount_kind from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000a1'),
  'expected', 'a series sent as expected is stored as expected');
select extensions.is((select amount_kind from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000a2'),
  'exact', 'a series sent without amount_kind reads as exact');
select extensions.is((select amount_kind from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000d1'),
  'exact', 'an existing series reads as exact (the column default)');
select extensions.throws_ok(
  $$select public.t112_go('c1120000-0000-0000-0000-000000000002',
      jsonb_build_array(public.t112_series('5e112000-0000-0000-0000-0000000000a3', 'Bad', 'guess')),
      '[]'::jsonb, null, null, null, 'e1120000-0000-0000-0000-000000000002')$$,
  '22023', null, 'an unknown amount_kind is refused');
select extensions.is((select status from public.decide_checks where id = 'c1120000-0000-0000-0000-000000000002'), 'open',
  'a refused save leaves the check open');
select extensions.is((select count(*)::integer from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000a3'), 0,
  'a refused save writes no series');

-- (f) nothing ticked: nothing extra is written -----------------------------------------------------------------------
select extensions.is(public.t112_txn_count(), 0, 'with no sale or payoff sent, no sale or payoff line exists');
select extensions.ok((select done_at is null from public.savings_goals where id = '90112000-0000-0000-0000-000000000001'),
  'with no goal_close sent, the goal stays open');
select extensions.is((select balance from public.debts where id = 'd1120000-0000-0000-0000-000000000001'), 500000::bigint,
  'with no payoff sent, the old loan is untouched');

-- (b) sale + payoff match record_debt_sale ---------------------------------------------------------------------------
select extensions.is(
  public.record_debt_sale('d1120000-0000-0000-0000-000000000002', 1,
    public.t112_leg('7a112000-0000-0000-0000-000000000001', 1000000, 'Sold the car'),
    public.t112_leg('7a112000-0000-0000-0000-000000000002', 500000, 'Final payment'),
    jsonb_build_object('id', 'e1120000-0000-0000-0000-000000000011', 'label_key', 'debtSaleRecorded')) ->> 'paid_off',
  'true', 'Grow: the sale and the full payment pay the loan off (reference)');

select extensions.is(
  public.t112_go('c1120000-0000-0000-0000-000000000003', '[]'::jsonb, '[]'::jsonb,
    public.t112_leg('7a112000-0000-0000-0000-000000000003', 1000000, 'Sold the car'),
    public.t112_leg('7a112000-0000-0000-0000-000000000004', 500000, 'Final payment', 'd1120000-0000-0000-0000-000000000003',
      public.t112_ver('debts', 'd1120000-0000-0000-0000-000000000003')),
    null, 'e1120000-0000-0000-0000-000000000003') ->> 'status',
  'applied', 'Decide: a sale and a payoff apply in one save');
select extensions.is(
  (select string_agg(t.original_amount::text || '/' || t.status || '/' || (t.debt_id is not null)::text, ',' order by t.original_amount)
     from public.transactions t where t.id in ('7a112000-0000-0000-0000-000000000003', '7a112000-0000-0000-0000-000000000004')),
  (select string_agg(t.original_amount::text || '/' || t.status || '/' || (t.debt_id is not null)::text, ',' order by t.original_amount)
     from public.transactions t where t.id in ('7a112000-0000-0000-0000-000000000001', '7a112000-0000-0000-0000-000000000002')),
  'Decide writes the same two lines as Grow (amounts, status, debt link)');
select extensions.is(
  (select balance::text || '/' || (paid_off_on is not null)::text from public.debts where id = 'd1120000-0000-0000-0000-000000000003'),
  (select balance::text || '/' || (paid_off_on is not null)::text from public.debts where id = 'd1120000-0000-0000-0000-000000000002'),
  'Decide leaves the loan in the same state as Grow (balance, paid off)');
select extensions.is((select debt_id from public.transactions where id = '7a112000-0000-0000-0000-000000000003'),
  'd1120000-0000-0000-0000-000000000003'::uuid, 'the sale is linked to the loan');

-- A payoff that names its loan ends that loan's payment series, like Grow.
select extensions.is(
  public.t112_go('c1120000-0000-0000-0000-000000000007', '[]'::jsonb, '[]'::jsonb, null,
    public.t112_leg('7a112000-0000-0000-0000-000000000007', 500000, 'Final payment', 'd1120000-0000-0000-0000-000000000001',
      public.t112_ver('debts', 'd1120000-0000-0000-0000-000000000001')),
    null, 'e1120000-0000-0000-0000-000000000007') ->> 'status',
  'applied', 'a payoff with no sale applies');
select extensions.ok((select end_date is not null from public.recurring_series
                       where id = '5e112000-0000-0000-0000-0000000000d1'), 'the paid-off loan''s payment series is ended');
select extensions.is(public.apply_undo_step('e1120000-0000-0000-0000-000000000007') ->> 'status', 'undone', 'a payoff-only save undoes');
select extensions.is((select balance from public.debts where id = 'd1120000-0000-0000-0000-000000000001'), 500000::bigint,
  'undo: the loan owes what it did');
select extensions.ok((select end_date is null from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000d1'),
  'undo: the loan''s payment series runs again');

-- Guards: another household's loan, a stale loan version, a bad shape.
select extensions.throws_ok(
  $$select public.t112_go('c1120000-0000-0000-0000-000000000008', '[]'::jsonb, '[]'::jsonb, null,
      public.t112_leg('7a112000-0000-0000-0000-000000000008', 1000, 'Final payment', 'd1120000-0000-0000-0000-000000000009', 1),
      null, 'e1120000-0000-0000-0000-000000000008')$$,
  '42501', null, 'a payoff on another household''s loan is refused');
select extensions.throws_ok(
  $$select public.t112_go('c1120000-0000-0000-0000-000000000008', '[]'::jsonb, '[]'::jsonb, null,
      public.t112_leg('7a112000-0000-0000-0000-000000000008', 1000, 'Final payment', 'd1120000-0000-0000-0000-000000000001', 99),
      null, 'e1120000-0000-0000-0000-000000000008')$$,
  '22023', null, 'a payoff with a stale loan version is refused');
select extensions.throws_ok(
  $$select public.t112_go('c1120000-0000-0000-0000-000000000008', '[]'::jsonb, '[]'::jsonb, null,
      jsonb_build_object('id', '7a112000-0000-0000-0000-000000000008', 'amount', 5), null, 'e1120000-0000-0000-0000-000000000008')$$,
  '22023', null, 'a payoff with no loan and a bad shape is refused');
select extensions.is((select status from public.decide_checks where id = 'c1120000-0000-0000-0000-000000000008'), 'open',
  'refused payoffs leave the check open');

-- (c) goal_close ------------------------------------------------------------------------------------------------------
select extensions.is(
  public.t112_go('c1120000-0000-0000-0000-000000000004',
    jsonb_build_array(public.t112_series('5e112000-0000-0000-0000-0000000000b1', 'Fuel b', 'expected')),
    '[]'::jsonb, null, null, jsonb_build_object('goal_id', '90112000-0000-0000-0000-000000000001'),
    'e1120000-0000-0000-0000-000000000004') ->> 'status',
  'applied', 'a goal linked to the check closes in the save');
select extensions.ok((select done_at is not null from public.savings_goals where id = '90112000-0000-0000-0000-000000000001'),
  'the linked goal is closed (done_at)');
select extensions.throws_ok(
  $$select public.t112_go('c1120000-0000-0000-0000-000000000009',
      jsonb_build_array(public.t112_series('5e112000-0000-0000-0000-0000000000b9', 'Fuel 9', 'expected')), '[]'::jsonb, null, null,
      jsonb_build_object('goal_id', '90112000-0000-0000-0000-000000000003'), 'e1120000-0000-0000-0000-000000000009')$$,
  '22023', 'record_decide_go: goal_not_linked', 'a goal not linked to the check is refused as goal_not_linked');
select extensions.throws_ok(
  $$select public.t112_go('c1120000-0000-0000-0000-000000000006', '[]'::jsonb, '[]'::jsonb,
      public.t112_leg('7a112000-0000-0000-0000-00000000000a', 1000000, 'Sold the car'), null,
      jsonb_build_object('goal_id', '90112000-0000-0000-0000-000000000004'), 'e1120000-0000-0000-0000-00000000000a')$$,
  '22023', 'record_decide_go: goal_not_linked', 'another person''s goal is refused as goal_not_linked');
select extensions.is(public.t112_txn_count(), 4,
  'a refused goal_close leaves no sale behind (still the four lines from the two earlier saves)');
select extensions.is((select status from public.decide_checks where id = 'c1120000-0000-0000-0000-000000000006'), 'open',
  'a refused goal_close leaves the check open');

-- (d) one undo reverses everything -------------------------------------------------------------------------------------
-- Check 05: a new row, a new expected series, an ended series, a sale, a payoff and a goal close, in one save.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('79112000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        'a1120000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Purchase');
select public.create_recurring_series(
  jsonb_build_object('id', '5e112000-0000-0000-0000-0000000000e1', 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1120000-0000-0000-0000-000000000001', 'name', 'Old gym', 'amount', -1500, 'currency', 'USD',
    'freq', 'monthly', 'anchor_date', current_date - 70, 'time_zone', 'UTC'),
  null, '{}'::uuid[], null, false);
create temp table before_big as select
  (select count(*)::integer from public.transactions where deleted_at is null) as n_tx,
  (select count(*)::integer from public.recurring_series where deleted_at is null) as n_series;
grant select on before_big to authenticated;

select extensions.is(
  public.t112_go('c1120000-0000-0000-0000-000000000005',
    jsonb_build_array(public.t112_series('5e112000-0000-0000-0000-0000000000c1', 'Fuel c', 'expected')),
    jsonb_build_array(jsonb_build_object('id', '5e112000-0000-0000-0000-0000000000e1',
      'expected_version', public.t112_ver('recurring_series', '5e112000-0000-0000-0000-0000000000e1'),
      'end_date', current_date + 10, 'end_reason', 'stopped')),
    public.t112_leg('7a112000-0000-0000-0000-000000000051', 1000000, 'Sold the car'),
    public.t112_leg('7a112000-0000-0000-0000-000000000052', 400000, 'Final payment', 'd1120000-0000-0000-0000-000000000004',
      public.t112_ver('debts', 'd1120000-0000-0000-0000-000000000004')),
    jsonb_build_object('goal_id', '90112000-0000-0000-0000-000000000002'),
    'e1120000-0000-0000-0000-000000000005', array['79112000-0000-0000-0000-000000000005']::uuid[]) ->> 'status',
  'applied', 'one save writes the row, the series, the end, the sale, the payoff and the goal close');
select extensions.is((select count(*)::integer from public.undo_log where id = 'e1120000-0000-0000-0000-000000000005'), 1,
  'one undo step is recorded for the whole save');
select extensions.ok((select balance = 0 and paid_off_on is not null from public.debts where id = 'd1120000-0000-0000-0000-000000000004'),
  'the loan is paid off');
select extensions.ok((select done_at is not null from public.savings_goals where id = '90112000-0000-0000-0000-000000000002'),
  'the goal is closed');
select extensions.ok((select end_date is not null from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000e1'),
  'the old bill is ended');

-- (e) a replay writes nothing twice
select extensions.is(
  public.t112_go('c1120000-0000-0000-0000-000000000005', '[]'::jsonb, '[]'::jsonb,
    public.t112_leg('7a112000-0000-0000-0000-000000000053', 1000000, 'Sold the car'),
    public.t112_leg('7a112000-0000-0000-0000-000000000054', 400000, 'Final payment', 'd1120000-0000-0000-0000-000000000004', 1),
    jsonb_build_object('goal_id', '90112000-0000-0000-0000-000000000002'),
    'e1120000-0000-0000-0000-000000000005') ->> 'status',
  'already-applied', 'the same step id replays as already-applied');
select extensions.is((select count(*)::integer from public.transactions where id in
    ('7a112000-0000-0000-0000-000000000053', '7a112000-0000-0000-0000-000000000054')), 0, 'a replay writes no second sale or payoff');

select extensions.is(public.apply_undo_step('e1120000-0000-0000-0000-000000000005') ->> 'status', 'undone', 'one Undo reverses the whole save');
select extensions.is((select count(*)::integer from public.transactions where deleted_at is null), (select n_tx - 1 from before_big),
  'undo: the sale and the payoff are gone and so is the save''s own row (one fewer live line than before the save)');
select extensions.is((select count(*)::integer from public.recurring_series where deleted_at is null), (select n_series from before_big),
  'undo: the new series is gone and the ended one is back');
select extensions.ok((select end_date is null from public.recurring_series where id = '5e112000-0000-0000-0000-0000000000e1'),
  'undo: the ended bill runs again');
select extensions.ok((select balance = 400000 and paid_off_on is null from public.debts where id = 'd1120000-0000-0000-0000-000000000004'),
  'undo: the loan owes what it did and is not paid off');
select extensions.ok((select done_at is null from public.savings_goals where id = '90112000-0000-0000-0000-000000000002'),
  'undo: the goal is open again');
select extensions.is((select status from public.decide_checks where id = 'c1120000-0000-0000-0000-000000000005'), 'open',
  'undo: the check is open again');

select * from extensions.finish();
rollback;
