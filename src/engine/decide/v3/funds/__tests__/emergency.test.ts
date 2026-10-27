import { assert, property, string } from 'fast-check';
import { minorUnits } from '../../../../money/types';
import { emergencyOf, emergencyUse, mayUseEmergency } from '../emergency';

const m = minorUnits;
describe('emergency fund', () => {
  it('v3 3.7 not set', () => {
    expect(emergencyOf(null)).toEqual({ amount: null, notice: { code: 'emergency_not_set', values: {} } });
    expect(emergencyOf({ amount: m(500) })).toEqual({ amount: 500, notice: null });
  });
  it('v3 3.7 use and rebuild', () => {
    expect(emergencyUse({ need: m(60000), fund: m(300000), typicalLeft: m(12000) })).toEqual({ used: 60000, shortfall: 0, rebuildMonths: 5 });
    expect(emergencyUse({ need: m(60000), fund: m(300000), typicalLeft: m(0) }).rebuildMonths).toBeNull();
    expect(emergencyUse({ need: m(60000), fund: m(300000), typicalLeft: null }).rebuildMonths).toBeNull();
    expect(emergencyUse({ need: m(400000), fund: m(300000), typicalLeft: m(100000) })).toEqual({ used: 300000, shortfall: 100000, rebuildMonths: 3 });
    expect(emergencyUse({ need: m(0), fund: m(300000), typicalLeft: m(10) })).toEqual({ used: 0, shortfall: 0, rebuildMonths: 0 });
  });
  it('I38 gate', () => {
    const nec = { kind: 'preset', value: 'necessity' } as const;
    const work = { kind: 'preset', value: 'for_work' } as const;
    expect(mayUseEmergency({ emergency: true, purpose: nec })).toBe(true);
    expect(mayUseEmergency({ emergency: true, purpose: work })).toBe(true);
    expect(mayUseEmergency({ emergency: false, purpose: nec })).toBe(false);
    expect(mayUseEmergency({ emergency: true, purpose: null })).toBe(false);
    expect(mayUseEmergency({ emergency: true, purpose: { kind: 'preset', value: 'treat' } })).toBe(false);
    assert(property(string(), (id) => !mayUseEmergency({ emergency: true, purpose: { kind: 'custom', id } })));
  });
});
