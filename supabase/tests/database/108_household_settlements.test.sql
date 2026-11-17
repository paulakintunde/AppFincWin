-- pgTAP: Phase 8 plan 08-11 (HH-07, HH-08; D-19..D-25, D-42). The settle-up state machine: propose, confirm, not yet, cancel,
-- lapse (day 7 reminder, day 14 lapse, with and without the sweep job), undo within 24 hours, receiver-recorded payment,
-- nudge, write-off, locked lines, settlement records that move balances, and pair-only privacy.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(73);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 3) n;

create temp table ids as select (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h;
grant select on ids to authenticated;
create temp table res (k text primary key, j jsonb);
grant all on res to authenticated;

create function public.t108_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t108_ver(p uuid) returns int language sql as $$ select version from public.transactions where id = p $$;
create function public.t108_id(k text) returns uuid language sql as $$ select (j ->> 'settlement_id')::uuid from res where k = $1 $$;
-- Reads any value with the table owner's rights (a test helper inside a rolled-back transaction).
create function public.t108_val(q text) returns text language plpgsql security definer as $$
declare v text;
begin execute q into v; return v; end;
$$;

-- A, B, C in one household reporting in USD.
update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 50, now() - interval '2 days'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 0, now() - interval '1 day');
update public.household_members set weight = 50 where user_id = '11111111-1111-1111-1111-111111111111';
update public.households set reporting_currency = 'USD' where id = (select h from ids);

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, current_date, 'frankfurter-v2'),
  ('EUR', 'GBP', 0.85, current_date, 'frankfurter-v2');

-- Accounts: A personal AA, B personal BA (USD) and BG (GBP), C personal CA.
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('b2000000-0000-0000-0000-00000000000a', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B personal', 'checking', 'USD', 0, false),
  ('b2000000-0000-0000-0000-00000000000b', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B pounds', 'checking', 'GBP', 0, false),
  ('c3000000-0000-0000-0000-00000000000a', (select h from ids), '33333333-3333-3333-3333-333333333333', 'C personal', 'checking', 'USD', 0, false);

-- Lines, all paid by A from AA. l1 8400 and l2 3000 are the plan's pair; l3 .. l7 are 2000 each (B owes 1000 on each).
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -8400, 'USD', current_date, 'UTC', 'L1', 'paid'),
  ('d1000000-0000-0000-0000-000000000002', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -3000, 'USD', current_date, 'UTC', 'L2', 'paid'),
  ('d1000000-0000-0000-0000-000000000003', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L3 write off', 'paid'),
  ('d1000000-0000-0000-0000-000000000004', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L4 reminder', 'paid'),
  ('d1000000-0000-0000-0000-000000000005', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L5 received', 'paid'),
  ('d1000000-0000-0000-0000-000000000006', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L6 personal', 'paid'),
  ('d1000000-0000-0000-0000-000000000007', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L7 private', 'paid');

set local role authenticated;
select public.t108_as('11111111-1111-1111-1111-111111111111');
select public.share_transaction(('d1000000-0000-0000-0000-00000000000' || n)::uuid, public.t108_ver(('d1000000-0000-0000-0000-00000000000' || n)::uuid), 'even',
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[])
  from generate_series(1, 5) n;

-- 1-4. Proposing: the server recomputes the amount from the ticked lines.
select public.t108_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 5000) ->> 'reason', 'lines_changed', 'a wrong expected amount is refused as lines_changed');
select extensions.is((public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 5000) ->> 'server_amount')::bigint, 5700::bigint, 'the refusal carries the server amount, 4200 + 1500');
select extensions.is(public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000006']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 1000) ->> 'reason', 'lines_changed', 'an unshared line cannot be ticked');
select extensions.is(public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000001']::uuid[],
  'c3000000-0000-0000-0000-00000000000a', 4200) ->> 'reason', 'account_not_yours', 'the payer account must be the payer''s own');
insert into res select 'S1', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000002']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 5700);
select extensions.is((select j ->> 'ok' from res where k = 'S1'), 'true', 'B proposes a settle-up of both lines');
select extensions.is(public.t108_val('select status || amount::text from public.settlements where id = ''' || public.t108_id('S1') || ''''), 'pending5700', 'it is pending at 5700 in household currency');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settle_request'' and ref_id = ''' || public.t108_id('S1') || ''' and audience = array[''11111111-1111-1111-1111-111111111111''::uuid]'), '1', 'a settle_request notice goes to A only');

-- 8-9. Locks while pending.
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.set_line_split('d1000000-0000-0000-0000-000000000001', public.t108_ver('d1000000-0000-0000-0000-000000000001'), 'even', null) ->> 'reason',
  'line_locked', 'a line in a pending settle-up cannot be re-split');
select extensions.is(public.make_line_private('d1000000-0000-0000-0000-000000000001', public.t108_ver('d1000000-0000-0000-0000-000000000001')) ->> 'reason',
  'line_locked', 'a line in a pending settle-up cannot be made private');
select extensions.throws_ok($$update public.transactions set original_amount = -9000 where id = 'd1000000-0000-0000-0000-000000000001'$$, '23514', 'line_locked',
  'even the creator cannot change a locked line''s amount');
select extensions.throws_ok($$update public.transactions set deleted_at = now() where id = 'd1000000-0000-0000-0000-000000000001'$$, '23514', 'line_locked',
  'even the creator cannot delete a locked line');
select extensions.is((select count(*)::int from public.settlements), 1, 'A, the other party, sees the settle-up');

-- 12-14. A third member sees nothing and is refused like a missing id.
select public.t108_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select count(*)::int from public.settlements) + (select count(*)::int from public.settlement_lines), 0, 'C sees no settlement and no settlement line');
select extensions.is(public.confirm_settlement(public.t108_id('S1'), 'c3000000-0000-0000-0000-00000000000a'),
  public.confirm_settlement('ffffffff-ffff-ffff-ffff-ffffffffffff', 'c3000000-0000-0000-0000-00000000000a'), 'C confirming is refused exactly like a missing id');
select extensions.is(public.cancel_settlement(public.t108_id('S1')), public.cancel_settlement('ffffffff-ffff-ffff-ffff-ffffffffffff'), 'C cancelling is refused exactly like a missing id');

-- 15-16. Only the receiver confirms; only the payer cancels.
select public.t108_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.confirm_settlement(public.t108_id('S1'), 'b2000000-0000-0000-0000-00000000000a') ->> 'reason', 'not_receiver', 'the payer cannot confirm their own settle-up');
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.cancel_settlement(public.t108_id('S1')) ->> 'reason', 'not_payer', 'the receiver cannot cancel it');

-- 17-19. The payer cancels; lines unlock; B proposes only l1 (4200) after.
select public.t108_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.cancel_settlement(public.t108_id('S1')) ->> 'ok', 'true', 'the payer cancels a pending settle-up');
select extensions.is(public.t108_val('select status from public.settlements where id = ''' || public.t108_id('S1') || ''''), 'cancelled', 'status is cancelled');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settle_cancelled'' and audience = array[''11111111-1111-1111-1111-111111111111''::uuid]'), '1', 'the receiver is told it was cancelled');
insert into res select 'S2', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000001']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 4200);
select extensions.is((select j ->> 'ok' from res where k = 'S2'), 'true', 'only l1: 4200 is accepted once the first is cancelled');

-- 21-27. A confirms: two records, both is_settlement, on the chosen accounts; balances move; lines stay locked.
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.confirm_settlement(public.t108_id('S2'), 'a1000000-0000-0000-0000-00000000000a') ->> 'ok', 'true', 'the receiver confirms with Got it');
select extensions.is(public.t108_val('select status from public.settlements where id = ''' || public.t108_id('S2') || ''''), 'confirmed', 'status is confirmed');
select extensions.is((select original_amount from public.transactions_active where settlement_id = public.t108_id('S2') and account_id = 'a1000000-0000-0000-0000-00000000000a'),
  4200::bigint, 'the receiver record is +4200 on A''s account');
select extensions.is((select count(*)::int from public.transactions_active where settlement_id = public.t108_id('S2')), 1, 'A sees only their own record (B''s record is personal to B)');
select extensions.is(public.t108_val('select count(*)::text from public.transactions where settlement_id = ''' || public.t108_id('S2') || ''' and is_settlement and not is_shared and status = ''paid'''), '2', 'both records are is_settlement, not shared, paid');
select extensions.is(public.t108_val('select original_amount::text from public.transactions where id = (select payer_tx_id from public.settlements where id = ''' || public.t108_id('S2') || ''')'), '-4200', 'the payer record is -4200');
select extensions.is(public.t108_val('select account_id::text from public.transactions where id = (select payer_tx_id from public.settlements where id = ''' || public.t108_id('S2') || ''')'), 'b2000000-0000-0000-0000-00000000000a', 'on the payer''s account');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settled'' and ref_id = ''' || public.t108_id('S2') || ''' and cardinality(audience) = 2'), '1', 'both people are told it settled');
select extensions.throws_ok($$update public.transactions set original_amount = -1 where id = 'd1000000-0000-0000-0000-000000000001'$$, '23514', 'line_locked', 'a confirmed line stays locked');
select extensions.throws_ok($$update public.transactions set deleted_at = now() where settlement_id is not null$$, '23514', 'settlement_record_locked', 'a settlement record cannot be edited or deleted by hand');
select extensions.is(public.confirm_settlement(public.t108_id('S2'), 'a1000000-0000-0000-0000-00000000000a') ->> 'reason', 'not_pending', 'a settle-up cannot be confirmed twice');

-- 31-35. Another currency: B pays l2 from the pounds account; the rate is stored and the record is converted.
select public.t108_as('22222222-2222-2222-2222-222222222222');
insert into res select 'S3', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000002']::uuid[],
  'b2000000-0000-0000-0000-00000000000b', 1500);
select extensions.is((select j ->> 'ok' from res where k = 'S3'), 'true', 'B proposes l2 paying from the pounds account');
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.confirm_settlement(public.t108_id('S3'), 'a1000000-0000-0000-0000-00000000000a') ->> 'ok', 'true', 'A confirms the pounds settle-up');
select extensions.is(public.t108_val('select original_amount::text || original_currency from public.transactions where id = (select payer_tx_id from public.settlements where id = ''' || public.t108_id('S3') || ''')'),
  '-' || public.convert_minor(1500, 1.1483, 2, 0.85, 2)::text || 'GBP', 'the payer record is 1500 USD converted to pounds at the stored rate');
select extensions.is(public.t108_val('select (payer_fx_rate is not null and receiver_fx_rate = 1)::text from public.settlements where id = ''' || public.t108_id('S3') || ''''), 'true', 'both rates are stored on the settlement');
select extensions.is(public.t108_val('select count(*)::text from public.transactions where settlement_id = ''' || public.t108_id('S3') || ''' and home_amount is not null'), '2', 'both records are home-stamped like any line');

-- 36-39. Undo: either person within 24 hours; both records go; lines unlock. After 24 hours it is final.
select public.t108_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.undo_settlement(public.t108_id('S3')) ->> 'ok', 'true', 'the payer undoes a confirmed settle-up');
select extensions.is(public.t108_val('select count(*)::text from public.transactions where settlement_id = ''' || public.t108_id('S3') || ''' and deleted_at is not null'), '2', 'both records are removed');
select extensions.is(public.t108_val('select count(*)::text from public.settlement_lines where settlement_id = ''' || public.t108_id('S3') || ''' and live'), '0', 'its lines are free again');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settle_undone'' and cardinality(audience) = 2'), '1', 'both people are told');
reset role;
update public.settlements set confirmed_at = now() - interval '25 hours' where id = public.t108_id('S2');
set local role authenticated;
select extensions.is(public.undo_settlement(public.t108_id('S2')) ->> 'reason', 'undo_window_closed', 'after 24 hours a confirmed settle-up is final');

-- 41-43. Not yet: the receiver turns it down; lines unlock; the payer is told.
insert into res select 'S4', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000002']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 1500);
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.reject_settlement(public.t108_id('S4')) ->> 'ok', 'true', 'the receiver answers Not yet');
select extensions.is(public.t108_val('select status from public.settlements where id = ''' || public.t108_id('S4') || ''''), 'rejected', 'status is rejected');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settle_not_yet'' and audience = array[''22222222-2222-2222-2222-222222222222''::uuid]'), '1', 'the payer is told: settle_not_yet, audience B');
select extensions.is(public.t108_val('select public.hh_line_locked(''d1000000-0000-0000-0000-000000000002'')::text'), 'false', 'l2 is free again');

-- 45-52. Lapse. S5 expires unresolved on day 14: unlocked at once (lazy), Got it after that settles nothing, both are told once,
-- and the sweep running twice adds nothing.
select public.t108_as('22222222-2222-2222-2222-222222222222');
insert into res select 'S5', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000002']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 1500);
select extensions.is(public.t108_val('select public.hh_line_locked(''d1000000-0000-0000-0000-000000000002'')::text'), 'true', 'pending: l2 is locked');
select extensions.is(public.t108_val('select ((expires_at - created_at) = interval ''14 days'' and (remind_at - created_at) = interval ''7 days'')::text from public.settlements where id = ''' || public.t108_id('S5') || ''''), 'true', 'reminder at day 7, lapse at day 14');
reset role;
update public.settlements set created_at = now() - interval '15 days', remind_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = public.t108_id('S5');
set local role authenticated;
select extensions.is(public.t108_val('select public.hh_line_locked(''d1000000-0000-0000-0000-000000000002'')::text'), 'false', 'expired and the sweep has not run: l2 is already unlocked (lazy)');
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.confirm_settlement(public.t108_id('S5'), 'a1000000-0000-0000-0000-00000000000a') ->> 'reason', 'lapsed', 'Got it after day 14 answers lapsed');
select extensions.is(public.t108_val('select status from public.settlements where id = ''' || public.t108_id('S5') || ''''), 'lapsed', 'the settle-up is lapsed');
select extensions.is(public.t108_val('select count(*)::text from public.transactions where settlement_id = ''' || public.t108_id('S5') || ''''), '0', 'nothing settled: no record was written');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settle_lapsed'' and ref_id = ''' || public.t108_id('S5') || ''' and cardinality(audience) = 2'), '1', 'both people are told, once, without the sweep');
-- a pending one with a due reminder
select public.t108_as('22222222-2222-2222-2222-222222222222');
insert into res select 'S6', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000004']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 1000);
reset role;
update public.settlements set created_at = now() - interval '8 days', remind_at = now() - interval '1 hour', expires_at = now() + interval '6 days' where id = public.t108_id('S6');
set local role service_role;
select public.hh_settlement_sweep();
select public.hh_settlement_sweep();
reset role;
select extensions.is((select count(*)::int from public.household_events where kind = 'settle_reminder' and ref_id = public.t108_id('S6') and audience = array['11111111-1111-1111-1111-111111111111'::uuid]),
  1, 'the sweep sends one reminder to the receiver, even run twice');
select extensions.is((select count(*)::int from public.household_events where kind = 'settle_lapsed' and ref_id = public.t108_id('S5')), 1, 'and still exactly one lapse notice for S5');
-- a lapse found only by the sweep
set local role authenticated;
select public.t108_as('22222222-2222-2222-2222-222222222222');
insert into res select 'S7', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000004']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 1000);
select extensions.is((select j ->> 'reason' from res where k = 'S7'), 'lines_changed', 'l4 is still held by S6 (pending, not expired)');
reset role;
update public.settlements set created_at = now() - interval '16 days', remind_at = now() - interval '9 days', expires_at = now() - interval '2 days' where id = public.t108_id('S6');
set local role service_role;
select public.hh_settlement_sweep();
select public.hh_settlement_sweep();
reset role;
select extensions.is(public.t108_val('select status from public.settlements where id = ''' || public.t108_id('S6') || ''''), 'lapsed', 'the sweep lapses an expired pending settle-up');
select extensions.is((select count(*)::int from public.household_events where kind = 'settle_lapsed' and ref_id = public.t108_id('S6')), 1, 'exactly one lapse notice from two sweeps');
select extensions.is(public.t108_val('select count(*)::text from public.settlement_lines where settlement_id = ''' || public.t108_id('S6') || ''' and live'), '0', 'its lines are unlocked');
set local role authenticated;

-- 62-65. The receiver records a payment: settles at once, payer chooses an account later, once.
select public.t108_as('11111111-1111-1111-1111-111111111111');
insert into res select 'R1', public.record_received('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000005']::uuid[],
  'a1000000-0000-0000-0000-00000000000a', 1000);
select extensions.is(public.t108_val('select status || (payer_tx_id is null)::text || (receiver_tx_id is not null)::text from public.settlements where id = ''' || public.t108_id('R1') || ''''), 'confirmedtruetrue', 'record_received settles at once with only the receiver record');
select extensions.is(public.t108_val('select count(*)::text from public.household_events where kind = ''settled'' and ref_id = ''' || public.t108_id('R1') || ''' and params @> ''{"needs_account": true}'''), '1', 'the payer is told, with needs_account');
select public.t108_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.set_settlement_payer_account(public.t108_id('R1'), 'b2000000-0000-0000-0000-00000000000a') ->> 'ok', 'true', 'the payer picks the account later');
select extensions.is(public.t108_val('select original_amount::text from public.transactions where id = (select payer_tx_id from public.settlements where id = ''' || public.t108_id('R1') || ''')'), '-1000', 'and the payer record is written');
select extensions.is(public.set_settlement_payer_account(public.t108_id('R1'), 'b2000000-0000-0000-0000-00000000000a') ->> 'reason', 'already_set', 'a second call is refused');

-- Nudge: once per 24 hours.
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.ask_to_settle('22222222-2222-2222-2222-222222222222') ->> 'ok', 'true', 'the receiver nudges once');
select extensions.is(public.ask_to_settle('22222222-2222-2222-2222-222222222222') ->> 'reason', 'too_soon', 'a second nudge within 24 hours is too_soon');

-- Write-off: only after the person has left.
select extensions.is(public.write_off_balance('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000003']::uuid[]) ->> 'reason', 'member_still_here', 'a current member cannot be written off');
reset role;
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
set local role authenticated;
select public.t108_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.write_off_balance('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000003']::uuid[]) ->> 'ok', 'true', 'A writes off what B (who left) owed');
select extensions.is(public.t108_val('select status || amount::text || kind from public.settlements where created_by = ''11111111-1111-1111-1111-111111111111'' and kind = ''write_off'''), 'written_off1000write_off', 'a write-off of 1000');
select extensions.is(public.t108_val('select count(*)::text from public.transactions where settlement_id in (select id from public.settlements where kind = ''write_off'')'), '0', 'a write-off moves no money');
select extensions.is(public.t108_val('select public.hh_line_locked(''d1000000-0000-0000-0000-000000000003'')::text'), 'true', 'a written-off line stays out of balances');

-- The sweep is not callable by a client.
select extensions.is(has_function_privilege('authenticated', 'public.hh_settlement_sweep()', 'execute'), false, 'a client cannot run the sweep');
select extensions.is(has_function_privilege('anon', 'public.propose_settlement(uuid,uuid[],uuid,bigint)', 'execute'), false, 'anon cannot propose');

select * from extensions.finish();
rollback;
