-- pgTAP: 06.1 Decide screens -- D-20 (decide_may_use + set_net_answer_use), D-22 (Save for it goal), D-23 and FIN-20
-- (decide_settings columns), CO-D-64 (6) (decide_check_history). Migration 20261111000100_decide_screens.sql.
-- Needs the Grow migrations (set_safety_net, grow_check_undo_step) and 20261031000100 (record_decide_outcome, 4 args).
-- Runs in CI with `supabase test db`; not run locally (no Docker on the build machine).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(37);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B is a second member of A's household.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

create function public.t97_ver(i uuid) returns integer language sql security definer set search_path = '' as $$
  select version from public.savings_goals where id = i $$;
grant execute on function public.t97_ver(uuid) to authenticated;

create function public.t97_goal(i uuid, c text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I::text from public.savings_goals where id = $1', c) using i into v;
  return v;
end;
$$;
grant execute on function public.t97_goal(uuid, text) to authenticated;

-- Fixtures, written as the table owner. N1 is A's safety net, G2 is A's plain goal.
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, locked, protect, is_safety_net) values
  ('91000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Safety net', 'USD', 500000, true, true, true),
  ('91000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'pot', 'Holiday', 'USD', 300000, false, true, false);

insert into public.decide_checks (id, household_id, created_by, name, inputs) values
  ('c9700000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Plan check', '{"kind":"buy","price":50000,"pay":{"mode":"plan"}}'),
  ('c9700000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Lump check', '{"kind":"buy","price":50000,"pay":{"mode":"now"}}'),
  ('c9700000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'History check', '{"kind":"buy","price":50000}'),
  ('c9700000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'Too big check', '{"kind":"buy","price":50000,"pay":{"mode":"plan"}}');

insert into public.decide_settings (user_id, currency) values ('11111111-1111-1111-1111-111111111111', 'USD');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- D-20 -------------------------------------------------------------------------------------------------------------
select extensions.is(public.t97_goal('91000000-0000-0000-0000-000000000001', 'decide_may_use'), 'false', 'D-20: the flag defaults to off');

create temp table u1 as
select public.set_net_answer_use('91000000-0000-0000-0000-000000000001', true, public.t97_ver('91000000-0000-0000-0000-000000000001'),
  '{"id":"59700000-0000-0000-0000-000000000001","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb) as r;
grant select on u1 to authenticated;

select extensions.is((select r ->> 'status' from u1), 'applied', 'D-20: unlocking the net for answers applies');
select extensions.is(public.t97_goal('91000000-0000-0000-0000-000000000001', 'decide_may_use'), 'true', 'D-20: the flag reads back on');
select extensions.is(public.set_net_answer_use('91000000-0000-0000-0000-000000000001', true, 1,
  '{"id":"59700000-0000-0000-0000-000000000001","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb) ->> 'status',
  'already-applied', 'D-20: a replay of the same step is already-applied');
select extensions.is(public.apply_undo_step('59700000-0000-0000-0000-000000000001') ->> 'status', 'undone', 'D-20: undo of the unlock is undone');
select extensions.is(public.t97_goal('91000000-0000-0000-0000-000000000001', 'decide_may_use'), 'false', 'D-20: undo puts the flag back off');

select extensions.is(public.set_net_answer_use('91000000-0000-0000-0000-000000000001', true, 9999,
  '{"id":"59700000-0000-0000-0000-000000000002","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb) ->> 'status',
  'conflict', 'D-20: a stale version is a conflict');
select extensions.throws_ok(
  $$select public.set_net_answer_use('91000000-0000-0000-0000-000000000001', true, public.t97_ver('91000000-0000-0000-0000-000000000001'),
    '{"id":"59700000-0000-0000-0000-000000000003","label_key":"safetyNetLocked","label_params":{}}'::jsonb)$$,
  '22023', null, 'D-20: the wrong label_key for the direction is refused');
select extensions.throws_ok(
  $$select public.set_net_answer_use('91000000-0000-0000-0000-000000000002', true, public.t97_ver('91000000-0000-0000-0000-000000000002'),
    '{"id":"59700000-0000-0000-0000-000000000004","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb)$$,
  '42501', null, 'D-20: a goal that is not the safety net is refused');
select extensions.throws_ok(
  $$update public.savings_goals set decide_may_use = true where id = '91000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'D-20: a direct client update of decide_may_use is refused');

-- Turn it on again, then swap the net to G2: the old net's flag goes back to off.
select extensions.is(public.set_net_answer_use('91000000-0000-0000-0000-000000000001', true, public.t97_ver('91000000-0000-0000-0000-000000000001'),
  '{"id":"59700000-0000-0000-0000-000000000005","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb) ->> 'status',
  'applied', 'D-20: unlock again');
select extensions.is(public.set_safety_net('91000000-0000-0000-0000-000000000002',
  jsonb_build_object('91000000-0000-0000-0000-000000000002', public.t97_ver('91000000-0000-0000-0000-000000000002'),
                     '91000000-0000-0000-0000-000000000001', public.t97_ver('91000000-0000-0000-0000-000000000001')),
  '{"id":"59700000-0000-0000-0000-000000000006","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'applied', 'D-20: swapping the net applies');
select extensions.is(public.t97_goal('91000000-0000-0000-0000-000000000001', 'decide_may_use'), 'false', 'D-20: the old net''s flag is off after a swap');
select extensions.is(public.t97_goal('91000000-0000-0000-0000-000000000002', 'decide_may_use'), 'false', 'D-20: the new net starts with the flag off');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.set_net_answer_use('91000000-0000-0000-0000-000000000002', true, public.t97_ver('91000000-0000-0000-0000-000000000002'),
    '{"id":"59700000-0000-0000-0000-000000000007","label_key":"safetyNetUnlocked","label_params":{}}'::jsonb)$$,
  '42501', null, 'D-20: another household member cannot flip A''s net');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- D-23 and FIN-20 --------------------------------------------------------------------------------------------------
select extensions.lives_ok(
  $$update public.decide_settings set answered_no_debts_at = now(), answered_net_not_set_at = now(),
      answered_no_rules_at = now(), answered_bills_right_at = now(), tax_set_aside_bp = 2500
    where user_id = '11111111-1111-1111-1111-111111111111'$$,
  'D-23: the owner writes the four answered stamps and the set-aside');
select extensions.is((select count(*)::int from public.decide_settings
  where user_id = '11111111-1111-1111-1111-111111111111' and answered_no_rules_at is not null and tax_set_aside_bp = 2500),
  1, 'D-23: the stamps read back');
select extensions.throws_ok(
  $$update public.decide_settings set tax_set_aside_bp = 6001 where user_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'FIN-20: a set-aside above 60% is refused');

-- CO-D-64 (6) ------------------------------------------------------------------------------------------------------
select extensions.lives_ok(
  $$insert into public.decide_check_history (id, check_id, said_on, code, variant, result) values
    ('b9700000-0000-0000-0000-000000000001', 'c9700000-0000-0000-0000-000000000003', current_date, 'fits', null, '{"v":1}')$$,
  'history: the owner records what Decide said');
select extensions.is((select count(*)::int from public.decide_check_history), 1, 'history: the owner reads it back');
select extensions.is((select created_by::text from public.decide_check_history limit 1), '11111111-1111-1111-1111-111111111111',
  'history: created_by is stamped from the session');
select extensions.throws_ok(
  $$insert into public.decide_check_history (id, check_id, said_on, code, result) values
    ('b9700000-0000-0000-0000-000000000002', 'c9700000-0000-0000-0000-000000000003', current_date, 'fits',
     jsonb_build_object('pad', repeat('x', 20000)))$$,
  '23514', null, 'history: a result over 16 KB is refused');
select extensions.throws_ok(
  $$update public.decide_check_history set code = 'no'$$, '42501', null, 'history: rows cannot be updated');
select extensions.throws_ok(
  $$delete from public.decide_check_history$$, '42501', null, 'history: rows cannot be deleted by a client');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.decide_check_history), 0, 'history: a second household member reads 0 rows');
select extensions.throws_ok(
  $$insert into public.decide_check_history (id, check_id, said_on, code, result) values
    ('b9700000-0000-0000-0000-000000000003', 'c9700000-0000-0000-0000-000000000003', current_date, 'fits', '{}')$$,
  '42501', null, 'history: nobody writes history for another user''s check');
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

reset role;
set local role anon;
select extensions.throws_ok($$select count(*) from public.decide_check_history$$, '42501', null, 'history: anon has no access');
reset role;

delete from public.decide_checks where id = 'c9700000-0000-0000-0000-000000000003';
select extensions.is((select count(*)::int from public.decide_check_history), 0, 'history: deleting the check deletes its history');

-- D-22 -------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

create temp table w1 as
select public.record_decide_outcome('c9700000-0000-0000-0000-000000000001', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e9700000-0000-0000-0000-000000000001","name":"Sofa","currency":"USD","target":20000}}'::jsonb,
  '{"id":"59700000-0000-0000-0000-000000000011","label_key":"planSaved","label_params":{"name":"Sofa"}}'::jsonb) as r;
grant select on w1 to authenticated;

select extensions.is((select r ->> 'status' from w1), 'applied', 'D-22: Save for it on an installment check applies');
select extensions.is(public.t97_goal('e9700000-0000-0000-0000-000000000001', 'locked'), 'true', 'D-22: the goal is locked');
select extensions.is(public.t97_goal('e9700000-0000-0000-0000-000000000001', 'check_id'), 'c9700000-0000-0000-0000-000000000001', 'D-22: the goal is linked to the check');
select extensions.is(public.t97_goal('e9700000-0000-0000-0000-000000000001', 'up_front_only'), 'true', 'D-22: up front only for an installment check');

select extensions.is(public.apply_undo_step('59700000-0000-0000-0000-000000000011') ->> 'status', 'undone', 'D-22: one undo step undoes it');
select extensions.ok(public.t97_goal('e9700000-0000-0000-0000-000000000001', 'deleted_at') is not null
  and (select status from public.decide_checks where id = 'c9700000-0000-0000-0000-000000000001') = 'open',
  'D-22: undo removes the goal and reopens the check');

select extensions.is(public.record_decide_outcome('c9700000-0000-0000-0000-000000000002', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e9700000-0000-0000-0000-000000000002","name":"Bike","currency":"USD","target":50000}}'::jsonb,
  '{"id":"59700000-0000-0000-0000-000000000012","label_key":"planSaved","label_params":{"name":"Bike"}}'::jsonb) ->> 'status',
  'applied', 'D-22: Save for it on a pay-now check applies');
select extensions.is(public.t97_goal('e9700000-0000-0000-0000-000000000002', 'up_front_only') || ':' || public.t97_goal('e9700000-0000-0000-0000-000000000002', 'locked'),
  'false:true', 'D-22: a pay-now goal is locked but not up front only');

select extensions.throws_ok(
  $$select public.record_decide_outcome('c9700000-0000-0000-0000-000000000004', 'wait',
    '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e9700000-0000-0000-0000-000000000004","name":"Big","currency":"USD","target":60000}}'::jsonb,
    '{"id":"59700000-0000-0000-0000-000000000013","label_key":"planSaved","label_params":{}}'::jsonb)$$,
  '22023', null, 'D-22: a goal target above the price is refused');

select * from extensions.finish();
rollback;
