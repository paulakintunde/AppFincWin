-- pgTAP: D-25 / FND-09 proof for app_config.
--
-- app_config.min_supported_version must be readable by anon (pre-sign-in)
-- and by authenticated, and writable by no client role -- values change
-- only through migrations.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(4);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select extensions.results_eq(
  $$select value from public.app_config where key = 'min_supported_version'$$,
  $$values ('0.1.0'::text)$$,
  'anon reads min_supported_version = 0.1.0'
);
select extensions.throws_ok(
  $$insert into public.app_config (key, value) values ('x', 'y')$$,
  '42501', null,
  'anon cannot insert into app_config'
);
select extensions.throws_ok(
  $$update public.app_config set value = 'z' where key = 'min_supported_version'$$,
  '42501', null,
  'anon cannot update app_config'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$insert into public.app_config (key, value) values ('x', 'y')$$,
  '42501', null,
  'authenticated cannot insert into app_config'
);
reset role;

select * from extensions.finish();
rollback;
