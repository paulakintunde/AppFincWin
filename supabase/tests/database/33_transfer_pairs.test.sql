-- pgTAP: D-50/D-51 proof for the transfer pair constraint trigger
-- (transfer_pair_check / check_transfer_pair()).
--
-- Proves a transfer is exactly two active rows sharing a transfer_id, on
-- different accounts, with opposite signs, in one household; that a lone
-- leg, a third leg, same-account legs, same-sign legs and a cross-household
-- pair are all rejected at commit with 23514; that the deferred-check
-- linking path (two separate statements, then an explicit
-- `set constraints ... immediate`) works; that soft-deleting both legs
-- together is accepted while soft-deleting one alone is rejected; that
-- clearing transfer_id on both legs is accepted; that each leg of a
-- cross-currency pair keeps its own independent FX stamp; and that the
-- pair is still ordinary household-scoped RLS data (B cannot see A's legs).

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(18);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"full_name":"Alice Test"}', now(), now()),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{}', now(), now());

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'GBP', 0.86,   '2026-09-21', 'frankfurter-v2'),
  ('EUR', 'USD', 1.1483, '2026-09-21', 'frankfurter-v2');

-- Each user's household id, captured as postgres before impersonating
-- (mirrors 05_accounts_transactions.test.sql's `hh` fixture).
create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;

-- Every statement in this file is checked at its own end, except the one
-- explicit deferral scenario below, which switches back to deferred mode
-- for two statements and then switches to immediate again (RESEARCH
-- §A5.3 -- a deferred constraint trigger fires at commit, never mid-
-- statement, so a two-row INSERT or a two-row UPDATE is checked with both
-- rows visible).
set constraints public.transfer_pair_check immediate;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('aaaaaaa1-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A GBP', 'checking', 'GBP', 0),
  ('aaaaaaa2-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'A EUR', 'checking', 'EUR', 0);

-- 1. A two-row insert with the same transfer_id, on two different accounts,
-- opposite signs, in one household -> lives_ok (D-50: the entry-sheet path
-- is one insertTransactionsBatch call, one statement).
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
      ('c0000001-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -5000, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000001-0000-0000-0000-000000000001'),
      ('c0000002-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa2-1111-1111-1111-111111111111', 5800,  'EUR', '2026-09-22', 'America/Vancouver', 'd0000001-0000-0000-0000-000000000001')$$,
  'a two-row insert sharing one transfer_id, opposite signs, different accounts, one household -> lives_ok'
);

-- 8. Each leg of the cross-currency pair carries its own independent FX
-- stamp (Phase 1 D-16, this plan's D-50): both home figures are non-null
-- and resolved (rate_pending false), since the fx_rates fixture above
-- gives both GBP and EUR (via EUR base) an exact rate for this date.
select extensions.ok(
  (select home_amount is not null from public.transactions where id = 'c0000001-1111-1111-1111-111111111111'),
  'GBP leg has a non-null home_amount (own FX stamp)'
);
select extensions.ok(
  (select home_amount is not null from public.transactions where id = 'c0000002-1111-1111-1111-111111111111'),
  'EUR leg has a non-null home_amount (own FX stamp)'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'c0000001-1111-1111-1111-111111111111'),
  false,
  'GBP leg resolved to an exact rate, not rate_pending'
);
select extensions.is(
  (select rate_pending from public.transactions where id = 'c0000002-1111-1111-1111-111111111111'),
  false,
  'EUR leg resolved to an exact rate, not rate_pending'
);

-- 2. A single-leg insert (a fresh, unrelated transfer_id) -> throws_ok 23514.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id)
    values ('c0000003-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000002-0000-0000-0000-000000000002')$$,
  '23514', null,
  'a lone leg with a transfer_id and no partner is rejected at commit'
);

-- 3. A third row sharing the transfer_id of the pair created in (1) ->
-- throws_ok 23514 (now 3 active rows share the id).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id)
    values ('c0000004-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -25, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000001-0000-0000-0000-000000000001')$$,
  '23514', null,
  'a third leg sharing an already-complete pair''s transfer_id is rejected'
);

-- 3b. The deferral / linking path: two pre-existing, unlinked rows get
-- transfer_id set in two separate UPDATE statements while the constraint
-- is deferred, so neither statement alone ever sees a complete pair; the
-- explicit switch back to immediate is where the check actually runs, and
-- it passes because both rows are linked by then.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone) values
  ('c0000005-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -200, 'GBP', '2026-09-22', 'America/Vancouver'),
  ('c0000006-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa2-1111-1111-1111-111111111111', 230,  'EUR', '2026-09-22', 'America/Vancouver');

set constraints public.transfer_pair_check deferred;
update public.transactions set transfer_id = 'd0000003-0000-0000-0000-000000000003' where id = 'c0000005-1111-1111-1111-111111111111';
update public.transactions set transfer_id = 'd0000003-0000-0000-0000-000000000003' where id = 'c0000006-1111-1111-1111-111111111111';
select extensions.lives_ok(
  $$set constraints public.transfer_pair_check immediate$$,
  'switching back to immediate runs the deferred check, which passes now that both legs are linked (D-50 linking path)'
);

-- 4. Two legs on the same account -> 23514 (v_accounts <> 2).
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
      ('c0000007-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -300, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000004-0000-0000-0000-000000000004'),
      ('c0000008-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', 300,  'GBP', '2026-09-22', 'America/Vancouver', 'd0000004-0000-0000-0000-000000000004')$$,
  '23514', null,
  'two legs on the same account are rejected'
);

-- Same sign (both money out) on two different accounts -> 23514.
select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
      ('c0000009-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000005-0000-0000-0000-000000000005'),
      ('c000000a-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa2-1111-1111-1111-111111111111', -50,  'EUR', '2026-09-22', 'America/Vancouver', 'd0000005-0000-0000-0000-000000000005')$$,
  '23514', null,
  'two legs with the same sign are rejected'
);

reset role;

-- 5. A leg on A's account and a leg in B's household sharing a
-- transfer_id, inserted as postgres -> 23514 (v_households <> 1). The
-- trigger's own household count catches this regardless of RLS.
insert into public.accounts (id, household_id, name, kind, currency, opening_balance)
  values ('bbbbbbb1-2222-2222-2222-222222222222', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'B GBP', 'checking', 'GBP', 0);

select extensions.throws_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, created_by, transfer_id) values
      ('c000000b-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-22', 'America/Vancouver', '11111111-1111-1111-1111-111111111111', 'd0000006-0000-0000-0000-000000000006'),
      ('c000000c-1111-1111-1111-111111111111', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'bbbbbbb1-2222-2222-2222-222222222222', 100,  'GBP', '2026-09-22', 'America/Vancouver', '22222222-2222-2222-2222-222222222222', 'd0000006-0000-0000-0000-000000000006')$$,
  '23514', null,
  'a pair spanning two households is rejected even bypassing RLS'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- 6. Soft-deleting both legs of a pair in one statement -> lives_ok.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
  ('c000000d-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -400, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000007-0000-0000-0000-000000000007'),
  ('c000000e-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa2-1111-1111-1111-111111111111', 460,  'EUR', '2026-09-22', 'America/Vancouver', 'd0000007-0000-0000-0000-000000000007');

select extensions.lives_ok(
  $$update public.transactions set deleted_at = now() where transfer_id = 'd0000007-0000-0000-0000-000000000007'$$,
  'soft-deleting both legs of a pair in one statement -> lives_ok'
);

-- Soft-deleting only one leg of a (different, still-active) pair -> 23514.
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
  ('c000000f-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -500, 'GBP', '2026-09-22', 'America/Vancouver', 'd0000008-0000-0000-0000-000000000008'),
  ('c0000010-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa2-1111-1111-1111-111111111111', 575,  'EUR', '2026-09-22', 'America/Vancouver', 'd0000008-0000-0000-0000-000000000008');

select extensions.throws_ok(
  $$update public.transactions set deleted_at = now() where id = 'c000000f-1111-1111-1111-111111111111'$$,
  '23514', null,
  'soft-deleting only one leg of a pair is rejected'
);

-- 7. Clearing transfer_id on both legs of the original (1) pair -> lives_ok.
select extensions.lives_ok(
  $$update public.transactions set transfer_id = null where transfer_id = 'd0000001-0000-0000-0000-000000000001'$$,
  'clearing transfer_id on both legs of a pair in one statement -> lives_ok'
);

-- 9. User B cannot select A's legs through transactions_active (ordinary
-- household RLS, unaffected by the pair trigger).
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select extensions.is(
  (select count(*)::int from public.transactions_active where account_id in ('aaaaaaa1-1111-1111-1111-111111111111', 'aaaaaaa2-1111-1111-1111-111111111111')),
  0,
  'B cannot select any of A''s legs through transactions_active'
);
reset role;

-- 10. The trigger exists.
select extensions.has_trigger(
  'public', 'transactions', 'transfer_pair_check',
  'transfer_pair_check trigger exists on public.transactions'
);

-- 11. D-IN-01: the pair rule counts legs in the row's own household only.
-- Another household planting two valid legs with a known transfer_id
-- while A's pair is soft-deleted must not make A's restore fail.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
  ('c0000011-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa1-1111-1111-1111-111111111111', -100, 'GBP', '2026-09-22', 'UTC', 'd0000009-0000-0000-0000-000000000009'),
  ('c0000012-1111-1111-1111-111111111111', (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), 'aaaaaaa2-1111-1111-1111-111111111111', 116, 'EUR', '2026-09-22', 'UTC', 'd0000009-0000-0000-0000-000000000009');
update public.transactions set deleted_at = now() where transfer_id = 'd0000009-0000-0000-0000-000000000009';
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.accounts (id, household_id, name, kind, currency, opening_balance) values
  ('bbbbbbb2-2222-2222-2222-222222222222', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'B two', 'checking', 'GBP', 0);
select extensions.lives_ok(
  $$insert into public.transactions (id, household_id, account_id, original_amount, original_currency, local_date, time_zone, transfer_id) values
      ('c0000021-2222-2222-2222-222222222222', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'bbbbbbb1-2222-2222-2222-222222222222', -1, 'GBP', '2026-09-22', 'UTC', 'd0000009-0000-0000-0000-000000000009'),
      ('c0000022-2222-2222-2222-222222222222', (select id from hh where owner_id = '22222222-2222-2222-2222-222222222222'), 'bbbbbbb2-2222-2222-2222-222222222222', 1, 'GBP', '2026-09-22', 'UTC', 'd0000009-0000-0000-0000-000000000009')$$,
  'B can form its own valid pair (the id is just a client uuid)'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select extensions.lives_ok(
  $$update public.transactions set deleted_at = null where transfer_id = 'd0000009-0000-0000-0000-000000000009'$$,
  'A restoring its own pair is unaffected by legs in another household sharing the id'
);
reset role;

select * from extensions.finish();
rollback;
