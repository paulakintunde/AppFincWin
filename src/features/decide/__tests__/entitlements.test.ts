import {
  ALWAYS_FREE,
  PRO_CANDIDATES,
  PRO_SWITCHES,
  canUse,
  canUseWith,
  type AlwaysFree,
  type ProFeature,
} from '../entitlements';

describe('canUse', () => {
  it.each(PRO_CANDIDATES)('is true for %s while the switch is off', (f) => {
    expect(canUse(f)).toBe(true);
    expect(canUse(f, false)).toBe(true);
    expect(canUse(f, true)).toBe(true);
  });
});

describe('PRO_SWITCHES (APP-18)', () => {
  it.each(PRO_CANDIDATES)('has %s switched off', (f) => {
    expect(PRO_SWITCHES[f]).toBe(false);
  });

  it('has exactly one switch per Pro candidate', () => {
    expect(Object.keys(PRO_SWITCHES).sort()).toEqual([...PRO_CANDIDATES].sort());
  });
});

describe('canUseWith', () => {
  const switches: Record<ProFeature, boolean> = {
    multipleOpenChecks: false,
    setbacks: true,
    decisionJournal: false,
    payoffComparisons: false,
  };

  it('blocks a switched-on feature for a free user', () => {
    expect(canUseWith(switches, 'setbacks', false)).toBe(false);
  });

  it('allows a switched-on feature for a Pro user', () => {
    expect(canUseWith(switches, 'setbacks', true)).toBe(true);
  });

  it('leaves switched-off features open to everyone', () => {
    expect(canUseWith(switches, 'decisionJournal', false)).toBe(true);
  });
});

describe('ALWAYS_FREE (APP-18)', () => {
  it('lists the safety items', () => {
    expect([...ALWAYS_FREE]).toEqual(['safetyNet', 'confidenceSentence', 'answer', 'footer']);
  });

  it('shares no name with the Pro candidates', () => {
    const pro: readonly string[] = PRO_CANDIDATES;
    for (const name of ALWAYS_FREE) expect(pro).not.toContain(name);
  });

  it('is disjoint at the type level', () => {
    const none: Extract<ProFeature, AlwaysFree> extends never ? true : false = true;
    expect(none).toBe(true);
  });
});
