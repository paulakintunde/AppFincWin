-- pgTAP: RD-05 proof for the resolve-rate per-user throttle
-- (fx_resolve_calls / fx_resolve_rate_check_limit).
--
-- IN-B01 warned that any signed-in user could trigger unlimited outbound
-- Frankfurter fetches through resolve-rate. fx_resolve_rate_check_limit is
-- the atomic, service-role-only counter behind the Edge Function's 429
-- 'rate-limited' response: the (user_id, window_start) primary key makes
-- concurrent calls from the same user serialize rather than race, and no
-- client role can read or write the table at all.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

-- 1. No client role may read or write fx_resolve_calls at all.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select count(*) from public.fx_resolve_calls$$,
  '42501', null,
  'authenticated cannot read fx_resolve_calls'
);
select extensions.throws_ok(
  $$insert into public.fx_resolve_calls (user_id, window_start) values ('11111111-1111-1111-1111-111111111111', now())$$,
  '42501', null,
  'authenticated cannot insert into fx_resolve_calls'
);
select extensions.throws_ok(
  $$select public.fx_resolve_rate_check_limit('11111111-1111-1111-1111-111111111111')$$,
  '42501', null,
  'authenticated cannot execute fx_resolve_rate_check_limit'
);
reset role;

-- 2. Under a small limit, calls are allowed up to the limit and then blocked.
set local role service_role;
select extensions.is(
  public.fx_resolve_rate_check_limit('11111111-1111-1111-1111-111111111111', 3), true,
  'call 1 of 3 is allowed'
);
select extensions.is(
  public.fx_resolve_rate_check_limit('11111111-1111-1111-1111-111111111111', 3), true,
  'call 2 of 3 is allowed'
);
select extensions.is(
  public.fx_resolve_rate_check_limit('11111111-1111-1111-1111-111111111111', 3), true,
  'call 3 of 3 is allowed'
);
select extensions.is(
  public.fx_resolve_rate_check_limit('11111111-1111-1111-1111-111111111111', 3), false,
  'call 4 of 3 is over the limit'
);
reset role;

-- 3. The counter is per-user: a different user starts fresh even though the
-- first user is already over their own limit.
set local role service_role;
select extensions.is(
  public.fx_resolve_rate_check_limit('22222222-2222-2222-2222-222222222222', 3), true,
  'a different user has their own independent budget'
);
reset role;

-- 4. The window advances: a call attributed to an earlier hour does not
-- count against the current hour's budget.
set local role service_role;
update public.fx_resolve_calls set window_start = window_start - interval '1 hour', count = 3
 where user_id = '11111111-1111-1111-1111-111111111111';
select extensions.is(
  public.fx_resolve_rate_check_limit('11111111-1111-1111-1111-111111111111', 3), true,
  'a new hour starts a fresh window even after the previous hour was exhausted'
);
reset role;

select * from extensions.finish();
rollback;
