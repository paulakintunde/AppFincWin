# Phase 2.1 — PDF statement import: rollout record

Date: 2026-10-11

## Task 1 — PR, gate, production schema push

PR: https://github.com/paulakintunde/AppFincWin/pull/60 (CI: checks, secret-scan, rls, deno — all green)
Main commit: 22f8f57122314607a45b96872a3b5de28d1b9331

Gate (feat/02.1-pdf-import, after code-review fixes):
- typecheck OK; lint 0 errors; depcruise no violations; check:ignores OK; verify:gates GATES OK
- test:coverage 247 suites / 6624 tests passed, thresholds held
- lint:migrations COMPAT OK; verify:migrations MIGRATION GATE OK; money and recurring mirrors up to date
- test:deno 11/11
- `supabase db reset --local && supabase test db`: Files=50, Tests=970, Result: PASS

Precondition: production latest applied migration was 20261010000600 (no newer remote migration).

Stamp checksum before the push (rows with updated_at < T0):
- T0: 2026-10-11 16:03:48.467181+00
- n=294, home_sum=1236893, digest=fb7b268889e79de20828a92de43e8c2c

Push: `npm run supabase:db:push -- --yes` from the merged main checkout (preflight chained; FincWin token exported per command, never printed). Applied:
- 20261011000100_statement_uploads_bucket.sql
- 20261011000200_statement_uploads_purge.sql
- 20261011000300_statement_conversions.sql

`supabase migration list --linked` afterwards: 20261011000100, 20261011000200 and 20261011000300 present in both Local and Remote.

## Task 2 — functions, secrets, live checks

Deployed from 22f8f57: `read-pdf-statement` (JWT verified, 1.3 MB) and `purge-statement-uploads` (`--no-verify-jwt`, 758 kB).
Purge secret: generated in a node process (never printed), set as function secret STATEMENT_PURGE_SECRET, kept in C:/dev/fincwin/.env.local (gitignored); temp env file deleted. Vault rows statement_purge_url and statement_purge_secret created (HTTP 201 each).

Live checks (Management API, read-only unless noted):

| Check | Result |
|---|---|
| bucket statement-uploads | public=false, file_size_limit=10485760, allowed_mime_types={application/pdf} |
| storage policies on the bucket | exactly 1, cmd INSERT |
| cron statement-uploads-purge-hourly | schedule `17 * * * *` |
| existing cron jobs (recurring-materialise-daily, record-tombstone-purge-daily) | 2 present |
| Vault rows (count only) | 2 |
| IMP-05 columns on transactions | 4 (stmt_orig_amount, stmt_orig_currency, conversion_source, fx_fee_of) |
| conversion_source is_generated | ALWAYS |
| trigger clear_stmt_conversion_on_edit | 1 |
| read-pdf-statement with no Authorization | 401 |
| purge-statement-uploads, wrong secret | 403 |
| purge-statement-uploads, real secret | 200 `{"ok":true,"removed":0,"batches":0}` |
| objects in statement-uploads | 0 |

Stamp checksum after the push (same T0 filter): n=294, home_sum=1236893, digest=fb7b268889e79de20828a92de43e8c2c — **identical**. Rows written after T0: 0. conversion_source='market' rows = 49 = rows with a market rate_source; 'statement' rows = 0.

## Task 3 — device walkthrough

(pending)
