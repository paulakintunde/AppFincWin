-- pgTAP: Phase 5 plan 03 -- Decide tables (D-14, D-15, OQ1, OQ3, OQ5). Needs 20261016000100.
-- RLS isolation (checks and links owner-private, debts and periods household-wide), column grants,
-- ownership guards, kind/inputs consistency, decided-check read-only rule and erasure cascade.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household; C stays alone.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- An account and a transaction in A's and in C's household.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -999, 'USD', current_date, 'UTC', 'Coffee');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a3333333-3333-3333-3333-333333333333', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'C wallet', 'cash', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('b3333333-3333-3333-3333-333333333333', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'a3333333-3333-3333-3333-333333333333', -500, 'USD', current_date, 'UTC', 'C coffee');
reset role;

-- One recurring series per household (inserted as the table owner).
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone)
values
  ('c1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'A loan payment', -100, 'USD', 'monthly',
   date_trunc('month', current_date)::date, 'UTC'),
  ('c3333333-3333-3333-3333-333333333333', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'a3333333-3333-3333-3333-333333333333', 'C bill', -200, 'USD', 'monthly',
   date_trunc('month', current_date)::date, 'UTC');

select extensions.ok(
  (select count(*) = 5 and bool_and(relrowsecurity) from pg_class
    where oid in ('public.decide_checks'::regclass, 'public.decide_settings'::regclass, 'public.debts'::regclass,
                  'public.decide_links'::regclass, 'public.statement_periods'::regclass)),
  'all five Decide tables exist with RLS enabled');

-- ---------------------------------------------------------------- As A: checks
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.decide_checks (id, household_id, name, inputs)
    values ('d1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Sofa', '{"kind":"buy","price":120000}')$$,
  'A inserts an open check in A''s household');
select extensions.is(
  (select count(*)::int from public.decide_checks where id = 'd1000000-0000-0000-0000-000000000001'),
  1, 'A sees their own check');
select extensions.throws_ok(
  $$update public.decide_checks set status = 'bought' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client update of status has no column grant');
select extensions.lives_ok(
  $$update public.decide_checks set inputs = '{"kind":"buy","price":130000}' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  'A edits the inputs of an open check');
select extensions.is(
  (select version from public.decide_checks where id = 'd1000000-0000-0000-0000-000000000001'),
  2, 'the edit bumped the version');
select extensions.lives_ok(
  $$update public.decide_checks set kind = 'invest', inputs = '{"kind":"invest","price":130000}' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  'A switches an open check to invest with inputs.kind in the same update');
select extensions.throws_ok(
  $$update public.decide_checks set kind = 'buy' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'kind buy with inputs.kind invest is refused');
select extensions.throws_ok(
  $$insert into public.decide_checks (id, household_id, inputs)
    values ('d1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '[1,2]')$$,
  '23514', null, 'inputs that are a JSON array are refused');
select extensions.throws_ok(
  $$insert into public.decide_checks (id, household_id, inputs)
    values ('d1000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            jsonb_build_object('k', (select string_agg(md5(i::text), '') from generate_series(1, 6000) i)))$$,
  '23514', null, 'inputs larger than 32 KB are refused');
reset role;

-- Server side: the Decide RPC (05-04) is the only writer of a decision. Simulated here as the table owner.
update public.decide_checks set status = 'passed', decided_at = now()
 where id = 'd1000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$update public.decide_checks set inputs = '{"kind":"invest","price":1}' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a decided check''s inputs are read-only');
select extensions.throws_ok(
  $$update public.decide_checks set kind = 'buy', inputs = '{"kind":"buy"}' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a decided check''s kind is fixed');
select extensions.lives_ok(
  $$update public.decide_checks set last_seen_state = 'fits', last_seen_basis = 'logged_months' where id = 'd1000000-0000-0000-0000-000000000001'$$,
  'last seen state still updates on a decided check');
select extensions.lives_ok(
  $$update public.decide_checks set deleted_at = now() where id = 'd1000000-0000-0000-0000-000000000001'$$,
  'a decided check can still be soft deleted');

-- ---------------------------------------------------------------- As A: settings
select extensions.lives_ok(
  $$insert into public.decide_settings (user_id, currency, rough_income, dsr_line) values ('11111111-1111-1111-1111-111111111111', 'USD', 500000, '40')$$,
  'A inserts their settings row');
select extensions.lives_ok(
  $$update public.decide_settings set dsr_line = '36' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'dsr_line 36 is accepted');
select extensions.throws_ok(
  $$update public.decide_settings set dsr_line = '36.123456' where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'dsr_line with six decimals is refused');

-- ---------------------------------------------------------------- As A: debts
select extensions.lives_ok(
  $$insert into public.debts (id, household_id, account_id, name, kind, currency, balance, apr)
    values ('de000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a1111111-1111-1111-1111-111111111111', 'Visa', 'card', 'USD', 100000, '19.99')$$,
  'A inserts a card debt on A''s account');
select extensions.throws_ok(
  $$insert into public.debts (id, household_id, account_id, name, kind, currency)
    values ('de000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a3333333-3333-3333-3333-333333333333', 'Foreign', 'loan', 'USD')$$,
  '42501', null, 'a debt naming another household''s account is refused');
select extensions.throws_ok(
  $$insert into public.debts (id, household_id, series_id, name, kind, currency)
    values ('de000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'c3333333-3333-3333-3333-333333333333', 'Foreign series', 'loan', 'USD')$$,
  '42501', null, 'a debt paid by another household''s series is refused');
select extensions.lives_ok(
  $$insert into public.debts (id, household_id, series_id, name, kind, currency, minimum_payment)
    values ('de000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'c1111111-1111-1111-1111-111111111111', 'Car loan', 'loan', 'USD', 10000)$$,
  'a debt paid by A''s own series is accepted');
select extensions.throws_ok(
  $$insert into public.debts (id, household_id, account_id, name, kind, currency)
    values ('de000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a1111111-1111-1111-1111-111111111111', 'Visa again', 'card', 'USD')$$,
  '23505', null, 'a second live card record for one account is refused');
select extensions.lives_ok(
  $$update public.debts set min_percent = '2.5', min_interest_added = true, min_floor = 2500, paid_in_full = true
     where id = 'de000000-0000-0000-0000-000000000001'$$,
  'A sets the card minimum terms and paid in full');
select extensions.is(
  (select version from public.debts where id = 'de000000-0000-0000-0000-000000000001'),
  2, 'the card terms update bumped the version');
select extensions.throws_ok(
  $$update public.debts set min_percent = '1.5.0' where id = 'de000000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a malformed min_percent is refused');

-- ---------------------------------------------------------------- As A: links
select extensions.lives_ok(
  $$insert into public.decide_links (id, household_id, check_id, entity, target_id)
    values ('f1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'd1000000-0000-0000-0000-000000000001', 'transactions', 'b1111111-1111-1111-1111-111111111111')$$,
  'A links their check to their own transaction');
select extensions.is(
  (select source from public.decide_links where id = 'f1000000-0000-0000-0000-000000000001'),
  'attached', 'a client link is always source attached');
select extensions.throws_ok(
  $$insert into public.decide_links (id, household_id, check_id, entity, target_id)
    values ('f1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'd1000000-0000-0000-0000-000000000001', 'transactions', 'b3333333-3333-3333-3333-333333333333')$$,
  '42501', null, 'a link to another household''s transaction is refused');

-- ---------------------------------------------------------------- As A: statement periods
select extensions.lives_ok(
  $$insert into public.statement_periods (id, household_id, account_id, period_start, period_end)
    values ('5a000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a1111111-1111-1111-1111-111111111111', '2026-08-01', '2026-08-31')$$,
  'A records a statement period on A''s account');
select extensions.throws_ok(
  $$insert into public.statement_periods (id, household_id, account_id, period_start, period_end)
    values ('5a000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a3333333-3333-3333-3333-333333333333', '2026-08-01', '2026-08-31')$$,
  '23503', null, 'a period on another household''s account is refused');
reset role;

-- ---------------------------------------------------------------- As B (A's household member)
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.decide_checks) + (select count(*)::int from public.decide_links),
  0, 'B sees none of A''s checks or links (owner-private)');
select extensions.is(
  (select count(*)::int from public.debts where id = 'de000000-0000-0000-0000-000000000001'),
  1, 'B reads A''s household debt');
select extensions.is(
  (select count(*)::int from public.statement_periods),
  1, 'B reads the household''s statement period');
reset role;

-- ---------------------------------------------------------------- As C
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.decide_checks) + (select count(*)::int from public.decide_links)
    + (select count(*)::int from public.decide_settings),
  0, 'C sees none of A''s checks, links or settings');
select extensions.is(
  (select count(*)::int from public.debts) + (select count(*)::int from public.statement_periods),
  0, 'C sees none of A''s debts or statement periods');
reset role;

-- ---------------------------------------------------------------- Erasure
select extensions.lives_ok(
  $$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$,
  'deleting A succeeds');
select extensions.is(
  (select count(*)::int from public.decide_checks where household_id in (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))
  + (select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from public.decide_links where created_by = '11111111-1111-1111-1111-111111111111')
  + (select count(*)::int from public.debts where household_id in (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))
  + (select count(*)::int from public.statement_periods where household_id in (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')),
  0, 'deleting A purges every Decide row');

select * from extensions.finish();
rollback;
