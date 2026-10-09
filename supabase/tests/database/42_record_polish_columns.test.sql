-- pgTAP: Phase 2.2 record polish columns, the re-created transactions_active
-- view, tamper-rule grants, the edit-clears-sample trigger and the account
-- soft-delete guard (CONTEXT D-03, D-09, D-10, D-16, D-23, D-24).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(32);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now());

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- 1-12. Columns, including the re-created view.
select extensions.has_column('public', 'transactions_active', 'is_refund', 'view exposes is_refund');
select extensions.has_column('public', 'transactions_active', 'is_automatic', 'view exposes is_automatic');
select extensions.has_column('public', 'transactions_active', 'is_sample', 'view exposes is_sample');
select extensions.has_column('public', 'recurring_series', 'is_automatic', 'series has is_automatic');
select extensions.has_column('public', 'recurring_series', 'is_sample', 'series has is_sample');
select extensions.has_column('public', 'accounts', 'deleted_at', 'accounts has deleted_at');
select extensions.has_column('public', 'accounts', 'is_sample', 'accounts has is_sample');
select extensions.has_column('public', 'categories', 'monthly_cap', 'categories has monthly_cap');
select extensions.has_column('public', 'categories', 'is_sample', 'categories has is_sample');
select extensions.has_column('public', 'profiles', 'week_start', 'profiles has week_start');
select extensions.has_column('public', 'profiles', 'sample_prompt_answered_at', 'profiles has sample_prompt_answered_at');
select extensions.has_column('public', 'households', 'horizon_month', 'households has horizon_month');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select extensions.lives_ok(
  $$insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
    values ('a1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Wallet', 'cash', 'USD', 0)$$,
  'A can insert an account'
);

-- Refund shape (D-03).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, is_refund)
    values ('b1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -500, 'USD', '2026-10-01', 'America/Vancouver', true)$$,
  '23514', null, 'a negative refund violates the shape check'
);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, is_refund)
    values ('b2111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', 500, 'USD', '2026-10-01', 'America/Vancouver', true)$$,
  'a positive refund is accepted'
);
select extensions.is(
  (select is_refund from public.transactions_active where id = 'b2111111-1111-1111-1111-111111111111'),
  true, 'is_refund is readable through transactions_active'
);

-- Tamper rule: server-only columns (D-09).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, is_sample)
    values ('b3111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
      'a1111111-1111-1111-1111-111111111111', -100, 'USD', '2026-10-01', 'America/Vancouver', true)$$,
  '42501', null, 'a client insert naming is_sample is refused'
);
select extensions.throws_ok(
  $$update public.transactions set is_sample = true where id = 'b2111111-1111-1111-1111-111111111111'$$,
  '42501', null, 'a client update of is_sample is refused'
);
select extensions.throws_ok(
  $$update public.households set horizon_month = '2027-01'$$,
  '42501', null, 'a client update of horizon_month is refused'
);

-- monthly_cap (D-23).
select extensions.throws_ok(
  $$update public.categories set monthly_cap = 0 where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Housing'$$,
  '23514', null, 'monthly_cap = 0 violates the range check'
);
select extensions.lives_ok(
  $$update public.categories set monthly_cap = 50000 where owner_id = '11111111-1111-1111-1111-111111111111' and builtin_key = 'Housing'$$,
  'monthly_cap = 50000 on an own category is accepted'
);

-- week_start.
select extensions.throws_ok(
  $$update public.profiles set week_start = 2 where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'week_start = 2 violates the check'
);
select extensions.lives_ok(
  $$update public.profiles set week_start = 0 where id = '11111111-1111-1111-1111-111111111111'$$,
  'week_start = 0 is accepted'
);

-- Account soft-delete guard (D-24): a live line blocks it.
select extensions.throws_ok(
  $$update public.accounts set deleted_at = now() where id = 'a1111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'an account with a live line cannot be soft-deleted'
);
select extensions.lives_ok(
  $$update public.transactions set deleted_at = now() where id = 'b2111111-1111-1111-1111-111111111111'$$,
  'the line can be soft-deleted'
);
select extensions.lives_ok(
  $$update public.accounts set deleted_at = now() where id = 'a1111111-1111-1111-1111-111111111111'$$,
  'the now-empty account can be soft-deleted'
);

-- Everything below runs as postgres.
reset role;

select extensions.throws_ok(
  $$update public.categories set monthly_cap = 100 where is_system and builtin_key = 'Transfer' and owner_id = '11111111-1111-1111-1111-111111111111'$$,
  '23514', null, 'monthly_cap on a system category is refused'
);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
values ('a2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'Bank', 'checking', 'USD', 0);
insert into public.recurring_series (id, household_id, account_id, name, amount, currency, freq, anchor_date, time_zone)
values ('c1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'),
  'a2222222-2222-2222-2222-222222222222', 'Rent', -1000, 'USD', 'monthly', '2026-10-01', 'America/Vancouver');
select extensions.throws_ok(
  $$update public.accounts set deleted_at = now() where id = 'a2222222-2222-2222-2222-222222222222'$$,
  '23514', null, 'an account with an active series cannot be soft-deleted'
);

-- Edit-clears-sample trigger (D-10).
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, is_sample)
values
  ('d1111111-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a2222222-2222-2222-2222-222222222222', -100, 'USD', '2026-10-02', 'America/Vancouver', true),
  ('d2222222-2222-2222-2222-222222222222', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a2222222-2222-2222-2222-222222222222', -100, 'USD', '2026-10-02', 'America/Vancouver', true),
  ('d3333333-3333-3333-3333-333333333333', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'a2222222-2222-2222-2222-222222222222', -100, 'USD', '2026-10-02', 'America/Vancouver', true);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
update public.transactions set name = 'Edited' where id = 'd1111111-1111-1111-1111-111111111111';
update public.transactions set deleted_at = now() where id = 'd2222222-2222-2222-2222-222222222222';
reset role;

select extensions.is(
  (select is_sample from public.transactions where id = 'd1111111-1111-1111-1111-111111111111'),
  false, 'editing a sample row clears is_sample'
);
select extensions.is(
  (select is_sample from public.transactions where id = 'd2222222-2222-2222-2222-222222222222'),
  true, 'soft-deleting a sample row keeps is_sample'
);

select set_config('fincwin.system_restamp', 'on', true);
update public.transactions set note = 'system' where id = 'd3333333-3333-3333-3333-333333333333';
select set_config('fincwin.system_restamp', 'off', true);
select extensions.is(
  (select is_sample from public.transactions where id = 'd3333333-3333-3333-3333-333333333333'),
  true, 'a system write under fincwin.system_restamp keeps is_sample'
);

select extensions.is(
  (select count(*)::int from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name in ('clear_sample_on_edit', 'guard_account_soft_delete')
     and grantee in ('anon', 'authenticated', 'PUBLIC')),
  0, 'trigger functions are not executable by client roles'
);

select * from extensions.finish();
rollback;
