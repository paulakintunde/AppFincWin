-- pgTAP: plan 08.1-22 (CMP-F19, UX-21, T-08.1-61, T-08.1-66). A joint account's purpose, and the month totals Decide reads.
-- Run only on a local stack (supabase test db); never against the linked project.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(20);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select
  (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h,
  (select id from public.households where owner_id = '44444444-4444-4444-4444-444444444444') as hd;
grant select on ids to authenticated;
create function public.t115_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, now() - interval '2 days');
update public.household_members set weight = 50 where user_id = '11111111-1111-1111-1111-111111111111';

-- A: personal PA, joint JA. D (alone): joint JD in a different household.
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('a1000000-0000-0000-0000-00000000000b', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A joint', 'checking', 'USD', 0, true),
  ('d4000000-0000-0000-0000-00000000000b', (select hd from ids), '44444444-4444-4444-4444-444444444444', 'D joint', 'checking', 'USD', 0, true);
-- Pay-ins by A (30000) and B (20000), and a payment out (25000, by A), all on JA in November; one old line in October.
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', 30000, 'USD', '2026-11-01', 'UTC', 'A pays in', 'paid'),
  ('d1000000-0000-0000-0000-000000000002', (select h from ids), '22222222-2222-2222-2222-222222222222', 'a1000000-0000-0000-0000-00000000000b', 20000, 'USD', '2026-11-01', 'UTC', 'B pays in', 'paid'),
  ('d1000000-0000-0000-0000-000000000003', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -25000, 'USD', '2026-11-05', 'UTC', 'Rent', 'paid'),
  ('d1000000-0000-0000-0000-000000000004', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', 99900, 'USD', '2026-10-01', 'UTC', 'old pay in', 'paid'),
  ('d1000000-0000-0000-0000-000000000005', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', 77700, 'USD', '2026-11-02', 'UTC', 'personal pay', 'paid');

set local role authenticated;
select public.t115_as('22222222-2222-2222-2222-222222222222');

-- 1-3. The purpose: any member sets it; the version moves; a notice names before and after.
select extensions.is(public.set_joint_account_purpose('a1000000-0000-0000-0000-00000000000b', 'bills', false) ->> 'ok', 'true', 'any member may set the purpose of a joint account');
select extensions.is((select joint_purpose from public.accounts where id = 'a1000000-0000-0000-0000-00000000000b'), 'bills', 'the purpose is stored');
select extensions.is((select count(*)::int from public.household_events where kind = 'joint_purpose_changed' and params ? 'before' and params ? 'after'), 1, 'a notice with before and after is written');

-- 4-8. Refusals.
select extensions.is(public.set_joint_account_purpose('a1000000-0000-0000-0000-00000000000a', 'bills', false) ->> 'reason', 'not_joint', 'a personal account has no purpose');
select extensions.is(public.set_joint_account_purpose('a1000000-0000-0000-0000-00000000000b', 'party', false) ->> 'reason', 'invalid_purpose', 'an unknown purpose is refused');
select extensions.is(public.set_joint_account_purpose('d4000000-0000-0000-0000-00000000000b', 'bills', false) ->> 'reason', 'not_member', 'an account of another household is refused');
select extensions.is(public.set_joint_account_purpose('a1000000-0000-0000-0000-00000000000b', 'everyday', false, 999) ->> 'reason', 'version_conflict', 'a stale account version is refused');
select extensions.throws_ok($$update public.accounts set joint_purpose = 'savings' where id = 'a1000000-0000-0000-0000-00000000000b'$$, '42501', null, 'a direct column update is refused');

-- 9-10. Spendable only for savings.
select extensions.is(public.set_joint_account_purpose('a1000000-0000-0000-0000-00000000000b', 'bills', true) ->> 'ok', 'true', 'spendable on a bills account is accepted but ignored');
select extensions.is((select joint_savings_spendable from public.accounts where id = 'a1000000-0000-0000-0000-00000000000b'), false, 'only a savings account can be marked spendable');

-- 11-14. The month totals: totals only, per member pay-ins, only joint accounts of my household.
select extensions.is((select money_in from public.joint_account_month((select h from ids), '2026-11-01', '2026-12-01') where account_id = 'a1000000-0000-0000-0000-00000000000b'), 50000::bigint, 'money in is the November pay-ins');
select extensions.is((select money_out from public.joint_account_month((select h from ids), '2026-11-01', '2026-12-01') where account_id = 'a1000000-0000-0000-0000-00000000000b'), 25000::bigint, 'money out is the November payments');
select extensions.is((select paid_in_by from public.joint_account_month((select h from ids), '2026-11-01', '2026-12-01') where account_id = 'a1000000-0000-0000-0000-00000000000b'),
  '{"11111111-1111-1111-1111-111111111111": 30000, "22222222-2222-2222-2222-222222222222": 20000}'::jsonb, 'pay-ins are totalled per member, including the partner personal lines');
select extensions.is((select count(*)::int from public.joint_account_month((select h from ids), '2026-11-01', '2026-12-01')), 1, 'only the joint account is returned, never a personal one');

-- 15-16. The shape has no line columns, and another household gets nothing.
select extensions.is((select array_agg(c order by c) from unnest(array['account_id','currency','money_in','money_out','paid_in_by']) c),
  (select array_agg(c order by c) from unnest((select proargnames from pg_proc where oid = 'public.joint_account_month(uuid,date,date)'::regprocedure)[4:8]) c), 'the result holds only totals and the account, no line, name or date');
select extensions.is((select count(*)::int from public.joint_account_month((select hd from ids), '2026-11-01', '2026-12-01')), 0, 'another household joint accounts return nothing');

-- 17-18. An account that stops being joint loses its purpose.
reset role;
select set_config('fincwin.household_rpc', 'on', true);
update public.accounts set is_shared = false where id = 'a1000000-0000-0000-0000-00000000000b';
select extensions.is((select joint_purpose from public.accounts where id = 'a1000000-0000-0000-0000-00000000000b'), null, 'un-sharing clears the purpose');
select extensions.throws_ok($$update public.accounts set joint_purpose = 'bills' where id = 'a1000000-0000-0000-0000-00000000000b'$$, '23514', null, 'a purpose cannot sit on a personal account');

-- 19-20. Anonymous callers are refused.
set local role anon;
select extensions.throws_ok($$select * from public.joint_account_month(null, '2026-11-01', '2026-12-01')$$, '42501', null, 'anon cannot read joint totals');
select extensions.throws_ok($$select public.set_joint_account_purpose(null, 'bills', false)$$, '42501', null, 'anon cannot set a purpose');
reset role;

select * from extensions.finish();
rollback;
