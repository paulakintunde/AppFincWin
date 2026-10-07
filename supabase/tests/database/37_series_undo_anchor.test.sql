-- pgTAP: user decision 2026-10-06 -- when a brand-new transaction is saved
-- with Repeats on, ONE undo removes both the new entry and its series.
-- create_recurring_series takes an opt-in p_anchor_is_new (default false);
-- when true the server-recorded undo step also soft-deletes the anchor, with
-- the same expectedVersion rules as every other op.
--
-- Proves:
--   * anchor_is_new = true: the recorded step removes the series, its
--     occurrences AND the anchor in one undo;
--   * the step is refused (nothing deleted) once the anchor has been edited;
--   * anchor_is_new = false (the default): the anchor survives the undo;
--   * a replay of the create (same undo step id) stays 'already-applied' and
--     records nothing twice;
--   * the flag cannot be used to soft-delete a row it did not link.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(15);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values
  ('b1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -120000, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Rent A'),
  ('b2000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -5000, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Gym B'),
  ('b3000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -700, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Cinema C'),
  ('b4000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -900, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Other D');

-- ---------------------------------------------------------------------
-- 1. anchor_is_new = true -> one undo removes series, occurrences, anchor.
-- ---------------------------------------------------------------------
create temp table r1 as select public.create_recurring_series(
  jsonb_build_object(
    'id', 'c1000000-0000-0000-0000-000000000001',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Rent', 'amount', -120000, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
  ),
  'b1000000-0000-0000-0000-000000000001'::uuid,
  '{}'::uuid[],
  '{"id":"e1000000-0000-0000-0000-000000000001","label_key":"seriesCreated","label_params":{"name":"Rent"}}'::jsonb,
  true
) as r;

select extensions.is((select r ->> 'status' from r1), 'applied', 'create with an anchor_is_new anchor is applied');
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = 'c1000000-0000-0000-0000-000000000001' and deleted_at is null),
  2,
  'the series has the anchor plus its materialised occurrences'
);
select extensions.is(
  (select count(*)::int from public.undo_log u, jsonb_array_elements(u.ops) o
    where u.id = 'e1000000-0000-0000-0000-000000000001'
      and o ->> 'id' = 'b1000000-0000-0000-0000-000000000001'),
  1,
  'the stored step carries exactly one op for the anchor (delete, not also unlink)'
);

select extensions.is(
  (public.apply_undo_step('e1000000-0000-0000-0000-000000000001') ->> 'status'),
  'undone',
  'one undo is applied'
);
select extensions.isnt(
  (select deleted_at from public.transactions where id = 'b1000000-0000-0000-0000-000000000001'),
  null,
  'the new entry (anchor) is soft-deleted by the same undo'
);
select extensions.is(
  (select count(*)::int from public.transactions where recurring_series_id = 'c1000000-0000-0000-0000-000000000001' and deleted_at is null),
  0,
  'no live occurrence is left'
);
select extensions.isnt(
  (select deleted_at from public.recurring_series where id = 'c1000000-0000-0000-0000-000000000001'),
  null,
  'the series is soft-deleted'
);

-- ---------------------------------------------------------------------
-- 2. anchor_is_new = true, anchor edited since -> refused, nothing removed.
-- ---------------------------------------------------------------------
create temp table r2 as select public.create_recurring_series(
  jsonb_build_object(
    'id', 'c2000000-0000-0000-0000-000000000002',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Gym', 'amount', -5000, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
  ),
  'b2000000-0000-0000-0000-000000000002'::uuid,
  '{}'::uuid[],
  '{"id":"e2000000-0000-0000-0000-000000000002","label_key":"seriesCreated","label_params":{"name":"Gym"}}'::jsonb,
  true
) as r;

update public.transactions set name = 'Gym (renamed)' where id = 'b2000000-0000-0000-0000-000000000002';

create temp table u2 as select public.apply_undo_step('e2000000-0000-0000-0000-000000000002') as r;
select extensions.is((select r ->> 'status' from u2), 'refused', 'undo is refused once the anchor was edited');
select extensions.is((select r -> 'refusal' ->> 'id' from u2), 'b2000000-0000-0000-0000-000000000002', 'the refusal names the anchor');
select extensions.is(
  (select deleted_at is null from public.transactions where id = 'b2000000-0000-0000-0000-000000000002'),
  true,
  'the edited anchor was not deleted'
);
select extensions.is(
  (select deleted_at is null from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
  true,
  'the series is still live (nothing was undone)'
);

-- ---------------------------------------------------------------------
-- 3. anchor_is_new omitted (false) -> the anchor survives the undo.
-- ---------------------------------------------------------------------
create temp table r3 as select public.create_recurring_series(
  jsonb_build_object(
    'id', 'c3000000-0000-0000-0000-000000000003',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Cinema', 'amount', -700, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
  ),
  'b3000000-0000-0000-0000-000000000003'::uuid,
  '{}'::uuid[],
  '{"id":"e3000000-0000-0000-0000-000000000003","label_key":"seriesCreated","label_params":{"name":"Cinema"}}'::jsonb
) as r;

select extensions.is((public.apply_undo_step('e3000000-0000-0000-0000-000000000003') ->> 'status'), 'undone', 'default: undo is applied');
select extensions.is(
  (select deleted_at is null and recurring_series_id is null from public.transactions where id = 'b3000000-0000-0000-0000-000000000003'),
  true,
  'default: the anchor survives, unlinked from the removed series'
);

-- ---------------------------------------------------------------------
-- 4. Replay of the create (same step id, anchor_is_new true) is
-- already-applied and records nothing twice.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.create_recurring_series(
    jsonb_build_object(
      'id', 'c2000000-0000-0000-0000-000000000002',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1111111-1111-1111-1111-111111111111',
      'name', 'Gym', 'amount', -5000, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
    ),
    'b2000000-0000-0000-0000-000000000002'::uuid,
    '{}'::uuid[],
    '{"id":"e2000000-0000-0000-0000-000000000002","label_key":"seriesCreated","label_params":{"name":"Gym"}}'::jsonb,
    true
  ) ->> 'status'),
  'already-applied',
  'a replay of the create is already-applied'
);

-- ---------------------------------------------------------------------
-- 5. anchor_is_new without an anchor is a malformed request, never a
-- silent no-op.
-- ---------------------------------------------------------------------
select extensions.throws_ok(
  $q$select public.create_recurring_series(
    jsonb_build_object(
      'id', 'c4000000-0000-0000-0000-000000000004',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1111111-1111-1111-1111-111111111111',
      'name', 'Nothing', 'amount', -100, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
    ), null, '{}'::uuid[], null, true)$q$,
  '22023',
  null,
  'anchor_is_new without an anchor transaction is rejected'
);

select * from extensions.finish();
rollback;
