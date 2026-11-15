import { MEMBER_COLOUR_NAMES } from '../../engine/household/memberLabel';
import { memberColorNames } from '../../theme/tokens';
import { HOUSEHOLD_FEATURES, householdFeatureEnabled } from '../householdFeatures';

describe('HOUSEHOLD_FEATURES', () => {
  it('has exactly the Pro-gateable keys, all on', () => {
    expect(Object.keys(HOUSEHOLD_FEATURES).sort()).toEqual([
      'amountSplits',
      'categoryDefaults',
      'weightSplits',
    ]);
    Object.values(HOUSEHOLD_FEATURES).forEach((v) => expect(v).toBe(true));
  });

  it('reads a switch through householdFeatureEnabled', () => {
    expect(householdFeatureEnabled('weightSplits')).toBe(true);
  });
});

describe('member colour names', () => {
  it('match the design tokens', () => {
    expect([...MEMBER_COLOUR_NAMES]).toEqual([...memberColorNames]);
  });
});
