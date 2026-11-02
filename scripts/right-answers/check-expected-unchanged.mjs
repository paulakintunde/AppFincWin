#!/usr/bin/env node
// 05.4-05 (Pitfall 4, T-05.4-05-01): no tuning tests to the engine. A case that is approved on origin/main may not have
// its `expected` block changed unless the new case carries `changeApproved` (a date string).
// Exits 1 listing every offending case. A topic file that is not on origin/main yet is skipped.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REL_DIR = 'src/engine/decide/v3/__tests__/rightAnswers/cases';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function onMain(rel) {
  try {
    return execFileSync('git', ['show', `origin/main:${rel}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
}

const problems = [];
for (const f of readdirSync(join(ROOT, REL_DIR)).filter((n) => n.endsWith('.json')).sort()) {
  const before = onMain(`${REL_DIR}/${f}`);
  if (before === null) continue;
  const was = new Map(JSON.parse(before).cases.map((c) => [c.id, c]));
  const now = JSON.parse(readFileSync(join(ROOT, REL_DIR, f), 'utf8'));
  for (const c of now.cases) {
    const old = was.get(c.id);
    if (!old || old.status !== 'approved') continue;
    if (canonical(old.expected) !== canonical(c.expected) && !(typeof c.changeApproved === 'string' && c.changeApproved.length > 0)) {
      problems.push(`${c.id}: expected changed without changeApproved`);
    }
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('right-answers: no approved expected block changed without changeApproved');
