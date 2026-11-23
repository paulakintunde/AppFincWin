import { decideAfterReauth } from '../reauth';

describe('decideAfterReauth (D-29)', () => {
  it('keeps the phone copy for the same user', () => expect(decideAfterReauth('u1', 'u1')).toBe('keep'));
  it('wipes for a different user', () => expect(decideAfterReauth('u1', 'u2')).toBe('wipe'));
  it('wipes when the lock owner is unknown', () => expect(decideAfterReauth(null, 'u1')).toBe('wipe'));
});
