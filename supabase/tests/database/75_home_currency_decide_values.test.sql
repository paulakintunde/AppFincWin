-- pgTAP: Phase 05.2 review CR-03 -- change_home_currency stamps decide_settings.currency and clears money answers.
-- Migration 20261029000200. Needs 20261010000400 and 20261028001000.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.85, current_date, 'frankfurter-v2'),
  ('EUR', 'JPY', 160, current_date, 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

update public.profiles set home_currency = 'GBP'
 where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');

-- Settings fixtures (table owner). A: null currency + money set. B: null currency, no money. C: already stamped.
insert into public.decide_settings (user_id, currency, everyday_override) values ('11111111-1111-1111-1111-111111111111', null, 200000)
  on conflict (user_id) do update set currency = null, everyday_override = 200000;
insert into public.decide_settings (user_id, currency) values ('22222222-2222-2222-2222-222222222222', null)
  on conflict (user_id) do update set currency = null;
insert into public.decide_settings (user_id, currency, steady_amount) values ('33333333-3333-3333-3333-333333333333', 'EUR', 1)
  on conflict (user_id) do update set currency = 'EUR', steady_amount = 1;

insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c7500000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Sofa', '{"kind":"buy"}'),
  ('c7500000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'buy', 'Bike', '{"kind":"buy"}');

-- A: all four kinds live, plus one already-deleted income answer. C: one live income answer.
insert into public.decide_answers (id, household_id, created_by, kind, key, amount, bool_value, on_date, check_id, deleted_at) values
  ('a7500000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'expected_income', '2026-11', 100000, null, '2026-11-01', null, null),
  ('a7500000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'held_bridge', 'c7500000-0000-0000-0000-000000000001', 5000, null, null, 'c7500000-0000-0000-0000-000000000001', null),
  ('a7500000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'volatile_cover', 'c7500000-0000-0000-0000-000000000001', null, true, null, 'c7500000-0000-0000-0000-000000000001', null),
  ('a7500000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'pay_arrival', 'a7500000-0000-0000-0000-0000000000aa:2026-10-25', null, true, '2026-10-25', null, null),
  ('a7500000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'expected_income', '2026-10', 90000, null, '2026-10-01', null, '2026-10-02 00:00:00+00'),
  ('a7500000-0000-0000-0000-000000000006', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'expected_income', '2026-11', 70000, null, '2026-11-01', null, null);

set local role authenticated;

-- Failure and no-op first, as A: nothing is touched.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.change_home_currency('JPY', 'USD', current_date)$$,
  '40001', null, 'a stale p_from is refused');
select extensions.is(
  public.change_home_currency('GBP', 'GBP', current_date)->>'status', 'unchanged', 'same currency returns unchanged');
reset role;
select extensions.is(
  (select currency is null from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), true,
  'refusal and unchanged leave the settings currency null');
select extensions.is(
  (select count(*)::int from public.decide_answers where created_by = '11111111-1111-1111-1111-111111111111' and deleted_at is null), 4,
  'refusal and unchanged leave the four live answers');

-- The switch itself, as A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(
  public.change_home_currency('JPY', 'GBP', current_date)->>'status', 'applied', 'the switch applies');
reset role;

select extensions.is(
  (select currency from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 'GBP',
  'null currency with a money figure is stamped with the old home currency');
select extensions.is(
  (select everyday_override from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 200000::bigint,
  'the money figure itself is not converted');
select extensions.is(
  (select string_agg(kind, ',' order by kind) from public.decide_answers where created_by = '11111111-1111-1111-1111-111111111111' and deleted_at is null),
  'pay_arrival,volatile_cover', 'live expected_income and held_bridge answers are cleared; pay_arrival and volatile_cover stay');
select extensions.is(
  (select deleted_at from public.decide_answers where id = 'a7500000-0000-0000-0000-000000000005'), '2026-10-02 00:00:00+00'::timestamptz,
  'an already-deleted answer keeps its original deleted_at');
select extensions.is(
  (select count(*)::int from public.decide_answers where created_by = '33333333-3333-3333-3333-333333333333' and deleted_at is null), 1,
  'another user''s answers are untouched');
select extensions.is(
  (select currency from public.decide_settings where user_id = '33333333-3333-3333-3333-333333333333'), 'EUR',
  'another user''s settings are untouched');

-- B: null currency, no money column set -> stays null.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  public.change_home_currency('JPY', 'GBP', current_date)->>'status', 'applied', 'the second user''s switch applies');
reset role;
select extensions.is(
  (select currency is null from public.decide_settings where user_id = '22222222-2222-2222-2222-222222222222'), true,
  'a settings row with no money figure keeps a null currency');

-- C: already stamped EUR, switching GBP -> JPY leaves it EUR.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select public.change_home_currency('JPY', 'GBP', current_date);
reset role;
select extensions.is(
  (select currency from public.decide_settings where user_id = '33333333-3333-3333-3333-333333333333'), 'EUR',
  'an already-stamped settings row is not restamped');

select * from extensions.finish();
rollback;
