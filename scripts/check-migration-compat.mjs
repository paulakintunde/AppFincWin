#!/usr/bin/env node
// FND-10 / D-27: checks every migration file in supabase/migrations (or the
// given directory) against two things:
//
//   1. squawk-cli, run against the resolved file list directly (not a shell
//      glob -- cmd.exe on Windows does not expand `*.sql`, so this script
//      resolves the file list itself). squawk's native binary is spawned
//      with an argv array and no shell, so filenames are never parsed as
//      commands; every filename must also match MIGRATION_FILENAME_RE.
//      A missing squawk-cli fails the gate.
//   2. The project's own `-- contract-ok: min_version >= X.Y.Z` convention:
//      every statement that squawk-ignores an enforced compatibility rule
//      must carry its own contract-ok marker directly above it (marker,
//      then squawk-ignore, then statement). X.Y.Z must already be satisfied
//      by app_config.min_supported_version as raised by EARLIER migration
//      files (in filename order), and must be strictly above the floor that
//      was in effect before the most recent raise (see checkMarker). A floor
//      bump and the destructive change it authorizes ship in separate
//      migrations, bump first. File-level squawk-ignore of an enforced rule
//      is rejected outright.
//
// Usage: node scripts/check-migration-compat.mjs [dir]  (default: supabase/migrations)
// Exit 1 on any error. Prints `MIGRATION COMPAT OK (<n> files, floor <v>)` on success.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

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

// Anchored: matched against one whole statement (comments stripped,
// whitespace collapsed, no trailing semicolon).
const FLOOR_INSERT_RE =
  /^insert into public\.app_config ?\( ?key ?, ?value ?\) ?values ?\( ?'min_supported_version' ?, ?'(\d+\.\d+\.\d+)' ?\)(?: on conflict ?\( ?key ?\) do update set value ?= ?excluded\.value)?$/i;
const FLOOR_UPDATE_RE =
  /^update public\.app_config set value ?= ?'(\d+\.\d+\.\d+)' where key ?= ?'min_supported_version'$/i;
const MIGRATION_FILENAME_RE = /^\d{14}_[a-z0-9_]+\.sql$/;
// Matched against one whole line comment (trailing whitespace trimmed).
const CONTRACT_OK_RE = /^--\s*contract-ok:\s*min_version\s*>=\s*(\d+\.\d+\.\d+)$/i;
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
  const semicolons = [];
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
    } else if (c === ';') {
      semicolons.push(i);
      i += 1;
    } else {
      i += 1;
    }
  }

  // `code` is the file with every comment blanked to spaces (newlines kept,
  // offsets unchanged), so statement text never includes comment text.
  const chars = content.split('');
  for (const comment of comments) {
    for (let k = comment.start; k < comment.end; k += 1) {
      if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' ';
    }
  }
  const code = chars.join('');

  // Top-level statements, split on semicolons outside strings, quoted
  // identifiers, dollar bodies and comments. `segmentStart` is where the
  // segment begins (just after the previous `;`); `start` is the first
  // non-blank character of real code, or -1 for a comment-only tail.
  const statements = [];
  let segmentStart = 0;
  for (const end of [...semicolons, n]) {
    const segment = code.slice(segmentStart, end);
    const lead = segment.search(/\S/);
    if (lead !== -1) {
      statements.push({ segmentStart, start: segmentStart + lead, end, text: segment.trim() });
    } else if (end === n) {
      statements.push({ segmentStart, start: -1, end, text: '' });
    }
    segmentStart = end + 1;
  }
  return { comments, code, statements };
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

// CR-C03: a floor bump is recognised only as a whole top-level statement
// (comments already stripped by the lexer) in one of exactly two forms:
//   update public.app_config set value = 'X.Y.Z' where key = 'min_supported_version';
//   insert into public.app_config (key, value) values ('min_supported_version', 'X.Y.Z')
//     [on conflict (key) do update set value = excluded.value];
// Anything else that mentions min_supported_version -- a DO block, an extra
// predicate, `on conflict do nothing` (a no-op once the row exists) -- does
// NOT raise the floor, and is reported as a warning so the author notices.
function findFloorBumps(statements, fileName, warnings) {
  const bumps = [];
  for (const stmt of statements) {
    if (stmt.start === -1) continue;
    const text = stmt.text.replace(/\s+/g, ' ');
    const m = FLOOR_UPDATE_RE.exec(text) ?? FLOOR_INSERT_RE.exec(text);
    if (m) {
      bumps.push(m[1]);
    } else if (/min_supported_version/i.test(text)) {
      warnings.push(
        `${fileName}: statement mentions min_supported_version but is not a recognised floor bump, so it does not raise the floor: ${text.slice(0, 120)}`
      );
    }
  }
  return bumps;
}

// CR-C02: parse a squawk-ignore rule list at least as loosely as squawk
// does. Squawk drops a trailing `-- ...` and splits on commas; this also
// splits on whitespace and lower-cases, so every name squawk could possibly
// honour is seen. Anything that is not a plausible rule name is kept as-is
// and, never matching an excluded rule, is treated as enforced (fail closed).
function parseRuleList(text) {
  const withoutTrailingComment = text.split('--')[0];
  return withoutTrailingComment
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean);
}

const RULE_NAME_RE = /^[a-z][a-z0-9-]*$/;

// Returns every squawk directive found in a real comment:
// { fileLevel: boolean, rules: string[] } -- `rules` empty means "no rule
// list", which squawk treats as "every rule" for squawk-ignore-file.
function findSquawkDirectives(comments) {
  const directives = [];
  for (const comment of comments) {
    const m = SQUAWK_DIRECTIVE_RE.exec(comment.body);
    if (!m) continue;
    directives.push({
      comment,
      fileLevel: m[1] !== undefined,
      rules: parseRuleList(comment.body.slice(m.index + m[0].length)),
    });
  }
  return directives;
}

function isEnforcedRule(rule) {
  return KEPT_COMPAT_RULES.has(rule) || !RULE_NAME_RE.test(rule);
}

// Every real comment that mentions contract-ok. `version` is null when the
// comment is not exactly a well-formed `-- contract-ok: min_version >= X.Y.Z`
// line comment (reported as an error, never silently ignored).
function findContractOkMarkers(comments) {
  const markers = [];
  for (const comment of comments) {
    if (!/contract-ok/i.test(comment.body)) continue;
    const m = comment.kind === 'line' ? CONTRACT_OK_RE.exec(comment.text.trimEnd()) : null;
    markers.push({ comment, version: m ? m[1] : null });
  }
  return markers;
}

function semverGt(a, b) {
  return !semverGte(b, a);
}

// WR-C02: a marker `min_version >= X` is valid only when
//   floorBeforeLastRaise < X <= floor
// where `floor` is the floor after every EARLIER file and
// `floorBeforeLastRaise` is the floor just before the most recent raise.
// The upper bound means the floor already excludes every app version below
// X. The lower bound means X cites a floor that an earlier migration really
// raised -- a marker at the seed floor (never raised) or at a stale older
// floor is a self-signed waiver, not expand/contract, and is rejected.
function checkMarker(version, floorState) {
  const required = parseSemver(version);
  const { floor, floorBeforeLastRaise } = floorState;
  if (floor === null || !semverGte(parseSemver(floor), required)) {
    return `needs min_supported_version >= ${version} but the floor at that point is ${floor ?? 'unset'}`;
  }
  if (floorBeforeLastRaise === null) {
    return `contract-ok: min_version >= ${version} cites a floor that no earlier migration has raised (floor is still its seed value ${floor}); raise the floor in an earlier migration first`;
  }
  if (!semverGt(required, parseSemver(floorBeforeLastRaise))) {
    return `contract-ok: min_version >= ${version} must be above ${floorBeforeLastRaise}, the floor before the most recent raise (to ${floor}); cite the raised floor`;
  }
  return null;
}

// CR-C04: resolve squawk's native binary through the installed squawk-cli
// package (its own getBinaryPath() picks the platform package) and spawn it
// directly -- no shell, no .cmd shim, no npx fallback. Arguments go to the
// process as an argv array, so a filename can never be parsed as a command
// and paths containing spaces stay one argument. If squawk-cli is not
// installed the gate fails closed (WR-C01).
function resolveSquawkBinary() {
  try {
    const requireFromRoot = createRequire(join(ROOT, 'package.json'));
    const { getBinaryPath } = requireFromRoot('squawk-cli/js/index.js');
    const bin = getBinaryPath();
    if (!isAbsolute(bin) || !existsSync(bin)) throw new Error(`resolved path is not an existing file: ${bin}`);
    return { bin };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

function runSquawk(files) {
  if (files.length === 0) return { status: 0, output: '' };
  const configPath = join(ROOT, '.squawk.toml');
  const resolved = resolveSquawkBinary();
  if (!resolved.bin) {
    return { status: 1, output: `squawk-cli is not installed (run npm ci): ${resolved.error}` };
  }
  const args = ['--config', configPath, ...files];
  const result = spawnSync(resolved.bin, args, { cwd: ROOT, encoding: 'utf8', shell: false });
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

  // CR-C04: enforce the migration naming convention. Supabase CLI applies
  // any `<digits>_<anything>.sql`, so a hostile or accidental name (shell
  // metacharacters, spaces, upper case) is rejected here rather than linted
  // and shipped.
  for (const filePath of files) {
    const fileName = filePath.split(/[\\/]/).pop();
    if (!MIGRATION_FILENAME_RE.test(fileName)) {
      errors.push(`${JSON.stringify(fileName)}: invalid migration filename; must match ${MIGRATION_FILENAME_RE}`);
    }
  }

  // 1. squawk, spawned directly (no shell) against the resolved file list.
  const squawkResult = runSquawk(files);
  if (squawkResult.status !== 0) {
    errors.push(`squawk reported violations:\n${squawkResult.output}`);
  }

  // 2. contract-ok floor check, file by file in filename order. A file's
  // markers are checked against the floor as it stood after all EARLIER
  // files -- a floor bump and the destructive change it authorizes must be
  // separate migrations, bump first.
  // floor: null until the first floor-setting statement is seen anywhere.
  // floorBeforeLastRaise: the floor just before the most recent strict raise
  // (null until the floor has been raised at least once past its seed).
  const floorState = { floor: null, floorBeforeLastRaise: null };

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

    const lineOf = (offset) => content.slice(0, offset).split('\n').length;

    // CR-C01: squawk honours squawk-ignore-file for the whole file (and a
    // bare one ignores every rule). A file-level ignore of an enforced rule
    // is never allowed -- ignore per statement, each with its own marker.
    const directives = findSquawkDirectives(lexed.comments);
    for (const d of directives.filter((x) => x.fileLevel)) {
      const enforced = d.rules.length === 0 ? ['<every rule>'] : d.rules.filter(isEnforcedRule);
      if (enforced.length > 0) {
        errors.push(
          `${fileName}:${lineOf(d.comment.start)}: squawk-ignore-file of enforced rule(s) ${enforced.join(', ')} is not allowed; use a per-statement squawk-ignore with a contract-ok marker`
        );
      }
    }

    const markers = findContractOkMarkers(lexed.comments);
    for (const bad of markers.filter((mk) => mk.version === null)) {
      errors.push(
        `${fileName}:${lineOf(bad.comment.start)}: malformed contract-ok marker; expected exactly '-- contract-ok: min_version >= X.Y.Z'`
      );
    }
    const usedMarkers = new Set();

    // WR-C02: pair markers with statements, not files. Every statement that
    // squawk-ignores an enforced rule (in its leading comments or inside it)
    // needs its OWN valid contract-ok marker among its leading comments --
    // marker, then squawk-ignore, then the statement.
    for (const stmt of lexed.statements) {
      if (stmt.start === -1) continue; // comment-only tail: suppresses nothing
      const inLeading = (c) => c.start >= stmt.segmentStart && c.start < stmt.start;
      const inStatement = (c) => c.start >= stmt.segmentStart && c.start < stmt.end;

      const reasons = [];
      for (const d of directives) {
        if (d.fileLevel || !inStatement(d.comment)) continue;
        const enforced = d.rules.length === 0 ? ['<every rule>'] : d.rules.filter(isEnforcedRule);
        if (enforced.length > 0) reasons.push(`squawk-ignore ${enforced.join(', ')}`);
      }
      if (reasons.length === 0) continue;

      const where = `${fileName}:${lineOf(stmt.start)}`;
      const stmtMarkers = markers.filter((mk) => mk.version !== null && inLeading(mk.comment));
      if (stmtMarkers.length === 0) {
        errors.push(
          `${where}: ${reasons.join('; ')} has no '-- contract-ok: min_version >= X.Y.Z' marker directly above the statement`
        );
        continue;
      }
      for (const mk of stmtMarkers) {
        usedMarkers.add(mk);
        const problem = checkMarker(mk.version, floorState);
        if (problem) errors.push(`${where}: ${problem}`);
      }
    }

    // A contract-ok marker that authorises nothing is a no-op -- allowed, but
    // flagged so a stale or copy-pasted marker doesn't go unnoticed.
    for (const mk of markers) {
      if (mk.version !== null && !usedMarkers.has(mk)) {
        warnings.push(
          `${fileName}:${lineOf(mk.comment.start)}: contract-ok marker is not directly above a statement that needs one (no-op)`
        );
      }
    }

    // Apply this file's own floor bumps AFTER evaluating its markers, so
    // they only affect files that come later.
    for (const bump of findFloorBumps(lexed.statements, fileName, warnings)) {
      if (floorState.floor !== null && semverGt(parseSemver(bump), parseSemver(floorState.floor))) {
        floorState.floorBeforeLastRaise = floorState.floor;
      }
      floorState.floor = bump;
    }
  }

  for (const w of warnings) console.warn(`WARNING: ${w}`);

  if (errors.length > 0) {
    console.error(`\nMIGRATION COMPAT FAILED (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(`MIGRATION COMPAT OK (${files.length} files, floor ${floorState.floor ?? 'unset'})`);
  process.exit(0);
}

main();
