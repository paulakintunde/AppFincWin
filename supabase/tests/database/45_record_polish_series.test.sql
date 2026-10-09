-- pgTAP: Phase 2.2 plan 10 -- the series SQL carries the Automatic flag
-- (D-02), sample series (D-09) and the household horizon (D-16, user
-- decision 2026-10-09), and create_recurring_series_batch records exactly
-- one undo step for "Mark all monthly" (D-19).
--
-- Needs 20261010000100 (columns) and 20261010000300 (this plan).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(27);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);

-- ---------------------------------------------------------------------
-- 1. Automatic lives on the template and is copied to every occurrence.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.create_recurring_series(jsonb_build_object(
    'id', 'c1111111-1111-1111-1111-111111111111',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Netflix', 'amount', -1500, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC',
    'is_automatic', true, 'is_sample', true
  )) ->> 'status'),
  'applied',
  'create_recurring_series accepts is_automatic (and ignores a client is_sample)'
);

select extensions.is(
  (select is_automatic from public.recurring_series where id = 'c1111111-1111-1111-1111-111111111111'),
  true,
  'the series template stores is_automatic'
);

select extensions.is(
  (select is_sample from public.recurring_series where id = 'c1111111-1111-1111-1111-111111111111'),
  false,
  'a client-supplied is_sample is never read'
);

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111' and is_automatic)::int,
  2,
  'both materialised occurrences copy is_automatic'
);

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111' and is_sample)::int,
  0,
  'a real series writes non-sample occurrences'
);

-- Before any household horizon the series stops at the end of next month.
select extensions.ok(
  (select max(local_date) from public.transactions where recurring_series_id = 'c1111111-1111-1111-1111-111111111111')
    <= (date_trunc('month', current_date) + interval '2 months' - interval '1 day')::date,
  'without a household horizon the series stops at the default horizon'
);

-- ---------------------------------------------------------------------
-- 2. "This and future" can flip Automatic.
-- ---------------------------------------------------------------------
select extensions.is(
  (public.edit_recurring_series_from(
    'c1111111-1111-1111-1111-111111111111', 1,
    '{"is_automatic": false}'::jsonb,
    (date_trunc('month', current_date) + interval '1 month')::date
  ) ->> 'status'),
  'applied',
  'edit_recurring_series_from accepts is_automatic'
);

select extensions.is(
  (select is_automatic from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and deleted_at is null
      and local_date >= (date_trunc('month', current_date) + interval '1 month')::date
    order by local_date limit 1),
  false,
  'the rebuilt future occurrence follows the edited flag'
);

select extensions.is(
  (select is_automatic from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and deleted_at is null
      and local_date < (date_trunc('month', current_date) + interval '1 month')::date
    order by local_date limit 1),
  true,
  'an earlier occurrence keeps the old flag'
);

-- ---------------------------------------------------------------------
-- 3. Sample series write sample occurrences; the household horizon extends
--    both the on-demand and the cron materialiser.
-- ---------------------------------------------------------------------
reset role;

insert into public.recurring_series (id, household_id, created_by, updated_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_sample, materialised_through)
values ('c2222222-2222-2222-2222-222222222222',
  (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
  'a1111111-1111-1111-1111-111111111111', 'Sample rent', -90000, 'USD', 'monthly',
  date_trunc('month', current_date)::date, 'UTC', true, date_trunc('month', current_date)::date - 1);

select extensions.is(
  (select count(*) from public.materialise_series('c2222222-2222-2222-2222-222222222222'))::int,
  2,
  'the materialiser writes this month and next for the sample series'
);

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c2222222-2222-2222-2222-222222222222' and is_sample)::int,
  2,
  'occurrences of a sample series are written with is_sample true'
);

-- Alice's household gets a horizon four months out.
update public.households
   set horizon_month = to_char(current_date + interval '4 months', 'YYYY-MM')
 where id = (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111');

select extensions.ok(
  (select count(*) from public.materialise_series('c1111111-1111-1111-1111-111111111111'))::int >= 1,
  'materialise_series reaches beyond the default horizon once the household horizon is set'
);

select extensions.is(
  (select to_char(max(local_date), 'YYYY-MM') from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111' and deleted_at is null),
  to_char(current_date + interval '4 months', 'YYYY-MM'),
  'the existing series now runs through the household horizon month'
);

-- A series created after the month was added still reaches it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select public.create_recurring_series(jsonb_build_object(
  'id', 'c3333333-3333-3333-3333-333333333333',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Gym', 'amount', -4000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));

select extensions.is(
  (select to_char(max(local_date), 'YYYY-MM') from public.transactions
    where recurring_series_id = 'c3333333-3333-3333-3333-333333333333'),
  to_char(current_date + interval '4 months', 'YYYY-MM'),
  'a series created after the month was added reaches the household horizon month'
);

-- The daily cron entry point honours it too (Bob's household).
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'Bob wallet', 'cash', 'USD', 0);
select public.create_recurring_series(jsonb_build_object(
  'id', 'c4444444-4444-4444-4444-444444444444',
  'household_id', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'),
  'account_id', 'a2222222-2222-2222-2222-222222222222',
  'name', 'Bob rent', 'amount', -50000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));

reset role;
update public.households
   set horizon_month = to_char(current_date + interval '3 months', 'YYYY-MM')
 where id = (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222');

select extensions.ok(
  public.materialise_recurring() >= 1,
  'the daily job materialises extra rows for a household with a horizon'
);

select extensions.is(
  (select to_char(max(local_date), 'YYYY-MM') from public.transactions
    where recurring_series_id = 'c4444444-4444-4444-4444-444444444444'),
  to_char(current_date + interval '3 months', 'YYYY-MM'),
  'the cron run reaches the household horizon month'
);

-- ---------------------------------------------------------------------
-- 4. Batch create: N series, one undo step.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
select ('d000000' || n || '-0000-0000-0000-000000000000')::uuid,
       (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       'a1111111-1111-1111-1111-111111111111', -1000 * n, 'USD', current_date, 'UTC', 'Line ' || n
  from generate_series(1, 3) n;

create temp table items as
select jsonb_agg(jsonb_build_object(
  'series', jsonb_build_object(
    'id', ('e000000' || n || '-0000-0000-0000-000000000000')::uuid,
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Line ' || n, 'amount', -1000 * n, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', current_date, 'time_zone', 'UTC'),
  'anchor_transaction_id', ('d000000' || n || '-0000-0000-0000-000000000000')::uuid,
  'link_transaction_ids', '[]'::jsonb) order by n) as j
from generate_series(1, 3) n;
grant select on items to authenticated;

create temp table undo_before as select count(*)::int as c from public.undo_log;
grant select on undo_before to authenticated;

create temp table batch_res as
select public.create_recurring_series_batch(
  (select j from items),
  '{"id":"f0000000-0000-0000-0000-000000000001","label_key":"markedMonthly","label_params":{"count":3}}'::jsonb
) as r;
grant select on batch_res to authenticated;

select extensions.is((select r ->> 'status' from batch_res), 'applied', 'the batch applies');

select extensions.is(
  (select count(*) from public.recurring_series where id::text like 'e000000%')::int,
  3,
  'three series were created'
);

select extensions.is(
  (select count(*) from public.undo_log)::int - (select c from undo_before),
  1,
  'the whole batch recorded exactly one undo step'
);

select extensions.is(
  (select label_key from public.undo_log where id = 'f0000000-0000-0000-0000-000000000001'),
  'markedMonthly',
  'the step carries the markedMonthly label'
);

-- Replay: same step id creates nothing.
select extensions.is(
  (public.create_recurring_series_batch(
    (select j from items),
    '{"id":"f0000000-0000-0000-0000-000000000001","label_key":"markedMonthly"}'::jsonb
  ) ->> 'status'),
  'already-applied',
  'replaying the same undo step id is already-applied'
);

-- Bounds and tenancy.
select extensions.throws_ok(
  format($f$select public.create_recurring_series_batch(%L::jsonb, '{"id":"f0000000-0000-0000-0000-000000000002","label_key":"markedMonthly"}'::jsonb)$f$,
         (select jsonb_agg((select j -> 0 from items)) from generate_series(1, 51))::text),
  '22023',
  null,
  'more than 50 items is refused'
);

select extensions.throws_ok(
  format($f$select public.create_recurring_series_batch(%L::jsonb, '{"id":"f0000000-0000-0000-0000-000000000003","label_key":"markedMonthly"}'::jsonb)$f$,
         jsonb_build_array(
           jsonb_build_object('series', jsonb_build_object(
             'id', '90000000-0000-0000-0000-000000000001',
             'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
             'account_id', 'a1111111-1111-1111-1111-111111111111',
             'name', 'Fine', 'amount', -100, 'currency', 'USD', 'freq', 'monthly',
             'anchor_date', current_date, 'time_zone', 'UTC')),
           jsonb_build_object('series', jsonb_build_object(
             'id', '90000000-0000-0000-0000-000000000002',
             'household_id', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'),
             'account_id', 'a2222222-2222-2222-2222-222222222222',
             'name', 'Not mine', 'amount', -100, 'currency', 'USD', 'freq', 'monthly',
             'anchor_date', current_date, 'time_zone', 'UTC')))::text),
  '42501',
  null,
  'an item for another household is refused'
);

select extensions.is(
  (select count(*) from public.recurring_series where id::text like '90000000%')::int,
  0,
  'a refused batch creates nothing (all or nothing)'
);

-- Undo the whole batch with one step.
select extensions.is(
  (public.apply_undo_step('f0000000-0000-0000-0000-000000000001') ->> 'status'),
  'undone',
  'one undo applies the whole batch'
);

select extensions.is(
  (select count(*) from public.recurring_series where id::text like 'e000000%' and deleted_at is null)::int,
  0,
  'undo removes all three series'
);

select extensions.is(
  (select count(*) from public.transactions where id::text like 'd000000%' and recurring_series_id is null and deleted_at is null)::int,
  3,
  'undo unlinks the anchors and leaves the logged rows alone'
);

select * from extensions.finish();
rollback;
