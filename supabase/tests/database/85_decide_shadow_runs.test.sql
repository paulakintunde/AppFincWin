-- pgTAP: 05.4 M6 -- decide_shadow_runs, migration 20261103000500. Insert with consent only, no client read, unique per revision and sample.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

-- A has given consent (set by the server); B has not.
update public.profiles set decide_shadow = true where id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok($$insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, variant, reasons, figures)
  values ('11111111-1111-1111-1111-111111111111', 'r1', 's60', 'fits_month', null, '{}', '{"left":1200}')$, 'a consenting tester inserts their own row');
select extensions.lives_ok($insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, variant, figures)
  values ('11111111-1111-1111-1111-111111111111', 'r2', 's60', 'fits_uses_overdraft', 'not_cleared', '{}'),
         ('11111111-1111-1111-1111-111111111111', 'r3', 's60', 'fits_month', 'no_net', '{}'),
         ('11111111-1111-1111-1111-111111111111', 'r4', 's60', 'fits_month', 'small_net', '{}'),
         ('11111111-1111-1111-1111-111111111111', 'r5', 's60', 'fits_unspent', 'costly_debt', '{}'),
         ('11111111-1111-1111-1111-111111111111', 'r6', 'c9000_plan', 'fits_by_borrowing', 'borrowing_costs_more', '{}')$,
  'the round-1 variants (D-35..D-40) are accepted');
select extensions.throws_ok($insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, variant, figures)
  values ('11111111-1111-1111-1111-111111111111', 'r7', 's60', 'fits_month', 'net_not_full', '{}')$, '23514', null, 'a variant outside the list is refused');
select extensions.throws_ok($$insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, figures)
  values ('22222222-2222-2222-2222-222222222222', 'r1', 's60', 'fits_month', '{}')$$, '42501', null, 'cannot insert for another user');
select extensions.throws_ok($$insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, figures)
  values ('11111111-1111-1111-1111-111111111111', 'r1', 's60', 'not_yet', '{}')$$, '23505', null, 'the same revision and sample twice is refused');
select extensions.throws_ok($$insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, figures)
  values ('11111111-1111-1111-1111-111111111111', 'r1', 'p500', 'fits_month', ('{"x":"' || repeat('a', 3000) || '"}')::jsonb)$$, '23514', null, 'oversized figures are refused');
select extensions.throws_ok($$select count(*) from public.decide_shadow_runs$$, '42501', null, 'the tester cannot read shadow runs');
select extensions.throws_ok($$delete from public.decide_shadow_runs$$, '42501', null, 'the tester cannot delete shadow runs');

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.throws_ok($$insert into public.decide_shadow_runs (user_id, engine_revision, sample_id, code, figures)
  values ('22222222-2222-2222-2222-222222222222', 'r1', 's60', 'fits_month', '{}')$$, '42501', null, 'without consent the insert is refused');

reset role;
select extensions.is((select count(*)::int from public.decide_shadow_runs), 6, 'exactly the consenting tester''s rows exist');
select extensions.lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'deleting the tester succeeds');

select * from extensions.finish();
rollback;
