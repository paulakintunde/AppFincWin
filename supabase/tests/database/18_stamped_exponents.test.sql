-- pgTAP: WR-B08 proof that a transaction keeps the currency exponents it
-- was stamped with.
--
-- An amount-only edit used to re-read currency_exponent() through the
-- author's custom currencies. Once the author's account was gone
-- (created_by set null, custom currencies cascaded away), the edit fell
-- back to the default exponent 2 for a 0-decimal custom currency and
-- corrupted home_amount by 100x. The exponents are now stamped on the row
-- at write time (orig_exp, home_exp; server-only) and reused on edits.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(7);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'JPY', 180.7, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
values ('c1111111-1111-1111-1111-111111111111', 'PTS', 'P', 0, 'USD', 0.01, '2026-09-20');
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Points', 'other', 'PTS', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values
  ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 500, 'PTS', '2026-09-22', 'UTC'),
  ('b2111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'JPY', '2026-09-22', 'UTC');

select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, orig_exp)
    values ('b3111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1, 'USD', '2026-09-22', 'UTC', 4)$$,
  '42501', null,
  'a client cannot write orig_exp (server-only stamp column)'
);
reset role;

select extensions.is(
  (select orig_exp from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int, 0,
  'orig_exp is stamped from the custom currency''s declared decimals'
);
select extensions.is(
  (select home_exp from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int, 2,
  'home_exp is stamped from the home currency''s ISO exponent'
);
select extensions.is(
  (select orig_exp from public.transactions where id = 'b2111111-1111-1111-1111-111111111111')::int, 0,
  'orig_exp is stamped for an ISO 0-decimal currency (JPY)'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int, 500,
  'sanity: 500 PTS at 0.01 USD = 5.00 USD'
);

-- The author's custom definition disappears and created_by is nulled, as
-- when the author's account is deleted but the household survives.
delete from public.custom_currencies where id = 'c1111111-1111-1111-1111-111111111111';
update public.transactions set created_by = null where id = 'b1111111-1111-1111-1111-111111111111';

-- Another writer then edits only the amount.
update public.transactions set original_amount = 1000 where id = 'b1111111-1111-1111-1111-111111111111';
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int, 1000,
  'an amount-only edit uses the stamped exponent: 1000 PTS = 10.00 USD, not 0.10'
);
select extensions.is(
  (select orig_exp from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int, 0,
  'the stamped exponent survives the edit'
);

select * from extensions.finish();
rollback;
