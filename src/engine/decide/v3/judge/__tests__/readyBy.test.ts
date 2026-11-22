/**
 * 08.1 D-05 / D-06: firstSafeStart on its own. The hand-worked tables are the owner-approved cases (SN-27 re-check, SN-28, SN-29, SN-30).
 */
import * as fc from 'fast-check';
import { addDays, addMonthsClamped } from '../../dates';
import { candidateStarts, firstSafeStart } from '../readyBy';

const ASOF = '2026-11-15';

/** A path with a low point that grows by `step` a month, as the case sheets do: lowest(start) = base + step * months from 1 Nov 2026. */
function monthlyLows(table: Readonly<Record<string, number>>): (start: string) => number | null {
  return (start) => table[start] ?? null;
}

describe('candidateStarts', () => {
  it('lists the check day, paydays and the 1st of each month, sorted, none past the limit', () => {
    const days = candidateStarts(ASOF, ['2026-12-15', '2028-01-01', '2026-11-15', '2026-11-30'], 12);
    expect(days[0]).toBe(ASOF);
    expect(days).toContain('2026-11-30');
    expect(days).toContain('2026-12-01');
    expect(days).toContain('2026-12-15');
    expect(days).toContain('2027-11-01');
    expect(days).not.toContain('2027-12-01');
    expect(days).not.toContain('2028-01-01');
    expect([...days].sort()).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe('firstSafeStart: the approved cases', () => {
  it('SN-27 re-check: 1 Dec -203.58, 1 Jan -103.58, 1 Feb -3.58, 1 Mar +154.48 gives 1 March 2027', () => {
    const r = firstSafeStart({
      asOf: ASOF,
      paydays: [],
      notBefore: ASOF,
      maxMonths: 12,
      floor: 0,
      lowestFrom: monthlyLows({ '2026-11-15': -300000, '2026-12-01': -20358, '2027-01-01': -10358, '2027-02-01': -358, '2027-03-01': 15448 }),
    });
    expect(r).toEqual({ date: '2027-03-01' });
  });

  it('SN-28: lows -150, -50, +50 give 1 January 2027', () => {
    const r = firstSafeStart({
      asOf: ASOF,
      paydays: [],
      notBefore: ASOF,
      maxMonths: 12,
      floor: 0,
      lowestFrom: monthlyLows({ '2026-11-15': -15000, '2026-12-01': -5000, '2027-01-01': 5000 }),
    });
    expect(r).toEqual({ date: '2027-01-01' });
  });

  it('SN-29: 1 Dec -50, 1 Jan +950 gives 1 January 2027 (a date that only covers the first payment would say 1 December)', () => {
    const r = firstSafeStart({
      asOf: ASOF,
      paydays: [],
      notBefore: ASOF,
      maxMonths: 12,
      floor: 0,
      lowestFrom: monthlyLows({ '2026-11-15': -40000, '2026-12-01': -5000, '2027-01-01': 95000 }),
    });
    expect(r).toEqual({ date: '2027-01-01' });
  });

  it('SN-30: the first safe day is 1 June 2028, past the 12-month limit, so there is no date', () => {
    const lowest = (start: string): number => (start < '2028-06-01' ? -5000 : 5000);
    expect(firstSafeStart({ asOf: ASOF, paydays: [], notBefore: ASOF, maxMonths: 12, floor: 0, lowestFrom: lowest })).toEqual({ beyond: true });
  });
});

describe('firstSafeStart: edges', () => {
  it('a window exactly at the floor passes', () => {
    const r = firstSafeStart({ asOf: ASOF, paydays: [], notBefore: ASOF, maxMonths: 12, floor: 0, lowestFrom: () => 0 });
    expect(r).toEqual({ date: ASOF });
  });

  it('a payday can be the first safe day, ahead of the next 1st', () => {
    const r = firstSafeStart({ asOf: ASOF, paydays: ['2026-11-28'], notBefore: ASOF, maxMonths: 12, floor: 0, lowestFrom: (s) => (s >= '2026-11-28' ? 1 : -1) });
    expect(r).toEqual({ date: '2026-11-28' });
  });

  it('never gives a day before the judged date', () => {
    const r = firstSafeStart({ asOf: ASOF, paydays: [], notBefore: '2027-02-01', maxMonths: 12, floor: 0, lowestFrom: () => 10 });
    expect(r).toEqual({ date: '2027-02-01' });
  });

  it('a judged date already past the limit is beyond, without reading any window', () => {
    const lowestFrom = jest.fn(() => 10);
    expect(firstSafeStart({ asOf: ASOF, paydays: [], notBefore: '2027-11-16', maxMonths: 12, floor: 0, lowestFrom })).toEqual({ beyond: true });
    expect(lowestFrom).not.toHaveBeenCalled();
  });

  it('a window that cannot be read is skipped; when none can be read the answer is null', () => {
    expect(firstSafeStart({ asOf: ASOF, paydays: [], notBefore: ASOF, maxMonths: 12, floor: 0, lowestFrom: () => null })).toBeNull();
    expect(firstSafeStart({ asOf: ASOF, paydays: [], notBefore: ASOF, maxMonths: 12, floor: 0, lowestFrom: (s) => (s === ASOF ? null : s === '2026-12-01' ? 5 : -1) })).toEqual({ date: '2026-12-01' });
  });

  it('a floor above 0 (the protected net) is the line the window must stay at or above', () => {
    const r = firstSafeStart({ asOf: ASOF, paydays: [], notBefore: ASOF, maxMonths: 12, floor: 200000, lowestFrom: (s) => (s >= '2027-01-01' ? 200000 : 199999) });
    expect(r).toEqual({ date: '2027-01-01' });
  });
});

describe('firstSafeStart: properties', () => {
  const lows = fc.array(fc.integer({ min: -500000, max: 500000 }), { minLength: 0, maxLength: 20 });
  const startOf = fc.integer({ min: 0, max: 40 }).map((n) => addDays('2026-11-15', n));
  const lookup = (xs: readonly number[]) => (start: string): number => xs[Number(start.slice(5, 7) + start.slice(8, 10)) % (xs.length === 0 ? 1 : xs.length)] ?? 0;

  it('the date returned stays at or above the floor, no earlier candidate does, and it is never before notBefore', () => {
    fc.assert(
      fc.property(lows, fc.integer({ min: -1000, max: 1000 }), startOf, (xs, floor, notBefore) => {
        const lowestFrom = lookup(xs);
        const input = { asOf: ASOF, paydays: ['2026-12-15', '2027-01-15'], notBefore, maxMonths: 12, floor, lowestFrom };
        const r = firstSafeStart(input);
        if (r === null) return false; // lowestFrom always reads
        const all = candidateStarts(ASOF, input.paydays, 12).filter((d) => d >= notBefore);
        if ('beyond' in r) return all.every((d) => lowestFrom(d) < floor);
        return lowestFrom(r.date) >= floor && r.date >= notBefore && all.filter((d) => d < r.date).every((d) => lowestFrom(d) < floor);
      })
    );
  });

  it('every candidate is inside the 12-month limit and none is before the check day', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 800 }).map((n) => addDays(ASOF, n)), { maxLength: 30 }), (paydays) => {
        const limit = addMonthsClamped(ASOF, 12);
        return candidateStarts(ASOF, paydays, 12).every((d) => d >= ASOF && d <= limit);
      })
    );
  });
});
