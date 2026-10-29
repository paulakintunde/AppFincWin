-- pgTAP: 05.2-58 (F-13) -- a series can be stopped or paused from its first day.
-- recurring_series_end_after_anchor is widened to end_date >= anchor_date - 1:
-- the stop write path (edit_recurring_series_from, one undo step), the earlier-date
-- refusal (apply_patches and the RPC), undo, RLS, and zero occurrences for a series
-- that ended before its first day (materialise_series, materialise_recurring, the
-- create_recurring_series_batch reader).
--
-- Needs 20261028001400

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

create function public.t73_ver(i uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  select version into v from public.recurring_series where id = i;
  return v;
end;
$$;

-- Fixtures, written as the table owner. S1 and S3 start today; S1 is stopped from its first day.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a7300000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0);

insert into public.recurring_series (id, household_id, created_by, account_id, category_id, name, amount, currency, freq, anchor_date, end_date, time_zone) values
  ('5e730000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a7300000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Stopped from day one', -5000, 'USD', 'monthly', current_date, null, 'UTC'),
  ('5e730000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a7300000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Live series', -5000, 'USD', 'monthly', current_date, null, 'UTC');

-- S1 has an anchor-day occurrence and a later one; the later one is paid.
select public.materialise_series('5e730000-0000-0000-0000-000000000001'::uuid, current_date);
update public.transactions set status = 'paid'
 where recurring_series_id = '5e730000-0000-0000-0000-000000000001'
   and occurrence_date = (select max(occurrence_date) from public.transactions where recurring_series_id = '5e730000-0000-0000-0000-000000000001');

-- (a) the constraint
select extensions.is(
  (select count(*)::int from pg_constraint where conrelid = 'public.recurring_series'::regclass and conname = 'recurring_series_end_after_anchor_v2' and convalidated),
  1, 'the widened end-date check exists and is validated');
select extensions.is(
  (select count(*)::int from pg_constraint where conrelid = 'public.recurring_series'::regclass and conname = 'recurring_series_end_after_anchor'),
  0, 'the old narrower check is gone');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = '5e730000-0000-0000-0000-000000000001' and status = 'pending' and deleted_at is null and occurrence_date = current_date),
  1, 'fixture: S1 has a pending occurrence on its first day');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = '5e730000-0000-0000-0000-000000000001' and status = 'paid'),
  1, 'fixture: S1 has one paid occurrence');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table v0 as select version from public.recurring_series where id = '5e730000-0000-0000-0000-000000000001';
grant select on v0 to authenticated;

-- (b) stop from the first day: one call, one undo step
select extensions.is(
  (public.edit_recurring_series_from(
     '5e730000-0000-0000-0000-000000000001'::uuid, public.t73_ver('5e730000-0000-0000-0000-000000000001'),
     jsonb_build_object('end_date', current_date - 1, 'end_reason', 'stopped'),
     current_date,
     jsonb_build_object('id', 'e7300000-0000-0000-0000-0000000000a1', 'label_key', 'stopSeries')) ->> 'status'),
  'applied', 'stop from the first day: edit_recurring_series_from applies');
select extensions.is(
  (select end_date from public.recurring_series where id = '5e730000-0000-0000-0000-000000000001'), current_date - 1,
  'end_date is the day before the first day');
select extensions.cmp_ok(
  (select version from public.recurring_series where id = '5e730000-0000-0000-0000-000000000001'), '>', (select version from v0),
  'the version was bumped');
select extensions.is(
  (select count(*)::int from public.undo_log where id = 'e7300000-0000-0000-0000-0000000000a1'),
  1, 'exactly one undo step was recorded');

-- (c) pending removed from that day, paid stays
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = '5e730000-0000-0000-0000-000000000001' and status = 'pending' and deleted_at is null),
  0, 'pending occurrences from the first day are removed');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = '5e730000-0000-0000-0000-000000000001' and status = 'paid' and deleted_at is null),
  1, 'the paid occurrence stays as recorded');

-- (g) the stopped series materialises nothing new
reset role;
select extensions.lives_ok(
  $$select public.materialise_series('5e730000-0000-0000-0000-000000000001'::uuid, current_date)$$,
  'materialise_series does not raise for a series stopped from its first day');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = '5e730000-0000-0000-0000-000000000001' and status = 'pending' and deleted_at is null),
  0, 'materialise_series adds no pending row for it');

-- (e) Undo brings it back live
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  (select ops -> -1 -> 'patch' -> 'end_date' from public.undo_log where id = 'e7300000-0000-0000-0000-0000000000a1'),
  'null'::jsonb, 'the undo op restores end_date null');
select extensions.is(
  (public.apply_patches(jsonb_build_array((select ops -> -1 from public.undo_log where id = 'e7300000-0000-0000-0000-0000000000a1'))) ->> 'status'),
  'applied', 'the undo op applies through apply_patches');
select extensions.is(
  (select end_date::text || coalesce(end_reason, '-') from public.recurring_series where id = '5e730000-0000-0000-0000-000000000001'),
  null, 'after Undo the series is live again (end_date and end_reason null)');

-- (d) an earlier end date is still refused, through both write paths
select extensions.throws_ok(
  format($$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'recurring_series', 'id', '5e730000-0000-0000-0000-000000000003', 'expectedVersion', %s, 'patch', jsonb_build_object('end_date', current_date - 2))))$$,
    public.t73_ver('5e730000-0000-0000-0000-000000000003')),
  '23514', null, 'apply_patches refuses end_date = anchor - 2');
select extensions.throws_ok(
  format($$select public.edit_recurring_series_from('5e730000-0000-0000-0000-000000000003'::uuid, %s, jsonb_build_object('end_date', current_date - 2, 'end_reason', 'stopped'), current_date)$$,
    public.t73_ver('5e730000-0000-0000-0000-000000000003')),
  '23514', null, 'edit_recurring_series_from refuses end_date = anchor - 2');

-- (g) create_recurring_series accepts anchor - 1 and generates nothing
select extensions.is(
  (public.create_recurring_series(jsonb_build_object(
    'id', 'c7300000-0000-0000-0000-000000000001',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a7300000-0000-0000-0000-000000000001',
    'name', 'Ended before it began', 'amount', -1000, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', current_date, 'end_date', current_date - 1, 'time_zone', 'UTC'
  )) ->> 'status'),
  'applied', 'create_recurring_series accepts end_date = anchor - 1');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = 'c7300000-0000-0000-0000-000000000001' and deleted_at is null),
  0, 'it materialised no occurrence at creation');

reset role;
select extensions.lives_ok(
  $$select public.materialise_series('c7300000-0000-0000-0000-000000000001'::uuid, current_date)$$,
  'materialise_series does not raise for it');
select extensions.lives_ok($$select public.materialise_recurring()$$, 'materialise_recurring does not raise');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = 'c7300000-0000-0000-0000-000000000001' and deleted_at is null),
  0, 'still no occurrence after materialise_series and materialise_recurring');

-- (h) create_recurring_series_batch
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  (public.create_recurring_series_batch(
    jsonb_build_array(jsonb_build_object('series', jsonb_build_object(
      'id', 'c7300000-0000-0000-0000-000000000002',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a7300000-0000-0000-0000-000000000001',
      'name', 'Batch ended', 'amount', -1000, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', current_date, 'end_date', current_date - 1, 'time_zone', 'UTC'))),
    jsonb_build_object('id', 'e7300000-0000-0000-0000-0000000000b1', 'label_key', 'addSeries')) ->> 'status'),
  'applied', 'create_recurring_series_batch accepts end_date = anchor - 1');
select extensions.throws_ok(
  $$select public.create_recurring_series_batch(
    jsonb_build_array(jsonb_build_object('series', jsonb_build_object(
      'id', 'c7300000-0000-0000-0000-000000000003',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a7300000-0000-0000-0000-000000000001',
      'name', 'Batch too early', 'amount', -1000, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', current_date, 'end_date', current_date - 2, 'time_zone', 'UTC'))),
    jsonb_build_object('id', 'e7300000-0000-0000-0000-0000000000b2', 'label_key', 'addSeries'))$$,
  '23514', null, 'create_recurring_series_batch refuses end_date = anchor - 2');

-- (f) a member of another household is refused
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.throws_ok(
  format($$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'recurring_series', 'id', '5e730000-0000-0000-0000-000000000003', 'expectedVersion', %s, 'patch', jsonb_build_object('end_date', current_date - 1, 'end_reason', 'stopped'))))$$,
    public.t73_ver('5e730000-0000-0000-0000-000000000003')),
  '42501', null, 'another household cannot stop the series through apply_patches');
select extensions.throws_ok(
  format($$select public.edit_recurring_series_from('5e730000-0000-0000-0000-000000000003'::uuid, %s, jsonb_build_object('end_date', current_date - 1, 'end_reason', 'stopped'), current_date)$$,
    public.t73_ver('5e730000-0000-0000-0000-000000000003')),
  '42501', null, 'another household cannot stop the series through edit_recurring_series_from');

reset role;
select * from extensions.finish();
rollback;
