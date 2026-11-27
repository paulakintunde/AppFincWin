-- pgTAP: 10-30 cross-currency large-transaction thresholds (device check step 9). Migration 20261127090000.
-- Seeds as the superuser (no JWT claims).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(8);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('31000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a128@test.local', '{"full_name":"Sam Test"}', now(), now()),
  ('31000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b128@test.local', '{"full_name":"Bea Test"}', now(), now());

create temp table ids as select (select id from public.households where owner_id = '31000000-0000-4000-8000-0000000000a1') as h;
delete from public.household_members where user_id = '31000000-0000-4000-8000-0000000000b1';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select h from ids), '31000000-0000-4000-8000-0000000000b1', false, 0);
update public.household_members set display_name = 'Sam' where user_id = '31000000-0000-4000-8000-0000000000a1';

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('31000000-0000-4000-8000-0000000000c1', (select h from ids), '31000000-0000-4000-8000-0000000000a1', 'A current', 'checking', 'USD', 0, false);

-- Rates per EUR: 1 EUR = 1.25 USD. No row for XAF, so XAF has no rate.
delete from public.fx_rates where base = 'EUR' and quote in ('USD', 'XAF');
insert into public.fx_rates (base, quote, rate, rate_date) values ('EUR', 'USD', 1.25, current_date);

-- ------------------------------------------------------------------ the pick itself
select extensions.is(public.alerts_pick_amount('USD', 'CAD', -50000, 'USD', -36000, 'CAD', -50000), -36000::bigint,
  'pick: a stamped amount in the threshold currency still wins');
select extensions.is(public.alerts_pick_amount('EUR', 'USD', -32000, 'USD', -32000, null, null), -25600::bigint,
  'pick: no stamped EUR amount, so USD 320.00 converts to EUR 256.00 at the stored rate');
select extensions.is(public.alerts_pick_amount('XAF', 'USD', -32000, 'USD', -32000, null, null), null::bigint,
  'pick: no rate for the threshold currency gives null (nothing raised, no error)');

-- ------------------------------------------------------------------ partner large, threshold in another currency
delete from public.alert_log;
insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency)
values ('31000000-0000-4000-8000-0000000000b1', 'large_txn', true, 20000, 'EUR');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('31000000-0000-4000-8000-000000001401', (select h from ids), '31000000-0000-4000-8000-0000000000a1', '31000000-0000-4000-8000-0000000000c1',
   -32000, 'USD', current_date, 'UTC', 'Shared USD', 'paid', true);
select extensions.is((select params->>'amount_minor' from public.alert_log where kind = 'partner_large' and user_id = '31000000-0000-4000-8000-0000000000b1'),
  '25600', 'partner: a USD shared line over B''s EUR threshold raises partner_large with the EUR amount');
select extensions.is((select params->>'currency' from public.alert_log where kind = 'partner_large' and user_id = '31000000-0000-4000-8000-0000000000b1'),
  'EUR', 'partner: the alert is in the threshold currency');

-- Under the threshold once converted (USD 240.00 = EUR 192.00 < EUR 200.00).
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('31000000-0000-4000-8000-000000001402', (select h from ids), '31000000-0000-4000-8000-0000000000a1', '31000000-0000-4000-8000-0000000000c1',
   -24000, 'USD', current_date, 'UTC', 'Shared small', 'paid', true);
select extensions.is((select count(*)::int from public.alert_log where kind = 'partner_large'), 1,
  'partner: under the converted threshold raises nothing');

-- No rate for the threshold currency: skipped, the insert still succeeds.
update public.alert_settings set threshold_currency = 'XAF', threshold_minor = 1 where user_id = '31000000-0000-4000-8000-0000000000b1';
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('31000000-0000-4000-8000-000000001403', (select h from ids), '31000000-0000-4000-8000-0000000000a1', '31000000-0000-4000-8000-0000000000c1',
   -90000, 'USD', current_date, 'UTC', 'Shared no rate', 'paid', true);
select extensions.is((select count(*)::int from public.alert_log where kind = 'partner_large'), 1,
  'partner: no rate for the threshold currency raises nothing and the line still saves');

-- ------------------------------------------------------------------ own large, threshold in another currency
insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency)
values ('31000000-0000-4000-8000-0000000000a1', 'large_txn', true, 20000, 'EUR');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('31000000-0000-4000-8000-000000001404', (select h from ids), '31000000-0000-4000-8000-0000000000a1', '31000000-0000-4000-8000-0000000000c1',
   -32000, 'USD', current_date, 'UTC', 'Own USD', 'paid');
select extensions.is((select params->>'amount_minor' from public.alert_log where kind = 'large_txn' and user_id = '31000000-0000-4000-8000-0000000000a1'),
  '25600', 'own: a USD line over A''s EUR threshold raises large_txn with the EUR amount');

select * from extensions.finish();
rollback;
