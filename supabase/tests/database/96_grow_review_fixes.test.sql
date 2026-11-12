-- pgTAP: Phase 06 Grow code review fixes. Migration 20261110000200 (06-REVIEW.md part 1 and the data side of parts 3-5).
-- Needs every migration up to 20261110000200. Dates are relative to current_date so the materialiser horizon never changes
-- what is asserted. Undo goes through apply_undo_step as the owner.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(84);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Readers are security definer so they see rows whoever the caller is.
create function public.t96_get(t text, i uuid, c text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I::text from public.%I where id = $1', c, t) into v using i;
  return v;
end;
$$;
create function public.t96_ver(t text, i uuid) returns integer language sql security definer set search_path = '' as $$
  select public.t96_get(t, i, 'version')::integer;
$$;
create function public.t96_bal(i uuid) returns bigint language sql security definer set search_path = '' as $$
  select balance from public.debts where id = i;
$$;
-- Live Expected lines of a series.
create function public.t96_pending(s uuid) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.transactions where recurring_series_id = s and status = 'pending' and deleted_at is null;
$$;
-- apply_patches on one row at its current version, with a client-recorded step whose op puts `back` again.
create function public.t96_patch(e text, i uuid, p jsonb, step uuid, back jsonb) returns jsonb language sql as $$
  select public.apply_patches(
    jsonb_build_array(jsonb_build_object('entity', e, 'id', i, 'expectedVersion', public.t96_ver(e, i), 'patch', p)),
    case when step is null then null else jsonb_build_object('id', step, 'label_key', 'edited', 'label_params', '{}'::jsonb,
      'ops', jsonb_build_array(jsonb_build_object('entity', e, 'id', i, 'expectedVersion', public.t96_ver(e, i) + 1, 'patch', back))) end);
$$;
-- The first line of a series by date.
create function public.t96_first(s uuid) returns uuid language sql security definer set search_path = '' as $$
  select id from public.transactions where recurring_series_id = s order by occurrence_date, id limit 1;
$$;
create function public.t96_step(i uuid, label text) returns jsonb language sql as $$
  select jsonb_build_object('id', i, 'label_key', label, 'label_params', jsonb_build_object('name', 'Test'));
$$;
create function public.t96_one_off(p_debt uuid, p_tx uuid, p_amount bigint, p_cur text, p_name text, p_step uuid) returns jsonb language sql as $$
  select public.record_debt_one_off(p_debt,
    jsonb_build_object('id', p_tx, 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', p_amount, 'currency', p_cur,
      'local_date', current_date, 'time_zone', 'UTC', 'name', p_name),
    public.t96_step(p_step, 'debtOneOffRecorded'));
$$;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a9600000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'savings', 'USD', 0);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment) values
  ('d9600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Clamp card', 'card', 'USD', 100000, 5000),
  ('d9600000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Euro loan', 'loan', 'EUR', 100000, 5000),
  ('d9600000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Plan loan', 'loan', 'USD', 400000, 10000);
-- The sale loan has a payment series whose first payment is 10 days away; the removed loan's started 40 days ago.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5a960000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a9600000-0000-0000-0000-000000000001', 'Car payment', -20000, 'USD', 'monthly', current_date + 10, 'UTC'),
  ('5a960000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a9600000-0000-0000-0000-000000000001', 'Van payment', -15000, 'USD', 'monthly', current_date - 40, 'UTC');
do $$ begin
  perform public.materialise_series('5a960000-0000-0000-0000-000000000001');
  perform public.materialise_series('5a960000-0000-0000-0000-000000000002');
end $$;
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment, series_id) values
  ('d9600000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Car loan', 'loan', 'USD', 300000, 20000, '5a960000-0000-0000-0000-000000000001'),
  ('d9600000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Van loan', 'loan', 'USD', 500000, 15000, '5a960000-0000-0000-0000-000000000002');
-- The van's first payment was made.
update public.transactions set status = 'paid'
 where recurring_series_id = '5a960000-0000-0000-0000-000000000002' and occurrence_date = current_date - 40;
-- A USD line linked to the EUR loan, still Expected.
insert into public.transactions (id, household_id, account_id, created_by, original_amount, original_currency, local_date, time_zone,
                                 name, status, debt_id) values
  ('7a960000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   'a9600000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', -30000, 'USD', current_date, 'UTC',
   'Wrong currency', 'pending', 'd9600000-0000-0000-0000-000000000002');
-- A Wait goal, as the Decide RPC writes it.
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, monthly_amount, ready_by) values
  ('9a960000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'wait', 'Sofa', 'USD', 500000, 50000, current_date + 90);
select set_config('fincwin.decide_rpc', '', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- P1-CR-01: the value sync does not move the holding's version -------------------------------------------------------------
insert into public.holdings (id, household_id, name, type, currency, value, value_as_of, opening_put_in)
values ('b9600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        'Brokerage', 'brokerage', 'USD', 645000, current_date - 5, 580000);
select extensions.is(public.t96_ver('holdings', 'b9600000-0000-0000-0000-000000000001'), 1,
  'P1-CR-01: a new holding is still version 1 after its value entry is seeded');
insert into public.holding_lots (id, holding_id, household_id, kind, amount, local_date)
values ('1a960000-0000-0000-0000-000000000001', 'b9600000-0000-0000-0000-000000000001',
        (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'value', 700000, current_date);
select extensions.is(public.t96_get('holdings', 'b9600000-0000-0000-0000-000000000001', 'value'), '700000',
  'P1-CR-01: the holding value still follows the newest value entry');
select extensions.is(public.t96_ver('holdings', 'b9600000-0000-0000-0000-000000000001'), 1,
  'P1-CR-01: and its version does not move');
select extensions.is(public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'holdings',
    'id', 'b9600000-0000-0000-0000-000000000001', 'expectedVersion', 1, 'patch', jsonb_build_object('deleted_at', '$now')))) ->> 'status',
  'applied', 'P1-CR-01: the "holding added" Undo op (version 1) applies after a value update');
select extensions.lives_ok($$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'holdings',
    'id', 'b9600000-0000-0000-0000-000000000001', 'expectedVersion', 2, 'patch', jsonb_build_object('deleted_at', null))))$$,
  'the holding is back');

-- P1-IN-02: the last value entry of a live holding cannot be removed -----------------------------------------------------
select extensions.lives_ok($$update public.holding_lots set deleted_at = now() where id = '1a960000-0000-0000-0000-000000000001'$$,
  'P1-IN-02: a value entry that is not the last can be removed');
select extensions.is(public.t96_get('holdings', 'b9600000-0000-0000-0000-000000000001', 'value'), '645000',
  'P1-IN-02: the value falls back to the seeded entry');
select extensions.throws_ok($$update public.holding_lots set deleted_at = now()
    where holding_id = 'b9600000-0000-0000-0000-000000000001' and kind = 'value' and deleted_at is null$$,
  '22023', null, 'P1-IN-02: the last value entry is refused');

-- P1-CR-02 / P1-WR-02: paying past the balance and un-paying are exact inverses; the debt version does not move ----------
select extensions.is(public.t96_one_off('d9600000-0000-0000-0000-000000000001', '7a960000-0000-0000-0000-000000000001', 80000, 'USD', 'One-off A',
  'e9600000-0000-0000-0000-000000000001') ->> 'status', 'applied', 'one-off A of 800 on a 1,000 balance');
select extensions.is(public.t96_one_off('d9600000-0000-0000-0000-000000000001', '7a960000-0000-0000-0000-000000000002', 80000, 'USD', 'One-off B',
  'e9600000-0000-0000-0000-000000000002') ->> 'status', 'applied', 'one-off B of 800 on the same balance');
select extensions.is(public.t96_patch('transactions', '7a960000-0000-0000-0000-000000000001', '{"status":"paid"}', null, null) ->> 'status',
  'applied', 'mark A paid');
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000001'), 20000::bigint, 'A takes 800 off: 200 left');
select extensions.is(public.t96_patch('transactions', '7a960000-0000-0000-0000-000000000002', '{"status":"paid"}',
  'e9600000-0000-0000-0000-000000000003', '{"status":"pending"}') ->> 'status', 'applied', 'mark B paid');
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000001'), 0::bigint, 'B takes the last 200: 0 left, not below');
select extensions.is(public.t96_ver('debts', 'd9600000-0000-0000-0000-000000000001'), 1,
  'P1-WR-02: the debt version has not moved with its balance');
select extensions.is(public.apply_undo_step('e9600000-0000-0000-0000-000000000003') ->> 'status', 'undone', 'Undo of "mark B paid"');
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000001'), 20000::bigint,
  'P1-CR-02: Undo puts back the 200 B took, not 800');
select extensions.is(public.t96_patch('transactions', '7a960000-0000-0000-0000-000000000001', '{"status":"pending"}', null, null) ->> 'status',
  'applied', 'mark A unpaid');
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000001'), 100000::bigint, 'the balance is back to 1,000 exactly');
select extensions.is(public.t96_patch('debts', 'd9600000-0000-0000-0000-000000000001', '{"name":"Clamp card 2"}', null, null) ->> 'status',
  'applied', 'P1-WR-02: a debt edit at the version the client last saw still applies');

-- P1-WR-03: currency ---------------------------------------------------------------------------------------------------
select extensions.throws_ok($$select public.t96_one_off('d9600000-0000-0000-0000-000000000003', '7a960000-0000-0000-0000-000000000003', 1000, 'EUR',
  'Euro one-off', 'e9600000-0000-0000-0000-000000000004')$$, '22023', null, 'P1-WR-03: a one-off in another currency is refused');
reset role;
update public.transactions set status = 'paid' where id = '7a960000-0000-0000-0000-000000000009';
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000002'), 100000::bigint,
  'P1-WR-03: a paid USD line linked to a EUR loan does not move its balance');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- P3-WR-07: a long name is cut to 80, not refused; P1-IN-03: the 3-argument undo check still refuses another label -----
select extensions.is(public.t96_one_off('d9600000-0000-0000-0000-000000000003', '7a960000-0000-0000-0000-000000000004', 1000, 'USD',
  repeat('x', 100), 'e9600000-0000-0000-0000-000000000005') ->> 'status', 'applied', 'P3-WR-07: a 100-character one-off name is accepted');
select extensions.is(char_length(public.t96_get('transactions', '7a960000-0000-0000-0000-000000000004', 'name')), 80,
  'P3-WR-07: the stored name is 80 characters');
select extensions.is(right(public.t96_get('transactions', '7a960000-0000-0000-0000-000000000004', 'name'), 1), chr(8230),
  'P3-WR-07: and ends with an ellipsis');
select extensions.throws_ok($$select public.record_debt_one_off('d9600000-0000-0000-0000-000000000003',
    jsonb_build_object('id', '7a960000-0000-0000-0000-000000000005', 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', 1000,
      'currency', 'USD', 'local_date', current_date, 'time_zone', 'UTC', 'name', 'x'),
    public.t96_step('e9600000-0000-0000-0000-000000000006', 'goalMade'))$$,
  '22023', null, 'P1-IN-03: the 3-argument undo check still refuses a label that is not the RPC''s own');

-- P1-WR-04 / P3-WR-01: a new paid-from account is not ignored; the RPC returns the debt's version -----------------------
select extensions.is((public.save_debt_plan('d9600000-0000-0000-0000-000000000003', 1, 5000, 'rate',
    jsonb_build_object('id', '5a960000-0000-0000-0000-000000000011', 'account_id', 'a9600000-0000-0000-0000-000000000001',
      'anchor_date', current_date + 2, 'time_zone', 'UTC', 'name', 'Extra on Plan loan', 'category_id', null),
    public.t96_step('e9600000-0000-0000-0000-000000000007', 'debtPlanSaved')) ->> 'version')::integer,
  2, 'P3-WR-01: save_debt_plan returns the debt''s new version (1 -> 2)');
select extensions.is(public.save_debt_plan('d9600000-0000-0000-0000-000000000003', public.t96_ver('debts', 'd9600000-0000-0000-0000-000000000003'),
    5000, 'rate',
    jsonb_build_object('id', '5a960000-0000-0000-0000-000000000012', 'account_id', 'a9600000-0000-0000-0000-000000000002',
      'anchor_date', current_date + 2, 'time_zone', 'UTC', 'name', 'Extra on Plan loan', 'category_id', null),
    public.t96_step('e9600000-0000-0000-0000-000000000008', 'debtPlanSaved')) ->> 'series_id',
  '5a960000-0000-0000-0000-000000000012', 'P1-WR-04: the same amount from another account makes a new series');
select extensions.is(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000012', 'account_id'),
  'a9600000-0000-0000-0000-000000000002', 'P1-WR-04: the extra now comes out of Savings');
select extensions.ok(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000011', 'deleted_at') is not null,
  'P1-WR-04: the unstarted Checking series is dropped');

-- record_debt_sale: P1-WR-06 / P5-WR-05 / P1-WR-07 / P3-WR-01 -----------------------------------------------------------
select extensions.is(public.record_debt_sale('d9600000-0000-0000-0000-000000000004', 1,
    jsonb_build_object('id', '7a960000-0000-0000-0000-000000000011', 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', 900000,
      'currency', 'USD', 'local_date', current_date, 'time_zone', 'UTC', 'name', 'Sold the car'),
    jsonb_build_object('id', '7a960000-0000-0000-0000-000000000012', 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', 300000,
      'currency', 'USD', 'local_date', current_date, 'time_zone', 'UTC', 'name', 'Car loan final payment'),
    public.t96_step('e9600000-0000-0000-0000-000000000011', 'debtSaleRecorded')) ->> 'paid_off',
  'true', 'the sale pays the car loan off');
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000004'), 0::bigint, 'the balance is 0');
select extensions.is(public.t96_get('transactions', '7a960000-0000-0000-0000-000000000012', 'debt_id'),
  'd9600000-0000-0000-0000-000000000004', 'P1-WR-06: the final payment is linked to the debt');
select extensions.is(public.t96_get('transactions', '7a960000-0000-0000-0000-000000000011', 'debt_id'),
  'd9600000-0000-0000-0000-000000000004', 'P5-WR-05: the sale line is linked to the debt too');
select extensions.is(public.t96_ver('debts', 'd9600000-0000-0000-0000-000000000004'), 2,
  'the debt moved one version (the payoff date), not two');
select extensions.ok(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000001', 'deleted_at') is null,
  'P1-WR-07: a sale before the first payment keeps the payment series');
select extensions.is(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000001', 'end_date'), (current_date + 10)::text,
  'P1-WR-07: it ends on its first date');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000001'), 0, 'P1-WR-07: and no Expected payment is left');
select extensions.is(public.apply_undo_step('e9600000-0000-0000-0000-000000000011') ->> 'status', 'undone', 'Undo of the sale');
select extensions.is(public.t96_bal('d9600000-0000-0000-0000-000000000004'), 300000::bigint,
  'P5-WR-05: Undo puts the 300,000 back once, not twice');
select extensions.ok(public.t96_get('debts', 'd9600000-0000-0000-0000-000000000004', 'paid_off_on') is null, 'Undo: the loan is open again');
select extensions.ok(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000001', 'end_date') is null,
  'Undo: the payment series runs again');
select extensions.ok(public.t96_pending('5a960000-0000-0000-0000-000000000001') > 0, 'Undo: its Expected payments are back');
select extensions.is((public.record_debt_sale('d9600000-0000-0000-0000-000000000004', public.t96_ver('debts', 'd9600000-0000-0000-0000-000000000004'),
    jsonb_build_object('id', '7a960000-0000-0000-0000-000000000013', 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', 50000,
      'currency', 'USD', 'local_date', current_date, 'time_zone', 'UTC', 'name', repeat('y', 120)),
    jsonb_build_object('id', '7a960000-0000-0000-0000-000000000014', 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', 100000,
      'currency', 'USD', 'local_date', current_date, 'time_zone', 'UTC', 'name', repeat('z', 120)),
    public.t96_step('e9600000-0000-0000-0000-000000000012', 'debtSaleRecorded')) ->> 'still_owed')::bigint,
  200000::bigint, 'a part payment leaves 200,000 owed (long names are cut, not refused)');
select extensions.is(public.t96_ver('debts', 'd9600000-0000-0000-0000-000000000004'), 3,
  'P1-WR-02: a part payment does not move the debt version');

-- P5-WR-01: an Expected goal line is confirmed, never plain-patched -------------------------------------------------------
select extensions.is(public.save_goal_plan(
  jsonb_build_object('id', '9a960000-0000-0000-0000-000000000001', 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'name', 'Holiday', 'currency', 'USD', 'locked', false, 'target', 300000, 'monthly_amount', 10000),
  null,
  jsonb_build_object('id', '5a960000-0000-0000-0000-000000000021', 'account_id', 'a9600000-0000-0000-0000-000000000001', 'amount', 10000,
    'anchor_date', current_date + 3, 'time_zone', 'UTC', 'name', 'Holiday'),
  public.t96_step('e9600000-0000-0000-0000-000000000021', 'goalMade')) ->> 'status', 'applied', 'a goal with a monthly contribution');
select extensions.throws_ok(format($f$select public.apply_patches('[{"entity":"transactions","id":"%s","expectedVersion":1,"patch":{"status":"paid"}}]'::jsonb)$f$,
    public.t96_first('5a960000-0000-0000-0000-000000000021')),
  '22023', null, 'P5-WR-01: a plain status patch cannot mark a live goal''s Expected line paid');
select extensions.is(public.confirm_goal_contribution(public.t96_first('5a960000-0000-0000-0000-000000000021'), 1, null,
    public.t96_step('e9600000-0000-0000-0000-000000000022', 'goalContributionConfirmed')) ->> 'status',
  'applied', 'P5-WR-01: confirm_goal_contribution still marks it paid');
select extensions.is(public.t96_patch('transactions', public.t96_first('5a960000-0000-0000-0000-000000000021'), '{"status":"pending"}',
    'e9600000-0000-0000-0000-000000000023', '{"status":"paid"}') ->> 'status', 'applied', 'the confirmed line is marked unpaid by a patch');
select extensions.is(public.apply_undo_step('e9600000-0000-0000-0000-000000000023') ->> 'status', 'undone',
  'P5-WR-01: Undo of that may put the paid state back');
select extensions.is(public.t96_get('transactions', public.t96_first('5a960000-0000-0000-0000-000000000021'), 'status'), 'paid',
  'P5-WR-01: the line is paid again');

-- Owner decision 1: remove_goal stops the series and removes its Expected lines, in one Undo --------------------------------
reset role;
create temp table t96_goal as select public.t96_pending('5a960000-0000-0000-0000-000000000021') as n;
grant select on t96_goal to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(public.remove_goal('9a960000-0000-0000-0000-000000000001', public.t96_ver('savings_goals', '9a960000-0000-0000-0000-000000000001'),
    public.t96_step('e9600000-0000-0000-0000-000000000024', 'goalRemoved')) ->> 'status', 'applied', 'remove_goal applies');
select extensions.ok(public.t96_get('savings_goals', '9a960000-0000-0000-0000-000000000001', 'deleted_at') is not null, 'the goal is removed');
select extensions.is(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000021', 'end_date'), (current_date + 3)::text,
  'its contribution ends on the last paid line');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000021'), 0, 'no Expected contribution line is left');
select extensions.is(public.t96_get('transactions', public.t96_first('5a960000-0000-0000-0000-000000000021'), 'deleted_at'), null,
  'the paid line stays as history');
select extensions.is(public.apply_undo_step('e9600000-0000-0000-0000-000000000024') ->> 'status', 'undone', 'Undo of the removal');
select extensions.ok(public.t96_get('savings_goals', '9a960000-0000-0000-0000-000000000001', 'deleted_at') is null, 'Undo: the goal is back');
select extensions.ok(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000021', 'end_date') is null, 'Undo: the series runs again');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000021'), (select n from t96_goal),
  'Undo: every Expected line is back');
select extensions.throws_ok($$select public.remove_goal('9a960000-0000-0000-0000-000000000001', 1,
    public.t96_step('e9600000-0000-0000-0000-000000000025', 'debtRemoved'))$$, '22023', null, 'remove_goal refuses another label');
select extensions.is(public.remove_goal('9a960000-0000-0000-0000-000000000001', 1,
    public.t96_step('e9600000-0000-0000-0000-000000000026', 'goalRemoved')) ->> 'status', 'conflict', 'a stale version is a conflict');

-- P1-CR-03: a goal removed by an older build's plain patch writes no more lines ----------------------------------------
select extensions.is(public.t96_patch('savings_goals', '9a960000-0000-0000-0000-000000000001', '{"deleted_at":"$now"}', null, null) ->> 'status',
  'applied', 'an older build removes the goal with a plain patch');
reset role;
create temp table t96_before as select public.t96_pending('5a960000-0000-0000-0000-000000000021') as n;
select extensions.is((select count(*)::integer from public.materialise_series('5a960000-0000-0000-0000-000000000021', current_date + 400)), 0,
  'P1-CR-03: the materialiser writes no line for a removed goal');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000021'), (select n from t96_before), 'P1-CR-03: nothing new appeared');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Owner decision 1: remove_debt stops both series and removes their Expected lines and the one-off, in one Undo ----------
select extensions.is(public.save_debt_plan('d9600000-0000-0000-0000-000000000005', 1, 7000, 'rate',
    jsonb_build_object('id', '5a960000-0000-0000-0000-000000000031', 'account_id', 'a9600000-0000-0000-0000-000000000001',
      'anchor_date', current_date + 2, 'time_zone', 'UTC', 'name', 'Extra on Van loan', 'category_id', null),
    public.t96_step('e9600000-0000-0000-0000-000000000031', 'debtPlanSaved')) ->> 'status', 'applied', 'the van gets an extra');
select extensions.is(public.t96_get('debts', 'd9600000-0000-0000-0000-000000000003', 'payoff_extra'), '0',
  'P3-WR-03: the extra moves: the plan loan no longer carries one');
select extensions.ok(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000012', 'deleted_at') is not null,
  'P3-WR-03: and its unstarted Expected extra series is dropped in the same save');
select extensions.is(public.t96_one_off('d9600000-0000-0000-0000-000000000005', '7a960000-0000-0000-0000-000000000031', 1000, 'USD',
  'Van one-off', 'e9600000-0000-0000-0000-000000000032') ->> 'status', 'applied', 'and an Expected one-off');
reset role;
create temp table t96_van as select public.t96_pending('5a960000-0000-0000-0000-000000000002') as pay,
  public.t96_pending('5a960000-0000-0000-0000-000000000031') as extra;
grant select on t96_van to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(public.remove_debt('d9600000-0000-0000-0000-000000000005', public.t96_ver('debts', 'd9600000-0000-0000-0000-000000000005'),
    public.t96_step('e9600000-0000-0000-0000-000000000033', 'debtRemoved')) ->> 'status', 'applied', 'remove_debt applies');
select extensions.ok(public.t96_get('debts', 'd9600000-0000-0000-0000-000000000005', 'deleted_at') is not null, 'the debt is removed');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000002') + public.t96_pending('5a960000-0000-0000-0000-000000000031'), 0,
  'no Expected payment or extra line is left, overdue ones included');
select extensions.ok(public.t96_get('transactions', '7a960000-0000-0000-0000-000000000031', 'deleted_at') is not null, 'the Expected one-off goes');
select extensions.is((select count(*)::integer from public.transactions where recurring_series_id = '5a960000-0000-0000-0000-000000000002'
    and status = 'paid' and deleted_at is null), 1, 'the paid van payment stays');
select extensions.is(public.t96_get('recurring_series', '5a960000-0000-0000-0000-000000000002', 'end_date'), (current_date - 1)::text,
  'the payment series ends yesterday');
select extensions.is(public.apply_undo_step('e9600000-0000-0000-0000-000000000033') ->> 'status', 'undone', 'Undo of the debt removal');
select extensions.ok(public.t96_get('debts', 'd9600000-0000-0000-0000-000000000005', 'deleted_at') is null, 'Undo: the debt is back');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000002'), (select pay from t96_van), 'Undo: every Expected payment is back');
select extensions.is(public.t96_pending('5a960000-0000-0000-0000-000000000031'), (select extra from t96_van), 'Undo: the extra lines are back');
select extensions.ok(public.t96_get('transactions', '7a960000-0000-0000-0000-000000000031', 'deleted_at') is null, 'Undo: the one-off is back');

-- P1-WR-08: a safety net made by save_goal_plan starts confirmed; P4-WR-02: a Wait goal's plan edit is refused ------------
select extensions.is(public.save_goal_plan(
  jsonb_build_object('id', '9a960000-0000-0000-0000-000000000002', 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'name', 'Safety net', 'currency', 'USD', 'locked', true, 'target', 200000, 'is_safety_net', true, 'protect', true),
  null, null, public.t96_step('e9600000-0000-0000-0000-000000000041', 'safetyNetSizeSaved')) ->> 'status', 'applied', 'a safety net is made');
select extensions.ok(public.t96_get('savings_goals', '9a960000-0000-0000-0000-000000000002', 'net_confirmed_at') is not null,
  'P1-WR-08: it starts confirmed');
select extensions.throws_ok($$select public.save_goal_plan('{"id":"9a960000-0000-0000-0000-000000000009","name":"Couch"}'::jsonb, 1, null,
    public.t96_step('e9600000-0000-0000-0000-000000000042', 'goalPlanChanged'))$$,
  '22023', null, 'P4-WR-02: renaming a Wait goal is refused, not silently reset');
select extensions.is(public.save_goal_plan('{"id":"9a960000-0000-0000-0000-000000000009","icon":"phone"}'::jsonb, 1, null,
    public.t96_step('e9600000-0000-0000-0000-000000000043', 'goalPlanChanged')) ->> 'status',
  'applied', 'P4-WR-02: a Wait goal''s icon can still change');

select * from extensions.finish();
rollback;
