-- pgTAP: Phase 8 plan 08-07, SC7 (blocking). The two-user privacy suite: member B, who shares A's household, cannot read,
-- update, delete, RPC-read, view-read or export member A's personal rows on any household table (CMP-F18, ARC-22), while
-- A's shared rows and A's joint account (with its full balance) stay visible to B (D-13), and B cannot read A's profile
-- name or email (D-32).
--
-- Every exported table is listed below; src/data/__tests__/exportManifest.test.ts fails when EXPORT_MANIFEST names a table
-- that is not in this block. Tables created by later plans are pre-listed with the plan number that adds them (their own
-- pgTAP files prove B cannot read A's rows in them), so no later plan edits this file.
--
-- export-tables:
-- transactions
-- accounts
-- categories
-- category_rules
-- recurring_series
-- custom_currencies
-- import_profiles
-- undo_log
-- dismissed_series_offers
-- statement_periods
-- households
-- household_members
-- household_events
-- profiles
-- decide_checks
-- decide_links
-- decide_changes
-- debts
-- savings_goals
-- decide_settings
-- recurring_dismissals
-- income_payer_prompts
-- holdings
-- holding_lots
-- decide_check_history
-- decide_answers
-- household_invites (105)
-- transaction_splits (107)
-- transaction_member_categories (107)
-- household_split_defaults (107)
-- settlements (108)
-- settlement_lines (108)
-- household_former_members (109)
-- member_departures (109)
-- decide_partner_optins (111)
-- safety_net_shares (111)
-- household_spend_rules (114)
-- user_setup (111)
-- feature_switches (111)
-- archived_months (120)
-- alert_settings (120)
-- alert_prefs (120)
-- alert_log (120)
-- end-export-tables

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(147);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bob Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B leaves their household of one and joins A's (superuser, new member columns): B is not the owner, weight 0.
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', false, 0);

-- Test helpers, run as the calling user so row level security applies. Created before the role switch.
create function public.t101_n(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || q || ') s' into n;
  return n;
end;
$$;
-- Runs one statement and reports its single value, or the SQLSTATE and message of the refusal.
create function public.t101_probe(q text) returns text language plpgsql as $$
declare v text;
begin
  execute q into v;
  return 'OK:' || coalesce(v, 'null');
exception when others then
  return 'ERR:' || sqlstate || ':' || sqlerrm;
end;
$$;
-- One statement template with @ID@ replaced by A's row id and by a missing id. The two refusals must be identical once the
-- id is masked, must not be a success, and must contain `must` (when given). A refusal that differs would let B probe for rows.
create function public.t101_same(tpl text, rid uuid, must text) returns text language plpgsql as $$
declare
  a text := public.t101_probe(replace(tpl, '@ID@', rid::text));
  b text := public.t101_probe(replace(tpl, '@ID@', 'ffffffff-ffff-ffff-ffff-ffffffffffff'));
begin
  a := replace(a, rid::text, '@ID@');
  b := replace(b, 'ffffffff-ffff-ffff-ffff-ffffffffffff', '@ID@');
  if a = b and a !~ 'applied' and (must = '' or a like '%' || must || '%') then
    return 'same';
  end if;
  return 'differ: ' || left(a, 240) || ' <> ' || left(b, 240);
end;
$$;
grant execute on function public.t101_n(text), public.t101_probe(text), public.t101_same(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Fixtures as the table owner. A's personal account PA and joint account JA.
-- ---------------------------------------------------------------------
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1010000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('a1010000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Joint', 'checking', 'USD', 0, true);

insert into public.categories (id, owner_id, name, color_key) values ('a1010000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'A custom category', 'green');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);  -- the rule trigger stamps owner_id from the session
insert into public.category_rules (id, scope, owner_id, keyword, keyword_norm, category_id)
values ('a1010000-0000-0000-0000-000000000004', 'personal', '11111111-1111-1111-1111-111111111111', 'Gym', 'gym', 'a1010000-0000-0000-0000-000000000003');
select set_config('request.jwt.claims', '', true);

-- Lines: T1 personal on PA, T2 shared on PA, T3 shared on JA, T4 personal on JA (A pays into joint), T5 personal on PA linked to A's debt.
insert into public.debts (id, household_id, created_by, name, kind, currency, balance) values
  ('a1010000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A loan', 'loan', 'USD', 90000);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('a1010000-0000-0000-0000-000000000006', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000001', -90000, 'USD', '2026-11-02', 'UTC', 'Secret rent', 'paid', false),
  ('a1010000-0000-0000-0000-000000000007', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000001', -1000, 'USD', '2026-11-03', 'UTC', 'Shared shop', 'paid', true),
  ('a1010000-0000-0000-0000-000000000008', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000002', -2000, 'USD', '2026-11-04', 'UTC', 'Joint bill', 'paid', true),
  ('a1010000-0000-0000-0000-000000000009', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000002', 50000, 'USD', '2026-11-05', 'UTC', 'A pay into joint', 'paid', false);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared, debt_id) values
  ('a1010000-0000-0000-0000-000000000010', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000001', -5000, 'USD', '2026-11-06', 'UTC', 'Loan payment', 'paid', false, 'a1010000-0000-0000-0000-000000000005');

-- Goals: G (with an Expected contribution line through series SG) and the safety net N.
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, name, currency, target) values
  ('a1010000-0000-0000-0000-000000000011', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A goal', 'USD', 100000);
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by, is_safety_net, locked) values
  ('a1010000-0000-0000-0000-000000000012', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'pot', 'A safety net', 'USD', 230000, current_date + 90, true, true);
select set_config('fincwin.decide_rpc', '', true);

-- Series: SP personal, SS shared (on the joint account), SG personal and tagged to goal G.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_shared) values
  ('a1010000-0000-0000-0000-000000000013', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000001', 'A personal series', -5000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC', false),
  ('a1010000-0000-0000-0000-000000000014', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000002', 'A shared series', -6000, 'USD', 'monthly', date_trunc('month', current_date)::date, 'UTC', true);
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_shared, goal_id) values
  ('a1010000-0000-0000-0000-000000000015', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000001', 'A goal series', -7000, 'USD', 'monthly', current_date + 1, 'UTC', false, 'a1010000-0000-0000-0000-000000000011');
select public.materialise_series('a1010000-0000-0000-0000-000000000015'::uuid, current_date);
create temp table pend as
  select id from public.transactions where recurring_series_id = 'a1010000-0000-0000-0000-000000000015' and status = 'pending' and deleted_at is null order by occurrence_date limit 1;
grant select on pend to authenticated;

-- Owner-only Decide, Grow and bookkeeping rows.
insert into public.recurring_dismissals (id, household_id, created_by, payee_key, direction) values
  ('a1010000-0000-0000-0000-000000000016', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'coffee shop|USD|-1', 'out');
insert into public.income_payer_prompts (id, household_id, created_by, payer_key, income_kind, counts_as) values
  ('a1010000-0000-0000-0000-000000000017', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'acme', 'salary', 'available');
insert into public.decide_checks (id, household_id, created_by, kind, name) values
  ('a1010000-0000-0000-0000-000000000018', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'buy', 'Laptop');
insert into public.decide_links (id, household_id, created_by, check_id, entity, target_id) values
  ('a1010000-0000-0000-0000-000000000019', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000018', 'transactions', 'a1010000-0000-0000-0000-000000000006');
insert into public.decide_changes (id, household_id, created_by, kind, name, monthly_amount, currency, start_month) values
  ('a1010000-0000-0000-0000-000000000020', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'spending', 'Gym', -4000, 'USD', '2026-11');
insert into public.decide_answers (id, household_id, created_by, kind, key, amount, on_date) values
  ('a1010000-0000-0000-0000-000000000021', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'expected_income', '2026-11', 100000, '2026-11-01');
insert into public.decide_settings (user_id, currency) values ('11111111-1111-1111-1111-111111111111', 'USD');
insert into public.decide_check_history (id, check_id, created_by, said_on, code, variant, result) values
  ('a1010000-0000-0000-0000-000000000022', 'a1010000-0000-0000-0000-000000000018', '11111111-1111-1111-1111-111111111111', current_date, 'fits', null, '{"v":1}');
insert into public.holdings (id, household_id, created_by, name, type, currency, value, value_as_of) values
  ('a1010000-0000-0000-0000-000000000023', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Brokerage', 'brokerage', 'USD', 645000, date '2026-11-01');
insert into public.holding_lots (id, holding_id, household_id, created_by, kind, amount, local_date) values
  ('a1010000-0000-0000-0000-000000000024', 'a1010000-0000-0000-0000-000000000023', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'value', 650000, date '2026-11-05');
insert into public.import_profiles (id, owner_id, account_id, layout_signature, profile) values
  ('a1010000-0000-0000-0000-000000000025', '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000001', 'sig-1', '{"sign":"positive-is-in"}'::jsonb);
insert into public.custom_currencies (id, owner_id, code, symbol, decimals, reference_currency, unit_value, as_of) values
  ('a1010000-0000-0000-0000-000000000026', '11111111-1111-1111-1111-111111111111', 'GLD', 'G', 0, 'USD', 2.5, '2026-09-20');
insert into public.dismissed_series_offers (owner_id, offer_key) values ('11111111-1111-1111-1111-111111111111', 'netflix|GBP|-');
insert into public.undo_log (id, owner_id, label_key, label_params, ops) values
  ('a1010000-0000-0000-0000-000000000027', '11111111-1111-1111-1111-111111111111', 'edited', '{}'::jsonb,
   '[{"entity":"transactions","id":"a1010000-0000-0000-0000-000000000006","expectedVersion":1,"patch":{"note":"z"}}]'::jsonb);
insert into public.statement_periods (id, household_id, account_id, period_start, period_end) values
  ('a1010000-0000-0000-0000-000000000028', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1010000-0000-0000-0000-000000000001', '2026-10-01', '2026-10-31'),
  ('a1010000-0000-0000-0000-000000000029', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1010000-0000-0000-0000-000000000002', '2026-10-01', '2026-10-31');

-- Before B acts: what A owns, so the end of the file can prove nothing of it changed.
create temp table before_rows as
  select 'transactions' as t, id, version, deleted_at is not null as gone from public.transactions
  union all select 'accounts', id, version, deleted_at is not null from public.accounts
  union all select 'recurring_series', id, version, deleted_at is not null from public.recurring_series
  union all select 'debts', id, version, deleted_at is not null from public.debts
  union all select 'savings_goals', id, version, deleted_at is not null from public.savings_goals
  union all select 'holdings', id, version, deleted_at is not null from public.holdings
  union all select 'decide_checks', id, version, deleted_at is not null from public.decide_checks;
create temp table before_counts as select count(*) as n from public.transactions where recurring_series_id in ('a1010000-0000-0000-0000-000000000013', 'a1010000-0000-0000-0000-000000000015');

-- 0. Fixture sanity (superuser): the bookkeeping row and the Expected goal line exist.
select extensions.ok(exists (select 1 from public.debt_line_applied where debt_id = 'a1010000-0000-0000-0000-000000000005'), 'fixture: a paid line linked to the debt produced a debt_line_applied row');
select extensions.ok(exists (select 1 from pend), 'fixture: goal G has an Expected (pending) contribution line');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- 1. Read: B sees none of A's personal rows on any owner-only table.
select extensions.is(public.t101_n(format('select 1 from public.%I where %I = %L', v.tb, v.col, '11111111-1111-1111-1111-111111111111')), 0::bigint,
       'B reads none of A''s ' || v.tb || ' rows')
  from (values
    ('debts', 'created_by'), ('recurring_dismissals', 'created_by'), ('income_payer_prompts', 'created_by'),
    ('decide_checks', 'created_by'), ('decide_links', 'created_by'), ('decide_changes', 'created_by'),
    ('decide_answers', 'created_by'), ('savings_goals', 'created_by'), ('holdings', 'created_by'),
    ('holding_lots', 'created_by'), ('decide_settings', 'user_id'), ('undo_log', 'owner_id'),
    ('import_profiles', 'owner_id'), ('custom_currencies', 'owner_id'), ('dismissed_series_offers', 'owner_id'),
    ('decide_check_history', 'created_by'), ('categories', 'owner_id'), ('category_rules', 'owner_id')
  ) v(tb, col);

select extensions.is(public.t101_n(format('select 1 from public.%I where created_by = %L and not is_shared', v.tb, '11111111-1111-1111-1111-111111111111')), 0::bigint,
       'B reads none of A''s personal ' || v.tb || ' rows')
  from (values ('transactions'), ('accounts'), ('recurring_series')) v(tb);

-- 2. Positive control: shared rows and the joint account are visible.
select extensions.is(public.t101_n(format('select 1 from public.transactions where created_by = %L and is_shared and recurring_series_id is null', '11111111-1111-1111-1111-111111111111')), 2::bigint,
       'B reads A''s two shared lines (positive control)');
select extensions.is(public.t101_n('select 1 from public.accounts where id = ''a1010000-0000-0000-0000-000000000002'''), 1::bigint, 'B reads A''s joint account (D-13)');
select extensions.is(public.t101_n('select 1 from public.accounts where id = ''a1010000-0000-0000-0000-000000000001'''), 0::bigint, 'B does not read A''s personal account');
select extensions.is(public.t101_n('select 1 from public.recurring_series where id = ''a1010000-0000-0000-0000-000000000014'''), 1::bigint, 'B reads A''s shared series (positive control)');

-- 3. Statement periods follow the card account (D-43).
select extensions.is(public.t101_n('select 1 from public.statement_periods where account_id = ''a1010000-0000-0000-0000-000000000001'''), 0::bigint, 'B cannot read the statement period of A''s personal card (D-43)');
select extensions.is(public.t101_n('select 1 from public.statement_periods where account_id = ''a1010000-0000-0000-0000-000000000002'''), 1::bigint, 'B reads the statement period of the joint account (D-43)');

-- 4. Update: B changes none of A's personal rows (0 rows), and has no update path at all on the server-written tables.
select extensions.is(public.t101_probe(format('with w as (update public.%I set %I = %I where id = %L returning 1) select count(*) from w', v.tb, v.col, v.col, v.id)), 'OK:0',
       'B updates none of A''s ' || v.tb || ' rows')
  from (values
    ('transactions', 'note', 'a1010000-0000-0000-0000-000000000006'), ('accounts', 'name', 'a1010000-0000-0000-0000-000000000001'), ('debts', 'name', 'a1010000-0000-0000-0000-000000000005'),
    ('recurring_dismissals', 'deleted_at', 'a1010000-0000-0000-0000-000000000016'), ('income_payer_prompts', 'counts_as', 'a1010000-0000-0000-0000-000000000017'),
    ('decide_checks', 'name', 'a1010000-0000-0000-0000-000000000018'), ('decide_links', 'deleted_at', 'a1010000-0000-0000-0000-000000000019'), ('decide_changes', 'name', 'a1010000-0000-0000-0000-000000000020'),
    ('decide_answers', 'amount', 'a1010000-0000-0000-0000-000000000021'), ('savings_goals', 'name', 'a1010000-0000-0000-0000-000000000011'), ('holdings', 'name', 'a1010000-0000-0000-0000-000000000023'),
    ('holding_lots', 'note', 'a1010000-0000-0000-0000-000000000024'), ('import_profiles', 'profile', 'a1010000-0000-0000-0000-000000000025'), ('custom_currencies', 'symbol', 'a1010000-0000-0000-0000-000000000026'),
    ('categories', 'name', 'a1010000-0000-0000-0000-000000000003'), ('category_rules', 'keyword', 'a1010000-0000-0000-0000-000000000004')
  ) v(tb, col, id);
select extensions.is(public.t101_probe('with w as (update public.decide_settings set currency = currency where user_id = ''11111111-1111-1111-1111-111111111111'' returning 1) select count(*) from w'), 'OK:0',
       'B updates none of A''s decide_settings row');
select extensions.is(public.t101_probe(format('with w as (update public.%I set %I = %I where %s returning 1) select count(*) from w', v.tb, v.col, v.col, v.cond)), 'ERR:42501:permission denied for table ' || v.tb,
       'B has no update path on ' || v.tb)
  from (values
    ('recurring_series', 'version', 'id = ''a1010000-0000-0000-0000-000000000013'''), ('undo_log', 'status', 'id = ''a1010000-0000-0000-0000-000000000027'''),
    ('statement_periods', 'period_start', 'id = ''a1010000-0000-0000-0000-000000000028'''), ('decide_check_history', 'code', 'id = ''a1010000-0000-0000-0000-000000000022'''),
    ('household_members', 'weight', 'user_id = ''11111111-1111-1111-1111-111111111111'''), ('households', 'name', 'true')
  ) v(tb, col, cond);

-- 5. Delete: soft delete changes 0 rows, hard delete has no grant.
select extensions.is(public.t101_probe(format('with w as (update public.%I set deleted_at = now() where id = %L returning 1) select count(*) from w', v.tb, v.id)), 'OK:0',
       'B soft-deletes none of A''s ' || v.tb || ' rows')
  from (values ('transactions', 'a1010000-0000-0000-0000-000000000006'), ('accounts', 'a1010000-0000-0000-0000-000000000001'), ('debts', 'a1010000-0000-0000-0000-000000000005'), ('savings_goals', 'a1010000-0000-0000-0000-000000000011'), ('holdings', 'a1010000-0000-0000-0000-000000000023'), ('decide_checks', 'a1010000-0000-0000-0000-000000000018')) v(tb, id);
select extensions.is(public.t101_probe(format('with w as (delete from public.%I where id = %L returning 1) select count(*) from w', v.tb, v.id)), 'ERR:42501:permission denied for table ' || v.tb,
       'B cannot hard-delete ' || v.tb || ' rows (no delete grant)')
  from (values ('transactions', 'a1010000-0000-0000-0000-000000000006'), ('accounts', 'a1010000-0000-0000-0000-000000000001'), ('debts', 'a1010000-0000-0000-0000-000000000005'), ('recurring_series', 'a1010000-0000-0000-0000-000000000013'), ('undo_log', 'a1010000-0000-0000-0000-000000000027'), ('holdings', 'a1010000-0000-0000-0000-000000000023')) v(tb, id);

-- 6. Views.
select extensions.is(public.t101_n(format('select 1 from public.transactions_active where created_by = %L and not is_shared', '11111111-1111-1111-1111-111111111111')), 0::bigint, 'transactions_active shows none of A''s personal lines to B');
select extensions.is(public.t101_n(format('select 1 from public.transactions_active where created_by = %L and is_shared and recurring_series_id is null', '11111111-1111-1111-1111-111111111111')), 2::bigint, 'transactions_active shows A''s shared lines to B');
select extensions.is(public.t101_n('select 1 from public.statement_periods_live where account_id = ''a1010000-0000-0000-0000-000000000001'''), 0::bigint, 'statement_periods_live shows none of A''s personal card periods to B');
select extensions.is(public.t101_n('select 1 from public.statement_periods_live where account_id = ''a1010000-0000-0000-0000-000000000002'''), 1::bigint, 'statement_periods_live shows the joint account period to B');

-- 7. Definer RPCs: refused exactly like a missing id, and nothing of A's personal rows comes back.
select extensions.is((select array_agg(account_id::text order by account_id) from public.joint_account_balances((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))),
       array['a1010000-0000-0000-0000-000000000002'], 'joint_account_balances returns the joint account and no personal account');
select extensions.is((select balance from public.joint_account_balances((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) where account_id = 'a1010000-0000-0000-0000-000000000002'), 48000::bigint,
       'joint_account_balances returns the full joint balance, including A''s personal line on it (D-13)');
select extensions.is((select coalesce(sum(paid_sum::bigint), -1000)::bigint from public.account_balances((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111')) where account_id = 'a1010000-0000-0000-0000-000000000001'), -1000::bigint,
       'account_balances counts only the shared line on A''s personal account, none of A''s personal lines');
select extensions.is(public.t101_same($t$select public.record_entry_list(array['@ID@'::uuid], '[]'::jsonb, '{"id":"a1010000-0000-0000-0000-000000000570","label_key":"x","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000006', 'ERR:22023'), 'same',
       'record_entry_list on A''s personal line is refused like a missing id');
select extensions.ok(public.t101_probe(format($t$select public.add_activity_month(%L::uuid, '2027-01', current_date, '{"id":"a1010000-0000-0000-0000-000000000571","label_key":"x","label_params":{}}'::jsonb)$t$,
         (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))) !~ '(Secret rent|A personal series|a1010000-0000-0000-0000-000000000006|a1010000-0000-0000-0000-000000000013)',
       'add_activity_month as B names nothing of A''s personal rows');
select extensions.is(public.t101_same(format($t$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity',%L,'id','@ID@','expectedVersion',1,'patch',jsonb_build_object(%L,%L))))$t$, v.tb, v.col, v.val), v.id::uuid, 'not-found'), 'same',
       'apply_patches on A''s personal ' || v.tb || ' row is refused like a missing id')
  from (values
    ('transactions', 'note', 'x', 'a1010000-0000-0000-0000-000000000006'), ('accounts', 'name', 'x', 'a1010000-0000-0000-0000-000000000001'), ('recurring_series', 'name', 'x', 'a1010000-0000-0000-0000-000000000013'),
    ('debts', 'name', 'x', 'a1010000-0000-0000-0000-000000000005'), ('income_payer_prompts', 'counts_as', 'kept', 'a1010000-0000-0000-0000-000000000017')
  ) v(tb, col, val, id);
-- The owner-private Decide and Grow entities: refused exactly like a missing id (08-05 follow-up, 2026-11-15), the same
-- not-found conflict, nothing echoed. Nothing written either (the unchanged-rows check at the end).
select extensions.is(public.t101_same(format($t$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity',%L,'id','@ID@','expectedVersion',1,'patch',jsonb_build_object(%L,%L))))$t$, v.tb, v.col, v.val), v.id::uuid, 'not-found'), 'same',
       'apply_patches on A''s personal ' || v.tb || ' row is refused like a missing id')
  from (values
    ('savings_goals', 'name', 'x', 'a1010000-0000-0000-0000-000000000011'), ('holdings', 'name', 'x', 'a1010000-0000-0000-0000-000000000023'), ('holding_lots', 'note', 'x', 'a1010000-0000-0000-0000-000000000024'),
    ('decide_answers', 'amount', '1', 'a1010000-0000-0000-0000-000000000021'), ('decide_changes', 'name', 'x', 'a1010000-0000-0000-0000-000000000020'), ('decide_checks', 'deleted_at', null, 'a1010000-0000-0000-0000-000000000018'),
    ('recurring_dismissals', 'deleted_at', null, 'a1010000-0000-0000-0000-000000000016')
  ) v(tb, col, val, id);
select extensions.is(public.t101_same($t$select public.apply_undo_step('@ID@'::uuid)$t$, 'a1010000-0000-0000-0000-000000000027', 'not-found'), 'same', 'apply_undo_step on A''s step is refused like a missing step');
select extensions.is(public.t101_same($t$select public.rollback_undo_to('@ID@'::uuid)$t$, 'a1010000-0000-0000-0000-000000000027', ''), 'same', 'rollback_undo_to on A''s step is refused like a missing step');

-- 8. Export: the manifest's own columns, selected as B, return no personal row of A (own and shared rows only).
select extensions.is(public.t101_probe(format('select count(*) from (select %s from public.%I) q%s', v.cols, v.tb,
         case when v.tb in ('categories', 'category_rules') then format(' where q.owner_id = %L', '11111111-1111-1111-1111-111111111111') else '' end)),
       'OK:' || case v.tb when 'transactions' then '2' when 'accounts' then '1' when 'recurring_series' then '1' when 'statement_periods' then '1'
                          when 'households' then '1' when 'household_members' then '2' when 'profiles' then '1' else '0' end,
       'export of ' || v.tb || ' as B returns no personal row of A')
  from (values
  ('transactions', 'id, household_id, account_id, created_by, original_amount, original_currency, home_currency, home_amount, rate, orig_per_eur, home_per_eur, orig_custom_unit_value, orig_custom_ref_per_eur, home_custom_unit_value, home_custom_ref_per_eur, rate_date, rate_source, rate_pending, local_date, time_zone, note, name, category_id, payment_type, status, deleted_at, import_batch_id, recurring_series_id, occurrence_date, raw_amount, raw_balance, external_id, import_format, transfer_id, is_refund, is_automatic, one_off, goal_id, stmt_orig_amount, stmt_orig_currency, conversion_source, fx_fee_of, created_at, updated_at, income_kind, counts_as, refund_of, debt_id, is_shared, paid_by'),
  ('accounts', 'id, household_id, created_by, name, kind, currency, opening_balance, archived_at, overdraft_limit, credit_limit, deleted_at, created_at, updated_at, use, use_purpose, use_envelope_id, use_extra_set_aside, overdraft_rate, interest_rate, is_shared'),
  ('categories', 'id, owner_id, builtin_key, name, color_key, is_system, archived_at, monthly_cap, icon_key, created_at, updated_at'),
  ('category_rules', 'id, scope, owner_id, household_id, created_by, keyword, keyword_norm, category_id, target_builtin_key, target_name, deleted_at, created_at, updated_at'),
  ('recurring_series', 'id, household_id, created_by, account_id, name, amount, currency, category_id, payment_type, freq, anchor_date, time_zone, end_date, occurrence_count, materialised_through, deleted_at, is_automatic, created_at, updated_at, counts_as, income_kind, saving_mode, pay_group, end_reason, goal_id, is_shared'),
  ('custom_currencies', 'id, owner_id, code, symbol, decimals, reference_currency, unit_value, as_of, created_at, updated_at'),
  ('import_profiles', 'id, owner_id, account_id, layout_signature, profile, created_at'),
  ('undo_log', 'id, owner_id, label_key, label_params, status, refusal, created_at, resolved_at'),
  ('dismissed_series_offers', 'offer_key, created_at'),
  ('statement_periods', 'id, household_id, account_id, period_start, period_end, import_batch_id'),
  ('households', 'id, horizon_month, name, reporting_currency'),
  ('household_members', 'household_id, user_id, display_name, is_owner, role_label, colour_key, name_hidden, weight'),
  ('household_events', 'id, household_id, kind, actor_id, subject_id, ref_id, params, created_at'),
  ('profiles', 'home_currency, show_cents, lead_figure, region, region_subdivision, week_start, sample_prompt_answered_at'),
  ('decide_checks', 'id, household_id, created_by, kind, name, inputs, status, furthest_step, last_seen_state, last_seen_basis, answer_v3, reopened_from, decided_at, verdict_at_decision, estimate_day_one, estimate_monthly, wait_monthly, ready_by, broke_line, cooling_off_at, estimate_monthly_payment, estimate_running, deleted_at, created_at, updated_at'),
  ('decide_links', 'id, household_id, created_by, check_id, entity, target_id, source, role, deleted_at, created_at, updated_at'),
  ('decide_changes', 'id, household_id, created_by, kind, name, monthly_amount, currency, start_month, end_month, deleted_at, created_at, updated_at'),
  ('debts', 'id, household_id, account_id, check_id, series_id, name, kind, currency, balance, apr, minimum_payment, secured, term_months, start_date, min_percent, min_interest_added, min_floor, paid_in_full, is_housing, deleted_at, created_at, updated_at, pays_in_full, paid_off_on, due_day, started_balance, payoff_order, payoff_extra, extra_series_id'),
  ('savings_goals', 'id, household_id, created_by, check_id, name, currency, target, monthly_amount, ready_by, opening_saved, kind, done_at, deleted_at, created_at, updated_at, bucket, account_id, color_key, is_safety_net, locked, protect, up_front_only, icon, net_confirmed_at, decide_may_use'),
  ('decide_settings', 'id, user_id, currency, rough_income, rough_spending, reserve, dsr_line, housing_line, unsecured_multiple, investing_floor, saving_floor, basis_override, updated_at, income_types, income_pattern, income_pattern_confirmed, variable_method, steady_amount, spread_months, hold_months, detail, remind_plan, remind_unspent, setup_done_at, everyday_override, everyday_override_at, month_marks, unspent_anchor, unspent_anchor_at, reserve_account_id, reserve_goal, rough_saving, rough_debt, rough_invest, rough_as_of, unexplained_amount, unexplained_use, unexplained_at, refine_last_at, refine_snooze_until, custom_options, answered_no_debts_at, answered_net_not_set_at, answered_no_rules_at, answered_bills_right_at, tax_set_aside_bp'),
  ('recurring_dismissals', 'id, household_id, payee_key, direction, dismissed_at, created_by, deleted_at, created_at, updated_at'),
  ('income_payer_prompts', 'id, household_id, payer_key, income_kind, counts_as, apply_to_future, created_by, deleted_at, created_at, updated_at'),
  ('holdings', 'id, household_id, created_by, name, type, currency, value, value_as_of, opening_put_in, account_id, paid_from_account_id, monthly_amount, day, rate, deleted_at, created_at, updated_at'),
  ('holding_lots', 'id, holding_id, household_id, created_by, kind, amount, units, local_date, note, deleted_at, created_at, updated_at'),
  ('decide_check_history', 'id, check_id, created_by, said_on, code, variant, result, created_at'),
  ('decide_answers', 'id, household_id, created_by, kind, key, amount, bool_value, on_date, check_id, deleted_at, created_at, updated_at')
  ) v(tb, cols);

-- 9. Profiles: B cannot read A's name or email (D-32).
select extensions.is(public.t101_n('select 1 from public.profiles where id = ''11111111-1111-1111-1111-111111111111'''), 0::bigint, 'B cannot read A''s profile (name and email, D-32)');
select extensions.is(public.t101_n('select 1 from public.household_members where user_id = ''11111111-1111-1111-1111-111111111111'''), 1::bigint, 'B sees A''s membership row');
select extensions.ok(not exists (select 1 from information_schema.column_privileges where grantee = 'authenticated' and table_schema = 'public'
                                   and table_name = 'household_members' and column_name in ('email', 'full_name')),
       'household_members exposes no email or full_name column to clients (D-32)');

-- 10. Positive: B writes on the joint account but not on A's personal one, and cannot spoof created_by.
select extensions.lives_ok($$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
  values ('a1010000-0000-0000-0000-000000000030', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1010000-0000-0000-0000-000000000002', -100, 'USD', '2026-12-01', 'UTC', 'on joint')$$,
  'B can put a line on the joint account');
select extensions.throws_ok($$insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name)
  values ('a1010000-0000-0000-0000-000000000031', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1010000-0000-0000-0000-000000000002', -100, 'USD', '2026-12-01', 'UTC', 'spoof')$$,
  '42501', null, 'B cannot insert a line with created_by = A (no client grant on created_by; the session stamps it)');
select extensions.throws_ok($$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
  values ('a1010000-0000-0000-0000-000000000032', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1010000-0000-0000-0000-000000000001', -100, 'USD', '2026-12-01', 'UTC', 'onto A personal')$$,
  '42501', null, 'B cannot put a line on A''s personal account (guard_transaction_account)');

-- 11. Positive controls on B's own side: B keeps full access to B's own rows and the household.
select extensions.is(public.t101_n('select 1 from public.profiles where id = ''22222222-2222-2222-2222-222222222222'''), 1::bigint, 'B reads B''s own profile');
select extensions.is(public.t101_n('select 1 from public.households where id = (select id from hh where owner_id = ''11111111-1111-1111-1111-111111111111'')'), 1::bigint, 'B reads the household B belongs to');
select extensions.is(public.t101_n('select 1 from public.household_members where household_id = (select id from hh where owner_id = ''11111111-1111-1111-1111-111111111111'')'), 2::bigint, 'B sees the two members of the household');
select extensions.is(public.t101_n('select 1 from public.transactions where id = ''a1010000-0000-0000-0000-000000000030'''), 1::bigint, 'B reads the line B put on the joint account');
select extensions.is(public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'a1010000-0000-0000-0000-000000000030', 'expectedVersion', 1, 'patch', jsonb_build_object('note', 'mine')))) ->> 'status', 'applied',
       'B can patch B''s own line through apply_patches');
select extensions.is(public.t101_n('select 1 from public.undo_log where owner_id = ''22222222-2222-2222-2222-222222222222'''), 0::bigint, 'B has no undo steps of A''s in B''s own undo log');

-- 12. Owner-only tables added after 0b7c97ae.
select extensions.is(public.t101_n('select 1 from public.holdings'), 0::bigint, 'B reads none of A''s holdings');
select extensions.is(public.t101_n('select 1 from public.holding_lots'), 0::bigint, 'B reads none of A''s holding_lots');
select extensions.is(public.t101_n('select 1 from public.decide_check_history'), 0::bigint, 'B reads none of A''s decide_check_history');
select extensions.throws_ok($$select count(*) from public.debt_line_applied$$, '42501', null, 'debt_line_applied has no client grant: select throws 42501 for B');

-- 13. Grow and 06.1 RPCs on A's rows: refused with the same result as a missing id, nothing written.
select extensions.is(public.t101_same($t$select public.record_debt_one_off('@ID@'::uuid, '{"id":"a1010000-0000-0000-0000-000000000580","account_id":"a1010000-0000-0000-0000-000000000002","amount":1000,"currency":"USD","local_date":"2026-12-01","time_zone":"UTC","name":"x"}'::jsonb, '{"id":"a1010000-0000-0000-0000-000000000581","label_key":"debtOneOffRecorded","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000005', ''), 'same',
       'record_debt_one_off on A''s debt is refused like a missing debt');
select extensions.is(public.t101_same($t$select public.record_debt_sale('@ID@'::uuid, 1, '{"id":"a1010000-0000-0000-0000-000000000582","account_id":"a1010000-0000-0000-0000-000000000002","amount":1000,"currency":"USD","local_date":"2026-12-01","time_zone":"UTC","name":"x"}'::jsonb, null, '{"id":"a1010000-0000-0000-0000-000000000583","label_key":"debtSaleRecorded","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000005', ''), 'same',
       'record_debt_sale on A''s debt is refused like a missing debt');
select extensions.is(public.t101_same($t$select public.save_debt_plan('@ID@'::uuid, 1, 1000, 'rate', null, '{"id":"a1010000-0000-0000-0000-000000000584","label_key":"debtPlanSaved","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000005', ''), 'same',
       'save_debt_plan on A''s debt is refused like a missing debt');
select extensions.is(public.t101_same($t$select public.remove_debt('@ID@'::uuid, 1, '{"id":"a1010000-0000-0000-0000-000000000585","label_key":"debtRemoved","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000005', ''), 'same',
       'remove_debt on A''s debt is refused like a missing debt');
select extensions.is(public.t101_same($t$select public.remove_goal('@ID@'::uuid, 1, '{"id":"a1010000-0000-0000-0000-000000000586","label_key":"goalRemoved","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000011', ''), 'same',
       'remove_goal on A''s goal is refused like a missing goal');
select extensions.is(public.t101_same($t$select public.save_goal_plan('{"id":"@ID@","name":"x"}'::jsonb, 1, null, '{"id":"a1010000-0000-0000-0000-000000000587","label_key":"goalPlanChanged","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000011', ''), 'same',
       'save_goal_plan on A''s goal is refused like a missing goal');
select extensions.is(public.t101_same($t$select public.confirm_goal_contribution('@ID@'::uuid, 1, null, '{"id":"a1010000-0000-0000-0000-000000000588","label_key":"goalContributionConfirmed","label_params":{}}'::jsonb)$t$, (select id from pend), ''), 'same',
       'confirm_goal_contribution on A''s Expected goal line is refused like a missing line');
select extensions.is(public.t101_same($t$select public.set_safety_net('@ID@'::uuid, '{"@ID@":1}'::jsonb, '{"id":"a1010000-0000-0000-0000-000000000589","label_key":"safetyNetChanged","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000012', ''), 'same',
       'set_safety_net on A''s goal is refused like a missing goal');
select extensions.is(public.t101_same($t$select public.set_net_answer_use('@ID@'::uuid, true, 1, '{"id":"a1010000-0000-0000-0000-000000000590","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb)$t$, 'a1010000-0000-0000-0000-000000000012', ''), 'same',
       'set_net_answer_use on A''s net is refused like a missing goal');

-- 14. Grow guards as B.
select extensions.throws_ok($$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, debt_id)
  values ('a1010000-0000-0000-0000-000000000033', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1010000-0000-0000-0000-000000000002', -100, 'USD', '2026-12-01', 'UTC', 'to A debt', 'a1010000-0000-0000-0000-000000000005')$$,
  '42501', null, 'B''s own line cannot point at A''s debt (guard_transaction_debt)');
select extensions.throws_ok($$insert into public.holdings (id, household_id, name, type, currency, value, value_as_of, account_id)
  values ('a1010000-0000-0000-0000-000000000034', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'B holding', 'other', 'USD', 1, '2026-11-01', 'a1010000-0000-0000-0000-000000000001')$$,
  '42501', null, 'B''s holding cannot sit on A''s personal account (guard_holding)');
select extensions.lives_ok($$insert into public.holdings (id, household_id, name, type, currency, value, value_as_of, account_id)
  values ('a1010000-0000-0000-0000-000000000035', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'B joint holding', 'other', 'USD', 1, '2026-11-01', 'a1010000-0000-0000-0000-000000000002')$$,
  'B''s holding can sit on the joint account (positive control)');
reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok($$insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, goal_id)
  values ('a1010000-0000-0000-0000-000000000036', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'a1010000-0000-0000-0000-000000000002', 'B goal series', -100, 'USD', 'monthly', current_date, 'UTC', 'a1010000-0000-0000-0000-000000000011')$$,
  '42501', null, 'B''s own series cannot be tagged to A''s goal (guard_series_goal)');
select set_config('request.jwt.claims', '', true);

-- 15. A shared series materialises shared lines that B can read; A's personal series stays A's.
select public.materialise_series('a1010000-0000-0000-0000-000000000014'::uuid, current_date);
select extensions.ok((select count(*) > 0 and bool_and(is_shared) and bool_and(created_by = '11111111-1111-1111-1111-111111111111')
                        from public.transactions where recurring_series_id = 'a1010000-0000-0000-0000-000000000014'),
       'materialise_series writes A''s shared series as shared lines created by A');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.ok(public.t101_n('select 1 from public.transactions where recurring_series_id = ''a1010000-0000-0000-0000-000000000014''') > 0, 'B reads the lines of A''s shared series');
select extensions.is(public.t101_n('select 1 from public.transactions where recurring_series_id in (''a1010000-0000-0000-0000-000000000013'', ''a1010000-0000-0000-0000-000000000015'')'), 0::bigint, 'B reads no line of A''s personal series');

-- 16. Nothing of A's changed during all of the above.
reset role;
select extensions.is((select count(*)::int from (
    select t, id, version, gone from before_rows
    except
    select 'transactions', id, version, deleted_at is not null from public.transactions
    except
    select 'accounts', id, version, deleted_at is not null from public.accounts
    except
    select 'recurring_series', id, version, deleted_at is not null from public.recurring_series
    except
    select 'debts', id, version, deleted_at is not null from public.debts
    except
    select 'savings_goals', id, version, deleted_at is not null from public.savings_goals
    except
    select 'holdings', id, version, deleted_at is not null from public.holdings
    except
    select 'decide_checks', id, version, deleted_at is not null from public.decide_checks) x), 0,
  'every row of A that existed before B acted is unchanged (version and deleted state)');
select extensions.is((select count(*) from public.transactions where recurring_series_id in ('a1010000-0000-0000-0000-000000000013', 'a1010000-0000-0000-0000-000000000015')),
       (select n + 0 from before_counts) , 'B''s add-month call created no line on A''s personal series');

select * from extensions.finish();
rollback;
