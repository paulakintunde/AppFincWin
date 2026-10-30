import { minorUnits } from '@/engine/money';
import { homeFigures } from '../homeFigures';

const mu = minorUnits;
const AT = '2026-10-02';
const ev = (unspent: unknown, emergency: number | null, typicalLeft: number | null, extra: { monthsUsed?: string[]; fundUnlinked?: boolean } = {}) =>
  ({
    month: { typicalLeft: typicalLeft === null ? null : mu(typicalLeft), monthsUsed: extra.monthsUsed ?? [] },
    funds: {
      unspent,
      emergency: emergency === null ? null : mu(emergency),
      ...(extra.fundUnlinked === undefined ? {} : { fundUnlinked: extra.fundUnlinked }),
    },
  }) as never;
const anchor = { amount: mu(500), at: AT };

describe('homeFigures', () => {
  it('uses available when present, value otherwise', () => {
    expect(homeFigures(ev({ value: mu(500), available: mu(400), anchor, stale: false, drifted: false }, 900, 100))).toEqual({
      typical: 100,
      typicalMonths: 0,
      unspent: 400,
      unspentChip: null,
      unspentAt: AT,
      emergency: 900,
      emergencyUnlinked: false,
    });
    expect(homeFigures(ev({ value: mu(500), anchor, stale: false, drifted: false }, 900, 100)).unspent).toBe(500);
  });
  it('stale wins over drifted', () => {
    expect(homeFigures(ev({ value: mu(1), anchor, stale: true, drifted: true }, null, null)).unspentChip).toBe('stale');
    expect(homeFigures(ev({ value: mu(1), anchor, stale: false, drifted: true }, null, null)).unspentChip).toBe('drifted');
  });
  it('null funds give nulls', () => {
    expect(homeFigures(ev(null, null, null))).toEqual({
      typical: null,
      typicalMonths: 0,
      unspent: null,
      unspentChip: null,
      unspentAt: null,
      emergency: null,
      emergencyUnlinked: false,
    });
  });
  it('D-26: the detail data comes from the same evaluation', () => {
    const six = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
    const f = homeFigures(ev({ value: mu(1), anchor, stale: false, drifted: false }, 900, 100, { monthsUsed: six }));
    expect(f.typicalMonths).toBe(6);
    expect(f.unspentAt).toBe(AT);
    expect(f.emergencyUnlinked).toBe(false);
    expect(homeFigures(ev(null, 900, 100, { fundUnlinked: true })).emergencyUnlinked).toBe(true);
    expect(homeFigures(ev(null, 900, 100, { fundUnlinked: false })).emergencyUnlinked).toBe(false);
  });
});
