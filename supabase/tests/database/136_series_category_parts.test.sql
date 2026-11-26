-- pgTAP: Phase 10.1 plan 30 (D-28). A repeat bill made from a split line keeps its parts, and each line the series creates
-- carries the parts scaled to that line's amount (largest remainder, odd cents to the largest part). A series without parts is
-- unchanged, and parts with a category the caller does not own are refused. Needs 20261127000500. Local stack only.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
       ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create temp table cats as
  select owner_id as o, builtin_key as k, id from public.categories where builtin_key in ('Groceries', 'Dining');
grant select on cats to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
select 'a1360000-0000-0000-0000-000000000001', id, 'Checking', 'checking', 'USD', 0 from hh where owner_id = '11111111-1111-1111-1111-111111111111';

-- scaling helper (postgres only)
select extensions.is(
  public.series_scaled_parts(
    jsonb_build_array(jsonb_build_object('c', null, 'a', -600, 'l', null), jsonb_build_object('c', null, 'a', -400, 'l', null)), -1001),
  jsonb_build_array(jsonb_build_object('c', null, 'a', -601, 'l', null), jsonb_build_object('c', null, 'a', -400, 'l', null)),
  'odd cent goes to the largest part');
select extensions.is(
  (select sum((e ->> 'a')::bigint) from jsonb_array_elements(public.series_scaled_parts(
    jsonb_build_array(jsonb_build_object('c', null, 'a', 333), jsonb_build_object('c', null, 'a', 333), jsonb_build_object('c', null, 'a', 334)), 1000)) e),
  1000::numeric, 'scaled parts add up exactly');
select extensions.is(public.series_scaled_parts(null, -500), null::jsonb, 'no parts gives null');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select extensions.is(
  (public.create_recurring_series(
    jsonb_build_object(
      'id', 'c1360000-0000-0000-0000-000000000001',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1360000-0000-0000-0000-000000000001',
      'name', 'Shop', 'amount', -1001, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC',
      'category_parts', jsonb_build_array(
        jsonb_build_object('c', (select id from cats where k = 'Groceries' and o = '11111111-1111-1111-1111-111111111111'), 'a', -600),
        jsonb_build_object('c', (select id from cats where k = 'Dining' and o = '11111111-1111-1111-1111-111111111111'), 'a', -401))
    ),
    null, '{}'::uuid[],
    '{"id":"e1360000-0000-0000-0000-000000000001","label_key":"seriesCreated","label_params":{"name":"Shop"}}'::jsonb
  ) ->> 'status'),
  'applied', 'a series with parts is created');

select extensions.ok(
  (select count(*) from public.transactions where recurring_series_id = 'c1360000-0000-0000-0000-000000000001') > 0
  and not exists (select 1 from public.transactions t where t.recurring_series_id = 'c1360000-0000-0000-0000-000000000001'
                   and (t.category_parts is null
                        or (select sum((e ->> 'a')::bigint) from jsonb_array_elements(t.category_parts) e) <> t.original_amount)),
  'every line the series made carries parts that add up to its amount');
select extensions.is(
  (select category_id from public.transactions where recurring_series_id = 'c1360000-0000-0000-0000-000000000001' limit 1),
  (select id from cats where k = 'Groceries' and o = '11111111-1111-1111-1111-111111111111'),
  'the line category is the largest part');

-- a series without parts is unchanged
select public.create_recurring_series(
    jsonb_build_object(
      'id', 'c1360000-0000-0000-0000-000000000002',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1360000-0000-0000-0000-000000000001',
      'name', 'Plain', 'amount', -500, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'),
    null, '{}'::uuid[],
    '{"id":"e1360000-0000-0000-0000-000000000002","label_key":"seriesCreated","label_params":{"name":"Plain"}}'::jsonb);
select extensions.is(
  (select count(*) from public.transactions where recurring_series_id = 'c1360000-0000-0000-0000-000000000002' and category_parts is not null),
  0::bigint, 'a series without parts makes unsplit lines');

-- another user's categories are refused
select extensions.throws_ok($$
  select public.create_recurring_series(
    jsonb_build_object(
      'id', 'c1360000-0000-0000-0000-000000000003',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1360000-0000-0000-0000-000000000001',
      'name', 'Bad', 'amount', -1000, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC',
      'category_parts', jsonb_build_array(
        jsonb_build_object('c', (select id from cats where k = 'Groceries' and o = '22222222-2222-2222-2222-222222222222'), 'a', -600),
        jsonb_build_object('c', null, 'a', -400))),
    null, '{}'::uuid[],
    '{"id":"e1360000-0000-0000-0000-000000000003","label_key":"seriesCreated","label_params":{"name":"Bad"}}'::jsonb)$$,
  'PT001', null, 'parts with a category the caller does not own are refused');

select extensions.is(
  (select count(*) from public.recurring_series where category_parts is not null), 1::bigint,
  'only the valid series stored parts');

select * from extensions.finish();
rollback;
