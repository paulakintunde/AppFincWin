-- pgTAP: Phase 06 Grow (06-06) -- save_goal_plan, confirm_goal_contribution and set_safety_net (D-25, D-29), the goal
-- contribution series and its Expected lines. Migration 20261106000200.
-- Needs 20261016000100 .. 20261016000400, 20261028000100 .. 20261106000200.
-- Undo goes through apply_undo_step as the owner (the replay function is not callable by a user).
-- save_goal_plan and confirm_goal_contribution build their undo steps on the server; the ops t92_step sends are ignored.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(95);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Helpers. The readers are security definer so they see rows whoever the caller is.
create function public.t92_get(t text, i uuid, c text) returns text language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  execute format('select %I::text from public.%I where id = $1', c, t) into v using i;
  return v;
end;
$$;
create function public.t92_ver(t text, i uuid) returns integer language sql security definer set search_path = '' as $$
  select public.t92_get(t, i, 'version')::integer;
$$;
create function public.t92_flagged(u uuid) returns integer language sql security definer set search_path = '' as $$
  select count(*)::integer from public.savings_goals g where g.created_by = u and g.is_safety_net and g.deleted_at is null;
$$;
create function public.t92_step(i uuid, label text, goal uuid) returns jsonb language sql as $$
  select jsonb_build_object('id', i, 'label_key', label, 'label_params', '{}'::jsonb, 'ops', jsonb_build_array(jsonb_build_object(
    'entity', 'savings_goals', 'id', goal, 'expectedVersion', 1, 'patch', jsonb_build_object('deleted_at', '$now'))));
$$;
create function public.t92_goal(i uuid, n text, extra jsonb) returns jsonb language sql as $$
  select jsonb_build_object('id', i, 'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'name', n, 'currency', 'USD', 'locked', false, 'protect', false) || extra;
$$;
create function public.t92_series(i uuid, acc uuid, amt integer, anchor date) returns jsonb language sql as $$
  select jsonb_build_object('id', i, 'account_id', acc, 'amount', amt, 'anchor_date', anchor, 'time_zone', 'UTC', 'name', 'Monthly');
$$;

-- Fixtures, written as the table owner. B is a second member of A's household.
insert into public.household_members (household_id, user_id, role, weight)
  values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'member', 1);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('ca920000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Checking', 'checking', 'USD', 500000),
  ('ca920000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Savings', 'savings', 'USD', 0);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- G04 "Set a size": A has no flagged goal yet -------------------------------------------------------------------------
select extensions.is(public.t92_flagged('11111111-1111-1111-1111-111111111111'), 0, 'A starts with no safety net');
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000001', 'Safety net', '{"target":230000,"is_safety_net":true,"locked":false,"protect":true}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-000000000001', 'safetyNetSizeSaved', '9a920000-0000-0000-0000-000000000001')) ->> 'status',
  'applied', 'a safety net is created from Grow');
select extensions.is(public.t92_flagged('11111111-1111-1111-1111-111111111111'), 1, 'exactly one live flagged goal after the creation');
select extensions.is(public.t92_get('savings_goals', '9a920000-0000-0000-0000-000000000001', 'locked'), 'true', 'a safety net sent with locked false reads back Locked');
select extensions.throws_ok($$select public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-00000000000d', 'Second net', '{"is_safety_net":true}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-00000000000d', 'safetyNetSizeSaved', '9a920000-0000-0000-0000-00000000000d'))$$,
  '23505', null, 'a second flagged insert for the same owner is refused');
select extensions.is(public.t92_flagged('11111111-1111-1111-1111-111111111111'), 1, 'still exactly one flagged goal after the refusal');
select extensions.throws_ok($$select public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000099', 'Wrong label', '{}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-000000000099', 'potAdded', '9a920000-0000-0000-0000-000000000099'))$$,
  '22023', null, 'save_goal_plan refuses a label key that is not its own');

-- A normal goal, then an edit that tries to flag it: only set_safety_net flags an existing goal (D-29)
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000002', 'Laptop', '{"target":120000}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-000000000002', 'goalMade', '9a920000-0000-0000-0000-000000000002')) ->> 'status',
  'applied', 'a normal goal is made');
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-000000000002","is_safety_net":true,"name":"Laptop 2"}'::jsonb, 1, null,
  public.t92_step('57920000-0000-0000-0000-000000000003', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000002')) ->> 'status',
  'applied', 'an edit that also sends is_safety_net still saves');
select extensions.is(public.t92_get('savings_goals', '9a920000-0000-0000-0000-000000000002', 'is_safety_net'), 'false', 'the edit did not flag the goal');
select extensions.is(public.t92_get('savings_goals', '9a920000-0000-0000-0000-000000000002', 'name'), 'Laptop 2', 'the edit saved the other keys');

-- A goal with a monthly contribution (D-25) -----------------------------------------------------------------------------
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000003', 'Holiday', '{"target":200000,"opening_saved":80000,"monthly_amount":5000,"account_id":"ca920000-0000-0000-0000-000000000002"}'::jsonb),
  null, public.t92_series('5e920000-0000-0000-0000-000000000002', 'ca920000-0000-0000-0000-000000000001', 5000, current_date - 40),
  public.t92_step('57920000-0000-0000-0000-000000000004', 'goalMade', '9a920000-0000-0000-0000-000000000003')) ->> 'status',
  'applied', 'a goal with a monthly contribution is made');
select extensions.is((select count(*)::int from public.recurring_series where goal_id = '9a920000-0000-0000-0000-000000000003' and deleted_at is null), 1,
  'one recurring series is linked to the goal');
select extensions.is((select amount from public.recurring_series where id = '5e920000-0000-0000-0000-000000000002'), -5000::bigint,
  'the series stores the contribution as money out of the paid-from account');
select extensions.cmp_ok((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000002' and status = 'pending' and goal_id = '9a920000-0000-0000-0000-000000000003' and deleted_at is null),
  '>=', 1, 'the Expected lines carry the goal tag');

-- the materialiser as the table owner copies the goal tag on any further occurrence
reset role;
select extensions.is((select count(*)::int from public.materialise_series('5e920000-0000-0000-0000-000000000002')), 0, 'the materialiser has nothing more to add');
select extensions.is((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000002' and goal_id is null and deleted_at is null), 0, 'no occurrence of the series is missing its goal tag');
select extensions.throws_ok($$insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, goal_id)
  values ('5e920000-0000-0000-0000-0000000000ff', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    '11111111-1111-1111-1111-111111111111', 'ca920000-0000-0000-0000-000000000001', 'Second', -100, 'USD', 'monthly', current_date, 'UTC',
    '9a920000-0000-0000-0000-000000000003')$$,
  '23505', null, 'a second live contribution series for the same goal is refused');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- replay, conflict, foreign goal
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000003', 'Holiday', '{"target":200000,"opening_saved":80000}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-000000000004', 'goalMade', '9a920000-0000-0000-0000-000000000003')) ->> 'status',
  'already-applied', 'the same undo step id replays as already-applied');
select extensions.is((select count(*)::int from public.recurring_series where goal_id = '9a920000-0000-0000-0000-000000000003' and deleted_at is null), 1,
  'the replay wrote no new series');
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-000000000002","name":"Stale"}'::jsonb, 99, null,
  public.t92_step('57920000-0000-0000-0000-000000000005', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000002')) ->> 'status',
  'conflict', 'a stale expected version is a conflict');

-- confirm_goal_contribution: the goal is kept in Savings, so the line becomes a transfer pair
create temp table t92_pend as
  select id, version from public.transactions
   where recurring_series_id = '5e920000-0000-0000-0000-000000000002' and status = 'pending' and deleted_at is null
   order by occurrence_date limit 1;
grant select on t92_pend to authenticated;
select extensions.is(public.confirm_goal_contribution((select id from t92_pend), (select version from t92_pend),
  '{"id":"7a920000-0000-0000-0000-000000000001","transfer_id":"7b920000-0000-0000-0000-000000000001"}'::jsonb,
  public.t92_step('57920000-0000-0000-0000-000000000006', 'goalContributionConfirmed', '9a920000-0000-0000-0000-000000000003')) ->> 'status',
  'applied', 'an Expected goal line is confirmed');
select extensions.is((select count(*)::int from public.transactions where transfer_id = '7b920000-0000-0000-0000-000000000001' and status = 'paid' and deleted_at is null), 2,
  'two paid legs share the transfer id');
select extensions.is((select goal_id from public.transactions where id = (select id from t92_pend)), null::uuid, 'the out-leg carries no goal tag');
select extensions.is((select goal_id from public.transactions where id = '7a920000-0000-0000-0000-000000000001'), '9a920000-0000-0000-0000-000000000003'::uuid,
  'the in-leg carries the goal tag, so the goal is counted once');
select extensions.throws_ok($$select public.confirm_goal_contribution((select id from t92_pend), 99, null,
  public.t92_step('57920000-0000-0000-0000-000000000007', 'goalContributionConfirmed', '9a920000-0000-0000-0000-000000000003'))$$,
  '22023', null, 'confirming a line that is no longer pending is refused');

-- a goal with no account: the single line is marked paid and keeps its goal tag
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000005', 'No account', '{"monthly_amount":3000}'::jsonb),
  null, public.t92_series('5e920000-0000-0000-0000-000000000004', 'ca920000-0000-0000-0000-000000000001', 3000, current_date - 40),
  public.t92_step('57920000-0000-0000-0000-000000000008', 'goalMade', '9a920000-0000-0000-0000-000000000005')) ->> 'status',
  'applied', 'a goal with no account and a contribution is made');
create temp table t92_pend2 as
  select id, version from public.transactions
   where recurring_series_id = '5e920000-0000-0000-0000-000000000004' and status = 'pending' and deleted_at is null
   order by occurrence_date limit 1;
grant select on t92_pend2 to authenticated;
select extensions.is(public.confirm_goal_contribution((select id from t92_pend2), (select version from t92_pend2), null,
  public.t92_step('57920000-0000-0000-0000-000000000009', 'goalContributionConfirmed', '9a920000-0000-0000-0000-000000000005')) ->> 'status',
  'applied', 'a goal line with no account is confirmed');
select extensions.is(public.t92_get('transactions', (select id from t92_pend2), 'status'), 'paid', 'the single line is paid');
select extensions.is(public.t92_get('transactions', (select id from t92_pend2), 'goal_id'), '9a920000-0000-0000-0000-000000000005', 'the single line keeps its goal tag');
select extensions.is(public.t92_get('transactions', (select id from t92_pend2), 'transfer_id'), null, 'no transfer id for a single line');

-- changing the plan: a new amount rebuilds the Expected lines; null stops the contribution
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-000000000003"}'::jsonb, public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000003'),
  public.t92_series('5e920000-0000-0000-0000-000000000002', 'ca920000-0000-0000-0000-000000000001', 7000, current_date - 40),
  public.t92_step('57920000-0000-0000-0000-00000000000a', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000003')) ->> 'status',
  'applied', 'the monthly amount is changed');
select extensions.is((select amount from public.recurring_series where id = '5e920000-0000-0000-0000-000000000002'), -7000::bigint, 'the series carries the new amount');
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-000000000003"}'::jsonb, public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000003'), null,
  public.t92_step('57920000-0000-0000-0000-00000000000b', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000003')) ->> 'status',
  'applied', 'the contribution is stopped');
select extensions.is((select count(*)::int from public.recurring_series where goal_id = '9a920000-0000-0000-0000-000000000003' and deleted_at is null and end_date is null), 0,
  'the goal has no open contribution series any more');
select extensions.is((select count(*)::int from public.transactions t join public.recurring_series s on s.id = t.recurring_series_id
  where s.id = '5e920000-0000-0000-0000-000000000002' and t.status = 'pending' and t.deleted_at is null and t.occurrence_date > s.end_date), 0,
  'no Expected line is left after the end date');
select extensions.is((select count(*)::int from public.transactions where id = (select id from t92_pend) and status = 'paid'), 1, 'the confirmed line is untouched by the stop');

-- D-29 set_safety_net ----------------------------------------------------------------------------------------------------
select extensions.throws_ok($$select public.set_safety_net('9a920000-0000-0000-0000-000000000003',
  jsonb_build_object('9a920000-0000-0000-0000-000000000001', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000001'),
                     '9a920000-0000-0000-0000-000000000003', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000003')),
  public.t92_step('57920000-0000-0000-0000-0000000000a1', 'goalMade', '9a920000-0000-0000-0000-000000000003'))$$,
  '22023', null, 'set_safety_net refuses a label key that is not its own');
select extensions.is(public.t92_flagged('11111111-1111-1111-1111-111111111111'), 1, 'the refusal changed nothing');
select extensions.is(public.set_safety_net('9a920000-0000-0000-0000-000000000003',
  jsonb_build_object('9a920000-0000-0000-0000-000000000001', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000001'),
                     '9a920000-0000-0000-0000-000000000003', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000003') + 5),
  '{"id":"57920000-0000-0000-0000-0000000000a2","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'conflict', 'a stale version is a conflict');
select extensions.is(public.t92_get('savings_goals', '9a920000-0000-0000-0000-000000000003', 'is_safety_net'), 'false', 'the conflict wrote nothing');

create temp table t92_before as
  select opening_saved, target, monthly_amount from public.savings_goals where id = '9a920000-0000-0000-0000-000000000003';
select extensions.is(public.set_safety_net('9a920000-0000-0000-0000-000000000003',
  jsonb_build_object('9a920000-0000-0000-0000-000000000001', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000001'),
                     '9a920000-0000-0000-0000-000000000003', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000003')),
  '{"id":"57920000-0000-0000-0000-0000000000a3","label_key":"safetyNetChanged","label_params":{"name":"Holiday"}}'::jsonb) ->> 'status',
  'applied', 'an existing goal becomes the safety net, swapping out the old one');
select extensions.ok((select is_safety_net and locked and protect from public.savings_goals where id = '9a920000-0000-0000-0000-000000000003'),
  'the new net is flagged, Locked and protected');
select extensions.ok((select g.opening_saved = b.opening_saved and g.target = b.target and g.monthly_amount = b.monthly_amount
  from public.savings_goals g, t92_before b where g.id = '9a920000-0000-0000-0000-000000000003'), 'its saved amount, target and monthly amount are untouched');
select extensions.ok((select not is_safety_net and locked from public.savings_goals where id = '9a920000-0000-0000-0000-000000000001'),
  'the old net is no longer flagged and stays Locked');
select extensions.is(public.t92_flagged('11111111-1111-1111-1111-111111111111'), 1, 'exactly one live flagged goal after the swap');

select extensions.is(public.set_safety_net('9a920000-0000-0000-0000-000000000003',
  jsonb_build_object('9a920000-0000-0000-0000-000000000001', 1, '9a920000-0000-0000-0000-000000000003', 1),
  '{"id":"57920000-0000-0000-0000-0000000000a3","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'already-applied', 'the same step id replays as already-applied');
select extensions.is(public.set_safety_net('9a920000-0000-0000-0000-000000000003',
  '{}'::jsonb, '{"id":"57920000-0000-0000-0000-0000000000a4","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'unchanged', 'a goal that already is the net is unchanged');

select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-0000000000a3') ->> 'status', 'undone', 'Undo of the swap is undone');
select extensions.ok((select is_safety_net from public.savings_goals where id = '9a920000-0000-0000-0000-000000000001'), 'Undo: the old net is flagged again');
select extensions.ok((select not is_safety_net and not locked and not protect from public.savings_goals where id = '9a920000-0000-0000-0000-000000000003'),
  'Undo: the goal is back to unflagged with its earlier Locked and Protect');
select extensions.is(public.t92_flagged('11111111-1111-1111-1111-111111111111'), 1, 'exactly one live flagged goal after Undo');

-- a soft-deleted goal cannot become the net
select extensions.lives_ok($$update public.savings_goals set deleted_at = now() where id = '9a920000-0000-0000-0000-000000000005'$$, 'a goal is soft-deleted');
select extensions.throws_ok($$select public.set_safety_net('9a920000-0000-0000-0000-000000000005',
  jsonb_build_object('9a920000-0000-0000-0000-000000000005', 1),
  '{"id":"57920000-0000-0000-0000-0000000000a5","label_key":"safetyNetChanged","label_params":{}}'::jsonb)$$,
  '22023', null, 'a soft-deleted goal cannot become the safety net');

-- B, a second member of A's household ----------------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is((select count(*)::int from public.savings_goals where created_by = '11111111-1111-1111-1111-111111111111' and is_safety_net), 0,
  'B cannot read the owner''s flagged goal');
select extensions.throws_ok($$select public.set_safety_net('9a920000-0000-0000-0000-000000000003',
  jsonb_build_object('9a920000-0000-0000-0000-000000000003', 1),
  '{"id":"57920000-0000-0000-0000-0000000000b1","label_key":"safetyNetChanged","label_params":{}}'::jsonb)$$,
  '42501', null, 'B cannot make A''s goal a safety net');
select extensions.throws_ok($$select public.save_goal_plan('{"id":"9a920000-0000-0000-0000-000000000002","name":"Mine now"}'::jsonb, 2, null,
  public.t92_step('57920000-0000-0000-0000-0000000000b2', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000002'))$$,
  '42501', null, 'B cannot change A''s goal plan');
select extensions.throws_ok($$select public.confirm_goal_contribution((select id from t92_pend2), 1, null,
  public.t92_step('57920000-0000-0000-0000-0000000000b3', 'goalContributionConfirmed', '9a920000-0000-0000-0000-000000000005'))$$,
  '22023', null, 'a paid line cannot be confirmed again');

-- B has no net: make one from a normal goal, then Undo
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-00000000000b', 'B goal', '{"target":50000,"opening_saved":1000}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-0000000000b4', 'goalMade', '9a920000-0000-0000-0000-00000000000b')) ->> 'status',
  'applied', 'B makes a goal');
select extensions.is(public.set_safety_net('9a920000-0000-0000-0000-00000000000b',
  jsonb_build_object('9a920000-0000-0000-0000-00000000000b', public.t92_ver('savings_goals', '9a920000-0000-0000-0000-00000000000b')),
  '{"id":"57920000-0000-0000-0000-0000000000b5","label_key":"safetyNetChanged","label_params":{}}'::jsonb) ->> 'status',
  'applied', 'with no net, B can make the goal the safety net');
select extensions.is(public.t92_flagged('22222222-2222-2222-2222-222222222222'), 1, 'B has exactly one flagged goal');
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-0000000000b5') ->> 'status', 'undone', 'B: Undo of the first net');
select extensions.is(public.t92_flagged('22222222-2222-2222-2222-222222222222'), 0, 'B has no flagged goal after Undo');
select extensions.ok((select not is_safety_net and not locked from public.savings_goals where id = '9a920000-0000-0000-0000-00000000000b'), 'B: the goal is restored');

-- B's flagged row with no size yet (the D-07 shape) is edited through the edit path
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-00000000000c', 'Safety net', '{"is_safety_net":true}'::jsonb),
  null, null, public.t92_step('57920000-0000-0000-0000-0000000000b6', 'safetyNetSizeSaved', '9a920000-0000-0000-0000-00000000000c')) ->> 'status',
  'applied', 'B: a flagged goal with no size');
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-00000000000c","target":230000}'::jsonb, public.t92_ver('savings_goals', '9a920000-0000-0000-0000-00000000000c'), null,
  public.t92_step('57920000-0000-0000-0000-0000000000b7', 'goalPlanChanged', '9a920000-0000-0000-0000-00000000000c')) ->> 'status',
  'applied', 'B: the size is set through the edit path');
select extensions.is(public.t92_flagged('22222222-2222-2222-2222-222222222222'), 1, 'B still has exactly one flagged goal');
select extensions.is(public.t92_get('savings_goals', '9a920000-0000-0000-0000-00000000000c', 'target'), '230000', 'B: the size reads back');

-- Follow-up (06-06): Undo of the safety-net creation, chained after Undo of a later edit of it -----------------------
-- b6 is stored with allow_system_keys (un-flag, then delete); b7 is a normal step, already undone when b6 is undone.
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-0000000000b7') ->> 'status', 'undone', 'B: Undo of the size edit');
select extensions.is(public.t92_get('savings_goals', '9a920000-0000-0000-0000-00000000000c', 'target'), null, 'B: the size is gone again');
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-0000000000b6') ->> 'status', 'undone', 'B: Undo of the safety-net creation');
select extensions.is(public.t92_flagged('22222222-2222-2222-2222-222222222222'), 0, 'B: no flagged goal after both Undos');
select extensions.ok(public.t92_get('savings_goals', '9a920000-0000-0000-0000-00000000000c', 'deleted_at') is not null, 'B: the safety-net goal is deleted');

-- Follow-up (06-06): Undo of a new goal takes its monthly contribution with it -------------------------------------
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000010', 'Bike', '{"target":90000,"monthly_amount":2000}'::jsonb),
  null, public.t92_series('5e920000-0000-0000-0000-000000000010', 'ca920000-0000-0000-0000-000000000001', 2000, current_date - 40),
  public.t92_step('57920000-0000-0000-0000-000000000c01', 'goalMade', '9a920000-0000-0000-0000-000000000010')) ->> 'status',
  'applied', 'Undo setup: a goal with a monthly contribution is made');
select extensions.cmp_ok((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000010' and status = 'pending' and deleted_at is null),
  '>=', 1, 'Undo setup: the contribution has Expected lines');
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-000000000c01') ->> 'status', 'undone', 'Undo of the new goal is undone');
select extensions.ok(public.t92_get('savings_goals', '9a920000-0000-0000-0000-000000000010', 'deleted_at') is not null, 'Undo: the new goal is deleted');
select extensions.ok(public.t92_get('recurring_series', '5e920000-0000-0000-0000-000000000010', 'deleted_at') is not null,
  'Undo: its contribution series is deleted');
select extensions.is((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000010' and status = 'pending' and deleted_at is null),
  0, 'Undo: no Expected line of the contribution is left');

-- Follow-up (06-06): Undo of a plan change puts back the goal fields and the old monthly record ------------------------
select extensions.is(public.save_goal_plan(
  public.t92_goal('9a920000-0000-0000-0000-000000000011', 'Car', '{"target":80000,"monthly_amount":2000}'::jsonb),
  null, public.t92_series('5e920000-0000-0000-0000-000000000011', 'ca920000-0000-0000-0000-000000000001', 2000, current_date - 40),
  public.t92_step('57920000-0000-0000-0000-000000000c02', 'goalMade', '9a920000-0000-0000-0000-000000000011')) ->> 'status',
  'applied', 'Edit setup: a goal with a 2000 monthly contribution is made');
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-000000000011","name":"Car fund","target":95000,"monthly_amount":4000}'::jsonb,
  public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000011'),
  public.t92_series('5e920000-0000-0000-0000-000000000011', 'ca920000-0000-0000-0000-000000000001', 4000, current_date - 40),
  public.t92_step('57920000-0000-0000-0000-000000000c03', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000011')) ->> 'status',
  'applied', 'Edit: the plan and the monthly amount are changed');
select extensions.is((select amount from public.recurring_series where id = '5e920000-0000-0000-0000-000000000011'), -4000::bigint,
  'Edit: the series carries the new amount');
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-000000000c03') ->> 'status', 'undone', 'Undo of the plan change is undone');
select extensions.ok((select name = 'Car' and target = 80000 and monthly_amount = 2000 from public.savings_goals
  where id = '9a920000-0000-0000-0000-000000000011'), 'Undo: the goal''s name, target and monthly amount are back');
select extensions.is((select amount from public.recurring_series where id = '5e920000-0000-0000-0000-000000000011'), -2000::bigint,
  'Undo: the series amount is back');
select extensions.is((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000011' and status = 'pending' and deleted_at is null
    and original_amount <> -2000), 0, 'Undo: no Expected line keeps the new amount');
select extensions.cmp_ok((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000011' and status = 'pending' and deleted_at is null),
  '>=', 1, 'Undo: the old Expected lines are back');

-- Follow-up (06-06): Undo of a stop runs the contribution again with its Expected lines ------------------------------
create temp table t92_live as
  select count(*)::int as n from public.transactions
   where recurring_series_id = '5e920000-0000-0000-0000-000000000011' and status = 'pending' and deleted_at is null;
grant select on t92_live to authenticated;
select extensions.is(public.save_goal_plan(
  '{"id":"9a920000-0000-0000-0000-000000000011"}'::jsonb, public.t92_ver('savings_goals', '9a920000-0000-0000-0000-000000000011'), null,
  public.t92_step('57920000-0000-0000-0000-000000000c04', 'goalPlanChanged', '9a920000-0000-0000-0000-000000000011')) ->> 'status',
  'applied', 'Stop: the contribution is stopped');
select extensions.ok((select end_date is not null and end_reason = 'stopped' from public.recurring_series
  where id = '5e920000-0000-0000-0000-000000000011'), 'Stop: the series is ended as stopped');
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-000000000c04') ->> 'status', 'undone', 'Undo of the stop is undone');
select extensions.ok((select end_date is null and end_reason is null and deleted_at is null from public.recurring_series
  where id = '5e920000-0000-0000-0000-000000000011'), 'Undo: the series runs again');
select extensions.is((select count(*)::int from public.transactions
  where recurring_series_id = '5e920000-0000-0000-0000-000000000011' and status = 'pending' and deleted_at is null),
  (select n from t92_live), 'Undo: every Expected line is back');

-- Follow-up (06-06): Undo of a paired confirmation (server-built step) ----------------------------------------------
select extensions.is(public.apply_undo_step('57920000-0000-0000-0000-000000000006') ->> 'status', 'undone',
  'Undo of the paired confirmation is undone');
select extensions.ok((select status = 'pending' and transfer_id is null and goal_id = '9a920000-0000-0000-0000-000000000003'
  from public.transactions where id = (select id from t92_pend)), 'Undo: the line is Expected again, unpaired, with its goal tag');
select extensions.ok(public.t92_get('transactions', '7a920000-0000-0000-0000-000000000001', 'deleted_at') is not null,
  'Undo: the goal-side leg is deleted');

select * from extensions.finish();
rollback;
