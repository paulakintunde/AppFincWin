-- pgTAP: 05.5-27 ARC-23 -- Record as bought ends a replaced bill through grow_end_series: end_date and end_reason
-- 'stopped' in the same save, clamped to the anchor, stale refused, undo restores both. Migration 20261116000100.
--
-- Needs 20261016000300, 20261021000100, 20261110000100 and 20261116000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(19);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a9900000-0000-0000-0000-0000000000c1', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'C account', 'checking', 'USD', 0);

insert into public.decide_checks (id, household_id, created_by, kind, name)
select ('c9900000-0000-0000-0000-0000000000' || n)::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       '11111111-1111-1111-1111-111111111111', 'buy', 'Check ' || n
  from (values ('01'), ('02'), ('03'), ('04'), ('05'), ('06')) v(n);

create function public.t99g_ver(i uuid) returns integer language sql as $$ select version from public.recurring_series where id = i $$;
create function public.t99g_go(p_check uuid, p_row uuid, p_end jsonb, p_step uuid) returns text language sql as $$
  select public.record_decide_go(p_check, array[p_row]::uuid[], '[]'::jsonb, p_end, null,
    '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    jsonb_build_object('id', p_step, 'label_key', 'decisionWritten')) ->> 'status'
$$;
create function public.t99g_end(p_id uuid, p_ver integer, p_on date) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('id', p_id, 'expected_version', p_ver, 'end_date', p_on, 'end_reason', 'stopped'))
$$;
create function public.t99g_pending_after(p_id uuid, p_on date) returns integer language sql as $$
  select count(*)::integer from public.transactions
   where recurring_series_id = p_id and status = 'pending' and deleted_at is null and occurrence_date > p_on
$$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Fresh version-1 rows of the caller, one per call.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
select ('79900000-0000-0000-0000-0000000000' || n)::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       'a9900000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Purchase ' || n
  from (values ('01'), ('02'), ('03'), ('04'), ('05')) v(n);

-- Series: A starts in the past (ends in the future), B starts in the future (sent end is before its anchor),
-- C is the stale-refusal case, D belongs to the other household.
select public.create_recurring_series(
  jsonb_build_object('id', v.id, 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a9900000-0000-0000-0000-000000000001', 'name', v.name, 'amount', -1500, 'currency', 'USD',
    'freq', 'monthly', 'anchor_date', v.anchor, 'time_zone', 'UTC'),
  null, '{}'::uuid[], null, false)
from (values
  ('5e990000-0000-0000-0000-00000000000a'::uuid, 'Old gym', current_date - 70),
  ('5e990000-0000-0000-0000-00000000000b'::uuid, 'Future gym', current_date + 20),
  ('5e990000-0000-0000-0000-00000000000c'::uuid, 'Stale gym', current_date - 10),
  ('5e990000-0000-0000-0000-00000000000e'::uuid, 'Via rows gym', current_date - 40)
) as v(id, name, anchor);

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.create_recurring_series(
  jsonb_build_object('id', '5e990000-0000-0000-0000-0000000000d1', 'household_id', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
    'account_id', 'a9900000-0000-0000-0000-0000000000c1', 'name', 'C gym', 'amount', -1500, 'currency', 'USD',
    'freq', 'monthly', 'anchor_date', current_date - 10, 'time_zone', 'UTC'),
  null, '{}'::uuid[], null, false);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table before_pending as select public.t99g_pending_after('5e990000-0000-0000-0000-00000000000a', current_date + 10) as n;
grant select on before_pending to authenticated;

-- 1. Ending a bill sets end_date and end_reason together.
select extensions.is(
  public.t99g_go('c9900000-0000-0000-0000-000000000001', '79900000-0000-0000-0000-000000000001',
    public.t99g_end('5e990000-0000-0000-0000-00000000000a', public.t99g_ver('5e990000-0000-0000-0000-00000000000a'), current_date + 10),
    'e9900000-0000-0000-0000-000000000001'),
  'applied', 'a Go ahead that ends a bill applies');
select extensions.is(
  (select end_date::text || '/' || end_reason from public.recurring_series where id = '5e990000-0000-0000-0000-00000000000a'),
  (current_date + 10)::text || '/stopped', 'the bill has its end date and end_reason stopped');
select extensions.ok(
  (select deleted_at is null from public.recurring_series where id = '5e990000-0000-0000-0000-00000000000a'), 'the bill is not deleted');
select extensions.is(public.t99g_pending_after('5e990000-0000-0000-0000-00000000000a', current_date + 10), 0,
  'no Expected line is left after the end');
select extensions.ok((select n from before_pending) > 0, 'there were Expected lines after the end before the save (setup check)');

-- 2. Undo restores end_date and end_reason, and the lines.
select extensions.is(public.apply_undo_step('e9900000-0000-0000-0000-000000000001') ->> 'status', 'undone', 'Undo of the Go ahead is undone');
select extensions.is(
  (select coalesce(end_date::text, 'null') || '/' || coalesce(end_reason, 'null') from public.recurring_series where id = '5e990000-0000-0000-0000-00000000000a'),
  'null/null', 'Undo: end_date and end_reason are null again');
select extensions.is(public.t99g_pending_after('5e990000-0000-0000-0000-00000000000a', current_date + 10), (select n from before_pending),
  'Undo: the Expected lines come back');

-- 3. A sent end before the anchor is clamped to the anchor; the bill is never deleted.
select extensions.is(
  public.t99g_go('c9900000-0000-0000-0000-000000000002', '79900000-0000-0000-0000-000000000002',
    public.t99g_end('5e990000-0000-0000-0000-00000000000b', public.t99g_ver('5e990000-0000-0000-0000-00000000000b'), current_date + 5),
    'e9900000-0000-0000-0000-000000000002'),
  'applied', 'an end before the anchor applies');
select extensions.is(
  (select end_date::text || '/' || end_reason || '/' || (deleted_at is null)::text from public.recurring_series where id = '5e990000-0000-0000-0000-00000000000b'),
  (current_date + 20)::text || '/stopped/true', 'it ends on its anchor and is not soft-deleted');

-- 4. A stale expected_version is refused and nothing is written.
create temp table before_undo as select count(*)::int as n from public.undo_log;
grant select on before_undo to authenticated;
select extensions.throws_ok(
  $$select public.t99g_go('c9900000-0000-0000-0000-000000000003', '79900000-0000-0000-0000-000000000003',
      public.t99g_end('5e990000-0000-0000-0000-00000000000c', 99, current_date + 5), 'e9900000-0000-0000-0000-000000000003')$$,
  '22023', null, 'a stale expected_version is refused');
select extensions.ok((select end_date is null and end_reason is null from public.recurring_series where id = '5e990000-0000-0000-0000-00000000000c'),
  'the stale series is untouched');
select extensions.is((select count(*)::int from public.undo_log), (select n from before_undo), 'a refusal leaves no undo step');
select extensions.is((select status from public.decide_checks where id = 'c9900000-0000-0000-0000-000000000003'), 'open',
  'a refusal leaves the check open');

-- 5. A series of another household is refused.
select extensions.throws_ok(
  $$select public.t99g_go('c9900000-0000-0000-0000-000000000004', '79900000-0000-0000-0000-000000000004',
      public.t99g_end('5e990000-0000-0000-0000-0000000000d1', 1, current_date + 5), 'e9900000-0000-0000-0000-000000000004')$$,
  '22023', null, 'a series in another household is refused');
select extensions.throws_ok(
  $$select public.t99g_go('c9900000-0000-0000-0000-000000000004', '79900000-0000-0000-0000-000000000004',
      '[{"id":"5e990000-0000-0000-0000-00000000000c","expected_version":1}]'::jsonb, 'e9900000-0000-0000-0000-000000000004')$$,
  '22023', null, 'an ended series with no end_date is refused');

-- 6. A replay of the same step id is already-applied and writes nothing.
select extensions.is(
  public.t99g_go('c9900000-0000-0000-0000-000000000002', '79900000-0000-0000-0000-000000000002', '[]'::jsonb, 'e9900000-0000-0000-0000-000000000002'),
  'already-applied', 'the same step id replays as already-applied');

-- 7. The p_rows overload reaches the same behaviour.
select extensions.is(
  public.record_decide_go('c9900000-0000-0000-0000-000000000005',
    jsonb_build_array(jsonb_build_object('id', '79900000-0000-0000-0000-0000000000f5',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a9900000-0000-0000-0000-000000000001', 'original_amount', -1000, 'original_currency', 'USD',
      'local_date', current_date, 'time_zone', 'UTC', 'name', 'Via rows')),
    '[]'::jsonb,
    public.t99g_end('5e990000-0000-0000-0000-00000000000e', public.t99g_ver('5e990000-0000-0000-0000-00000000000e'), current_date + 3),
    null,
    '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    '{"id":"e9900000-0000-0000-0000-000000000005","label_key":"decisionWritten"}'::jsonb) ->> 'status',
  'applied', 'the p_rows overload ends a bill the same way');
select extensions.is(
  (select end_date::text || '/' || end_reason from public.recurring_series where id = '5e990000-0000-0000-0000-00000000000e'),
  (current_date + 3)::text || '/stopped', 'through the overload: end_date and stopped');

select * from extensions.finish();
rollback;
