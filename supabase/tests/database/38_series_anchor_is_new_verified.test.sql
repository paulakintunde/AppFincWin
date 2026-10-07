-- pgTAP: W6-13 review WR-08 (migration 20261007000100) -- create_recurring_series
-- verifies p_anchor_is_new instead of trusting it, and records anchor_created
-- only for the row the call actually linked.
--
-- Proves:
--   * an anchor that has been edited (version > 1) is not "new": the flag is
--     rejected (22023) and nothing is written;
--   * a genuinely new anchor (version 1, created by the caller) is accepted
--     after a system FX restamp, which does not bump the version;
--   * when a requested link row on the anchor's date wins the one-per-date
--     dedup, the anchor is not linked, the step carries no op for it, and
--     undo leaves it alone;
--   * W6-13 WR-05 (client fix, server sanity): a merge-shaped apply_patches
--     moves a series template's category_id with the archive op.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values
  -- edited before the series call: not new
  ('b1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -120000, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Rent'),
  -- genuinely new
  ('b2000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -5000, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Gym'),
  -- dedup collision: the link row (smaller id) and the anchor share a date
  ('b5000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -700, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Link row'),
  ('b9000000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -700, 'USD', date_trunc('month', current_date)::date, 'UTC', 'Anchor');

-- ---------------------------------------------------------------------
-- 1. An edited anchor is not new: the flag is rejected, nothing written.
-- ---------------------------------------------------------------------
update public.transactions set name = 'Rent (renamed)' where id = 'b1000000-0000-0000-0000-000000000001';

select extensions.throws_ok(
  $q$select public.create_recurring_series(
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
    true)$q$,
  '22023',
  null,
  'anchor_is_new for an anchor edited since it was inserted is rejected'
);
select extensions.is(
  (select count(*)::int from public.recurring_series where id = 'c1000000-0000-0000-0000-000000000001'),
  0,
  'no series was created'
);
select extensions.is(
  (select count(*)::int from public.undo_log where id = 'e1000000-0000-0000-0000-000000000001'),
  0,
  'no undo step was recorded'
);
select extensions.is(
  (select recurring_series_id is null and deleted_at is null from public.transactions where id = 'b1000000-0000-0000-0000-000000000001'),
  true,
  'the existing entry is untouched'
);

-- The same entry may still be made to repeat without the flag (existing-entry path).
select extensions.is(
  (public.create_recurring_series(
    jsonb_build_object(
      'id', 'c1000000-0000-0000-0000-000000000001',
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1111111-1111-1111-1111-111111111111',
      'name', 'Rent', 'amount', -120000, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
    ),
    'b1000000-0000-0000-0000-000000000001'::uuid,
    '{}'::uuid[],
    '{"id":"e1000000-0000-0000-0000-000000000001","label_key":"seriesCreated","label_params":{"name":"Rent"}}'::jsonb
  ) ->> 'status'),
  'applied',
  'without the flag an edited entry can still become a series'
);

-- ---------------------------------------------------------------------
-- 2. A new anchor after a system FX restamp (no version bump) is accepted.
-- ---------------------------------------------------------------------
reset role;
select set_config('fincwin.system_restamp', 'on', true);
update public.transactions set rate_pending = false where id = 'b2000000-0000-0000-0000-000000000002';
select set_config('fincwin.system_restamp', '', true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (select version from public.transactions where id = 'b2000000-0000-0000-0000-000000000002'),
  1,
  'a system restamp leaves a new entry at version 1'
);
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
  'applied',
  'a genuinely new anchor is accepted with the flag'
);
select extensions.is(
  (select count(*)::int from public.undo_log u, jsonb_array_elements(u.ops) o
    where u.id = 'e2000000-0000-0000-0000-000000000002'
      and o ->> 'id' = 'b2000000-0000-0000-0000-000000000002'
      and o -> 'patch' ? 'deleted_at'),
  1,
  'its step soft-deletes the new anchor'
);

-- ---------------------------------------------------------------------
-- 3. Dedup collision: the link row wins the date, the anchor is not linked,
-- so the step must not delete it.
-- ---------------------------------------------------------------------
create temp table r3 as select public.create_recurring_series(
  jsonb_build_object(
    'id', 'c3000000-0000-0000-0000-000000000003',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Cinema', 'amount', -700, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
  ),
  'b9000000-0000-0000-0000-000000000009'::uuid,
  array['b5000000-0000-0000-0000-000000000005']::uuid[],
  '{"id":"e3000000-0000-0000-0000-000000000003","label_key":"seriesCreated","label_params":{"name":"Cinema"}}'::jsonb,
  true
) as r;

select extensions.is(
  (select recurring_series_id is null from public.transactions where id = 'b9000000-0000-0000-0000-000000000009'),
  true,
  'the anchor lost the one-per-date dedup and was not linked'
);
select extensions.is(
  (select count(*)::int from public.undo_log u, jsonb_array_elements(u.ops) o
    where u.id = 'e3000000-0000-0000-0000-000000000003'
      and o ->> 'id' = 'b9000000-0000-0000-0000-000000000009'),
  0,
  'the step carries no op for the unlinked anchor'
);
select extensions.is(
  (public.apply_undo_step('e3000000-0000-0000-0000-000000000003') ->> 'status'),
  'undone',
  'the series undo applies'
);
select extensions.is(
  (select deleted_at is null from public.transactions where id = 'b9000000-0000-0000-0000-000000000009'),
  true,
  'the unlinked anchor survives the undo'
);

-- ---------------------------------------------------------------------
-- 4. WR-05 server sanity: a merge-shaped apply_patches moves a series
-- template's category with the archive op in one call.
-- ---------------------------------------------------------------------
insert into public.categories (id, name, color_key) values
  ('d1000000-0000-0000-0000-000000000001', 'Streaming', 'plum'),
  ('d2000000-0000-0000-0000-000000000002', 'Subscriptions', 'plum');

select public.edit_recurring_series_from(
  'c2000000-0000-0000-0000-000000000002',
  (select version from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
  '{"category_id":"d1000000-0000-0000-0000-000000000001"}'::jsonb,
  date_trunc('month', current_date)::date
);

create temp table r4 as select public.apply_patches(
  jsonb_build_array(
    jsonb_build_object('entity', 'recurring_series', 'id', 'c2000000-0000-0000-0000-000000000002',
      'expectedVersion', (select version from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
      'patch', jsonb_build_object('category_id', 'd2000000-0000-0000-0000-000000000002')),
    jsonb_build_object('entity', 'categories', 'id', 'd1000000-0000-0000-0000-000000000001',
      'expectedVersion', 1, 'patch', jsonb_build_object('archived_at', '$now'))
  )
) as r;

select extensions.is((select r ->> 'status' from r4), 'applied', 'the merge-shaped call is applied');
select extensions.is(
  (select category_id from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
  'd2000000-0000-0000-0000-000000000002'::uuid,
  'the series template now files under the target category'
);

select * from extensions.finish();
rollback;
