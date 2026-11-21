-- pgTAP: Phase 8 plan 08-09 (HH-01, HH-02; D-01, D-04, D-06; T-08-36, T-08-36b, T-08-37). Joining moves the joiner's household
-- of one into the target: records move and stay personal, the joiner's shared category rules become personal rules,
-- weights re-split evenly, and the allow-list of tables that move is complete.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(49);

-- A owner of H, B member, C joiner with data, D in a two-person household with X.
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', case n when 1 then 'Alice Test' else 'User ' || n end)::jsonb, now(), now()
  from generate_series(1, 5) n;

create temp table hh as select owner_id, id from public.households;
grant select on hh to authenticated;
create temp table codes (label text primary key, code text);
grant all on codes to authenticated;
create function public.t106_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;

-- Join order: A first, then B. D joins X's household of one (so D's household has two people).
update public.household_members set created_at = now() - interval '2 days' where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id = '22222222-2222-2222-2222-222222222222';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select id from hh where owner_id = '11111111-1111-1111-1111-111111111111'), '22222222-2222-2222-2222-222222222222', false, 0, now() - interval '1 day');
delete from public.household_members where user_id = '44444444-4444-4444-4444-444444444444';
insert into public.household_members (household_id, user_id, is_owner, weight, created_at)
values ((select id from hh where owner_id = '55555555-5555-5555-5555-555555555555'), '44444444-4444-4444-4444-444444444444', false, 0, now());

-- C's records in C's own household (hC), as the table owner.
create temp table ids as select
  (select id from hh where owner_id = '11111111-1111-1111-1111-111111111111') as h,
  (select id from hh where owner_id = '33333333-3333-3333-3333-333333333333') as hc,
  (select id from hh where owner_id = '55555555-5555-5555-5555-555555555555') as hd;
grant select on ids to authenticated;

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('c3000000-0000-0000-0000-00000000000a', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'C card', 'credit', 'USD', 0, true),
  ('d4000000-0000-0000-0000-00000000000a', (select hd from ids), '44444444-4444-4444-4444-444444444444', 'D account', 'checking', 'USD', 0, false);
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, is_shared) values
  ('c3000000-0000-0000-0000-0000000000b1', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'c3000000-0000-0000-0000-00000000000a', -1000, 'USD', '2026-11-02', 'UTC', 'C personal', 'paid', false),
  ('c3000000-0000-0000-0000-0000000000b2', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'c3000000-0000-0000-0000-00000000000a', -2000, 'USD', '2026-11-03', 'UTC', 'C marked shared', 'paid', true);
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_shared) values
  ('c3000000-0000-0000-0000-0000000000c1', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'c3000000-0000-0000-0000-00000000000a', 'C series', -500, 'USD', 'monthly', '2026-01-01', 'UTC', true);
insert into public.statement_periods (id, household_id, created_by, account_id, period_start, period_end) values
  ('c3000000-0000-0000-0000-0000000000d1', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'c3000000-0000-0000-0000-00000000000a', '2026-10-01', '2026-10-31');
insert into public.debts (id, household_id, created_by, name, kind, currency, balance) values
  ('c3000000-0000-0000-0000-0000000000e1', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'C loan', 'loan', 'USD', 90000);
insert into public.decide_checks (id, household_id, created_by, name) values
  ('c3000000-0000-0000-0000-0000000000f1', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'C check');
select set_config('fincwin.decide_rpc', 'on', true);
insert into public.savings_goals (id, household_id, created_by, name, currency, target) values
  ('c3000000-0000-0000-0000-0000000000a1', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'C goal', 'USD', 100000);
select set_config('fincwin.decide_rpc', '', true);
-- A already dismissed the same payee in H; C's dismissal must still move in (keys are per person).
insert into public.recurring_dismissals (id, household_id, created_by, payee_key, direction) values
  ('c3000000-0000-0000-0000-0000000000a2', (select hc from ids), '33333333-3333-3333-3333-333333333333', 'netflix|usd|-', 'out'),
  ('a1000000-0000-0000-0000-0000000000a2', (select h from ids), '11111111-1111-1111-1111-111111111111', 'netflix|usd|-', 'out');
-- C's three shared rules, written as C so fill_category_rule stamps created_by.
set local role authenticated;
select public.t106_as('33333333-3333-3333-3333-333333333333');
-- C's personal rule P1: 'netflix' on C's Dining category.
insert into public.category_rules (id, scope, keyword, keyword_norm, category_id) values
  ('c3000000-0000-0000-0000-0000000000a3', 'personal', 'Netflix', 'netflix',
   (select id from public.categories where owner_id = '33333333-3333-3333-3333-333333333333' and builtin_key = 'Dining'));
insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_builtin_key) values
  ('c3000000-0000-0000-0000-0000000000a4', 'shared', (select hc from ids), 'Tesco', 'tesco', 'Groceries');
insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_name) values
  ('c3000000-0000-0000-0000-0000000000a5', 'shared', (select hc from ids), 'Vet', 'vet', 'Pets');
insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, target_builtin_key) values
  ('c3000000-0000-0000-0000-0000000000a6', 'shared', (select hc from ids), 'Netflix', 'netflix', 'Subscriptions');

-- Invites from A.
select public.t106_as('11111111-1111-1111-1111-111111111111');
insert into codes select 'k1', public.create_invite() ->> 'code';
insert into codes select 'k2', public.create_invite() ->> 'code';
insert into codes select 'k3', public.create_invite() ->> 'code';

-- 1-3. Preview: nothing is inserted, the name shows until the inviter hides it.
select public.t106_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select public.preview_invite(code) from codes where label = 'k1') - 'household_name' - 'inviter_colour_key',
  -- 09-04 adds seats, plan_key and needs_approval (no plan row here: 6 seats, no plan, no approval needed).
  '{"ok": true, "full": false, "seats": 6, "plan_key": null, "member_count": 2, "already_member": false, "needs_approval": false,
    "in_other_household": false, "inviter_display_name": "Alice"}'::jsonb,
  'preview shows the inviter, the count, and that C is not in another household');
reset role;
update public.household_members set name_hidden = true where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select public.t106_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select public.preview_invite(code) from codes where label = 'k1') ->> 'inviter_display_name', null, 'a hidden inviter name is not shown');
reset role;
select extensions.is((select count(*)::int from public.redeem_attempts), 0, 'a successful preview records no attempt');
update public.household_members set name_hidden = false where user_id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;

-- 4. C joins.
select public.t106_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select public.redeem_invite(code) from codes where label = 'k1') ->> 'ok', 'true', 'C redeems a valid code and joins at once');

reset role;
-- 5-12. Everything moved into H.
select extensions.is((select count(*)::int from public.accounts where created_by = '33333333-3333-3333-3333-333333333333' and household_id = (select h from ids)), 1, 'C''s account is in H');
select extensions.is((select count(*)::int from public.transactions where created_by = '33333333-3333-3333-3333-333333333333' and household_id = (select h from ids)), 2, 'C''s transactions are in H');
select extensions.is((select count(*)::int from public.recurring_series where created_by = '33333333-3333-3333-3333-333333333333' and household_id = (select h from ids)), 1, 'C''s series is in H');
select extensions.is((select count(*)::int from public.statement_periods where id = 'c3000000-0000-0000-0000-0000000000d1' and household_id = (select h from ids)), 1, 'C''s statement period moved with its card');
select extensions.is((select count(*)::int from public.debts where created_by = '33333333-3333-3333-3333-333333333333' and household_id = (select h from ids)), 1, 'C''s debt is in H');
select extensions.is((select count(*)::int from public.decide_checks where created_by = '33333333-3333-3333-3333-333333333333' and household_id = (select h from ids)), 1, 'C''s Decide check is in H');
select extensions.is((select count(*)::int from public.savings_goals where created_by = '33333333-3333-3333-3333-333333333333' and household_id = (select h from ids)), 1, 'C''s goal is in H');
select extensions.is((select count(*)::int from public.recurring_dismissals where household_id = (select h from ids) and payee_key = 'netflix|usd|-' and deleted_at is null), 2, 'both members keep their own dismissal of the same payee');

-- 13-14. Personal after the move (D-01), and the old household is gone.
select extensions.is((select count(*)::int from public.transactions where created_by = '33333333-3333-3333-3333-333333333333' and is_shared), 0, 'every moved transaction is personal');
select extensions.is((select count(*)::int from public.accounts where created_by = '33333333-3333-3333-3333-333333333333' and is_shared)
  + (select count(*)::int from public.recurring_series where created_by = '33333333-3333-3333-3333-333333333333' and is_shared), 0, 'the moved account and series are personal');
select extensions.is((select count(*)::int from public.households where id = (select hc from ids)), 0, 'C''s old household of one no longer exists');

-- 15-24. Category rules (join conversion).
select extensions.is((select scope || '|' || coalesce(owner_id::text, 'null') || '|' || coalesce(household_id::text, 'null') from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a4'),
  'personal|33333333-3333-3333-3333-333333333333|null', 'R1 is a personal rule owned by C with no household (scope shape holds)');
select extensions.is((select category_id from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a4'),
  (select id from public.categories where owner_id = '33333333-3333-3333-3333-333333333333' and builtin_key = 'Groceries'), 'R1 points at C''s own Groceries category');
select extensions.is((select target_builtin_key || target_name from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a4'), null, 'R1 carries no target key or name any more');
select extensions.is((select deleted_at is null from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a4'), true, 'R1 is live');
select extensions.is((select created_by from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a4'), '33333333-3333-3333-3333-333333333333'::uuid, 'R1 keeps its creator');
select extensions.is((select count(*)::int from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a5'), 0, 'R2 (no Pets category) is gone');
select extensions.is((select count(*)::int from public.category_rules where keyword_norm = 'vet' and deleted_at is null), 0, 'no live rule for "vet" remains in any scope');
select extensions.is((select count(*)::int from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a6'), 0, 'R3 (keyword clash) is gone');
select extensions.is((select array_agg(id::text) from public.category_rules where keyword_norm = 'netflix' and deleted_at is null and owner_id = '33333333-3333-3333-3333-333333333333'),
  array['c3000000-0000-0000-0000-0000000000a3'], 'C has exactly one live "netflix" rule: P1');
select extensions.is((select category_id from public.category_rules where id = 'c3000000-0000-0000-0000-0000000000a3'),
  (select id from public.categories where owner_id = '33333333-3333-3333-3333-333333333333' and builtin_key = 'Dining'), 'P1 keeps its Dining category');

-- 25-34. Privacy holds after the join: A sees none of C's rows.
set local role authenticated;
select public.t106_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*)::int from public.accounts where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s accounts');
select extensions.is((select count(*)::int from public.transactions where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s transactions');
select extensions.is((select count(*)::int from public.recurring_series where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s series');
select extensions.is((select count(*)::int from public.statement_periods where id = 'c3000000-0000-0000-0000-0000000000d1'), 0, 'A sees none of C''s statement periods');
select extensions.is((select count(*)::int from public.debts where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s debts');
select extensions.is((select count(*)::int from public.decide_checks where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s Decide checks');
select extensions.is((select count(*)::int from public.savings_goals where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s goals');
select extensions.is((select count(*)::int from public.recurring_dismissals where created_by = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s dismissals');
select extensions.is((select count(*)::int from public.category_rules where owner_id = '33333333-3333-3333-3333-333333333333'), 0, 'A sees none of C''s rules');

-- 35-37. Weights re-split in join order; the household is told.
reset role;
select extensions.is((select array_agg(weight order by created_at, user_id) from public.household_members where household_id = (select h from ids)), array[34, 33, 33], 'weights re-split 34, 33, 33 in join order');
select extensions.is((select sum(weight)::int from public.household_members where household_id = (select h from ids)), 100, 'the weights add to 100');
select extensions.ok(exists (select 1 from public.household_events where household_id = (select h from ids) and kind = 'joined' and subject_id = '33333333-3333-3333-3333-333333333333')
  and exists (select 1 from public.household_events where household_id = (select h from ids) and kind = 'weights_changed' and (params -> 'after') is not null),
  'joined and weights_changed events exist');

-- 38-40. D is in a two-person household: told to leave first, nothing moves, no failed guess is counted.
set local role authenticated;
select public.t106_as('44444444-4444-4444-4444-444444444444');
select extensions.is((select public.redeem_invite(code) from codes where label = 'k2') ->> 'reason', 'in_other_household', 'a person in a household with others is told to leave first');
reset role;
select extensions.is((select household_id from public.accounts where id = 'd4000000-0000-0000-0000-00000000000a'), (select hd from ids), 'D''s rows are unmoved');
select extensions.is((select count(*)::int from public.redeem_attempts where user_id = '44444444-4444-4444-4444-444444444444'), 0, 'that refusal is not counted as a failed guess');

-- 41. A second code for the same household is idempotent.
set local role authenticated;
select public.t106_as('33333333-3333-3333-3333-333333333333');
select extensions.is((select public.redeem_invite(code) from codes where label = 'k3') ->> 'already_member', 'true', 'redeeming a second code for the same household reports already_member');
reset role;
select extensions.is((select count(*)::int from public.household_members where user_id = '33333333-3333-3333-3333-333333333333'), 1, 'no duplicate membership');

-- 43. The flag is transaction-local and off again: a privileged writer without it is still pinned.
select extensions.isnt(coalesce(current_setting('fincwin.household_rpc', true), ''), 'on', 'the household flag is switched off again after the join');
update public.decide_checks set household_id = (select hd from ids) where id = 'c3000000-0000-0000-0000-0000000000f1';
select extensions.is((select household_id from public.decide_checks where id = 'c3000000-0000-0000-0000-0000000000f1'), (select h from ids), 'without the flag the household_id pin still holds');

-- 45-49. Guards on the allow-list.
select extensions.is(
  (select array_agg(c.table_name order by c.table_name)::text
     from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
    where c.table_schema = 'public' and c.column_name = 'household_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in (select table_name from public.hh_move_tables())
      and c.table_name not in ('households', 'household_members', 'household_events', 'household_invites', 'statement_periods', 'category_rules',
        'transaction_splits', 'transaction_member_categories', 'household_split_defaults', 'settlements', 'settlement_lines', 'settlement_nudges',
        'household_former_members', 'member_departures', 'decide_partner_optins', 'partner_figures', 'safety_net_shares',
        -- Phase 9 plan records stay with the household: its plan, the one-trial-per-household ledger, the join requests
        -- waiting on it, and the leave history the switch rule reads (the household that was left).
        'household_plans', 'trial_ledger', 'plan_join_requests', 'household_leave_log',
        -- 08.1-22: the household's spending rule.
        'household_spend_rules')),
  null, 'every household_id table either moves with a person (hh_move_tables) or is a listed household table');
select extensions.is((select count(*)::int from pg_constraint
   where conname in ('transactions_account_same_household', 'recurring_series_account_same_household', 'statement_periods_account_same_household')
     and condeferrable and not condeferred), 3, 'account/household FKs deferrable initially immediate (moves defer them)');
select extensions.is((select count(*)::int from public.hh_move_tables() m
   where not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = m.table_name and c.column_name = 'household_id')
      or not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = m.table_name and c.column_name = m.owner_column)),
  0, 'every hh_move_tables row has household_id and its owner column');
select extensions.is(has_function_privilege('authenticated', 'public.hh_move_rows(uuid,uuid,uuid,boolean)', 'execute'), false, 'a client cannot call hh_move_rows');
select extensions.is(has_function_privilege('authenticated', 'public.hh_personalise_category_rules(uuid,uuid)', 'execute'), false, 'a client cannot call hh_personalise_category_rules');

select * from extensions.finish();
rollback;
