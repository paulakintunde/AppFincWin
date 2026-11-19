/**
 * 05.4-61 (D-177 a): explorer edges: each lever alone can be negative, a lever at its cap is not "clamped", the seasonal lift
 * is the sum of both levers, and a covered price waits only when the answer waits.
 */
import { minorUnits } from '../../../../money/types';
import type { MonthModel } from '../../types';
import { explore } from '../explorer';

const mu = minorUnits;
const month = { month: '2026-10', typicalLeft: mu(42500), recurringBills: mu(120000), setAside: mu(30000), billsDue: mu(80000), e: mu(40000) } as unknown as MonthModel;
const base = { month, flexibleSaving: mu(10_000), price: mu(1000), unspent: mu(0) };

describe('05.4-61 explore: negative levers are refused, each on its own', () => {
  it.each([
    ['everydayCut', { everydayCut: mu(-1), flexibleSavingCut: mu(0) }, 10_000],
    ['flexibleSavingCut', { everydayCut: mu(0), flexibleSavingCut: mu(-1) }, 10_000],
    ['flexibleSaving', { everydayCut: mu(0), flexibleSavingCut: mu(0) }, -1],
  ])('%s below 0 throws', (_name, levers, flexibleSaving) => {
    expect(() => explore({ ...base, levers, flexibleSaving: mu(flexibleSaving) })).toThrow('explore: levers must be >= 0');
  });

  it('zero levers are fine', () => {
    expect(() => explore({ ...base, levers: { everydayCut: mu(0), flexibleSavingCut: mu(0) }, flexibleSaving: mu(0) })).not.toThrow();
  });
});

describe('05.4-61 explore: clamped only when a lever was cut down', () => {
  it('levers exactly at their caps are not clamped', () => {
    const r = explore({ ...base, levers: { everydayCut: mu(40_000), flexibleSavingCut: mu(10_000) } });
    expect(r.clamped).toBe(false);
    expect(r.typicalLeft).toBe(42_500 + 40_000 + 10_000);
  });

  it('the saving lever above its cap alone clamps; so does the everyday lever alone', () => {
    expect(explore({ ...base, levers: { everydayCut: mu(0), flexibleSavingCut: mu(10_001) } }).clamped).toBe(true);
    expect(explore({ ...base, levers: { everydayCut: mu(40_001), flexibleSavingCut: mu(0) } }).clamped).toBe(true);
  });

  it('levers below their caps are not clamped', () => {
    expect(explore({ ...base, levers: { everydayCut: mu(100), flexibleSavingCut: mu(100) } }).clamped).toBe(false);
  });
});

describe('05.4-61 explore: the seasonal lift is both levers added', () => {
  const months = Array.from({ length: 12 }, (_, i) => {
    const mm = String(((10 + i) % 12) + 1).padStart(2, '0');
    const year = i < 2 ? '2025' : '2026';
    const busy = ['05', '06', '07', '08', '09'].includes(mm);
    return { month: `${year}-${mm}`, income: mu(0), everyday: mu(0), left: mu(busy ? 150_000 : mm === '12' ? -5_000 : 20_000), lean: !busy };
  });
  const seasonal = { ...month, month: '2026-11', incomePicture: { treated: 'seasonal', months } } as unknown as MonthModel;

  it('an everyday cut and a saving cut together lift like the same total from one lever', () => {
    const split = explore({ month: seasonal, flexibleSaving: mu(10_000), price: mu(300_000), unspent: mu(0), levers: { everydayCut: mu(30_000), flexibleSavingCut: mu(10_000) } });
    const one = explore({ month: seasonal, flexibleSaving: mu(0), price: mu(300_000), unspent: mu(0), levers: { everydayCut: mu(40_000), flexibleSavingCut: mu(0) } });
    expect(split.typicalLeft).toBe(one.typicalLeft);
    expect(split.buyLater).toEqual(one.buyLater);
  });
});

describe('05.4-61 explore: answerWaits', () => {
  const covered = { month, flexibleSaving: mu(0), price: mu(1000), unspent: mu(5000), levers: { everydayCut: mu(0), flexibleSavingCut: mu(0) } };
  it('a covered price is ready now unless the answer itself waits', () => {
    expect(explore(covered).buyLater.months).toBe(0);
    expect(explore({ ...covered, answerWaits: false }).buyLater.months).toBe(0);
  });
  it('when the answer waits, a covered price still waits a month', () => {
    expect(explore({ ...covered, answerWaits: true }).buyLater.months).toBe(1);
  });
});
