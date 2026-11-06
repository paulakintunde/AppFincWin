#!/usr/bin/env node
// 05.4-41 (D-15, D-150..D-153): the wording review page.
//   node scripts/wording-page.mjs
//       runs the i18n and copy guards first (src/i18n) and stops if any fails, then writes reports/wording/decide-v3.html
//       (src/i18n/__tests__/wordingPage.write.test.ts with WORDING_WRITE=1). The page compares the locked Decide wording with
//       the signed copy (src/i18n/decideWordingSigned.json) once it exists, else with main at the merge base with origin/main.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function runJest(args, env = {}) {
  const r = spawnSync('npx', ['jest', ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  });
  return r.status ?? 1;
}

const guard = runJest(['src/i18n', '--silent']);
if (guard !== 0) {
  console.error('wording page: the copy guards failed, so no page was written (D-15: the page comes after the guard passes).');
  process.exit(guard);
}
process.exit(runJest(['src/i18n/__tests__/wordingPage.write.test.ts', '--runInBand'], { WORDING_WRITE: '1' }));
