import * as availability from '../availability';

describe('switch guard', () => {
  it('APP-17: DECIDE_OPEN is the only store-build switch left, and it is a boolean', () => {
    expect(typeof availability.DECIDE_OPEN).toBe('boolean');
    expect(Object.keys(availability).filter((k) => /^DECIDE_(OPEN|V\d)/.test(k))).toEqual(['DECIDE_OPEN']);
  });
});
