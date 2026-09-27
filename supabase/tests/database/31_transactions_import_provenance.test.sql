-- pgTAP: D-39/D-45/D-50/D-54 proof for statement-import provenance and the
-- transfer link on transactions.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(14);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'JPY', 180.7, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Current', 'checking', 'USD', 0)$$,
  'A can insert an account'
);

-- 1. A full provenance insert succeeds.
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, raw_amount, raw_balance, external_id, import_format)
    values ('b1111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -1250, 'USD', '2026-09-22', 'America/Vancouver',
      '(12.50)', '1,234.56 OD', 'F1', 'ofx')$$,
  'A inserts a row with raw_amount/raw_balance/external_id/import_format'
);

-- 2. Provenance columns are insert-only: an update of any of the four
-- fails with 42501.
select extensions.throws_ok(
  $$update public.transactions set raw_amount = '(99.00)' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update raw_amount (insert-only, D-45)'
);
select extensions.throws_ok(
  $$update public.transactions set raw_balance = '0.00' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update raw_balance (insert-only, D-45)'
);
select extensions.throws_ok(
  $$update public.transactions set external_id = 'F2' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update external_id (insert-only, D-45)'
);
select extensions.throws_ok(
  $$update public.transactions set import_format = 'csv' where id = 'b1111111-1111-1111-1111-111111111111'$$,
  '42501', null,
  'A cannot update import_format (insert-only, D-45)'
);

-- 3. raw_amount is capped at 64 characters.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, raw_amount)
    values ('b2111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver', repeat('9', 65))$$,
  '23514', null,
  'a 65-character raw_amount violates the length check'
);

-- 4. external_id is capped at 255 characters.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, external_id)
    values ('b3111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver', repeat('a', 256))$$,
  '23514', null,
  'a 256-character external_id violates the length check'
);

-- 5. import_format is a lower-case short code only.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, import_format)
    values ('b4111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -10, 'USD', '2026-09-23', 'America/Vancouver', 'OFX')$$,
  '23514', null,
  'import_format ''OFX'' (upper case) violates the short-code check'
);

-- 6. A second row with the same (account_id, external_id) is accepted --
-- FITIDs are not unique (D-54).
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, external_id, import_format)
    values ('b5111111-1111-1111-1111-111111111111',
      (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -20, 'USD', '2026-09-24', 'America/Vancouver', 'F1', 'ofx')$$,
  'a second row with the same (account_id, external_id) is accepted (D-54)'
);

-- 7. Both provenance indexes exist.
select extensions.has_index(
  'public', 'transactions', 'transactions_external_id_idx',
  'transactions_external_id_idx exists'
);
select extensions.has_index(
  'public', 'transactions', 'transactions_transfer_id_idx',
  'transactions_transfer_id_idx exists'
);

-- 8. A member can update transfer_id on an own row (the pair rule itself
-- arrives with plan 02-38's deferred trigger; only the column grant is
-- proven here).
select extensions.lives_ok(
  $$update public.transactions set transfer_id = gen_random_uuid() where id = 'b1111111-1111-1111-1111-111111111111'$$,
  'A can update transfer_id on an own row'
);

reset role;

-- 9. B sees none of A's provenance through transactions_active.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*) from public.transactions_active where external_id = 'F1')::int,
  0,
  'B sees none of A''s provenance rows through transactions_active'
);
reset role;

select * from extensions.finish();
rollback;
