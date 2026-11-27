// 10-review (L-6): the "a system screen the app opened is open" flag nests, ends once, and times out.
import {
  beginExternalActivity,
  EXTERNAL_ACTIVITY_MAX_MS,
  isExternalActivityPending,
  withExternalActivity,
} from '../externalActivity';

afterEach(() => {
  jest.useRealTimers();
});

describe('externalActivity', () => {
  it('is down by default, up while a call runs, down after it resolves', async () => {
    expect(isExternalActivityPending()).toBe(false);
    let seen = false;
    const r = await withExternalActivity(async () => {
      seen = isExternalActivityPending();
      return 7;
    });
    expect(r).toBe(7);
    expect(seen).toBe(true);
    expect(isExternalActivityPending()).toBe(false);
  });

  it('goes down when the call throws', async () => {
    await expect(
      withExternalActivity(async () => {
        throw new Error('picker failed');
      })
    ).rejects.toThrow('picker failed');
    expect(isExternalActivityPending()).toBe(false);
  });

  it('nests: stays up until both end; ending twice counts once', () => {
    const a = beginExternalActivity();
    const b = beginExternalActivity();
    a();
    a();
    expect(isExternalActivityPending()).toBe(true);
    b();
    expect(isExternalActivityPending()).toBe(false);
  });

  it('a call that never settles stops counting after the safety timeout', () => {
    jest.useFakeTimers();
    const end = beginExternalActivity();
    jest.advanceTimersByTime(EXTERNAL_ACTIVITY_MAX_MS - 1);
    expect(isExternalActivityPending()).toBe(true);
    jest.advanceTimersByTime(1);
    expect(isExternalActivityPending()).toBe(false);
    end();
    expect(isExternalActivityPending()).toBe(false);
  });
});
