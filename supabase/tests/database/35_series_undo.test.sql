-- pgTAP: review fix D-CR-01 -- undoing a series create/edit/end once the
-- daily materialiser has added rows the stored step never saw (D-24, D-26,
-- D-28).
--
-- Proves:
--   * undo of "Created X" also soft-deletes every occurrence the system
--     materialised after the step, so no live pending row is left hanging off
--     a deleted series;
--   * undo of "Created X" is refused (never clobbers) when a user has since
--     acted on one of those system rows (e.g. marked it paid);
--   * undo of a template edit is refused once the materialiser has generated
--     rows from the edited template (they cannot be rebuilt from a fixed op
--     list), and the template is left as it is;
--   * undo of a template edit with no intervening materialisation still
--     undoes normally;
--   * D-WR-02: a replay that hits an integrity error (the occurrence unique
--     index, a lone transfer leg) is refused instead of thrown.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Builds the stored inverse of a series RPC change set exactly the way
-- src/engine/undo/inverse.ts's inverseOfSeriesChange does (inserted ->
-- soft-delete, soft_deleted -> restore, linked -> unlink, series last).
create function pg_temp.series_inverse(r jsonb) returns jsonb language sql as $$
  select coalesce((select jsonb_agg(jsonb_build_object('entity','transactions','id',e->>'id','expectedVersion',(e->>'version')::int,'patch','{"deleted_at":"$now"}'::jsonb)) from jsonb_array_elements(r->'inserted') e), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('entity','transactions','id',e->>'id','expectedVersion',(e->>'version')::int,'patch','{"deleted_at":null}'::jsonb)) from jsonb_array_elements(r->'soft_deleted') e), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('entity','transactions','id',e->>'id','expectedVersion',(e->>'version')::int,'patch','{"recurring_series_id":null,"occurrence_date":null}'::jsonb)) from jsonb_array_elements(r->'linked') e), '[]'::jsonb)
      || jsonb_build_array(jsonb_build_object('entity','recurring_series','id',r->'series'->>'id','expectedVersion',(r->'series'->>'version')::int,
           'patch', case when jsonb_typeof(r->'series'->'before') = 'null' then '{"deleted_at":"$now"}'::jsonb else r->'series'->'before' end));
$$;
grant execute on function pg_temp.series_inverse(jsonb) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0);

-- ---------------------------------------------------------------------
-- 1. Create -> cron materialises another month -> undo the create.
-- ---------------------------------------------------------------------
create temp table r1 as select public.create_recurring_series(jsonb_build_object(
  'id', 'c1000000-0000-0000-0000-000000000001',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Rent', 'amount', -120000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
)) as r;

insert into public.undo_log (id, label_key, label_params, ops)
select 'e1000000-0000-0000-0000-000000000001', 'seriesCreated', '{}'::jsonb, pg_temp.series_inverse(r) from r1;

reset role;
-- The daily job a month later: the horizon moves on, one more pending row.
select extensions.is(
  (select count(*)::int from public.materialise_series('c1000000-0000-0000-0000-000000000001'::uuid, (current_date + interval '1 month')::date)),
  1,
  'the materialiser adds one more occurrence the stored step never saw'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.is(
  (public.apply_undo_step('e1000000-0000-0000-0000-000000000001') ->> 'status'),
  'undone',
  'undo of the create is applied'
);
select extensions.is(
  (select count(*)::int from public.transactions
    where recurring_series_id = 'c1000000-0000-0000-0000-000000000001' and deleted_at is null),
  0,
  'no live occurrence is left attached to the undone series (including the cron-added one)'
);
select extensions.isnt(
  (select deleted_at from public.recurring_series where id = 'c1000000-0000-0000-0000-000000000001'),
  null,
  'the series itself is soft-deleted'
);

-- ---------------------------------------------------------------------
-- 2. Create -> cron adds a row -> the user marks that row paid -> undo of
-- the create is refused, naming the row (D-26: never clobbers).
-- ---------------------------------------------------------------------
create temp table r2 as select public.create_recurring_series(jsonb_build_object(
  'id', 'c2000000-0000-0000-0000-000000000002',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Gym', 'amount', -5000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
)) as r;
insert into public.undo_log (id, label_key, label_params, ops)
select 'e2000000-0000-0000-0000-000000000002', 'seriesCreated', '{}'::jsonb, pg_temp.series_inverse(r) from r2;

reset role;
select public.materialise_series('c2000000-0000-0000-0000-000000000002'::uuid, (current_date + interval '1 month')::date);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

update public.transactions set status = 'paid'
 where recurring_series_id = 'c2000000-0000-0000-0000-000000000002'
   and occurrence_date = (select max(occurrence_date) from public.transactions where recurring_series_id = 'c2000000-0000-0000-0000-000000000002');

create temp table u2 as select public.apply_undo_step('e2000000-0000-0000-0000-000000000002') as r;
select extensions.is((select r ->> 'status' from u2), 'refused', 'undo of the create is refused once a user acted on a system-added row');
select extensions.is((select r -> 'refusal' ->> 'entity' from u2), 'transactions', 'the refusal names the transaction that changed');
select extensions.is(
  (select deleted_at from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
  null,
  'nothing was undone: the series is still live'
);

-- ---------------------------------------------------------------------
-- 3. Edit "this and future" -> cron generates rows from the edited
-- template -> undo of the edit is refused; the template stays as edited.
-- ---------------------------------------------------------------------
create temp table r3 as select public.edit_recurring_series_from(
  'c2000000-0000-0000-0000-000000000002'::uuid,
  (select version from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
  '{"amount": -6000}'::jsonb,
  (date_trunc('month', current_date) + interval '1 month')::date
) as r;
insert into public.undo_log (id, label_key, label_params, ops)
select 'e3000000-0000-0000-0000-000000000003', 'seriesEdited', '{}'::jsonb, pg_temp.series_inverse(r) from r3;

reset role;
select extensions.is(
  (select count(*)::int from public.materialise_series('c2000000-0000-0000-0000-000000000002'::uuid, (current_date + interval '2 months')::date)),
  1,
  'the materialiser generates a row from the edited template'
);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table u3 as select public.apply_undo_step('e3000000-0000-0000-0000-000000000003') as r;
select extensions.is((select r ->> 'status' from u3), 'refused', 'undo of the edit is refused once the system generated rows from it');
select extensions.is(
  (select amount from public.recurring_series where id = 'c2000000-0000-0000-0000-000000000002'),
  (-6000)::bigint,
  'the refused undo left the edited template in place'
);

-- ---------------------------------------------------------------------
-- 4. Edit -> undo straight away (no materialisation in between) still works.
-- ---------------------------------------------------------------------
create temp table r4 as select public.create_recurring_series(jsonb_build_object(
  'id', 'c4000000-0000-0000-0000-000000000004',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Phone', 'amount', -3000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
)) as r;
create temp table r5 as select public.edit_recurring_series_from(
  'c4000000-0000-0000-0000-000000000004'::uuid, 1, '{"amount": -3500}'::jsonb,
  date_trunc('month', current_date)::date
) as r;
insert into public.undo_log (id, label_key, label_params, ops)
select 'e5000000-0000-0000-0000-000000000005', 'seriesEdited', '{}'::jsonb, pg_temp.series_inverse(r) from r5;

select extensions.is(
  (public.apply_undo_step('e5000000-0000-0000-0000-000000000005') ->> 'status'),
  'undone',
  'undo of an edit with no materialisation in between is applied'
);
select extensions.is(
  (select amount from public.recurring_series where id = 'c4000000-0000-0000-0000-000000000004'),
  (-3000)::bigint,
  'the template is back to its pre-edit amount'
);

-- ---------------------------------------------------------------------
-- 5. D-WR-02: an undo step that hits an integrity error is refused, not
-- thrown -- otherwise it throws on every tap forever and wedges history.
-- The user deletes next month's pending occurrence (step S1 restores it),
-- then edits "this and future" from this month: the rewind re-materialises
-- a NEW row on the deleted occurrence's date. Restoring the old row now
-- collides with transactions_series_occurrence_uidx (23505).
-- ---------------------------------------------------------------------
select public.create_recurring_series(jsonb_build_object(
  'id', 'c6000000-0000-0000-0000-000000000006',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Insurance', 'amount', -4000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));
create temp table o2 as
  select id from public.transactions
   where recurring_series_id = 'c6000000-0000-0000-0000-000000000006'
     and occurrence_date = (date_trunc('month', current_date) + interval '1 month')::date;
select public.apply_patches(
  jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', (select id from o2), 'expectedVersion', 1, 'patch', '{"deleted_at":"$now"}'::jsonb)),
  jsonb_build_object('id', 'e6000000-0000-0000-0000-000000000006', 'label_key', 'deleted', 'label_params', '{}'::jsonb,
    'ops', jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', (select id from o2), 'expectedVersion', 2, 'patch', '{"deleted_at":null}'::jsonb)))
);
select public.edit_recurring_series_from(
  'c6000000-0000-0000-0000-000000000006'::uuid, 1, '{"amount": -4500}'::jsonb, date_trunc('month', current_date)::date
);

select extensions.lives_ok(
  $$select public.apply_undo_step('e6000000-0000-0000-0000-000000000006')$$,
  'an undo step that would violate the occurrence unique index does not throw'
);
select extensions.is(
  (select status from public.undo_log where id = 'e6000000-0000-0000-0000-000000000006'),
  'refused',
  'the step is marked refused (greyed in History, D-28) rather than left available'
);
select extensions.is(
  (public.apply_undo_step('e6000000-0000-0000-0000-000000000006') ->> 'status'),
  'refused',
  'a second tap returns refused, not an error'
);

-- ---------------------------------------------------------------------
-- 6. D-WR-02: the deferred transfer-pair check is forced inside the replay,
-- so a step that would leave a lone leg is refused instead of failing at
-- commit, where nothing could catch it.
-- ---------------------------------------------------------------------
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'checking', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id, name) values
  ('17000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -800, 'USD', current_date, 'UTC', 'd7000000-0000-0000-0000-000000000007', 'Out'),
  ('17000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a2222222-2222-2222-2222-222222222222', 800, 'USD', current_date, 'UTC', 'd7000000-0000-0000-0000-000000000007', 'In');
-- A (hand-built) step that would restore only one leg of the pair.
select public.apply_patches(
  '[{"entity":"transactions","id":"17000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"deleted_at":"$now"}},
    {"entity":"transactions","id":"17000000-0000-0000-0000-000000000002","expectedVersion":1,"patch":{"deleted_at":"$now"}}]'::jsonb,
  '{"id":"e7000000-0000-0000-0000-000000000007","label_key":"transferDeleted","label_params":{},
    "ops":[{"entity":"transactions","id":"17000000-0000-0000-0000-000000000001","expectedVersion":2,"patch":{"deleted_at":null}}]}'::jsonb
);

create temp table u7 as select public.apply_undo_step('e7000000-0000-0000-0000-000000000007') as r;
select extensions.is((select r ->> 'status' from u7), 'refused', 'a replay that would leave a lone transfer leg is refused');
select extensions.lives_ok(
  $$set constraints public.transfer_pair_check immediate$$,
  'no broken pair is left queued for commit'
);
set constraints public.transfer_pair_check deferred;

reset role;

select * from extensions.finish();
rollback;
