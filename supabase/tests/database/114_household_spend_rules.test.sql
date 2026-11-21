-- pgTAP: plan 08.1-22 (CMP-F19, T-08.1-60, T-08.1-61, T-08.1-64). The household spending rule: members read it, nobody writes it
-- directly, the RPC validates every input, a change is announced with a before and after, a member who goes leaves no id behind.
-- Run only on a local stack (supabase test db); never against the linked project.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(25);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select
  (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h,
  (select id from public.households where owner_id = '44444444-4444-4444-4444-444444444444') as hd;
grant select on ids to authenticated;
create function public.t114_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- B and C join A's household in order A, B, C; D stays alone.
update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 40, now() - interval '2 days'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 0, now() - interval '1 day');
update public.household_members set weight = 60 where user_id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
select public.t114_as('11111111-1111-1111-1111-111111111111');

-- 1-3. Refusals before anything is saved.
select extensions.is(public.set_household_spend_rule('wild', null, null) ->> 'reason', 'invalid_rule', 'an unknown rule is refused');
select extensions.is(public.set_household_spend_rule('bring', 'villa', null) ->> 'reason', 'invalid_setup', 'an unknown setup is refused');
select extensions.is(public.set_household_spend_rule('custom', null, null) ->> 'reason', 'members_mismatch', 'a set split with no shares is refused');
select extensions.is(public.set_household_spend_rule('custom', null, '{"11111111-1111-1111-1111-111111111111": 50, "22222222-2222-2222-2222-222222222222": 50}'::jsonb) ->> 'reason', 'members_mismatch', 'shares that miss a member are refused');
select extensions.is(public.set_household_spend_rule('custom', null, '{"11111111-1111-1111-1111-111111111111": 50, "22222222-2222-2222-2222-222222222222": 50, "99999999-9999-9999-9999-999999999999": 0}'::jsonb) ->> 'reason', 'members_mismatch', 'shares for someone who is not a member are refused');
select extensions.is(public.set_household_spend_rule('custom', null, '{"11111111-1111-1111-1111-111111111111": 50.5, "22222222-2222-2222-2222-222222222222": 49, "33333333-3333-3333-3333-333333333333": 0}'::jsonb) ->> 'reason', 'invalid_share', 'a fractional share is refused');
select extensions.is(public.set_household_spend_rule('custom', null, '{"11111111-1111-1111-1111-111111111111": 0, "22222222-2222-2222-2222-222222222222": 0, "33333333-3333-3333-3333-333333333333": 0}'::jsonb) ->> 'reason', 'all_zero', 'all-zero shares are refused');
select extensions.is(public.set_household_spend_rule('custom', null, '{"11111111-1111-1111-1111-111111111111": 50, "22222222-2222-2222-2222-222222222222": 40, "33333333-3333-3333-3333-333333333333": 0}'::jsonb) ->> 'reason', 'not_100', 'shares that do not total 100 are refused');

-- 10-13. A good set split is saved, any member may change it, and a stale version names who changed it.
select extensions.is(public.set_household_spend_rule('custom', 'mixed', '{"11111111-1111-1111-1111-111111111111": 50, "22222222-2222-2222-2222-222222222222": 30, "33333333-3333-3333-3333-333333333333": 20}'::jsonb) ->> 'ok', 'true', 'a valid set split is saved');
select extensions.is((select version from public.household_spend_rules where household_id = (select h from ids)), 1, 'the first save is version 1');
select public.t114_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.set_household_spend_rule('bill', 'mixed', null, 1) ->> 'ok', 'true', 'any member can change the rule');
select extensions.is((select jsonb_build_object('r', r ->> 'reason', 'u', r ->> 'updated_by') from (select public.set_household_spend_rule('bring', null, null, 1) r) s),
  '{"r": "version_conflict", "u": "22222222-2222-2222-2222-222222222222"}'::jsonb, 'a stale change is refused and names who changed it');
select extensions.is((select version from public.household_spend_rules where household_id = (select h from ids)), 2, 'a change bumps the version');
select extensions.is((select shares ->> '11111111-1111-1111-1111-111111111111' from public.household_spend_rules where household_id = (select h from ids)), '50', 'a switch to the bill split keeps the stored shares');

-- 16-17. Each change is announced with a before and an after.
select extensions.is((select count(*)::int from public.household_events where kind = 'spend_rule_changed' and household_id = (select h from ids)), 2, 'one notice per change');
select extensions.ok((select bool_and(params ? 'before' and params ? 'after') from public.household_events where kind = 'spend_rule_changed'), 'every notice carries before and after');

-- 18-20. Reading and writing: members read, direct writes are refused, a non-member sees nothing.
select extensions.is((select count(*)::int from public.household_spend_rules), 1, 'a member reads the rule');
select extensions.throws_ok($$update public.household_spend_rules set rule = 'bring'$$, '42501', null, 'a direct update is refused');
select public.t114_as('44444444-4444-4444-4444-444444444444');
select extensions.is((select count(*)::int from public.household_spend_rules), 0, 'a non-member sees no rule');
select extensions.is(public.set_household_spend_rule('bring', null, null) ->> 'reason', 'too_few', 'a household of one has no spending rule to set');

-- 22. Anonymous callers are refused.
reset role;
set local role anon;
select extensions.throws_ok($$select public.set_household_spend_rule('bring', null, null)$$, '42501', null, 'anon cannot call the RPC');
reset role;

-- 23-24. A member who goes leaves no id behind.
update public.household_spend_rules set shares = '{"11111111-1111-1111-1111-111111111111": 50, "22222222-2222-2222-2222-222222222222": 30, "33333333-3333-3333-3333-333333333333": 20}'::jsonb
 where household_id = (select h from ids);
delete from public.household_members where user_id = '33333333-3333-3333-3333-333333333333';
select extensions.is((select shares ? '33333333-3333-3333-3333-333333333333' from public.household_spend_rules where household_id = (select h from ids)), false, 'a departed member id is stripped from the shares');
select extensions.is((select shares ? '11111111-1111-1111-1111-111111111111' from public.household_spend_rules where household_id = (select h from ids)), true, 'the others stay');

-- 25-26. The household's deletion takes its rule with it.
delete from public.households where id = (select h from ids);
select extensions.is((select count(*)::int from public.household_spend_rules where household_id = (select h from ids)), 0, 'deleting the household cascades to the rule');
select extensions.has_table('public', 'household_spend_rules', 'the table exists');

select * from extensions.finish();
rollback;
