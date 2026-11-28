---
phase: quick-261127-lrw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/alerts.ts
  - src/db/errors.ts
  - src/data/mutations/alertSettings.ts
  - src/i18n/locales/en.ts
  - src/db/__tests__/systemTables.test.ts
  - src/data/mutations/__tests__/systemMutations.test.tsx
  - supabase/migrations/20261127090600_partner_alert_name_redact.sql
  - supabase/tests/database/140_partner_alert_name_redact.test.sql
  - scripts/ops/backup/apply-deletion-log.sql
  - scripts/ops/backup/prepare-restore.sql
  - scripts/ops/backup/extract-deletion-log.sh
  - scripts/ops/backup/restore.sh
  - scripts/ops/backup/restore-check.sh
  - scripts/ops/backup/backupScripts.test.mjs
  - .github/workflows/ci.yml
  - docs/ops/backup-restore.md
  - src/i18n/locales/system/push.ts
  - src/i18n/locales/system/alerts.ts
  - supabase/functions/alerts-deliver/text.ts
  - supabase/functions/alerts-deliver/text.test.ts
  - src/features/alerts/__tests__/AlertLogScreen.test.tsx
autonomous: true
requirements: [10-review L-1, 10-review L-2, 10-review L-3, owner 2026-11-27 A, owner 2026-11-27 B]
---

# Quick 261127-lrw: Phase 10 review LOW items and two owner wording decisions

Branch `fix/10-review-low` from `origin/main`.

## Tasks

1. **L-1 alert version concurrency.** `upsertAlertSetting` / `upsertAlertPrefs` become compare-and-set on `version`
   (insert when version 0, 23505 = conflict; update `.eq('version', expected)`, zero rows = conflict), the categories D-18
   pattern. `VersionConflictError` carries the server row; the mutation shows it, invalidates the query and records a
   failed write. A replay that already landed is accepted (WR-A13 `acceptIfAlreadyApplied`). No cache shape change.
2. **L-2 partner alert name after deletion.** Migration `20261127090600`: BEFORE DELETE trigger on `auth.users`
   (security definer, `search_path=''`, sorts before `hh_before_user_delete`) redacts `who`/`hidden` on other members'
   `partner_large` rows in `alert_log` and `alert_outbox`, linked by ref transaction `created_by`, with a same-household
   name fallback. One-time catch-up for lines whose creator is already null. pgTAP 140.
3. **L-3 restore resurrects deleted users.** `apply-deletion-log.sql` raises on a missing log or a surviving logged user;
   new `restore.sh` loads a backup, merges deletion logs from newer backups and/or the live DB, and re-applies the log in
   one transaction, refusing to run without a newer-deletion source unless `ONLY_BACKUP_LOG=yes`. Node tests in CI.
   Runbook updated.
4. **Owner A:** `partnerLargePrivate` = 'A household member spent {{amount}}.' in app + Edge Function, tests updated.
5. **Owner B:** `partnerSub` copy says partner alerts arrive even when the own large alert is off; decision comment.

## Verify

Jest (db, mutations, alerts, i18n), eslint on changed files, `tsc --noEmit`, `lint:migrations`, `check:cache-version`,
Deno tests for alerts-deliver, pgTAP 140 plus 110/122/124/137 against the local stack, `node --test` backup scripts.
