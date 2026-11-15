// 05.5-10: the Decide adapter (month/model/recurring detectCandidates, now built on detectRecurring and
// twoDateClusters) gives the same candidates as the frozen pre-merge Decide detector wherever the two old
// detectors agreed on what a cadence is. Where their gap windows differed, Activity's win (D-12); those
// boundary gaps are pinned by hand below and listed for the D-07 changed-answers page.
import fc from 'fast-check';
import { fcRuns } from '../../decide/v3/__tests__/helpers/fcRuns';
import { addDays } from '../../time/calendar';
import { detectCandidates, type DetectContext, type DetectRow } from '../../month/model/recurring';
import { detectCandidates as oldDetectCandidates } from './fixtures/oldDetectCandidates';

const EMPTY: DetectContext = { dismissedKeys: new Set(), linkedRowIds: new Set() };

// Gaps both old windows accepted (the overlap of the Activity and Decide windows).
const OVERLAP_GAPS: readonly (readonly [number, number])[] = [
  [6, 8], // weekly
  [12, 16], // fortnightly
  [28, 33], // monthly
  [85, 95], // quarterly
  [360, 365], // yearly
];

const NAMES = ['Rent', 'Netflix Subscription', 'Gym', 'Salary'];

const seriesArb = fc.record({
  name: fc.constantFrom(...NAMES),
  account: fc.constantFrom<string | null>('a1', 'a2', null),
  sign: fc.constantFrom(-1, 1),
  base: fc.integer({ min: 500, max: 200_000 }),
  windowIdx: fc.integer({ min: 0, max: OVERLAP_GAPS.length - 1 }),
  start: fc.integer({ min: 0, max: 400 }),
  gapPicks: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 5 }),
  jitter: fc.array(fc.integer({ min: -15, max: 15 }), { minLength: 2, maxLength: 6 }),
  transfer: fc.boolean(),
});

const twoDatePayArb = fc.record({
  d1: fc.integer({ min: 1, max: 5 }),
  d2: fc.integer({ min: 14, max: 20 }),
  // 2 months is 4 rows with a 17-day gap: the fortnightly-window difference pinned below
  months: fc.integer({ min: 3, max: 5 }),
  account: fc.constantFrom<string | null>('a1', null),
});


function toSeries(s: {
  name: string;
  account: string | null;
  sign: number;
  base: number;
  windowIdx: number;
  start: number;
  gapPicks: number[];
  jitter: number[];
  transfer: boolean;
}, idx: number): DetectRow[] {
  const [lo, hi] = OVERLAP_GAPS[s.windowIdx]!;
  let date = addDays('2024-01-01', s.start);
  const rows: DetectRow[] = [];
  for (let i = 0; i <= s.gapPicks.length; i += 1) {
    const j = s.jitter[i % s.jitter.length]!;
    const amount = s.sign * Math.max(1, Math.round((s.base * (100 + j)) / 100));
    rows.push({
      id: `s${idx}-${String(i).padStart(2, '0')}`,
      name: s.name,
      amount,
      currency: 'USD',
      date,
      isTransfer: s.transfer && i === 0,
      accountId: s.account,
    });
    date = addDays(date, lo + (s.gapPicks[i % s.gapPicks.length]! % (hi - lo + 1)));
  }
  return rows;
}

function toTwoDate(p: { d1: number; d2: number; months: number; account: string | null }, idx: number): DetectRow[] {
  const rows: DetectRow[] = [];
  for (let m = 0; m < p.months; m += 1) {
    const mm = String(1 + m).padStart(2, '0');
    for (const d of [p.d1, p.d2]) {
      rows.push({
        id: `t${idx}-${m}-${d}`,
        name: 'Pay Run',
        amount: 250_000,
        currency: 'USD',
        date: `2025-${mm}-${String(d).padStart(2, '0')}`,
        isTransfer: false,
        accountId: p.account,
      });
    }
  }
  return rows;
}

describe('detectCandidates adapter parity with the frozen Decide detector', () => {
  it('equal on generated rows whose gaps sit in both windows', () => {
    fc.assert(
      fc.property(
        fc.array(seriesArb, { minLength: 1, maxLength: 4 }),
        fc.array(twoDatePayArb, { minLength: 0, maxLength: 1 }),
        (series, pays) => {
          const rows = [...series.flatMap(toSeries), ...pays.flatMap(toTwoDate)];
          expect(detectCandidates(rows, EMPTY)).toEqual(oldDetectCandidates(rows, EMPTY));
        }
      ),
      { numRuns: fcRuns(200), seed: 0x0a11 }
    );
  });

  it('dismissed keys and linked rows filter the same way', () => {
    fc.assert(
      fc.property(fc.array(seriesArb, { minLength: 1, maxLength: 3 }), (series) => {
        const rows = series.flatMap(toSeries);
        const first = oldDetectCandidates(rows, EMPTY)[0];
        fc.pre(first !== undefined);
        const ctx: DetectContext = { dismissedKeys: new Set([first!.key]), linkedRowIds: new Set([rows[0]!.id]) };
        expect(detectCandidates(rows, ctx)).toEqual(oldDetectCandidates(rows, ctx));
      }),
      { numRuns: fcRuns(100), seed: 0x0a12 }
    );
  });
});

describe('boundary gaps where the two old windows differed (Activity wins; listed for D-07)', () => {
  function series(gap: number, count: number): DetectRow[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `b${i}`,
      name: 'Bill',
      amount: -1000,
      currency: 'USD',
      date: addDays('2025-01-03', gap * i),
      isTransfer: false,
      accountId: 'a1',
    }));
  }
  const offered = (rows: DetectRow[]): boolean => detectCandidates(rows, EMPTY).length === 1;
  const oldOffered = (rows: DetectRow[]): boolean => oldDetectCandidates(rows, EMPTY).length === 1;

  // [gap, rows, old offered it, new offers it]
  it.each([
    [5, 3, true, false], // weekly: old [5,9], Activity [6,8]
    [9, 3, true, false],
    [11, 3, true, false], // fortnightly: old [11,17], Activity [12,16]
    [17, 3, true, false],
    [27, 3, false, true], // monthly: old [28,33], Activity [27,33]
    [96, 2, false, true], // quarterly: old [85,95], Activity [85,97]
    [97, 2, false, true],
  ])('gap %i x %i rows: old %s, new %s', (gap, count, wasOffered, nowOffered) => {
    const rows = series(gap, count);
    expect(oldOffered(rows)).toBe(wasOffered);
    expect(offered(rows)).toBe(nowOffered);
  });
});
