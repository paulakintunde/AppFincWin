-- pgTAP: Phase 8 plan 08-14 (HH-14; D-27, D-29, CMP-F23, SC6). The account-deletion rule: deleting an account is never
-- blocked; ownership passes to the member who joined earliest (who is told); everything personal is erased; shared lines the
-- person created stay as "Former member"; and the remaining members' balances are the same before and after, to the cent.
-- Also: a sole member's household goes with them, and a person who left earlier and then deletes keeps the balance stable.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(41);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
select ('' || n || n || n || n || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || '-' || n || n || n || n || n || n || n || n || n || n || n || n)::uuid,
       '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'u' || n || '@test.local',
       json_build_object('full_name', 'User ' || n)::jsonb, now(), now()
  from generate_series(1, 4) n;

create temp table ids as select (select id from public.households where owner_id = '11111111-1111-1111-1111-111111111111') as h,
                                (select id from public.households where owner_id = '44444444-4444-4444-4444-444444444444') as h4;
grant select on ids to authenticated;
create temp table res (k text primary key, j jsonb);
grant all on res to authenticated;

create function public.t110_as(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true)
$$;
create function public.t110_ver(p uuid) returns int language sql as $$ select version from public.transactions where id = p $$;
create function public.t110_val(q text) returns text language plpgsql security definer as $$
declare v text;
begin execute q into v; return v; end;
$$;
-- Personal rows of a person in the household tables that move with them: rows created by p_user (or with created_by null
-- when p_user is null) that are not shared. After an erasure none may be left, neither as theirs nor as orphans.
create function public.t110_personal(p_household uuid, p_user uuid) returns integer language plpgsql security definer as $$
declare
  m record;
  v_n integer := 0;
  v_c integer;
  v_shared boolean;
begin
  for m in select * from public.hh_move_tables() loop
    v_shared := exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.' || m.table_name) and a.attname = 'is_shared' and not a.attisdropped);
    execute format('select count(*) from public.%I where household_id = $1 and (%I = $2 or ($2 is null and %I is null))%s',
                   m.table_name, m.owner_column, m.owner_column, case when v_shared then ' and not is_shared' else '' end)
      into v_c using p_household, p_user;
    v_n := v_n + v_c;
  end loop;
  return v_n;
end;
$$;

-- A joined first, then B, then C; D is alone in their own household.
update public.household_members set created_at = now() - interval '3 days', weight = 50 where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.household_members where user_id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333');
insert into public.household_members (household_id, user_id, is_owner, weight, created_at, display_name) values
  ((select h from ids), '22222222-2222-2222-2222-222222222222', false, 30, now() - interval '2 days', 'Bea'),
  ((select h from ids), '33333333-3333-3333-3333-333333333333', false, 20, now() - interval '1 day', 'Cy');
update public.households set reporting_currency = 'USD' where id = (select h from ids);

insert into public.accounts (id, household_id, created_by, name, kind, currency, opening_balance, is_shared) values
  ('a1000000-0000-0000-0000-00000000000a', (select h from ids), '11111111-1111-1111-1111-111111111111', 'A personal', 'checking', 'USD', 0, false),
  ('a1000000-0000-0000-0000-00000000000b', (select h from ids), '11111111-1111-1111-1111-111111111111', 'Joint', 'checking', 'USD', 0, true),
  ('b2000000-0000-0000-0000-00000000000a', (select h from ids), '22222222-2222-2222-2222-222222222222', 'B personal', 'checking', 'USD', 0, false),
  ('c3000000-0000-0000-0000-00000000000a', (select h from ids), '33333333-3333-3333-3333-333333333333', 'C personal', 'checking', 'USD', 0, false),
  ('d4000000-0000-0000-0000-00000000000a', (select h4 from ids), '44444444-4444-4444-4444-444444444444', 'D personal', 'checking', 'USD', 0, false);

-- P1 A personal, S1 A paid 9000 (A+B+C even), S2 B paid 4500 (A+B+C even), S3 B paid 2000 (A+B even, settled up pending), J1 on the joint account
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status) values
  ('d1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -700, 'USD', current_date, 'UTC', 'P1 personal', 'paid'),
  ('d1000000-0000-0000-0000-000000000002', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', -9000, 'USD', current_date, 'UTC', 'S1', 'paid'),
  ('d1000000-0000-0000-0000-000000000003', (select h from ids), '22222222-2222-2222-2222-222222222222', 'b2000000-0000-0000-0000-00000000000a', -4500, 'USD', current_date, 'UTC', 'S2', 'paid'),
  ('d1000000-0000-0000-0000-000000000004', (select h from ids), '22222222-2222-2222-2222-222222222222', 'b2000000-0000-0000-0000-00000000000a', -2000, 'USD', current_date, 'UTC', 'S3', 'paid'),
  ('d4000000-0000-0000-0000-000000000001', (select h4 from ids), '44444444-4444-4444-4444-444444444444', 'd4000000-0000-0000-0000-00000000000a', -300, 'USD', current_date, 'UTC', 'D personal line', 'paid');
insert into public.transactions (id, household_id, created_by, account_id, original_amount, original_currency, local_date, time_zone, name, status)
  values ('d1000000-0000-0000-0000-000000000005', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000b', -1200, 'USD', current_date, 'UTC', 'J1 joint', 'paid');

-- A's other personal rows: a series, a loan, a pot, a dismissal, a payer prompt, a holding with a lot, a check.
insert into public.recurring_series (id, household_id, created_by, account_id, name, amount, currency, freq, anchor_date, time_zone)
  values ('e1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-00000000000a', 'A personal bill', -500, 'USD', 'monthly', current_date - 10, 'UTC');
insert into public.debts (id, household_id, created_by, name, kind, currency)
  values ('d2000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'Loan', 'loan', 'USD');
insert into public.savings_goals (id, household_id, created_by, kind, name, currency, target, ready_by)
  values ('b1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'pot', 'Car service', 'USD', 60000, current_date + 90);
insert into public.recurring_dismissals (id, household_id, created_by, payee_key, direction)
  values ('f1000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'netflix', 'out');
insert into public.income_payer_prompts (id, household_id, created_by, payer_key, income_kind, counts_as)
  values ('f2000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'acme', 'salary', 'available');
insert into public.holdings (id, household_id, created_by, name, type, currency, value, value_as_of)
  values ('f3000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'Fund', 'other', 'USD', 100, current_date);
insert into public.holding_lots (id, holding_id, household_id, created_by, kind, amount, local_date)
  values ('f4000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111', 'value', 100, current_date);
insert into public.decide_checks (id, household_id, created_by)
  values ('f5000000-0000-0000-0000-000000000001', (select h from ids), '11111111-1111-1111-1111-111111111111');

set local role authenticated;
select public.t110_as('11111111-1111-1111-1111-111111111111');
select public.share_transaction('d1000000-0000-0000-0000-000000000002', public.t110_ver('d1000000-0000-0000-0000-000000000002'), 'even',
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']::uuid[]);
select public.t110_as('22222222-2222-2222-2222-222222222222');
select public.share_transaction('d1000000-0000-0000-0000-000000000003', public.t110_ver('d1000000-0000-0000-0000-000000000003'), 'even',
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']::uuid[]);
select public.share_transaction('d1000000-0000-0000-0000-000000000004', public.t110_ver('d1000000-0000-0000-0000-000000000004'), 'even',
  array['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']::uuid[]);
-- a pending settle-up from A to B on S3 (A owes B 1000)
select public.t110_as('11111111-1111-1111-1111-111111111111');
insert into res select 'SET', public.propose_settlement('22222222-2222-2222-2222-222222222222', array['d1000000-0000-0000-0000-000000000004']::uuid[],
  'a1000000-0000-0000-0000-00000000000a', 1000);
reset role;
select set_config('request.jwt.claims', '', true);

create temp table before_nets as select
  public.hh_pair_net((select h from ids), '22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111') as ba,
  public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111') as ca,
  public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222') as cb,
  public.t110_personal((select h from ids), '11111111-1111-1111-1111-111111111111') as a_personal;

select extensions.is((select ba from before_nets), 1500::bigint, 'fixture: B owes A 1500 (3000 on S1 less 1500 on S2; S3 is locked by the pending settle-up)');
select extensions.is((select ca from before_nets), 3000::bigint, 'fixture: C owes A 3000');
select extensions.is((select cb from before_nets), 1500::bigint, 'fixture: C owes B 1500');
select extensions.ok((select a_personal from before_nets) >= 10, 'fixture: A has personal rows in the household tables (' || (select a_personal from before_nets) || ')');
select extensions.is(public.t110_val('select confdeltype::text from pg_constraint where conname = ''households_owner_id_fkey'''), 'n',
  'households.owner_id no longer cascades: on delete set null');

-- 1. Deleting the owner is never blocked ---------------------------------------------------------------------------------------
select extensions.lives_ok($$delete from auth.users where id = '11111111-1111-1111-1111-111111111111'$$, 'deleting the owner of a shared household succeeds');
select extensions.lives_ok($$set constraints all immediate$$, 'every deferred check holds after the deletion');
set constraints all deferred;

select extensions.is(public.t110_val('select count(*) from public.households where id = (select h from ids)'), '1', 'the household survives its owner''s deletion');
select extensions.is(public.t110_val('select is_owner::text || (select owner_id::text from public.households where id = (select h from ids)) from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222'''),
  'true22222222-2222-2222-2222-222222222222', 'ownership passed to B, who joined first after A');
select extensions.is(public.t110_val('select role_label from public.household_members where user_id = ''22222222-2222-2222-2222-222222222222'''), 'Owner', 'B''s label is Owner');
select extensions.is(public.t110_val('select count(*) from public.household_events where household_id = (select h from ids) and kind = ''owner_changed'' and subject_id = ''22222222-2222-2222-2222-222222222222'' and audience = array[''22222222-2222-2222-2222-222222222222''::uuid]'),
  '1', 'B is told, and only B');
select extensions.is(public.t110_val('select count(*) from public.household_members where household_id = (select h from ids)'), '2', 'two members remain');
select extensions.is(public.t110_val('select sum(weight)::text from public.household_members where household_id = (select h from ids)'), '100', 'the remaining weights re-split to 100');
select extensions.is(public.t110_val('select count(*) from public.household_events where household_id = (select h from ids) and kind = ''left'' and (params ->> ''deleted'')::boolean'), '1', 'the household is told a member left (deleted)');

-- 2. Everything personal is erased ------------------------------------------------------------------------------------------
select extensions.is(public.t110_personal((select h from ids), '11111111-1111-1111-1111-111111111111'), 0, 'no personal row of A is left in any household table');
select extensions.is(public.t110_personal((select h from ids), null), 0, 'and no orphaned personal row (created_by null, not shared) is left either');
select extensions.is(public.t110_val('select count(*) from public.transactions where id = ''d1000000-0000-0000-0000-000000000001'''), '0', 'A''s personal line is gone');
select extensions.is(public.t110_val('select count(*) from public.accounts where id = ''a1000000-0000-0000-0000-00000000000a'''), '0', 'A''s personal account is gone');
select extensions.is(public.t110_val('select count(*) from public.profiles where id = ''11111111-1111-1111-1111-111111111111'''), '0', 'A''s profile is gone');
select extensions.is(public.t110_val('select count(*) from public.recurring_series where id = ''e1000000-0000-0000-0000-000000000001'''), '0', 'A''s personal series is gone');

-- 3. Shared records stay as "Former member" ---------------------------------------------------------------------------------
select extensions.is(public.t110_val('select count(*) from public.transactions where name in (''S1'', ''S2'', ''S3'', ''J1 joint'') and is_shared'), '4', 'the shared lines stay');
select extensions.is(public.t110_val('select count(*) from public.transactions where name in (''S1'', ''J1 joint'') and created_by is null'), '2', 'the lines A created have no creator now (Former member)');
select extensions.is(public.t110_val('select (display_name is null)::text || reason from public.household_former_members where household_id = (select h from ids)'), 'truedeleted',
  'the former-member row carries no name and says deleted');
select extensions.is(public.t110_val('select count(*) from public.transaction_splits s join public.household_former_members f on f.former_key = s.former_member_key where s.member_id is null and s.household_id = (select h from ids)'),
  '4', 'A''s four shares have no member and the former-member key');
select extensions.is(public.t110_val('select (payer_id is null)::text || (payer_former_key = (select former_key from public.household_former_members where household_id = (select h from ids)))::text from public.settlements where id = ''' || (select j ->> 'settlement_id' from res where k = 'SET') || ''''),
  'truetrue', 'the pending settle-up names the former-member key');
select extensions.is(public.t110_val('select count(*) from public.accounts where tombstone_of = ''a1000000-0000-0000-0000-00000000000a'' and is_shared and created_by is null'), '1',
  'A''s account that held shared lines has an archived tombstone in the household');
set local role authenticated;
select public.t110_as('22222222-2222-2222-2222-222222222222');
select extensions.is((select count(*)::int from public.accounts where id = 'a1000000-0000-0000-0000-00000000000b'), 1, 'B still sees the joint account A created');
select extensions.is((select count(*)::int from public.transactions where name = 'J1 joint'), 1, 'and the line on it');
reset role;
select set_config('request.jwt.claims', '', true);

-- 4. The balances are the same afterwards (SC6) --------------------------------------------------------------------------------
create temp table key_a as select former_key as k from public.household_former_members where household_id = (select h from ids);
select extensions.is(public.hh_pair_net((select h from ids), '22222222-2222-2222-2222-222222222222', (select k from key_a)), (select ba from before_nets) - 1000,
  'B''s balance against A is the same after A''s account is deleted, except S3''s 1000 that the cancelled settle-up no longer holds');
select extensions.is(public.t110_val('select status || (select count(*) from public.settlement_lines where settlement_id = s.id and live)::text from public.settlements s where s.id = ''' || (select j ->> 'settlement_id' from res where k = 'SET') || ''''),
  'cancelled0', 'A''s waiting settle-up is cancelled when A deletes, and its line is no longer held (owner answer 10)');
select extensions.is(public.t110_val('select count(*) || min(params ->> ''reason'') from public.household_events where kind = ''settle_departed'' and ref_id = ''' || (select j ->> 'settlement_id' from res where k = 'SET') || ''' and audience = array[''22222222-2222-2222-2222-222222222222''::uuid]'),
  '1deleted', 'B gets exactly one settle_departed notice (reason deleted), and only B');
select extensions.is(public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', (select k from key_a)), (select ca from before_nets),
  'C''s balance against A is the same');
select extensions.is(public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222'), (select cb from before_nets),
  'the balance between B and C is the same');

-- 5. Someone who left earlier and then deletes: the balance with them stays stable ----------------------------------------------
set local role authenticated;
select public.t110_as('33333333-3333-3333-3333-333333333333');
select extensions.is(public.leave_household() ->> 'ok', 'true', 'C leaves');
reset role;
select set_config('request.jwt.claims', '', true);
select extensions.is(public.hh_pair_net((select h from ids), '33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222'), (select cb from before_nets), 'B and C: unchanged after C left');
select extensions.lives_ok($$delete from auth.users where id = '33333333-3333-3333-3333-333333333333'$$, 'C, who left earlier, deletes their account');
create temp table key_c as select former_key as k from public.household_former_members where household_id = (select h from ids) and reason = 'deleted' and user_id is null
  and former_key <> (select k from key_a);
select extensions.is(public.hh_pair_net((select h from ids), (select k from key_c), '22222222-2222-2222-2222-222222222222'), (select cb from before_nets),
  'B''s balance with the deleted former member C is the same');
select extensions.is(public.t110_val('select (display_name is null)::text || reason from public.household_former_members where former_key = (select k from key_c)'), 'truedeleted', 'C''s name is erased from the former-member row');

-- 6. A sole member's household goes with them -----------------------------------------------------------------------------------
select extensions.lives_ok($$delete from auth.users where id = '44444444-4444-4444-4444-444444444444'$$, 'D, alone in their household, deletes their account');
select extensions.is(public.t110_val('select count(*) from public.households where id = (select h4 from ids)'), '0', 'D''s household is gone');
select extensions.is(public.t110_val('select (select count(*) from public.accounts where id = ''d4000000-0000-0000-0000-00000000000a'') + (select count(*) from public.transactions where id = ''d4000000-0000-0000-0000-000000000001'')'), '0', 'and everything in it');

select * from extensions.finish();
rollback;
