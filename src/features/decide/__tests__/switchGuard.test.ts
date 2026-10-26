import { DECIDE_V3 } from '../availability';

// test-to-test import is fine; depcruise excludes tests, and availability.test.ts skips __tests__ when it counts DECIDE_V3 readers.
 
const approved = require('../../../engine/decide/v3/__tests__/shadow/approved-changes.json') as { reviewed: boolean };

describe('switch-on guard', () => {
  it('D-14 before D-15: DECIDE_V3 cannot be true until the shadow review is marked reviewed', () => {
    expect(DECIDE_V3 === false || approved.reviewed === true).toBe(true);
  });
});
