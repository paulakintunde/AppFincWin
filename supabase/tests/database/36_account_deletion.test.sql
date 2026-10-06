-- pgTAP: review fix D-WR-08 -- deleting a user (auth.users) with Phase 2
-- data present succeeds and purges everything (D-30, CLAUDE.md: in-app
-- account deletion is mandatory and must actually purge).
--
-- The cascade from auth.users -> households fans out to transactions,
-- recurring_series and accounts, while transactions -> recurring_series,
-- transactions -> accounts and recurring_series -> accounts are all
-- ON DELETE RESTRICT. This proves that diamond resolves (the RESTRICT checks
-- see every sibling cascade) for a user holding: categories (seeded and
-- custom), accounts, live and soft-deleted transactions, a recurring series
-- with materialised, linked and soft-deleted occurrences, a transfer pair,
-- undo steps and an import profile. It also proves a non-owner member's
-- deletion leaves the household's data in place (their authored rows just
-- lose created_by), and that the deferred transfer-pair check is satisfied
-- at commit.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household, so B's later deletion is a non-owner member leaving.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'checking', 'USD', 0);

insert into public.categories (id, name, color_key) values ('c0000000-0000-0000-0000-0000000000c1', 'Hobbies', 'teal');

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, category_id) values
  ('70000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -1000, 'USD', current_date, 'UTC', 'Live row', 'c0000000-0000-0000-0000-0000000000c1'),
  ('70000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -2000, 'USD', current_date, 'UTC', 'To be deleted', null),
  ('70000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -3000, 'USD', current_date, 'UTC', 'Becomes a series', null),
  ('70000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000001', -500, 'USD', current_date, 'UTC', 'Transfer out', null),
  ('70000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1000000-0000-0000-0000-000000000002', 500, 'USD', current_date, 'UTC', 'Transfer in', null);

-- Transfer pair, linked through apply_patches.
select public.apply_patches(
  '[{"entity":"transactions","id":"70000000-0000-0000-0000-000000000004","expectedVersion":1,"patch":{"transfer_id":"d0000000-0000-0000-0000-0000000000d1"}},
    {"entity":"transactions","id":"70000000-0000-0000-0000-000000000005","expectedVersion":1,"patch":{"transfer_id":"d0000000-0000-0000-0000-0000000000d1"}}]'::jsonb
);

-- A soft-deleted row with an undo step pinning it.
select public.apply_patches(
  '[{"entity":"transactions","id":"70000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb,
  '{"id":"e0000000-0000-0000-0000-0000000000e1","label_key":"deleted","label_params":{},
    "ops":[{"entity":"transactions","id":"70000000-0000-0000-0000-000000000002","expectedVersion":2,"patch":{"deleted_at":null}}]}'::jsonb
);

-- A series with a linked anchor row, materialised rows and its own undo step,
-- then a this-and-future edit that soft-deletes a pending occurrence.
select public.create_recurring_series(
  jsonb_build_object(
    'id', 'c5000000-0000-0000-0000-000000000005',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1000000-0000-0000-0000-000000000001',
    'name', 'Becomes a series', 'amount', -3000, 'currency', 'USD', 'freq', 'monthly', 'time_zone', 'UTC',
    'category_id', 'c0000000-0000-0000-0000-0000000000c1'
  ),
  '70000000-0000-0000-0000-000000000003'::uuid, '{}'::uuid[],
  '{"id":"e0000000-0000-0000-0000-0000000000e2","label_key":"seriesCreated","label_params":{}}'::jsonb
);
select public.edit_recurring_series_from(
  'c5000000-0000-0000-0000-000000000005'::uuid, 1, '{"amount": -3100}'::jsonb,
  (date_trunc('month', current_date) + interval '1 month')::date
);

insert into public.import_profiles (id, account_id, layout_signature, profile)
values ('f0000000-0000-0000-0000-0000000000f1', 'a1000000-0000-0000-0000-000000000001', 'sig-1', '{"sign":"positive-is-in"}'::jsonb);
reset role;

-- B (a non-owner member) also authors a series and a row in A's household.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.create_recurring_series(jsonb_build_object(
  'id', 'c6000000-0000-0000-0000-000000000006',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1000000-0000-0000-0000-000000000002',
  'name', 'B''s bill', 'amount', -700, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));
reset role;

-- Sanity: the fixture really has data in every table.
select extensions.ok(
  (select count(*) from public.transactions where household_id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) > 5
  and (select count(*) from public.recurring_series) = 2
  and (select count(*) from public.undo_log where owner_id = '11111111-1111-1111-1111-111111111111') = 2
  and (select count(*) from public.import_profiles) = 1
  and (select count(*) from public.transactions where deleted_at is not null) >= 2,
  'fixture: A has live and soft-deleted rows, two series, undo steps and an import profile'
);

-- 1. Deleting a non-owner member keeps the household's data; their
-- authored series simply loses created_by.
select extensions.lives_ok(
  $$delete from auth.users where id = '22222222-2222-2222-2222-222222222222'$$,
  'deleting a non-owner member succeeds'
);
select extensions.is(
  (select created_by from public.recurring_series where id = 'c6000000-0000-0000-0000-000000000006'),
  null,
  'the departed member''s series stays, with created_by cleared'
);
select extensions.lives_ok(
  $$set constraints all immediate$$,
  'every deferred check (transfer pairs) holds after the member deletion'
);
set constraints all deferred;

-- 2. Deleting the owner purges the whole household.
select extensions.lives_ok(
  $$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$,
  'deleting the owner with Phase 2 data present succeeds'
);
select extensions.lives_ok(
  $$set constraints all immediate$$,
  'every deferred check holds after the owner deletion'
);
select extensions.is((select count(*)::int from public.households), 0, 'no household remains');
select extensions.is((select count(*)::int from public.accounts), 0, 'no account remains');
select extensions.is((select count(*)::int from public.transactions), 0, 'no transaction remains (live or soft-deleted)');
select extensions.is((select count(*)::int from public.recurring_series), 0, 'no recurring series remains');
select extensions.is((select count(*)::int from public.categories), 0, 'no category remains');
select extensions.is((select count(*)::int from public.undo_log), 0, 'no undo step remains');
select extensions.is((select count(*)::int from public.import_profiles), 0, 'no import profile remains');
select extensions.is((select count(*)::int from public.profiles), 0, 'no profile remains');

select * from extensions.finish();
rollback;
