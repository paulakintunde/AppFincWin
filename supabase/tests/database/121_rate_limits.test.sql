-- pgTAP: 10-09 ACC-13 -- rate_limit_hit fixed-window counter is service-role only; purge keeps recent windows.
-- Migration 20261126000200.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(10);

set local role service_role;
select extensions.is(public.rate_limit_hit('t121:a', 3, 60), true, 'hit 1 allowed');
select extensions.is(public.rate_limit_hit('t121:a', 3, 60), true, 'hit 2 allowed');
select extensions.is(public.rate_limit_hit('t121:a', 3, 60), true, 'hit 3 allowed');
select extensions.is(public.rate_limit_hit('t121:a', 3, 60), false, 'hit 4 refused');
select extensions.is(public.rate_limit_hit('t121:b', 3, 60), true, 'a different key has its own count');

-- An older window does not carry over: seed an exhausted row for a past window, the current window still starts at 1.
reset role;
insert into public.rate_limits (key, window_start, count) values ('t121:c', now() - interval '1 hour', 99);
set local role service_role;
select extensions.is(public.rate_limit_hit('t121:c', 3, 60), true, 'next window starts again');

-- Purge
reset role;
insert into public.rate_limits (key, window_start, count) values
  ('t121:old', now() - interval '3 days', 1),
  ('t121:new', now() - interval '1 day', 1);
set local role service_role;
select public.purge_rate_limits();
select extensions.is((select count(*)::int from public.rate_limits where key = 't121:old'), 0, 'old window purged');
select extensions.is((select count(*)::int from public.rate_limits where key = 't121:new'), 1, 'recent window kept');

-- Clients are locked out
reset role;
set local role authenticated;
select extensions.throws_ok($$select count(*) from public.rate_limits$$, '42501', null, 'authenticated cannot read the counter');
select extensions.throws_ok($$select public.rate_limit_hit('x', 1, 60)$$, '42501', null, 'authenticated cannot call rate_limit_hit');

select * from extensions.finish();
rollback;
