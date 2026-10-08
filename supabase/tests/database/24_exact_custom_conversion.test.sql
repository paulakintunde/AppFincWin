-- pgTAP: RD-03 end-to-end proof that a high-value custom currency converts
-- exactly, not through WR-B07's old 10dp-then-10dp-again drift.
--
-- Before this fix, converting 1.00 GOLD (1 GOLD = 60,000 USD) to a USD home
-- currency landed on 59,999.90 -- customPerEur's 10dp per-EUR rate
-- (0.0000195567) is already a lossy quantisation of 1.1734/60000, and
-- convert_minor then rounds a second time on top of it. stamp_fx_rate() now
-- stores the raw unit_value/reference-per-EUR stamp on the transaction and
-- computes home_amount through convert_minor_exact(), a single ratio with
-- exactly one rounding at the end.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(6);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

-- Matches the shared fixture's convertExact GOLD case exactly (money-conversion-cases.json).
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1734, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Vault', 'investment', 'USD', 0);

-- 1 GOLD = 60,000 USD, 2 decimals (whole troy-ounce-style units with cents).
insert into public.custom_currencies (id, code, symbol, decimals, reference_currency, unit_value, as_of)
values ('c1111111-1111-1111-1111-111111111111', 'GOLD', 'Au', 2, 'USD', 60000, '2026-09-20');

-- 1.00 GOLD, home_currency defaults USD (the author's profile default).
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 100, 'GOLD', '2026-09-22', 'UTC');
reset role;

select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::bigint,
  6000000::bigint,
  'RD-03: 1.00 GOLD converts to exactly 60,000.00 USD, not the old 59,999.90 (WR-B07)'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  false,
  'the row is stamped exact, not pending'
);
select extensions.is(
  (select orig_custom_unit_value::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '60000.0000000000',
  'orig_custom_unit_value stamps the raw unit_value actually used'
);
select extensions.is(
  (select orig_custom_ref_per_eur::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '1.1734000000',
  'orig_custom_ref_per_eur stamps the raw reference per-EUR rate actually used'
);
select extensions.is(
  (select home_custom_unit_value from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  null,
  'the home leg (plain USD) has no custom stamp'
);

-- An amount-only edit (D-04) must keep using the same exact stamp, not re-derive it.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.transactions set original_amount = 250
 where id = 'b1111111-1111-1111-1111-111111111111' and version = 1;
reset role;

select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::bigint,
  15000000::bigint,
  'an amount-only edit (2.50 GOLD) still converts exactly (150,000.00 USD), reusing the stored stamp'
);

select * from extensions.finish();
rollback;
