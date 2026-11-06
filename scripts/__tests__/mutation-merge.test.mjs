// 05.4-43 (D-172, D-174): the part reports join into one report, one score and one gate. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeReports, score, survivorsByFile, completeness, gate } from '../mutation-merge.mjs';

const loc = (line, col = 1) => ({ start: { line, column: col }, end: { line, column: col + 3 } });
const mu = (id, line, status, extra = {}) => ({ id: String(id), mutatorName: 'EqualityOperator', replacement: 'a < b', location: loc(line), status, ...extra });
const report = (files, testFiles) => ({ schemaVersion: '2', thresholds: { high: 95, low: 90, break: null }, files, ...(testFiles ? { testFiles } : {}) });
const file = (mutants) => ({ language: 'typescript', source: 'x\n'.repeat(50), mutants });

test('score follows Stryker: (Killed + Timeout) / (Killed + Timeout + Survived + NoCoverage); Ignored and errors left out', () => {
  const r = report({
    'a.ts': file([mu(1, 1, 'Killed'), mu(2, 2, 'Killed'), mu(3, 3, 'Timeout'), mu(4, 4, 'Survived'), mu(5, 5, 'NoCoverage'),
      mu(6, 6, 'Ignored'), mu(7, 7, 'CompileError'), mu(8, 8, 'RuntimeError')]),
  });
  const s = score(r);
  assert.equal(s.detected, 3);
  assert.equal(s.valid, 5);
  assert.equal(s.ignored, 1);
  assert.equal(s.errors, 2);
  assert.equal(s.total, 8);
  assert.equal(s.score, 60);
});

test('no valid mutants scores 100 (nothing to catch)', () => {
  assert.equal(score(report({ 'a.ts': file([mu(1, 1, 'Ignored')]) })).score, 100);
});

test('parts of the same file (line ranges) join; nothing is counted twice; ids stay unique', () => {
  const p1 = report({ 'judge.ts': file([mu(0, 1, 'Killed'), mu(1, 2, 'Survived')]), 'a.ts': file([mu(0, 1, 'Killed')]) });
  const p2 = report({ 'judge.ts': file([mu(0, 30, 'Killed'), mu(1, 31, 'Timeout')]) });
  const { report: merged, duplicates } = mergeReports([p1, p2]);
  assert.equal(duplicates, 0);
  assert.equal(merged.files['judge.ts'].mutants.length, 4);
  assert.equal(merged.files['a.ts'].mutants.length, 1);
  const ids = Object.values(merged.files).flatMap((f) => f.mutants.map((x) => x.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(score(merged).score, 80); // 4 caught of 5
});

test('the same mutant in two parts is reported as a duplicate and kept once', () => {
  const p1 = report({ 'a.ts': file([mu(0, 1, 'Killed')]) });
  const p2 = report({ 'a.ts': file([mu(9, 1, 'Survived')]) });
  const { report: merged, duplicates } = mergeReports([p1, p2]);
  assert.equal(duplicates, 1);
  assert.equal(merged.files['a.ts'].mutants.length, 1);
});

test('test files are joined by file and test id, so the merged report works as an incremental baseline', () => {
  const t = (id) => ({ id, name: id });
  const p1 = report({ 'a.ts': file([mu(0, 1, 'Killed', { killedBy: ['t1'] })]) }, { 'a.test.ts': { tests: [t('t1'), t('t2')] } });
  const p2 = report({ 'b.ts': file([mu(0, 1, 'Killed', { killedBy: ['t3'] })]) }, { 'a.test.ts': { tests: [t('t2')] }, 'b.test.ts': { tests: [t('t3')] } });
  const { report: merged } = mergeReports([p1, p2]);
  assert.deepEqual(merged.testFiles['a.test.ts'].tests.map((x) => x.id).sort(), ['t1', 't2']);
  assert.deepEqual(merged.testFiles['b.test.ts'].tests.map((x) => x.id), ['t3']);
});

test('survivors are listed per file, most first; NoCoverage counts as a survivor', () => {
  const r = report({
    'a.ts': file([mu(1, 1, 'Survived')]),
    'b.ts': file([mu(1, 1, 'Survived'), mu(2, 2, 'NoCoverage'), mu(3, 3, 'Killed')]),
    'c.ts': file([mu(1, 1, 'Killed')]),
  });
  assert.deepEqual(survivorsByFile(r), [{ file: 'b.ts', survived: 1, noCoverage: 1, left: 2 }, { file: 'a.ts', survived: 1, noCoverage: 0, left: 1 }]);
});

test('completeness: every planned file must arrive with its planned mutant count', () => {
  const plan = { files: { 'a.ts': 2, 'judge.ts': 3, 'types.ts': 0 } };
  const ok = report({ 'a.ts': file([mu(1, 1, 'Killed'), mu(2, 2, 'Ignored')]), 'judge.ts': file([mu(1, 1, 'Killed'), mu(2, 2, 'Killed'), mu(3, 3, 'Killed')]) });
  assert.deepEqual(completeness(ok, plan), []);
  const missingPart = report({ 'a.ts': file([mu(1, 1, 'Killed'), mu(2, 2, 'Killed')]), 'judge.ts': file([mu(1, 1, 'Killed')]) });
  assert.deepEqual(completeness(missingPart, plan), ['judge.ts: 1 of 3 mutants reported']);
  const missingFile = report({ 'a.ts': file([mu(1, 1, 'Killed'), mu(2, 2, 'Killed')]) });
  assert.deepEqual(completeness(missingFile, plan), ['judge.ts: 0 of 3 mutants reported']);
});

test('gate: fails below the bar, fails when incomplete or duplicated, passes at the bar', () => {
  const at90 = report({ 'a.ts': file([...Array.from({ length: 9 }, (_, i) => mu(i, i + 1, 'Killed')), mu(9, 10, 'Survived')]) });
  assert.equal(gate(at90, { bar: 90 }).pass, true);
  assert.equal(gate(at90, { bar: 90.1 }).pass, false);
  const g = gate(at90, { bar: 90, plan: { files: { 'a.ts': 11 } } });
  assert.equal(g.pass, false);
  assert.match(g.reasons.join('\n'), /a\.ts: 10 of 11/);
  assert.equal(gate(at90, { bar: 90, duplicates: 1 }).pass, false);
});
