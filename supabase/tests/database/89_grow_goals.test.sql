-- pgTAP: Phase 06 Grow (06-04) -- savings_goals shape (open-ended, locked, one safety net), accounts.interest_rate,
-- debts Grow fields, and apply_patches (the Undo path) for the new columns. Migration 20261106000100.
-- Needs 20261016000100 .. 20261016000400, 20261024000100, 20261028000100 .. 20261106000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(33);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

create function public.t89_ver(e text, i uuid) returns integer language plpgsql as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) into v using i;
  return v;
end;
$$;
create function public.t89_ap(e text, i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', e, 'id', i, 'expectedVersion', public.t89_ver(e, i), 'patch', p))) ->> 'status');
$$;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a8900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'savings', 'USD', 0),
  ('a8900000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other savings', 'savings', 'USD', 0);
insert into public.debts (id, household_id, created_by, name, kind, currency) values
  ('d8900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD');
insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c8900000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'buy', 'Other sofa', '{"kind":"buy","itemType":"other"}');
-- A goal written without naming locked: it reads as Locked (D-22).
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by) values
  ('9a890000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Existing pot', 'USD', 100000, date '2027-06-01');

select extensions.has_column('public', 'savings_goals', 'is_safety_net', 'savings_goals.is_safety_net exists');
select extensions.has_column('public', 'savings_goals', 'locked', 'savings_goals.locked exists');
select extensions.has_column('public', 'savings_goals', 'protect', 'savings_goals.protect exists');
select extensions.has_column('public', 'savings_goals', 'up_front_only', 'savings_goals.up_front_only exists');
select extensions.has_column('public', 'savings_goals', 'icon', 'savings_goals.icon exists');
select extensions.has_column('public', 'savings_goals', 'net_confirmed_at', 'savings_goals.net_confirmed_at exists');
select extensions.has_column('public', 'accounts', 'interest_rate', 'accounts.interest_rate exists');
select extensions.has_column('public', 'debts', 'started_balance', 'debts.started_balance exists');
select extensions.has_column('public', 'debts', 'payoff_order', 'debts.payoff_order exists');
select extensions.has_column('public', 'debts', 'payoff_extra', 'debts.payoff_extra exists');
select extensions.has_column('public', 'debts', 'extra_series_id', 'debts.extra_series_id exists');
select extensions.is((select locked from public.savings_goals where id = '9a890000-0000-0000-0000-000000000009'), true,
  'a goal that existed without a locked value reads as Locked (D-22)');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok($$insert into public.savings_goals (id, household_id, name, currency, monthly_amount, locked)
  values ('9a890000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Open ended', 'USD', 5000, true)$$,
  'an open-ended goal (no target, no date) with a monthly amount saves');
select extensions.lives_ok($$insert into public.savings_goals (id, household_id, name, currency, target, monthly_amount, locked)
  values ('9a890000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Laptop', 'USD', 120000, 10000, true)$$,
  'a goal with a target and a monthly amount saves');
select extensions.lives_ok($$insert into public.savings_goals (id, household_id, name, currency, monthly_amount, is_safety_net, locked)
  values ('9a890000-0000-0000-0000-0000000000a1', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Safety net', 'USD', 20000, true, false)$$,
  'the first safety-net goal saves');
select extensions.is((select locked from public.savings_goals where id = '9a890000-0000-0000-0000-0000000000a1'), true,
  'a safety net sent with locked false reads back locked');
select extensions.throws_ok($$insert into public.savings_goals (id, household_id, name, currency, is_safety_net, locked)
  values ('9a890000-0000-0000-0000-0000000000a2', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Second net', 'USD', true, true)$$,
  '23505', null, 'a second live safety net for the same person is refused');
select extensions.lives_ok($$update public.savings_goals set locked = false where id = '9a890000-0000-0000-0000-0000000000a1'$$,
  'updating locked on the safety net does not error');
select extensions.is((select locked from public.savings_goals where id = '9a890000-0000-0000-0000-0000000000a1'), true,
  'the safety net stays locked');

select extensions.throws_ok($$select public.t89_ap('savings_goals', '9a890000-0000-0000-0000-000000000001', '{"is_safety_net":true}')$$,
  '22023', null, 'a client apply_patches cannot set is_safety_net');
select extensions.is((select is_safety_net from public.savings_goals where id = '9a890000-0000-0000-0000-000000000001'), false,
  'the flag is unchanged after the refused patch');
select extensions.throws_ok($$update public.savings_goals set is_safety_net = true where id = '9a890000-0000-0000-0000-000000000001'$$,
  '42501', null, 'a direct client update of is_safety_net is refused (no column grant)');
select extensions.throws_ok($$update public.savings_goals set deleted_at = now() where id = '9a890000-0000-0000-0000-0000000000a1'$$,
  '42501', null, 'the safety net cannot be removed');
select extensions.throws_ok($$insert into public.savings_goals (id, household_id, name, currency, monthly_amount, account_id)
  values ('9a890000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Bad account', 'USD', 100, 'a8900000-0000-0000-0000-000000000002')$$,
  '42501', null, 'a goal with an account from another household is refused');
select extensions.throws_ok($$insert into public.savings_goals (id, household_id, name, currency, monthly_amount, check_id)
  values ('9a890000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Bad check', 'USD', 100, 'c8900000-0000-0000-0000-000000000002')$$,
  '42501', null, 'a goal linked to another person''s check is refused');

-- apply_patches sets and undoes the new goal columns.
select extensions.is(public.t89_ap('savings_goals', '9a890000-0000-0000-0000-000000000001', '{"locked":false}'),
  'applied', 'apply_patches sets locked false');
select extensions.is((select locked from public.savings_goals where id = '9a890000-0000-0000-0000-000000000001'), false, 'locked reads false');
select extensions.is(public.t89_ap('savings_goals', '9a890000-0000-0000-0000-000000000001', '{"locked":true}'),
  'applied', 'the undo step puts locked back');
select extensions.is((select locked from public.savings_goals where id = '9a890000-0000-0000-0000-000000000001'), true, 'locked reads true again');

select extensions.is(public.t89_ap('debts', 'd8900000-0000-0000-0000-000000000001', '{"payoff_order":"rate"}'),
  'applied', 'apply_patches sets debts.payoff_order');
select extensions.throws_ok($$select public.t89_ap('debts', 'd8900000-0000-0000-0000-000000000001', '{"payoff_extra":100}')$$,
  '22023', null, 'payoff_extra is not patchable');
select extensions.is(public.t89_ap('accounts', 'a8900000-0000-0000-0000-000000000001', '{"interest_rate":"4.5"}'),
  'applied', 'apply_patches sets accounts.interest_rate');
select extensions.throws_ok($$update public.accounts set interest_rate = '4.5%' where id = 'a8900000-0000-0000-0000-000000000001'$$,
  '23514', null, 'a rate with a percent sign is refused');

select * from extensions.finish();
rollback;
