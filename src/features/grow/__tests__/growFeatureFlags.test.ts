import { growFeatureFlags, growSegments, isGrowBasics } from '../growFeatureFlags';

describe('growFeatureFlags', () => {
  it('has everything on until Phase 9 gating', () => {
    expect(growFeatureFlags()).toEqual({ goals: true, debts: true, investing: true, lots: true, growthIllustration: true, calculators: true });
    expect(isGrowBasics(growFeatureFlags())).toBe(false);
    expect(growSegments(growFeatureFlags())).toEqual(['goals', 'debts', 'investing']);
  });

  it('shows the Basics state when goals, debts and investing are off', () => {
    const flags = growFeatureFlags({ goals: false, debts: false, investing: false });
    expect(isGrowBasics(flags)).toBe(true);
    expect(growSegments(flags)).toEqual([]);
  });

  it('hides only the segments whose feature is off', () => {
    const flags = growFeatureFlags({ debts: false });
    expect(isGrowBasics(flags)).toBe(false);
    expect(growSegments(flags)).toEqual(['goals', 'investing']);
  });
});
