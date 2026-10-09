-- pgTAP: Phase 2.2 plan 14 -- add_activity_month (D-16, RESEARCH Pattern 7).
-- Contiguous adds only, 12-month cap, real rows for every active series,
-- one undo step that rewinds rows + materialised_through + horizon_month,
-- re-add after undo (Pitfall 6), isolation, replay.
--
-- Needs 20261010000100..000300 and 20261010000500.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(24);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- 'YYYY-MM' of the current month plus n months.
create function pg_temp.mon(n int) returns text language sql as $$
  select to_char(date_trunc('month', current_date) + make_interval(months => n), 'YYYY-MM');
$$;
grant execute on function pg_temp.mon(int) to authenticated;

create function pg_temp.step(n int) returns jsonb language sql as $$
  select jsonb_build_object('id', ('f0000000-0000-0000-0000-' || lpad(n::text, 12, '0')),
                            'label_key', 'monthAdded', 'label_params', '{}'::jsonb);
$$;
grant execute on function pg_temp.step(int) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);

select public.create_recurring_series(jsonb_build_object(
  'id', 'c1111111-1111-1111-1111-111111111111',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Rent', 'amount', -120000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));

create temp table before_state as
  select materialised_through as mt from public.recurring_series where id = 'c1111111-1111-1111-1111-111111111111';
grant select on before_state to authenticated;

-- 1-3. First add is the month after the default horizon.
select extensions.is(
  (public.add_activity_month((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    pg_temp.mon(2), current_date, pg_temp.step(1)) ->> 'status'),
  'applied', 'adding the month after the default horizon applies');

select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  pg_temp.mon(2), 'the household horizon is stored');

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and to_char(local_date, 'YYYY-MM') = pg_temp.mon(2) and status = 'pending' and deleted_at is null)::int,
  1, 'the series materialised a real pending row into the added month');

-- 4-6. Contiguity, past p_today, isolation.
select extensions.throws_ok(
  format($f$select public.add_activity_month(%L, %L, current_date, pg_temp.step(2))$f$,
    (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), pg_temp.mon(4)),
  '22023', null, 'skipping a month is refused');

select extensions.throws_ok(
  format($f$select public.add_activity_month(%L, %L, current_date - 7, pg_temp.step(2))$f$,
    (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), pg_temp.mon(3)),
  '22023', null, 'a p_today a week in the past is refused');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok(
  format($f$select public.add_activity_month(%L, %L, current_date, pg_temp.step(2))$f$,
    (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), pg_temp.mon(3)),
  '42501', null, 'a non-member cannot add a month to another household');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 7-8. Replay.
select extensions.is(
  (public.add_activity_month((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    pg_temp.mon(2), current_date, pg_temp.step(1)) ->> 'status'),
  'already-applied', 'replaying the same step id is already-applied');

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and to_char(local_date, 'YYYY-MM') = pg_temp.mon(2))::int,
  1, 'a replay creates no extra rows');

-- 9-12. Undo rewinds rows, high-water mark and horizon.
select extensions.is(
  (public.apply_undo_step((pg_temp.step(1) ->> 'id')::uuid) ->> 'status'),
  'undone', 'undoing the add is one step');

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and to_char(local_date, 'YYYY-MM') = pg_temp.mon(2) and deleted_at is null)::int,
  0, 'undo soft-deletes the inserted row');

select extensions.is(
  (select materialised_through from public.recurring_series where id = 'c1111111-1111-1111-1111-111111111111'),
  (select mt from before_state), 'undo rewinds materialised_through');

select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  null, 'undo rewinds the horizon');

-- 13-14. Re-add after undo creates the rows again (Pitfall 6).
select extensions.is(
  (public.add_activity_month((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    pg_temp.mon(2), current_date, pg_temp.step(3)) ->> 'status'),
  'applied', 're-adding the month after undo applies');

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and to_char(local_date, 'YYYY-MM') = pg_temp.mon(2) and deleted_at is null and status = 'pending')::int,
  1, 're-add creates a new live pending row');

-- 15. A series created after the add reaches the horizon.
select public.create_recurring_series(jsonb_build_object(
  'id', 'c2222222-2222-2222-2222-222222222222',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Gym', 'amount', -4000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));
select extensions.is(
  (select to_char(max(local_date), 'YYYY-MM') from public.transactions
    where recurring_series_id = 'c2222222-2222-2222-2222-222222222222'),
  pg_temp.mon(2), 'a series created after the add materialises through the household horizon');

-- 16-18. Undo is refused once the series generation moved since the add.
select extensions.is(
  (public.add_activity_month((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    pg_temp.mon(3), current_date, pg_temp.step(4)) ->> 'status'),
  'applied', 'a second contiguous add applies');

reset role;
update public.households set horizon_month = pg_temp.mon(5)
 where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111');
select count(*) from public.materialise_series('c1111111-1111-1111-1111-111111111111');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (public.apply_undo_step((pg_temp.step(4) ->> 'id')::uuid) ->> 'status'),
  'refused', 'undo is refused (not thrown) after the series generation moved');

select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  pg_temp.mon(5), 'a refused undo leaves the horizon untouched');

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and to_char(local_date, 'YYYY-MM') = pg_temp.mon(3) and deleted_at is null)::int,
  1, 'a refused undo leaves the added rows in place');

-- 19-23. A household with no series: the empty month persists; cap holds.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select extensions.is(
  (public.add_activity_month((select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'),
    pg_temp.mon(2), current_date, pg_temp.step(10)) ->> 'status'),
  'applied', 'adding a month with no series applies');

select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222')),
  pg_temp.mon(2), 'an empty added month persists (the horizon is stored, not derived)');

do $$
begin
  for i in 3..12 loop
    perform public.add_activity_month(
      (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'),
      pg_temp.mon(i), current_date, pg_temp.step(10 + i));
  end loop;
end $$;

select extensions.is(
  (select horizon_month from public.households where id = (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222')),
  pg_temp.mon(12), 'adds run through 12 months ahead');

select extensions.throws_ok(
  format($f$select public.add_activity_month(%L, %L, current_date, pg_temp.step(99))$f$,
    (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), pg_temp.mon(13)),
  '22023', null, 'the 13th month ahead is refused');

select extensions.is(
  (select count(*) from public.undo_log where owner_id = '22222222-2222-2222-2222-222222222222' and allow_system_keys)::int,
  11, 'each add recorded exactly one server-side system-key step');

select * from extensions.finish();
rollback;
