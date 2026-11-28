// 10-20: static checks on the backup scripts. Run with `node --test scripts/ops/backup/backupScripts.test.mjs` (CI runs it
// since 10-review L-3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  const cnt = restore.lastIndexOf('counts.sql');
  assert.ok(del > 0 && cnt > 0 && del < cnt, 'deletion log must run before the final counts.sql');
  assert.match(restore, /36 \* 3600/);
  assert.match(restore, /trap /);
  assert.match(restore, /chmod 600/);
});

// 10-review S-4: a truncated backup must not pass because the deletion log lets tables shrink.
test('dump.sh records per-table row counts read from the dump itself', () => {
  assert.match(dump, /\^COPY/);
  assert.match(dump, /dump_tables/);
  assert.ok(dump.indexOf('dump_tables') < dump.indexOf('tar -czf'), 'dump counts must be in the manifest before packing');
});

test('restore-check.sh requires exact dump counts before the deletion log, then only the logged shrink', () => {
  const exact = restore.indexOf('dump_tables');
  const del = restore.indexOf('apply-deletion-log.sql');
  assert.ok(exact > 0 && exact < del, 'exact dump counts must be checked before the deletion log');
  assert.match(restore, /Number\(got\) !== Number\(n\)/);
  assert.match(restore, /logged_present/);
  assert.match(restore, /before\.auth_users\) - present/);
});

test('apply-deletion-log.sql deletes the logged users and is run inside a transaction', () => {
  assert.match(deletion, /delete from auth\.users/i);
  assert.match(deletion, /public\.account_deletion_log/);
  // 10-review L-3: the caller owns the transaction, so restore.sh can share one with the data load.
  assert.doesNotMatch(deletion, /^\s*(begin|commit);/im);
  assert.match(restore, /echo "begin;"; cat "\$HERE\/apply-deletion-log\.sql"; echo "commit;"/);
});

// 10-review L-3 (restore resurrects deleted users).
const realRestore = read('restore.sh');
const extract = read('extract-deletion-log.sh');

test('apply-deletion-log.sql fails loudly: missing log or a surviving logged user raises', () => {
  assert.match(deletion, /\\set ON_ERROR_STOP on/);
  assert.match(deletion, /to_regclass\('public\.account_deletion_log'\) is null/);
  assert.match(deletion, /still present after re-applying the log/);
  const del = deletion.search(/delete from auth\.users/i);
  const check = deletion.indexOf('still present after re-applying');
  assert.ok(del > 0 && check > del, 'the survivor check must come after the delete');
});

test('restore-check.sh fails when the deletion log cannot be applied', () => {
  assert.match(restore, /if ! \{ echo "begin;"; cat "\$HERE\/apply-deletion-log\.sql"/);
  assert.match(restore, /prepare-restore\.sql/);
});

test('restore.sh loads, merges newer deletions and re-applies the log in ONE transaction', () => {
  const begin = realRestore.indexOf('echo "begin;"');
  const load = realRestore.indexOf('cat "$main/data.sql"');
  const origin = realRestore.indexOf('session_replication_role = origin');
  const merge = realRestore.indexOf('insert into public.account_deletion_log');
  const apply = realRestore.indexOf('cat "$HERE/apply-deletion-log.sql"');
  const commit = realRestore.indexOf('echo "commit;"');
  assert.ok(begin > 0, 'begin');
  assert.ok(begin < load && load < origin && origin < merge && merge < apply && apply < commit, 'order: begin, load, triggers on, merge, apply, commit');
  assert.equal(realRestore.match(/echo "commit;"/g)?.length, 1, 'exactly one commit');
  assert.match(realRestore, /session_replication_role = replica/);
});

test('restore.sh refuses to run without a source for newer deletions unless the gap is accepted', () => {
  assert.match(realRestore, /DELETION_LOG_DB_URL/);
  assert.match(realRestore, /ONLY_BACKUP_LOG/);
  assert.match(realRestore, /CONFIRM_RESTORE/);
  assert.match(realRestore, /extract-deletion-log\.sh" "\$dir\/data\.sql" >> /);
  assert.match(realRestore, /Do NOT reopen the app/);
  assert.match(realRestore, /select count\(\*\) from auth\.users where id in \(select user_id from public\.account_deletion_log\)/);
});

test('no restore script leaks credentials', () => {
  for (const [name, s] of [['restore.sh', realRestore], ['extract-deletion-log.sh', extract]]) {
    assert.doesNotMatch(s, /set -x/, `${name} has set -x`);
    assert.doesNotMatch(s, /echo "?\$\{?(TARGET_DB_URL|DELETION_LOG_DB_URL|AGE_PRIVATE_KEY)/, `${name} echoes a secret`);
    assert.match(s, /set -euo pipefail/);
  }
});

// Runs the extractor on a small data.sql in the shape `supabase db dump --use-copy` writes. Skipped without bash.
const hasBash = spawnSync('bash', ['-c', 'true']).status === 0;
test('extract-deletion-log.sh prints the logged rows and fails on a dump without a log', { skip: !hasBash && 'no bash' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'dellog-'));
  const good = join(dir, 'good.sql');
  writeFileSync(
    good,
    [
      'COPY "public"."accounts" ("id", "name") FROM stdin;',
      'a1\tCurrent',
      '\\.',
      '',
      'COPY "public"."account_deletion_log" ("user_id", "deleted_at") FROM stdin;',
      '11111111-1111-4111-8111-111111111111\t2026-11-20 10:00:00+00',
      '22222222-2222-4222-8222-222222222222\t2026-11-21 11:00:00+00',
      '\\.',
      '',
    ].join('\n')
  );
  const ok = spawnSync('bash', [join(here, 'extract-deletion-log.sh'), good], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(ok.stdout.trim().split('\n'), [
    '11111111-1111-4111-8111-111111111111\t2026-11-20 10:00:00+00',
    '22222222-2222-4222-8222-222222222222\t2026-11-21 11:00:00+00',
  ]);

  const none = join(dir, 'none.sql');
  writeFileSync(none, 'COPY "public"."accounts" ("id") FROM stdin;\na1\n\\.\n');
  const bad = spawnSync('bash', [join(here, 'extract-deletion-log.sh'), none], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /no public\.account_deletion_log COPY block/);

  const cols = join(dir, 'cols.sql');
  writeFileSync(cols, 'COPY "public"."account_deletion_log" ("deleted_at", "user_id") FROM stdin;\n\\.\n');
  assert.notEqual(spawnSync('bash', [join(here, 'extract-deletion-log.sh'), cols], { encoding: 'utf8' }).status, 0);

  const cut = join(dir, 'cut.sql');
  writeFileSync(cut, 'COPY "public"."account_deletion_log" ("user_id", "deleted_at") FROM stdin;\n11111111-1111-4111-8111-111111111111\t2026-11-20\n');
  assert.notEqual(spawnSync('bash', [join(here, 'extract-deletion-log.sh'), cut], { encoding: 'utf8' }).status, 0, 'a block with no end marker fails');
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
