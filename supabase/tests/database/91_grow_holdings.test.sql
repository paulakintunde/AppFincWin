-- pgTAP: Phase 06 Grow (06-04) -- holdings and holding_lots: owner-private RLS, the seeded value lot, the value sync
-- trigger, lot guards, apply_patches (the Undo path) and erasure. Migration 20261106000100.
-- Needs 20261016000100 .. 20261016000400, 20261024000100, 20261028000100 .. 20261106000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(26);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create temp table a_hh as select id from hh where owner_id = '11111111-1111-1111-1111-111111111111';
grant select on a_hh to authenticated;

-- B joins A's household as a member.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from a_hh), '22222222-2222-2222-2222-222222222222', 'member', 1);

create function public.t91_ver(e text, i uuid) returns integer language plpgsql as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) into v using i;
  return v;
end;
$$;
create function public.t91_ap(e text, i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', e, 'id', i, 'expectedVersion', public.t91_ver(e, i), 'patch', p))) ->> 'status');
$$;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9100000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other account', 'checking', 'USD', 0);

select extensions.has_table('public', 'holdings', 'holdings exists');
select extensions.has_table('public', 'holding_lots', 'holding_lots exists');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok($$insert into public.holdings (id, household_id, name, type, currency, value, value_as_of, opening_put_in)
  values ('b9100000-0000-0000-0000-000000000001', (select id from a_hh), 'Brokerage', 'brokerage', 'USD', 645000, date '2026-11-01', 580000)$$,
  'the owner saves a holding');
select extensions.is((select count(*)::int from public.holding_lots where holding_id = 'b9100000-0000-0000-0000-000000000001' and kind = 'value'), 1,
  'creating a holding seeds one value lot (history starts at creation)');

select extensions.lives_ok($$insert into public.holding_lots (id, holding_id, household_id, kind, amount, local_date)
  values ('1a910000-0000-0000-0000-000000000001', 'b9100000-0000-0000-0000-000000000001', (select id from a_hh), 'value', 650000, date '2026-11-05')$$,
  'the owner logs a newer value');
select extensions.is((select value::int from public.holdings where id = 'b9100000-0000-0000-0000-000000000001'), 650000,
  'the holding value follows the latest value lot');
select extensions.is((select value_as_of::text from public.holdings where id = 'b9100000-0000-0000-0000-000000000001'), '2026-11-05',
  'value_as_of follows the latest value lot');

select extensions.lives_ok($$update public.holding_lots set deleted_at = now() where id = '1a910000-0000-0000-0000-000000000001'$$,
  'the owner removes that value lot');
select extensions.is((select value::int from public.holdings where id = 'b9100000-0000-0000-0000-000000000001'), 645000,
  'the value falls back to the previous value lot');
select extensions.is((select value_as_of::text from public.holdings where id = 'b9100000-0000-0000-0000-000000000001'), '2026-11-01',
  'value_as_of falls back too');

select extensions.throws_ok($$update public.holdings set value = 1 where id = 'b9100000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a client cannot write holdings.value directly (no column grant)');
select extensions.throws_ok($$insert into public.holdings (id, household_id, name, type, currency, value, value_as_of)
  values ('b9100000-0000-0000-0000-000000000002', (select id from a_hh), 'Bad type', 'isa', 'USD', 1, date '2026-11-01')$$,
  '23514', null, 'an unknown holding type is refused');
select extensions.throws_ok($$insert into public.holding_lots (id, holding_id, household_id, kind, amount, units, local_date)
  values ('1a910000-0000-0000-0000-000000000002', 'b9100000-0000-0000-0000-000000000001', (select id from a_hh), 'buy', 100, '1.123456789', date '2026-11-02')$$,
  '23514', null, 'units with more than eight decimals are refused');
select extensions.throws_ok($$insert into public.holdings (id, household_id, name, type, currency, value, value_as_of, account_id)
  values ('b9100000-0000-0000-0000-000000000003', (select id from a_hh), 'Bad account', 'other', 'USD', 1, date '2026-11-01', 'a9100000-0000-0000-0000-000000000002')$$,
  '42501', null, 'a holding linked to an account of another household is refused');

-- B is a member of A's household but sees none of A's holdings.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.holdings), 0, 'a household member cannot see another member''s holdings');
select extensions.is((select count(*)::int from public.holding_lots), 0, 'nor their lots');
select extensions.throws_ok($$insert into public.holding_lots (id, holding_id, household_id, kind, amount, local_date)
  values ('1a910000-0000-0000-0000-000000000003', 'b9100000-0000-0000-0000-000000000001', (select id from a_hh), 'buy', 100, date '2026-11-02')$$,
  '42501', null, 'a lot on someone else''s holding is refused');

-- apply_patches sets and undoes holding and lot columns.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok($$insert into public.holding_lots (id, holding_id, household_id, kind, amount, local_date)
  values ('1a910000-0000-0000-0000-000000000004', 'b9100000-0000-0000-0000-000000000001', (select id from a_hh), 'buy', 10000, date '2026-11-03')$$,
  'the owner logs a buy');
select extensions.is(public.t91_ap('holdings', 'b9100000-0000-0000-0000-000000000001', '{"monthly_amount":15000}'),
  'applied', 'apply_patches sets holdings.monthly_amount');
select extensions.is(public.t91_ap('holdings', 'b9100000-0000-0000-0000-000000000001', '{"monthly_amount":null}'),
  'applied', 'the undo step clears holdings.monthly_amount');
select extensions.is(public.t91_ap('holding_lots', '1a910000-0000-0000-0000-000000000004', '{"note":"x"}'),
  'applied', 'apply_patches sets holding_lots.note');
select extensions.is(public.t91_ap('holding_lots', '1a910000-0000-0000-0000-000000000004', '{"note":null}'),
  'applied', 'the undo step clears holding_lots.note');

-- Erasure: deleting the people erases the holdings and lots (GDPR).
reset role;
select extensions.lives_ok($$delete from auth.users where id = '22222222-2222-2222-2222-222222222222'$$, 'deleting the member succeeds');
select extensions.lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'deleting the owner succeeds');
select extensions.is((select count(*)::int from public.holdings), 0, 'no holdings remain');
select extensions.is((select count(*)::int from public.holding_lots), 0, 'no holding_lots remain');

select * from extensions.finish();
rollback;
