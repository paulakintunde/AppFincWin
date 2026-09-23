#!/usr/bin/env node
// FND-04 / FND-05 / D-21 self-test: proves the engine-purity and coverage gates actually
// fail on a real violation, not just that they exist and pass on a clean tree. Writes small
// probe files that violate each rule, asserts the relevant command fails (and, where
// specified, that its output names the violated rule), then removes every probe file/folder
// in a `finally` block so a crash mid-run never leaves scaffolding behind.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, rmdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.cwd();
const failures = [];
const createdPaths = []; // files and dirs to remove, in the order they were created

function writeProbe(relPath, contents) {
  const full = join(ROOT, relPath);
  const dir = dirname(full);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    createdPaths.push(dir);
  }
  writeFileSync(full, contents);
  createdPaths.push(full);
}

function run(command) {
  const result = spawnSync(command, { shell: true, cwd: ROOT, encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function expect(description, condition) {
  if (condition) {
    console.log(`  ok — ${description}`);
  } else {
    console.log(`  FAIL — ${description}`);
    failures.push(description);
  }
}

function cleanup() {
  // Remove files first, then directories deepest-first so rmdir never hits a non-empty dir.
  for (const p of [...createdPaths].reverse()) {
    if (!existsSync(p)) continue;
    try {
      const stat = statSync(p);
      if (stat.isDirectory()) {
        if (readdirSync(p).length === 0) rmdirSync(p);
      } else {
        rmSync(p, { force: true });
      }
    } catch {
      // best-effort cleanup; the final git-status assertion below catches anything left behind
    }
  }
  // Belt-and-braces in case a directory was left non-empty by an out-of-order removal above.
  for (const p of [...createdPaths].reverse()) {
    if (existsSync(p)) {
      rmSync(p, { recursive: true, force: true });
    }
  }
}

try {
  console.log('Probe 1: direct impure import (engine -> services)');
  writeProbe('src/services/__gate_probe__.ts', 'export const x = 1;\n');
  writeProbe(
    'src/engine/__gate_probe__/direct.ts',
    "import { x } from '../../services/__gate_probe__';\nexport const y = x;\n"
  );
  {
    const depcruise = run('npx depcruise src --config .dependency-cruiser.cjs');
    expect('depcruise fails on the direct import', depcruise.status !== 0);
    expect(
      'depcruise output names engine-only-internal-src',
      depcruise.output.includes('engine-only-internal-src')
    );
    const eslint = run('npx eslint src/engine/__gate_probe__/direct.ts');
    expect('eslint fails on the direct import', eslint.status !== 0);
  }

  console.log('Probe 2: React import inside engine/');
  writeProbe(
    'src/engine/__gate_probe__/react.ts',
    "import { useState } from 'react';\nexport const z = useState;\n"
  );
  {
    const eslint = run('npx eslint src/engine/__gate_probe__/react.ts');
    expect('eslint fails on the React import', eslint.status !== 0);
    const depcruise = run('npx depcruise src --config .dependency-cruiser.cjs');
    expect('depcruise fails on the React import', depcruise.status !== 0);
  }

  console.log('Probe 3: transitive impure import (engine -> shared -> react-native)');
  writeProbe(
    'src/__gate_probe_shared__/leaky.ts',
    "import { Platform } from 'react-native';\nexport const os = Platform.OS;\n"
  );
  writeProbe(
    'src/engine/__gate_probe__/transitive.ts',
    "import { os } from '../../__gate_probe_shared__/leaky';\nexport const t = os;\n"
  );
  {
    const depcruise = run('npx depcruise src --config .dependency-cruiser.cjs');
    expect(
      'depcruise output names engine-no-reach-impure',
      depcruise.output.includes('engine-no-reach-impure')
    );
  }

  console.log('Probe 4: coverage gate (money/ is a 100% folder)');
  writeProbe(
    'src/engine/money/__gate_probe__.ts',
    "export function probe(n: number) {\n  if (n > 0) {\n    return 'pos';\n  }\n  return 'neg';\n}\n"
  );
  {
    const jestRun = run('npx jest --coverage --ci --silent');
    expect('jest --coverage fails on the uncovered money/ branch', jestRun.status !== 0);
  }

  console.log('Probe 5: coverage-ignore comment without a written reason');
  writeProbe(
    'src/engine/money/__gate_probe__ignore.ts',
    "export function probeIgnore(n: number) {\n  /* istanbul ignore next */\n  if (n > 0) {\n    return 'pos';\n  }\n  return 'neg';\n}\n"
  );
  {
    const ignoreCheck = run('node scripts/check-coverage-ignores.mjs');
    expect('check-coverage-ignores fails on the unreasoned ignore', ignoreCheck.status !== 0);
  }
} finally {
  cleanup();
}

// Final safety net: the probe paths are also gitignored (see .gitignore), so this should
// never see them even if `cleanup()` somehow missed a file — but assert it explicitly rather
// than trust that alone.
const gitStatus = run('git status --porcelain src');
const leftoverProbes = gitStatus.output
  .split('\n')
  .filter((line) => line.includes('__gate_probe__') || line.includes('__gate_probe_shared__'));
expect('no probe paths left in git status', leftoverProbes.length === 0);
if (leftoverProbes.length > 0) {
  console.log(leftoverProbes.join('\n'));
}

if (failures.length > 0) {
  console.error(`\nGATES FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nGATES OK');
process.exit(0);
