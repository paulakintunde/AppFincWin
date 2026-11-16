-- pgTAP: Phase 8 plan 08-10 (HH-04, HH-05, HH-06; D-13..D-18, D-34, D-35, D-39). Sharing a line, stored per-line splits,
-- the household-currency figure stamped once, joint accounts, shared series, category defaults, and the owner decision that
-- debt- and goal-linked lines stay personal.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(64);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select
  (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h,
  (select id from public.households where owner_id = '44444444-4444-4444-4444-444444444444') as hd;
grant select on ids to authenticated;
create function public.t107_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t107_ver(p uuid) returns int language sql as $$ select version from public.transactions where id = p $$;
create function public.t107_cat(u uuid, k text) returns uuid language sql as $$
  select id from public.categories where owner_id = u and builtin_key = k
$$;

-- B and C join A's household in order A, B, C; weights 60 / 40 / 0; the household reports in USD.
update public.household_members set created_at = now() - interval '3 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 40, now() - interval '2 days'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 0, now() - interval '1 day');
update public.household_members set weight = 60 where user_id = '11111111-1111-1111-1111-111111111111';
update public.households set reporting_currency = 'USD' where id = (select h from ids);

insert into public.fx_rates (base, quote, rate, rate_date, source) values
  ('EUR', 'USD', 1.1483, '2026-11-02', 'frankfurter-v2'),
  ('EUR', 'GBP', 0.85, '2026-11-02', 'frankfurter-v2');

-- Accounts: A personal PA, A joint JA, B personal PB.
insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('a1000000-0000-0000-0000-00000000000b', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A joint', 'checking', 'USD', 0, true),
  ('b2000000-0000-0000-0000-00000000000a', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B personal', 'checking', 'USD', 0, false),
  ('d4000000-0000-0000-0000-00000000000a', (select hd from ids), '44444444-4444-4444-4444-444444444444', 'D personal', 'checking', 'USD', 0, false);

-- Lines (all A's, on A's personal account PA, unless noted).
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, category_id) values
  ('d1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -8400, 'USD', '2026-11-02', 'UTC', 'L1 even', 'paid', null),
  ('d1000000-0000-0000-0000-000000000002', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -100000, 'GBP', '2026-11-02', 'UTC', 'L2 pounds', 'paid', null),
  ('d1000000-0000-0000-0000-000000000003', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -1000, 'USD', '2026-11-02', 'UTC', 'L3 personal', 'paid', null),
  ('d1000000-0000-0000-0000-000000000004', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -1001, 'USD', '2026-11-02', 'UTC', 'L4 weight', 'paid', null),
  ('d1000000-0000-0000-0000-000000000005', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -3000, 'USD', '2026-11-02', 'UTC', 'L5 groceries', 'paid', public.t107_cat('11111111-1111-1111-1111-111111111111', 'Groceries')),
  ('d1000000-0000-0000-0000-000000000006', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -500, 'USD', '2026-11-02', 'UTC', 'L6 plain', 'paid', null),
  ('d1000000-0000-0000-0000-000000000007', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -1000, 'USD', '2026-11-02', 'UTC', 'L7 amounts', 'paid', null),
  ('d1000000-0000-0000-0000-0000000000b1', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -100, 'USD', '2026-11-02', 'UTC', 'bulk 1', 'paid', null),
  ('d1000000-0000-0000-0000-0000000000b2', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -100, 'USD', '2026-11-02', 'UTC', 'bulk 2', 'paid', null),
  ('d1000000-0000-0000-0000-0000000000b3', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -100, 'USD', '2026-11-02', 'UTC', 'bulk 3', 'paid', null),
  ('d1000000-0000-0000-0000-0000000000c1', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -7000, 'CAD', '2026-11-02', 'UTC', 'CAD no rate', 'paid', null),
  ('d4000000-0000-0000-0000-000000000001', (select hd from ids), '44444444-4444-4444-4444-444444444444', 'd4000000-0000-0000-0000-00000000000a', -1000, 'USD', '2026-11-02', 'UTC', 'D alone', 'paid', null);

-- A debt and a goal of A's, a line linked to each, and a series linked to the debt.
insert into public.debts (id, household_id, created_by, name, kind, currency, balance) values
  ('de000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A loan', 'loan', 'USD', 90000);
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, name, currency, target) values
  ('5a000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A goal', 'USD', 100000);
select set_config('fincwin.decide_rpc', '', true);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, debt_id, goal_id) values
  ('d1000000-0000-0000-0000-0000000000e1', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', '2026-11-02', 'UTC', 'debt payment', 'paid', 'de000000-0000-0000-0000-00000000000a', null),
  ('d1000000-0000-0000-0000-0000000000e2', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', '2026-11-02', 'UTC', 'goal contribution', 'paid', null, '5a000000-0000-0000-0000-00000000000a'),
  ('d1000000-0000-0000-0000-0000000000e3', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -2000, 'USD', '2026-11-02', 'UTC', 'debt payment on joint', 'paid', 'de000000-0000-0000-0000-00000000000a', null);

-- A line of a series that a debt uses, so a series share must be refused.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5e000000-0000-0000-0000-0000000000d1', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', 'Debt series', -900, 'USD', 'monthly', '2026-11-01', 'UTC');
update public.debts set series_id = '5e000000-0000-0000-0000-0000000000d1' where id = 'de000000-0000-0000-0000-00000000000a';
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, recurring_series_id, occurrence_date) values
  ('d1000000-0000-0000-0000-0000000000e4', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -900, 'USD', '2026-11-01', 'UTC', 'debt series line', 'pending', '5e000000-0000-0000-0000-0000000000d1', '2026-11-01');

-- A shared-series test: the series starts 2026-11-01, an earlier line exists from before; later lines are materialised.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone) values
  ('5e000000-0000-0000-0000-0000000000a1', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', 'Rent', -50000, 'USD', 'monthly', '2026-11-01', 'UTC');
do $$ begin perform count(*) from public.materialise_series('5e000000-0000-0000-0000-0000000000a1', '2026-11-15'); end $$;
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, recurring_series_id, occurrence_date) values
  ('d1000000-0000-0000-0000-0000000000f0', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -50000, 'USD', '2026-10-01', 'UTC', 'Rent earlier', 'paid', '5e000000-0000-0000-0000-0000000000a1', '2026-10-01');

-- A personal line with a split row planted by the table owner, to prove splits follow their parent line.
insert into public.transaction_splits (transaction_id, household_id, member_id, position, share, weight_snapshot)
values ('d1000000-0000-0000-0000-000000000003', (select h from ids), '11111111-1111-1111-1111-111111111111', 0, -1000, 1);

-- 1-4. The split rule is the engine's largest-remainder rule.
select extensions.is(public.hh_allocate(1000, '{1,1,1}'), '{334,333,333}'::bigint[], 'even 1000 over 3 gives 334, 333, 333');
select extensions.is(public.hh_allocate(1001, '{60,40,0}'), '{601,400,0}'::bigint[], 'weights 60/40/0 of 1001 give 601, 400, 0');
select extensions.is(public.hh_allocate(-1000, '{1,1,1}'), '{-334,-333,-333}'::bigint[], 'a negative total keeps its sign');
select extensions.throws_ok($$select public.hh_allocate(100, '{0,0}')$$, '22023', null, 'all-zero weights are refused');

set local role authenticated;
select public.t107_as('22222222-2222-2222-2222-222222222222');
-- 5-6. B cannot share A's line; A's personal line is refused like a missing id.
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000003', 1),
  public.share_transaction('ffffffff-ffff-ffff-ffff-ffffffffffff', 1), 'B sharing A''s personal line is refused like a missing id');
select extensions.is(public.set_line_split('d1000000-0000-0000-0000-000000000003', 1, 'even', null),
  public.set_line_split('ffffffff-ffff-ffff-ffff-ffffffffffff', 1, 'even', null), 'B splitting A''s personal line is refused like a missing id');

-- 7-9. A shares L1 between A and B: two equal shares adding to the stamped amount.
select public.t107_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000001', public.t107_ver('d1000000-0000-0000-0000-000000000001'), 'even',
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[]) ->> 'ok', 'true', 'the creator shares a line');
select extensions.is((select array_agg(share order by position) from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000001'),
  '{-4200,-4200}'::bigint[], 'an even split between two people halves 8400');
select extensions.ok((select is_shared and household_amount = -8400 and household_currency = 'USD'
    and household_amount = (select sum(share) from public.transaction_splits where transaction_id = t.id)
  from public.transactions t where t.id = 'd1000000-0000-0000-0000-000000000001'), 'the line is shared, stamped, and its shares add up to the stamped amount');

-- 10-11. A GBP line is stamped at the line date, and later rate changes never move it (D-39).
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000002', public.t107_ver('d1000000-0000-0000-0000-000000000002'), 'even') ->> 'ok', 'true', 'a pound line is shared');
reset role;
select extensions.is((select household_amount from public.transactions where id = 'd1000000-0000-0000-0000-000000000002'),
  public.convert_minor(-100000, 0.85, 2, 1.1483, 2), 'the household amount is the line converted at its own date');
update public.fx_rates set rate = 1.3 where base = 'EUR' and quote = 'USD';
select extensions.is((select household_amount from public.transactions where id = 'd1000000-0000-0000-0000-000000000002'),
  public.convert_minor(-100000, 0.85, 2, 1.1483, 2), 'a later rate change leaves the stamped amount alone');
set local role authenticated;
select public.t107_as('11111111-1111-1111-1111-111111111111');

-- 12-15. Weight rule with a 0% member, exact amounts that must add up, and a bad participant.
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000004', public.t107_ver('d1000000-0000-0000-0000-000000000004'), 'weight') ->> 'ok', 'true', 'a weighted line is shared');
select extensions.is((select array_agg(share order by position) from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000004'),
  '{-601,-400,0}'::bigint[], 'the 0% member has a zero share and the rest add to the amount');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000007', public.t107_ver('d1000000-0000-0000-0000-000000000007'), 'amount', null,
  '{"11111111-1111-1111-1111-111111111111": -500, "22222222-2222-2222-2222-222222222222": -400}'::jsonb) ->> 'reason', 'amounts_not_total', 'amounts that do not add to the line are refused');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000007', public.t107_ver('d1000000-0000-0000-0000-000000000007'), 'amount', null,
  '{"11111111-1111-1111-1111-111111111111": -700, "22222222-2222-2222-2222-222222222222": -300}'::jsonb) ->> 'ok', 'true', 'amounts that add up are accepted');

-- 16. The household currency cannot change while shared lines exist (D-39).
select extensions.is(public.set_household_currency('EUR') ->> 'reason', 'shared_lines_exist', 'the household currency is fixed once lines are shared');

-- 17-20. Any member changes a split; it is named; a stale version is refused naming who changed it.
select public.t107_as('22222222-2222-2222-2222-222222222222');
select extensions.is(public.set_line_split('d1000000-0000-0000-0000-000000000001', public.t107_ver('d1000000-0000-0000-0000-000000000001'), 'mine', null) ->> 'ok', 'true', 'any member can change the split of a shared line');
select extensions.is((select count(*)::int from public.household_events where kind = 'split_changed' and ref_id = 'd1000000-0000-0000-0000-000000000001' and params ? 'before' and params ? 'after'), 1, 'the change is named with before and after');
select extensions.is((select jsonb_build_object('r', r ->> 'reason', 'u', r ->> 'updated_by') from (select public.set_line_split('d1000000-0000-0000-0000-000000000001', 1, 'even', null) r) s),
  '{"r": "version_conflict", "u": "22222222-2222-2222-2222-222222222222"}'::jsonb, 'a stale split change is refused and names who changed the line');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000001', public.t107_ver('d1000000-0000-0000-0000-000000000001')) ->> 'reason', 'not_creator', 'B cannot share a line A already shared: only the creator shares');

-- 21-24. Only the creator makes a line private again; others are told.
select extensions.is(public.make_line_private('d1000000-0000-0000-0000-000000000001', public.t107_ver('d1000000-0000-0000-0000-000000000001')) ->> 'reason', 'not_creator', 'B cannot make A''s shared line private');
select public.t107_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.make_line_private('d1000000-0000-0000-0000-000000000001', public.t107_ver('d1000000-0000-0000-0000-000000000001')) ->> 'ok', 'true', 'the creator makes the line private');
select extensions.is((select count(*)::int from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000001'), 0, 'its splits are gone');
select extensions.is((select count(*)::int from public.household_events where kind = 'made_private' and ref_id = 'd1000000-0000-0000-0000-000000000001' and audience is null), 1, 'a made_private notice carries the line id');

-- 25-27. Joint accounts: a line on one is shared at once, and cannot be made private.
reset role;
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1000000-0000-0000-0000-0000000000a1', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -6000, 'USD', '2026-11-02', 'UTC', 'joint shop', 'paid');
select extensions.ok((select is_shared and split_rule = 'even' and household_amount = -6000 from public.transactions where id = 'd1000000-0000-0000-0000-0000000000a1'), 'a line on a joint account is shared and stamped on arrival');
select extensions.is((select array_agg(share order by position) from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-0000000000a1'),
  '{-2000,-2000,-2000}'::bigint[], 'it is split over all members with the household default');
set local role authenticated;
select public.t107_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.make_line_private('d1000000-0000-0000-0000-0000000000a1', public.t107_ver('d1000000-0000-0000-0000-0000000000a1')) ->> 'reason', 'joint_account_line', 'a joint-account line cannot be made private');

-- 28-31. Debt- and goal-linked lines stay personal (owner decision 2026-11-15).
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-0000000000e1', 1) ->> 'reason', 'linked_line_personal', 'a debt payment cannot be shared');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-0000000000e2', 1) ->> 'reason', 'linked_line_personal', 'a goal contribution cannot be shared');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-0000000000e4', 1, null, null, null, 'series') ->> 'reason', 'linked_line_personal', 'a series that a debt uses cannot be shared');
reset role;
select extensions.is((select is_shared from public.transactions where id = 'd1000000-0000-0000-0000-0000000000e3'), false, 'a debt-linked line on a joint account stays personal');
set local role authenticated;
select public.t107_as('11111111-1111-1111-1111-111111111111');

-- 32-37. A shared series: this line and the future lines are shared, the earlier one is not, new ones arrive shared.
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-0000000000f1', 1) ->> 'reason', 'not_found', 'an unknown line is not found');
select extensions.is((select count(*)::int from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-0000000000a1' and not is_shared), (select count(*)::int from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-0000000000a1'), 'before sharing no line of the series is shared');
select extensions.is(public.share_transaction(
  (select id from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-0000000000a1' and occurrence_date = '2026-11-01'),
  (select version from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-0000000000a1' and occurrence_date = '2026-11-01'),
  'even', null, null, 'series') ->> 'ok', 'true', 'sharing one line can share every month');
select extensions.is((select count(*)::int from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-0000000000a1' and local_date >= '2026-11-01' and not is_shared), 0, 'this line and the future lines are shared');
select extensions.is((select is_shared from public.transactions where id = 'd1000000-0000-0000-0000-0000000000f0'), false, 'the earlier line of the series stays personal');
reset role;
create temp table before_run as select max(local_date) as m from public.transactions where recurring_series_id = '5e000000-0000-0000-0000-0000000000a1';
do $$ begin perform count(*) from public.materialise_series('5e000000-0000-0000-0000-0000000000a1', '2027-06-15'); end $$;
select extensions.ok((select count(*) > 0 and bool_and(is_shared and split_rule = 'even')
    and bool_and(exists (select 1 from public.transaction_splits s where s.transaction_id = t.id))
  from public.transactions t where t.recurring_series_id = '5e000000-0000-0000-0000-0000000000a1' and t.local_date > (select m from before_run)),
  'a line materialised later is shared with the same rule and has its split');
set local role authenticated;
select public.t107_as('22222222-2222-2222-2222-222222222222');

-- 38-42. Defaults: a category default applies when a line is shared; otherwise the household default; then even.
select extensions.is(public.set_split_default('builtin:Groceries', 'weight') ->> 'ok', 'true', 'any member sets a category default');
select extensions.is((select count(*)::int from public.household_events where kind = 'category_default_changed'), 1, 'the default change is named');
select public.t107_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000005', public.t107_ver('d1000000-0000-0000-0000-000000000005')) ->> 'ok', 'true', 'a groceries line is shared without choosing a rule');
select extensions.is((select split_rule from public.transactions where id = 'd1000000-0000-0000-0000-000000000005'), 'weight', 'it takes the Groceries default (HH-06)');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-000000000006', public.t107_ver('d1000000-0000-0000-0000-000000000006')) ->> 'ok', 'true', 'a plain line is shared without choosing a rule');
select extensions.is((select split_rule from public.transactions where id = 'd1000000-0000-0000-0000-000000000006'), 'even', 'with no default set it is split evenly');

-- 43-48. D-35: new weights apply to new lines only; the offer counts exact lines and can re-split them.
select extensions.is((select array_agg(share order by position) from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000005'),
  '{-1800,-1200,0}'::bigint[], 'the groceries line was split 60/40/0');
select extensions.is(public.set_member_weights('{"11111111-1111-1111-1111-111111111111": 30, "22222222-2222-2222-2222-222222222222": 30, "33333333-3333-3333-3333-333333333333": 40}'::jsonb) ->> 'ok', 'true', 'weights change');
select extensions.is((select array_agg(share order by position) from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000005'),
  '{-1800,-1200,0}'::bigint[], 'the existing split does not move');
select extensions.is(public.count_unsettled_for_rule('builtin:Groceries') ->> 'count', '1', 'the offer counts the one groceries line');
select extensions.is(public.apply_rule_to_unsettled('builtin:Groceries') ->> 'changed_count', '1', 'applying re-splits exactly that line');
select extensions.is((select array_agg(share order by position) from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000005'),
  '{-900,-900,-1200}'::bigint[], 'it now follows the new weights');
select extensions.is((public.count_unsettled_for_rule(null) ->> 'count')::int,
  (select count(*)::int from public.transactions t where t.is_shared and t.deleted_at is null and t.split_rule <> 'amount'
     and not exists (select 1 from public.household_split_defaults d where d.category_ref is not null and d.category_ref = 'builtin:' || (select c.builtin_key from public.categories c where c.id = t.category_id))),
  'the household default decides every shared line without a category default');

-- 49-52. Bulk sharing returns a count; linked lines count as skipped.
select extensions.is(public.bulk_share_transactions(array['d1000000-0000-0000-0000-0000000000b1', 'd1000000-0000-0000-0000-0000000000b2', 'd1000000-0000-0000-0000-0000000000b3', 'd1000000-0000-0000-0000-000000000005']::uuid[]),
  '{"ok": true, "shared_count": 3, "skipped_count": 1}'::jsonb, 'bulk sharing shares 3 lines and skips the one already shared');
select extensions.is(public.bulk_share_transactions(array['d1000000-0000-0000-0000-0000000000e2', 'd1000000-0000-0000-0000-0000000000e1']::uuid[]),
  '{"ok": true, "shared_count": 0, "skipped_count": 2}'::jsonb, 'bulk sharing skips goal- and debt-linked lines');
select extensions.is(public.share_transaction('d1000000-0000-0000-0000-0000000000c1', public.t107_ver('d1000000-0000-0000-0000-0000000000c1')) ->> 'reason', 'rate_unavailable', 'a line with no rate cannot be shared');
select public.t107_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.share_transaction('d4000000-0000-0000-0000-000000000001', 1) ->> 'reason', 'no_household', 'a household of one cannot share');

-- 53-54. A pending stamp is filled in later by the restamp job.
reset role;
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1000000-0000-0000-0000-0000000000a2', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -9000, 'CAD', '2026-11-02', 'UTC', 'joint, no rate', 'paid');
select extensions.ok((select is_shared and household_rate_pending and household_amount is null from public.transactions where id = 'd1000000-0000-0000-0000-0000000000a2'), 'a joint line with no rate is shared and pending');
insert into public.fx_rates (base, quote, rate, rate_date, source) values ('EUR', 'CAD', 1.5, '2026-11-02', 'frankfurter-v2');
select extensions.ok(public.hh_restamp_pending() >= 1, 'the restamp job stamps pending lines');
select extensions.ok((select not household_rate_pending and household_amount is not null
    and household_amount = (select sum(share) from public.transaction_splits where transaction_id = t.id)
  from public.transactions t where t.id = 'd1000000-0000-0000-0000-0000000000a2'), 'the pending line is stamped and its shares add up');
select extensions.is(has_function_privilege('authenticated', 'public.hh_restamp_pending()', 'execute'), false, 'a client cannot run the restamp job');

-- 57-60. Own category on a shared line; splits follow their parent line.
set local role authenticated;
select public.t107_as('22222222-2222-2222-2222-222222222222');
select extensions.lives_ok($$insert into public.transaction_member_categories (transaction_id, user_id, household_id, category_id)
  values ('d1000000-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', (select h from ids), public.t107_cat('22222222-2222-2222-2222-222222222222', 'Dining'))$$,
  'a member sets their own category on a shared line');
select extensions.throws_ok($$insert into public.transaction_member_categories (transaction_id, user_id, household_id, category_id)
  values ('d1000000-0000-0000-0000-000000000006', '22222222-2222-2222-2222-222222222222', (select h from ids), public.t107_cat('11111111-1111-1111-1111-111111111111', 'Dining'))$$,
  '42501', null, 'another person''s category is refused');
select extensions.throws_ok($$insert into public.transaction_member_categories (transaction_id, user_id, household_id, category_id)
  values ('d1000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', (select h from ids), public.t107_cat('22222222-2222-2222-2222-222222222222', 'Dining'))$$,
  '42501', null, 'a category on A''s personal line is refused');
select extensions.is((select count(*)::int from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000003'), 0, 'splits of A''s personal line are invisible to B');
select public.t107_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*)::int from public.transaction_splits where transaction_id = 'd1000000-0000-0000-0000-000000000003'), 1, 'the creator sees them');

select * from extensions.finish();
rollback;
