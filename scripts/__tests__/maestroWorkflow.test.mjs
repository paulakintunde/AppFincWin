// 05.5-05 (APP-13): the Maestro workflow stays dispatch-only (D-22), pinned, and never echoes secrets.
// Runs with `node --test` (scripts/ is not under the jest roots).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { CORE_FLOWS, flowPath } from '../maestro-core-flows.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/maestro-nightly.yml'), 'utf8');

test('the core-flow list has 16 unique names', () => {
  assert.equal(CORE_FLOWS.length, 16);
  assert.equal(new Set(CORE_FLOWS).size, 16);
  assert.equal(flowPath(CORE_FLOWS[0]), `.maestro/${CORE_FLOWS[0]}.yaml`);
});

test('the workflow is dispatch-only: no schedule block (D-22)', () => {
  assert.match(WORKFLOW, /workflow_dispatch/);
  assert.equal(
    WORKFLOW.split('\n').filter((l) => /^\s*schedule:/.test(l)).length,
    0,
  );
});

test('every uses: line is pinned to a 40-hex commit SHA', () => {
  const uses = WORKFLOW.split('\n').filter((l) => /^\s*-?\s*uses:/.test(l));
  assert.ok(uses.length >= 5);
  for (const line of uses) assert.match(line, /uses: [^@\s]+@[0-9a-f]{40}(\s|$)/, line);
});

test('no step echoes a secret', () => {
  for (const line of WORKFLOW.split('\n')) {
    assert.ok(!line.includes('echo ${{ secrets.'), line);
  }
});
