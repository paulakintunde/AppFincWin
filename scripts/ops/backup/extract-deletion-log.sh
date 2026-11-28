#!/usr/bin/env bash
# 10-review L-3 (restore resurrects deleted users): print the account_deletion_log rows held in a backup's data.sql, as
# COPY text lines (user_id <TAB> deleted_at). restore.sh uses this to carry deletions from NEWER backups into an older one
# it restores, so a person who deleted after the restored backup was taken stays deleted.
# Usage: extract-deletion-log.sh <data.sql>. Exit 1 when the file has no account_deletion_log COPY block or the block's
# columns are not (user_id, deleted_at): a log we cannot read is a failure, never an empty list.
set -euo pipefail

data="${1:?usage: extract-deletion-log.sh <data.sql>}"
header="$(grep -m1 -E '^COPY "?public"?\."?account_deletion_log"? ' "$data" || true)"
if [ -z "$header" ]; then
  echo "FAIL: no public.account_deletion_log COPY block in $data" >&2
  exit 1
fi
cols="$(printf '%s' "$header" | sed -E 's/^COPY [^(]*\(([^)]*)\).*$/\1/; s/"//g; s/ //g')"
if [ "$cols" != "user_id,deleted_at" ]; then
  echo "FAIL: account_deletion_log columns are ($cols), expected (user_id,deleted_at)" >&2
  exit 1
fi
awk '
  /^COPY "?public"?\."?account_deletion_log"? / { inb = 1; next }
  inb && /^\\\.$/ { inb = 0; done = 1; next }
  inb { print }
  END { if (!done) exit 1 }
' "$data"
