#!/usr/bin/env node
// 05.4-33 (APP-07): the persisted query cache's shapes may not change without a CACHE_SCHEMA_VERSION bump.
//
// The TanStack Query cache is persisted to the device (src/data/cache/persister.ts). An app update that changes the shape of a
// cached row must bump CACHE_SCHEMA_VERSION (the persist buster), or the update hydrates old rows into code that expects the new
// shape. This check hashes what decides those shapes and compares it, and the version, with scripts/cache-shape.lock.json.
//
// Hashed, in this order (line endings normalised, so Windows and CI agree):
//   1. every `*_COLUMNS` / `*_COLUMN` constant in src/db/*.ts (the select lists: what each cached row holds), by file and name;
//   2. src/db/rows.ts (the row types);
//   3. src/data/keys.ts (the query keys: what each cache entry is).
// Not hashed: the engine's types (the v3 Result / Evaluation carries bigints and is never cached), and inline .select('...')
// strings outside a *_COLUMNS constant (none feed a persisted Decide read; add a constant when one should count).
//
//   node scripts/check-cache-version.mjs            check (CI)
//   node scripts/check-cache-version.mjs --update   after bumping CACHE_SCHEMA_VERSION, record the new hash and version
//   --root <dir>                                     run against another tree (tests)

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LOCK_PATH = 'scripts/cache-shape.lock.json';
export const PERSISTER_PATH = 'src/data/cache/persister.ts';
const DB_DIR = 'src/db';
const WHOLE_FILES = ['src/db/rows.ts', 'src/data/keys.ts'];
const VERSION_PATTERN = /export const CACHE_SCHEMA_VERSION = '([^']+)'/;
const COLUMNS_PATTERN = /(?:export\s+)?const\s+([A-Z0-9_]+_COLUMNS?)\s*=\s*([\s\S]*?);/g;

const read = (root, rel) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** The persisted-shape text, one entry per part, in a fixed order. */
export function shapeParts(root = ROOT) {
  const parts = [];
  const files = readdirSync(join(root, DB_DIR))
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .sort();
  for (const f of files) {
    const text = read(root, `${DB_DIR}/${f}`);
    for (const m of text.matchAll(COLUMNS_PATTERN)) {
      parts.push(`${DB_DIR}/${f}#${m[1]}=${m[2].replace(/\s+/g, ' ').trim()}`);
    }
  }
  for (const rel of WHOLE_FILES) parts.push(`${rel}\n${read(root, rel)}`);
  return parts;
}

export function shapeHash(root = ROOT) {
  return createHash('sha256').update(shapeParts(root).join('\n\u0000\n')).digest('hex');
}

export function schemaVersion(root = ROOT) {
  const m = read(root, PERSISTER_PATH).match(VERSION_PATTERN);
  if (m === null) throw new Error(`CACHE_SCHEMA_VERSION not found in ${PERSISTER_PATH}`);
  return m[1];
}

function readLock(root) {
  try {
    const lock = JSON.parse(read(root, LOCK_PATH));
    return typeof lock?.version === 'string' && typeof lock?.hash === 'string' ? lock : null;
  } catch {
    return null;
  }
}

/** { ok, message }. Passes only when the hash and the version both equal the lock. */
export function check(root = ROOT) {
  const hash = shapeHash(root);
  const version = schemaVersion(root);
  const lock = readLock(root);
  if (lock === null) {
    return { ok: false, message: `${LOCK_PATH} is missing or unreadable: run npm run check:cache-version -- --update` };
  }
  if (lock.hash === hash && lock.version === version) {
    return { ok: true, message: `cache shapes unchanged (version ${version})` };
  }
  if (lock.version === version) {
    return { ok: false, message: 'persisted shapes changed: bump CACHE_SCHEMA_VERSION and run npm run check:cache-version -- --update' };
  }
  return {
    ok: false,
    message: `CACHE_SCHEMA_VERSION is ${version} but ${LOCK_PATH} records ${lock.version}: run npm run check:cache-version -- --update`,
  };
}

export function update(root = ROOT) {
  const lock = { version: schemaVersion(root), hash: shapeHash(root) };
  writeFileSync(join(root, LOCK_PATH), `${JSON.stringify(lock, null, 2)}\n`);
  return lock;
}

function main(argv) {
  const at = argv.indexOf('--root');
  const root = at >= 0 && argv[at + 1] ? argv[at + 1] : ROOT;
  if (argv.includes('--update')) {
    const lock = update(root);
    console.log(`check:cache-version: lock updated (version ${lock.version})`);
    return 0;
  }
  const result = check(root);
  (result.ok ? console.log : console.error)(`check:cache-version: ${result.message}`);
  return result.ok ? 0 : 1;
}

const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && same(fileURLToPath(import.meta.url), resolve(process.argv[1]))) {
  process.exitCode = main(process.argv.slice(2));
}
