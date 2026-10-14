import { router } from 'expo-router';
import { PUSH_GUARD_MS, acceptPush, pushOnce, resetPushOnceForTests } from '../pushOnce';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));

let now = 1000;
beforeEach(() => {
  jest.clearAllMocks();
  resetPushOnceForTests();
  now = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => jest.restoreAllMocks());

describe('acceptPush', () => {
  it('accepts the first push and any push after the guard window', () => {
    expect(acceptPush(null, 1000)).toBe(true);
    expect(acceptPush(1000, 1000 + PUSH_GUARD_MS - 1)).toBe(false);
    expect(acceptPush(1000, 1000 + PUSH_GUARD_MS)).toBe(true);
  });
});

describe('pushOnce', () => {
  it('drops a second push in the same tick, then allows one after the window', () => {
    pushOnce('/you' as never);
    pushOnce('/you' as never);
    expect(router.push).toHaveBeenCalledTimes(1);
    now += PUSH_GUARD_MS;
    pushOnce('/you' as never);
    expect(router.push).toHaveBeenCalledTimes(2);
  });

  it('resetPushOnceForTests clears the guard', () => {
    pushOnce('/you' as never);
    resetPushOnceForTests();
    pushOnce('/you' as never);
    expect(router.push).toHaveBeenCalledTimes(2);
  });
});
