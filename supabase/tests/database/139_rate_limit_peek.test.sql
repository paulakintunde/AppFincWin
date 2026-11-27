-- pgTAP: 10-review S-7 (migration 20261127090500). rate_limit_peek reads the counter without counting.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

select extensions.is(public.rate_limit_peek('t139:a', 2, 900), true, 'an unused key is under its limit');
select extensions.is((select count(*)::int from public.rate_limits where key = 't139:a'), 0, 'a peek adds no row');
select public.rate_limit_hit('t139:a', 2, 900);
select extensions.is(public.rate_limit_peek('t139:a', 2, 900), true, 'one hit of two: still under');
select public.rate_limit_hit('t139:a', 2, 900);
select extensions.is(public.rate_limit_peek('t139:a', 2, 900), false, 'two hits of two: the next attempt is refused');
select extensions.is((select sum(count)::int from public.rate_limits where key = 't139:a'), 2, 'peeks never count');
select extensions.ok(
  not has_function_privilege('authenticated', 'public.rate_limit_peek(text, integer, integer)', 'execute')
  and not has_function_privilege('anon', 'public.rate_limit_peek(text, integer, integer)', 'execute'),
  'only the service role can peek');

select * from extensions.finish();
rollback;
