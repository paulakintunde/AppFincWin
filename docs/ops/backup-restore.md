# Backup and restore runbook

Phase 10 plan 20 (ENV-16, DAT-05; D-05 to D-08, D-19, D-31). FincWin runs on Supabase Free, which has no managed backups, so backups are taken outside Supabase.

## What runs

| Job | Workflow | When | What it does |
|---|---|---|---|
| backup | `.github/workflows/backup.yml` | daily 04:23 UTC (`23 4 * * *`) from `main`, or by hand | Dumps production through the IPv4 session pooler with `supabase db dump` (roles, schema, data), tars and encrypts it with age to the public key, uploads to R2 |
| keep-alive | same file, own job | daily | Reads `public.app_config` through PostgREST and calls `/auth/v1/health`, so the Free-plan project never sits idle for 7 days. Runs even if the dump fails |
| restore-check | `.github/workflows/restore-check.yml` | 05:17 UTC on the 3rd of each month (`17 5 3 * *`), or by hand | Restores the newest backup into a throwaway local Supabase stack in CI, re-applies the deletion log, compares counts. Fails when no backup is newer than 36 hours or any figure differs. GitHub emails the owner on a failed scheduled run |

Objects in the private R2 bucket `fincwin-backups` (US jurisdiction), prefix `daily/`:

- `fincwin-YYYY-MM-DD.dump.age`: age-encrypted `tar.gz` of `roles.sql`, `schema.sql`, `data.sql`.
- `fincwin-YYYY-MM-DD.counts.json`: row counts per table, `transactions_original_amount_sum`, `auth_users`, `deletion_log`. Counts and one checksum only, no names or text.

The bucket lifecycle rule deletes objects 30 days after upload (D-07). The workflow never deletes anything.

Left out of the data dump on purpose: `auth.sessions`, `auth.refresh_tokens`, `auth.audit_log_entries`, `auth.one_time_tokens`, `public.devices`, `public.push_tokens` (reference sessions), `public.rate_limits`, `public.alert_outbox` (short-lived), and the two `storage` vector tables (not restorable). People sign in again after a restore.

## Secrets and keys

Names only. Values are set by the owner (docs/ops/phase-10-owner-setup.md).

- Backup job: secrets `SUPABASE_DB_URL_POOLER`, `R2_ENDPOINT`, `R2_BACKUP_ACCESS_KEY_ID`, `R2_BACKUP_SECRET_ACCESS_KEY`; variable `AGE_PUBLIC_KEY` (a public key, safe to show).
- Keep-alive: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the publishable key).
- Restore job (GitHub environment `restore`, or repository secrets if Path B was chosen): `AGE_PRIVATE_KEY`, `R2_RESTORE_ACCESS_KEY_ID`, `R2_RESTORE_SECRET_ACCESS_KEY`.
- The age private key exists only in the `restore` environment and in the owner's own offline copy (password manager).
- **If the age private key is lost, every backup is unreadable and cannot be recovered.** Keep the offline copy. If the key is replaced, set the new `AGE_PUBLIC_KEY`; older backups still need the old key until they expire after 30 days.

## Manual rehearsal (D-08)

Run once by hand (plan 10-29), then after any change to the dump flags. Uses the dev machine's Docker, so nothing needs installing besides the Supabase CLI.

1. Download the newest `daily/` pair from R2 with the restore token (S3 API, endpoint from `R2_ENDPOINT`, region `auto`).
2. Decrypt: `docker run --rm -v "$PWD:/w" -w /w alpine sh -c "apk add --no-cache age >/dev/null && age -d -i age.key -o db.tgz fincwin-DATE.dump.age"`, then `tar -xzf db.tgz`.
3. In a clean checkout run `npx supabase db start` (local stack, migrations from git applied).
4. Load the data as `scripts/ops/backup/restore-check.sh` does: in one transaction set `session_replication_role = replica`, truncate the `public`, `auth` and `storage` tables, run `data.sql`, commit.
5. Run `scripts/ops/backup/apply-deletion-log.sql` (triggers on). Never skip this (D-19).
6. Run `scripts/ops/backup/counts.sql` and compare with `counts.json`. Tables may only be lower where a logged deletion cascaded.
7. Spot-check three figures by hand (for example one account balance, one goal, one month total) against the app.
8. Confirm the server major with `select version()` on production and record it; the CLI's dump image must match.
9. Fill in a row below.

| Date | Dump object | Server version | auth.users | transactions | other table counts | transactions_original_amount_sum match | Spot checks (3 figures) | Flag changes | Result |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

## Production restore (human-run)

Only after a real loss. Backups are never edited in place; the restore is a copy.

1. Create a new Supabase project (or reset the existing one). Update `supabase/config.toml`'s `project_id` and `SUPABASE_PROD_PROJECT_REF` in `.env.local`.
2. Apply migrations from git (`npm run supabase:db:push`, which runs the preflight).
3. Decrypt the chosen backup (see rehearsal steps 1 and 2) and load `data.sql` as in rehearsal step 4, against the new project's database URL.
4. Run `scripts/ops/backup/apply-deletion-log.sql` against it **before re-opening the app**. Deleted people must not come back (D-19).
5. Re-create the Vault secrets `alerts_deliver_url` and `alerts_deliver_secret`, and the function secrets (`EXPO_ACCESS_TOKEN`, `ALERTS_DELIVER_SECRET`, and the rest of the owner-setup list).
6. Re-enable the auth providers and the `before_user_created` hook. Cron jobs come back with the migrations.
7. Point the app's `SUPABASE_URL` and publishable key at the new project (OTA or rebuild), and refresh the GitHub secrets `SUPABASE_DB_URL_POOLER`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.

## Residual gap

A deletion made after the newest dump is in the live `account_deletion_log`, not in the backup. After a restore from that backup the person exists again until someone re-deletes them. The log is kept 35 days and each backup 30 days, so any deletion still covered by a backup is also in the log of the dump taken after it, but a loss of production itself loses the live log. The restore re-applies only what the dump contains. Mitigation: after a production restore, check for support requests and re-delete anyone who deleted within the last day.

## Privacy copy note

The delete screen and the privacy policy say: "Backup copies are kept for 30 days, then they are gone too."
