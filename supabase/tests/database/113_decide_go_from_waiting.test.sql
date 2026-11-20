-- pgTAP: 08.1-10 -- Record as bought works from a check that was parked with "Save for it" (status 'waiting').
-- Migration 20261125000400. Needs 20261016000300, 20261021000100, 20261110000100, 20261116000100, 20261122000300,
-- 20261125000100 and 20261125000400.
-- Proves: a waiting check can be recorded (both overloads), its own goal closes with it, another goal is still refused,
-- a bought or passed check is still refused, a replay writes nothing twice, and Undo puts the check back to waiting
-- (same decided_at and wait_monthly), not to open.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1130000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0);

-- Checks: 01 waiting (own goal g1), 02 waiting (another goal g2 is not its own), 03 waiting (row-array overload),
-- 04 bought already, 05 passed, 06 waiting and owned by another member.
insert into public.decide_checks (id, household_id, created_by, kind, name)
select ('c1130000-0000-0000-0000-0000000000' || n)::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       '11111111-1111-1111-1111-111111111111', 'buy', 'Check ' || n
  from (values ('01'), ('02'), ('03'), ('04'), ('05')) v(n);
insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('c1130000-0000-0000-0000-000000000006', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'buy', 'Their check');

-- Park 01, 02, 03 and 06 as waiting; settle 04 as bought and 05 as passed (the same shapes the outcome RPCs write).
update public.decide_checks
   set status = 'waiting', decided_at = timestamptz '2026-11-01 10:00:00+00', wait_monthly = 20000
 where id in ('c1130000-0000-0000-0000-000000000001', 'c1130000-0000-0000-0000-000000000002',
              'c1130000-0000-0000-0000-000000000003', 'c1130000-0000-0000-0000-000000000006');
update public.decide_checks
   set status = 'bought', decided_at = now(), estimate_day_one = 1000, estimate_monthly = 0
 where id = 'c1130000-0000-0000-0000-000000000004';
update public.decide_checks set status = 'passed', decided_at = now() where id = 'c1130000-0000-0000-0000-000000000005';

insert into public.savings_goals (id, household_id, created_by, check_id, name, currency, target) values
  ('90113000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'c1130000-0000-0000-0000-000000000001', 'Car fund', 'USD', 900000),
  ('90113000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'c1130000-0000-0000-0000-000000000003', 'Other fund', 'USD', 900000);

create function public.t113_go(p_check uuid, p_goal jsonb, p_step uuid, p_rows uuid[] default '{}')
returns jsonb language sql as $$
  select public.record_decide_go(p_check, p_rows, '[]'::jsonb, '[]'::jsonb, null::jsonb,
    jsonb_build_object('verdict', 'fits', 'estimate_day_one', 1000, 'estimate_monthly', 0, 'estimate_monthly_payment', 0,
      'estimate_running', 0, 'broke_line', false,
      'row_roles', (select coalesce(jsonb_agg('day_one'::text), '[]'::jsonb) from unnest(p_rows)),
      'series_roles', '[]'::jsonb),
    jsonb_build_object('id', p_step, 'label_key', 'decisionWritten'), null::jsonb, null::jsonb, p_goal)
$$;

create function public.t113_row(p_id uuid, p_name text) returns jsonb language sql as $$
  select jsonb_build_object('id', p_id, 'account_id', 'a1130000-0000-0000-0000-000000000001', 'original_amount', -1000,
           'original_currency', 'USD', 'local_date', current_date, 'time_zone', 'UTC', 'name', p_name)
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- (a) a waiting check is recorded, and its own goal closes with it
select extensions.is(
  public.t113_go('c1130000-0000-0000-0000-000000000001', jsonb_build_object('goal_id', '90113000-0000-0000-0000-000000000001'),
    'e1130000-0000-0000-0000-000000000001', array['79113000-0000-0000-0000-000000000001']::uuid[]) ->> 'status',
  'applied', 'a waiting check is recorded as bought');
select extensions.is((select status from public.decide_checks where id = 'c1130000-0000-0000-0000-000000000001'), 'bought',
  'the waiting check is now bought');
select extensions.ok((select done_at is not null from public.savings_goals where id = '90113000-0000-0000-0000-000000000001'),
  'its own goal is closed with it');
select extensions.is((select count(*)::integer from public.undo_log where id = 'e1130000-0000-0000-0000-000000000001'), 1,
  'one undo step is recorded');

-- (b) a replay writes nothing twice
select extensions.is(
  public.t113_go('c1130000-0000-0000-0000-000000000001', null, 'e1130000-0000-0000-0000-000000000001',
    array['79113000-0000-0000-0000-000000000009']::uuid[]) ->> 'status',
  'already-applied', 'the same step id replays as already-applied');

-- (c) one Undo puts the check back to waiting, as it was
select extensions.is(public.apply_undo_step('e1130000-0000-0000-0000-000000000001') ->> 'status', 'undone', 'Undo reverses the save');
select extensions.is((select status from public.decide_checks where id = 'c1130000-0000-0000-0000-000000000001'), 'waiting',
  'undo: the check is waiting again, not open');
select extensions.ok((select decided_at = timestamptz '2026-11-01 10:00:00+00' and wait_monthly = 20000
                        from public.decide_checks where id = 'c1130000-0000-0000-0000-000000000001'),
  'undo: decided_at and wait_monthly are what they were');
select extensions.ok((select done_at is null from public.savings_goals where id = '90113000-0000-0000-0000-000000000001'),
  'undo: the goal is open again');

-- (d) a goal that belongs to another check is still refused, and the refusal leaves the check waiting
select extensions.throws_ok(
  $$select public.t113_go('c1130000-0000-0000-0000-000000000002', jsonb_build_object('goal_id', '90113000-0000-0000-0000-000000000002'),
      'e1130000-0000-0000-0000-000000000002', array['79113000-0000-0000-0000-000000000002']::uuid[])$$,
  '22023', null, 'a goal made by another check is refused (goal_not_linked)');
select extensions.is((select status from public.decide_checks where id = 'c1130000-0000-0000-0000-000000000002'), 'waiting',
  'a refused save leaves the waiting check waiting');

-- (e) the row-array overload takes a waiting check too
select extensions.is(
  public.record_decide_go('c1130000-0000-0000-0000-000000000003',
    jsonb_build_array(public.t113_row('79113000-0000-0000-0000-000000000003', 'Bike')), '[]'::jsonb, '[]'::jsonb, null::jsonb,
    jsonb_build_object('verdict', 'fits', 'estimate_day_one', 1000, 'estimate_monthly', 0, 'estimate_monthly_payment', 0,
      'estimate_running', 0, 'broke_line', false, 'row_roles', jsonb_build_array('day_one'), 'series_roles', '[]'::jsonb),
    jsonb_build_object('id', 'e1130000-0000-0000-0000-000000000003', 'label_key', 'decisionWritten')) ->> 'status',
  'applied', 'the row-array overload records a waiting check');
select extensions.is((select status from public.decide_checks where id = 'c1130000-0000-0000-0000-000000000003'), 'bought',
  'the row-array save leaves the check bought');

-- (f) a bought or a passed check is still refused; so is another member's waiting check
select extensions.throws_ok(
  $$select public.t113_go('c1130000-0000-0000-0000-000000000004', null, 'e1130000-0000-0000-0000-000000000004',
      array['79113000-0000-0000-0000-000000000004']::uuid[])$$,
  '22023', null, 'a bought check is refused');
select extensions.throws_ok(
  $$select public.t113_go('c1130000-0000-0000-0000-000000000005', null, 'e1130000-0000-0000-0000-000000000005',
      array['79113000-0000-0000-0000-000000000005']::uuid[])$$,
  '22023', null, 'a passed check is refused');
select extensions.throws_ok(
  $$select public.t113_go('c1130000-0000-0000-0000-000000000006', null, 'e1130000-0000-0000-0000-000000000006',
      array['79113000-0000-0000-0000-000000000006']::uuid[])$$,
  '42501', null, 'another member''s waiting check is refused');
select extensions.is((select count(*)::integer from public.transactions where id in
    ('79113000-0000-0000-0000-000000000004', '79113000-0000-0000-0000-000000000005', '79113000-0000-0000-0000-000000000006')), 0,
  'the refused saves wrote no rows');

select * from extensions.finish();
rollback;
