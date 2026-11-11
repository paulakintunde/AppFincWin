-- pgTAP: Phase 06 Grow device-check fix -- an Expected extra that never reached its first date is dropped, not kept.
-- Migration 20261110000100 (grow_end_series, save_debt_plan and record_debt_sale re-issued).
-- Repro from the Pixel 9 check: save the extra, change it, stop it, Undo. Before the fix each save left one more
-- "Extra payment" line on the first date. Dates are relative to current_date.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

create function public.t95_ver(i uuid) returns integer language sql as $$ select version from public.debts where id = i $$;

-- save_debt_plan with the extra's first date p_anchor.
create function public.t95_plan(p_debt uuid, p_extra bigint, p_series uuid, p_anchor date, p_step uuid)
returns jsonb language sql as $$
  select public.save_debt_plan(p_debt, public.t95_ver(p_debt), p_extra, 'rate',
    case when p_extra = 0 then null else jsonb_build_object('id', p_series, 'account_id', 'a9500000-0000-0000-0000-000000000001',
      'anchor_date', p_anchor, 'time_zone', 'UTC', 'name', 'Extra payment', 'category_id', null) end,
    jsonb_build_object('id', p_step, 'label_key', 'debtPlanSaved', 'label_params', jsonb_build_object('name', 'Test Visa')));
$$;

-- Live Expected extra lines on a date, across every extra series of the debt's household.
create function public.t95_lines(p_on date) returns integer language sql as $$
  select count(*)::integer from public.transactions t
    join public.recurring_series s on s.id = t.recurring_series_id
   where s.name = 'Extra payment' and t.status = 'pending' and t.deleted_at is null and t.occurrence_date = p_on;
$$;

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a9500000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance, minimum_payment) values
  ('d9500000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Test Visa', 'card', 'USD', 400000, 12000),
  ('d9500000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Started loan', 'loan', 'USD', 400000, 12000);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 1. $50 extra from current_date + 5 ---------------------------------------------------------------------------
select extensions.is(public.t95_plan('d9500000-0000-0000-0000-000000000001', 5000, '5a950000-0000-0000-0000-000000000001',
    current_date + 5, 'e9500000-0000-0000-0000-000000000001') ->> 'status', 'applied', 'the $50 extra applies');
select extensions.is(public.t95_lines(current_date + 5), 1, 'one Expected extra line on the first date');

-- 2. Change it to $25 before the first date: the $50 series is dropped, one line remains (the $25 one).
select extensions.is(public.t95_plan('d9500000-0000-0000-0000-000000000001', 2500, '5a950000-0000-0000-0000-000000000002',
    current_date + 5, 'e9500000-0000-0000-0000-000000000002') ->> 'status', 'applied', 'the $25 extra applies');
select extensions.ok((select deleted_at is not null from public.recurring_series where id = '5a950000-0000-0000-0000-000000000001'),
  'the unstarted $50 series is dropped');
select extensions.is(public.t95_lines(current_date + 5), 1, 'still one Expected extra line on the first date');
select extensions.is((select -amount from public.transactions where recurring_series_id = '5a950000-0000-0000-0000-000000000002'
    and status = 'pending' and deleted_at is null and occurrence_date = current_date + 5), 2500::bigint, 'and it is the $25 one');

-- 3. Stop the extra: no line is left.
select extensions.is(public.t95_plan('d9500000-0000-0000-0000-000000000001', 0, null, null,
    'e9500000-0000-0000-0000-000000000003') ->> 'status', 'applied', 'stopping the extra applies');
select extensions.is(public.t95_lines(current_date + 5), 0, 'no Expected extra line is left');

-- 4. Undo the stop: the $25 series and its line come back, once.
select extensions.is(public.apply_undo_step('e9500000-0000-0000-0000-000000000003') ->> 'status', 'undone', 'Undo of the stop');
select extensions.ok((select deleted_at is null from public.recurring_series where id = '5a950000-0000-0000-0000-000000000002'),
  'Undo: the $25 series is back');
select extensions.is(public.t95_lines(current_date + 5), 1, 'Undo: exactly one Expected extra line again');
select extensions.is((select extra_series_id from public.debts where id = 'd9500000-0000-0000-0000-000000000001'),
  '5a950000-0000-0000-0000-000000000002'::uuid, 'Undo: the debt points at the $25 series');

-- 5. Undo the change to $25: the $50 series comes back, the $25 one goes; still one line.
select extensions.is(public.apply_undo_step('e9500000-0000-0000-0000-000000000002') ->> 'status', 'undone', 'Undo of the change');
select extensions.is(public.t95_lines(current_date + 5), 1, 'Undo: one Expected extra line, the $50 one');

-- 6. A series that has started is still ended, not dropped.
select extensions.is(public.t95_plan('d9500000-0000-0000-0000-000000000002', 5000, '5a950000-0000-0000-0000-000000000003',
    current_date - 40, 'e9500000-0000-0000-0000-000000000004') ->> 'status', 'applied', 'an extra from 40 days ago applies');
select extensions.is(public.t95_plan('d9500000-0000-0000-0000-000000000002', 0, null, null,
    'e9500000-0000-0000-0000-000000000005') ->> 'status', 'applied', 'stopping the started extra applies');
select extensions.ok((select deleted_at is null and end_date is not null and end_reason = 'stopped' from public.recurring_series
    where id = '5a950000-0000-0000-0000-000000000003'), 'a started series is ended as stopped and kept');

select * from extensions.finish();
rollback;
