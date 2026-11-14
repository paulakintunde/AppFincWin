/** @jest-environment node */
// ENG-16: proves the engine purity lint blocks through the ESLint Node API.
// The blocks live in eslint/enginePurity.cjs; plan 05.5-07 registers them in eslint.config.js.
//
// ESLint 9 loads eslint.config.js with a dynamic import, which jest's VM sandbox rejects
// (needs --experimental-vm-modules). So the ESLint API runs in one plain node child process
// and jest asserts on the JSON it prints.
import { execFileSync } from 'child_process';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../..');
const RULES = ['no-restricted-properties', 'no-restricted-syntax'];

type Probe = { code: string; filePath: string };

const RUNNER = `
const { ESLint } = require('eslint');
const path = require('path');
const root = process.argv[1];
const probes = JSON.parse(process.argv[2]);
const rules = new Set(JSON.parse(process.argv[3]));
const eslint = new ESLint({ cwd: root, overrideConfig: require(path.join(root, 'eslint/enginePurity.cjs')) });
(async () => {
  const counts = [];
  for (const p of probes) {
    const [res] = await eslint.lintText(p.code, { filePath: path.join(root, p.filePath) });
    counts.push(res.messages.filter((m) => m.ruleId && rules.has(m.ruleId)).length);
  }
  const results = await eslint.lintFiles(['src/engine/**/*.ts']);
  const bad = results.flatMap((r) => r.messages
    .filter((m) => m.ruleId && rules.has(m.ruleId))
    .map((m) => path.relative(root, r.filePath) + ':' + m.line + ' ' + m.ruleId));
  process.stdout.write('@@' + JSON.stringify({ counts, bad }));
})().catch((e) => { console.error(e); process.exit(1); });
`;

const P = 'src/engine/decide/probe.ts';
const FORMAT = 'src/engine/money/formatAmount.ts';

const BANNED: [string, string][] = [
  ['Date.now()', 'export const t = Date.now();'],
  ['new Date() with no argument', 'export const d = new Date();'],
  ['Date() called as a function', 'export const s = Date();'],
  ['Math.random()', 'export const r = Math.random();'],
  ['performance.now()', 'export const p = performance.now();'],
  ['toLocaleString()', 'export const f = (n: number) => n.toLocaleString();'],
  ['toLocaleDateString()', 'export const f = (d: Date) => d.toLocaleDateString();'],
  ['toLocaleTimeString()', 'export const f = (d: Date) => d.toLocaleTimeString();'],
  ['Intl outside the five files', "export const nf = new Intl.NumberFormat('en-GB');"],
];

const OTHER: { name: string; probe: Probe; expected: number }[] = [
  { name: 'allows new Date(Date.UTC(...))', probe: { code: 'export const d = new Date(Date.UTC(2026, 0, 1));', filePath: P }, expected: 0 },
  { name: 'allows Intl in a named formatting file', probe: { code: "export const nf = new Intl.NumberFormat('en-GB');", filePath: FORMAT }, expected: 0 },
  { name: 'still bans the clock inside a named Intl file', probe: { code: 'export const t = new Date();', filePath: FORMAT }, expected: 1 },
  { name: 'does not apply to engine tests', probe: { code: 'export const t = Date.now();', filePath: 'src/engine/decide/__tests__/probe.ts' }, expected: 0 },
];

const probes: Probe[] = [...BANNED.map(([, code]) => ({ code, filePath: P })), ...OTHER.map((o) => o.probe)];

let out: { counts: number[]; bad: string[] };

beforeAll(() => {
  const stdout: string = execFileSync(process.execPath, ['-e', RUNNER, ROOT, JSON.stringify(probes), JSON.stringify(RULES)], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  out = JSON.parse(stdout.slice(stdout.lastIndexOf('@@') + 2));
}, 240000);

describe('ENG-16 engine purity lint', () => {
  it.each(BANNED.map(([n], i) => [n, i] as [string, number]))('bans %s', (_n, i) => {
    expect(out.counts[i]).toBe(1);
  });

  it.each(OTHER.map((o, i) => [o.name, BANNED.length + i, o.expected] as [string, number, number]))(
    '%s',
    (_n, i, expected) => {
      expect(out.counts[i]).toBe(expected);
    },
  );

  it("today's engine passes with zero errors", () => {
    expect(out.bad).toEqual([]);
  });
});
