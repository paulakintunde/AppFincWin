import { syncStatusLabel } from '../syncStatusLabel';
import type { SyncStatus } from '@/data/sync/useSyncStatus';

const NOW = 1_700_000_000_000;

function status(overrides: Partial<SyncStatus>): SyncStatus {
  return {
    isOnline: true,
    queued: 0,
    failed: 0,
    conflicts: 0,
    lastSyncedAt: null,
    ...overrides,
  };
}

describe('syncStatusLabel', () => {
  it('offline with queued changes -> sync.offlineQueued with count', () => {
    const result = syncStatusLabel(status({ isOnline: false, queued: 3 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.offlineQueued', count: 3 });
  });

  it('offline with nothing queued -> sync.offline', () => {
    const result = syncStatusLabel(status({ isOnline: false, queued: 0 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.offline' });
  });

  it('online with queued changes -> sync.queued with count', () => {
    const result = syncStatusLabel(status({ isOnline: true, queued: 2 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.queued', count: 2 });
  });

  it('online, synced 30s ago -> sync.syncedJustNow', () => {
    const result = syncStatusLabel(status({ lastSyncedAt: NOW - 30_000 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.syncedJustNow' });
  });

  it('online, synced 2 minutes ago -> sync.syncedMinutes with count 2', () => {
    const result = syncStatusLabel(status({ lastSyncedAt: NOW - 2 * 60_000 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.syncedMinutes', count: 2 });
  });

  it('online, synced 3 hours ago -> sync.syncedHours with count 3', () => {
    const result = syncStatusLabel(status({ lastSyncedAt: NOW - 3 * 60 * 60_000 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.syncedHours', count: 3 });
  });

  it('online, synced 2 days ago -> sync.syncedDays with count 2', () => {
    const result = syncStatusLabel(status({ lastSyncedAt: NOW - 2 * 24 * 60 * 60_000 }), NOW);
    expect(result.primary).toEqual({ key: 'sync.syncedDays', count: 2 });
  });

  it('online, never synced -> sync.neverSynced', () => {
    const result = syncStatusLabel(status({ lastSyncedAt: null }), NOW);
    expect(result.primary).toEqual({ key: 'sync.neverSynced' });
  });

  it('passes failed and conflicts through unchanged', () => {
    const result = syncStatusLabel(status({ failed: 2, conflicts: 1 }), NOW);
    expect(result.failed).toBe(2);
    expect(result.conflicts).toBe(1);
  });
});
