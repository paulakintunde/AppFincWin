import { assert as fcAssert, property, shuffledSubarray } from 'fast-check';
import { minorUnits as mu } from '../../../../money/types';
import { dueKey, matchWindowDays, settle, toPaidLine, type Due, type PaidLine } from '../settle';

const due = (seriesId: string, date: string, amount = 100000): Due => ({ seriesId, date, amount: mu(amount) });
const pl = (id: string, date: string, over: Partial<PaidLine> = {}): PaidLine => ({
  id,
  seriesId: 's',
  date,
  amount: mu(100000),
  source: 'manual',
  ...over,
});

describe('toPaidLine', () => {
  const l = { id: 'x', date: '2026-10-01', amount: mu(5), role: 'spending', status: 'paid', seriesId: null, categoryId: null, coversMonths: null, expected: false, incomeKind: null, countsAs: null } as const;
  it('maps an absent source to manual and keeps statement', () => {
    expect(toPaidLine(l).source).toBe('manual');
    expect(toPaidLine({ ...l, source: 'statement' }).source).toBe('statement');
  });
});

describe('matchWindowDays', () => {
  it('is half the shortest gap minus a day, capped', () => {
    expect(matchWindowDays({ unit: 'week', every: 1 }, 7)).toBe(3);
    expect(matchWindowDays({ unit: 'week', every: 2 }, 7)).toBe(6);
    expect(matchWindowDays({ unit: 'month', every: 1 }, 7)).toBe(7);
    expect(matchWindowDays({ unit: 'month', every: 1 }, 3)).toBe(3);
  });
});

describe('settle', () => {
  const win = (): number => 7;

  it('H-02 pay received 5 days early settles its due date', () => {
    const r = settle([due('s', '2026-10-31')], [pl('a', '2026-10-26')], win);
    expect(r.settled.has('s|2026-10-31')).toBe(true);
    expect(r.usedLines.has('a')).toBe(true);
    expect(r.lineFor.get('s|2026-10-31')).toBe('a');
  });

  it('H-02 nearest wins: a 10-15 line settles 10-15, not 10-01', () => {
    const r = settle([due('s', '2026-10-01'), due('s', '2026-10-15')], [pl('a', '2026-10-15')], () => 6);
    expect([...r.settled]).toEqual(['s|2026-10-15']);
  });

  it('two dues 6 days apart each take their nearest line', () => {
    const r = settle([due('s', '2026-10-01'), due('s', '2026-10-07')], [pl('b', '2026-10-06'), pl('a', '2026-10-02')], win);
    expect(r.lineFor.get('s|2026-10-01')).toBe('a');
    expect(r.lineFor.get('s|2026-10-07')).toBe('b');
  });

  it('a line for another series never settles', () => {
    const r = settle([due('s', '2026-10-01')], [pl('a', '2026-10-01', { seriesId: 'other' })], win);
    expect(r.settled.size).toBe(0);
  });

  it('ties go to the earlier due date, then the earlier line date, then the smaller id', () => {
    const r1 = settle([due('s', '2026-10-05'), due('s', '2026-10-03')], [pl('a', '2026-10-04')], win);
    expect([...r1.settled]).toEqual(['s|2026-10-03']);
    const r2 = settle([due('s', '2026-10-05')], [pl('b', '2026-10-04'), pl('a', '2026-10-04')], win);
    expect([...r2.usedLines]).toEqual(['a']);
    const r3 = settle([due('s', '2026-10-05')], [pl('z', '2026-10-06'), pl('y', '2026-10-04')], win);
    expect([...r3.usedLines]).toEqual(['y']);
    const r4 = settle([due('t', '2026-10-05'), due('s', '2026-10-05')], [pl('a', '2026-10-05', { seriesId: null })], win);
    expect([...r4.settled]).toEqual(['s|2026-10-05']);
  });

  it('a duplicated due settles once', () => {
    const r = settle([due('s', '2026-10-05'), due('s', '2026-10-05')], [pl('a', '2026-10-05')], win);
    expect(r.settled.size).toBe(1);
  });

  it('D-51 a bill past due with no line is not settled: the date passing settles nothing', () => {
    const r = settle([due('s', '2026-09-02')], [], win);
    expect(r.settled.size).toBe(0);
  });

  it('D-56 a typed line of the right amount, two days late, settles it', () => {
    const r = settle([due('s', '2026-09-02')], [pl('t', '2026-09-04', { seriesId: null, source: 'manual' })], () => 3);
    expect(r.settled.has('s|2026-09-02')).toBe(true);
  });

  it('D-56 a statement line of the right amount settles it the same way', () => {
    const r = settle([due('s', '2026-09-02')], [pl('t', '2026-09-04', { seriesId: null, source: 'statement', amount: mu(104000) })], () => 3);
    expect(r.settled.has('s|2026-09-02')).toBe(true);
  });

  it('D-51 a line 15% off the amount does not settle, typed or statement', () => {
    const lines = [
      pl('t', '2026-09-03', { seriesId: null, source: 'manual', amount: mu(115000) }),
      pl('u', '2026-09-03', { seriesId: null, source: 'statement', amount: mu(85000) }),
    ];
    expect(settle([due('s', '2026-09-02')], lines, () => 3).settled.size).toBe(0);
  });

  it('D-56 amount band rejects zero, opposite sign and out-of-window lines', () => {
    const lines = [
      pl('z', '2026-09-02', { seriesId: null, amount: mu(0) }),
      pl('n', '2026-09-02', { seriesId: null, amount: mu(-100000) }),
      pl('w', '2026-09-20', { seriesId: null }),
    ];
    expect(settle([due('s', '2026-09-02')], lines, () => 3).settled.size).toBe(0);
    expect(settle([due('s', '2026-09-02', 0)], [pl('z', '2026-09-02', { seriesId: null })], () => 3).settled.size).toBe(0);
    expect(settle([due('s', '2026-09-02', -50000)], [pl('n', '2026-09-02', { seriesId: null, amount: mu(-50000) })], () => 3).settled.size).toBe(1);
  });

  it('dueKey joins series and date', () => {
    expect(dueKey(due('s', '2026-10-01'))).toBe('s|2026-10-01');
  });

  it('order property: shuffling the lines gives the same result', () => {
    const dues = [due('s', '2026-10-01'), due('s', '2026-10-05'), due('s', '2026-10-11'), due('t', '2026-10-04')];
    const lines = [
      pl('a', '2026-10-02'),
      pl('b', '2026-10-04'),
      pl('c', '2026-10-04', { seriesId: null }),
      pl('d', '2026-10-09'),
      pl('e', '2026-10-12'),
      pl('f', '2026-10-05', { seriesId: 't' }),
    ];
    const base = [...settle(dues, lines, () => 4).lineFor.entries()].sort();
    fcAssert(
      property(
        shuffledSubarray(lines, { minLength: lines.length, maxLength: lines.length }),
        shuffledSubarray(dues, { minLength: dues.length, maxLength: dues.length }),
        (ls, ds) => {
          expect([...settle(ds, ls, () => 4).lineFor.entries()].sort()).toEqual(base);
        },
      ),
      { seed: 0x0538, numRuns: 200 },
    );
  });
});
