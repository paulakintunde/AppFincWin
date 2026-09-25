-- pgTAP: WR-B09 -- the home_amount bound the TS mirror enforces with a
-- RangeError (convertMinor beyond Number.MAX_SAFE_INTEGER) is enforced in
-- SQL by the transactions.home_amount check (23514). The generated mirror
-- (07_money_rounding_mirror) can only express successful conversions, so
-- this boundary is asserted here, with the same inputs as the matching
-- case in src/engine/money/__tests__/rates.test.ts.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(3);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'IDR', 18000, '2026-09-21', 'frankfurter-v2');

update public.profiles set home_currency = 'IDR' where id = '11111111-1111-1111-1111-111111111111';

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Wallet', 'cash', 'USD', 0);

select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 10000000000000, 'USD', '2026-09-22', 'UTC')$$,
  '23514', null,
  'the largest original amount converted into IDR overflows the home_amount bound (TS: RangeError)'
);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
    values ('b2111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 100000000000, 'USD', '2026-09-22', 'UTC')$$,
  'a large amount that stays within the bound is accepted'
);
reset role;
select extensions.is(
  (select home_amount from public.transactions where id = 'b2111111-1111-1111-1111-111111111111'),
  public.convert_minor(100000000000, 1.1483, 2, 18000, 2),
  'the in-bound amount is stamped with the mirrored conversion'
);

select * from extensions.finish();
rollback;
