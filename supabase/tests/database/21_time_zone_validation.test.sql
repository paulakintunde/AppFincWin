-- pgTAP: IN-B04 proof that transactions.time_zone must be a real IANA zone
-- (MON-14). It used to accept any 1-64 character string.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(5);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Wallet', 'cash', 'USD', 0);

select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-09-22', 'America/Vancouver')$$,
  'an IANA zone is accepted'
);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b2111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-09-22', 'UTC')$$,
  'UTC is accepted'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b3111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-09-22', 'Mars/Olympus_Mons')$$,
  '23514', null,
  'a made-up zone is rejected'
);
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b4111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-09-22', 'lunchtime')$$,
  '23514', null,
  'free text is rejected'
);
select extensions.throws_ok(
  $$update public.transactions set time_zone = 'Nowhere/Special' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '23514', null,
  'an update to an unknown zone is rejected'
);
reset role;

select * from extensions.finish();
rollback;
