-- pgTAP: Phase 06 Grow (06-25) -- record_debt_one_off, transactions.debt_id and the confirmed safety net.
-- Migration 20261106000400. Needs 20261106000100 .. 20261106000400.
-- Dates are relative to current_date.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Readers are security definer so they see rows whoever the caller is.
create function public.t94_get(t text, i uuid, c text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I::text from public.%I where id = $1', c, t) into v using i;
  return v;
end;
$$;
create function public.t94_ver(t text, i uuid) returns integer language sql security definer set search_path = '' as $$
  select public.t94_get(t, i, 'version')::integer;
$$;
create function public.t94_flagged(u uuid) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.savings_goals g where g.created_by = u and g.is_safety_net and g.deleted_at is null;
$$;

-- record_debt_one_off: p_amount out, dated today.
create function public.t94_oneoff(p_debt uuid, p_amount bigint, p_acct uuid, p_step uuid, p_label text, p_tx uuid)
returns jsonb language sql as $$
  select public.record_debt_one_off(p_debt,
    jsonb_build_object('id', p_tx, 'account_id', p_acct, 'amount', p_amount, 'currency', 'USD',
      'local_date', current_date, 'time_zone', 'UTC', 'name', 'Extra payment'),
    jsonb_build_object('id', p_step, 'label_key', p_label, 'label_params', jsonb_build_object('name', 'Auto loan')));
$$;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9400000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a9400000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other checking', 'checking', 'USD', 0);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment) values
  ('d9400000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Auto loan', 'loan', 'USD', 842000, 45000),
  ('d9400000-0000-0000-0000-000000000009', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'Other loan', 'loan', 'USD', 500000, 20000);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment, paid_off_on) values
  ('d9400000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Paid loan', 'loan', 'USD', 100000, 5000, current_date - 1);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment, deleted_at) values
  ('d9400000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Removed loan', 'loan', 'USD', 100000, 5000, now());
-- Two ordinary goals for the safety-net cases; the second is already confirmed.
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, net_confirmed_at) values
  ('9a940000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Holiday', 'USD', null),
  ('9a940000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Car fund', 'USD', '2026-02-02 00:00:00+00');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- record_debt_one_off ---------------------------------------------------------------------------------------------------
select extensions.is(
  public.t94_oneoff('d9400000-0000-0000-0000-000000000001', 100000, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000001', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000001') ->> 'status',
  'applied', 'record_debt_one_off applies');
select extensions.is((select count(*)::integer from public.transactions
    where id = 'b9400000-0000-0000-0000-000000000001' and status = 'pending' and original_amount = -100000
      and debt_id = 'd9400000-0000-0000-0000-000000000001'), 1,
  'one pending payment out of 100000, linked to the debt by debt_id');
select extensions.is((select balance from public.debts where id = 'd9400000-0000-0000-0000-000000000001'), 842000::bigint,
  'the debt balance is unchanged');
select extensions.is((select label_key from public.undo_log where id = 'e9400000-0000-0000-0000-000000000001'), 'debtOneOffRecorded',
  'one undo step is recorded with label debtOneOffRecorded');

select extensions.is(
  public.t94_oneoff('d9400000-0000-0000-0000-000000000001', 100000, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000001', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000002') ->> 'status',
  'already-applied', 'the same undo step id again is already-applied');
select extensions.is((select count(*)::integer from public.transactions where debt_id = 'd9400000-0000-0000-0000-000000000001'), 1,
  'a replay leaves one transaction');

select extensions.is(public.apply_undo_step('e9400000-0000-0000-0000-000000000001') ->> 'status', 'undone', 'Undo of the one-off is undone');
select extensions.is((select count(*)::integer from public.transactions_active where id = 'b9400000-0000-0000-0000-000000000001'), 0,
  'Undo: the payment no longer appears in transactions_active');

select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000001', 0, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000002', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000003')$$,
  '22023', null, 'an amount of 0 is refused');
select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000001', 842001, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000003', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000004')$$,
  '22023', null, 'an amount above the balance is refused');
select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000002', 1000, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000004', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000005')$$,
  '22023', null, 'a paid-off debt is refused');
select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000003', 1000, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000005', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000006')$$,
  '22023', null, 'a removed debt is refused');
select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000009', 1000, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000006', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000007')$$,
  '42501', null, 'another household''s debt is refused');
select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000001', 1000, 'a9400000-0000-0000-0000-000000000002',
    'e9400000-0000-0000-0000-000000000007', 'debtOneOffRecorded', 'b9400000-0000-0000-0000-000000000008')$$,
  '42501', null, 'another household''s account is refused');
select extensions.throws_ok(
  $$select public.t94_oneoff('d9400000-0000-0000-0000-000000000001', 1000, 'a9400000-0000-0000-0000-000000000001',
    'e9400000-0000-0000-0000-000000000008', 'debtPlanSaved', 'b9400000-0000-0000-0000-000000000009')$$,
  '22023', null, 'another RPC''s undo label (debtPlanSaved) is refused');
select extensions.is((select count(*)::integer from public.transactions
    where id in ('b9400000-0000-0000-0000-000000000003', 'b9400000-0000-0000-0000-000000000004', 'b9400000-0000-0000-0000-000000000005',
                 'b9400000-0000-0000-0000-000000000006', 'b9400000-0000-0000-0000-000000000007', 'b9400000-0000-0000-0000-000000000008',
                 'b9400000-0000-0000-0000-000000000009')
       or id = 'b9400000-0000-0000-0000-000000000002'), 0,
  'the refused and replayed calls wrote no rows');

-- debt_id is not client-writable ----------------------------------------------------------------------------------------
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, debt_id)
    values ('b9400000-0000-0000-0000-000000000020', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a9400000-0000-0000-0000-000000000001', -500, 'USD', current_date, 'UTC', 'Sneaky', 'd9400000-0000-0000-0000-000000000001')$$,
  '42501', null, 'a client insert that sets debt_id is permission denied');

-- The guard still fires for a writer that bypasses grants (the table owner).
reset role;
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency, local_date, time_zone, name, debt_id)
    values ('b9400000-0000-0000-0000-000000000021', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'a9400000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', -500, 'USD', current_date, 'UTC', 'Cross',
            'd9400000-0000-0000-0000-000000000009')$$,
  '22023', null, 'the guard refuses a debt from another household');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.has_column('public', 'transactions_active', 'debt_id', 'transactions_active exposes debt_id');

-- Safety net starts confirmed -------------------------------------------------------------------------------------------
select extensions.lives_ok(
  $$insert into public.savings_goals (id, household_id, kind, name, currency, is_safety_net, locked, net_confirmed_at)
    values ('9a940000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            'pot', 'Safety net', 'USD', true, true, '2026-01-01 00:00:00+00')$$,
  'a client can insert a safety net that starts confirmed');

select extensions.is(public.set_safety_net('9a940000-0000-0000-0000-000000000001',
  jsonb_build_object('9a940000-0000-0000-0000-000000000009', public.t94_ver('savings_goals', '9a940000-0000-0000-0000-000000000009'),
                     '9a940000-0000-0000-0000-000000000001', public.t94_ver('savings_goals', '9a940000-0000-0000-0000-000000000001')),
  '{"id":"e9400000-0000-0000-0000-0000000000a1","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'applied', 'set_safety_net applies to a normal goal');
select extensions.ok((select net_confirmed_at is not null from public.savings_goals where id = '9a940000-0000-0000-0000-000000000001'),
  'the new net has net_confirmed_at set');

select extensions.is(public.set_safety_net('9a940000-0000-0000-0000-000000000002',
  jsonb_build_object('9a940000-0000-0000-0000-000000000001', public.t94_ver('savings_goals', '9a940000-0000-0000-0000-000000000001'),
                     '9a940000-0000-0000-0000-000000000002', public.t94_ver('savings_goals', '9a940000-0000-0000-0000-000000000002')),
  '{"id":"e9400000-0000-0000-0000-0000000000a2","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'applied', 'set_safety_net swaps to an already-confirmed goal');
select extensions.is((select net_confirmed_at from public.savings_goals where id = '9a940000-0000-0000-0000-000000000002'),
  '2026-02-02 00:00:00+00'::timestamptz, 'an already-confirmed net keeps its original net_confirmed_at');
select extensions.is(public.t94_flagged('11111111-1111-1111-1111-111111111111'), 1, 'exactly one live flagged goal after the swaps');

select * from extensions.finish();
rollback;
