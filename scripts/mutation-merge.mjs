// 05.4-43 (D-172, D-174): join the part reports of a full mutation run into one report, one score and one gate.
// The score is Stryker's: (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage); Ignored (static mutants
// under --ignoreStatic, disable comments), CompileError and RuntimeError are left out. The gate fails below the bar,
// when a planned file arrives short (a part is missing or did not finish), or when two parts report the same mutant.
//
//   node scripts/mutation-merge.mjs --bar 90 --plan reports/mutation-plan.json --out reports/mutation/mutation.json \
//     --html reports/mutation/index.html --incremental-out .stryker-cache/incremental.json parts/
//
// Inputs are files or folders; folders are searched for mutation.json (reports) and incremental.json (baselines).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DETECTED = new Set(['Killed', 'Timeout']);
const UNDETECTED = new Set(['Survived', 'NoCoverage']);
const ERRORS = new Set(['CompileError', 'RuntimeError']);

const normal = (name, cwd = process.cwd()) => (isAbsolute(name) ? relative(cwd, name) : name).replaceAll('\\', '/');
const keyOf = (m) => {
  const { start, end } = m.location;
  return `${start.line}:${start.column}-${end.line}:${end.column}|${m.mutatorName}|${m.replacement}`;
};

/** Join part reports: mutants by file (no duplicates, fresh unique ids), test files by file and test id. */
export function mergeReports(reports) {
  const files = {};
  const seen = new Map();
  const testFiles = {};
  let duplicates = 0;
  let nextId = 1;
  for (const r of reports) {
    for (const [rawName, f] of Object.entries(r.files ?? {})) {
      const name = normal(rawName);
      files[name] ??= { ...f, mutants: [] };
      const keys = seen.get(name) ?? new Set();
      seen.set(name, keys);
      for (const m of f.mutants ?? []) {
        const key = keyOf(m);
        if (keys.has(key)) {
          duplicates++;
          continue;
        }
        keys.add(key);
        files[name].mutants.push({ ...m, id: String(nextId++) });
      }
    }
    for (const [rawName, tf] of Object.entries(r.testFiles ?? {})) {
      const name = normal(rawName);
      testFiles[name] ??= { ...tf, tests: [] };
      const ids = new Set(testFiles[name].tests.map((t) => t.id));
      for (const t of tf.tests ?? []) if (!ids.has(t.id)) testFiles[name].tests.push(t), ids.add(t.id);
    }
  }
  const first = reports[0] ?? {};
  const report = { ...first, files };
  if (Object.keys(testFiles).length > 0) report.testFiles = testFiles;
  else delete report.testFiles;
  return { report, duplicates };
}

/** Stryker's mutation score (percent, covered and uncovered alike) and the counts behind it. */
export function score(report) {
  const c = { killed: 0, timeout: 0, survived: 0, noCoverage: 0, ignored: 0, errors: 0, total: 0, pending: 0 };
  for (const f of Object.values(report.files ?? {})) {
    for (const m of f.mutants ?? []) {
      c.total++;
      if (m.status === 'Killed') c.killed++;
      else if (m.status === 'Timeout') c.timeout++;
      else if (m.status === 'Survived') c.survived++;
      else if (m.status === 'NoCoverage') c.noCoverage++;
      else if (m.status === 'Ignored') c.ignored++;
      else if (ERRORS.has(m.status)) c.errors++;
      else c.pending++;
    }
  }
  const detected = c.killed + c.timeout;
  const valid = detected + c.survived + c.noCoverage;
  return { ...c, detected, valid, score: valid === 0 ? 100 : Math.round((detected / valid) * 10000) / 100 };
}

/** Files with mutants left alive (Survived or NoCoverage), most first. */
export function survivorsByFile(report) {
  const rows = [];
  for (const [file, f] of Object.entries(report.files ?? {})) {
    const survived = f.mutants.filter((m) => m.status === 'Survived').length;
    const noCoverage = f.mutants.filter((m) => m.status === 'NoCoverage').length;
    if (survived + noCoverage > 0) rows.push({ file, survived, noCoverage, left: survived + noCoverage });
  }
  return rows.sort((a, b) => b.left - a.left || a.file.localeCompare(b.file));
}

/** Every planned file must arrive with its planned mutant count; returns the shortfalls. */
export function completeness(report, plan) {
  const out = [];
  for (const [file, expected] of Object.entries(plan.files ?? {})) {
    if (expected === 0) continue;
    const got = report.files?.[file]?.mutants.length ?? 0;
    if (got !== expected) out.push(`${file}: ${got} of ${expected} mutants reported`);
  }
  return out;
}

/** The gate: score at or above the bar, nothing missing, nothing reported twice, nothing left untested. */
export function gate(report, { bar, plan, duplicates = 0 }) {
  const s = score(report);
  const reasons = [];
  if (s.score < bar) reasons.push(`mutation score ${s.score}% is below the ${bar}% bar`);
  if (plan) reasons.push(...completeness(report, plan));
  if (duplicates > 0) reasons.push(`${duplicates} mutants were reported by more than one part`);
  if (s.pending > 0) reasons.push(`${s.pending} mutants have no final status`);
  return { pass: reasons.length === 0, score: s, reasons };
}

function collect(inputs, base) {
  const out = [];
  const walk = (p) => {
    if (statSync(p).isDirectory()) for (const e of readdirSync(p)) walk(join(p, e));
    else if (p.endsWith(base)) out.push(p);
  };
  for (const i of inputs) if (existsSync(i)) walk(i);
  return out.sort();
}

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
function write(path, text) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, text);
}

function html(report) {
  const require = createRequire(import.meta.url);
  const core = require.resolve('@stryker-mutator/core/package.json');
  const bundle = readFileSync(createRequire(core).resolve('mutation-testing-elements/dist/mutation-test-elements.js'), 'utf8');
  const data = JSON.stringify(report).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mutation report</title><script>${bundle}</script></head><body>
<mutation-test-report-app titlePostfix="Stryker"></mutation-test-report-app>
<script>document.querySelector('mutation-test-report-app').report = ${data};</script></body></html>\n`;
}

function summary(g, label, survivors) {
  const s = g.score;
  const lines = [
    `## ${label}: ${s.score}% (${g.pass ? 'pass' : 'FAIL'})`,
    '',
    `Killed ${s.killed}, timed out ${s.timeout}, survived ${s.survived}, no coverage ${s.noCoverage}, ignored ${s.ignored}, errors ${s.errors}, total ${s.total}.`,
    '',
    ...g.reasons.map((r) => `- ${r}`),
  ];
  if (survivors.length > 0) {
    lines.push('', '| File | Survived | No coverage |', '|---|---|---|');
    for (const r of survivors) lines.push(`| ${r.file} | ${r.survived} | ${r.noCoverage} |`);
  }
  return `${lines.join('\n')}\n`;
}

async function main(argv) {
  const flags = new Map();
  const inputs = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) flags.set(argv[i], argv[++i]);
    else inputs.push(argv[i]);
  }
  const bar = Number(flags.get('--bar') ?? '90');
  const plan = flags.has('--plan') ? readJson(flags.get('--plan')) : undefined;
  const reportFiles = collect(inputs, 'mutation.json');
  if (reportFiles.length === 0) throw new Error(`no mutation.json under ${inputs.join(', ')}`);
  if (plan && reportFiles.length !== plan.parts.length) {
    console.log(`warning: ${reportFiles.length} part reports for ${plan.parts.length} planned parts`);
  }
  const { report, duplicates } = mergeReports(reportFiles.map(readJson));
  const g = gate(report, { bar, plan, duplicates });
  if (flags.has('--out')) write(flags.get('--out'), `${JSON.stringify(report)}\n`);
  if (flags.has('--html')) write(flags.get('--html'), html(report));
  if (flags.has('--incremental-out')) {
    const baselines = collect(inputs, 'incremental.json');
    if (baselines.length > 0) write(flags.get('--incremental-out'), `${JSON.stringify(mergeReports(baselines.map(readJson)).report)}\n`);
  }
  const text = summary(g, flags.get('--label') ?? `Mutation score (${reportFiles.length} report${reportFiles.length === 1 ? '' : 's'})`, survivorsByFile(report));
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  if (!g.pass) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
