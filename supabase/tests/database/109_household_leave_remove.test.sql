-- pgTAP: Phase 8 plan 08-14 (HH-13; D-25..D-28). Leaving, removal, ownership transfer and the 24-hour reconnect.
-- A owns the household; B, C, D are members. B has a personal account with personal and shared lines, a shared series, a
-- top-up on the joint account, a pending settle-up with A and open balances with A. B leaves, A removes D (and undoes it),
-- ownership is transferred, and the owner leaves.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(102);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 5) n;

create temp table ids as select (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h;
grant select on ids to authenticated;
create temp table res (k text primary key, j jsonb);
grant all on res to authenticated;

create function public.t109_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t109_ver(p uuid) returns int language sql as $$ select version from public.transactions where id = p $$;
-- Reads any value with the table owner's rights (a test helper inside a rolled-back transaction).
create function public.t109_val(q text) returns text language plpgsql security definer as $$
declare v text;
begin execute q into v; return v; end;
$$;
create function public.t109_j(k text, path text) returns text language sql as $$ select j #>> string_to_array(path, ',') from res where res.k = $1 $$;

-- A joined first; B, C, D after. Weights 40 / 30 / 20 / 10, household currency USD.
update public.household_members set created_at = now() - interval '4 days', weight = 40 where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at, display_name) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 30, now() - interval '3 days', 'Bea'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 20, now() - interval '2 days', 'Cy'),
  ((select h from ids), '44444444-4444-4444-4444-444444444444', false, 10, now() - interval '1 day', 'Di');
update public.households set reporting_currency = 'USD' where id = (select h from ids);

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('b2000000-0000-0000-0000-00000000000a', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B personal', 'checking', 'USD', 0, false),
  ('b2000000-0000-0000-0000-00000000000b', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B quiet', 'checking', 'USD', 0, false),
  ('c3000000-0000-0000-0000-00000000000a', (select h from ids), '33333333-3333-3333-3333-333333333333', 'C personal', 'checking', 'USD', 0, false),
  ('d4000000-0000-0000-0000-00000000000a', (select h from ids), '44444444-4444-4444-4444-444444444444', 'D personal', 'checking', 'USD', 0, false),
  ('f0000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'Joint', 'checking', 'USD', 0, true);

-- L1 B paid 8400 from BP (shared A+B), L2 A paid 3000 (A+B), L3 B personal, L4 A paid 2000 (A+B, later locked by a pending
-- settle-up), L5 A paid 2000 (A+C), L6 D paid 6000 from DP (A+D), L7 B's top-up on the joint account, L8 B personal on BQ.
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1000000-0000-0000-0000-000000000001', (select h from ids), '22222222-2222-2222-2222-222222222222', 'b2000000-0000-0000-0000-00000000000a', -8400, 'USD', current_date, 'UTC', 'L1', 'paid'),
  ('d1000000-0000-0000-0000-000000000002', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -3000, 'USD', current_date, 'UTC', 'L2', 'paid'),
  ('d1000000-0000-0000-0000-000000000003', (select h from ids), '22222222-2222-2222-2222-222222222222', 'b2000000-0000-0000-0000-00000000000a', -500, 'USD', current_date, 'UTC', 'L3 personal', 'paid'),
  ('d1000000-0000-0000-0000-000000000004', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L4', 'paid'),
  ('d1000000-0000-0000-0000-000000000005', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'L5', 'paid'),
  ('d1000000-0000-0000-0000-000000000006', (select h from ids), '44444444-4444-4444-4444-444444444444', 'd4000000-0000-0000-0000-00000000000a', -6000, 'USD', current_date, 'UTC', 'L6', 'paid'),
  ('d1000000-0000-0000-0000-000000000007', (select h from ids), '22222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-00000000000a', 500, 'USD', current_date, 'UTC', 'L7 top-up', 'paid'),
  ('d1000000-0000-0000-0000-000000000008', (select h from ids), '22222222-2222-2222-2222-222222222222', 'b2000000-0000-0000-0000-00000000000b', -100, 'USD', current_date, 'UTC', 'L8 quiet', 'paid');

-- A shared series of B's on BP.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone, is_shared)
values ('e1000000-0000-0000-0000-000000000001', (select h from ids), '22222222-2222-2222-2222-222222222222',
        'b2000000-0000-0000-0000-00000000000a', 'B shared bill', -1000, 'USD', 'monthly', current_date - 10, 'UTC', true);

-- B's personal series on the joint account wrote a line there (a joint account shares its outgoing lines at once, L9).
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone)
values ('e2000000-0000-0000-0000-000000000001', (select h from ids), '22222222-2222-2222-2222-222222222222',
        'f0000000-0000-0000-0000-00000000000a', 'B joint bill', -300, 'USD', 'monthly', current_date, 'UTC');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status, recurring_series_id, occurrence_date)
values ('d1000000-0000-0000-0000-000000000009', (select h from ids), '22222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-00000000000a',
        -300, 'USD', current_date, 'UTC', 'L9 joint bill', 'paid', 'e2000000-0000-0000-0000-000000000001', current_date);

set local role authenticated;
select public.t109_as('11111111-1111-1111-1111-111111111111');
select public.share_transaction(('d1000000-0000-0000-0000-00000000000' || n)::uuid, public.t109_ver(('d1000000-0000-0000-0000-00000000000' || n)::uuid), 'even',
  case n when 5 then array['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333']::uuid[]
         else array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[] end)
  from unnest(array[2, 4, 5]) n;
select public.t109_as('22222222-2222-2222-2222-222222222222');
select public.share_transaction('d1000000-0000-0000-0000-000000000001', public.t109_ver('d1000000-0000-0000-0000-000000000001'), 'even',
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[]);
select public.t109_as('44444444-4444-4444-4444-444444444444');
select public.share_transaction('d1000000-0000-0000-0000-000000000006', public.t109_ver('d1000000-0000-0000-0000-000000000006'), 'even',
  array['11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444']::uuid[]);

-- B: a pending settle-up for L4 (locked until it lapses), a category of their own on L2, a personal and a shared rule.
select public.t109_as('22222222-2222-2222-2222-222222222222');
insert into res select 'S1', public.propose_settlement('11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000004']::uuid[],
  'b2000000-0000-0000-0000-00000000000a', 1000);
insert into public.categories (id, name, color_key) values ('c0000000-0000-0000-0000-0000000000c2', 'B stuff', 'plum');
insert into public.transaction_member_categories (transaction_id, user_id, household_id, category_id)
  values ('d1000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', (select h from ids), 'c0000000-0000-0000-0000-0000000000c2');
insert into public.category_rules (id, scope, household_id, keyword, keyword_norm, category_id, target_builtin_key, target_name) values
  ('ab000000-0000-0000-0000-000000000001', 'personal', null, 'Gym', 'gym', 'c0000000-0000-0000-0000-0000000000c2', null, null),
  ('ab000000-0000-0000-0000-000000000002', 'shared', (select h from ids), 'rent', 'rent', null, 'Housing', null);
reset role;
select set_config('request.jwt.claims', '', true);

create temp table before_nets as select
  public.hh_pair_net((select h from ids), '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222') as ab,
  public.hh_pair_net((select h from ids), '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333') as ac,
  public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222') as cb;

select extensions.is(public.t109_val('select count(*) from public.transaction_splits where household_id = (select h from ids)'), '14',
  'fixture: five shared lines and the joint line L9, 14 shares');
select extensions.is((select ab from before_nets), 2700::bigint, 'fixture: A owes B 2700 over the unlocked lines (L1 4200 minus L2 1500)');
select extensions.is((select ac from before_nets), -1000::bigint, 'fixture: C owes A 1000 (L5)');

-- 1. Leaving with open balances ---------------------------------------------------------------------------------------------
set local role authenticated;
select public.t109_as('22222222-2222-2222-2222-222222222222');
insert into res select 'LEAVE', public.leave_household();
select extensions.is(public.t109_j('LEAVE', 'ok'), 'true', 'B leaves with open balances: allowed (D-25)');
select extensions.is(public.t109_j('LEAVE', 'open_balances,0,other_id'), '11111111-1111-1111-1111-111111111111', 'the warning names A');
select extensions.is(public.t109_j('LEAVE', 'open_balances,0,amount'), '-1700', 'the warning amount is signed: negative, A owes B 1700 (B''s waiting settle-up for L4 was cancelled, so its 1000 counts again)');
select extensions.is(jsonb_array_length((select j -> 'open_balances' from res where k = 'LEAVE'))::text, '1', 'only A is in the warning (C and D have nothing with B)');
reset role;
select set_config('request.jwt.claims', '', true);

select extensions.is(public.t109_val('select count(*) from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222'''), '1', 'B has one membership');
select extensions.is(public.t109_val('select (household_id <> (select h from ids))::text || is_owner::text from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222'''),
  'truetrue', 'B owns a new household of one');
select extensions.is(public.t109_val('select (household_id = (select household_id from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222''))::text from public.transactions where id = ''d1000000-0000-0000-0000-000000000003'''),
  'true', 'B''s personal line moved to the new household');
select extensions.is(public.t109_val('select count(*) from public.accounts where household_id = (select household_id from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222'') and id in (''b2000000-0000-0000-0000-00000000000a'', ''b2000000-0000-0000-0000-00000000000b'')'),
  '2', 'both of B''s accounts moved, the one with shared lines too');
select extensions.is(public.t109_val('select (household_id = (select household_id from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222''))::text from public.transactions where id = ''d1000000-0000-0000-0000-000000000008'''),
  'true', 'a line on the quiet account moved');
select extensions.is(public.t109_val('select string_agg(is_shared::text || (household_id = (select h from ids))::text, '','' order by name) from public.transactions where name in (''L1'', ''L2'') and copied_from is null'),
  'truetrue,truetrue', 'L1 and L2 stay shared in the household');
select extensions.is(public.t109_val('select count(*) || sum(share)::text from public.transaction_splits where transaction_id = ''d1000000-0000-0000-0000-000000000001'' and household_id = (select h from ids)'),
  '2-8400', 'L1 keeps both shares in the household, split unchanged');
select extensions.is(public.t109_val('select count(*) from public.transaction_splits where member_id = ''22222222-2222-2222-2222-222222222222'' and household_id = (select h from ids)'),
  '4', 'B''s four shares (L1, L2, L4 and the joint line L9) stay in the household');
select extensions.is(public.t109_val('select (a.tombstone_of = ''b2000000-0000-0000-0000-00000000000a'')::text || a.is_shared::text || (a.archived_at is not null)::text || (a.household_id = (select h from ids))::text from public.accounts a join public.transactions t on t.account_id = a.id where t.id = ''d1000000-0000-0000-0000-000000000001'''),
  'truetruetruetrue', 'L1 now sits on an archived shared tombstone of BP in the household');
select extensions.is(public.t109_val('select (a.tombstone_of is not null and a.is_shared)::text || (r.end_date <= current_date)::text from public.recurring_series r join public.accounts a on a.id = r.account_id where r.id = ''e1000000-0000-0000-0000-000000000001'''),
  'truetrue', 'B''s shared series moved onto the tombstone and ended');
select extensions.is(public.t109_val('select count(*) from public.transactions where created_by = ''22222222-2222-2222-2222-222222222222'' and copied_from is not null'),
  '4', 'B has four personal copies (L1, L2, L4, L9)');
select extensions.is(public.t109_val('select (t.is_shared and t.recurring_series_id is null and t.household_id = (select h from ids))::text || (r.household_id = (select household_id from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222''))::text from public.transactions t, public.recurring_series r where t.id = ''d1000000-0000-0000-0000-000000000009'' and r.id = ''e2000000-0000-0000-0000-000000000001'''),
  'truetrue', 'the joint line B''s personal series wrote stays shared and lets go of the series, which moves with B');
select extensions.is(public.t109_val('select (account_id = ''b2000000-0000-0000-0000-00000000000a'')::text || original_amount || ''/'' || copy_share from public.transactions where copied_from = ''d1000000-0000-0000-0000-000000000001'''),
  'true-8400/-4200', 'the line B paid from BP is copied in full on BP with copy_share = their share');
select extensions.is(public.t109_val('select (a.archived_at is not null and a.tombstone_of is null)::text || t.original_amount || (t.copy_share is null)::text || (t.household_id = a.household_id)::text from public.transactions t join public.accounts a on a.id = t.account_id where t.copied_from = ''d1000000-0000-0000-0000-000000000002'''),
  'true-1500truetrue', 'A''s line copies B''s share on an archived tracking account');
select extensions.is(public.t109_val('select category_id::text from public.transactions where copied_from = ''d1000000-0000-0000-0000-000000000002'''),
  'c0000000-0000-0000-0000-0000000000c2', 'the copy carries B''s own category from their override');
select extensions.is(public.t109_val('select (t.household_id = (select household_id from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222''))::text || (a.archived_at is not null)::text from public.transactions t join public.accounts a on a.id = t.account_id where t.id = ''d1000000-0000-0000-0000-000000000007'''),
  'truetrue', 'B''s personal top-up on the joint account moved to B''s tracking account');
select extensions.is(public.t109_val('select count(*) from public.household_former_members where user_id = ''22222222-2222-2222-2222-222222222222'' and reason = ''left'' and household_id = (select h from ids)'),
  '1', 'a former-member row says B left');
select extensions.is(public.t109_val('select string_agg(weight::text, '','' order by created_at) from public.household_members where household_id = (select h from ids)'),
  '57,29,14', 'the remaining weights re-split to 100 proportionally (40/20/10)');
select extensions.is(public.t109_val('select count(*) from public.household_events where household_id = (select h from ids) and kind = ''left'' and subject_id = ''22222222-2222-2222-2222-222222222222'' and audience is null'),
  '1', 'the household is told B left');

-- 2. Settle-ups, shared rules and balances stay with the household ----------------------------------------------------------
select extensions.is(public.t109_val('select (household_id = (select h from ids))::text from public.settlements where id = ''' || public.t109_j('S1', 'settlement_id') || ''''),
  'true', 'the pending settle-up stays in the household');
select extensions.is(public.t109_val('select count(*) from public.settlement_lines where settlement_id = ''' || public.t109_j('S1', 'settlement_id') || ''' and household_id = (select h from ids)'),
  '1', 'its settlement line stays in the household');
select extensions.is(public.t109_val('select count(*) from public.settlements where household_id = (select household_id from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222'')'),
  '0', 'the new household holds no settlement');
select extensions.is(public.t109_val('select count(*) from public.transaction_member_categories where user_id = ''22222222-2222-2222-2222-222222222222'' and household_id = (select h from ids)'),
  '1', 'B''s own category on L2 stays with the household line');
select extensions.is(public.t109_val('select scope || (household_id = (select h from ids))::text || (deleted_at is null)::text from public.category_rules where id = ''ab000000-0000-0000-0000-000000000002'''),
  'sharedtruetrue', 'the shared rule B created stays a live shared rule of the household');
select extensions.is(public.t109_val('select scope || (owner_id = ''22222222-2222-2222-2222-222222222222'')::text || (household_id is null)::text from public.category_rules where id = ''ab000000-0000-0000-0000-000000000001'''),
  'personaltruetrue', 'B''s personal rule is unchanged and goes with B');
select extensions.is(public.hh_pair_net((select h from ids), '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'), (select ab from before_nets) - 1000,
  'the A/B balance is the same after B left, except L4''s 1000 that the cancelled settle-up no longer holds (D-25, owner answer 10)');
select extensions.is(public.t109_val('select status || (select count(*) from public.settlement_lines where settlement_id = ''' || public.t109_j('S1', 'settlement_id') || ''' and live)::text from public.settlements where id = ''' || public.t109_j('S1', 'settlement_id') || ''''),
  'cancelled0', 'B''s waiting settle-up is cancelled at departure and its line is no longer held (owner answer 10)');
select extensions.is(public.t109_val('select public.hh_line_locked(''d1000000-0000-0000-0000-000000000004'')::text'), 'false', 'L4 is unlocked at once');
select extensions.is(public.t109_val('select count(*) || min(params ->> ''reason'') from public.household_events where kind = ''settle_departed'' and subject_id = ''22222222-2222-2222-2222-222222222222'' and audience = array[''11111111-1111-1111-1111-111111111111''::uuid]'),
  '1left', 'A gets exactly one settle_departed notice (reason left)');
select extensions.is(public.hh_pair_net((select h from ids), '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'), (select ac from before_nets),
  'the A/C balance is unchanged by B leaving');
select extensions.is(public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222'), (select cb from before_nets),
  'the C/B balance is unchanged by B leaving');

-- 3. Privacy and server-only helpers ------------------------------------------------------------------------------------------
set local role authenticated;
select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*)::int from public.transactions where id in ('d1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000008')), 0,
  'A sees none of B''s personal rows after B left');
select extensions.is((select count(*)::int from public.transactions where copied_from is not null), 0, 'A sees none of B''s personal copies');
select extensions.throws_ok($$select new_household_id from public.member_departures$$, '42501', null, 'the leaver''s new household id has no client grant');
select extensions.is((select count(*)::int from public.household_former_members), 1, 'A reads the former-member row');
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.ok(not has_function_privilege('authenticated', 'public.hh_move_personal_rows(uuid,uuid,uuid)', 'execute'),
  'authenticated cannot execute the leave mover');
select extensions.is((select count(*)::int from pg_proc where proname = 'hh_move_rows' and pronamespace = 'public'::regnamespace), 1,
  'hh_move_rows has no overload');

-- 4. B sees what is left of the balance; A settles and writes off with a former member ------------------------------------------
set local role authenticated;
select public.t109_as('22222222-2222-2222-2222-222222222222');
insert into res select 'DEP', public.my_departed_balances();
select extensions.is(public.t109_j('DEP', 'balances,0,other_id'), '11111111-1111-1111-1111-111111111111', 'B sees a departed balance with A');
select extensions.is(public.t109_j('DEP', 'balances,0,amount'), '-1700', 'B sees "A owes you 1700" (negative = they owe B)');
-- Owner answer 11: the leaver says "I paid" for L4 (they owe A 1000); A confirms it the normal way.
select extensions.is(public.propose_leaver_payment('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000004']::uuid[], 1000) ->> 'reason', 'not_departed', 'a household B never left is refused');
select extensions.is(public.propose_leaver_payment((select h from ids), '55555555-5555-5555-5555-555555555555', array['d1000000-0000-0000-0000-000000000004']::uuid[], 1000) ->> 'reason', 'not_member', 'the receiver must still be a member');
select extensions.is(public.propose_leaver_payment((select h from ids), '11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000004']::uuid[], 999) ->> 'reason', 'lines_changed', 'the leaver''s payment checks the amount');
select extensions.is(public.propose_leaver_payment((select h from ids), '11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000001']::uuid[], 4200) ->> 'reason', 'nothing_owed', 'a line the leaver is owed rather than owes is refused');
insert into res select 'LP', public.propose_leaver_payment((select h from ids), '11111111-1111-1111-1111-111111111111', array['d1000000-0000-0000-0000-000000000004']::uuid[], 1000);
select extensions.is(public.t109_j('LP', 'ok') || public.t109_j('LP', 'amount'), 'true1000', 'B proposes "I paid" 1000 toward the household B left');
insert into res select 'DEP2', public.my_departed_balances();
select extensions.is(public.t109_j('DEP2', 'balances,0,pending_settlement_id'), public.t109_j('LP', 'settlement_id'), 'B sees the proposal waiting in their departed balances');
select extensions.is((select count(*)::int from public.transactions where name in ('L1', 'L2') and copied_from is null), 0, 'B can no longer read the household''s lines');

select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.confirm_settlement(public.t109_j('S1', 'settlement_id')::uuid, 'a1000000-0000-0000-0000-00000000000a') ->> 'reason', 'not_pending',
  'A''s "Got it" on B''s old settle-up answers not_pending: it was cancelled at departure');
select extensions.is(public.confirm_settlement(public.t109_j('LP', 'settlement_id')::uuid, 'a1000000-0000-0000-0000-00000000000a') ->> 'ok', 'true',
  'A confirms the leaver''s "I paid" with "Got it"');
select extensions.is(public.t109_val('select (payer_tx_id is null)::text || (receiver_tx_id is not null)::text || status from public.settlements where id = ''' || public.t109_j('LP', 'settlement_id') || ''''),
  'truetrueconfirmed', 'only A''s record is written; B records the money leaving in their own app');
select extensions.is(public.undo_settlement(public.t109_j('LP', 'settlement_id')::uuid) ->> 'reason', 'party_left',
  'a confirmed settle-up cannot be undone once a party has left, even inside 24 hours (owner answer 12)');
select extensions.is(public.record_paid('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000001']::uuid[],
  'a1000000-0000-0000-0000-00000000000a', 1) ->> 'reason', 'lines_changed', 'recording a payment to a former member checks the amount');
insert into res select 'PAID', public.record_paid('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000001']::uuid[],
  'a1000000-0000-0000-0000-00000000000a', 4200);
select extensions.is(public.t109_j('PAID', 'ok'), 'true', 'A records paying B 4200 (D-25: either person can still settle it)');
insert into res select 'WO', public.write_off_balance('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000002']::uuid[]);
select extensions.is(public.t109_j('WO', 'amount'), '1500', 'A writes off the 1500 B owed');
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.is(public.hh_pair_net((select h from ids), '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'), 0::bigint,
  'nothing is left between A and B');
select extensions.is(public.t109_val('select count(*) from public.transactions where is_settlement and settlement_id = ''' || public.t109_j('PAID', 'settlement_id') || ''''),
  '1', 'only A''s record was written (no confirmer exists)');

-- 5. Not an owner / not a member ---------------------------------------------------------------------------------------------
set local role authenticated;
select public.t109_as('33333333-3333-3333-3333-333333333333');
select extensions.is(public.remove_member('44444444-4444-4444-4444-444444444444') ->> 'reason', 'not_owner', 'a non-owner cannot remove a member');
select extensions.is(public.transfer_ownership('11111111-1111-1111-1111-111111111111') ->> 'reason', 'not_owner', 'a non-owner cannot transfer ownership');
select extensions.is(public.reinvite_removed('ffffffff-ffff-ffff-ffff-ffffffffffff') ->> 'reason', 'not_owner', 'a non-owner cannot re-invite');
select public.t109_as('55555555-5555-5555-5555-555555555555');
select extensions.is(public.leave_household() ->> 'reason', 'alone', 'a household of one cannot be left');

-- 6. Removal and the 24-hour reconnect ---------------------------------------------------------------------------------------
select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.remove_member('11111111-1111-1111-1111-111111111111') ->> 'reason', 'not_member', 'the owner cannot remove themselves');
select extensions.is(public.remove_member('55555555-5555-5555-5555-555555555555') ->> 'reason', 'not_member', 'a stranger is refused like a missing member');
insert into res select 'PD', public.propose_settlement('44444444-4444-4444-4444-444444444444', array['d1000000-0000-0000-0000-000000000006']::uuid[],
  'a1000000-0000-0000-0000-00000000000a', 3000);
insert into res select 'RM', public.remove_member('44444444-4444-4444-4444-444444444444');
select extensions.is(public.t109_j('RM', 'ok'), 'true', 'A removes D');
reset role;
select set_config('request.jwt.claims', '', true);
insert into res select 'DNEW', jsonb_build_object('h', (select household_id from public.household_members where user_id = '44444444-4444-4444-4444-444444444444'));
select extensions.is(public.t109_val('select (household_id = (select h from ids))::text from public.transactions where name = ''L6'''), 'true',
  'D''s shared L6 stays in the household');
select extensions.is(public.t109_val('select status from public.settlements where id = ''' || public.t109_j('PD', 'settlement_id') || ''''), 'cancelled',
  'a settle-up waiting on D is cancelled when A removes D (owner answer 10)');
select extensions.is(public.t109_val('select count(*) || min(params ->> ''reason'') from public.household_events where kind = ''settle_departed'' and subject_id = ''44444444-4444-4444-4444-444444444444'' and audience = array[''11111111-1111-1111-1111-111111111111''::uuid]'),
  '1removed', 'A gets one settle_departed notice (reason removed)');
select extensions.is(public.t109_val('select count(*) from public.accounts where tombstone_of = ''d4000000-0000-0000-0000-00000000000a'''), '1', 'D''s account has a tombstone');
select extensions.is(public.t109_val('select count(*) from public.transactions where copied_from = ''d1000000-0000-0000-0000-000000000006'''), '1', 'D has a personal copy of L6');
set local role authenticated;
select public.t109_as('44444444-4444-4444-4444-444444444444');
select extensions.is((select count(*)::int from public.household_events where kind = 'removed'), 1, 'D sees "You''re no longer in [household]" in their new household');
select extensions.is((select params ->> 'household_name' from public.household_events where kind = 'removed'), public.t109_val('select name from public.households where id = (select h from ids)'),
  'the notice names the household');
select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is((select count(*)::int from public.member_departures where kind = 'removed'), 1, 'A reads the departure record');
insert into res select 'RE', public.reinvite_removed(public.t109_j('RM', 'departure_id')::uuid);
select extensions.is(public.t109_j('RE', 'ok'), 'true', 'A re-invites D inside the 24 hours');
select public.t109_as('44444444-4444-4444-4444-444444444444');
select extensions.is(public.redeem_invite(replace(public.t109_j('RE', 'code'), '-', '')) ->> 'ok', 'true', 'D redeems the reconnect code');
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.is(public.t109_val('select household_id = (select h from ids) from public.household_members where user_id = ''44444444-4444-4444-4444-444444444444'''), 'true', 'D is a member again');
select extensions.is(public.t109_val('select role_label from public.household_members where user_id = ''44444444-4444-4444-4444-444444444444'''), 'Flatmate', 'D''s label is restored');
select extensions.is(public.t109_val('select count(*) from public.transactions where copied_from = ''d1000000-0000-0000-0000-000000000006'''), '0', 'the copies are erased');
select extensions.is(public.t109_val('select count(*) from public.accounts where tombstone_of is not null and created_by = ''44444444-4444-4444-4444-444444444444'''), '0', 'the tombstone is gone');
select extensions.is(public.t109_val('select account_id::text from public.transactions where name = ''L6'''), 'd4000000-0000-0000-0000-00000000000a', 'L6 is back on D''s own account');
select extensions.is(public.t109_val('select (household_id = (select h from ids))::text from public.accounts where id = ''d4000000-0000-0000-0000-00000000000a'''), 'true', 'D''s account is back in the household');
select extensions.is(public.t109_val('select count(*) from public.households where id = ' || quote_literal(public.t109_j('DNEW', 'h')) || '::uuid'), '0', 'the household of one is gone');
select extensions.is(public.t109_val('select count(*) from public.household_former_members where user_id = ''44444444-4444-4444-4444-444444444444'''), '0', 'the former-member row is gone');
select extensions.is(public.t109_val('select count(*) from public.household_events where kind = ''departure_undone'' and subject_id = ''44444444-4444-4444-4444-444444444444'''), '1', 'the household is told the removal was undone');
select extensions.is(public.t109_val('select string_agg(weight::text, '','' order by created_at) from public.household_members where household_id = (select h from ids)'), '34,33,33', 'weights are even again in join order');
select extensions.is(public.t109_val('select (restored_at is not null)::text from public.member_departures where id = ''' || public.t109_j('RM', 'departure_id') || ''''), 'true', 'the departure is marked restored');

-- 7. The window closes, and a used or wrong code does nothing --------------------------------------------------------------
set local role authenticated;
select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.reinvite_removed(public.t109_j('RM', 'departure_id')::uuid) ->> 'reason', 'already_restored', 'a restored departure cannot be re-invited again');
insert into res select 'RM2', public.remove_member('44444444-4444-4444-4444-444444444444');
reset role;
select set_config('request.jwt.claims', '', true);
update public.member_departures set undo_until = now() - interval '1 minute' where id = (select (j ->> 'departure_id')::uuid from res where k = 'RM2');
set local role authenticated;
select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.reinvite_removed(public.t109_j('RM2', 'departure_id')::uuid) ->> 'reason', 'window_closed', 'after 24 hours the re-invite is refused');

-- 8. Ownership -----------------------------------------------------------------------------------------------------------------
select extensions.is(public.transfer_ownership('55555555-5555-5555-5555-555555555555') ->> 'reason', 'not_member', 'ownership can only go to a member');
select extensions.is(public.transfer_ownership('33333333-3333-3333-3333-333333333333') ->> 'ok', 'true', 'the owner transfers ownership to C');
select extensions.is(public.t109_val('select is_owner::text || role_label from public.household_members where user_id = ''33333333-3333-3333-3333-333333333333'''), 'trueOwner', 'C is the owner');
select extensions.is(public.t109_val('select is_owner::text || role_label from public.household_members where user_id = ''11111111-1111-1111-1111-111111111111'''), 'falseFlatmate', 'A is a Flatmate now');
select public.t109_as('33333333-3333-3333-3333-333333333333');
select extensions.is(public.transfer_ownership('11111111-1111-1111-1111-111111111111') ->> 'ok', 'true', 'C hands it back');
select public.t109_as('11111111-1111-1111-1111-111111111111');
select extensions.is(public.leave_household() ->> 'reason', 'pick_new_owner', 'an owner who leaves must pick the new owner');
select extensions.is(public.leave_household('11111111-1111-1111-1111-111111111111') ->> 'reason', 'not_member', 'the new owner cannot be the leaver');
select extensions.is(public.leave_household('33333333-3333-3333-3333-333333333333') ->> 'ok', 'true', 'A leaves and C becomes the owner');
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.is(public.t109_val('select is_owner::text || (select owner_id::text from public.households where id = (select h from ids)) from public.household_members where user_id = ''33333333-3333-3333-3333-333333333333'''),
  'true33333333-3333-3333-3333-333333333333', 'C is the owner and households.owner_id says so');
select extensions.is(public.t109_val('select count(*) from public.household_events where kind = ''owner_changed'' and subject_id = ''33333333-3333-3333-3333-333333333333'''), '2', 'two owner_changed notices name C (the transfer and the leave)');

select * from extensions.finish();
rollback;
