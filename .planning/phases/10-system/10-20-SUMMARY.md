---
phase: 10-system
plan: 20
subsystem: ops
tags: [backup, restore, age, r2, github-actions, supabase-cli]
requires: [10-10]
provides: [daily encrypted backup, keep-alive, monthly restore check, backup runbook]
affects: [10-29]
key-files:
  created:
    - .github/workflows/backup.yml
    - .github/workflows/restore-check.yml
    - scripts/ops/backup/dump.sh
    - scripts/ops/backup/restore-check.sh
    - scripts/ops/backup/apply-deletion-log.sql
    - scripts/ops/backup/counts.sql
    - scripts/ops/backup/backupScripts.test.mjs
    - docs/ops/backup-restore.md
  modified:
    - .gitattributes
requirements: [ENV-16, DAT-05]
completed: 2026-11-23
---

# Phase 10 Plan 20: Backups Summary

Daily age-encrypted production dump (Supabase CLI, session pooler) to R2, an independent daily keep-alive, a monthly restore check into the local stack that re-applies the deletion log first, and the runbook. Nothing has run live; the first real run and the manual rehearsal belong to 10-29.

## Commits
- d2f0d34f feat(10-20): scripts and test
- eaf97583 feat(10-20): workflows and runbook

## Deviations from Plan

**1. [Orchestrator instruction] Dump via `supabase db dump`, not raw pg_dump.** CLI 3.1.0 has no `--db-url`; the flag is `--remote=<url>` (confirmed with `supabase db dump --help`). Roles, schema and data (`--data-only --use-copy`, with `-x` for the plan's excluded tables plus `storage.buckets_vectors` and `storage.vector_indexes`) are dumped as three files, tarred, and age-encrypted as one `fincwin-DATE.dump.age`. The 50 KB floor applies to the tar.gz. The CLI runs pg_dump in a container, so the runner only needs `psql` (for counts.sql). The plan's pg_dump fallback was not needed.
**2. [Rule 3] Restore shape follows from the CLI dump.** Restore starts a fresh local stack (migrations from git), then in one transaction sets `session_replication_role = replica`, truncates public/auth/storage tables, loads `data.sql`. It does not replay `schema.sql`/`roles.sql` (the migrations already built the schema). Whether truncating `storage.*` and `auth.schema_migrations` is right against a real dump is unverified: confirm in 10-29.
**3. [Rule 1] Keep-alive** pings `public.app_config` (the only anon-readable table) via PostgREST plus `/auth/v1/health`, as its own job.
**4. [Rule 3] Test command.** `node --test scripts/ops/backup/` fails on Node 24 (treats the directory as a module); run `node --test scripts/ops/backup/backupScripts.test.mjs`.
**5. [Rule 2] `.gitattributes`: `*.sh text eol=lf`** so shell scripts are not checked out CRLF on Windows.
**6.** Restore-check freshness uses `taken_at` from counts.json (36 h), not the object date. Counts exclude the tables left out of the dump, so equality checks are meaningful; with a non-empty deletion log tables may only shrink.

## Verification
- `bash -n` on both shell scripts: pass.
- `node --test scripts/ops/backup/backupScripts.test.mjs`: 7 passed, 0 failed.
- Workflow YAML parsed with the `yaml` package (action-validator failed to start: ERR_MODULE_NOT_FOUND; actionlint not installed). All `uses:` pinned to 40-char SHAs; backup.yml has no AGE_PRIVATE_KEY; restore-check has `environment: restore` and the plan's grep checks pass.
- Not run (no secrets, no age/psql/aws locally, wave-2 stack rule): dump.sh, restore-check.sh, counts.sql and apply-deletion-log.sql against a real database. counts.sql (xpath/query_to_xml) and the restore load are untested SQL.

## For the orchestrator / 10-29
- First real run (workflow_dispatch of backup.yml, then restore-check.yml) and the manual rehearsal row are in 10-29. Check there: `supabase db dump --remote=<pooler url>` works with the session pooler; data.sql restores cleanly after the truncate; counts.sql runs on production (pgTAP/psql not run here).
- Workflows only schedule from `main`; the `restore` environment or Path B secrets must exist.
- No STATE.md/ROADMAP.md changes made.

## Known Stubs
None.

## Self-Check: PASSED
