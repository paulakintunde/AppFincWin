-- pgTAP: plan 08-08 -- Realtime publication holds shared-capable tables only (HH-11, D-43).
-- Needs 20261122000400 and 20261122000900.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(34);

select extensions.ok(exists (select 1 from pg_publication where pubname = 'supabase_realtime'), 'supabase_realtime publication exists');

select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'), 1, 'transactions is published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'accounts'), 1, 'accounts is published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_events'), 1, 'household_events is published');

select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'households'), 0, 'households is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_members'), 0, 'household_members is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'statement_periods'), 0, 'statement_periods is not published (D-43)');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'), 0, 'profiles is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debts'), 0, 'debts is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'savings_goals'), 0, 'savings_goals is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'holdings'), 0, 'holdings is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'holding_lots'), 0, 'holding_lots is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'debt_line_applied'), 0, 'debt_line_applied is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename like 'decide\_%'), 0, 'no decide_* table is published');

select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename not in ('transactions', 'accounts', 'household_events', 'transaction_splits', 'settlements', 'settlement_lines', 'household_split_defaults', 'household_former_members', 'member_departures', 'household_plans')), 0, 'only shared-capable tables are published');

select extensions.is(has_table_privilege('authenticated', 'public.transactions', 'DELETE'), false, 'authenticated cannot hard-delete transactions');
select extensions.is(has_table_privilege('authenticated', 'public.accounts', 'DELETE'), false, 'authenticated cannot hard-delete accounts');
select extensions.is(has_table_privilege('authenticated', 'public.household_events', 'DELETE'), false, 'authenticated cannot hard-delete household_events');
select extensions.is(has_table_privilege('anon', 'public.transactions', 'SELECT'), false, 'anon cannot read transactions');
select extensions.is(has_table_privilege('anon', 'public.household_events', 'SELECT'), false, 'anon cannot read household_events');
select extensions.is(has_table_privilege('anon', 'public.accounts', 'SELECT'), false, 'anon cannot read accounts');

select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlements'), 1, 'settlements is published (08-23)');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlement_lines'), 1, 'settlement_lines is published (08-23 carry-in)');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_former_members'), 1, 'household_former_members is published (08-14 follow-up)');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'member_departures'), 1, 'member_departures is published (08-14 follow-up)');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transaction_splits'), 0, 'transaction_splits is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_split_defaults'), 0, 'household_split_defaults is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settlement_nudges'), 0, 'settlement_nudges is not published');
select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_invites'), 0, 'household_invites is not published');
select extensions.is(has_table_privilege('authenticated', 'public.settlements', 'DELETE'), false, 'authenticated cannot hard-delete settlements');
select extensions.is(has_table_privilege('authenticated', 'public.settlement_lines', 'DELETE'), false, 'authenticated cannot hard-delete settlement_lines');
select extensions.is(has_table_privilege('anon', 'public.settlements', 'SELECT'), false, 'anon cannot read settlements');
select extensions.is(has_table_privilege('anon', 'public.member_departures', 'SELECT'), false, 'anon cannot read member_departures');

select extensions.is((select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'household_plans'), 1, 'household_plans is published (09-02)');

select * from extensions.finish();
rollback;
