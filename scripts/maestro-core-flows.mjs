#!/usr/bin/env node
// 05.5-05 (APP-13): the core Maestro flows, written once. The nightly workflow builds its `maestro test` arguments from --list.
//
//   node scripts/maestro-core-flows.mjs --list                       print the flow paths, one per line
//   node scripts/maestro-core-flows.mjs --check                      exit 1 if any listed file is missing
//   node scripts/maestro-core-flows.mjs --check --allow-missing=a,b  tolerate the named files (until 06.1 and 05.5-22 land)

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const CORE_FLOWS = [
  // On main (05.4)
  'back-stays-short',
  'record-as-bought',
  'save-offline',
  // Added by 06.1 (Decide screens)
  'decide-bought',
  'decide-check-lands',
  'decide-first-answer',
  'decide-safety-net',
  'decide-save-for-it',
  'decide-stepper-loan',
  'decide-timing',
  'decide-waiver',
  'decide-write-idle',
  // Added by 05.5-22
  'save-plan-undo',
  'not-buying-undo',
  'delete-plan-undo',
  'check-periodic',
];

export const flowPath = (name) => `.maestro/${name}.yaml`;

export function missingFlows(root = ROOT, allowed = []) {
  return CORE_FLOWS.filter((n) => !allowed.includes(n) && !existsSync(join(root, flowPath(n))));
}

function main(argv) {
  if (argv.includes('--list')) {
    for (const n of CORE_FLOWS) console.log(flowPath(n));
    return 0;
  }
  if (argv.includes('--check')) {
    const arg = argv.find((a) => a.startsWith('--allow-missing='));
    const allowed = arg ? arg.slice('--allow-missing='.length).split(',').filter(Boolean) : [];
    const missing = missingFlows(ROOT, allowed);
    if (missing.length > 0) {
      console.error(`Missing Maestro core flows: ${missing.join(', ')}`);
      return 1;
    }
    console.log(`All ${CORE_FLOWS.length - allowed.length} checked core flows exist.`);
    return 0;
  }
  console.error('Usage: maestro-core-flows.mjs --list | --check [--allow-missing=a,b]');
  return 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
