-- pgTAP: Phase 05.2 (05.2-08) -- apply_patches and undo_log_fill know decide_settings, recurring_dismissals,
-- income_payer_prompts and decide_answers plus every new patchable column. Migration 20261028001100.
--
-- Needs 20261016000100 .. 20261016000400, 20261021000100, 20261024000100 and 20261028000100 .. 20261028001100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(47);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Helpers (rolled back with the transaction): the current row version, and one patch op.
create function public.t69_ver(e text, i uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) using i into v;
  return v;
end;
$$;
create function public.t69_ap(e text, i uuid, p jsonb) returns text language sql as $$
  select (public.apply_patches(jsonb_build_array(jsonb_build_object(
    'entity', e, 'id', i, 'expectedVersion', public.t69_ver(e, i), 'patch', p))) ->> 'status');
$$;

-- ---------------------------------------------------------------------
-- Fixtures, written as the table owner.
-- ---------------------------------------------------------------------
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 0),
  ('a6900000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Other checking', 'checking', 'USD', 0);

insert into public.recurring_series (id, household_id, created_by, account_id, category_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5e690000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a6900000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Pay', 300000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC');

insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, is_refund) values
  ('e6900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6900000-0000-0000-0000-000000000001', -10000, 'USD', current_date, 'UTC', false),
  ('e6900000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a6900000-0000-0000-0000-000000000001', 3000, 'USD', current_date, 'UTC', true),
  ('e6900000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'a6900000-0000-0000-0000-000000000002', -5000, 'USD', current_date, 'UTC', false);

insert into public.debts (id, household_id, created_by, name, kind, currency) values
  ('d6900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD');

select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, monthly_amount) values
  ('b6900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Trip', 'USD', 'trip', 1000);
select set_config('fincwin.decide_rpc', '', true);

insert into public.decide_settings (user_id, currency) values
  ('11111111-1111-1111-1111-111111111111', 'USD'),
  ('33333333-3333-3333-3333-333333333333', 'USD');

insert into public.recurring_dismissals (id, household_id, created_by, payee_key, direction) values
  ('f6900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'coffee', 'out'),
  ('f6900000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'tea', 'out');

insert into public.income_payer_prompts (id, household_id, created_by, payer_key, income_kind, counts_as) values
  ('a7900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'acme', 'salary_or_wages', 'available');

insert into public.decide_answers (id, household_id, created_by, kind, key, amount, on_date, bool_value) values
  ('b7900000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'expected_income', '2026-10', 100000, '2026-10-15', null),
  ('b7900000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'pay_arrival', '5e690000-0000-0000-0000-000000000001:2026-10-05', null, '2026-10-05', true),
  ('b7900000-0000-0000-0000-000000000003', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), '33333333-3333-3333-3333-333333333333', 'expected_income', '2026-10', 50000, '2026-10-15', null);

create temp table sid as select id from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111';
create temp table sid_b as select id from public.decide_settings where user_id = '33333333-3333-3333-3333-333333333333';
grant select on sid, sid_b to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- ---------------------------------------------------------------------
-- 1. decide_settings (1-14).
-- ---------------------------------------------------------------------
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"rough_income":500000,"unsecured_multiple":12,"basis_override":"worst","currency":"USD"}'),
  'applied', 'the owner patches pre-existing settings columns through apply_patches');
select extensions.is((select rough_income::text || '/' || unsecured_multiple::text || '/' || basis_override from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '500000/12/worst', 'bigint, integer and text settings landed with their types');
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"income_types":"{salary_or_wages,freelance}"}'),
  'applied', 'income_types is accepted as a text[] string');
select extensions.is((select income_types from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  array['salary_or_wages', 'freelance'], 'income_types landed as text[]');
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"month_marks":"{\"2026-08\":\"half\"}"}'),
  'applied', 'month_marks is accepted as a jsonb string');
select extensions.is((select month_marks from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '{"2026-08":"half"}'::jsonb, 'month_marks landed as jsonb');
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"unspent_anchor":1234,"unspent_anchor_at":"2026-10-03","rough_as_of":"2026-10-01"}'),
  'applied', 'date and bigint anchors are accepted');
select extensions.is((select unspent_anchor_at::text || '/' || unspent_anchor::text from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  '2026-10-03/1234', 'unspent_anchor_at landed as a date');
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"spread_months":6,"hold_months":2,"share_pct":50,"remind_plan":true,"remind_unspent":false,"setup_done_at":"$now"}'),
  'applied', 'smallint, boolean and timestamptz settings are accepted');
select extensions.ok((select spread_months = 6 and share_pct = 50 and remind_plan and not remind_unspent and setup_done_at is not null
    from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'),
  'smallint, boolean and $now timestamptz landed');
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"reserve_account_id":"a6900000-0000-0000-0000-000000000001","rough_saving":100,"unexplained_use":"spare","unexplained_at":"2026-10-02"}'),
  'applied', 'reserve_account_id and the rough figures are accepted');
select extensions.throws_ok(
  $$select public.t69_ap('decide_settings', (select id from sid_b), '{"rough_income":1}')$$,
  '42501', null, 'another user''s settings id is refused');
select extensions.throws_ok(
  $$select public.t69_ap('decide_settings', (select id from sid), '{"reserve_account_id":"a6900000-0000-0000-0000-000000000002"}')$$,
  '42501', null, 'the settings guard refuses a reserve account in another household');
select extensions.is(public.t69_ap('decide_settings', (select id from sid), '{"reserve_account_id":null,"month_marks":null,"income_types":null}'),
  'applied', 'a settings patch can restore nulls (the undo of a first write)');

-- ---------------------------------------------------------------------
-- 2. Columns that must never be patchable (15-21).
-- ---------------------------------------------------------------------
select extensions.throws_ok($$select public.t69_ap('decide_settings', (select id from sid), '{"id":"a6900000-0000-0000-0000-0000000000ff"}')$$,
  '22023', null, 'decide_settings.id is refused');
select extensions.throws_ok($$select public.t69_ap('decide_settings', (select id from sid), '{"seeded":true}')$$,
  '22023', null, 'decide_settings.seeded is refused');
select extensions.throws_ok($$select public.t69_ap('decide_settings', (select id from sid), '{"user_id":"33333333-3333-3333-3333-333333333333"}')$$,
  '22023', null, 'decide_settings.user_id is refused');
select extensions.throws_ok($$select public.t69_ap('decide_settings', (select id from sid), '{"version":99}')$$,
  '22023', null, 'decide_settings.version is refused');
select extensions.throws_ok($$select public.t69_ap('decide_settings', (select id from sid), '{"decide_v3":true}')$$,
  '22023', null, 'profiles.decide_v3 is not patchable through decide_settings');
select extensions.throws_ok($$select public.apply_patches('[{"entity":"profiles","id":"11111111-1111-1111-1111-111111111111","expectedVersion":1,"patch":{"decide_v3":true}}]'::jsonb)$$,
  '22023', null, 'profiles is not an entity');
select extensions.throws_ok($$select public.t69_ap('decide_answers', 'b7900000-0000-0000-0000-000000000001', '{"kind":"held_bridge"}')$$,
  '22023', null, 'decide_answers.kind is refused');

-- ---------------------------------------------------------------------
-- 3. Version mismatch (22).
-- ---------------------------------------------------------------------
select extensions.is(
  (public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'decide_settings', 'id', (select id from sid),
     'expectedVersion', public.t69_ver('decide_settings', (select id from sid)) + 5, 'patch', '{"rough_income":1}'::jsonb)))) ->> 'status',
  'conflict', 'a version mismatch refuses the whole batch with the conflict payload');

-- ---------------------------------------------------------------------
-- 4. New columns on existing entities (23-39).
-- ---------------------------------------------------------------------
select extensions.is(public.t69_ap('recurring_series', '5e690000-0000-0000-0000-000000000001',
  '{"counts_as":"kept","income_kind":"salary_or_wages","saving_mode":"fixed","pay_group":"a6900000-0000-0000-0000-000000000099"}'),
  'applied', 'recurring_series accepts counts_as, income_kind, saving_mode and pay_group');
select extensions.is((select counts_as || '/' || income_kind || '/' || saving_mode || '/' || pay_group::text from public.recurring_series where id = '5e690000-0000-0000-0000-000000000001'),
  'kept/salary_or_wages/fixed/a6900000-0000-0000-0000-000000000099', 'the series columns landed');

select extensions.is(public.t69_ap('transactions', 'e6900000-0000-0000-0000-000000000002',
  '{"income_kind":"refund","counts_as":"kept","refund_of":"e6900000-0000-0000-0000-000000000001"}'),
  'applied', 'transactions accepts income_kind, counts_as and refund_of');
select extensions.is((select income_kind || '/' || counts_as || '/' || refund_of::text from public.transactions where id = 'e6900000-0000-0000-0000-000000000002'),
  'refund/kept/e6900000-0000-0000-0000-000000000001', 'the transaction columns landed');
select extensions.throws_ok($$select public.t69_ap('transactions', 'e6900000-0000-0000-0000-000000000002', '{"refund_of":"e6900000-0000-0000-0000-000000000003"}')$$,
  '42501', null, 'the refund guard still fires through apply_patches (other household)');

select extensions.is(public.t69_ap('debts', 'd6900000-0000-0000-0000-000000000001', '{"pays_in_full":"sometimes"}'),
  'applied', 'debts accepts pays_in_full');
select extensions.is((select pays_in_full from public.debts where id = 'd6900000-0000-0000-0000-000000000001'), 'sometimes', 'pays_in_full landed');

select extensions.is(public.t69_ap('accounts', 'a6900000-0000-0000-0000-000000000001',
  '{"use":"dedicated","use_purpose":"envelope","use_envelope_id":"b6900000-0000-0000-0000-000000000001"}'),
  'applied', 'accounts accepts use, use_purpose and use_envelope_id');
select extensions.is(public.t69_ap('accounts', 'a6900000-0000-0000-0000-000000000001',
  '{"use":"mixed","use_purpose":null,"use_envelope_id":null,"use_extra_set_aside":2500}'),
  'applied', 'accounts accepts use_extra_set_aside');
select extensions.is((select use || '/' || use_extra_set_aside::text from public.accounts where id = 'a6900000-0000-0000-0000-000000000001'),
  'mixed/2500', 'the account use columns landed');

select extensions.is(public.t69_ap('savings_goals', 'b6900000-0000-0000-0000-000000000001',
  '{"account_id":"a6900000-0000-0000-0000-000000000001","monthly_amount":4500,"color_key":"teal"}'),
  'applied', 'savings_goals accepts account_id, monthly_amount and color_key');
select extensions.is((select account_id::text || '/' || monthly_amount::text || '/' || color_key from public.savings_goals where id = 'b6900000-0000-0000-0000-000000000001'),
  'a6900000-0000-0000-0000-000000000001/4500/teal', 'the bucket columns landed');

-- ---------------------------------------------------------------------
-- 5. New entities (40-48).
-- ---------------------------------------------------------------------
select extensions.is(public.t69_ap('recurring_dismissals', 'f6900000-0000-0000-0000-000000000001', '{"deleted_at":"$now"}'),
  'applied', 'recurring_dismissals accepts deleted_at');
select extensions.ok((select deleted_at is not null from public.recurring_dismissals where id = 'f6900000-0000-0000-0000-000000000001'), 'the dismissal is soft-deleted');
select extensions.throws_ok($$select public.t69_ap('recurring_dismissals', 'f6900000-0000-0000-0000-000000000002', '{"deleted_at":"$now"}')$$,
  '42501', null, 'another household''s dismissal is refused');

select extensions.is(public.t69_ap('income_payer_prompts', 'a7900000-0000-0000-0000-000000000001',
  '{"income_kind":"freelance","counts_as":"kept","apply_to_future":false,"deleted_at":"$now"}'),
  'applied', 'income_payer_prompts accepts income_kind, counts_as, apply_to_future and deleted_at');
select extensions.ok((select income_kind = 'freelance' and counts_as = 'kept' and not apply_to_future and deleted_at is not null
    from public.income_payer_prompts where id = 'a7900000-0000-0000-0000-000000000001'), 'the prompt columns landed');

select extensions.is(public.t69_ap('decide_answers', 'b7900000-0000-0000-0000-000000000001', '{"amount":120000,"on_date":"2026-10-20"}'),
  'applied', 'decide_answers accepts amount and on_date');
select extensions.is(public.t69_ap('decide_answers', 'b7900000-0000-0000-0000-000000000002', '{"bool_value":false,"deleted_at":"$now"}'),
  'applied', 'decide_answers accepts bool_value and deleted_at');
select extensions.ok((select amount = 120000 and on_date = date '2026-10-20' from public.decide_answers where id = 'b7900000-0000-0000-0000-000000000001')
    and (select bool_value = false and deleted_at is not null from public.decide_answers where id = 'b7900000-0000-0000-0000-000000000002'),
  'the answer columns landed with their types');
select extensions.throws_ok($$select public.t69_ap('decide_answers', 'b7900000-0000-0000-0000-000000000003', '{"amount":1}')$$,
  '42501', null, 'another user''s answer is refused');

-- ---------------------------------------------------------------------
-- 6. undo_log_fill and the already-applied replay (49-52).
-- ---------------------------------------------------------------------
select extensions.lives_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e6900000-0000-0000-0000-0000000000a1', 'x',
    jsonb_build_array(
      jsonb_build_object('entity','decide_settings','id',(select id from sid),'expectedVersion',1,'patch','{"rough_income":1}'::jsonb),
      jsonb_build_object('entity','recurring_dismissals','id','f6900000-0000-0000-0000-000000000001','expectedVersion',1,'patch','{"deleted_at":null}'::jsonb),
      jsonb_build_object('entity','income_payer_prompts','id','a7900000-0000-0000-0000-000000000001','expectedVersion',1,'patch','{"deleted_at":null}'::jsonb),
      jsonb_build_object('entity','decide_answers','id','b7900000-0000-0000-0000-000000000001','expectedVersion',1,'patch','{"amount":1}'::jsonb)))$$,
  'undo_log_fill accepts steps touching the four new entities');
select extensions.throws_ok(
  $$insert into public.undo_log (id, label_key, ops) values ('e6900000-0000-0000-0000-0000000000a2', 'x',
    '[{"entity":"profiles","id":"c4000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"decide_v3":true}}]'::jsonb)$$,
  '22023', null, 'undo_log_fill still refuses profiles');
select extensions.is(
  (public.apply_patches(
     jsonb_build_array(jsonb_build_object('entity', 'decide_settings', 'id', (select id from sid),
       'expectedVersion', public.t69_ver('decide_settings', (select id from sid)), 'patch', '{"rough_spending":9000}'::jsonb)),
     jsonb_build_object('id', 'e6900000-0000-0000-0000-0000000000a3', 'label_key', 'x',
       'ops', jsonb_build_array(jsonb_build_object('entity', 'decide_settings', 'id', (select id from sid), 'expectedVersion', 1, 'patch', '{"rough_spending":null}'::jsonb)))
   ) ->> 'status'),
  'applied', 'apply_patches records an undo step that touches decide_settings');
select extensions.is(
  (public.apply_patches(
     jsonb_build_array(jsonb_build_object('entity', 'decide_settings', 'id', (select id from sid),
       'expectedVersion', 1, 'patch', '{"rough_spending":9000}'::jsonb)),
     jsonb_build_object('id', 'e6900000-0000-0000-0000-0000000000a3', 'label_key', 'x',
       'ops', jsonb_build_array(jsonb_build_object('entity', 'decide_settings', 'id', (select id from sid), 'expectedVersion', 1, 'patch', '{"rough_spending":null}'::jsonb)))
   ) ->> 'status'),
  'already-applied', 'a replay of the same step id is reported as already-applied for decide_settings');

select * from extensions.finish();
rollback;
