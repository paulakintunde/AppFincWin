-- 10-20: empty the data tables of a freshly migrated database before a backup's data.sql is loaded into it.
-- Shared by restore-check.sh (throwaway local stack) and restore.sh (production restore, 10-review L-3).
do $$
declare r record;
begin
  -- 10-29: skip tables postgres may not truncate (auth.schema_migrations is owned by supabase_auth_admin; it is
  -- migration bookkeeping, not data, and the fresh stack already has it right).
  for r in select format('%I.%I', schemaname, tablename) as t from pg_tables
           where schemaname in ('public', 'auth', 'storage')
             and has_table_privilege(format('%I.%I', schemaname, tablename), 'TRUNCATE') loop
    execute 'truncate table ' || r.t || ' cascade';
  end loop;
end $$;
