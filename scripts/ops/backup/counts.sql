-- 10-20: row-count manifest. Counts and one checksum only: no names, notes or text.
-- Tables the dump leaves out on purpose (sessions, tokens, devices, push tokens, rate limits, alert outbox) are skipped.
-- Run with: psql -At -f counts.sql  (one JSON object on one line).
select json_build_object(
  'taken_at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'server_version', current_setting('server_version'),
  'tables', (
    select coalesce(json_object_agg(t.name, t.n order by t.name), '{}'::json)
    from (
      select format('%s.%s', schemaname, tablename) as name,
             (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', schemaname, tablename), false, true, '')))[1]::text::bigint as n
      from pg_tables
      where schemaname in ('public', 'auth')
        and format('%s.%s', schemaname, tablename) not in (
          'auth.sessions', 'auth.refresh_tokens', 'auth.audit_log_entries', 'auth.one_time_tokens',
          'public.devices', 'public.push_tokens', 'public.rate_limits', 'public.alert_outbox')
    ) t
  ),
  'transactions_original_amount_sum', (select coalesce(sum(original_amount), 0)::text from public.transactions),
  'auth_users', (select count(*) from auth.users),
  'deletion_log', (select count(*) from public.account_deletion_log)
);
