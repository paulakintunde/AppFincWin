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
const CONTRACT_OK_RE = /--\s*contract-ok:\s*min_version\s*>=\s*(\d+\.\d+\.\d+)/gi;
// Matches both squawk's statement-level `squawk-ignore` and its file-level
// `squawk-ignore-file` directive, anywhere inside a real SQL comment.
const SQUAWK_DIRECTIVE_RE = /squawk-ignore(-file)?/i;

/**
 * Minimal PostgreSQL lexer: finds every real comment (`--` line comments and
 * nestable block comments), skipping over string literals, quoted
 * identifiers and dollar-quoted bodies so that comment-like text inside them
 * is not mistaken for a comment. Throws on an unterminated construct so the
 * gate fails closed rather than guessing.
 */
function lexSql(content) {
  const comments = [];
  const n = content.length;
  let i = 0;
  const isIdentChar = (c) => c !== undefined && /[A-Za-z0-9_$]/.test(c);
  while (i < n) {
    const c = content[i];
    const next = content[i + 1];
    if (c === '-' && next === '-') {
      let end = content.indexOf('\n', i);
      if (end === -1) end = n;
      comments.push({ kind: 'line', start: i, end, text: content.slice(i, end), body: content.slice(i + 2, end) });
      i = end;
    } else if (c === '/' && next === '*') {
      const start = i;
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (content[i] === '/' && content[i + 1] === '*') {
          depth += 1;
          i += 2;
        } else if (content[i] === '*' && content[i + 1] === '/') {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      if (depth > 0) throw new Error(`unterminated block comment at offset ${start}`);
      comments.push({ kind: 'block', start, end: i, text: content.slice(start, i), body: content.slice(start + 2, i - 2) });
    } else if (c === "'") {
      const start = i;
      const backslashEscapes = (content[i - 1] === 'E' || content[i - 1] === 'e') && !isIdentChar(content[i - 2]);
      i += 1;
      let closed = false;
      while (i < n) {
        if (backslashEscapes && content[i] === '\\') {
          i += 2;
        } else if (content[i] === "'" && content[i + 1] === "'") {
          i += 2;
        } else if (content[i] === "'") {
          i += 1;
          closed = true;
          break;
        } else {
          i += 1;
        }
      }
      if (!closed) throw new Error(`unterminated string literal at offset ${start}`);
    } else if (c === '"') {
      const start = i;
      i += 1;
      let closed = false;
      while (i < n) {
        if (content[i] === '"' && content[i + 1] === '"') {
          i += 2;
        } else if (content[i] === '"') {
          i += 1;
          closed = true;
          break;
        } else {
          i += 1;
        }
      }
      if (!closed) throw new Error(`unterminated quoted identifier at offset ${start}`);
    } else if (c === '$' && !isIdentChar(content[i - 1])) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(content.slice(i));
      if (tag) {
        const close = content.indexOf(tag[0], i + tag[0].length);
        if (close === -1) throw new Error(`unterminated dollar-quoted string ${tag[0]} at offset ${i}`);
        i = close + tag[0].length;
      } else {
        i += 1;
      }
    } else {
      i += 1;
    }
  }
  return { comments };
}

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

// Returns every squawk directive found in a real comment:
// { fileLevel: boolean, rules: string[] } -- `rules` empty means "no rule
// list", which squawk treats as "every rule" for squawk-ignore-file.
function findSquawkDirectives(comments) {
  const directives = [];
  for (const comment of comments) {
    const m = SQUAWK_DIRECTIVE_RE.exec(comment.body);
    if (!m) continue;
    const rest = comment.body.slice(m.index + m[0].length);
    const rules = rest
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
    directives.push({ fileLevel: m[1] !== undefined, rules });
  }
  return directives;
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

    let lexed;
    try {
      lexed = lexSql(content);
    } catch (err) {
      errors.push(`${fileName}: could not tokenize (${err.message}); the gate fails closed`);
      continue;
    }

    const directives = findSquawkDirectives(lexed.comments);
    const ignoredRules = new Set();
    for (const d of directives) {
      if (d.fileLevel) {
        // CR-C01: squawk honours squawk-ignore-file for the whole file (and
        // a bare one ignores every rule). A file-level ignore of an enforced
        // rule is never allowed -- ignore per statement, each with its own
        // contract-ok marker.
        const enforced = d.rules.length === 0 ? ['<every rule>'] : d.rules.filter((r) => KEPT_COMPAT_RULES.has(r));
        if (enforced.length > 0) {
          errors.push(
            `${fileName}: squawk-ignore-file of enforced rule(s) ${enforced.join(', ')} is not allowed; use a per-statement squawk-ignore with a contract-ok marker`
          );
        }
      } else {
        for (const r of d.rules) ignoredRules.add(r);
      }
    }
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
