-- pgTAP: dismissed_series_offers is owner-only and cascades on user
-- deletion (CONTEXT D-18; GDPR erasure).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.dismissed_series_offers (offer_key) values ('netflix|GBP|-')$$,
  'A can dismiss an offer'
);
select extensions.throws_ok(
  $$insert into public.dismissed_series_offers (offer_key) values ('netflix|GBP|-')$$,
  '23505', null, 'a duplicate dismissal is refused'
);
select extensions.throws_ok(
  $$insert into public.dismissed_series_offers (offer_key) values (repeat('x', 301))$$,
  '23514', null, 'a 301-character offer_key violates the length check'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.dismissed_series_offers), 0,
  'B cannot see A''s dismissed offers'
);
select extensions.throws_ok(
  $$insert into public.dismissed_series_offers (owner_id, offer_key) values ('11111111-1111-1111-1111-111111111111', 'spoof')$$,
  '42501', null, 'B cannot insert a row owned by A'
);

reset role;
select extensions.is(
  (select count(*)::int from public.dismissed_series_offers where owner_id = '11111111-1111-1111-1111-111111111111'),
  1, 'A''s dismissal exists before deletion'
);
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select extensions.is(
  (select count(*)::int from public.dismissed_series_offers where owner_id = '11111111-1111-1111-1111-111111111111'),
  0, 'deleting the user cascades the dismissals'
);

select * from extensions.finish();
rollback;
