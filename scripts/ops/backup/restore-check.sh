#!/usr/bin/env bash
# 10-20 (DAT-05, D-08, D-19): restore the newest backup into a throwaway local Supabase stack and check it.
# Needs: supabase CLI 3.x, Docker, psql, age, aws CLI, node, tar.
# Env: AGE_PRIVATE_KEY, R2_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_DEFAULT_REGION=auto, optional BUCKET.
# Backups are never edited in place: this restores a COPY, then re-applies account_deletion_log (D-19) before any check.
set -euo pipefail

: "${AGE_PRIVATE_KEY:?AGE_PRIVATE_KEY is required}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required}"
BUCKET="${BUCKET:-fincwin-backups}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HERE/../../.." && pwd)"
LOCAL_DB="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
WORK="$(mktemp -d)"
KEY_FILE="$WORK/age.key"
cleanup() {
  rm -f "$KEY_FILE"
  rm -rf "$WORK"
}
trap cleanup EXIT

# 1. Newest backup (names carry the date, so a name sort is a date sort).
newest="$(aws s3 ls "s3://$BUCKET/daily/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | grep -E '^fincwin-[0-9]{4}-[0-9]{2}-[0-9]{2}\.dump\.age$' | sort | tail -n 1 || true)"
if [ -z "$newest" ]; then
  echo "FAIL: no backup found under daily/" >&2
  exit 1
fi
stem="${newest%.dump.age}"
aws s3 cp "s3://$BUCKET/daily/$newest" "$WORK/db.tgz.age" --endpoint-url "$R2_ENDPOINT" --only-show-errors
aws s3 cp "s3://$BUCKET/daily/$stem.counts.json" "$WORK/counts.json" --endpoint-url "$R2_ENDPOINT" --only-show-errors

# 2. Freshness: the newest backup must be younger than 36 hours (T-10-20-04: a silently stopped backup fails here).
taken_at="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).taken_at)' "$WORK/counts.json")"
taken_epoch="$(date -u -d "$taken_at" +%s)"
now_epoch="$(date -u +%s)"
if [ $((now_epoch - taken_epoch)) -gt $((36 * 3600)) ]; then
  echo "FAIL: newest backup $newest was taken $taken_at, more than 36 hours ago" >&2
  exit 1
fi

# 3. Decrypt (key file mode 600, removed by the trap).
umask 077
printf '%s\n' "$AGE_PRIVATE_KEY" > "$KEY_FILE"
chmod 600 "$KEY_FILE"
age -d -i "$KEY_FILE" -o "$WORK/db.tgz" "$WORK/db.tgz.age"
rm -f "$KEY_FILE"
tar -xzf "$WORK/db.tgz" -C "$WORK"

# 4. Throwaway local stack (migrations applied from git), then load the data into it.
cd "$REPO_ROOT"
# 10-29: start production's auth version (recorded by dump.sh), as `supabase link` would. The CLI reads it from
# supabase/.temp/gotrue-version. Older backups without it use the CLI default.
auth_version="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).auth_version||""))' "$WORK/counts.json")"
if printf '%s' "$auth_version" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+$'; then
  mkdir -p supabase/.temp
  printf '%s' "$auth_version" > supabase/.temp/gotrue-version
  echo "auth image: $auth_version"
fi
supabase db start
{
  echo "begin;"
  echo "set session_replication_role = replica;"
  cat "$HERE/prepare-restore.sql"
  cat "$WORK/data.sql"
  echo "commit;"
} | psql "$LOCAL_DB" -X -q -v ON_ERROR_STOP=1 -o /dev/null


# 5. 10-review S-4: before the deletion log touches anything, the restored copy must hold exactly the rows the dump
# held. dump.sh counts every COPY block of data.sql into the manifest (dump_tables), so a truncated or partial backup
# fails here instead of hiding behind the shrink that the deletion log is allowed to cause later.
psql "$LOCAL_DB" -X -At -v ON_ERROR_STOP=1 -f "$HERE/counts.sql" > "$WORK/restored-raw.json"
logged_present="$(psql "$LOCAL_DB" -X -At -v ON_ERROR_STOP=1 -c "select count(*) from auth.users where id in (select user_id from public.account_deletion_log)")"
node -e '
const fs = require("fs");
const dumped = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const raw = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const problems = [];
if (!dumped.dump_tables || typeof dumped.dump_tables !== "object") {
  console.error("FAIL: the manifest has no dump_tables (backup made before the S-4 fix); take a new backup");
  process.exit(1);
}
for (const [table, n] of Object.entries(dumped.dump_tables)) {
  // counts.sql covers public and auth only (minus the tables the dump leaves out).
  if (!/^(public|auth)\./.test(table)) continue;
  const got = raw.tables[table];
  if (got === undefined) { problems.push(`${table}: in the dump but missing after restore`); continue; }
  if (Number(got) !== Number(n)) problems.push(`${table}: dump holds ${n}, restored ${got}`);
}
for (const [table, n] of Object.entries(dumped.tables)) {
  if (Number(n) > 0 && !(table in dumped.dump_tables)) problems.push(`${table}: ${n} live rows but no COPY block in the dump`);
}
if (Number(raw.auth_users) === 0) problems.push("auth_users is 0 after restore");
if (problems.length) { console.error("FAIL (before the deletion log):\n" + problems.join("\n")); process.exit(1); }
' "$WORK/counts.json" "$WORK/restored-raw.json"

# 6. D-19: re-apply deletions BEFORE any later check (triggers on). 10-review L-3: the SQL raises if the log is missing or
# any logged user survives, and the check fails with it.
if ! { echo "begin;"; cat "$HERE/apply-deletion-log.sql"; echo "commit;"; } | psql "$LOCAL_DB" -X -At -v ON_ERROR_STOP=1; then
  echo "FAIL: the deletion log could not be re-applied to the restored copy" >&2
  exit 1
fi

# 7. Counts after the log. Only the logged users' rows may be gone: auth.users drops by exactly the logged users that were
# present, and with none present every table and the amount checksum must be unchanged.
psql "$LOCAL_DB" -X -At -v ON_ERROR_STOP=1 -f "$HERE/counts.sql" > "$WORK/restored.json"
node -e '
const fs = require("fs");
const before = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const after = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const present = Number(process.argv[3]);
const problems = [];
for (const [table, n] of Object.entries(before.tables)) {
  const got = after.tables[table];
  if (got === undefined) { problems.push(`${table}: missing after the deletion log`); continue; }
  if (present > 0 ? Number(got) > Number(n) : Number(got) !== Number(n)) problems.push(`${table}: before the log ${n}, after ${got}`);
}
if (Number(after.auth_users) !== Number(before.auth_users) - present) {
  problems.push(`auth_users: ${before.auth_users} before the log, ${after.auth_users} after, ${present} logged users present`);
}
if (present === 0 && after.transactions_original_amount_sum !== before.transactions_original_amount_sum) {
  problems.push(`transactions_original_amount_sum: ${before.transactions_original_amount_sum} before the log, ${after.transactions_original_amount_sum} after`);
}
if (Number(after.auth_users) === 0) problems.push("auth_users is 0 after restore");
if (problems.length) { console.error("FAIL:\n" + problems.join("\n")); process.exit(1); }
console.log(`restore check ok: ${process.argv[4]}, ${Object.keys(before.tables).length} tables, ${after.auth_users} users, ${present} deletions re-applied`);
' "$WORK/restored-raw.json" "$WORK/restored.json" "$logged_present" "$newest"
