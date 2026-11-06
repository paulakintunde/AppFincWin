-- pgTAP: 05.3-07 -- D-15 (rollback_undo_to skips already-undone later steps instead of reporting a conflict) and
-- D-16 (decide_checks.answer_v3).
--
-- Needs 20261030000100_undo_skips_undone_steps_and_answer_v3.sql

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now()),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B joins A's household. C keeps a household of their own.
insert into public.household_members (household_id, user_id, role, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);

create function public.t76_ver(e text, i uuid) returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  execute format('select version from public.%I where id = $1', e) using i into v;
  return v;
end;
$$;
grant execute on function public.t76_ver(text, uuid) to authenticated;

-- One undoable step: forward patch(es) on a row now, inverse op expecting the version the forward write leaves
-- behind (current + number of forward ops). p_ops forward ops are all written against the current version.
create function public.t76_step(p_entity text, p_id uuid, p_step uuid, p_fwd jsonb, p_inv jsonb, p_ops integer default 1)
returns text language plpgsql as $$
declare
  v integer := public.t76_ver(p_entity, p_id);
  fwd jsonb := '[]'::jsonb;
  inv jsonb := '[]'::jsonb;
  i integer;
begin
  for i in 1 .. p_ops loop
    fwd := fwd || jsonb_build_array(jsonb_build_object('entity', p_entity, 'id', p_id, 'expectedVersion', v, 'patch', p_fwd));
    inv := inv || jsonb_build_array(jsonb_build_object('entity', p_entity, 'id', p_id, 'expectedVersion', v + p_ops, 'patch', p_inv));
  end loop;
  return public.apply_patches(fwd, jsonb_build_object('id', p_step, 'label_key', 'debtEdited', 'label_params', '{}'::jsonb, 'ops', inv)) ->> 'status';
end;
$$;
grant execute on function public.t76_step(text, uuid, uuid, jsonb, jsonb, integer) to authenticated;

create function public.t76_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
end;
$$;
grant execute on function public.t76_as(uuid) to authenticated;

-- Fixtures, written as the table owner: nine debts in A's household and one check.
insert into public.debts (id, household_id, created_by, name, kind, currency)
select ('d7600000-0000-0000-0000-00000000000' || n)::uuid, (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
       '11111111-1111-1111-1111-111111111111', 'Loan ' || n, 'card', 'USD'
  from generate_series(1, 9) n;

insert into public.decide_answers (id, household_id, created_by, kind, key, amount, on_date) values
  ('a7600000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'expected_income', '2026-11', 100000, '2026-11-01');

set local role authenticated;
select public.t76_as('11111111-1111-1111-1111-111111111111');

-- (10) the helper is not callable by the client
select extensions.throws_ok(
  $$select public.undo_adjusted_ops((select u from public.undo_log u limit 1))$$,
  '42501', null, 'undo_adjusted_ops is not executable by authenticated');

-- (1) the Pixel case: S1, S2, undo S2, rollback to S1
select extensions.is(public.t76_step('debts', 'd7600000-0000-0000-0000-000000000001', '76000001-0000-0000-0000-000000000001', '{"name":"One-b"}', '{"name":"Loan 1"}'), 'applied', 'case 1: S1 applied');
select extensions.is(public.t76_step('debts', 'd7600000-0000-0000-0000-000000000001', '76000001-0000-0000-0000-000000000002', '{"name":"One-c"}', '{"name":"One-b"}'), 'applied', 'case 1: S2 applied');
select extensions.is(public.apply_undo_step('76000001-0000-0000-0000-000000000002') ->> 'status', 'undone', 'case 1: S2 undone');
select extensions.is(public.rollback_undo_to('76000001-0000-0000-0000-000000000001') ->> 'status', 'undone', 'case 1: rollback to S1 succeeds after S2 was undone');
select extensions.is((select name from public.debts where id = 'd7600000-0000-0000-0000-000000000001'), 'Loan 1', 'case 1: the row is back to its first value');

-- (2) decide_answers, same pattern
select public.t76_step('decide_answers', 'a7600000-0000-0000-0000-000000000001', '76000002-0000-0000-0000-000000000001', '{"amount":110000}', '{"amount":100000}');
select public.t76_step('decide_answers', 'a7600000-0000-0000-0000-000000000001', '76000002-0000-0000-0000-000000000002', '{"amount":120000}', '{"amount":110000}');
select public.apply_undo_step('76000002-0000-0000-0000-000000000002');
select extensions.is(public.rollback_undo_to('76000002-0000-0000-0000-000000000001') ->> 'status', 'undone', 'case 2: decide_answers rollback succeeds after an undone later step');

-- (3) two later undone steps
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000002', '76000003-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 2"}');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000002', '76000003-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000002', '76000003-0000-0000-0000-000000000003', '{"name":"d"}', '{"name":"c"}');
select public.apply_undo_step('76000003-0000-0000-0000-000000000003');
select public.apply_undo_step('76000003-0000-0000-0000-000000000002');
select extensions.is(public.rollback_undo_to('76000003-0000-0000-0000-000000000001') ->> 'status', 'undone', 'case 3: two later undone steps are both skipped');

-- (4) a later step with two ops on the same row, undone
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000003', '76000004-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 3"}');
select extensions.is(public.t76_step('debts', 'd7600000-0000-0000-0000-000000000003', '76000004-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}', 2), 'applied', 'case 4: a two-op step applied');
select extensions.is(public.apply_undo_step('76000004-0000-0000-0000-000000000002') ->> 'status', 'undone', 'case 4: the two-op step undone');
select extensions.is(public.rollback_undo_to('76000004-0000-0000-0000-000000000001') ->> 'status', 'undone', 'case 4: rollback skips a two-op undone step');

-- (5) S2 undone, then another member writes the row: still a conflict
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000004', '76000005-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 4"}');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000004', '76000005-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}');
select public.apply_undo_step('76000005-0000-0000-0000-000000000002');
select public.t76_as('22222222-2222-2222-2222-222222222222');
select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'debts', 'id', 'd7600000-0000-0000-0000-000000000004',
  'expectedVersion', public.t76_ver('debts', 'd7600000-0000-0000-0000-000000000004'), 'patch', '{"name":"By B"}'::jsonb)));
select public.t76_as('11111111-1111-1111-1111-111111111111');
create temp table res5 as select public.rollback_undo_to('76000005-0000-0000-0000-000000000001') as r;
select extensions.is((select r ->> 'status' from res5), 'refused', 'case 5: another member''s write still conflicts');
select extensions.is((select r -> 'refusal' ->> 'reason' from res5), 'changed', 'case 5: reason is changed');

-- (6) S2 still available: the rollback undoes S2 first, then S1
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000005', '76000006-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 5"}');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000005', '76000006-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}');
create temp table res6 as select public.rollback_undo_to('76000006-0000-0000-0000-000000000001') as r;
select extensions.is((select r ->> 'status' from res6) || ':' || (select r ->> 'undone' from res6), 'undone:2', 'case 6: an available later step is undone first, then S1');

-- (7) S2 refused: blocked
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000006', '76000007-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 6"}');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000006', '76000007-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}');
reset role;
update public.undo_log set status = 'refused', refusal = '{"forced":"test-fixture"}'::jsonb, resolved_at = now()
 where id = '76000007-0000-0000-0000-000000000002';
set local role authenticated;
select public.t76_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.rollback_undo_to('76000007-0000-0000-0000-000000000001') ->> 'status', 'blocked', 'case 7: a refused later step blocks the rollback');

-- (8) S2 undone and then purged
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000007', '76000008-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 7"}');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000007', '76000008-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}');
select public.apply_undo_step('76000008-0000-0000-0000-000000000002');
reset role;
delete from public.undo_log where id = '76000008-0000-0000-0000-000000000002';
set local role authenticated;
select public.t76_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.rollback_undo_to('76000008-0000-0000-0000-000000000001') ->> 'status', 'refused', 'case 8: a purged undone step leaves a conflict (safe direction)');

-- (9) another member's undone step on the row does not raise this owner's expected version
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000008', '76000009-0000-0000-0000-000000000001', '{"name":"b"}', '{"name":"Loan 8"}');
select public.t76_as('22222222-2222-2222-2222-222222222222');
select public.t76_step('debts', 'd7600000-0000-0000-0000-000000000008', '76000009-0000-0000-0000-000000000002', '{"name":"c"}', '{"name":"b"}');
select public.apply_undo_step('76000009-0000-0000-0000-000000000002');
select public.t76_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.rollback_undo_to('76000009-0000-0000-0000-000000000001') ->> 'status', 'refused', 'case 9: another owner''s undone step does not count');

-- (11) answer_v3
select extensions.lives_ok(
  $$insert into public.decide_checks (id, household_id, name, inputs, answer_v3)
    values ('d1760000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Sofa',
            '{"kind":"buy","price":120000}',
            '{"v":3,"code":"fits_month","variant":null,"readyBy":null,"unspentAfter":null,"lineFacts":[]}')$$,
  'case 11: owner inserts a check with answer_v3');
select extensions.lives_ok(
  $$update public.decide_checks set answer_v3 = '{"v":3,"code":"not_yet","variant":null,"readyBy":null,"unspentAfter":null,"lineFacts":[]}'
    where id = 'd1760000-0000-0000-0000-000000000001'$$,
  'case 11: owner updates answer_v3');
select extensions.throws_ok(
  $$update public.decide_checks set answer_v3 = '{"v":3,"code":"fits"}' where id = 'd1760000-0000-0000-0000-000000000001'$$,
  '23514', null, 'case 11: an unknown code is refused');
select extensions.throws_ok(
  $$update public.decide_checks set answer_v3 = '[1,2]' where id = 'd1760000-0000-0000-0000-000000000001'$$,
  '23514', null, 'case 11: a json array is refused');
reset role;
update public.decide_checks set status = 'bought', decided_at = now(), estimate_day_one = 1, estimate_monthly = 1
 where id = 'd1760000-0000-0000-0000-000000000001';
set local role authenticated;
select public.t76_as('11111111-1111-1111-1111-111111111111');
select extensions.lives_ok(
  $$update public.decide_checks set answer_v3 = '{"v":3,"code":"emergency_use","variant":null,"readyBy":null,"unspentAfter":null,"lineFacts":[]}'
    where id = 'd1760000-0000-0000-0000-000000000001'$$,
  'case 11: answer_v3 is writable on a decided check');
select extensions.throws_ok(
  $$update public.decide_checks set inputs = '{"kind":"buy","price":1}' where id = 'd1760000-0000-0000-0000-000000000001'$$,
  '42501', null, 'case 11: inputs stays locked on a decided check');
reset role;
set local role anon;
select extensions.throws_ok(
  $$update public.decide_checks set answer_v3 = '{"v":3,"code":"fits_month"}' where id = 'd1760000-0000-0000-0000-000000000001'$$,
  '42501', null, 'case 11: anon cannot update answer_v3');
reset role;
select extensions.is((select answer_v3 ->> 'code' from public.decide_checks where id = 'd1760000-0000-0000-0000-000000000001'), 'emergency_use', 'case 11: the stored code is the last accepted write');

select * from extensions.finish();
rollback;
