#!/usr/bin/env bash
# 10-20 (ENV-16, D-05/D-06): dump production through the session pooler, check it, encrypt it with age.
# Uses the Supabase CLI, as Supabase's own CI backup guide does: a raw Postgres dump pulls Supabase-internal roles and
# schemas that fail on restore. Needs: supabase CLI 3.x, psql, age, tar.
# Env: DB_URL (session pooler URL, secret), AGE_PUBLIC_KEY (public key only), OUT_DIR (default ./backup-out).
# Output in OUT_DIR: fincwin-YYYY-MM-DD.dump.age and fincwin-YYYY-MM-DD.counts.json. Nothing here prints DB_URL.
set -euo pipefail

: "${DB_URL:?DB_URL is required}"
: "${AGE_PUBLIC_KEY:?AGE_PUBLIC_KEY is required}"
OUT_DIR="${OUT_DIR:-./backup-out}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DAY="$(date -u +%F)"
WORK="$(mktemp -d)"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT
mkdir -p "$OUT_DIR"

# Row counts first, so a connection problem fails before any dump work.
psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -f "$HERE/counts.sql" > "$WORK/counts.json"
auth_users="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).auth_users))' "$WORK/counts.json")"
# 10-29: record production's auth (GoTrue) version, so the restore check starts the same auth image locally; an older
# local image lacks newer auth columns and the data load fails. Optional: without the URL and key it is left out.
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_ANON_KEY:-}" ]; then
  auth_version="$(curl -fsS --retry 3 "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_ANON_KEY" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(String(JSON.parse(s).version||"")))')"
  node -e 'const fs=require("fs");const p=process.argv[1];const j=JSON.parse(fs.readFileSync(p,"utf8"));j.auth_version=process.argv[2];fs.writeFileSync(p,JSON.stringify(j))' "$WORK/counts.json" "$auth_version"
fi
if [ "$auth_users" -eq 0 ]; then
  echo "FATAL: auth_users = 0, refusing to publish an empty backup" >&2
  exit 1
fi

supabase db dump --remote="$DB_URL" -f "$WORK/roles.sql" --role-only
supabase db dump --remote="$DB_URL" -f "$WORK/schema.sql"
# Transient or session-bound data is left out: devices and push_tokens reference auth.sessions (not dumped);
# rate_limits and alert_outbox are short-lived. The two storage vector tables are not restorable.
supabase db dump --remote="$DB_URL" -f "$WORK/data.sql" --data-only --use-copy \
  -x auth.sessions -x auth.refresh_tokens -x auth.audit_log_entries -x auth.one_time_tokens \
  -x public.devices -x public.push_tokens -x public.rate_limits -x public.alert_outbox \
  -x storage.buckets_vectors -x storage.vector_indexes

tar -czf "$WORK/db.tgz" -C "$WORK" roles.sql schema.sql data.sql
size="$(wc -c < "$WORK/db.tgz")"
if [ "$size" -lt 51200 ]; then
  echo "FATAL: dump is only $size bytes (< 51200), refusing to publish" >&2
  exit 1
fi

age -r "$AGE_PUBLIC_KEY" -o "$OUT_DIR/fincwin-$DAY.dump.age" "$WORK/db.tgz"
shred -u "$WORK/db.tgz" "$WORK/roles.sql" "$WORK/schema.sql" "$WORK/data.sql"
cp "$WORK/counts.json" "$OUT_DIR/fincwin-$DAY.counts.json"
echo "backup ok: fincwin-$DAY ($size bytes before encryption, $auth_users users)"
