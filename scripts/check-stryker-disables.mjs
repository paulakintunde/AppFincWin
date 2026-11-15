#!/usr/bin/env node
// Every "Stryker disable" comment in the v3 engine and its shared files must carry a written
// reason of 10+ characters, mirroring the coverage-ignore rule (check-coverage-ignores.mjs).

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const TARGETS = [
  'src/engine/decide/v3',
  'src/engine/month',
  'src/engine/decide/bisectCore.ts',
  'src/engine/decide/cardRule.ts',
  'src/engine/decide/lineDefaults.ts',
  'src/engine/decide/pots.ts',
  'src/engine/decide/share.ts',
].map((f) => join(ROOT, f));

const ANY = /Stryker disable/;
const WITH_REASON = /\/\/\s*Stryker disable (next-line |all )?[\w,]+\s*:\s*\S.{9,}/;

function listFiles(path) {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  const out = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = join(path, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const offenders = [];
for (const target of TARGETS) {
  for (const file of listFiles(target)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, idx) => {
        if (ANY.test(line) && !WITH_REASON.test(line)) offenders.push(`${relative(ROOT, file)}:${idx + 1}`);
      });
  }
}

if (offenders.length > 0) {
  console.error('Stryker disable comments missing a written reason:');
  for (const o of offenders) console.error(`  ${o}`);
  console.error('\nFormat: // Stryker disable next-line all: <reason of at least 10 characters>');
  process.exit(1);
}
console.log('stryker disables ok');
