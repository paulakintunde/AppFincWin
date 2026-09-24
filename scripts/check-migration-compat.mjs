#!/usr/bin/env node
// FND-10 / D-27: checks every migration file in supabase/migrations (or the
// given directory) against two things:
//
//   1. squawk-cli, run against the resolved file list directly (not a shell
//      glob -- cmd.exe on Windows does not expand `*.sql`, so this script
//      resolves the file list itself and spawns squawk with explicit paths,
//      making `npm run lint:migrations` shell-independent).
//   2. The project's own `-- contract-ok: min_version >= X.Y.Z` convention:
//      any squawk-ignore'd *kept* compatibility rule must be paired with a
//      contract-ok marker whose X.Y.Z is already satisfied by
//      app_config.min_supported_version as declared by every EARLIER
//      migration file (in filename order). A floor bump and the destructive
//      change it authorizes must ship in separate migrations, bump first.
//
// Usage: node scripts/check-migration-compat.mjs [dir]  (default: supabase/migrations)
// Exit 1 on any error. Prints `MIGRATION COMPAT OK (<n> files, floor <v>)` on success.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Compatibility rules kept in .squawk.toml (i.e. NOT in excluded_rules).
// A squawk-ignore of any other rule needs no contract-ok marker -- it isn't
// a compatibility rule this gate cares about.
const KEPT_COMPAT_RULES = new Set([
  'ban-drop-column',
  'ban-drop-table',
  'ban-drop-database',
  'renaming-column',
  'renaming-table',
  'changing-column-type',
  'adding-required-field',
  'adding-not-nullable-field',
  'ban-truncate-cascade',
]);

const FLOOR_INSERT_RE =
  /insert\s+into\s+public\.app_config\s*\([^)]*\)\s*values\s*\(\s*'min_supported_version'\s*,\s*'(\d+\.\d+\.\d+)'\s*\)/gi;
const FLOOR_UPDATE_RE =
  /update\s+public\.app_config\s+set\s+value\s*=\s*'(\d+\.\d+\.\d+)'\s+where\s+key\s*=\s*'min_supported_version'/gi;
const SQUAWK_IGNORE_RE = /--\s*squawk-ignore\s+([a-z0-9,\s-]+)/gi;
const CONTRACT_OK_RE = /--\s*contract-ok:\s*min_version\s*>=\s*(\d+\.\d+\.\d+)/gi;

function parseSemver(v) {
  const parts = v.split('.').map((n) => Number.parseInt(n, 10));
  return { major: parts[0], minor: parts[1], patch: parts[2] };
}

// Returns true if `a` (floor) is already >= `b` (required).
function semverGte(a, b) {
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

function findFloorBumps(content) {
  const bumps = [];
  for (const re of [FLOOR_INSERT_RE, FLOOR_UPDATE_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      bumps.push(m[1]);
    }
  }
  return bumps;
}

function findSquawkIgnoredRules(content) {
  const rules = new Set();
  SQUAWK_IGNORE_RE.lastIndex = 0;
  let m;
  while ((m = SQUAWK_IGNORE_RE.exec(content)) !== null) {
    for (const rule of m[1].split(',')) {
      const trimmed = rule.trim();
      if (trimmed) rules.add(trimmed);
    }
  }
  return rules;
}

function findContractOkMarkers(content) {
  const markers = [];
  CONTRACT_OK_RE.lastIndex = 0;
  let m;
  while ((m = CONTRACT_OK_RE.exec(content)) !== null) {
    markers.push(m[1]);
  }
  return markers;
}

function resolveSquawkBinary() {
  const winBin = join(ROOT, 'node_modules', '.bin', 'squawk.cmd');
  const posixBin = join(ROOT, 'node_modules', '.bin', 'squawk');
  if (process.platform === 'win32' && existsSync(winBin)) return winBin;
  if (existsSync(posixBin)) return posixBin;
  return null; // fall back to `npx squawk-cli`
}

function runSquawk(files) {
  if (files.length === 0) return { status: 0, output: '' };
  const configPath = join(ROOT, '.squawk.toml');
  const bin = resolveSquawkBinary();
  const args = ['--config', configPath, ...files];
  // shell: true is required on Windows to execute a .cmd shim directly
  // (spawnSync otherwise fails with EINVAL); it is harmless on POSIX.
  const result = bin
    ? spawnSync(bin, args, { cwd: ROOT, encoding: 'utf8', shell: true })
    : spawnSync('npx', ['--yes', 'squawk-cli', ...args], { cwd: ROOT, encoding: 'utf8', shell: true });
  if (result.error) {
    return { status: 1, output: `failed to spawn squawk: ${result.error.message}` };
  }
  return {
    status: result.status ?? 1,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
}

function main() {
  const dirArg = process.argv[2] ?? 'supabase/migrations';
  const dir = resolve(ROOT, dirArg);

  if (!existsSync(dir)) {
    console.error(`check-migration-compat: directory not found: ${dir}`);
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => join(dir, f));

  const errors = [];
  const warnings = [];

  // 1. squawk, run directly against the resolved file list (no shell glob).
  const squawkResult = runSquawk(files);
  if (squawkResult.status !== 0) {
    errors.push(`squawk reported violations:\n${squawkResult.output}`);
  }

  // 2. contract-ok floor check, file by file in filename order. A file's
  // markers are checked against the floor as it stood after all EARLIER
  // files -- a floor bump and the destructive change it authorizes must be
  // separate migrations, bump first.
  let floor = null; // null until the first floor-setting statement is seen anywhere

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const fileName = filePath.split(/[\\/]/).pop();

    const ignoredRules = findSquawkIgnoredRules(content);
    const markers = findContractOkMarkers(content);

    // Every squawk-ignore of a KEPT compatibility rule needs a contract-ok
    // marker in this same file, checked against the floor BEFORE this file's
    // own floor bumps are applied.
    const compatIgnores = [...ignoredRules].filter((r) => KEPT_COMPAT_RULES.has(r));
    for (const rule of compatIgnores) {
      if (markers.length === 0) {
        errors.push(`${fileName}: squawk-ignore '${rule}' has no '-- contract-ok: min_version >= X.Y.Z' marker`);
        continue;
      }
      for (const markerVersion of markers) {
        const required = parseSemver(markerVersion);
        if (floor === null || !semverGte(parseSemver(floor), required)) {
          errors.push(
            `${fileName} needs min_supported_version >= ${markerVersion} but the floor at that point is ${floor ?? 'unset'}`
          );
        }
      }
    }

    // A contract-ok marker with no matching squawk-ignore is a no-op --
    // allowed, but flagged so a stale/copy-pasted marker doesn't go unnoticed.
    if (markers.length > 0 && compatIgnores.length === 0) {
      warnings.push(`${fileName}: contract-ok marker present but no kept-rule squawk-ignore found (no-op)`);
    }

    // Apply this file's own floor bumps AFTER evaluating its markers, so
    // they only affect files that come later.
    for (const bump of findFloorBumps(content)) {
      floor = bump;
    }
  }

  for (const w of warnings) console.warn(`WARNING: ${w}`);

  if (errors.length > 0) {
    console.error(`\nMIGRATION COMPAT FAILED (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`MIGRATION COMPAT OK (${files.length} files, floor ${floor ?? 'unset'})`);
  process.exit(0);
}

main();
