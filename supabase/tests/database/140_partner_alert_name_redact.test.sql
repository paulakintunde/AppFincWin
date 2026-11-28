-- pgTAP: 10-review L-2, a deleted sender's name leaves the other members' partner alerts. Migration 20261127090600.
-- Seeds as the superuser (no JWT claims). A = sender (deleted), B = receiver, C = another member who stays.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('34000000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a140@test.local', '{"full_name":"Sam Test"}', now(), now()),
  ('34000000-0000-4000-8000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b140@test.local', '{"full_name":"Bea Test"}', now(), now()),
  ('34000000-0000-4000-8000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c140@test.local', '{"full_name":"Cy Test"}', now(), now());

create temp table ids as select (select id from public.households where owner_id = '34000000-0000-4000-8000-0000000000a1') as h;
delete from public.household_members where user_id in ('34000000-0000-4000-8000-0000000000b1', '34000000-0000-4000-8000-0000000000c1');
insert into public.household_members (household_id, user_id, is_owner, weight) values
  ((select h from ids), '34000000-0000-4000-8000-0000000000b1', false, 0),
  ((select h from ids), '34000000-0000-4000-8000-0000000000c1', false, 0);
update public.household_members set display_name = 'Sam' where user_id = '34000000-0000-4000-8000-0000000000a1';
update public.household_members set display_name = 'Cy' where user_id = '34000000-0000-4000-8000-0000000000c1';

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('34000000-0000-4000-8000-0000000000d1', (select h from ids), '34000000-0000-4000-8000-0000000000a1', 'A current', 'checking', 'USD', 0, false),
  ('34000000-0000-4000-8000-0000000000d2', (select h from ids), '34000000-0000-4000-8000-0000000000c1', 'C current', 'checking', 'USD', 0, false);

delete from public.alert_log;
insert into public.alert_settings (user_id, kind, enabled, threshold_minor, threshold_currency)
values ('34000000-0000-4000-8000-0000000000b1', 'large_txn', false, 10000, 'USD');

-- A's shared line raises a partner alert for B (and C) that names Sam; C's line names Cy.
-- No category: the sender's name is kept (only a private category hides it), which is the case under test.
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('34000000-0000-4000-8000-000000001401', (select h from ids), '34000000-0000-4000-8000-0000000000a1', '34000000-0000-4000-8000-0000000000d1',
   -50000, 'USD', current_date, 'UTC', 'Shared by Sam', 'paid', true),
  ('34000000-0000-4000-8000-000000001402', (select h from ids), '34000000-0000-4000-8000-0000000000c1', '34000000-0000-4000-8000-0000000000d2',
   -60000, 'USD', current_date, 'UTC', 'Shared by Cy', 'paid', true);

select extensions.is(
  (select params ->> 'who' from public.alert_log where user_id = '34000000-0000-4000-8000-0000000000b1'
      and ref_id = '34000000-0000-4000-8000-000000001401'),
  'Sam', 'setup: B''s partner alert for A''s line names Sam');

-- A partner alert whose line is already gone (no ref row to join), still naming Sam: the household-name fallback.
select public.raise_alert('34000000-0000-4000-8000-0000000000b1', 'partner_large',
  jsonb_build_object('who', 'Sam', 'hidden', false, 'category', 'groceries', 'amount_minor', 30000, 'currency', 'USD'),
  'transactions', '34000000-0000-4000-8000-0000000019ff', 'plarge:gone:140');

-- A is deleted.
select extensions.lives_ok($$delete from auth.users where id = '34000000-0000-4000-8000-0000000000a1'$$,
  'deleting the sender succeeds');

select extensions.is(
  (select count(*)::int from public.alert_log where kind = 'partner_large' and params ->> 'who' = 'Sam'), 0,
  'alert_log: no partner alert names the deleted sender any more');
select extensions.is(
  (select count(*)::int from public.alert_outbox where kind = 'partner_large' and params ->> 'who' = 'Sam'), 0,
  'alert_outbox: no unsent push can carry the deleted sender''s name');
select extensions.is(
  (select (params -> 'hidden')::boolean from public.alert_log where user_id = '34000000-0000-4000-8000-0000000000b1'
      and ref_id = '34000000-0000-4000-8000-000000001401'),
  true, 'alert_log: B''s alert for A''s line is now the hidden form');
select extensions.ok(
  (select params ? 'who' and params -> 'who' = 'null'::jsonb from public.alert_log where user_id = '34000000-0000-4000-8000-0000000000b1'
      and ref_id = '34000000-0000-4000-8000-000000001401'),
  'alert_log: who is null, and the params keep the contract keys');
select extensions.is(
  (select params ->> 'amount_minor' from public.alert_log where user_id = '34000000-0000-4000-8000-0000000000b1'
      and ref_id = '34000000-0000-4000-8000-000000001401'),
  '50000', 'alert_log: the amount stays');
select extensions.is(
  (select (o.params -> 'hidden')::boolean from public.alert_outbox o join public.alert_log l on l.id = o.log_id
    where l.ref_id = '34000000-0000-4000-8000-0000000019ff'),
  true, 'alert_outbox: the fallback (line already gone) is redacted too');
select extensions.is(
  (select params ->> 'who' from public.alert_log where user_id = '34000000-0000-4000-8000-0000000000b1'
      and ref_id = '34000000-0000-4000-8000-000000001402'),
  'Cy', 'a member who stays keeps their name on their own alerts');

select extensions.ok(
  (select p.prosecdef and p.proconfig[1] = 'search_path=""' from pg_catalog.pg_proc p
    where p.proname = 'alerts_redact_partner_on_account_delete'),
  'the redact trigger function is security definer with an empty search_path');

select * from extensions.finish();
rollback;
