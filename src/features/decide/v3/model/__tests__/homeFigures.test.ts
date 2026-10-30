import { minorUnits } from '@/engine/money';
import { homeFigures } from '../homeFigures';

const mu = minorUnits;
const ev = (unspent: unknown, emergency: number | null, typicalLeft: number | null) =>
  ({ month: { typicalLeft: typicalLeft === null ? null : mu(typicalLeft) }, funds: { unspent, emergency: emergency === null ? null : mu(emergency) } }) as never;

describe('homeFigures', () => {
  it('uses available when present, value otherwise', () => {
    expect(homeFigures(ev({ value: mu(500), available: mu(400), stale: false, drifted: false }, 900, 100))).toEqual({ typical: 100, unspent: 400, unspentChip: null, emergency: 900 });
    expect(homeFigures(ev({ value: mu(500), stale: false, drifted: false }, 900, 100)).unspent).toBe(500);
  });
  it('stale wins over drifted', () => {
    expect(homeFigures(ev({ value: mu(1), stale: true, drifted: true }, null, null)).unspentChip).toBe('stale');
    expect(homeFigures(ev({ value: mu(1), stale: false, drifted: true }, null, null)).unspentChip).toBe('drifted');
  });
  it('null funds give nulls', () => {
    expect(homeFigures(ev(null, null, null))).toEqual({ typical: null, unspent: null, unspentChip: null, emergency: null });
  });
});
