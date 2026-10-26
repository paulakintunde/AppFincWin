import { buildMonthModel } from '../month/model';
import { personById, toV3Inputs } from './golden/adapter';

describe('C15 Sam month (golden)', () => {
  it('reproduces the yardstick figures', () => {
    const m = buildMonthModel(toV3Inputs(personById('sam')));
    expect(m.month).toBe('2026-10');
    expect(m.moneyIn).toBe(400000);
    expect(m.moneyOut).toBe(357500);
    expect(m.monthLeft).toBe(42500);
    expect(m.erest).toBe(137500);
    expect(m.e).toBe(147500);
    expect(m.typicalLeft).toBe(42500);
    expect(m.low).toEqual({ left: 5000, month: '2026-09', reason: 'second_lowest' });
    expect(m.setAside).toBe(30000);
    expect(m.confidence.level).toBe('fair');
    expect(m.confidence.reasons).toContain('early_in_month');
    expect(m.notices).toEqual([]);
  });
});
