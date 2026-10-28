-- pgTAP: Phase 05.2 (05.2-08, DSU-22, C13) -- deleting an auth user erases every row in every 05.2 table and
-- leaves no 05.2 column pointing at erased data; a generic guard fails if any public FK to auth.users or
-- public.households is not cascade or set null. The purge is the FK cascade (no SQL purge function exists).
--
-- Needs 20261028000100 .. 20261028001100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(34);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
create temp table a_hh as select id from hh where owner_id = '11111111-1111-1111-1111-111111111111';

-- B joins A's household as a member.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from a_hh), '22222222-2222-2222-2222-222222222222', 'member', 1);

-- ---------------------------------------------------------------------
-- Fixtures, written as the table owner.
-- ---------------------------------------------------------------------
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a7000000-0000-0000-0000-000000000001', (select id from a_hh), 'Checking', 'checking', 'USD', 0),
  ('a7000000-0000-0000-0000-000000000002', (select id from a_hh), 'Envelope pot', 'checking', 'USD', 0);

select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, bucket, monthly_amount, account_id, color_key) values
  ('b7000000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'pot', 'Trip', 'USD', 'trip', 1000,
   'a7000000-0000-0000-0000-000000000002', 'teal');
select set_config('fincwin.decide_rpc', '', true);

update public.accounts set use = 'dedicated', use_purpose = 'envelope', use_envelope_id = 'b7000000-0000-0000-0000-000000000001'
 where id = 'a7000000-0000-0000-0000-000000000002';

insert into public.recurring_series (id, household_id, created_by, account_id, category_id, name, amount, currency, freq, anchor_date, time_zone,
  counts_as, income_kind, saving_mode, pay_group) values
  ('5e700000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'a7000000-0000-0000-0000-000000000001',
   (select id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries'),
   'Pay', 300000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC', 'available', 'salary_or_wages', 'fixed', 'a7000000-0000-0000-0000-0000000000ff');

insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, is_refund, income_kind, counts_as) values
  ('e7000000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'a7000000-0000-0000-0000-000000000001', -10000, 'USD', current_date, 'UTC', false, null, null);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, is_refund, income_kind, counts_as, refund_of) values
  ('e7000000-0000-0000-0000-000000000002', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'a7000000-0000-0000-0000-000000000001', 3000, 'USD', current_date, 'UTC', true, 'refund', 'kept', 'e7000000-0000-0000-0000-000000000001');

insert into public.debts (id, household_id, created_by, name, kind, currency, pays_in_full) values
  ('d7000000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'Card', 'card', 'USD', 'sometimes');

insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c7000000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'buy', 'Sofa', '{"kind":"buy","itemType":"other"}');

update public.profiles set decide_v3 = true where id = '11111111-1111-1111-1111-111111111111';

insert into public.decide_settings (user_id, currency, income_types, income_pattern, income_pattern_confirmed, variable_method, steady_amount,
  spread_months, hold_months, share_pct, detail, remind_plan, remind_unspent, setup_done_at, everyday_override, everyday_override_at, month_marks,
  unspent_anchor, unspent_anchor_at, reserve_account_id, reserve_goal, rough_saving, rough_debt, rough_invest, rough_as_of,
  unexplained_amount, unexplained_use, unexplained_at, refine_last_at, refine_snooze_until) values
  ('11111111-1111-1111-1111-111111111111', 'USD', '{salary_or_wages}', 'steady', true, null, 300000, 6, 2, 50, 'full', true, true, now(), 1000, current_date,
   '{"2026-08":"half"}', 5000, current_date, null, 100000, 100, 200, 300, current_date, 400, 'spare', current_date, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'USD', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
   null, null, null, null, null, null, null, null, null, null, null);

-- The reserve account guard reads the caller's households, so set the claim for this one update.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.decide_settings set reserve_account_id = 'a7000000-0000-0000-0000-000000000001' where user_id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claims', '', true);

insert into public.recurring_dismissals (id, household_id, created_by, payee_key, direction) values
  ('f7000000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'coffee', 'out'),
  ('f7000000-0000-0000-0000-000000000002', (select id from a_hh), '22222222-2222-2222-2222-222222222222', 'tea', 'out');

insert into public.income_payer_prompts (id, household_id, created_by, payer_key, income_kind, counts_as) values
  ('a7700000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'acme', 'salary_or_wages', 'available');

insert into public.decide_answers (id, household_id, created_by, kind, key, amount, on_date, bool_value, check_id) values
  ('b7700000-0000-0000-0000-000000000001', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'expected_income', '2026-10', 100000, '2026-10-15', null, null),
  ('b7700000-0000-0000-0000-000000000002', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'pay_arrival', '5e700000-0000-0000-0000-000000000001:2026-10-05', null, '2026-10-05', true, null),
  ('b7700000-0000-0000-0000-000000000003', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'held_bridge', 'c7000000-0000-0000-0000-000000000001', 5000, null, null, 'c7000000-0000-0000-0000-000000000001'),
  ('b7700000-0000-0000-0000-000000000004', (select id from a_hh), '11111111-1111-1111-1111-111111111111', 'volatile_cover', 'c7000000-0000-0000-0000-000000000001', null, null, true, 'c7000000-0000-0000-0000-000000000001'),
  ('b7700000-0000-0000-0000-000000000005', (select id from a_hh), '22222222-2222-2222-2222-222222222222', 'expected_income', '2026-11', 70000, '2026-11-15', null, null);

-- ---------------------------------------------------------------------
-- 1. Seeded (1-2).
-- ---------------------------------------------------------------------
select extensions.is(
  (select (select count(*) from public.decide_settings) + (select count(*) from public.decide_answers where household_id = (select id from a_hh))
        + (select count(*) from public.recurring_dismissals where household_id = (select id from a_hh))
        + (select count(*) from public.income_payer_prompts where household_id = (select id from a_hh)))::int,
  2 + 5 + 2 + 1, 'every new table holds its seeded rows');
select extensions.ok((select decide_v3 from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'A has the decide_v3 switch on');

-- ---------------------------------------------------------------------
-- 2. A non-owner member leaves (3-9): household data stays, B's own rows go.
-- ---------------------------------------------------------------------
select extensions.lives_ok($$delete from auth.users where id = '22222222-2222-2222-2222-222222222222'$$, 'deleting a member succeeds');
select extensions.is((select count(*)::int from public.decide_settings where user_id = '22222222-2222-2222-2222-222222222222'), 0, 'B''s decide_settings row is gone');
select extensions.is((select count(*)::int from public.decide_answers where id = 'b7700000-0000-0000-0000-000000000005'), 0, 'B''s owner-private decide_answers row is gone');
select extensions.is((select count(*)::int from public.decide_answers where household_id = (select id from a_hh)), 4, 'A''s answers remain');
select extensions.is((select created_by from public.recurring_dismissals where id = 'f7000000-0000-0000-0000-000000000002'), null,
  'B''s household-scoped dismissal stays but no longer points at B');
select extensions.is((select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 1, 'A''s decide_settings remain');
select extensions.is((select count(*)::int from public.income_payer_prompts where household_id = (select id from a_hh)), 1, 'A''s payer prompt remains');

-- ---------------------------------------------------------------------
-- 3. The household owner deletes their account (10-23): nothing remains.
-- ---------------------------------------------------------------------
create temp table a_hh_gone as select id from a_hh;
select extensions.lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'deleting the owner succeeds');
select extensions.is((select count(*)::int from public.decide_settings), 0, 'no decide_settings rows remain');
select extensions.is((select count(*)::int from public.decide_answers where household_id in (select id from a_hh_gone)), 0, 'no decide_answers rows remain');
select extensions.is((select count(*)::int from public.recurring_dismissals where household_id in (select id from a_hh_gone)), 0, 'no recurring_dismissals rows remain');
select extensions.is((select count(*)::int from public.income_payer_prompts where household_id in (select id from a_hh_gone)), 0, 'no income_payer_prompts rows remain');
select extensions.is((select count(*)::int from public.savings_goals where household_id in (select id from a_hh_gone)), 0, 'no savings_goals (buckets) remain');
select extensions.is((select count(*)::int from public.transactions where household_id in (select id from a_hh_gone)), 0, 'no transactions (income tags, refund link) remain');
select extensions.is((select count(*)::int from public.accounts where household_id in (select id from a_hh_gone)), 0, 'no accounts (use columns) remain');
select extensions.is((select count(*)::int from public.recurring_series where household_id in (select id from a_hh_gone)), 0, 'no recurring_series (attributes) remain');
select extensions.is((select count(*)::int from public.debts where household_id in (select id from a_hh_gone)), 0, 'no debts (pays_in_full) remain');
select extensions.is((select count(*)::int from public.decide_checks where household_id in (select id from a_hh_gone)), 0, 'no decide_checks remain');
select extensions.is((select count(*)::int from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 0, 'the profile (decide_v3 switch) is gone');
select extensions.is((select count(*)::int from public.households where id in (select id from a_hh_gone)), 0, 'the household is gone');
select extensions.is((select count(*)::int from public.decide_answers), 0, 'no decide_answers rows remain anywhere');

-- ---------------------------------------------------------------------
-- 4. Generic FK delete-rule guard (24-34).
-- ---------------------------------------------------------------------
select extensions.is(
  (select count(*)::int from pg_constraint c
     join pg_class t on t.oid = c.conrelid
     join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and c.confrelid in ('auth.users'::regclass, 'public.households'::regclass)
      and c.confdeltype not in ('c', 'n')),
  0, 'every public FK to auth.users or public.households is cascade or set null');

create function pg_temp.fk_rule(p_table text, p_column text) returns text language sql as $$
  select string_agg(c.confdeltype::text, ',')
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.contype = 'f' and c.conrelid = ('public.' || p_table)::regclass and a.attname = p_column;
$$;
select extensions.ok(pg_temp.fk_rule('transactions', 'refund_of') in ('c', 'n'), 'transactions.refund_of is cascade or set null');
select extensions.ok(pg_temp.fk_rule('decide_settings', 'reserve_account_id') in ('c', 'n'), 'decide_settings.reserve_account_id is cascade or set null');
select extensions.ok(pg_temp.fk_rule('accounts', 'use_envelope_id') in ('c', 'n'), 'accounts.use_envelope_id is cascade or set null');
select extensions.ok(pg_temp.fk_rule('savings_goals', 'account_id') in ('c', 'n'), 'savings_goals.account_id is cascade or set null');
select extensions.ok(pg_temp.fk_rule('decide_answers', 'check_id') in ('c', 'n'), 'decide_answers.check_id is cascade or set null');
select extensions.ok(pg_temp.fk_rule('decide_answers', 'created_by') in ('c', 'n'), 'decide_answers.created_by is cascade or set null');
select extensions.ok(pg_temp.fk_rule('recurring_dismissals', 'created_by') in ('c', 'n'), 'recurring_dismissals.created_by is cascade or set null');
select extensions.ok(pg_temp.fk_rule('income_payer_prompts', 'created_by') in ('c', 'n'), 'income_payer_prompts.created_by is cascade or set null');
select extensions.ok(pg_temp.fk_rule('decide_settings', 'user_id') in ('c', 'n'), 'decide_settings.user_id is cascade or set null');
select extensions.ok(pg_temp.fk_rule('recurring_dismissals', 'household_id') in ('c', 'n'), 'recurring_dismissals.household_id is cascade or set null');

select * from extensions.finish();
rollback;
