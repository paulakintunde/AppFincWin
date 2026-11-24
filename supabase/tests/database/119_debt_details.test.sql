-- pgTAP: quick 261123 (DD-02, DD-03, DD-04, DD-08) -- debt details. Migration 20261125001100.
--   credit_limit and revolving exist and are nullable; the app may insert credit_limit, revolving and paid_off_on and update
--   start_date, credit_limit and revolving; Undo of an edit to those three replays through apply_patches; a financed purchase
--   recorded by record_decide_go stores started_balance = the financed amount and start_date = the purchase date.
--
-- Needs 20261016000300, 20261125000400 and 20261125001100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(16);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a1190000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0);

insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('c1190000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Car'),
  ('c1190000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Sofa');

-- 1-4. The columns.
select extensions.has_column('public', 'debts', 'credit_limit', 'debts.credit_limit exists');
select extensions.col_is_null('public', 'debts', 'credit_limit', 'debts.credit_limit is nullable');
select extensions.has_column('public', 'debts', 'revolving', 'debts.revolving exists');
select extensions.col_is_null('public', 'debts', 'revolving', 'debts.revolving is nullable');

-- 5-6. The grants.
select extensions.ok(
  has_column_privilege('authenticated', 'public.debts', 'credit_limit', 'INSERT')
  and has_column_privilege('authenticated', 'public.debts', 'revolving', 'INSERT')
  and has_column_privilege('authenticated', 'public.debts', 'paid_off_on', 'INSERT'),
  'the app may insert credit_limit, revolving and paid_off_on');
select extensions.ok(
  has_column_privilege('authenticated', 'public.debts', 'start_date', 'UPDATE')
  and has_column_privilege('authenticated', 'public.debts', 'credit_limit', 'UPDATE')
  and has_column_privilege('authenticated', 'public.debts', 'revolving', 'UPDATE'),
  'the app may update start_date, credit_limit and revolving');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 7. A loan already paid off is added with its original amount, start date and paid-off date (DD-04).
insert into public.debts (id, household_id, name, kind, currency, balance, apr, start_date, started_balance, paid_off_on, revolving)
values ('d1190000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        'Old car loan', 'loan', 'USD', 0, '4.9', date '2022-03-01', 1500000, date '2025-02-01', false);
select extensions.is(
  (select row(balance, start_date, started_balance, paid_off_on, revolving)::text from public.debts where id = 'd1190000-0000-0000-0000-000000000001'),
  row(0::bigint, date '2022-03-01', 1500000::bigint, date '2025-02-01', false)::text,
  'a paid-off loan keeps its original amount, start date and paid-off date');

-- 8. A card with a limit and no rate (paid in full) is added (DD-03).
insert into public.debts (id, household_id, name, kind, currency, balance, credit_limit, revolving)
values ('d1190000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        'Card', 'card', 'USD', 25000, 500000, true);
select extensions.is((select credit_limit from public.debts where id = 'd1190000-0000-0000-0000-000000000002'), 500000::bigint, 'a card keeps its limit');

-- 9. A negative limit is refused.
select extensions.throws_ok(
  $$update public.debts set credit_limit = -1 where id = 'd1190000-0000-0000-0000-000000000002'$$,
  '23514', null, 'a negative limit is refused');

-- 10-12. apply_patches takes the three new keys, and Undo restores them.
select extensions.is(
  (public.apply_patches(
    '[{"entity":"debts","id":"d1190000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"credit_limit":600000,"revolving":true}}]'::jsonb,
    '{"id":"e1190000-0000-0000-0000-000000000001","label_key":"debtEdited","label_params":{"name":"Card"}}'::jsonb)) ->> 'status',
  'applied', 'apply_patches takes credit_limit and revolving');
select extensions.is(
  (public.apply_patches(
    '[{"entity":"debts","id":"d1190000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"start_date":"2022-04-01"}}]'::jsonb)) ->> 'status',
  'applied', 'apply_patches takes start_date');
select extensions.is(
  (select start_date from public.debts where id = 'd1190000-0000-0000-0000-000000000001'), date '2022-04-01', 'start_date is patched as a date');

-- 13-16. record_decide_go: a financed purchase's debt stores its original amount and the purchase date (DD-08).
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('71190000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        'a1190000-0000-0000-0000-000000000001', -200000, 'USD', current_date - 3, 'UTC', 'Car deposit'),
       ('71190000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
        'a1190000-0000-0000-0000-000000000001', -10000, 'USD', current_date, 'UTC', 'Sofa deposit');

create function public.t119_go(p_check uuid, p_row uuid, p_debt jsonb, p_step uuid) returns text language sql as $$
  select public.record_decide_go(p_check, array[p_row]::uuid[], '[]'::jsonb, '[]'::jsonb, p_debt,
    '{"verdict":"fits","estimate_day_one":1000,"estimate_monthly":0,"estimate_monthly_payment":0,"estimate_running":0,"broke_line":false,"row_roles":["day_one"],"series_roles":[]}'::jsonb,
    jsonb_build_object('id', p_step, 'label_key', 'decisionWritten')) ->> 'status'
$$;

select extensions.is(
  public.t119_go('c1190000-0000-0000-0000-000000000001', '71190000-0000-0000-0000-000000000001',
    '{"id":"d1190000-0000-0000-0000-000000000010","name":"Car loan","kind":"loan","currency":"USD","balance":1800000,"apr":"6.5","minimum_payment":35000,"secured":true}'::jsonb,
    'e1190000-0000-0000-0000-000000000010'),
  'applied', 'a financed purchase is recorded');
select extensions.is(
  (select row(started_balance, start_date, revolving)::text from public.debts where id = 'd1190000-0000-0000-0000-000000000010'),
  row(1800000::bigint, current_date - 3, false)::text,
  'the financed amount is the original amount and the purchase date is the start date');

select extensions.is(
  public.t119_go('c1190000-0000-0000-0000-000000000002', '71190000-0000-0000-0000-000000000002',
    '{"id":"d1190000-0000-0000-0000-000000000011","name":"Sofa plan","kind":"loan","currency":"USD","balance":90000,"apr":"0","minimum_payment":7500,"secured":false,"start_date":"2026-01-15"}'::jsonb,
    'e1190000-0000-0000-0000-000000000011'),
  'applied', 'a financed purchase with its own start date is recorded');
select extensions.is(
  (select row(started_balance, start_date)::text from public.debts where id = 'd1190000-0000-0000-0000-000000000011'),
  row(90000::bigint, date '2026-01-15')::text,
  'a start date sent with the debt is kept');

select * from extensions.finish();
rollback;
