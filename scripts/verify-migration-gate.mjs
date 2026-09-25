#!/usr/bin/env node
// FND-10 self-test: proves scripts/check-migration-compat.mjs (backed by
// squawk) actually fails on a destructive probe migration and passes on a
// correctly-marked one, so the gate cannot silently rot. Every probe runs
// against a temp copy of the real migrations -- supabase/migrations is
// never written to.

import { mkdtempSync, mkdirSync, readdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
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
  // CR-C04: the space in the prefix is deliberate -- every probe runs from a
  // path containing a space, so the passing probes prove squawk is spawned
  // without a shell and with correctly separated arguments.
  const dir = mkdtempSync(join(tmpdir(), 'fincwin migration gate-'));
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

  // CR-C01: squawk honours `squawk-ignore-file` (with or without a rule
  // list), which silences every matching statement in the file. A file-level
  // ignore of an enforced rule is rejected outright -- ignores are per
  // statement, each with its own contract-ok marker.
  runProbe(
    'P7: squawk-ignore-file of an enforced rule',
    [
      [
        '29990101000100_probe_drop.sql',
        '-- squawk-ignore-file ban-drop-column\nalter table public.transactions drop column note;\n',
      ],
    ],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names squawk-ignore-file', result.output.includes('squawk-ignore-file'));
    }
  );

  runProbe(
    'P8: bare squawk-ignore-file (ignores every rule)',
    [['29990101000100_probe_drop.sql', '-- squawk-ignore-file\nalter table public.transactions drop column note;\n']],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names squawk-ignore-file', result.output.includes('squawk-ignore-file'));
    }
  );

  runProbe(
    'P9: squawk-ignore-file even with a raised floor and a marker',
    [
      [
        '29990101000100_probe_floor.sql',
        "update public.app_config set value = '9.0.0' where key = 'min_supported_version';\n",
      ],
      [
        '29990101000200_probe_drop.sql',
        '-- contract-ok: min_version >= 9.0.0\n-- squawk-ignore-file ban-drop-column\nalter table public.transactions drop column note;\n',
      ],
    ],
    (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names squawk-ignore-file', result.output.includes('squawk-ignore-file'));
    }
  );

  // CR-C02: squawk strips a trailing `-- ...` from the rule list and still
  // honours the rule; the gate must parse the list at least as loosely.
  const ignoreVariants = [
    ['P10: trailing -- comment after the rule', '-- squawk-ignore ban-drop-column -- reason: legacy'],
    ['P11: block-comment ignore', '/* squawk-ignore ban-drop-column */'],
    ['P12: no space after --', '--squawk-ignore ban-drop-column'],
    ['P13: comma list with a leading unknown name', '-- squawk-ignore foo, ban-drop-column'],
    ['P14: whitespace-separated list', '-- squawk-ignore ban-drop-table ban-drop-column'],
    ['P15: upper-case rule name', '-- squawk-ignore BAN-DROP-COLUMN'],
  ];
  for (const [name, ignoreLine] of ignoreVariants) {
    runProbe(
      name,
      [['29990101000100_probe_drop.sql', `${ignoreLine}\nalter table public.transactions drop column note;\n`]],
      (result) => {
        expect('gate fails', result.status !== 0);
      }
    );
  }

  // CR-C03: the floor comes only from real, executed statements. A floor
  // statement in a comment, a no-op upsert, or one buried in a DO block
  // does not raise it.
  const MARKED_DROP =
    '-- contract-ok: min_version >= 9.0.0\n-- squawk-ignore ban-drop-column\nalter table public.transactions drop column note;\n';
  const fakeFloors = [
    [
      'P16: floor update only inside a -- comment',
      "-- TODO later: update public.app_config set value = '9.0.0' where key = 'min_supported_version';\nselect 1;\n",
    ],
    [
      'P17: floor update only inside a block comment',
      "/*\nupdate public.app_config set value = '9.0.0' where key = 'min_supported_version';\n*/\nselect 1;\n",
    ],
    [
      'P18: insert ... on conflict do nothing (a no-op, the row exists)',
      "insert into public.app_config (key, value) values ('min_supported_version', '9.0.0') on conflict do nothing;\n",
    ],
    [
      'P19: floor update inside a DO block',
      "do $$ begin if false then update public.app_config set value = '9.0.0' where key = 'min_supported_version'; end if; end $$;\n",
    ],
    [
      'P20: floor update with an extra predicate',
      "update public.app_config set value = '9.0.0' where key = 'min_supported_version' and false;\n",
    ],
  ];
  for (const [name, floorSql] of fakeFloors) {
    runProbe(
      name,
      [
        ['29990101000100_probe_floor.sql', floorSql],
        ['29990101000200_probe_drop.sql', MARKED_DROP],
      ],
      (result) => {
        expect('gate fails', result.status !== 0);
        expect('output names the floor', result.output.includes('floor'));
      }
    );
  }

  runProbe(
    'P21: upsert that really sets the value raises the floor',
    [
      [
        '29990101000100_probe_floor.sql',
        "insert into public.app_config (key, value) values ('min_supported_version', '9.0.0')\n  on conflict (key) do update set value = excluded.value;\n",
      ],
      ['29990101000200_probe_drop.sql', MARKED_DROP],
    ],
    (result) => {
      expect('gate passes', result.status === 0);
    }
  );

  // CR-C04: a filename must never reach a shell. These names inject a
  // command under cmd.exe (`&`) and /bin/sh (`;` + `#`) respectively when a
  // shell joins the argument list; both must be rejected, not skipped.
  for (const [name, fileName] of [
    ['P22: filename with cmd.exe metacharacters', '29990101000100_x&ver&rem .sql'],
    ['P23: filename with /bin/sh metacharacters', '29990101000100_x;true #.sql'],
  ]) {
    runProbe(name, [[fileName, 'alter table public.transactions drop column note;\n']], (result) => {
      expect('gate fails', result.status !== 0);
      expect('output names the bad filename', result.output.includes('filename'));
    });
  }

  // CR-C04 / WR-C01: with squawk-cli absent the gate must fail closed, not
  // fall back to downloading an unpinned squawk or silently skip the lint.
  console.log('Probe: P24: squawk-cli not installed');
  {
    const isolatedRoot = mkdtempSync(join(tmpdir(), 'fincwin no squawk-'));
    try {
      mkdirSync(join(isolatedRoot, 'scripts'));
      copyFileSync(CHECK_SCRIPT, join(isolatedRoot, 'scripts', 'check-migration-compat.mjs'));
      copyFileSync(join(ROOT, '.squawk.toml'), join(isolatedRoot, '.squawk.toml'));
      const migrations = join(isolatedRoot, 'migrations');
      mkdirSync(migrations);
      for (const f of readdirSync(REAL_MIGRATIONS_DIR)) {
        if (f.endsWith('.sql')) copyFileSync(join(REAL_MIGRATIONS_DIR, f), join(migrations, f));
      }
      const env = { ...process.env, PATH: '', Path: '', NODE_PATH: '' };
      const result = spawnSync(
        process.execPath,
        [join(isolatedRoot, 'scripts', 'check-migration-compat.mjs'), migrations],
        { cwd: isolatedRoot, encoding: 'utf8', env }
      );
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
      expect('gate fails', (result.status ?? 1) !== 0);
      expect('output says squawk-cli is not installed', output.includes('squawk-cli is not installed'));
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  }
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
