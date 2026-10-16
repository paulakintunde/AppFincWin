import { PRO_CANDIDATES, canUse } from '../entitlements';

describe('canUse', () => {
  it.each(PRO_CANDIDATES)('is true for %s in Phase 5', (f) => {
    expect(canUse(f)).toBe(true);
  });
});
