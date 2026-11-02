-- pgTAP: 05.4 M1 -- decide_checks.answer_v3 accepts the ten caution-answer codes, migration 20261103000100.
-- Needs 20261016000100 and 20261030000100 .. 20261103000100.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

insert into public.decide_checks (id, household_id, created_by, kind, name, inputs) values
  ('c8100000-0000-0000-0000-000000000001', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'buy', 'Sofa', '{"kind":"buy","itemType":"other"}');

select extensions.has_check('public', 'decide_checks', 'decide_checks has check constraints');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok($$update public.decide_checks set answer_v3 = '{"code":"fits_uses_net"}'::jsonb where id = 'c8100000-0000-0000-0000-000000000001'$$,
  'fits_uses_net is accepted');
select extensions.lives_ok($$update public.decide_checks set answer_v3 = '{"code":"fits_uses_overdraft"}'::jsonb where id = 'c8100000-0000-0000-0000-000000000001'$$,
  'fits_uses_overdraft is accepted');
select extensions.lives_ok($$update public.decide_checks set answer_v3 = '{"code":"fits_by_borrowing"}'::jsonb where id = 'c8100000-0000-0000-0000-000000000001'$$,
  'fits_by_borrowing is accepted');
select extensions.lives_ok($$update public.decide_checks set answer_v3 = '{"code":"fits_on_your_answer"}'::jsonb where id = 'c8100000-0000-0000-0000-000000000001'$$,
  'fits_on_your_answer is accepted');
select extensions.throws_ok($$update public.decide_checks set answer_v3 = '{"code":"fits"}'::jsonb where id = 'c8100000-0000-0000-0000-000000000001'$$,
  '23514', null, 'an unknown code is refused');

select * from extensions.finish();
rollback;
