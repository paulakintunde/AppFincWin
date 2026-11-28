---
phase: quick-261127-lrw
plan: 01
status: complete
date: 2026-11-27
---

# Quick 261127-lrw summary: Phase 10 review LOW items + owner wording (2026-11-27)

## What changed

- **L-1 alert version concurrency.** `src/db/alerts.ts` saves are compare-and-set on `version` (categories D-18 pattern).
  A lost race throws `VersionConflictError` with the server row; `src/data/mutations/alertSettings.ts` puts that row in
  the cache, invalidates the query and records a failed write (labels "Alert setting" / "Alert delivery setting"). A
  replay of a save that already landed is taken as success. No server change, no cache shape change (version 19 stays).
- **L-2 partner alert name after deletion.** `supabase/migrations/20261127090600_partner_alert_name_redact.sql`: BEFORE
  DELETE trigger `alerts_before_user_delete_redact` on `auth.users` sets `who = null, hidden = true` on other members'
  `partner_large` rows in `alert_log` and `alert_outbox` (link: ref transaction `created_by`; fallback: same-household
  display name). Never blocks a deletion. One-time catch-up for lines whose creator is already null. The outbox copy is
  what alerts-deliver reads, so an unsent push cannot carry the name.
- **L-3 restore resurrects deleted users.** `apply-deletion-log.sql` now raises when the log table is missing or a logged
  user survives (caller owns the transaction). New `scripts/ops/backup/restore.sh` is the production restore: data load,
  merge of deletion logs from newer backups (`extract-deletion-log.sh`) and/or the live DB (`DELETION_LOG_DB_URL`), and
  the re-apply, all in one transaction; it refuses to run without a newer-deletion source unless `ONLY_BACKUP_LOG=yes`.
  `prepare-restore.sql` shared with `restore-check.sh`. Backup script tests now run in CI. Runbook updated.
- **Owner A:** `partnerLargePrivate` = 'A household member spent {{amount}}.' (app catalogue + Edge Function, parity kept).
- **Owner B:** `partnerSub` = 'When someone in your home makes a large expense. Your large amount sets the size, even when
  your own large alert is off.' No behaviour change.

## Verification

- Jest: db/mutations/alerts suites (51 tests) and i18n + alert screens (29 suites) pass.
- Deno alerts-deliver: 40 passed.
- pgTAP 140 (10/10) plus 110, 122, 124, 137 pass against the local stack, run inside a rolled-back transaction with the
  pending 0900xx migrations.
- `node --test scripts/ops/backup/backupScripts.test.mjs`: 15 passed (extractor exercised under bash).
- eslint (changed files), `lint:migrations`, `check:cache-version`, `tsc --noEmit`.

## Production steps after merge (owner-approved)

- `npm run supabase:db:push` for `20261127090600_partner_alert_name_redact.sql`.
- Redeploy Edge Function `alerts-deliver` (text change).
- OTA for the app copy and the alert save change.
