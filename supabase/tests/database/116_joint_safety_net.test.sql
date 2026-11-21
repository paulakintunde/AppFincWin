-- pgTAP: plan 08.1-23 (CMP-F19, UX-21, HH-34; owner 2026-11-21 Q10). A joint savings account marked as the shared safety net.
-- Run only on a local stack (supabase test db); never against the linked project.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 2) n;

create temp table ids as select
  (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h;
grant select on ids to authenticated;
create function public.t116_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, now() - interval '2 days');
update public.household_members set weight = 50 where user_id = '11111111-1111-1111-1111-111111111111';

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('b1000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'Joint savings', 'savings', 'USD', 500000, true);

set local role authenticated;
select public.t116_as('22222222-2222-2222-2222-222222222222');

-- 1-4. Any member marks joint savings as the safety net; "can be spent" is switched off with it; the notice names it.
select extensions.is(public.set_joint_account_purpose('b1000000-0000-0000-0000-00000000000a', 'savings', true, null, true) ->> 'ok', 'true', 'any member may mark joint savings as the safety net');
select extensions.is((select joint_safety_net from public.accounts where id = 'b1000000-0000-0000-0000-00000000000a'), true, 'the safety-net mark is stored');
select extensions.is((select joint_savings_spendable from public.accounts where id = 'b1000000-0000-0000-0000-00000000000a'), false, 'a safety net is never marked can be spent');
select extensions.is((select count(*)::int from public.household_events where kind = 'joint_purpose_changed' and params -> 'after' ->> 'safety_net' = 'true'), 1, 'the notice carries the safety-net mark');

-- 5-6. The mark is kept only on savings.
select extensions.is(public.set_joint_account_purpose('b1000000-0000-0000-0000-00000000000a', 'everyday', false, null, true) ->> 'ok', 'true', 'a safety-net mark on another purpose is accepted but ignored');
select extensions.is((select joint_safety_net from public.accounts where id = 'b1000000-0000-0000-0000-00000000000a'), false, 'only joint savings can be the safety net');

-- 7-8. Older clients: four arguments still work and leave the mark off.
select extensions.is(public.set_joint_account_purpose('b1000000-0000-0000-0000-00000000000a', 'savings', true) ->> 'ok', 'true', 'the three-argument call still resolves');
select extensions.is((select joint_safety_net from public.accounts where id = 'b1000000-0000-0000-0000-00000000000a'), false, 'leaving the mark out means not the safety net');

-- 9. Only one function of that name (no ambiguous overloads).
select extensions.is((select count(*)::int from pg_proc where proname = 'set_joint_account_purpose' and pronamespace = 'public'::regnamespace), 1, 'one set_joint_account_purpose');

-- 10. No direct write to the column.
select extensions.throws_ok($$update public.accounts set joint_safety_net = true where id = 'b1000000-0000-0000-0000-00000000000a'$$, '42501', null, 'a direct column update is refused');

-- 11-12. The checks hold even for the owner role: savings only, never spendable.
reset role;
select set_config('fincwin.household_rpc', 'on', true);
select extensions.throws_ok($$update public.accounts set joint_purpose = 'bills', joint_savings_spendable = false, joint_safety_net = true where id = 'b1000000-0000-0000-0000-00000000000a'$$, '23514', null, 'a safety net must be joint savings');
select extensions.throws_ok($$update public.accounts set joint_purpose = 'savings', joint_savings_spendable = true, joint_safety_net = true where id = 'b1000000-0000-0000-0000-00000000000a'$$, '23514', null, 'a safety net cannot be spendable');

-- 13. An account that stops being joint loses the mark.
update public.accounts set joint_purpose = 'savings', joint_savings_spendable = false, joint_safety_net = true where id = 'b1000000-0000-0000-0000-00000000000a';
update public.accounts set is_shared = false where id = 'b1000000-0000-0000-0000-00000000000a';
select extensions.is((select joint_safety_net from public.accounts where id = 'b1000000-0000-0000-0000-00000000000a'), false, 'un-sharing clears the safety-net mark');

-- 14. Anonymous callers are refused.
set local role anon;
select extensions.throws_ok($$select public.set_joint_account_purpose(null, 'savings', false, null, true)$$, '42501', null, 'anon cannot set the safety net');
reset role;

select * from extensions.finish();
rollback;
