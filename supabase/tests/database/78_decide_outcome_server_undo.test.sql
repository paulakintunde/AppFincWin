-- pgTAP: 05.3-66 -- gap 2 (Plan it / Not buying Undo recorded server-side) and gap 1 (plan pot linked to an account).
-- Needs 20261031000100_decide_outcome_server_undo.sql

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(31);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

create function public.t78_ver(e text, i uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) using i into v;
  return v;
end;
$$;
grant execute on function public.t78_ver(text, uuid) to authenticated;

create function public.t78_row(e text, i uuid, c text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I::text from public.%I where id = $1', c, e) using i into v;
  return v;
end;
$$;
grant execute on function public.t78_row(text, uuid, text) to authenticated;

-- The app's saved-plan delete (editCheck goal branch): check and goal soft-deleted in one apply_patches step, with an
-- inverse step restoring both at the versions the delete leaves behind.
create function public.t78_delete(p_check uuid, p_goal uuid, p_step uuid) returns text language plpgsql as $$
declare
  vc integer := public.t78_ver('decide_checks', p_check);
  vg integer := public.t78_ver('savings_goals', p_goal);
begin
  return public.apply_patches(
    jsonb_build_array(
      jsonb_build_object('entity', 'decide_checks', 'id', p_check, 'expectedVersion', vc, 'patch', '{"deleted_at":"$now"}'::jsonb),
      jsonb_build_object('entity', 'savings_goals', 'id', p_goal, 'expectedVersion', vg, 'patch', '{"deleted_at":"$now"}'::jsonb)),
    jsonb_build_object('id', p_step, 'label_key', 'decisionDeleted', 'label_params', '{"name":"Plan"}'::jsonb, 'ops', jsonb_build_array(
      jsonb_build_object('entity', 'decide_checks', 'id', p_check, 'expectedVersion', vc + 1, 'patch', '{"deleted_at":null}'::jsonb),
      jsonb_build_object('entity', 'savings_goals', 'id', p_goal, 'expectedVersion', vg + 1, 'patch', '{"deleted_at":null}'::jsonb))))
    ->> 'status';
end;
$$;
grant execute on function public.t78_delete(uuid, uuid, uuid) to authenticated;

-- Fixtures, written as the table owner.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('a7800000-0000-0000-0000-00000000000a', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Pots', 'savings', 'USD', 0),
  ('a7800000-0000-0000-0000-00000000000c', (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333'), 'C pots', 'savings', 'USD', 0);

insert into public.decide_checks (id, household_id, created_by, name, inputs)
select ('c7800000-0000-0000-0000-00000000000' || n)::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       '11111111-1111-1111-1111-111111111111', 'Check ' || n, '{"kind":"buy","price":50000}'
  from generate_series(1, 7) n;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- (1-2) both overloads exist
select extensions.has_function('public', 'record_decide_outcome', array['uuid', 'text', 'jsonb'], 'the 3-arg overload still exists');
select extensions.has_function('public', 'record_decide_outcome', array['uuid', 'text', 'jsonb', 'jsonb'], 'the 4-arg overload exists');

-- (3) anon cannot execute the 4-arg function
select extensions.ok(
  not has_function_privilege('anon', 'public.record_decide_outcome(uuid,text,jsonb,jsonb)', 'execute'),
  'anon has no execute on the 4-arg function');

-- Wait + goal linked to A's account, undo step recorded server-side
create temp table r1 as
select public.record_decide_outcome('c7800000-0000-0000-0000-000000000001', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e7800000-0000-0000-0000-000000000001","name":"Coffee beans","currency":"USD","target":150000,"account_id":"a7800000-0000-0000-0000-00000000000a"}}'::jsonb,
  '{"id":"57800000-0000-0000-0000-000000000001","label_key":"planSaved","label_params":{"name":"Coffee beans"}}'::jsonb) as r;
grant select on r1 to authenticated;

select extensions.is((select r ->> 'status' from r1), 'applied', 'wait: applied');
select extensions.is((select r ->> 'undo_step_id' from r1), '57800000-0000-0000-0000-000000000001', 'wait: returns the step id');
select extensions.is((select (r ->> 'check_version')::int from r1), public.t78_ver('decide_checks', 'c7800000-0000-0000-0000-000000000001'), 'wait: check_version is the check''s version');
select extensions.is((select (r ->> 'goal_version')::int from r1), public.t78_ver('savings_goals', 'e7800000-0000-0000-0000-000000000001'), 'wait: goal_version is the goal''s version');
select extensions.is(public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'status'), 'waiting', 'wait: check is waiting');
select extensions.is(public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000001', 'account_id'), 'a7800000-0000-0000-0000-00000000000a', 'wait: the pot is linked to the account');
select extensions.is(public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000001', 'currency') || ':' || public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000001', 'target'), 'USD:150000', 'wait: currency and target as sent');
select extensions.is((select allow_system_keys::text || ':' || label_key || ':' || jsonb_array_length(ops) from public.undo_log where id = '57800000-0000-0000-0000-000000000001'),
  'true:planSaved:2', 'wait: the undo step is a system step with 2 ops');

-- Replay before undo
select extensions.is(public.record_decide_outcome('c7800000-0000-0000-0000-000000000001', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01"}'::jsonb,
  '{"id":"57800000-0000-0000-0000-000000000001","label_key":"planSaved","label_params":{"name":"Coffee beans"}}'::jsonb) ->> 'status',
  'already-applied', 'replay: already-applied');
select extensions.is(public.record_decide_outcome('c7800000-0000-0000-0000-000000000001', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01"}'::jsonb,
  '{"id":"57800000-0000-0000-0000-000000000001","label_key":"planSaved","label_params":{"name":"Coffee beans"}}'::jsonb) ->> 'undo_step_id',
  '57800000-0000-0000-0000-000000000001', 'replay: returns the step id');
select extensions.is((select count(*)::int from public.undo_log where id = '57800000-0000-0000-0000-000000000001'), 1, 'replay: one undo row');

-- Undo
select extensions.is(public.apply_undo_step('57800000-0000-0000-0000-000000000001') ->> 'status', 'undone', 'undo of Plan it: undone');
select extensions.is(public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'status'), 'open', 'undo of Plan it: check is open');
select extensions.ok(
  public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'decided_at') is null
  and public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'verdict_at_decision') is null
  and public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'wait_monthly') is null
  and public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'ready_by') is null
  and public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000001', 'cooling_off_at') is null,
  'undo of Plan it: decision columns cleared');
select extensions.ok(public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000001', 'deleted_at') is not null, 'undo of Plan it: the pot is soft-deleted');

-- Not buying
select extensions.is(public.record_decide_outcome('c7800000-0000-0000-0000-000000000002', 'pass',
  '{"verdict":"no"}'::jsonb,
  '{"id":"57800000-0000-0000-0000-000000000002","label_key":"notBuyingSaved","label_params":{"name":"Sofa"}}'::jsonb) ->> 'status',
  'applied', 'pass: applied');
select extensions.is(public.apply_undo_step('57800000-0000-0000-0000-000000000002') ->> 'status', 'undone', 'undo of Not buying: undone');
select extensions.is(public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000002', 'status'), 'open', 'undo of Not buying: check is open');

-- Refusals
select extensions.throws_ok(
  $$select public.record_decide_outcome('c7800000-0000-0000-0000-000000000003', 'wait',
    '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e7800000-0000-0000-0000-000000000003","name":"X","currency":"USD","target":1000,"account_id":"a7800000-0000-0000-0000-00000000000c"}}'::jsonb,
    '{"id":"57800000-0000-0000-0000-000000000003","label_key":"planSaved","label_params":{}}'::jsonb)$$,
  '42501', null, 'an account from another household is refused');
select extensions.throws_ok(
  $$select public.record_decide_outcome('c7800000-0000-0000-0000-000000000004', 'pass', '{"verdict":"no"}'::jsonb,
    '{"id":"57800000-0000-0000-0000-000000000004","label_key":"decisionWritten","label_params":{}}'::jsonb)$$,
  '22023', null, 'a label_key outside the allowlist is refused');
select extensions.throws_ok(
  $$select public.record_decide_outcome('c7800000-0000-0000-0000-000000000004', 'pass', '{"verdict":"no"}'::jsonb, '[1]'::jsonb)$$,
  '22023', null, 'a non-object undo step is refused');

-- Saved-plan delete then undo, check decided by the NEW function
select public.record_decide_outcome('c7800000-0000-0000-0000-000000000005', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e7800000-0000-0000-0000-000000000005","name":"Plan","currency":"USD","target":90000,"account_id":"a7800000-0000-0000-0000-00000000000a"}}'::jsonb,
  '{"id":"57800000-0000-0000-0000-000000000005","label_key":"planSaved","label_params":{"name":"Plan"}}'::jsonb);
select extensions.is(public.t78_delete('c7800000-0000-0000-0000-000000000005', 'e7800000-0000-0000-0000-000000000005', '57800000-0000-0000-0000-0000000000a5'), 'applied', 'delete (new fn): applied');
select extensions.is(public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000005', 'deleted_at') is not null and public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000005', 'deleted_at') is not null, true, 'delete (new fn): both soft-deleted');
select extensions.is(public.apply_undo_step('57800000-0000-0000-0000-0000000000a5') ->> 'status', 'undone', 'delete (new fn): undo is undone');
select extensions.ok(public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000005', 'deleted_at') is null and public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000005', 'deleted_at') is null, 'delete (new fn): both restored');

-- Same, check decided by the OLD 3-arg function
select public.record_decide_outcome('c7800000-0000-0000-0000-000000000006', 'wait',
  '{"verdict":"adjust","wait_monthly":20000,"ready_by":"2099-01-01","goal":{"id":"e7800000-0000-0000-0000-000000000006","name":"Plan","currency":"USD","target":90000}}'::jsonb);
select extensions.is(public.t78_delete('c7800000-0000-0000-0000-000000000006', 'e7800000-0000-0000-0000-000000000006', '57800000-0000-0000-0000-0000000000a6'), 'applied', 'delete (old fn): applied');
select extensions.is(public.apply_undo_step('57800000-0000-0000-0000-0000000000a6') ->> 'status', 'undone', 'delete (old fn): undo is undone');
select extensions.ok(public.t78_row('decide_checks', 'c7800000-0000-0000-0000-000000000006', 'deleted_at') is null and public.t78_row('savings_goals', 'e7800000-0000-0000-0000-000000000006', 'deleted_at') is null, 'delete (old fn): both restored');

reset role;
select * from extensions.finish();
rollback;
