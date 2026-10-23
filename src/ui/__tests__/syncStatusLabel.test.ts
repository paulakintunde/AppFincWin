import { nextSyncLineChangeAt, syncStatusLabel } from '../syncStatusLabel';
import type { SyncStatus } from '@/data/sync/useSyncStatus';

const NOW = 1_700_000_000_000;

function status(overrides: Partial<SyncStatus>): SyncStatus {
  return {
    isOnline: true,
    queued: 0,
    failed: 0,
    conflicts: 0,
    lastSyncedAt: null,
    oldestPendingAt: null,
    inFlightOldestAt: null,
    ...overrides,
  };
}

describe('syncStatusLabel', () => {
  it('D-88 the sync line hides writes younger than 5 s', () => {
    const young = status({ queued: 2, oldestPendingAt: NOW - 4_999, inFlightOldestAt: NOW - 4_999 });
    expect(syncStatusLabel(young, NOW).primary).toBeNull();
    expect(syncStatusLabel(status({}), NOW).primary).toBeNull();
    // 5 s exactly speaks
    expect(syncStatusLabel(status({ queued: 1, oldestPendingAt: NOW - 5_000, inFlightOldestAt: NOW - 5_000 }), NOW).primary).toEqual({
      key: 'sync.saving',
    });
  });

  it('D-88 a write on the wire for 5 s reads Saving…', () => {
    const result = syncStatusLabel(status({ queued: 3, oldestPendingAt: NOW - 8_000, inFlightOldestAt: NOW - 6_000 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.saving' });
  });

  it('D-88 waiting replaces queued', () => {
    const waiting = syncStatusLabel(status({ queued: 2, oldestPendingAt: NOW - 9_000, inFlightOldestAt: null }), NOW);
    expect(waiting.primary).toEqual({ key: 'sync.waiting', count: 2 });
    // an in-flight write that is still young does not hide older waiting ones
    const mixed = syncStatusLabel(status({ queued: 2, oldestPendingAt: NOW - 9_000, inFlightOldestAt: NOW - 1_000 }), NOW);
    expect(mixed.primary).toEqual({ key: 'sync.waiting', count: 2 });
    const keys = ['sync.queued', 'sync.offlineQueued'];
    for (const s of [waiting, mixed, syncStatusLabel(status({ isOnline: false, queued: 2 }), NOW)]) {
      expect(keys).not.toContain(s.primary?.key);
    }
  });

  it('offline with waiting changes -> sync.offlineWaiting with count, at any age', () => {
    const result = syncStatusLabel(status({ isOnline: false, queued: 3, oldestPendingAt: NOW - 100 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.offlineWaiting', count: 3 });
  });

  it('offline with nothing waiting -> sync.offline', () => {
    expect(syncStatusLabel(status({ isOnline: false }), NOW).primary).toEqual({ key: 'sync.offline' });
  });

  it('a count-only status (age unknown) is treated as old, so the line still speaks', () => {
    const result = syncStatusLabel({ isOnline: true, queued: 2, failed: 0, conflicts: 0, lastSyncedAt: null }, NOW);
    expect(result.primary).toEqual({ key: 'sync.waiting', count: 2 });
  });

  it('"synced ... ago" is not on the line; only the expanded detail reads it', () => {
    expect(syncStatusLabel(status({ lastSyncedAt: NOW - 30_000 }), NOW).primary).toBeNull();
    expect(syncStatusLabel(status({ lastSyncedAt: NOW - 30_000 }), NOW, true).primary).toEqual({ key: 'sync.syncedJustNow' });
    expect(syncStatusLabel(status({ lastSyncedAt: NOW - 2 * 60_000 }), NOW, true).primary).toEqual({ key: 'sync.syncedMinutes', count: 2 });
    expect(syncStatusLabel(status({ lastSyncedAt: NOW - 3 * 60 * 60_000 }), NOW, true).primary).toEqual({ key: 'sync.syncedHours', count: 3 });
    expect(syncStatusLabel(status({ lastSyncedAt: NOW - 2 * 24 * 60 * 60_000 }), NOW, true).primary).toEqual({ key: 'sync.syncedDays', count: 2 });
    expect(syncStatusLabel(status({ lastSyncedAt: null }), NOW, true).primary).toEqual({ key: 'sync.neverSynced' });
  });

  it('passes failed and conflicts through unchanged, and they keep the line alive', () => {
    const result = syncStatusLabel(status({ failed: 2, conflicts: 1 }), NOW);
    expect(result.failed).toBe(2);
    expect(result.conflicts).toBe(1);
    expect(result.primary).toBeNull();
  });
});

describe('nextSyncLineChangeAt', () => {
  it('is the moment the youngest-threshold write turns 5 s old', () => {
    expect(nextSyncLineChangeAt(status({ queued: 1, oldestPendingAt: NOW - 1_000, inFlightOldestAt: NOW - 1_000 }), NOW)).toBe(NOW + 4_000);
    expect(nextSyncLineChangeAt(status({ queued: 2, oldestPendingAt: NOW - 9_000, inFlightOldestAt: NOW - 2_000 }), NOW)).toBe(NOW + 3_000);
  });

  it('is null when nothing is pending, offline, or every threshold has passed', () => {
    expect(nextSyncLineChangeAt(status({}), NOW)).toBeNull();
    expect(nextSyncLineChangeAt(status({ isOnline: false, queued: 1, oldestPendingAt: NOW }), NOW)).toBeNull();
    expect(nextSyncLineChangeAt(status({ queued: 1, oldestPendingAt: NOW - 6_000, inFlightOldestAt: NOW - 6_000 }), NOW)).toBeNull();
  });
});
