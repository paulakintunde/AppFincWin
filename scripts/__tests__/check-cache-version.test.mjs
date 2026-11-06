// 05.4-33 (APP-07): the cache-version check on a temporary tree. node --test (Jest ignores scripts/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, schemaVersion, shapeHash, shapeParts, update, LOCK_PATH, PERSISTER_PATH } from '../check-cache-version.mjs';

function tree(version = '3') {
  const root = mkdtempSync(join(tmpdir(), 'cache-version-'));
  for (const d of ['src/db', 'src/data/cache', 'scripts']) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, 'src/db/accounts.ts'), "export const ACCOUNT_COLUMNS =\r\n  'id, name, overdraft_rate';\r\nconst OTHER = 1;\r\n");
  writeFileSync(join(root, 'src/db/profile.ts'), "export const REGION_SUBDIVISION_COLUMN = 'region_subdivision';\n");
  writeFileSync(join(root, 'src/db/rows.ts'), 'export interface AccountRow { id: string }\n');
  writeFileSync(join(root, 'src/data/keys.ts'), "export const queryKeys = { accounts: (h) => ['accounts', h] };\n");
  writeFileSync(join(root, PERSISTER_PATH), `export const CACHE_SCHEMA_VERSION = '${version}';\n`);
  return root;
}
const edit = (root, rel, from, to) => writeFileSync(join(root, rel), readFileSync(join(root, rel), 'utf8').replace(from, to));

test('reads the version and every *_COLUMNS / *_COLUMN constant', () => {
  const root = tree();
  try {
    assert.equal(schemaVersion(root), '3');
    const parts = shapeParts(root);
    assert.ok(parts.includes("src/db/accounts.ts#ACCOUNT_COLUMNS='id, name, overdraft_rate'"));
    assert.ok(parts.includes("src/db/profile.ts#REGION_SUBDIVISION_COLUMN='region_subdivision'"));
    assert.equal(parts.filter((p) => p.includes('OTHER')).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a missing lock fails; --update writes it and the check then passes', () => {
  const root = tree();
  try {
    assert.equal(check(root).ok, false);
    assert.match(check(root).message, /--update/);
    const lock = update(root);
    assert.deepEqual(JSON.parse(readFileSync(join(root, LOCK_PATH), 'utf8')), lock);
    assert.equal(lock.version, '3');
    assert.equal(check(root).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a changed select list with no bump fails with the bump message; a bump plus --update passes', () => {
  const root = tree();
  try {
    update(root);
    edit(root, 'src/db/accounts.ts', 'overdraft_rate', 'overdraft_rate, due_day');
    const r = check(root);
    assert.equal(r.ok, false);
    assert.match(r.message, /persisted shapes changed: bump CACHE_SCHEMA_VERSION/);
    edit(root, PERSISTER_PATH, "'3'", "'4'");
    assert.match(check(root).message, /records 3/);
    update(root);
    assert.equal(check(root).ok, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a changed query key or row type fails too; reverting passes', () => {
  const root = tree();
  try {
    update(root);
    edit(root, 'src/data/keys.ts', "'accounts'", "'accounts-v2'");
    assert.equal(check(root).ok, false);
    edit(root, 'src/data/keys.ts', "'accounts-v2'", "'accounts'");
    assert.equal(check(root).ok, true);
    edit(root, 'src/db/rows.ts', 'id: string', 'id: number');
    assert.equal(check(root).ok, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('line endings do not change the hash; whitespace inside a select list is normalised', () => {
  const a = tree();
  const b = tree();
  try {
    writeFileSync(join(b, 'src/db/accounts.ts'), "export const ACCOUNT_COLUMNS =\n    'id, name, overdraft_rate';\nconst OTHER = 1;\n");
    assert.equal(shapeHash(a), shapeHash(b));
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test('an unreadable lock or a persister with no version fails', () => {
  const root = tree();
  try {
    writeFileSync(join(root, LOCK_PATH), '{ not json');
    assert.equal(check(root).ok, false);
    writeFileSync(join(root, LOCK_PATH), JSON.stringify({ version: 3 }));
    assert.equal(check(root).ok, false);
    writeFileSync(join(root, PERSISTER_PATH), 'export const nothing = 1;\n');
    assert.throws(() => schemaVersion(root), /CACHE_SCHEMA_VERSION not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
