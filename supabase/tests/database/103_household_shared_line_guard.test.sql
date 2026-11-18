-- pgTAP: Phase 8 plan 08-05 (CMP-F18; D-13, D-14, D-18). No security-definer function lets member B read, patch or undo
-- member A's personal rows; apply_patches refuses them exactly like a missing row; only the creator or named payer
-- changes a shared line; only the creator flips an account to joint; members see a joint account's full balance.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"full_name":"Bob Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- B leaves their household of one and joins A's (superuser, new member columns).
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', false, 0);

-- Fixtures as the table owner. PA personal account of A, JA joint account of A.
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000a', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('a1000000-0000-0000-0000-00000000000b', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'Joint', 'checking', 'USD', 0, true);

-- T1 personal 'Secret rent'; T2 shared on PA; T3 shared on JA; T5 personal on JA; T4 shared, B named payer.
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared, paid_by) values
  ('d1000000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -90000, 'USD', '2026-11-02', 'UTC', 'Secret rent', 'paid', false, null),
  ('d1000000-0000-0000-0000-000000000002', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -1000, 'USD', '2026-11-03', 'UTC', 'Shared shop', 'paid', true, null),
  ('d1000000-0000-0000-0000-000000000003', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -2000, 'USD', '2026-11-04', 'UTC', 'Joint bill', 'paid', true, null),
  ('d1000000-0000-0000-0000-000000000004', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -3000, 'USD', '2026-11-05', 'UTC', 'Paid by B', 'paid', true, '22222222-2222-2222-2222-222222222222'),
  ('d1000000-0000-0000-0000-000000000005', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', 50000, 'USD', '2026-11-06', 'UTC', 'A pay into joint', 'paid', false, null);

-- A's personal series (never touched by B's add-month), A's debt and goal, B's shared series.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_shared) values
  ('5e000000-0000-0000-0000-00000000000a', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', 'A personal series', -5000, 'USD', 'monthly', '2026-01-01', 'UTC', false),
  ('5e000000-0000-0000-0000-00000000000b', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-00000000000b', 'B shared series', -6000, 'USD', 'monthly', '2026-01-01', 'UTC', true);
insert into public.debts (id, household_id, created_by, name, kind, currency, balance) values
  ('de000000-0000-0000-0000-00000000000a', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A loan', 'loan', 'USD', 90000);
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, name, currency, target) values
  ('5a000000-0000-0000-0000-00000000000a', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '11111111-1111-1111-1111-111111111111', 'A goal', 'USD', 100000);
select set_config('fincwin.decide_rpc', '', true);

-- An undo step B owns that points at A's personal line.
insert into public.undo_log (id, owner_id, label_key, label_params, ops) values
  ('e0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'edit', '{}'::jsonb,
   '[{"entity":"transactions","id":"d1000000-0000-0000-0000-000000000001","expectedVersion":1,"patch":{"note":"z"}}]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

-- 1-2. apply_patches on A's personal line is exactly the refusal of a missing id, and never echoes the name.
select is(
  public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'd1000000-0000-0000-0000-000000000001',
    'expectedVersion', 1, 'patch', jsonb_build_object('note', 'x')))) #- '{conflict,id}',
  public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    'expectedVersion', 1, 'patch', jsonb_build_object('note', 'x')))) #- '{conflict,id}',
  'a personal row of another member is refused like a missing row');
select ok(
  public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'd1000000-0000-0000-0000-000000000001',
    'expectedVersion', 9, 'patch', jsonb_build_object('note', 'x'))))::text not like '%Secret rent%',
  'the refusal never echoes the record name');

-- 3-4. B is neither creator nor payer of the shared line T2.
select throws_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'd1000000-0000-0000-0000-000000000002', 'expectedVersion', 1, 'patch', jsonb_build_object('note', 'x'))))$$,
  '42501', 'shared_line_creator_only', 'apply_patches: a member who is not creator or payer cannot change a shared line');
select throws_ok($$update public.transactions set note = 'x' where id = 'd1000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'a direct update by a non-creator, non-payer is refused');

-- 5-8. B is the named payer of T4: amount, currency, date and note only.
select lives_ok($$update public.transactions set original_amount = -3500 where id = 'd1000000-0000-0000-0000-000000000004'$$,
  'the payer may change the amount directly');
select throws_ok($$update public.transactions set category_id = (select id from public.categories where owner_id = '22222222-2222-2222-2222-222222222222' limit 1) where id = 'd1000000-0000-0000-0000-000000000004'$$,
  '42501', null, 'the payer may not change the category directly');
select is(
  public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'd1000000-0000-0000-0000-000000000004',
    'expectedVersion', (select version from public.transactions where id = 'd1000000-0000-0000-0000-000000000004'),
    'patch', jsonb_build_object('note', 'paid it')))) ->> 'status',
  'applied', 'apply_patches lets the payer change the note');
select throws_ok(
  $$select public.apply_patches(jsonb_build_array(jsonb_build_object('entity', 'transactions', 'id', 'd1000000-0000-0000-0000-000000000004', 'expectedVersion', (select version from public.transactions where id = 'd1000000-0000-0000-0000-000000000004'), 'patch', jsonb_build_object('name', 'renamed'))))$$,
  '42501', 'shared_line_creator_only', 'apply_patches refuses the payer any other column');

-- 10. B cannot flip the joint account back to personal.
select throws_ok($$update public.accounts set is_shared = false where id = 'a1000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'only the creator changes the joint flag');

-- 11-12. Joint balance: every JA line (A's personal pay-in included), and no personal account.
select is(
  (select balance from public.joint_account_balances((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))
    where account_id = 'a1000000-0000-0000-0000-00000000000b'),
  48000::bigint, 'the joint balance is the sum of every paid line on it');
select is(
  (select count(*) from public.joint_account_balances((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'))
    where account_id = 'a1000000-0000-0000-0000-00000000000a'),
  0::bigint, 'a personal account is never returned');

-- 13. Undo over A's personal line is out of scope for B.
select is(public.apply_undo_step('e0000000-0000-0000-0000-000000000001') ->> 'status', 'refused', 'an undo step over another member''s personal line is refused');

-- 14-16. Entry list and add-month never reach A's personal rows.
select throws_ok(
  $$select public.record_entry_list(array['d1000000-0000-0000-0000-000000000001'::uuid], '[]'::jsonb, '{"id":"e0000000-0000-0000-0000-000000000002","label_key":"entryList"}'::jsonb)$$,
  '22023', null, 'record_entry_list refuses another member''s line');
select lives_ok(
  $$select public.add_activity_month(
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      to_char(to_date(to_char(public.recurring_horizon(current_date), 'YYYY-MM') || '-01', 'YYYY-MM-DD') + interval '1 month', 'YYYY-MM'),
      current_date, '{"id":"e0000000-0000-0000-0000-000000000003","label_key":"monthAdded"}'::jsonb)$$,
  'B adds a month');

-- 17-18 need no client role.
reset role;
select is((select count(*) from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-00000000000a'), 0::bigint,
  'add-month did not materialise A''s personal series');

-- 19. Grow guards: B's line cannot link A's debt; a series B created cannot take A's goal.
select throws_ok(
  $$insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, debt_id)
    values ('d1000000-0000-0000-0000-0000000000f1', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
            '22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-00000000000b', -100, 'USD', '2026-11-07', 'UTC', 'x', 'de000000-0000-0000-0000-00000000000a')$$,
  '22023', null, 'no line can be linked to another member''s debt');
select throws_ok($$update public.recurring_series set goal_id = '5a000000-0000-0000-0000-00000000000a' where id = '5e000000-0000-0000-0000-00000000000b'$$,
  '42501', null, 'a series cannot take a goal that is not its creator''s');

select * from finish();
rollback;
