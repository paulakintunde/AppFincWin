-- pgTAP: WR-B05 proof that fx_drop_hold() fully undoes a bad rate.
--
-- Dropping a hold used to remove the rate from fx_rates only when the hold
-- was 'auto-accepted'. A confirmed hold, or a held one whose value reached
-- fx_rates some other way, stayed served. Transactions already stamped from
-- the bad rate were rate_pending = false, so no supported path could repair
-- them. Now the rate is removed for any non-dropped hold, every transaction
-- that could have used it is re-stamped (fx_restamp_by_rate), and the
-- operator gets a 'hold-dropped' alert with the count.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(11);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{}', now(), now());

-- USD on 09-21 is the bad, confirmed value (1.50); 09-18 is the good prior.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.15, '2026-09-18', 'frankfurter-v2'),
  ('EUR', 'USD', 1.50, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'JPY', 170, '2026-09-18', 'frankfurter-v2'),
  ('EUR', 'JPY', 170, '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'GBP', 0.95, '2026-09-21', 'frankfurter-v2');
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, prior_rate, prior_rate_date, change_ratio, status, resolved_at)
values ('EUR', 'USD', 1.50, '2026-09-21', 'frankfurter-v2', 1.15, '2026-09-18', 0.3043, 'confirmed', now());
-- A still-held GBP value that nonetheless sits in fx_rates.
insert into public.fx_rate_holds (base, quote, held_rate, held_rate_date, source, status)
values ('EUR', 'GBP', 0.95, '2026-09-21', 'frankfurter-v2', 'held');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a1111111-1111-1111-1111-111111111111', (select id from hh), 'Wallet', 'cash', 'USD', 0);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone)
values ('b1111111-1111-1111-1111-111111111111', (select id from hh), 'a1111111-1111-1111-1111-111111111111', 1000, 'JPY', '2026-09-22', 'UTC');
reset role;

select extensions.is(
  (select home_per_eur::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '1.5000000000',
  'sanity: the transaction was stamped exact from the bad confirmed USD rate'
);

set local role service_role;
select public.fx_drop_hold((select id from public.fx_rate_holds where quote = 'USD'));
reset role;

select extensions.is(
  (select count(*) from public.fx_rates where quote = 'USD' and rate_date = '2026-09-21')::int, 0,
  'dropping a confirmed hold removes its rate from fx_rates'
);
select extensions.is(
  (select home_per_eur::text from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  '1.1500000000',
  'the transaction stamped from the dropped rate is re-stamped from the good prior'
);
select extensions.is(
  (select home_amount from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  676,
  're-stamped home_amount uses the good USD rate'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'b1111111-1111-1111-1111-111111111111'),
  false,
  're-stamped row is exact again (09-18 is within 7 days)'
);
select extensions.is(
  (select version from public.transactions where id = 'b1111111-1111-1111-1111-111111111111')::int,
  1,
  'the repair is a system restamp, not a user edit: version unchanged'
);
select extensions.is(
  (select (detail->>'restamped')::int from public.fx_alerts where kind = 'hold-dropped' and quote = 'USD'),
  1,
  'a hold-dropped alert records how many transactions were re-stamped'
);

-- A held hold whose value is nonetheless in fx_rates.
set local role service_role;
select public.fx_drop_hold((select id from public.fx_rate_holds where quote = 'GBP'));
reset role;
select extensions.is(
  (select count(*) from public.fx_rates where quote = 'GBP' and rate_date = '2026-09-21')::int, 0,
  'dropping a still-held hold also removes a same-tuple rate from fx_rates'
);

-- fx_restamp_by_rate is service_role-only.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.fx_restamp_by_rate('USD', '2026-09-21')$$,
  '42501', null,
  'fx_restamp_by_rate is not executable by authenticated'
);
reset role;
select extensions.ok(
  has_function_privilege('service_role', 'public.fx_restamp_by_rate(text, date)', 'execute'),
  'service_role can execute fx_restamp_by_rate'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.fx_restamp_by_rate(text, date)', 'execute'),
  'anon cannot execute fx_restamp_by_rate'
);

select * from extensions.finish();
rollback;
