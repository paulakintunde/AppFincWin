-- pgTAP: 05.2 (D-12..D-17, D-50, OQ1) -- decide_settings v3 columns, migration 20261028000100.
-- Needs 20261016000100 and 20261028000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(66);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Fixtures as table owner: a pre-existing settings row, an account in each household.
insert into public.decide_settings (user_id, currency, rough_income) values ('11111111-1111-1111-1111-111111111111', 'USD', 5000);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a6300000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings A', 'savings', 'USD', 0),
  ('a6300000-0000-0000-0000-000000000002', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'Savings B', 'savings', 'USD', 0);

select extensions.has_column('public','decide_settings','id','id exists');
select extensions.has_column('public','decide_settings','income_types','income_types exists');
select extensions.has_column('public','decide_settings','income_pattern','income_pattern exists');
select extensions.has_column('public','decide_settings','income_pattern_confirmed','income_pattern_confirmed exists');
select extensions.has_column('public','decide_settings','variable_method','variable_method exists');
select extensions.has_column('public','decide_settings','steady_amount','steady_amount exists');
select extensions.has_column('public','decide_settings','spread_months','spread_months exists');
select extensions.has_column('public','decide_settings','hold_months','hold_months exists');
select extensions.has_column('public','decide_settings','share_pct','share_pct exists');
select extensions.has_column('public','decide_settings','detail','detail exists');
select extensions.has_column('public','decide_settings','remind_plan','remind_plan exists');
select extensions.has_column('public','decide_settings','remind_unspent','remind_unspent exists');
select extensions.has_column('public','decide_settings','setup_done_at','setup_done_at exists');
select extensions.has_column('public','decide_settings','everyday_override','everyday_override exists');
select extensions.has_column('public','decide_settings','everyday_override_at','everyday_override_at exists');
select extensions.has_column('public','decide_settings','month_marks','month_marks exists');
select extensions.has_column('public','decide_settings','unspent_anchor','unspent_anchor exists');
select extensions.has_column('public','decide_settings','unspent_anchor_at','unspent_anchor_at exists');
select extensions.has_column('public','decide_settings','reserve_account_id','reserve_account_id exists');
select extensions.has_column('public','decide_settings','reserve_goal','reserve_goal exists');
select extensions.has_column('public','decide_settings','rough_saving','rough_saving exists');
select extensions.has_column('public','decide_settings','rough_debt','rough_debt exists');
select extensions.has_column('public','decide_settings','rough_invest','rough_invest exists');
select extensions.has_column('public','decide_settings','rough_as_of','rough_as_of exists');
select extensions.has_column('public','decide_settings','unexplained_amount','unexplained_amount exists');
select extensions.has_column('public','decide_settings','unexplained_use','unexplained_use exists');
select extensions.has_column('public','decide_settings','unexplained_at','unexplained_at exists');
select extensions.has_column('public','decide_settings','refine_last_at','refine_last_at exists');
select extensions.has_column('public','decide_settings','refine_snooze_until','refine_snooze_until exists');
select extensions.isnt((select id from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), null, 'pre-existing row has an id');
select extensions.is((select rough_income from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 5000::bigint, 'pre-existing values are kept');
select extensions.is((select income_pattern from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), null, 'new columns are null');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok($$update public.decide_settings set income_types = array['salary_or_wages','none'] where user_id = '11111111-1111-1111-1111-111111111111'$$, 'income_types accepts known values');
select extensions.lives_ok($$update public.decide_settings set income_pattern = 'variable' where user_id = '11111111-1111-1111-1111-111111111111'$$, 'income_pattern variable');
select extensions.lives_ok($$update public.decide_settings set variable_method = 'spread' where user_id = '11111111-1111-1111-1111-111111111111'$$, 'variable_method spread');
select extensions.lives_ok($$update public.decide_settings set spread_months = 0 where user_id = '11111111-1111-1111-1111-111111111111'$$, 'spread_months 0');
select extensions.lives_ok($$update public.decide_settings set hold_months = 3 where user_id = '11111111-1111-1111-1111-111111111111'$$, 'hold_months 3');
select extensions.lives_ok($$update public.decide_settings set share_pct = 100 where user_id = '11111111-1111-1111-1111-111111111111'$$, 'share_pct 100');
select extensions.lives_ok($$update public.decide_settings set share_pct = 1 where user_id = '11111111-1111-1111-1111-111111111111'$$, 'share_pct 1');
select extensions.lives_ok($$update public.decide_settings set detail = 'full' where user_id = '11111111-1111-1111-1111-111111111111'$$, 'detail full');
select extensions.lives_ok($$update public.decide_settings set month_marks = '{"2026-01":"odd"}'::jsonb where user_id = '11111111-1111-1111-1111-111111111111'$$, 'month_marks object');
select extensions.lives_ok($$update public.decide_settings set unspent_anchor = -10000000000000 where user_id = '11111111-1111-1111-1111-111111111111'$$, 'unspent_anchor lower bound');
select extensions.lives_ok($$update public.decide_settings set unspent_anchor = 10000000000000 where user_id = '11111111-1111-1111-1111-111111111111'$$, 'unspent_anchor upper bound');
select extensions.lives_ok($$update public.decide_settings set unexplained_use = 'spare' where user_id = '11111111-1111-1111-1111-111111111111'$$, 'unexplained_use spare');
select extensions.lives_ok($$update public.decide_settings set refine_snooze_until = now() where user_id = '11111111-1111-1111-1111-111111111111'$$, 'refine_snooze_until');
select extensions.lives_ok($$update public.decide_settings set reserve_account_id = 'a6300000-0000-0000-0000-000000000001' where user_id = '11111111-1111-1111-1111-111111111111'$$, 'own-household reserve account accepted');
select extensions.throws_ok($$update public.decide_settings set income_types = array['mix'] where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'income_types unknown value refused');
select extensions.throws_ok($$update public.decide_settings set income_types = array[]::text[] where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'income_types empty refused');
select extensions.throws_ok($$update public.decide_settings set income_pattern = 'other' where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'income_pattern other refused');
select extensions.throws_ok($$update public.decide_settings set variable_method = 'x' where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'variable_method x refused');
select extensions.throws_ok($$update public.decide_settings set hold_months = 4 where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'hold_months 4 refused');
select extensions.throws_ok($$update public.decide_settings set share_pct = 0 where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'share_pct 0 refused');
select extensions.throws_ok($$update public.decide_settings set share_pct = 101 where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'share_pct 101 refused');
select extensions.throws_ok($$update public.decide_settings set detail = 'long' where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'detail long refused');
select extensions.throws_ok($$update public.decide_settings set month_marks = '[]'::jsonb where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'month_marks array refused');
select extensions.throws_ok($$update public.decide_settings set month_marks = jsonb_build_object('k', repeat('x', 5000)) where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'month_marks over 4096 bytes refused');
select extensions.throws_ok($$update public.decide_settings set unspent_anchor = 10000000000001 where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'unspent_anchor over refused');
select extensions.throws_ok($$update public.decide_settings set unspent_anchor = -10000000000001 where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'unspent_anchor under refused');
select extensions.throws_ok($$update public.decide_settings set unexplained_use = 'x' where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'unexplained_use x refused');
select extensions.throws_ok($$update public.decide_settings set spread_months = 5 where user_id = '11111111-1111-1111-1111-111111111111'$$, '23514', null, 'spread_months 5 refused');
select extensions.throws_ok($$update public.decide_settings set reserve_account_id = 'a6300000-0000-0000-0000-000000000002' where user_id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'other-household reserve account refused');
select extensions.throws_ok($$update public.decide_settings set id = gen_random_uuid() where user_id = '11111111-1111-1111-1111-111111111111'$$, '42501', null, 'id cannot be updated');
select extensions.throws_ok($$insert into public.decide_settings (user_id, id) values ('11111111-1111-1111-1111-111111111111', gen_random_uuid())$$, '42501', null, 'id cannot be inserted');
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 0, 'another user cannot read the row');
update public.decide_settings set share_pct = 50 where user_id = '11111111-1111-1111-1111-111111111111';
reset role;
select extensions.is((select share_pct from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), 1::smallint, 'another user update touched nothing');
delete from public.accounts where id = 'a6300000-0000-0000-0000-000000000001';
select extensions.is((select reserve_account_id from public.decide_settings where user_id = '11111111-1111-1111-1111-111111111111'), null, 'deleting the account nulls reserve_account_id');

select * from extensions.finish();
rollback;
