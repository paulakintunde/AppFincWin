-- pgTAP: Phase 8 meta-test (08-06, RESEARCH Pitfall 1, CMP-F18). Every table with a household_id column must be
-- classified for visibility here, and its policies must match the class. A new table cannot ship with a policy that
-- relies on household membership alone: add it to the `classified` list below with its class.
--
-- Classes:
--   owner            created_by / owner_id / user_id only (personal data of one member)
--   shared_or_owner  is_shared or created_by (transactions, accounts, recurring_series)
--   account_derived  follows the visibility of the card account (statement_periods, D-43)
--   derived          follows a parent row (transaction_splits -> transactions, settlement_lines -> settlements)
--   party            visible to the two parties (settlements: payer_id / receiver_id)
--   household        all members by design (membership, notices, shared rules, defaults)
-- Phase 8 tables created by later plans are pre-listed; rows are filtered by to_regclass() until the table exists.

begin;
create extension if not exists pgtap with schema extensions;

select extensions.plan(13);

create temp table classified (table_name text primary key, class text not null, parent text);
insert into classified (table_name, class, parent) values
  -- owner (current tables)
  ('debts', 'owner', null), ('recurring_dismissals', 'owner', null), ('income_payer_prompts', 'owner', null),
  ('decide_checks', 'owner', null), ('decide_links', 'owner', null), ('decide_changes', 'owner', null),
  ('decide_settings', 'owner', null), ('decide_answers', 'owner', null), ('savings_goals', 'owner', null),
  ('undo_log', 'owner', null), ('import_profiles', 'owner', null), ('custom_currencies', 'owner', null),
  ('dismissed_series_offers', 'owner', null), ('holdings', 'owner', null), ('holding_lots', 'owner', null),
  -- owner (later Phase 8 tables)
  ('household_invites', 'owner', null), ('transaction_member_categories', 'owner', null),
  -- shared_or_owner
  ('transactions', 'shared_or_owner', null), ('accounts', 'shared_or_owner', null), ('recurring_series', 'shared_or_owner', null),
  -- account_derived, derived, party
  ('statement_periods', 'account_derived', 'accounts'),
  ('transaction_splits', 'derived', 'transactions'), ('settlement_lines', 'derived', 'settlements'),
  ('settlements', 'party', null),
  -- household (all members by design)
  ('households', 'household', null), ('household_members', 'household', null), ('household_events', 'household', null),
  ('category_rules', 'household', null), ('household_split_defaults', 'household', null),
  ('household_former_members', 'household', null), ('member_departures', 'household', null);
delete from classified where to_regclass('public.' || table_name) is null;

-- Policies as the planner sees them: the using expression, or the check expression for insert-only policies.
create temp table pol as
select p.tablename as table_name, p.policyname, p.cmd, coalesce(p.qual, p.with_check, '') as expr
  from pg_policies p where p.schemaname = 'public';

-- 1. Every household_id table is classified.
select extensions.is(
  (select array_agg(c.table_name order by c.table_name)::text
     from information_schema.columns c
     join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'household_id' and t.table_type = 'BASE TABLE'
      and c.table_name not in (select table_name from classified)),
  null,
  'every household_id table is classified (add new tables to 102 with their visibility class)'
);

-- 2. owner and shared_or_owner: every select/all policy names the creator or owner column.
select extensions.is(
  (select count(*)::int from pol p join classified k on k.table_name = p.table_name
    where k.class in ('owner', 'shared_or_owner') and p.cmd in ('SELECT', 'ALL')
      and p.expr !~ '(created_by|owner_id|user_id)'),
  0,
  'no select/all policy on a personal-class table relies on household membership alone'
);

-- 2b. ... and no such table is left without a select-capable policy (it would silently pass the check above).
select extensions.is(
  (select array_agg(k.table_name order by k.table_name)::text from classified k
    where k.class in ('owner', 'shared_or_owner')
      and not exists (select 1 from pol p where p.table_name = k.table_name and p.cmd in ('SELECT', 'ALL'))),
  null,
  'every personal-class table has a select-capable policy'
);

-- 3. shared_or_owner: every select policy mentions is_shared.
select extensions.is(
  (select count(*)::int from pol p join classified k on k.table_name = p.table_name
    where k.class = 'shared_or_owner' and p.cmd in ('SELECT', 'ALL') and p.expr !~ 'is_shared'),
  0,
  'every select policy on a shared-or-owner table mentions is_shared'
);

-- 4a. account_derived: the select policy goes through the parent accounts table.
select extensions.is(
  (select count(*)::int from pol p join classified k on k.table_name = p.table_name
    where k.class = 'account_derived' and p.cmd in ('SELECT', 'ALL') and p.expr !~ 'accounts'),
  0,
  'statement_periods select policy is derived from the card account (D-43)'
);

-- 4b. derived: the select policy mentions the parent table.
select extensions.is(
  (select count(*)::int from pol p join classified k on k.table_name = p.table_name
    where k.class = 'derived' and p.cmd in ('SELECT', 'ALL') and p.expr !~ k.parent),
  0,
  'derived tables select through their parent table'
);

-- 4c. party: the select policy names both payer_id and receiver_id.
select extensions.is(
  (select count(*)::int from pol p join classified k on k.table_name = p.table_name
    where k.class = 'party' and p.cmd in ('SELECT', 'ALL') and not (p.expr ~ 'payer_id' and p.expr ~ 'receiver_id')),
  0,
  'party tables are visible to payer_id and receiver_id only'
);

-- 5. Every classified table has row level security on.
select extensions.is(
  (select array_agg(k.table_name order by k.table_name)::text from classified k
     join pg_class c on c.oid = to_regclass('public.' || k.table_name)
    where not c.relrowsecurity),
  null,
  'every classified table has row level security enabled'
);

-- 6. No public base table with a household_id column has RLS off.
select extensions.is(
  (select array_agg(c.relname order by c.relname)::text from pg_class c
     join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    where c.relkind = 'r' and not c.relrowsecurity
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped)),
  null,
  'no public table with a household_id column is without row level security'
);

-- 7. Member data with no household_id column.
-- decide_check_history (06.1): owner-only through created_by.
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.decide_check_history'::regclass),
  'decide_check_history has row level security enabled'
);
select extensions.ok(
  (select count(*) > 0 and bool_and(p.expr ~ 'created_by')
     from pol p where p.table_name = 'decide_check_history' and p.cmd in ('SELECT', 'INSERT', 'ALL')),
  'every select/insert policy on decide_check_history names created_by'
);

-- debt_line_applied (Grow): server-only bookkeeping, RLS on, no policy, no client grant.
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.debt_line_applied'::regclass)
  and not exists (select 1 from pol p where p.table_name = 'debt_line_applied'),
  'debt_line_applied has row level security on and no policy'
);
select extensions.ok(
  not has_table_privilege('authenticated', 'public.debt_line_applied', 'select')
  and not has_table_privilege('anon', 'public.debt_line_applied', 'select'),
  'debt_line_applied has no select grant for authenticated or anon'
);

select * from extensions.finish();
rollback;
