#!/usr/bin/env bash
# 10-review L-3 (restore resurrects deleted users): the production restore (docs/ops/backup-restore.md), as one script so
# the deletion log can never be skipped. A backup taken before someone deleted their account still holds that person;
# loading it alone would bring them back. So this script:
#   1. decrypts the chosen backup and loads its data,
#   2. merges into account_deletion_log every deletion it can find that is NEWER than that backup: the logs inside any
#      newer backups given after it, and the live log of the old database when DELETION_LOG_DB_URL can still reach it,
#   3. re-applies the whole log (apply-deletion-log.sql, triggers on), which raises if any logged person survives,
# all in ONE transaction. If any step fails, nothing is committed and the script exits non-zero: the target keeps the
# empty, freshly migrated schema and the app must not be reopened.
#
# Usage:
#   TARGET_DB_URL=... AGE_PRIVATE_KEY=... CONFIRM_RESTORE=replace-all-data \
#     bash scripts/ops/backup/restore.sh <backup-to-restore.dump.age> [<newer-backup.dump.age> ...]
# Optional: DELETION_LOG_DB_URL (the old production, if it still answers), AGE_KEY_FILE instead of AGE_PRIVATE_KEY.
# With no newer backup and no DELETION_LOG_DB_URL, set ONLY_BACKUP_LOG=yes to accept that deletions made after the backup
# cannot be re-applied (the runbook's residual gap); otherwise the script stops.
# Needs: psql, age, tar, awk. Nothing here prints a URL or the key.
set -euo pipefail

: "${TARGET_DB_URL:?TARGET_DB_URL is required (the database to restore INTO)}"
if [ "${CONFIRM_RESTORE:-}" != "replace-all-data" ]; then
  echo "FAIL: set CONFIRM_RESTORE=replace-all-data; this empties every public, auth and storage table in the target" >&2
  exit 1
fi
if [ "$#" -lt 1 ]; then
  echo "usage: restore.sh <backup-to-restore.dump.age> [<newer-backup.dump.age> ...]" >&2
  exit 1
fi
if [ "$#" -lt 2 ] && [ -z "${DELETION_LOG_DB_URL:-}" ] && [ "${ONLY_BACKUP_LOG:-}" != "yes" ]; then
  echo "FAIL: no newer backup and no DELETION_LOG_DB_URL, so deletions made after this backup would come back." >&2
  echo "      Pass the newer backups too, or set DELETION_LOG_DB_URL, or set ONLY_BACKUP_LOG=yes to accept the gap." >&2
  exit 1
fi

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
KEY_FILE="$WORK/age.key"
cleanup() {
  rm -f "$KEY_FILE"
  rm -rf "$WORK"
}
trap cleanup EXIT
umask 077
if [ -n "${AGE_KEY_FILE:-}" ]; then
  cp "$AGE_KEY_FILE" "$KEY_FILE"
else
  : "${AGE_PRIVATE_KEY:?AGE_PRIVATE_KEY (or AGE_KEY_FILE) is required}"
  printf '%s\n' "$AGE_PRIVATE_KEY" > "$KEY_FILE"
fi
chmod 600 "$KEY_FILE"

# Decrypt one backup into its own folder; prints the folder.
unpack() {
  local src="$1" dir
  dir="$(mktemp -d "$WORK/b.XXXXXX")"
  age -d -i "$KEY_FILE" -o "$dir/db.tgz" "$src"
  tar -xzf "$dir/db.tgz" -C "$dir"
  rm -f "$dir/db.tgz"
  if [ ! -s "$dir/data.sql" ]; then
    echo "FAIL: $src holds no data.sql" >&2
    exit 1
  fi
  printf '%s' "$dir"
}

# 1. The backup to restore, and its own deletion log (which must be readable).
main="$(unpack "$1")"
bash "$HERE/extract-deletion-log.sh" "$main/data.sql" > /dev/null

# 2. Deletions newer than that backup.
: > "$WORK/extra_deletions.tsv"
shift
for newer in "$@"; do
  dir="$(unpack "$newer")"
  bash "$HERE/extract-deletion-log.sh" "$dir/data.sql" >> "$WORK/extra_deletions.tsv"
  rm -rf "$dir"
  echo "deletion log merged from $(basename "$newer")"
done
if [ -n "${DELETION_LOG_DB_URL:-}" ]; then
  psql "$DELETION_LOG_DB_URL" -X -At -v ON_ERROR_STOP=1 \
    -c "\\copy (select user_id, deleted_at from public.account_deletion_log) to stdout" >> "$WORK/extra_deletions.tsv"
  echo "deletion log merged from the live database"
fi
rm -f "$KEY_FILE"

# 3. One transaction: load without triggers, merge the newer deletions, re-apply the log with triggers on, verify.
if ! {
  echo "\\set ON_ERROR_STOP on"
  echo "begin;"
  echo "set session_replication_role = replica;"
  cat "$HERE/prepare-restore.sql"
  cat "$main/data.sql"
  echo "set session_replication_role = origin;"
  echo "create temp table extra_deletions (user_id uuid not null, deleted_at timestamptz not null) on commit drop;"
  echo "\\copy extra_deletions (user_id, deleted_at) from '$WORK/extra_deletions.tsv'"
  echo "insert into public.account_deletion_log (user_id, deleted_at)"
  echo "  select user_id, min(deleted_at) from extra_deletions group by user_id on conflict (user_id) do nothing;"
  cat "$HERE/apply-deletion-log.sql"
  echo "commit;"
} | psql "$TARGET_DB_URL" -X -q -v ON_ERROR_STOP=1 -o /dev/null; then
  echo "FAIL: the restore was rolled back (load or deletion log failed). Do NOT reopen the app." >&2
  exit 1
fi

# 4. Check again from outside the transaction.
present="$(psql "$TARGET_DB_URL" -X -At -v ON_ERROR_STOP=1 \
  -c "select count(*) from auth.users where id in (select user_id from public.account_deletion_log)")"
logged="$(psql "$TARGET_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from public.account_deletion_log")"
users="$(psql "$TARGET_DB_URL" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from auth.users")"
if [ "$present" != "0" ]; then
  echo "FAIL: $present deleted account(s) present after the restore. Do NOT reopen the app." >&2
  exit 1
fi
echo "restore ok: $users users, $logged deletions in the log, none present"
