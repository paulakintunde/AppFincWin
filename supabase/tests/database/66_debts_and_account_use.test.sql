-- pgTAP: 05.2-02 -- debts.pays_in_full and the account use columns (use, use_purpose, use_envelope_id,
-- use_extra_set_aside). Migrations 20261028000500 and 20261028000600.
--
-- Needs 20261016000110 and 20261028000500, 20261028000600

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a6600000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'savings', 'USD', 0),
  ('a6600000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other', 'checking', 'USD', 0);

insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by) values
  ('b6600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Own pot', 'USD', 100000, current_date + 90),
  ('b6600000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Doomed pot', 'USD', 100000, current_date + 90),
  ('b6600000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'pot', 'Other pot', 'USD', 100000, current_date + 90);

insert into public.debts (id, household_id, created_by, name, kind, currency) values
  ('d6600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD');

-- 1. As A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$update public.debts set pays_in_full = 'sometimes' where id = 'd6600000-0000-0000-0000-000000000001'$$,
  'a client can set pays_in_full');
select extensions.is(
  (select pays_in_full from public.debts where id = 'd6600000-0000-0000-0000-000000000001'), 'sometimes',
  'pays_in_full is stored');
select extensions.lives_ok(
  $$update public.debts set pays_in_full = null where id = 'd6600000-0000-0000-0000-000000000001'$$,
  'pays_in_full accepts null');
select extensions.throws_ok(
  $$update public.debts set pays_in_full = 'maybe' where id = 'd6600000-0000-0000-0000-000000000001'$$,
  '23514', null, 'pays_in_full refuses an unknown value');

-- 2. Account use.
select extensions.lives_ok(
  $$update public.accounts set use = 'everyday' where id = 'a6600000-0000-0000-0000-000000000001'$$,
  'use accepts everyday');
select extensions.throws_ok(
  $$update public.accounts set use = 'other' where id = 'a6600000-0000-0000-0000-000000000001'$$,
  '23514', null, 'use refuses an unknown value');
select extensions.lives_ok(
  $$update public.accounts set use = 'mixed', use_extra_set_aside = 5000 where id = 'a6600000-0000-0000-0000-000000000001'$$,
  'mixed accepts an extra set-aside');
select extensions.throws_ok(
  $$update public.accounts set use_extra_set_aside = -1 where id = 'a6600000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a negative extra set-aside is refused');
select extensions.throws_ok(
  $$update public.accounts set use = 'everyday' where id = 'a6600000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a set-aside on a non-mixed account is refused by the shape check');
select extensions.lives_ok(
  $$update public.accounts set use = 'everyday', use_extra_set_aside = null where id = 'a6600000-0000-0000-0000-000000000001'$$,
  'clearing the set-aside while changing use is accepted');
select extensions.throws_ok(
  $$update public.accounts set use = 'dedicated' where id = 'a6600000-0000-0000-0000-000000000001'$$,
  '23514', null, 'dedicated requires a purpose');
select extensions.throws_ok(
  $$update public.accounts set use_purpose = 'emergency' where id = 'a6600000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a purpose is only allowed when dedicated');
select extensions.lives_ok(
  $$update public.accounts set use = 'dedicated', use_purpose = 'emergency' where id = 'a6600000-0000-0000-0000-000000000002'$$,
  'dedicated with an emergency purpose is accepted');
select extensions.throws_ok(
  $$update public.accounts set use_envelope_id = 'b6600000-0000-0000-0000-000000000001' where id = 'a6600000-0000-0000-0000-000000000002'$$,
  '23514', null, 'an envelope id needs the envelope purpose');
select extensions.lives_ok(
  $$update public.accounts set use_purpose = 'envelope', use_envelope_id = 'b6600000-0000-0000-0000-000000000001' where id = 'a6600000-0000-0000-0000-000000000002'$$,
  'an own-household envelope is accepted');
select extensions.throws_ok(
  $$update public.accounts set use_envelope_id = 'b6600000-0000-0000-0000-000000000003' where id = 'a6600000-0000-0000-0000-000000000002'$$,
  '42501', null, 'an envelope in another household is refused');
select extensions.lives_ok(
  $$update public.accounts set use_envelope_id = 'b6600000-0000-0000-0000-000000000002' where id = 'a6600000-0000-0000-0000-000000000002'$$,
  'the account can point at the pot that will be deleted');

-- 3. Deleting the envelope unlinks it (as owner).
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.lives_ok(
  $$delete from public.savings_goals where id = 'b6600000-0000-0000-0000-000000000002'$$,
  'deleting the envelope succeeds');
select extensions.is(
  (select use_envelope_id is null and use_purpose = 'envelope' from public.accounts where id = 'a6600000-0000-0000-0000-000000000002'),
  true, 'the envelope id is null and the purpose stays envelope');
select extensions.is(
  (select use from public.accounts where id = 'a6600000-0000-0000-0000-000000000002'), 'dedicated',
  'the account stays dedicated');

select * from extensions.finish();
rollback;
