-- pgTAP: 05.5 ARC-09 / D-11 / D-20 -- decide_copy_rule_caps() (migration 20261113000100_decide_rule_caps_to_categories.sql).
-- Fill empty caps from switched-on category_cap rules; a clash keeps Activity's value; off, system and archived skipped; idempotent;
-- not executable by clients. Runs in CI with `supabase test db`; not run locally (no Docker on the build machine).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

-- A = Housing (no cap), B = Groceries (cap 20000), C = Transfer (system), D = Dining (archived), E = Transport (no cap, rule off).
update public.categories set monthly_cap = 20000
 where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Groceries';
update public.categories set archived_at = now()
 where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Dining';

create temp table cat as
  select builtin_key as k, id from public.categories where owner_id = '11111111-1111-1111-1111-111111111111';

insert into public.decide_settings (user_id, currency, custom_options)
values ('11111111-1111-1111-1111-111111111111', 'USD', jsonb_build_object('v', 1, 'rules', jsonb_build_object('v', 1, 'rules', jsonb_build_array(
  jsonb_build_object('id', 'ra', 'kind', 'category_cap', 'on', true,  'value', 15000, 'categoryId', (select id from cat where k = 'Housing')),
  jsonb_build_object('id', 'rb', 'kind', 'category_cap', 'on', true,  'value', 30000, 'categoryId', (select id from cat where k = 'Groceries')),
  jsonb_build_object('id', 'rc', 'kind', 'category_cap', 'on', true,  'value', 10000, 'categoryId', (select id from cat where k = 'Transfer')),
  jsonb_build_object('id', 'rd', 'kind', 'category_cap', 'on', true,  'value', 10000, 'categoryId', (select id from cat where k = 'Dining')),
  jsonb_build_object('id', 're', 'kind', 'category_cap', 'on', false, 'value', 12000, 'categoryId', (select id from cat where k = 'Transport'))
)))));

create temp table run1 as select * from public.decide_copy_rule_caps();

select extensions.is((select monthly_cap from public.categories where id = (select id from cat where k = 'Housing')), 15000::bigint, 'an empty cap is filled from the switched-on rule');
select extensions.is((select monthly_cap from public.categories where id = (select id from cat where k = 'Groceries')), 20000::bigint, 'a clash keeps the Activity cap');
select extensions.is((select monthly_cap from public.categories where id = (select id from cat where k = 'Transport')), null::bigint, 'a switched-off rule is not copied');
select extensions.is((select monthly_cap from public.categories where id = (select id from cat where k = 'Transfer')), null::bigint, 'a system category is never capped');
select extensions.is((select monthly_cap from public.categories where id = (select id from cat where k = 'Dining')), null::bigint, 'an archived category is skipped');
select extensions.is((select sum(filled)::text || '/' || sum(clash)::text from run1), '1/1', 'counts: filled 1, clash 1');
select extensions.is((select sum(skipped_off)::text || '/' || sum(skipped_category)::text from run1), '1/2', 'counts: skipped off 1, skipped category 2');
select extensions.is((select coalesce(sum(filled), 0)::int from public.decide_copy_rule_caps()), 0, 'a second run fills nothing');
select extensions.is((select monthly_cap from public.categories where id = (select id from cat where k = 'Housing')), 15000::bigint, 'a second run leaves the filled cap alone');
select extensions.is(has_function_privilege('authenticated', 'public.decide_copy_rule_caps()', 'execute'), false, 'authenticated cannot execute the copy');

select * from extensions.finish();
rollback;
