#!/usr/bin/env node
// 05-51 (D-19, RESEARCH Pitfall 6): the SQL demo seed and the TypeScript fixture cannot drift.
// Reads every `-- demo:<key>=<value>` marker in supabase/migrations/20261016000400_decide_demo_seed.sql and compares it with
// src/features/decide/__tests__/helpers/demoScenario.json (05-18), flattened to the same keys. Check-only (no generation):
// exits 1 listing every missing, unexpected, duplicated or mismatched key.
//
// Key scheme (whole units unless noted):
//   pastMonths                      fixture.pastMonths
//   account.<key>.opening           fixture.accounts[key].opening, for every account with a non-zero opening
//   salary.major / salary.day       fixture.salary
//   template.<i>.day|major          fixture.template[i]
//   transfer.savings|investing      fixture.transfers[0].major / [1].major
//   debt.balance|minimum|apr        fixture.debts[0] (the Student loan)
//   cardDebt.paidInFull             fixture.cardDebt.paid_in_full ('true')
//   settings.investingFloor         fixture.settings.investingFloor
//   sofaInputs / carInputs          fixture.sofa / fixture.car, compared as canonical JSON (keys sorted)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SQL_PATH = join(ROOT, 'supabase/migrations/20261016000400_decide_demo_seed.sql');
const FIXTURE_PATH = join(ROOT, 'src/features/decide/__tests__/helpers/demoScenario.json');

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

function flatten(f) {
  const out = new Map();
  out.set('pastMonths', String(f.pastMonths));
  for (const a of f.accounts) if (a.opening !== 0) out.set(`account.${a.key}.opening`, String(a.opening));
  out.set('salary.major', String(f.salary.major));
  out.set('salary.day', String(f.salary.day));
  f.template.forEach((t, i) => {
    out.set(`template.${i}.day`, String(t.day));
    out.set(`template.${i}.major`, String(t.major));
  });
  out.set('transfer.savings', String(f.transfers.find((t) => t.to === 'savings').major));
  out.set('transfer.investing', String(f.transfers.find((t) => t.to === 'investments').major));
  const d = f.debts[0];
  out.set('debt.balance', String(d.balance));
  out.set('debt.minimum', String(d.minimum));
  out.set('debt.apr', String(d.apr));
  out.set('cardDebt.paidInFull', String(f.cardDebt.paid_in_full));
  out.set('settings.investingFloor', String(f.settings.investingFloor));
  out.set('sofaInputs', canonical(f.sofa));
  out.set('carInputs', canonical(f.car));
  return out;
}

function readMarkers(sql) {
  const found = new Map();
  const problems = [];
  for (const line of sql.split(/\r?\n/)) {
    const m = /--\s*demo:([A-Za-z0-9_.]+)=(.*)$/.exec(line);
    if (!m) continue;
    const [, key, raw] = m;
    let value = raw.trim();
    if (key === 'sofaInputs' || key === 'carInputs') {
      try {
        value = canonical(JSON.parse(value));
      } catch {
        problems.push(`${key}: marker is not valid JSON`);
        continue;
      }
    }
    if (found.has(key)) problems.push(`${key}: duplicated marker`);
    found.set(key, value);
  }
  return { found, problems };
}

const expected = flatten(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')));
const { found, problems } = readMarkers(readFileSync(SQL_PATH, 'utf8'));

for (const [key, want] of expected) {
  if (!found.has(key)) problems.push(`${key}: missing from the SQL seed (fixture ${want})`);
  else if (found.get(key) !== want) problems.push(`${key}: SQL has ${found.get(key)}, fixture has ${want}`);
}
for (const key of found.keys()) if (!expected.has(key)) problems.push(`${key}: SQL marker has no fixture key`);

if (problems.length > 0) {
  console.error('DECIDE DEMO MIRROR FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`DECIDE DEMO MIRROR OK (${expected.size} keys)`);
