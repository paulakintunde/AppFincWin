#!/usr/bin/env node
// D-21: any istanbul/c8 "ignore" comment inside a 100%-coverage engine folder must carry a
// written reason of at least 10 characters, so an ignore can never be used to silently punch
// a hole in the coverage gate. Scans src/engine/{money,decide,payoff,split} (skipping any
// folder that doesn't exist yet) and fails with a file:line list of offenders.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const FOLDERS = ['money', 'decide', 'payoff', 'split'].map((f) => join(ROOT, 'src/engine', f));

// Matches: /* istanbul ignore next -- reason: some written reason of 10+ chars */
// or the c8 equivalent, on any of the recognised ignore kinds.
const IGNORE_WITH_REASON = /(istanbul|c8) ignore (next|if|else|file|start|stop)\s+--\s+reason:\s+\S.{9,}/;
const IGNORE_ANY = /(istanbul|c8) ignore (next|if|else|file|start|stop)/;

function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];

for (const folder of FOLDERS) {
  for (const file of listSourceFiles(folder)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      if (IGNORE_ANY.test(line) && !IGNORE_WITH_REASON.test(line)) {
        offenders.push(`${relative(ROOT, file)}:${idx + 1}`);
      }
    });
  }
}

if (offenders.length > 0) {
  console.error('Coverage ignore comments missing a written reason (D-21):');
  for (const offender of offenders) {
    console.error(`  ${offender}`);
  }
  console.error(
    '\nEvery istanbul/c8 ignore comment in a 100% folder needs: -- reason: <at least 10 characters>'
  );
  process.exit(1);
}

console.log('check:ignores OK — no unreasoned coverage ignores in 100% folders.');
process.exit(0);
