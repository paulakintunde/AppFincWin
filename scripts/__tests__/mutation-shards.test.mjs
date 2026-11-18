// 05.4-43 (D-172): the full mutation run is split into parts with about the same number of mutants. node --test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeCuts, splitFile, planParts, planOnly, rangeOf, inRange } from '../mutation-shards.mjs';

// A mutant is { start, end }: 0-based first and last line, as Stryker's instrumenter reports them.
const m = (start, end = start) => ({ start, end });

test('safe cuts: no mutant may straddle a cut line', () => {
  // lines 0..9; one mutant spans lines 2..5, so cuts 3, 4 and 5 are unsafe
  const cuts = safeCuts(10, [m(0), m(2, 5), m(3), m(8)]);
  assert.deepEqual(cuts, [0, 1, 2, 6, 7, 8, 9, 10]);
});

test('a file smaller than the piece size stays whole', () => {
  const pieces = splitFile({ name: 'a.ts', lines: 10, mutants: [m(1), m(2)] }, 5);
  assert.deepEqual(pieces, [{ file: 'a.ts', mutate: 'a.ts', count: 2 }]);
});

test('a big file is cut at safe lines into pieces of at most the piece size, covering every line once', () => {
  const mutants = [];
  for (let line = 0; line < 100; line++) mutants.push(m(line), m(line));
  mutants.push(m(40, 59)); // one wide mutant: lines 41..59 cannot be cut points
  const pieces = splitFile({ name: 'big.ts', lines: 100, mutants }, 30);
  assert.ok(pieces.length > 1);
  // only the piece holding the uncuttable stretch (the wide mutant) may exceed the size
  for (const p of pieces) assert.ok(p.count <= 30 || inRange(p.mutate, m(40, 59)), `piece ${p.mutate} has ${p.count}`);
  assert.equal(pieces.reduce((s, p) => s + p.count, 0), mutants.length);
  // contiguous 1-based ranges from 1 to the last line
  const ranges = pieces.map((p) => rangeOf(p.mutate));
  assert.equal(ranges[0].from, 1);
  assert.equal(ranges.at(-1).to, 100);
  for (let i = 1; i < ranges.length; i++) assert.equal(ranges[i].from, ranges[i - 1].to + 1);
  // every mutant is inside exactly one piece (Stryker keeps a mutant only if its whole location is inside a range)
  for (const mu of mutants) assert.equal(pieces.filter((p) => inRange(p.mutate, mu)).length, 1);
});

test('a single segment bigger than the piece size is kept whole rather than dropped', () => {
  const mutants = [m(0, 9), ...Array.from({ length: 50 }, (_, i) => m(1 + (i % 8)))];
  const pieces = splitFile({ name: 'one.ts', lines: 10, mutants }, 10);
  assert.equal(pieces.reduce((s, p) => s + p.count, 0), 51);
});

function syntheticRepo() {
  // 75 small and medium files plus one file far bigger than a part (like judge.ts)
  const files = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let f = 0; f < 75; f++) {
    const n = 20 + Math.floor(rnd() * 300);
    const lines = n + 10;
    files.push({ name: `src/f${f}.ts`, lines, mutants: Array.from({ length: n }, (_, i) => m(i)) });
  }
  files.push({ name: 'src/judge.ts', lines: 2000, mutants: Array.from({ length: 1923 }, (_, i) => m(i)) });
  return files;
}

test('parts differ by at most 15% in mutant count and every mutant is in exactly one part', () => {
  const files = syntheticRepo();
  const plan = planParts(files, 20);
  assert.equal(plan.parts.length, 20);
  const counts = plan.parts.map((p) => p.count);
  assert.ok(Math.max(...counts) <= Math.min(...counts) * 1.15, `uneven parts: ${counts.join(',')}`);
  const total = files.reduce((s, f) => s + f.mutants.length, 0);
  assert.equal(plan.total, total);
  assert.equal(counts.reduce((a, b) => a + b, 0), total);
  // per-file expected counts let the merge job prove that no part went missing
  assert.equal(plan.files['src/judge.ts'], 1923);
  for (const f of files) {
    for (const mu of f.mutants.slice(0, 40)) {
      const owners = plan.parts.filter((p) => p.mutate.split(',').some((e) => (e === f.name ? true : e.startsWith(`${f.name}:`) && inRange(e, mu))));
      assert.equal(owners.length, 1, `${f.name} line ${mu.start}`);
    }
  }
  // judge.ts is split across parts by line ranges
  assert.ok(plan.parts.filter((p) => p.mutate.includes('src/judge.ts:')).length >= 2);
});

test('fewer files than parts gives fewer parts, never an empty part', () => {
  const plan = planParts([{ name: 'a.ts', lines: 5, mutants: [m(1)] }, { name: 'b.ts', lines: 5, mutants: [m(1), m(2)] }], 20);
  assert.ok(plan.parts.length >= 1 && plan.parts.length <= 2);
  for (const p of plan.parts) assert.ok(p.count > 0);
});

test('a file with no mutants is left out of every part', () => {
  const plan = planParts([{ name: 'types.ts', lines: 50, mutants: [] }, { name: 'b.ts', lines: 5, mutants: [m(1)] }], 4);
  assert.ok(plan.parts.every((p) => !p.mutate.includes('types.ts')));
  assert.equal(plan.files['types.ts'], 0);
});

// 2026-11-18: re-run only the parts of a full run that hit the time limit, cut finer.
test('--only: every mutant inside the entries is planned exactly once, and none outside them', () => {
  const big = { name: 'judge.ts', lines: 200, mutants: [] };
  for (let line = 0; line < 200; line++) big.mutants.push(m(line), m(line));
  big.mutants.push(m(120, 125)); // a wide mutant inside the range
  big.mutants.push(m(98, 101)); // straddles the range start: Stryker would not keep it for 100-160, so neither do we
  const small = { name: 'settle.ts', lines: 30, mutants: [m(1), m(2), m(3)] };
  const other = { name: 'untouched.ts', lines: 10, mutants: [m(1)] };
  const entries = ['judge.ts:100-160', 'settle.ts'];
  const plan = planOnly([big, small, other], entries, 6);
  const wanted = [
    ...big.mutants.filter((mu) => inRange('judge.ts:100-160', mu)).map((mu) => ['judge.ts', mu]),
    ...small.mutants.map((mu) => ['settle.ts', mu]),
  ];
  assert.equal(plan.total, wanted.length);
  assert.deepEqual(plan.files, { 'judge.ts': wanted.length - 3, 'settle.ts': 3 });
  const pieces = plan.parts.flatMap((p) => p.mutate.split(','));
  for (const [file, mu] of wanted) {
    const owners = pieces.filter((e) => rangeOf(e).file === file && inRange(e, mu));
    assert.equal(owners.length, 1, `${file} ${mu.start}-${mu.end}`);
  }
  // nothing outside the entries: judge.ts pieces stay inside 100-160, untouched.ts is never named
  for (const e of pieces) {
    const r = rangeOf(e);
    assert.notEqual(r.file, 'untouched.ts');
    if (r.file === 'judge.ts') assert.ok(r.from >= 100 && r.to <= 160, e);
  }
  assert.equal(plan.parts.reduce((s, p) => s + p.count, 0), plan.total);
  assert.ok(plan.parts.length > 1, 'the range is cut into more than one part');
});

test('--only: a file outside the mutation scope is refused', () => {
  assert.throws(() => planOnly([{ name: 'a.ts', lines: 5, mutants: [m(1)] }], ['b.ts:1-5'], 2), /outside the mutation scope/);
});

test('--only: a function-wide BlockStatement is split off so the rest of the stretch can be cut', () => {
  const b = (start, end) => ({ start, end, name: 'BlockStatement' });
  const c = (line) => ({ start: line, end: line, name: 'ConditionalExpression' });
  const mutants = [b(10, 89), b(20, 22), ...Array.from({ length: 80 }, (_, i) => c(10 + i))];
  const plan = planOnly([{ name: 'judge.ts', lines: 100, mutants }], ['judge.ts:11-90'], 4);
  const blockOnly = plan.parts.filter((p) => p.exclude && p.exclude !== 'BlockStatement');
  const rest = plan.parts.filter((p) => p.exclude === 'BlockStatement');
  assert.equal(blockOnly.length, 1);
  assert.equal(blockOnly[0].mutate, 'judge.ts:11-90');
  assert.equal(blockOnly[0].count, 2);
  assert.ok(!blockOnly[0].exclude.split(',').includes('BlockStatement'));
  assert.ok(rest.length > 1, 'the stretch without BlockStatement is cut into several parts');
  // each mutant picked exactly once once excluded mutators are taken into account
  for (const mu of mutants) {
    const picks = plan.parts.filter(
      (p) => !(p.exclude ?? '').split(',').includes(mu.name) && p.mutate.split(',').some((e) => inRange(e, mu)),
    );
    assert.equal(picks.length, 1, `${mu.name} ${mu.start}-${mu.end}`);
  }
});
