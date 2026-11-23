// 10-20: static checks on the backup scripts. Run with `node --test scripts/ops/backup/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, f), 'utf8');
const dump = read('dump.sh');
const restore = read('restore-check.sh');
const deletion = read('apply-deletion-log.sql');
const counts = read('counts.sql');

test('dump.sh uses the supabase CLI against the URL, in three files', () => {
  assert.match(dump, /supabase db dump --remote="\$DB_URL"/);
  assert.match(dump, /--role-only/);
  assert.match(dump, /--data-only/);
  assert.match(dump, /--use-copy/);
  assert.doesNotMatch(dump, /pg_dump/);
});

test('dump.sh excludes transient and session data', () => {
  for (const t of [
    'auth.sessions',
    'auth.refresh_tokens',
    'auth.audit_log_entries',
    'auth.one_time_tokens',
    'public.devices',
    'public.push_tokens',
    'public.rate_limits',
    'public.alert_outbox',
    'storage.buckets_vectors',
    'storage.vector_indexes',
  ]) {
    assert.ok(dump.includes(`-x ${t}`), `missing exclude ${t}`);
  }
});

test('dump.sh encrypts to the public key, shreds plaintext and checks size and users', () => {
  assert.match(dump, /age -r "\$AGE_PUBLIC_KEY"/);
  assert.match(dump, /shred -u/);
  assert.match(dump, /51200/);
  assert.match(dump, /auth_users/);
});

test('restore-check.sh restores without triggers, re-applies deletions before counting, checks 36 h', () => {
  assert.match(restore, /session_replication_role = replica/);
  const del = restore.indexOf('apply-deletion-log.sql');
  const cnt = restore.indexOf('counts.sql');
  assert.ok(del > 0 && cnt > 0 && del < cnt, 'deletion log must run before counts.sql');
  assert.match(restore, /36 \* 3600/);
  assert.match(restore, /trap /);
  assert.match(restore, /chmod 600/);
});

test('apply-deletion-log.sql deletes the logged users in one transaction', () => {
  assert.match(deletion, /^\s*begin;/im);
  assert.match(deletion, /delete from auth\.users/i);
  assert.match(deletion, /public\.account_deletion_log/);
  assert.match(deletion, /commit;/i);
});

test('counts.sql emits the manifest fields and skips excluded tables', () => {
  for (const k of ['taken_at', 'server_version', 'tables', 'transactions_original_amount_sum', 'auth_users', 'deletion_log']) {
    assert.ok(counts.includes(k), `counts.sql missing ${k}`);
  }
  assert.match(counts, /alert_outbox/);
});

test('no script leaks credentials', () => {
  for (const [name, s] of [['dump.sh', dump], ['restore-check.sh', restore]]) {
    assert.doesNotMatch(s, /set -x/, `${name} has set -x`);
    assert.doesNotMatch(s, /echo "?\$\{?DB_URL/, `${name} echoes DB_URL`);
    assert.doesNotMatch(s, /echo "?\$\{?AGE_PRIVATE_KEY/, `${name} echoes the private key`);
    assert.match(s, /set -euo pipefail/);
  }
});
