#!/usr/bin/env node
// FND-10 self-test: proves scripts/check-migration-compat.mjs (backed by
// squawk) actually fails on a destructive probe migration and passes on a
// correctly-marked one, so the gate cannot silently rot. Every probe runs
// against a temp copy of the real migrations -- supabase/migrations is
// never written to.

import { mkdtempSync, readdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const REAL_MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const CHECK_SCRIPT = join(__dirname, 'check-migration-compat.mjs');

const failures = [];

function freshMigrationsCopy() {
  const dir = mkdtempSync(join(tmpdir(), 'fincwin-migration-gate-'));
  for (const f of readdirSync(REAL_MIGRATIONS_DIR)) {
    if (f.endsWith('.sql')) {
      copyFileSync(join(REAL_MIGRATIONS_DIR, f), join(dir, f));
    }
  }
  return dir;
}

function runGate(dir) {
  const result = spawnSync(process.execPath, [CHECK_SCRIPT, dir], { cwd: ROOT, encoding: 'utf8' });
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

function runProbe(name, files, assertions) {
  console.log(`Probe: ${name}`);
  const dir = freshMigrationsCopy();
  try {
    for (const [fileName, contents] of files) {
      writeFileSync(join(dir, fileName), contents);
    }
    const result = runGate(dir);
    assertions(result);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  runProbe(
    'P1: bare drop column',
    [['29990101000100_probe_drop.sql', 'alter table public.transactions drop column note;\n']],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names ban-drop-column', result.output.includes('ban-drop-column'));
    }
  );

  runProbe(
    'P2: squawk-ignore with no contract-ok marker',
    [
      [
        '29990101000100_probe_drop.sql',
        '-- squawk-ignore ban-drop-column\nalter table public.transactions drop column note;\n',
      ],
    ],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names the missing contract-ok marker', result.output.toLowerCase().includes('contract-ok'));
    }
  );

  // NOTE: squawk only associates a `squawk-ignore` comment with a statement
  // when it is the line directly preceding that statement -- an intervening
  // comment line (like contract-ok) breaks that association and squawk still
  // reports the violation. The project convention is therefore: contract-ok
  // ABOVE squawk-ignore, so squawk-ignore stays adjacent to the statement.
  // Documented in docs/ops/migration-compatibility.md.
  runProbe(
    'P3: contract-ok marker but floor not yet raised',
    [
      [
        '29990101000100_probe_drop.sql',
        '-- contract-ok: min_version >= 9.0.0\n-- squawk-ignore ban-drop-column\nalter table public.transactions drop column note;\n',
      ],
    ],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names the floor', result.output.includes('floor'));
    }
  );

  runProbe(
    'P4: floor raised in an earlier migration, then a correctly-marked drop',
    [
      [
        '29990101000100_probe_floor.sql',
        "update public.app_config set value = '9.0.0' where key = 'min_supported_version';\n",
      ],
      [
        '29990101000200_probe_drop.sql',
        '-- contract-ok: min_version >= 9.0.0\n-- squawk-ignore ban-drop-column\nalter table public.transactions drop column note;\n',
      ],
    ],
    (result) => {
      expect('gate passes', result.status === 0);
      expect('output prints MIGRATION COMPAT OK', result.output.includes('MIGRATION COMPAT OK'));
    }
  );

  runProbe(
    'P5: changing a column type',
    [
      [
        '29990101000100_probe_type.sql',
        'alter table public.transactions alter column note type varchar(10);\n',
      ],
    ],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names changing-column-type', result.output.includes('changing-column-type'));
    }
  );

  runProbe(
    'P6: adding a required column',
    [['29990101000100_probe_required.sql', 'alter table public.accounts add column probe text not null;\n']],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names adding-required-field', result.output.includes('adding-required-field'));
    }
  );
} finally {
  // Belt-and-braces: confirm no probe file was ever written into the real
  // migrations directory (every probe above wrote only into a temp copy).
  const leftoverProbes = readdirSync(REAL_MIGRATIONS_DIR).filter((f) => f.startsWith('2999'));
  if (leftoverProbes.length > 0) {
    console.log(`FAIL — probe files leaked into supabase/migrations: ${leftoverProbes.join(', ')}`);
    failures.push('probe files leaked into supabase/migrations');
  }
}

if (failures.length > 0) {
  console.error(`\nMIGRATION GATE FAILED (${failures.length}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\nMIGRATION GATE OK');
process.exit(0);
