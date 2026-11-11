-- pgTAP: Phase 06 Grow (06-07) -- save_debt_plan and record_debt_sale. Migration 20261106000300, as re-issued in 20261110000100.
-- Needs 20261016000100 .. 20261016000400, 20261024000100, 20261028000100 .. 20261106000100 and 20261106000300.
-- The chained-Undo cases at the end need undo_adjusted_ops as re-issued in 20261106000100 (06-04 follow-up).
-- Dates are relative to current_date so the monthly materialiser horizon never changes what is asserted.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(56);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

create function public.t93_ver(e text, i uuid) returns integer language plpgsql as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) into v using i;
  return v;
end;
$$;

-- save_debt_plan with a fixed Expected series payload.
create function public.t93_plan(p_debt uuid, p_ver integer, p_extra bigint, p_order text, p_series uuid, p_step uuid, p_label text)
returns jsonb language sql as $$
  select public.save_debt_plan(p_debt, p_ver, p_extra, p_order,
    jsonb_build_object('id', p_series, 'account_id', 'a9300000-0000-0000-0000-000000000001',
      'anchor_date', (current_date + 2), 'time_zone', 'UTC', 'name', 'Extra payment', 'category_id', null),
    jsonb_build_object('id', p_step, 'label_key', p_label, 'label_params', jsonb_build_object('name', 'Auto loan')));
$$;

-- record_debt_sale: the sale is 1000000 into the account; the payment (when given) is p_pay out, dated current_date + 20.
create function public.t93_sale(p_debt uuid, p_ver integer, p_pay bigint, p_acct uuid, p_step uuid, p_label text, p_sale_id uuid, p_pay_id uuid)
returns jsonb language sql as $$
  select public.record_debt_sale(p_debt, p_ver,
    jsonb_build_object('id', p_sale_id, 'account_id', p_acct, 'amount', 1000000, 'currency', 'USD',
      'local_date', (current_date + 20), 'time_zone', 'UTC', 'name', 'Sold the car'),
    case when p_pay is null then null else jsonb_build_object('id', p_pay_id, 'account_id', p_acct, 'amount', p_pay,
      'currency', 'USD', 'local_date', (current_date + 20), 'time_zone', 'UTC', 'name', 'Final payment') end,
    jsonb_build_object('id', p_step, 'label_key', p_label, 'label_params', jsonb_build_object('name', 'Auto loan')));
$$;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9300000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a9300000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other checking', 'checking', 'USD', 0);
-- The Auto loan's payment series (monthly from tomorrow), its pending rows, and three debts.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5a930000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a9300000-0000-0000-0000-000000000001', 'Auto loan payment', -45000, 'USD', 'monthly', current_date + 1, 'UTC');
do $$ begin perform public.materialise_series('5a930000-0000-0000-0000-000000000001'); end $$;
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment, series_id) values
  ('d9300000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Auto loan', 'loan', 'USD', 842000, 45000, '5a930000-0000-0000-0000-000000000001');
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment) values
  ('d9300000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Second loan', 'loan', 'USD', 842000, 30000),
  ('d9300000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD', 120000, 5000),
  ('d9300000-0000-0000-0000-000000000009', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'),
   '33333333-3333-3333-3333-333333333333', 'Other loan', 'loan', 'USD', 500000, 20000),
  ('d9300000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Undo loan', 'loan', 'USD', 600000, 20000),
  ('d9300000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Chain loan', 'loan', 'USD', 400000, 15000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- save_debt_plan: extra 5000, balance order ----------------------------------------------------------------------
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000002', 1, 5000, 'balance', '5a930000-0000-0000-0000-000000000002',
    'e9300000-0000-0000-0000-000000000001', 'debtPlanSaved') ->> 'status',
  'applied', 'save_debt_plan applies');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000002'), 5000::bigint,
  'payoff_extra is 5000');
select extensions.is((select payoff_order from public.debts where id = 'd9300000-0000-0000-0000-000000000002'), 'balance',
  'payoff_order is balance');
select extensions.is((select extra_series_id from public.debts where id = 'd9300000-0000-0000-0000-000000000002'),
  '5a930000-0000-0000-0000-000000000002'::uuid, 'extra_series_id points at the new series');
select extensions.ok(
  (select count(*) from public.transactions where recurring_series_id = '5a930000-0000-0000-0000-000000000002'
      and status = 'pending' and deleted_at is null) > 0,
  'the Expected extra payment has pending rows');
select extensions.is((select amount from public.recurring_series where id = '5a930000-0000-0000-0000-000000000002'), -5000::bigint,
  'the series is money out of the extra amount');
select extensions.is((select count(*)::integer from public.undo_log where id = 'e9300000-0000-0000-0000-000000000001'), 1,
  'one undo step is recorded');

-- The same step again is a replay: no second series.
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000002', 1, 5000, 'balance', '5a930000-0000-0000-0000-000000000003',
    'e9300000-0000-0000-0000-000000000001', 'debtPlanSaved') ->> 'status',
  'already-applied', 'the same undo step id again is already-applied');
select extensions.is((select count(*)::integer from public.recurring_series where household_id =
    (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111') and name = 'Extra payment'), 1,
  'a replay leaves one series');

-- A stale version is a conflict; a bad order is refused.
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000002', 1, 7000, 'rate', '5a930000-0000-0000-0000-000000000004',
    'e9300000-0000-0000-0000-000000000002', 'debtPlanSaved') ->> 'status',
  'conflict', 'a stale version is a conflict');
select extensions.throws_ok(
  $$select public.t93_plan('d9300000-0000-0000-0000-000000000002', 2, 7000, 'best', '5a930000-0000-0000-0000-000000000004',
    'e9300000-0000-0000-0000-000000000002', 'debtPlanSaved')$$,
  '22023', null, 'order best is refused');
select extensions.throws_ok(
  $$select public.t93_plan('d9300000-0000-0000-0000-000000000002', 2, 7000, 'rate', '5a930000-0000-0000-0000-000000000004',
    'e9300000-0000-0000-0000-000000000005', 'goalMade')$$,
  '22023', null, 'save_debt_plan refuses another RPC''s undo label (goalMade)');
select extensions.is((select count(*)::integer from public.undo_log where id = 'e9300000-0000-0000-0000-000000000005'), 0,
  'a refused label writes no undo step');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000002'), 5000::bigint,
  'a refused call leaves the plan as it was');

-- Another household's debt is refused.
select extensions.throws_ok(
  $$select public.t93_plan('d9300000-0000-0000-0000-000000000009', 1, 5000, 'rate', '5a930000-0000-0000-0000-000000000006',
    'e9300000-0000-0000-0000-000000000006', 'debtPlanSaved')$$,
  '42501', null, 'save_debt_plan refuses another household''s debt');

-- Extra 0 ends the series and clears the pointer.
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000002', public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000002'), 0, 'balance',
    null, 'e9300000-0000-0000-0000-000000000003', 'debtPlanSaved') ->> 'status',
  'applied', 'extra 0 applies');
select extensions.is((select extra_series_id from public.debts where id = 'd9300000-0000-0000-0000-000000000002'), null::uuid,
  'extra 0 clears extra_series_id');
-- 20261110000100: the series had not reached its first date (anchor current_date + 2), so it is dropped, not ended.
select extensions.ok((select deleted_at is not null from public.recurring_series
    where id = '5a930000-0000-0000-0000-000000000002'), 'extra 0 before the first date drops the Expected series');

-- record_debt_sale: paid in full ---------------------------------------------------------------------------------
select extensions.is(
  public.t93_sale('d9300000-0000-0000-0000-000000000001', 1, 842000, 'a9300000-0000-0000-0000-000000000001',
    'e9300000-0000-0000-0000-000000000011', 'debtSaleRecorded',
    '7a930000-0000-0000-0000-000000000001', '7a930000-0000-0000-0000-000000000002') ->> 'paid_off',
  'true', 'a payment of the full balance pays the debt off');
select extensions.is((select balance from public.debts where id = 'd9300000-0000-0000-0000-000000000001'), 0::bigint,
  'the balance is 0');
select extensions.is((select paid_off_on from public.debts where id = 'd9300000-0000-0000-0000-000000000001'), current_date + 20,
  'paid_off_on is the payment date');
select extensions.is((select count(*)::integer from public.transactions
    where id in ('7a930000-0000-0000-0000-000000000001', '7a930000-0000-0000-0000-000000000002')), 2,
  'the sale and the final payment are both recorded');
select extensions.ok((select end_date is not null from public.recurring_series where id = '5a930000-0000-0000-0000-000000000001'),
  'the payment series has an end date');
select extensions.is((select count(*)::integer from public.transactions where recurring_series_id = '5a930000-0000-0000-0000-000000000001'
    and status = 'pending' and deleted_at is null and occurrence_date > current_date + 20), 0,
  'no pending payment rows after the paid-off date');

-- Partial payoff: the debt stays open --------------------------------------------------------------------------
select extensions.is(
  public.t93_sale('d9300000-0000-0000-0000-000000000003', 1, 500000 - 380000, 'a9300000-0000-0000-0000-000000000001',
    'e9300000-0000-0000-0000-000000000012', 'debtSaleRecorded',
    '7a930000-0000-0000-0000-000000000003', '7a930000-0000-0000-0000-000000000004') ->> 'still_owed',
  '0', 'a payment above the balance pays the card off (control)');
select extensions.is(
  (public.t93_sale('d9300000-0000-0000-0000-000000000002', public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000002'), 500000,
    'a9300000-0000-0000-0000-000000000001', 'e9300000-0000-0000-0000-000000000013', 'debtSaleRecorded',
    '7a930000-0000-0000-0000-000000000005', '7a930000-0000-0000-0000-000000000006') ->> 'still_owed')::bigint,
  342000::bigint, 'a smaller payment leaves 342000 still owed');
select extensions.is((select paid_off_on from public.debts where id = 'd9300000-0000-0000-0000-000000000002'), null::date,
  'a partial payment leaves paid_off_on empty');

-- Refusals and replay ------------------------------------------------------------------------------------------
select extensions.throws_ok(
  $$select public.t93_sale('d9300000-0000-0000-0000-000000000002', public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000002'), 1000, 'a9300000-0000-0000-0000-000000000002',
    'e9300000-0000-0000-0000-000000000014', 'debtSaleRecorded',
    '7a930000-0000-0000-0000-000000000007', '7a930000-0000-0000-0000-000000000008')$$,
  '42501', null, 'an account from another household is refused');
select extensions.is(
  public.t93_sale('d9300000-0000-0000-0000-000000000001', 1, 842000, 'a9300000-0000-0000-0000-000000000001',
    'e9300000-0000-0000-0000-000000000011', 'debtSaleRecorded',
    '7a930000-0000-0000-0000-000000000001', '7a930000-0000-0000-0000-000000000002') ->> 'status',
  'already-applied', 'replaying the sale step is already-applied');
select extensions.throws_ok(
  $$select public.t93_sale('d9300000-0000-0000-0000-000000000002', 5, 1000, 'a9300000-0000-0000-0000-000000000001',
    'e9300000-0000-0000-0000-000000000015', 'goalMade',
    '7a930000-0000-0000-0000-000000000009', '7a930000-0000-0000-0000-00000000000a')$$,
  '22023', null, 'record_debt_sale refuses the goalMade label');
select extensions.is((select count(*)::integer from public.transactions
    where id in ('7a930000-0000-0000-0000-000000000009', '7a930000-0000-0000-0000-00000000000a')), 0,
  'a refused label writes no rows');

-- Undo of a plan save restores payoff_extra, extra_series_id and payoff_order --------------------------------------
-- First plan: 3000 by rate on series ...0011. Second plan: 8000 by balance on series ...0012 (ends ...0011).
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000004', 1, 3000, 'rate', '5a930000-0000-0000-0000-000000000011',
    'e9300000-0000-0000-0000-000000000021', 'debtPlanSaved') ->> 'status',
  'applied', 'Undo setup: the first plan applies');
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000004', public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000004'), 8000,
    'balance', '5a930000-0000-0000-0000-000000000012', 'e9300000-0000-0000-0000-000000000022', 'debtPlanSaved') ->> 'status',
  'applied', 'Undo setup: the second plan applies');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000004'), 8000::bigint,
  'Undo setup: payoff_extra is 8000 before Undo');
select extensions.is(public.apply_undo_step('e9300000-0000-0000-0000-000000000022') ->> 'status', 'undone',
  'Undo of the second plan save is undone');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000004'), 3000::bigint,
  'Undo: payoff_extra is back to 3000');
select extensions.is((select extra_series_id from public.debts where id = 'd9300000-0000-0000-0000-000000000004'),
  '5a930000-0000-0000-0000-000000000011'::uuid, 'Undo: extra_series_id points at the first series again');
select extensions.is((select payoff_order from public.debts where id = 'd9300000-0000-0000-0000-000000000004'), 'rate',
  'Undo: payoff_order is back to rate');
select extensions.ok((select end_date is null and end_reason is null and deleted_at is null from public.recurring_series
    where id = '5a930000-0000-0000-0000-000000000011'), 'Undo: the first series runs again');
select extensions.ok((select deleted_at is not null from public.recurring_series where id = '5a930000-0000-0000-0000-000000000012'),
  'Undo: the second series is removed');

-- The two columns stay server-only for a plain client write and for a client-recorded step.
select extensions.throws_ok(
  format($f$select public.apply_patches('[{"entity":"debts","id":"d9300000-0000-0000-0000-000000000004","expectedVersion":%s,"patch":{"payoff_extra":1}}]'::jsonb)$f$,
    public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000004')),
  '22023', null, 'a client apply_patches cannot set payoff_extra');
select extensions.throws_ok(
  format($f$select public.apply_patches('[{"entity":"debts","id":"d9300000-0000-0000-0000-000000000004","expectedVersion":%s,"patch":{"extra_series_id":null}}]'::jsonb)$f$,
    public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000004')),
  '22023', null, 'a client apply_patches cannot set extra_series_id');
insert into public.undo_log (id, label_key, label_params, ops)
values ('e9300000-0000-0000-0000-000000000023', 'debtEdited', '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('entity', 'debts', 'id', 'd9300000-0000-0000-0000-000000000004',
    'expectedVersion', public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000004'),
    'patch', jsonb_build_object('payoff_extra', 1))));
select extensions.is(public.apply_undo_step('e9300000-0000-0000-0000-000000000023') ->> 'status', 'refused',
  'a client-recorded step that sets payoff_extra is refused');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000004'), 3000::bigint,
  'the refused step leaves payoff_extra at 3000');

-- Follow-up (06-04): chained Undo across steps stored with allow_system_keys ---------------------------------------
-- Undo of a system step does not bump versions, so the earlier step's ops are raised by one version per row for it.
-- 1. The first plan save (system step), after the second one (system step, which ended the first series) was undone.
select extensions.is(public.apply_undo_step('e9300000-0000-0000-0000-000000000021') ->> 'status', 'undone',
  'Chained Undo: the first plan save is undone after the second');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000004'), 0::bigint,
  'Chained Undo: payoff_extra is back to 0');
select extensions.is((select extra_series_id from public.debts where id = 'd9300000-0000-0000-0000-000000000004'), null::uuid,
  'Chained Undo: extra_series_id is empty again');
select extensions.ok((select deleted_at is not null from public.recurring_series where id = '5a930000-0000-0000-0000-000000000011'),
  'Chained Undo: the first series is removed');
select extensions.is((select count(*)::integer from public.transactions where recurring_series_id = '5a930000-0000-0000-0000-000000000011'
    and status = 'pending' and deleted_at is null), 0, 'Chained Undo: no Expected extra payment of it is left');

-- 2. Edit a debt (client step), save a plan (system step), Undo the plan, Undo the edit.
select extensions.is(public.apply_patches(
  jsonb_build_array(jsonb_build_object('entity', 'debts', 'id', 'd9300000-0000-0000-0000-000000000005', 'expectedVersion', 1,
    'patch', jsonb_build_object('name', 'Chain loan renamed'))),
  jsonb_build_object('id', 'e9300000-0000-0000-0000-000000000031', 'label_key', 'debtEdited', 'label_params', '{}'::jsonb,
    'ops', jsonb_build_array(jsonb_build_object('entity', 'debts', 'id', 'd9300000-0000-0000-0000-000000000005', 'expectedVersion', 2,
      'patch', jsonb_build_object('name', 'Chain loan'))))) ->> 'status',
  'applied', 'Chain: the debt is edited with a client-recorded step');
select extensions.is(
  public.t93_plan('d9300000-0000-0000-0000-000000000005', 2, 4000, 'rate', '5a930000-0000-0000-0000-000000000031',
    'e9300000-0000-0000-0000-000000000032', 'debtPlanSaved') ->> 'status',
  'applied', 'Chain: a plan is saved on the edited debt');
select extensions.is(public.apply_undo_step('e9300000-0000-0000-0000-000000000032') ->> 'status', 'undone', 'Chain: Undo of the plan');
select extensions.is(public.t93_ver('debts', 'd9300000-0000-0000-0000-000000000005'), 3,
  'Chain: Undo of the plan leaves the debt at the version the plan left it');
select extensions.is(public.apply_undo_step('e9300000-0000-0000-0000-000000000031') ->> 'status', 'undone',
  'Chain: Undo of the earlier edit is not refused');
select extensions.is((select name from public.debts where id = 'd9300000-0000-0000-0000-000000000005'), 'Chain loan',
  'Chain: the debt''s name is back');
select extensions.is((select payoff_extra from public.debts where id = 'd9300000-0000-0000-0000-000000000005'), 0::bigint,
  'Chain: the plan stays undone');

select * from extensions.finish();
rollback;
