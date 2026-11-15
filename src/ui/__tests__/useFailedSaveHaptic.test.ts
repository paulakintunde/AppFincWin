// 06.2-14 / D-20: the Error haptic fires once per growth of the failed-writes list, only for saves recorded since mount.
import { act, renderHook } from '@testing-library/react-native';
import { hapticFailed } from '@/ui/haptics';
import { useFailedSaveHaptic } from '../useFailedSaveHaptic';

// jest.mock calls below are hoisted above these imports.

interface Entry {
  id: string;
  at: string;
}

let mockEntries: Entry[] = [];
const mockListeners = new Set<() => void>();

jest.mock('@/data/sync/failedWrites', () => ({
  getFailedWrites: () => mockEntries,
  subscribeFailedWrites: (listener: () => void) => {
    mockListeners.add(listener);
    return () => {
      mockListeners.delete(listener);
    };
  },
}));
jest.mock('@/ui/haptics', () => ({ hapticFailed: jest.fn() }));

const failed = hapticFailed as jest.Mock;
let seq = 0;

function entry(at: number): Entry {
  seq += 1;
  return { id: `fw-${seq}`, at: new Date(at).toISOString() };
}

async function setEntries(next: Entry[]): Promise<void> {
  await act(async () => {
    mockEntries = next;
    for (const listener of [...mockListeners]) listener();
  });
}

// Real timers: React's passive effects (subscribe / unsubscribe) must flush normally.
let NOW = Date.now();
const mounted: { unmount: () => unknown }[] = [];

async function mount() {
  const hook = await renderHook(() => useFailedSaveHaptic());
  mounted.push(hook);
  return hook;
}

beforeEach(() => {
  NOW = Date.now();
  failed.mockClear();
  mockEntries = [];
});

afterEach(async () => {
  // Unmount every host so the shared subscription is released between tests.
  for (const hook of mounted.splice(0)) {
    await act(async () => {
      await hook.unmount();
    });
  }
});

describe('useFailedSaveHaptic (D-20)', () => {
  it('fires once when a save fails after mount', async () => {
    await mount();
    await setEntries([entry(NOW + 600_000)]);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('fires once when several failures land together', async () => {
    await mount();
    await setEntries([entry(NOW + 600_000), entry(NOW + 600_000), entry(NOW + 600_001)]);
    expect(failed).toHaveBeenCalledTimes(1);
    // A later growth fires again, once.
    await setEntries([...mockEntries, entry(NOW + 605_000)]);
    expect(failed).toHaveBeenCalledTimes(2);
  });

  it('does not fire for entries already in the list at mount', async () => {
    mockEntries = [entry(NOW - 60_000)];
    await mount();
    await setEntries([...mockEntries]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('does not fire when boot hydration finishes after mount', async () => {
    await mount();
    // Hydration reads entries recorded in an earlier session.
    await setEntries([entry(NOW - 86_400_000), entry(NOW - 3_600_000)]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('does not fire when the list shrinks (retry succeeded, dismissed, wiped)', async () => {
    await mount();
    const a = entry(NOW + 600_000);
    const b = entry(NOW + 602_000);
    await setEntries([a, b]);
    expect(failed).toHaveBeenCalledTimes(1);
    await setEntries([b]);
    await setEntries([]);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('a saved-offline (paused) write never fires: nothing reaches the failed list', async () => {
    await mount();
    // A paused mutation leaves the failed list untouched; a notify with the same list is not a growth.
    await setEntries([]);
    expect(failed).not.toHaveBeenCalled();
  });

  it('two mounted hosts give one haptic per failure, and the last unmount unsubscribes', async () => {
    const one = await mount();
    const two = await mount();
    expect(mockListeners.size).toBe(1);
    await setEntries([entry(NOW + 600_000)]);
    expect(failed).toHaveBeenCalledTimes(1);
    await act(async () => {
      await one.unmount();
    });
    mounted.splice(mounted.indexOf(one), 1);
    expect(mockListeners.size).toBe(1);
    await setEntries([...mockEntries, entry(NOW + 602_000)]);
    expect(failed).toHaveBeenCalledTimes(2);
    await act(async () => {
      await two.unmount();
    });
    mounted.splice(mounted.indexOf(two), 1);
    expect(mockListeners.size).toBe(0);
  });
});
