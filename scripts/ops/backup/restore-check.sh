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
cat > "$WORK/prepare.sql" <<'SQL'
do $$
declare r record;
begin
  -- 10-29: skip tables postgres may not truncate (auth.schema_migrations is owned by supabase_auth_admin; it is
  -- migration bookkeeping, not data, and the fresh local stack already has it right).
  for r in select format('%I.%I', schemaname, tablename) as t from pg_tables
           where schemaname in ('public', 'auth', 'storage')
             and has_table_privilege(format('%I.%I', schemaname, tablename), 'TRUNCATE') loop
    execute 'truncate table ' || r.t || ' cascade';
  end loop;
end $$;
SQL
{
  echo "begin;"
  echo "set session_replication_role = replica;"
  cat "$WORK/prepare.sql"
  cat "$WORK/data.sql"
  echo "commit;"
} | psql "$LOCAL_DB" -X -q -v ON_ERROR_STOP=1 -o /dev/null

# 5. D-19: re-apply deletions BEFORE any check (triggers on).
psql "$LOCAL_DB" -X -At -v ON_ERROR_STOP=1 -f "$HERE/apply-deletion-log.sql"

# 6. Counts, then compare with the manifest taken at dump time.
psql "$LOCAL_DB" -X -At -v ON_ERROR_STOP=1 -f "$HERE/counts.sql" > "$WORK/restored.json"
node -e '
const fs = require("fs");
const dumped = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const restored = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const logged = Number(dumped.deletion_log);
const problems = [];
for (const [table, n] of Object.entries(dumped.tables)) {
  const got = restored.tables[table];
  if (got === undefined) { problems.push(`${table}: missing after restore`); continue; }
  // Deleting a logged user cascades into auth.* and public.* rows, so with a non-empty log a table may only shrink.
  const mayShrink = logged > 0 || table === "auth.users";
  if (mayShrink ? Number(got) > Number(n) : Number(got) !== Number(n)) problems.push(`${table}: dumped ${n}, restored ${got}`);
}
if (logged === 0 && restored.transactions_original_amount_sum !== dumped.transactions_original_amount_sum) {
  problems.push(`transactions_original_amount_sum: dumped ${dumped.transactions_original_amount_sum}, restored ${restored.transactions_original_amount_sum}`);
}
if (Number(restored.auth_users) === 0) problems.push("auth_users is 0 after restore");
if (problems.length) { console.error("FAIL:\n" + problems.join("\n")); process.exit(1); }
console.log(`restore check ok: ${process.argv[3]}, ${Object.keys(dumped.tables).length} tables, ${restored.auth_users} users`);
' "$WORK/counts.json" "$WORK/restored.json" "$newest"
