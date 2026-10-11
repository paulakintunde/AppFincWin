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

Device: Pixel 9 (Android), development build e07f9578 (dev client; Phase 2.1 adds no native module — package.json changed only in scripts), Metro on port 8077 serving main 22f8f57, then PR #62's branch for the retests. Walkthrough start: 2026-10-11T16:14:18Z.

Walkthrough approved by the user on 2026-10-11 ("all approved"), steps 1–17 and 9b, after two fixes found during it:
- Step 5: the "This statement shows a £1,000.00 limit" offer did not appear because the test account was created with Credit limit typed as 0; import treated 0 as a real limit, against D-49. Fixed by quick task 261011-eio (PR #62): a limit of 0 counts as no limit in import, and the account sheet saves 0 as no limit. Retested on "Visa 2" (credit limit blank) and approved by the user.
- Step 9b: entering the closing balance (2021.70) left all 10 rows "Can't verify". Root cause: the one sign-ambiguous PDF row (no debit/credit column, no running balance) was read as money in, so the end-to-end check missed by 37.00. Fixed in PR #62 (signFromEnds: flips the single sign-uncertain row only when that makes opening + rows equal the stated closing exactly; the row stays flagged). Debug record: .planning/debug/resolved/pdf-closing-balance-unverified.md. Retested on the device and approved by the user (expected: 9 verified, 1 to tick).
- Steps 13 (privacy-policy publication) and 14 (iPhone XR): recorded by the user as part of the approval; iOS pending Apple enrolment.

Production evidence after the walkthrough (read-only):
- statement-uploads objects: 0
- IMP-05 (e0): rows imported since the walkthrough start with conversion_source 'statement' = 5, all stmt_orig_currency USD; fee lines linked to a statement-converted purchase = 5 (PDF, OFX ×2, CSV, plus the retest); imports by format: pdf 115, csv 46, ofx 10
- Purge cron statement-uploads-purge-hourly: succeeded at 19:17, 20:17 and 21:17 UTC
- read-pdf-statement (Dashboard, Overview): 26 invocations, 5xx 0%, 4xx 3.8% (the one deliberate unauthenticated check, 401); average execution 187 ms, **max 1,957 ms** (worst case 25 pages, < 10,000 ms — no D-07 gap); average memory 3.3 MB
- Function log lines (Dashboard, Logs): metadata only — {fn, outcome, durationMs, pageCount, byteSize, removed: true, errorClass}; no statement text, account numbers or password. The Management API log endpoint returned no rows, so this was read in the dashboard.

Follow-up PR: #62 (merged, main ef8bbfa4f0a0aade5703e905f19b69a82e7fb0da).

## Preview APK (second phone)

- Build: d7f35c19-5456-4261-8eaf-a348987665d8 (profile preview, Android), from main ef8bbfa
- Install URL: https://expo.dev/artifacts/eas/b4fKCse8fg4DphILzO8PosxFdreKPgRwrmahUNdMexk.apk
- Earlier attempt c7c72336 failed at CONFIGURE_EXPO_UPDATES (runtime fingerprint mismatch) because it was started from a worktree whose node_modules was a junction; rebuilt from a checkout with its own node_modules.
