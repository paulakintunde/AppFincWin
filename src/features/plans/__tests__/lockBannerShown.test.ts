// 09-25 (device check, locked home): the tabs layout zeroes the top inset under the banner only when the banner draws,
// so this rule must match LockBanner exactly.
import { lockBannerShown } from '../LockBanner';

describe('lockBannerShown', () => {
  it('shows for a locked plan and for grace (not after leaving), never while loading', () => {
    expect(lockBannerShown({ loading: false, status: 'locked' })).toBe(true);
    expect(lockBannerShown({ loading: false, status: 'grace', leftGrace: false })).toBe(true);
    expect(lockBannerShown({ loading: false, status: 'grace', leftGrace: true })).toBe(false);
    expect(lockBannerShown({ loading: true, status: 'locked' })).toBe(false);
    for (const status of ['sample', 'trial', 'active', 'tester']) {
      expect(lockBannerShown({ loading: false, status })).toBe(false);
    }
  });
});
