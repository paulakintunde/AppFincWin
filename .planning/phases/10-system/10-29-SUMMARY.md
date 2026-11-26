---
phase: 10-system
plan: 29
subsystem: ops/production
tags: [rollout, backups, ENV-16, ENV-19, DAT-05, D-08, D-19]
requires: [10-01, 10-20, 10-27]
provides:
  - Phase 10 schema, functions, secrets, Vault, auth hook and reviewer accounts live in production
  - Daily encrypted backup to R2 and a monthly restore check, both proven against production
key-files:
  created:
    - docs/ops/phase-10-rollout.md
  modified:
    - scripts/ops/backup/restore-check.sh
    - scripts/ops/backup/dump.sh
    - .github/workflows/backup.yml
    - docs/ops/backup-restore.md
requirements: [ENV-16, ENV-19, DAT-05]
metrics:
  completed: 2026-11-26
  status: COMPLETE (owner-approved rollout 2026-11-26)
---

# Phase 10 Plan 29: Production rollout Summary

All 15 rollout steps pass (`docs/ops/phase-10-rollout.md` has the result for each).

## What was done
- PR #193 merged (504ffc8e). Nine migrations (20261126000100..0800) pushed and listed. Six functions deployed. ALERTS_DELIVER_SECRET and EXPO_ACCESS_TOKEN set. Vault holds alerts_deliver_url and alerts_deliver_secret. The before-user-created hook is on. Reviewer accounts are created and sign in (200); a random email gets 401.
- Cron jobs are present, and alerts-deliver-minute returns 200.
- First backup: run 45806575260. R2_ENDPOINT carried the bucket name, so the object landed under `fincwin-backups/daily/`. The owner fixed the secret and deleted the stray copy; run 45851263752 landed under `daily/`.
- Restore check: two fixes in PR #195 (89a758bc).
  - It now skips tables postgres cannot truncate (auth.schema_migrations).
  - It starts production's auth version: the backup records GoTrue's version from /auth/v1/health in counts.json, and the restore writes it to supabase/.temp/gotrue-version.
  - Run 45853146569 passed: 89 tables, 11 users.
- Rehearsal (D-08): the owner counted the CI restore as the rehearsal ("count it").
- Expo enhanced push security is on (owner).

## Open, carried forward
- Proof of push security and of the FCM V1 upload: the first real push on a device (10-30).
- Hand spot-checks of three figures at the next monthly restore.
- Production `external_apple_enabled` is false. Sign in with Apple is mandatory before store submission.
- Owner: delete `C:\Users\harki\fincwin-backup.agekey` once the offline copies are confirmed.
