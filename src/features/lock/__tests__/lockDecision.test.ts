// 10-review (L-1, L-3, L-5, L-6): the controller's synchronous decision on return and its fail-closed load.
import * as lockStore from '@/services/lock/lockStore';
import { EXTERNAL_ACTIVITY_MAX_MS } from '@/services/lock/externalActivity';
import { loadLockStateSafe, lockOnReturn } from '../useLockController';

jest.mock('@/services/lock/lockStore', () => ({
  ...jest.requireActual('@/services/lock/lockStore'),
  loadLockState: jest.fn(),
  readLockSettings: jest.fn(),
}));
jest.mock('@/services/lock/secureWindow', () => ({ setSecureWindow: jest.fn(() => Promise.resolve()) }));

const load = lockStore.loadLockState as jest.Mock;
const readSettings = lockStore.readLockSettings as jest.Mock;

const st = (over: Partial<lockStore.LockSettings> = {}): lockStore.LockState => ({
  settings: { ...lockStore.DEFAULT_LOCK_SETTINGS, enabled: true, ...over },
  hasPin: true,
  wrongTries: 0,
  lockUntil: null,
  backgroundedAt: null,
});

describe('lockOnReturn', () => {
  it('never locks with the lock off', () => {
    expect(lockOnReturn(st({ enabled: false, timing: 'now' }), 0, 1e9, false)).toBe(false);
  });

  it('uses the time away from memory against the chosen timing', () => {
    expect(lockOnReturn(st({ timing: 'oneMinute' }), 0, 59_999, false)).toBe(false);
    expect(lockOnReturn(st({ timing: 'oneMinute' }), 0, 60_000, false)).toBe(true);
    expect(lockOnReturn(st({ timing: 'now' }), 5, 5, false)).toBe(true);
  });

  it('L-5: a clock moved back while away locks', () => {
    expect(lockOnReturn(st({ timing: 'fifteenMinutes' }), 10_000, 0, false)).toBe(true);
    expect(lockOnReturn(st({ timing: 'now' }), 10_000, 0, true)).toBe(true);
  });

  it('L-6: a system screen the app opened is forgiven up to the safety cap', () => {
    expect(lockOnReturn(st({ timing: 'now' }), 0, 30_000, true)).toBe(false);
    expect(lockOnReturn(st({ timing: 'now' }), 0, EXTERNAL_ACTIVITY_MAX_MS - 1, true)).toBe(false);
    expect(lockOnReturn(st({ timing: 'now' }), 0, EXTERNAL_ACTIVITY_MAX_MS, true)).toBe(true);
  });
});

describe('loadLockStateSafe (L-3)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the full state when the secure store answers', async () => {
    load.mockResolvedValue(st());
    expect(await loadLockStateSafe()).toEqual(st());
    expect(readSettings).not.toHaveBeenCalled();
  });

  it('falls back to the settings with no time away, so a lock that is on locks', async () => {
    load.mockRejectedValue(new Error('keystore'));
    readSettings.mockResolvedValue({ ...lockStore.DEFAULT_LOCK_SETTINGS, enabled: true });
    const s = await loadLockStateSafe();
    expect(s).toMatchObject({ settings: { enabled: true }, backgroundedAt: null });
    expect(lockStore.shouldLockOnActive(s as lockStore.LockState, Date.now(), false)).toBe(true);
  });

  it('returns null when even the settings cannot be read', async () => {
    load.mockRejectedValue(new Error('keystore'));
    readSettings.mockRejectedValue(new Error('storage'));
    expect(await loadLockStateSafe()).toBeNull();
  });
});
