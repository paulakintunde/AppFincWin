-- pgTAP: 08.1-05 APP-21 -- app_config key decide_off exists, defaults to 'false', clients read it and cannot write it.
-- Needs 20260922000200 and 20261125000300.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

select extensions.is((select value from public.app_config where key = 'decide_off'), 'false', 'decide_off defaults to false');

set local role anon;
select extensions.is((select value from public.app_config where key = 'decide_off'), 'false', 'anon can read decide_off');
select extensions.throws_ok($$update public.app_config set value = 'true' where key = 'decide_off'$$, '42501', null, 'anon cannot update decide_off');
reset role;

set local role authenticated;
select extensions.is((select value from public.app_config where key = 'decide_off'), 'false', 'authenticated can read decide_off');
select extensions.throws_ok($$update public.app_config set value = 'true' where key = 'decide_off'$$, '42501', null, 'authenticated cannot update decide_off');
select extensions.throws_ok($$delete from public.app_config where key = 'decide_off'$$, '42501', null, 'authenticated cannot delete decide_off');
reset role;

select * from extensions.finish();
rollback;
