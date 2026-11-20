/**
 * 05.4-61 (D-177 a): the cash route's ready date is carried only when the cash answer is Not yet; a fit carries none
 * even if the result object holds one.
 */
import { minorUnits } from '../../../money/types';
import { SOLE_SHARE } from '../../share';
import { saveVsBorrow } from '../borrowing';
import type { Fact, Result, Schedule } from '../types';

const mu = minorUnits;

const sched = (): Schedule => ({
  cadence: { unit: 'month', every: 1 },
  count: 6,
  payment: mu(10_592),
  finalPayment: mu(10_588),
  lastPaying: 6,
  firstDate: '2026-12-15',
  financed: mu(60_000),
  pauseInterest: mu(0),
  totalPaid: mu(63_548),
  totalInterest: mu(3_548),
  fees: { setup: mu(0), perPeriod: mu(0), end: mu(0) },
  monthlyEquivalent: mu(10_592),
  source: 'computed',
});

const cash = (code: Result['code'], readyBy: Result['readyBy'], facts: Fact[] = []): Result => ({ code, readyBy, facts }) as unknown as Result;

describe('05.4-61 saveVsBorrow: readyBy', () => {
  const ready = { kind: 'date', date: '2027-01-10' } as Result['readyBy'];

  it('a Not yet cash route carries its ready date', () => {
    expect(saveVsBorrow(cash('not_yet', ready), sched(), SOLE_SHARE).readyBy).toEqual(ready);
  });

  it('a cash route that fits carries none, whatever the result object holds', () => {
    expect(saveVsBorrow(cash('fits_month', ready, [{ code: 'month_left_after', values: { month: '2026-11', left: 40_000 } }]), sched(), SOLE_SHARE).readyBy).toBeNull();
    expect(saveVsBorrow(cash('fits_unspent', ready), sched(), SOLE_SHARE).readyBy).toBeNull();
  });
});
