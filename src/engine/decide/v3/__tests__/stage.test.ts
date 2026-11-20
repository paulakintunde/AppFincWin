import fc from 'fast-check';
import { CONFIDENCE_MIN_MONTHS, HISTORY_PAY_MIN_MONTHS, INCOME_SWING_MIN_MONTHS, STAGE_DEEPER_MIN_MONTHS, STAGE_FULL_MIN_MONTHS } from '../constants';
import { firstShownCaveat, stageOf } from '../stage';
import type { StageSource } from '../stage';
import type { Basis, Caveat, CaveatCode, IncomePattern } from '../types';

const UP_TO = '2026-11-01' as never;
const partial = (used: number): Basis => ({ kind: 'partial', used, lookedFor: 3, upTo: UP_TO });
const records = (months: number): Basis => ({ kind: 'records', months, upTo: UP_TO });
const pic = (treated: IncomePattern, fullMonths: number) => ({ treated, fullMonths }) as never;
const src = (basis: Basis, incomePicture?: ReturnType<typeof pic>, monthsUsed: number = 0): StageSource => ({
  basis,
  month: { monthsUsed: Array.from({ length: monthsUsed }, () => '2026-10' as never), incomePicture },
});
const cav = (code: CaveatCode): Caveat => ({ code, values: {} });

describe('stage constants', () => {
  it('the deeper stage and the three engine gates move together', () => {
    expect(STAGE_FULL_MIN_MONTHS).toBe(1);
    expect(STAGE_DEEPER_MIN_MONTHS).toBe(CONFIDENCE_MIN_MONTHS);
    expect(CONFIDENCE_MIN_MONTHS).toBe(INCOME_SWING_MIN_MONTHS);
    expect(INCOME_SWING_MIN_MONTHS).toBe(HISTORY_PAY_MIN_MONTHS);
  });
});

describe('stageOf', () => {
  it('quick estimates -> first read, all three parts held back', () => {
    const r = stageOf(src({ kind: 'quick_estimates' }));
    expect(r.stage).toBe('first_read');
    expect(r.monthsUsed).toBe(0);
    expect(r.heldBackParts).toEqual(['answer_range', 'pay_swings', 'history_pay']);
    expect(r.nextUnlock).toEqual({ stage: 'full', monthsNeeded: 1 });
  });
  it('partial 0 months is still a first read', () => {
    expect(stageOf(src(partial(0))).stage).toBe('first_read');
  });
  it('partial 1 -> full answer', () => {
    const r = stageOf(src(partial(1)));
    expect(r.stage).toBe('full');
    expect(r.nextUnlock).toEqual({ stage: 'deeper', monthsNeeded: 3 });
  });
  it('partial 2 -> full answer, next unlock at 3', () => {
    const r = stageOf(src(partial(2)));
    expect(r.stage).toBe('full');
    expect(r.nextUnlock).toEqual({ stage: 'deeper', monthsNeeded: 3 });
  });
  it('records 3 with 3 pay months -> deeper, nothing held back', () => {
    const r = stageOf(src(records(3), pic('steady', 3)));
    expect(r.stage).toBe('deeper');
    expect(r.heldBackParts).toEqual([]);
    expect(r.nextUnlock).toBeNull();
  });
  it('records 3 with 2 pay months -> deeper, pay parts held back', () => {
    const r = stageOf(src(records(3), pic('steady', 2)));
    expect(r.stage).toBe('deeper');
    expect(r.heldBackParts).toEqual(['pay_swings', 'history_pay']);
  });
  it('records_with_reason counts its months', () => {
    const b: Basis = { kind: 'records_with_reason', months: 4, upTo: UP_TO, reason: {} as never };
    expect(stageOf(src(b)).monthsUsed).toBe(4);
  });
  it('partial 2 with 3 pay months -> only the answer range held back', () => {
    expect(stageOf(src(partial(2), pic('steady', 3))).heldBackParts).toEqual(['answer_range']);
  });
  it('month null: pay parts follow the record count and no pay window', () => {
    const r = stageOf({ basis: partial(2), month: null });
    expect(r.heldBackParts).toEqual(['answer_range', 'pay_swings', 'history_pay']);
    expect(r.windowUsed).toEqual({ recordMonths: 2, payMonths: null, payWindowLonger: false });
  });
  it('month without an income picture behaves like month null for pay', () => {
    expect(stageOf(src(records(5))).windowUsed.payMonths).toBeNull();
  });
  it('window: steady pay has no pay months', () => {
    expect(stageOf(src(records(6), pic('steady', 6))).windowUsed).toEqual({ recordMonths: 6, payMonths: null, payWindowLonger: false });
  });
  it('window: variable pay with 9 months uses 9 and is longer', () => {
    expect(stageOf(src(records(6), pic('variable', 9))).windowUsed).toEqual({ recordMonths: 6, payMonths: 9, payWindowLonger: true });
  });
  it('window: seasonal pay with 15 months is capped at 12', () => {
    expect(stageOf(src(records(6), pic('seasonal', 15))).windowUsed.payMonths).toBe(12);
  });
  it('window: variable pay with 5 months is not longer than the everyday window', () => {
    expect(stageOf(src(records(6), pic('variable', 5))).windowUsed).toEqual({ recordMonths: 6, payMonths: 5, payWindowLonger: false });
  });
  it('window: variable pay with exactly 6 months is not longer', () => {
    expect(stageOf(src(records(6), pic('variable', 6))).windowUsed.payWindowLonger).toBe(false);
  });
  it('property: held-back parts and stage follow the constants', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 24 }), fc.integer({ min: 0, max: 24 }), (m, f) => {
        const r = stageOf(src(records(m), pic('steady', f)));
        expect(r.heldBackParts.includes('answer_range')).toBe(m < CONFIDENCE_MIN_MONTHS);
        expect(r.heldBackParts.includes('pay_swings')).toBe(f < INCOME_SWING_MIN_MONTHS);
        expect(r.heldBackParts.includes('history_pay')).toBe(f < HISTORY_PAY_MIN_MONTHS);
        expect(r.stage === 'deeper').toBe(m >= STAGE_DEEPER_MIN_MONTHS);
      }),
    );
  });
});

describe('firstShownCaveat', () => {
  it('first read skips quick_estimates', () => {
    expect(firstShownCaveat([cav('quick_estimates'), cav('records_out_of_date')], 'first_read')?.code).toBe('records_out_of_date');
  });
  it('deeper returns the first caveat unchanged', () => {
    expect(firstShownCaveat([cav('quick_estimates'), cav('records_out_of_date')], 'deeper')?.code).toBe('quick_estimates');
  });
  it('full keeps large_for_month first and skips few_months', () => {
    expect(firstShownCaveat([cav('large_for_month'), cav('few_months')], 'full')?.code).toBe('large_for_month');
  });
  it('only few_months at full -> undefined', () => {
    expect(firstShownCaveat([cav('few_months')], 'full')).toBeUndefined();
  });
  it('empty -> undefined at any stage', () => {
    expect(firstShownCaveat([], 'first_read')).toBeUndefined();
    expect(firstShownCaveat([], 'deeper')).toBeUndefined();
  });
});
