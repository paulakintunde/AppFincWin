-- pgTAP: 10-15 server-side alert evaluation (ALR-01/02/05/06). Migration 20261126000500.
-- Seeds as the superuser (no JWT claims); the plan lock and the privacy policies are not what this file proves.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(38);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('30000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a124@test.local', '{"full_name":"Sam Test"}', now(), now()),
  ('30000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b124@test.local', '{"full_name":"Bea Test"}', now(), now());

create temp table ids as select (select id from public.households where owner_id = '30000000-0000-4000-8000-0000000000a1') as h;

-- B joins A's household.
delete from public.household_members where user_id = '30000000-0000-4000-8000-0000000000b1';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select h from ids), '30000000-0000-4000-8000-0000000000b1', false, 0);
update public.household_members set display_name = 'Sam' where user_id = '30000000-0000-4000-8000-0000000000a1';

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('30000000-0000-4000-8000-0000000000c1', (select h from ids), '30000000-0000-4000-8000-0000000000a1', 'A current', 'checking', 'USD', 0, false),
  ('30000000-0000-4000-8000-0000000000c2', (select h from ids), '30000000-0000-4000-8000-0000000000a1', 'A low', 'checking', 'USD', 12000, false);

insert into public.categories (id, owner_id, name, color_key, monthly_cap) values
  ('30000000-0000-4000-8000-0000000000d1', '30000000-0000-4000-8000-0000000000a1', 'Shopping', 'green', 10000),
  ('30000000-0000-4000-8000-0000000000d2', '30000000-0000-4000-8000-0000000000a1', 'Secret hobby', 'plum', null),
  ('30000000-0000-4000-8000-0000000000d3', '30000000-0000-4000-8000-0000000000b1', 'Bea shopping', 'teal', null);
insert into public.categories (id, owner_id, builtin_key, color_key) values
  ('30000000-0000-4000-8000-0000000000d4', '30000000-0000-4000-8000-0000000000a1', 'Housing', 'slate')
  on conflict (owner_id, builtin_key) do nothing;
create temp table housing as select id from public.categories
  where owner_id = '30000000-0000-4000-8000-0000000000a1' and builtin_key = 'Housing';

insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('30000000-0000-4000-8000-0000000000e1', (select h from ids), '30000000-0000-4000-8000-0000000000a1',
   '30000000-0000-4000-8000-0000000000c1', 'Rent', -90000, 'USD', 'monthly', current_date, 'UTC');

-- ---------------------------------------------------------------- bills due
-- Pending occurrence due tomorrow, no settings row (D-09 default: on, 1 day).
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, recurring_series_id, occurrence_date)
values ('30000000-0000-4000-8000-000000000f01', (select h from ids), '30000000-0000-4000-8000-0000000000a1',
        '30000000-0000-4000-8000-0000000000c1', -90000, 'USD', current_date + 1, 'UTC', 'Rent', 'pending',
        '30000000-0000-4000-8000-0000000000e1', current_date + 1);

select extensions.is(public.alerts_bills_due(), 1, 'bills due: a pending occurrence due tomorrow raises with no settings row');
select extensions.is((select params from public.alert_log where kind = 'bills_due' and user_id = '30000000-0000-4000-8000-0000000000a1'),
  '{"bill": "Rent", "currency": "USD", "lead_days": 1, "amount_minor": 90000}'::jsonb, 'bills due: params carry bill, amount, currency, lead');
select extensions.is(public.alerts_bills_due(), 0, 'bills due: a second run raises nothing (dedupe)');
select extensions.is((select count(*)::int from public.alert_log where kind = 'bills_due'), 1, 'bills due: one log row');
select extensions.is((select count(*)::int from public.alert_outbox o join public.alert_log l on l.id = o.log_id where o.kind = 'bills_due'), 1,
  'bills due: one outbox row pointing at the log row, with no push token on file');
select extensions.is((select delivery from public.alert_log where kind = 'bills_due'), 'pending', 'bills due: log row starts pending');

-- Lead 3 saved: due tomorrow no longer raises (fresh dedupe key would be :3), the 3-day one does.
delete from public.alert_log; -- cascades the outbox
insert into public.alert_settings (user_id, kind, enabled, lead_days) values ('30000000-0000-4000-8000-0000000000a1', 'bills_due', true, 3);
select extensions.is(public.alerts_bills_due(), 0, 'bills due: lead 3 and the bill is due tomorrow raises nothing');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, recurring_series_id, occurrence_date)
values ('30000000-0000-4000-8000-000000000f02', (select h from ids), '30000000-0000-4000-8000-0000000000a1',
        '30000000-0000-4000-8000-0000000000c1', -4500, 'USD', current_date + 3, 'UTC', 'Phone', 'pending',
        '30000000-0000-4000-8000-0000000000e1', current_date + 3);
select extensions.is(public.alerts_bills_due(), 1, 'bills due: lead 3 raises for the bill three days out');

-- Disabled: nothing.
delete from public.alert_log;
update public.alert_settings set enabled = false where kind = 'bills_due';
select extensions.is(public.alerts_bills_due(), 0, 'bills due: disabled raises nothing');
delete from public.alert_settings where kind = 'bills_due';
delete from public.transactions where recurring_series_id is not null;

-- ------------------------------------------------------------ goal reached
insert into public.savings_goals (id, household_id, created_by, name, currency, target) values
  ('30000000-0000-4000-8000-000000000901', (select h from ids), '30000000-0000-4000-8000-0000000000a1', 'Bike', 'USD', 80000);
select extensions.is((select count(*)::int from public.alert_log where kind = 'goal_reached'), 0, 'goal: nothing before it is done');
update public.savings_goals set done_at = now() where id = '30000000-0000-4000-8000-000000000901';
select extensions.is((select params from public.alert_log where kind = 'goal_reached'),
  '{"goal": "Bike", "currency": "USD", "amount_minor": 80000}'::jsonb, 'goal: reaching it raises goal_reached with no settings row');
update public.savings_goals set done_at = null where id = '30000000-0000-4000-8000-000000000901';
update public.savings_goals set done_at = now() where id = '30000000-0000-4000-8000-000000000901';
select extensions.is((select count(*)::int from public.alert_log where kind = 'goal_reached'), 1, 'goal: raised once only');

-- ------------------------------------------------------------------ over cap
insert into public.alert_settings (user_id, kind, enabled) values ('30000000-0000-4000-8000-0000000000a1', 'over_cap', true);
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001001', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d1', -9000, 'USD', current_date, 'UTC', 'Shoes', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'over_cap'), 0, 'over cap: under the cap raises nothing');
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001002', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d1', -2000, 'USD', current_date, 'UTC', 'Hat', 'paid');
select extensions.is((select params from public.alert_log where kind = 'over_cap'),
  '{"currency": "USD", "category": "Shopping", "over_minor": 1000}'::jsonb, 'over cap: crossing the cap raises over_cap with the overshoot');
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001003', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d1', -500, 'USD', current_date, 'UTC', 'Scarf', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'over_cap'), 1, 'over cap: a further expense in the month raises nothing');
update public.alert_settings set enabled = false where kind = 'over_cap';
delete from public.alert_log;
delete from public.transactions where category_id = '30000000-0000-4000-8000-0000000000d1';
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001004', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d1', -12000, 'USD', current_date, 'UTC', 'Coat', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'over_cap'), 0, 'over cap: disabled raises nothing');

-- --------------------------------------------------------------- low balance
delete from public.alert_log;
insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency)
values ('30000000-0000-4000-8000-0000000000a1', 'low_balance', true, 10000, 'USD');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001101', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c2',
   -3000, 'USD', current_date, 'UTC', 'Fuel', 'paid');
select extensions.is((select params from public.alert_log where kind = 'low_balance'),
  '{"account": "A low", "currency": "USD", "amount_minor": 9000}'::jsonb, 'low balance: falling from 12000 to 9000 raises once');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001102', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c2',
   -1000, 'USD', current_date, 'UTC', 'Snack', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'low_balance'), 1, 'low balance: already below before the row raises nothing');

-- ------------------------------------------------------------ large (own)
delete from public.alert_log;
insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency)
values ('30000000-0000-4000-8000-0000000000a1', 'large_txn', true, 30000, 'USD');
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001201', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d1', -48000, 'USD', current_date, 'UTC', 'TV', 'paid');
select extensions.is((select params from public.alert_log where kind = 'large_txn'),
  '{"currency": "USD", "category": "Shopping", "amount_minor": 48000}'::jsonb, 'large: a 480.00 outflow over the saved 300.00 raises large_txn');
select extensions.is((select count(*)::int from public.alert_log where kind = 'large_txn' and user_id = '30000000-0000-4000-8000-0000000000a1'), 1, 'large: raised once');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001202', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -29000, 'USD', current_date, 'UTC', 'Under', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'large_txn'), 1, 'large: below the threshold raises nothing');
update public.alert_settings set enabled = false where kind = 'large_txn';
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001203', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -50000, 'USD', current_date, 'UTC', 'Off', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'large_txn'), 1, 'large: disabled raises nothing');
update public.alert_settings set enabled = true where kind = 'large_txn';
-- a threshold in another currency never matches
update public.alert_settings set threshold_currency = 'JPY' where kind = 'large_txn';
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('30000000-0000-4000-8000-000000001204', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -60000, 'USD', current_date, 'UTC', 'Wrong currency', 'paid');
select extensions.is((select count(*)::int from public.alert_log where kind = 'large_txn'), 1, 'large: a threshold in a currency the row does not carry raises nothing');
update public.alert_settings set threshold_currency = 'USD' where kind = 'large_txn';
update public.alert_settings set enabled = false where kind = 'large_txn';

-- --------------------------------------------------------------- partner large
delete from public.alert_log;
insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency)
values ('30000000-0000-4000-8000-0000000000b1', 'large_txn', false, 30000, 'USD');

insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, note, status, is_shared) values
  ('30000000-0000-4000-8000-000000001301', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   (select id from housing), -32000, 'USD', current_date, 'UTC', 'SENTINEL-PAYEE-7731', 'SENTINEL-NOTE-7731', 'paid', true);
select extensions.is((select params from public.alert_log where kind = 'partner_large' and user_id = '30000000-0000-4000-8000-0000000000b1'),
  '{"who": "Sam", "hidden": false, "currency": "USD", "category": "Housing", "amount_minor": 32000}'::jsonb, 'partner: B gets partner_large with who, category, amount');
select extensions.is((select count(*)::int from public.alert_log where kind = 'partner_large' and user_id = '30000000-0000-4000-8000-0000000000a1'), 0, 'partner: the sender gets no partner_large');
select extensions.is((select count(*)::int from public.alert_log where params::text like '%SENTINEL%')
  + (select count(*)::int from public.alert_outbox where params::text like '%SENTINEL%'), 0, 'partner: no note or payee reaches any alert row');

-- Partner alerts switched off, then a higher threshold.
insert into public.alert_prefs (user_id, partner_alerts) values ('30000000-0000-4000-8000-0000000000b1', false);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001302', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -33000, 'USD', current_date, 'UTC', 'Shared two', 'paid', true);
select extensions.is((select count(*)::int from public.alert_log where kind = 'partner_large'), 1, 'partner: B with partner alerts off gets nothing');
update public.alert_prefs set partner_alerts = true where user_id = '30000000-0000-4000-8000-0000000000b1';
update public.alert_settings set threshold_minor = 40000 where user_id = '30000000-0000-4000-8000-0000000000b1' and kind = 'large_txn';
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001303', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -33000, 'USD', current_date, 'UTC', 'Shared three', 'paid', true);
select extensions.is((select count(*)::int from public.alert_log where kind = 'partner_large'), 1, 'partner: under B''s own threshold raises nothing');
update public.alert_settings set threshold_minor = 30000 where user_id = '30000000-0000-4000-8000-0000000000b1' and kind = 'large_txn';

-- Hidden name.
update public.household_members set name_hidden = true where user_id = '30000000-0000-4000-8000-0000000000a1';
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001304', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   (select id from housing), -34000, 'USD', current_date, 'UTC', 'Hidden name', 'paid', true);
select extensions.is((select params from public.alert_log where ref_id = '30000000-0000-4000-8000-000000001304' and kind = 'partner_large'),
  '{"who": null, "hidden": true, "currency": "USD", "category": "Housing", "amount_minor": 34000}'::jsonb, 'partner: a hidden name gives who null and hidden true');
update public.household_members set name_hidden = false where user_id = '30000000-0000-4000-8000-0000000000a1';

-- Private category of the sender: neither name nor category.
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001305', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d2', -32000, 'USD', current_date, 'UTC', 'Private', 'paid', true);
select extensions.is((select params from public.alert_log where ref_id = '30000000-0000-4000-8000-000000001305' and kind = 'partner_large'),
  '{"who": null, "hidden": true, "currency": "USD", "category": null, "amount_minor": 32000}'::jsonb, 'partner: a private category shows neither name nor category');

-- The receiver's own category for the row.
insert into public.transactions (id, household_id, created_by, account_id, category_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001306', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   '30000000-0000-4000-8000-0000000000d2', -32000, 'USD', current_date, 'UTC', 'Mapped', 'paid', false);
-- (not shared yet: nothing) then share it with B's category on file, via an update of the shared flag and a fresh amount.
insert into public.transaction_member_categories (transaction_id, user_id, household_id, category_id)
values ('30000000-0000-4000-8000-000000001306', '30000000-0000-4000-8000-0000000000b1', (select h from ids), '30000000-0000-4000-8000-0000000000d3');
select extensions.is((select count(*)::int from public.alert_log where ref_id = '30000000-0000-4000-8000-000000001306' and kind = 'partner_large'), 0,
  'partner: a personal expense never raises anything for B');
update public.transactions set is_shared = true where id = '30000000-0000-4000-8000-000000001306';
update public.transactions set original_amount = -32100 where id = '30000000-0000-4000-8000-000000001306';
select extensions.is((select params->>'category' from public.alert_log where ref_id = '30000000-0000-4000-8000-000000001306' and kind = 'partner_large'),
  'Bea shopping', 'partner: the receiver''s own category for the row is the one named');

-- ------------------------------------------------------------ skip rules
delete from public.alert_log;
update public.alert_settings set enabled = true where kind = 'large_txn' and user_id = '30000000-0000-4000-8000-0000000000a1';
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared, is_sample) values
  ('30000000-0000-4000-8000-000000001401', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -90000, 'USD', current_date, 'UTC', 'Sample', 'paid', true, true);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared, is_automatic) values
  ('30000000-0000-4000-8000-000000001402', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -90000, 'USD', current_date, 'UTC', 'Auto', 'paid', true, true);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared, import_batch_id) values
  ('30000000-0000-4000-8000-000000001403', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -90000, 'USD', current_date, 'UTC', 'Imported', 'paid', true, '30000000-0000-4000-8000-0000000000aa');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001404', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -90000, 'USD', current_date - 5, 'UTC', 'Old', 'paid', true);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('30000000-0000-4000-8000-000000001405', (select h from ids), '30000000-0000-4000-8000-0000000000a1', '30000000-0000-4000-8000-0000000000c1',
   -90000, 'USD', current_date, 'UTC', 'Pending', 'pending', true);
select extensions.is((select count(*)::int from public.alert_log), 0, 'skip rules: sample, automatic, imported, old and pending rows raise nothing');

-- ------------------------------------------------------------ access
select extensions.is((select count(*)::int from information_schema.table_privileges
  where table_schema = 'public' and table_name = 'alert_outbox' and grantee in ('anon', 'authenticated')), 0, 'alert_outbox has no client grants');
select extensions.is((select has_function_privilege('authenticated', 'public.raise_alert(uuid,text,jsonb,text,uuid,text)', 'execute')), false,
  'authenticated cannot execute raise_alert');
select extensions.throws_ok($$ select public.raise_alert('30000000-0000-4000-8000-0000000000a1', 'large_txn', '{"note":"x"}'::jsonb, null, null, 'k1') $$,
  '22023', 'raise_alert: params carry a key outside the contract', 'raise_alert refuses a params key outside the contract');
select extensions.is(public.raise_alert('30000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":1}'::jsonb, null, null, 'k2') is not null, true, 'raise_alert returns the log id');
select extensions.is(public.raise_alert('30000000-0000-4000-8000-0000000000a1', 'large_txn', '{"amount_minor":1}'::jsonb, null, null, 'k2') is null, true, 'raise_alert is a no-op on a repeated dedupe key');

select * from extensions.finish();
rollback;
