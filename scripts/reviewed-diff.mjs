#!/usr/bin/env node
// 05.4-08 (ENG-28, D-14): the reviewed diff for engine changes.
//   node scripts/reviewed-diff.mjs --write <FIX-ID>
//       lists every changed answer (previous v3 vs new v3) in changes.json as unapproved and writes reports/reviewed/<FIX-ID>.html
//   node scripts/reviewed-diff.mjs --approve <FIX-ID> --reason-file <path>
//       marks that fix's entries approved (today's date), fills empty reasons from the file (one line per key, `key: reason`, colon then a space),
//       then rewrites answers.json from the current outputs. Entries still without a 20+ character reason stay unapproved and
//       block the rewrite, so the merge stays red until resolved.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'src/engine/decide/v3/__tests__/reviewed';
const CHANGES = join(ROOT, DIR, 'changes.json');
const MIN_REASON = 20;

function runJest(env) {
  const r = spawnSync('npx', ['jest', '-c', 'jest.engine.config.js', `${DIR}/write.test.ts`, '--runInBand'], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  return r.status ?? 1;
}

const args = process.argv.slice(2);
const mode = args[0];
const fix = args[1];
if ((mode !== '--write' && mode !== '--page' && mode !== '--approve') || !fix || fix.startsWith('--')) {
  console.error('usage: reviewed-diff.mjs --write <FIX-ID> | --page <FIX-ID> | --approve <FIX-ID> --reason-file <path>');
  process.exit(2);
}

// --page: read-only. Rebuilds reports/reviewed/<FIX-ID>.html from changes.json; answers.json and changes.json are not touched.
if (mode === '--page') {
  process.exit(runJest({ REVIEWED_PAGE: fix }));
}

if (mode === '--write') {
  process.exit(runJest({ REVIEWED_WRITE: fix }));
}

const rf = args.indexOf('--reason-file');
const reasons = new Map();
if (rf !== -1 && args[rf + 1]) {
  for (const line of readFileSync(args[rf + 1], 'utf8').split(/\r?\n/)) {
    const i = line.indexOf(': '); // keys contain colons; the separator is colon + space
    if (i > 0) reasons.set(line.slice(0, i).trim(), line.slice(i + 2).trim());
  }
}
const file = JSON.parse(readFileSync(CHANGES, 'utf8'));
const today = new Date().toISOString().slice(0, 10);
let open = 0;
for (const c of file.changes) {
  if (c.fixId !== fix) continue;
  if (c.reason.trim() === '' && reasons.has(c.key)) c.reason = reasons.get(c.key);
  if (c.reason.trim().length >= MIN_REASON) {
    c.approved = true;
    c.approvedAt = c.approvedAt ?? today;
  } else {
    c.approved = false;
    open += 1;
  }
}
writeFileSync(CHANGES, JSON.stringify(file, null, 2) + '\n');
if (open > 0) {
  console.error(`${open} change(s) for ${fix} still have no reason of ${MIN_REASON}+ characters: not approved, answers.json untouched.`);
  process.exit(1);
}
process.exit(runJest({ REVIEWED_WRITE: fix, REVIEWED_ACCEPT: '1' }));
