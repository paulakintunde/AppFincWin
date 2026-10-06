-- pgTAP: D-02/D-03/D-04/D-07/D-08/D-09 behavioural proof for recurring
-- series -- create, replay, idempotent materialisation, cross-household
-- RLS, skip, "this and future" (a paid row is never rewritten), end, an
-- existing transaction becoming a series' first occurrence, and the
-- service-role-only daily job (T-02-08-01, T-02-08-03, T-02-08-04).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(40);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

-- is_known_currency() treats USD as known only once an fx_rates row quotes
-- it (EUR is the only currency known unconditionally) -- same fixture line
-- 05_accounts_transactions.test.sql and 26_transactions_record_fields.test.sql
-- already use.
insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0)$$,
  'A can insert an account'
);

-- A manual, non-series transaction, used later to prove a skip-shaped
-- update off-series is rejected (D-08, transactions_skipped_needs_series).
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name)
values ('b0000000-0000-0000-0000-000000000000', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -999, 'USD', current_date, 'UTC', 'Coffee');

-- 1. A creates a monthly series anchored on the first of this month ->
-- applied, exactly 2 pending rows (this month and next), none past the
-- materialisation horizon (D-02, D-03).
select extensions.is(
  (public.create_recurring_series(jsonb_build_object(
    'id', 'c1111111-1111-1111-1111-111111111111',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Rent', 'amount', -100000, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
  )) ->> 'status'),
  'applied',
  'A creates a monthly series -> applied'
);

select extensions.is(
  (select count(*) from public.transactions where recurring_series_id = 'c1111111-1111-1111-1111-111111111111')::int,
  2,
  'exactly 2 pending rows materialised (this month and next)'
);

select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c1111111-1111-1111-1111-111111111111'
      and occurrence_date > public.recurring_horizon(current_date))::int,
  0,
  'no occurrence exceeds the materialisation horizon (D-03)'
);

-- 2. Calling create again with the same id is replay-safe (already-applied)
-- and creates no extra rows.
select extensions.is(
  (public.create_recurring_series(jsonb_build_object(
    'id', 'c1111111-1111-1111-1111-111111111111',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Rent', 'amount', -100000, 'currency', 'USD', 'freq', 'monthly',
    'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
  )) ->> 'status'),
  'already-applied',
  'creating the same series id again replays as already-applied'
);
select extensions.is(
  (select count(*) from public.transactions where recurring_series_id = 'c1111111-1111-1111-1111-111111111111')::int,
  2,
  'still exactly 2 rows after the replay'
);

reset role;

-- 3. materialise_series() is idempotent: a second call (as the superuser
-- test role, which bypasses the service_role-only grant) inserts nothing.
select extensions.is(
  (select count(*) from public.materialise_series('c1111111-1111-1111-1111-111111111111'::uuid))::int,
  0,
  'materialise_series is idempotent (no new rows on a second call)'
);

-- 4. Materialisation bookkeeping never bumps the series' version.
select extensions.is(
  (select version from public.recurring_series where id = 'c1111111-1111-1111-1111-111111111111')::int,
  1,
  'materialisation bookkeeping does not bump the series version'
);

-- 5. B (a separate household) sees none of A's series, and cannot create a
-- series in A's household (T-02-08-01).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select extensions.is(
  (select count(*) from public.recurring_series)::int,
  0,
  'B sees 0 series rows (RLS isolation)'
);

select extensions.throws_ok(
  $$select public.create_recurring_series(jsonb_build_object(
      'id', gen_random_uuid(),
      'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'account_id', 'a1111111-1111-1111-1111-111111111111',
      'name', 'Evil', 'amount', -100, 'currency', 'USD', 'freq', 'monthly',
      'anchor_date', current_date, 'time_zone', 'UTC'
    ))$$,
  '42501', null,
  'B cannot create a series in household A'
);
reset role;

-- ---------------------------------------------------------------------
-- Series 2: skip (D-08) and soft-delete-is-never-recreated (D-08, Pitfall 3).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select public.create_recurring_series(jsonb_build_object(
  'id', 'c2222222-2222-2222-2222-222222222222',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Gym', 'amount', -5000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));

-- 6. A marks the earliest occurrence of series 2 skipped -> OK; skipping a
-- non-series transaction violates transactions_skipped_needs_series (D-08).
select extensions.lives_ok(
  $$update public.transactions set status = 'skipped'
     where recurring_series_id = 'c2222222-2222-2222-2222-222222222222'
       and occurrence_date = (select min(occurrence_date) from public.transactions where recurring_series_id = 'c2222222-2222-2222-2222-222222222222')$$,
  'A marks the earliest occurrence of series 2 skipped'
);
select extensions.throws_ok(
  $$update public.transactions set status = 'skipped' where id = 'b0000000-0000-0000-0000-000000000000'$$,
  '23514', null,
  'skipping a non-series transaction violates transactions_skipped_needs_series'
);

-- 7. A soft-deletes the remaining (next month) occurrence; a further
-- materialise_series() call creates no new rows for that date (D-08:
-- neither a skipped nor a soft-deleted occurrence is ever recreated).
update public.transactions set deleted_at = now()
 where recurring_series_id = 'c2222222-2222-2222-2222-222222222222'
   and occurrence_date = (select max(occurrence_date) from public.transactions where recurring_series_id = 'c2222222-2222-2222-2222-222222222222');
reset role;

select extensions.is(
  (select count(*) from public.materialise_series('c2222222-2222-2222-2222-222222222222'::uuid))::int,
  0,
  'materialise_series does not recreate a skipped or soft-deleted occurrence'
);

-- ---------------------------------------------------------------------
-- Series 3: edit_recurring_series_from -- conflict, then "this and future"
-- never rewrites a paid row (D-07, Pitfall 2).
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select public.create_recurring_series(jsonb_build_object(
  'id', 'c3333333-3333-3333-3333-333333333333',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Streaming', 'amount', -1000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));

-- 8. A wrong expected_version returns conflict, naming A as the last editor
-- (create_recurring_series stamps updated_by at creation, same as created_by).
select extensions.is(
  (public.edit_recurring_series_from(
    'c3333333-3333-3333-3333-333333333333'::uuid, 99, '{"amount": -2000}'::jsonb,
    (date_trunc('month', current_date) + interval '1 month')::date
  ) ->> 'status'),
  'conflict',
  'a wrong expected_version returns conflict'
);
select extensions.is(
  ((public.edit_recurring_series_from(
    'c3333333-3333-3333-3333-333333333333'::uuid, 99, '{"amount": -2000}'::jsonb,
    (date_trunc('month', current_date) + interval '1 month')::date
  ) -> 'conflict' ->> 'updated_by')::uuid),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the conflict names A as the last editor'
);

-- 9. Mark this month's occurrence paid; "this and future" from next month's
-- first day changes the template amount and regenerates only the pending
-- (next month's) occurrence -- the paid row is never rewritten.
update public.transactions set status = 'paid'
 where recurring_series_id = 'c3333333-3333-3333-3333-333333333333'
   and occurrence_date = date_trunc('month', current_date)::date;

select extensions.is(
  (public.edit_recurring_series_from(
    'c3333333-3333-3333-3333-333333333333'::uuid, 1, '{"amount": -1500}'::jsonb,
    (date_trunc('month', current_date) + interval '1 month')::date
  ) ->> 'status'),
  'applied',
  'a correct expected_version applies the this-and-future edit'
);
select extensions.is(
  (select version from public.recurring_series where id = 'c3333333-3333-3333-3333-333333333333')::int,
  2,
  'the template edit bumps the series version exactly once'
);
select extensions.is(
  (select original_amount from public.transactions
    where recurring_series_id = 'c3333333-3333-3333-3333-333333333333'
      and occurrence_date = date_trunc('month', current_date)::date
      and status = 'paid'),
  (-1000)::bigint,
  'the paid row''s amount is never rewritten by a this-and-future edit'
);
select extensions.is(
  (select original_amount from public.transactions
    where recurring_series_id = 'c3333333-3333-3333-3333-333333333333'
      and occurrence_date = (date_trunc('month', current_date) + interval '1 month')::date
      and status = 'pending'
      and deleted_at is null),
  (-1500)::bigint,
  'the regenerated pending occurrence carries the new amount'
);

-- ---------------------------------------------------------------------
-- Series 4: end_recurring_series (D-08).
-- ---------------------------------------------------------------------
select public.create_recurring_series(jsonb_build_object(
  'id', 'c4444444-4444-4444-4444-444444444444',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Storage unit', 'amount', -2500, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));
update public.transactions set status = 'paid'
 where recurring_series_id = 'c4444444-4444-4444-4444-444444444444'
   and occurrence_date = date_trunc('month', current_date)::date;

-- 10. Ending the series after this month's last day soft-deletes the
-- pending (next month) row, leaves the paid row untouched, and reports
-- before.end_date as null.
select extensions.is(
  ((public.end_recurring_series(
    'c4444444-4444-4444-4444-444444444444'::uuid, 1,
    (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date
  ) -> 'series' -> 'before' ->> 'end_date')),
  null,
  'end_recurring_series reports before.end_date as null (the series had never been ended)'
);
select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c4444444-4444-4444-4444-444444444444'
      and status = 'pending' and deleted_at is not null)::int,
  1,
  'the pending occurrence after the end date is soft-deleted'
);
select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c4444444-4444-4444-4444-444444444444'
      and status = 'paid' and deleted_at is null)::int,
  1,
  'the paid occurrence is untouched by ending the series'
);

-- ---------------------------------------------------------------------
-- 11. An existing transaction becomes the first occurrence of a new series
-- (D-09, D-21); no second row exists for its date.
-- ---------------------------------------------------------------------
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, name, status)
values ('b5555555-5555-5555-5555-555555555555', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a1111111-1111-1111-1111-111111111111', -3000, 'USD', current_date, 'UTC', 'Storage anchor', 'paid');

select public.create_recurring_series(
  jsonb_build_object(
    'id', 'c6666666-6666-6666-6666-666666666666',
    'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
    'account_id', 'a1111111-1111-1111-1111-111111111111',
    'name', 'Storage anchor', 'amount', -3000, 'currency', 'USD', 'freq', 'monthly', 'time_zone', 'UTC'
  ),
  'b5555555-5555-5555-5555-555555555555'::uuid
);

select extensions.is(
  (select recurring_series_id from public.transactions where id = 'b5555555-5555-5555-5555-555555555555'),
  'c6666666-6666-6666-6666-666666666666'::uuid,
  'the anchor transaction is now linked to the new series'
);
select extensions.is(
  (select occurrence_date from public.transactions where id = 'b5555555-5555-5555-5555-555555555555'),
  current_date,
  'the anchor transaction''s occurrence_date is its own local_date'
);
select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c6666666-6666-6666-6666-666666666666' and occurrence_date = current_date)::int,
  1,
  'no second row exists for the anchor''s occurrence date'
);
reset role;

-- ---------------------------------------------------------------------
-- 12/13. materialise_recurring() is service_role-only; the daily cron job
-- is scheduled.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.throws_ok(
  $$select public.materialise_recurring()$$,
  '42501', null,
  'authenticated cannot call materialise_recurring'
);
reset role;

set local role service_role;
select extensions.lives_ok(
  $$select public.materialise_recurring()$$,
  'service_role can call materialise_recurring'
);
reset role;

select extensions.is(
  (select count(*) from cron.job where jobname = 'recurring-materialise-daily')::int,
  1,
  'recurring-materialise-daily cron job is scheduled'
);

-- ---------------------------------------------------------------------
-- 14. D-WR-01: one failing series never aborts the daily run for everyone
-- else, and a series whose author has gone (created_by null) still
-- materialises, attributed to the household owner.
-- ---------------------------------------------------------------------
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone)
values
  ('c7777777-7777-7777-7777-777777777777', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Healthy', -100, 'USD', 'monthly',
   date_trunc('month', current_date)::date, 'UTC'),
  ('c8888888-8888-8888-8888-888888888888', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   null, 'a1111111-1111-1111-1111-111111111111', 'Orphaned author', -200, 'EUR', 'monthly',
   date_trunc('month', current_date)::date, 'UTC'),
  ('c9999999-9999-9999-9999-999999999999', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
   '11111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Poisoned', -300, 'USD', 'monthly',
   date_trunc('month', current_date)::date, 'UTC');

-- Poison one series with a time zone no row can ever be written with
-- (bypassing the guard the way a tzdata upgrade dropping a zone would).
set local session_replication_role = replica;
update public.recurring_series set time_zone = 'Mars/Olympus_Mons' where id = 'c9999999-9999-9999-9999-999999999999';
set local session_replication_role = origin;

set local role service_role;
select extensions.lives_ok(
  $$select public.materialise_recurring()$$,
  'materialise_recurring survives one failing series'
);
reset role;

select extensions.is(
  (select count(*) from public.transactions where recurring_series_id = 'c7777777-7777-7777-7777-777777777777')::int,
  2,
  'the healthy series still materialised in the same run'
);
select extensions.is(
  (select count(*) from public.transactions
    where recurring_series_id = 'c8888888-8888-8888-8888-888888888888'
      and created_by = '11111111-1111-1111-1111-111111111111')::int,
  2,
  'a series with no author materialises, attributed to the household owner'
);

-- ---------------------------------------------------------------------
-- 15. D-WR-05: moving the anchor (a freq change, or an explicit
-- anchor_date) carries over only the occurrences the old schedule had not
-- yet reached, instead of restarting occurrence_count from zero.
-- A 12-instalment monthly series that started 6 months ago has used 7
-- instalments (n = 0..6, this month included) before next month.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select public.create_recurring_series(jsonb_build_object(
  'id', 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Loan', 'amount', -25000, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', (date_trunc('month', current_date) - interval '6 months')::date, 'time_zone', 'UTC',
  'occurrence_count', 12
));
create temp table wr05 as select public.edit_recurring_series_from(
  'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 1, '{"freq": "fortnightly"}'::jsonb,
  (date_trunc('month', current_date) + interval '1 month')::date
) as r;

select extensions.is(
  (select occurrence_count from public.recurring_series where id = 'caaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  5,
  'a freq change carries over the 5 remaining instalments, not a fresh 12'
);
select extensions.is(
  (select r -> 'series' -> 'before' -> 'occurrence_count' from wr05),
  '12'::jsonb,
  'the change set''s before carries the old occurrence_count, so undo restores it'
);
-- ---------------------------------------------------------------------
-- 16. D-WR-09: a null end date / effective date is invalid, never a silent
-- "remove the end date" or a no-op that still bumps the version; an
-- effective date far in the past is rejected; one before the anchor is
-- clamped to the anchor.
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select public.create_recurring_series(jsonb_build_object(
  'id', 'cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'household_id', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'account_id', 'a1111111-1111-1111-1111-111111111111',
  'name', 'Dates', 'amount', -100, 'currency', 'USD', 'freq', 'monthly',
  'anchor_date', date_trunc('month', current_date)::date, 'time_zone', 'UTC'
));

select extensions.throws_ok(
  $$select public.end_recurring_series('cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, null)$$,
  '22023', null,
  'end_recurring_series with a null end date is rejected'
);
select extensions.throws_ok(
  $$select public.edit_recurring_series_from('cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, '{"amount": -200}'::jsonb, null)$$,
  '22023', null,
  'edit_recurring_series_from with a null effective date is rejected'
);
select extensions.throws_ok(
  $$select public.edit_recurring_series_from('cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, '{"amount": -200}'::jsonb, (current_date - interval '3 years')::date)$$,
  '22023', null,
  'an effective date years in the past is rejected (it would resurrect every deleted occurrence since)'
);
select extensions.is(
  (public.edit_recurring_series_from(
    'cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 1, '{"freq": "weekly"}'::jsonb,
    (date_trunc('month', current_date) - interval '5 days')::date
  ) ->> 'status'),
  'applied',
  'an effective date shortly before the anchor still applies'
);
select extensions.is(
  (select anchor_date from public.recurring_series where id = 'cbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  date_trunc('month', current_date)::date,
  'it is clamped to the anchor: a re-anchor never moves the series earlier than it began'
);
reset role;

-- ---------------------------------------------------------------------
-- 17. D-IN-04: the two pure schedule functions are not executable by anon
-- (consistent with every other function in this wave).
-- ---------------------------------------------------------------------
select extensions.ok(
  not has_function_privilege('anon', 'public.recurring_occurrence_date(date, text, integer)', 'execute'),
  'anon cannot execute recurring_occurrence_date'
);
select extensions.ok(
  not has_function_privilege('anon', 'public.recurring_horizon(date)', 'execute'),
  'anon cannot execute recurring_horizon'
);

reset role;

select * from extensions.finish();
rollback;
