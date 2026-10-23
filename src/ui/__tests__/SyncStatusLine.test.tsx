import React from 'react';
import { act, render } from '@testing-library/react-native';
import { SyncStatusLine } from '../SyncStatusLine';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { useSyncStatus } from '@/data/sync/useSyncStatus';

jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: jest.fn(),
}));

const mockUseSyncStatus = useSyncStatus as jest.Mock;

async function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const NB = ' ';

describe('SyncStatusLine', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders "offline · 3 changes waiting" when offline with a queue', async () => {
    mockUseSyncStatus.mockReturnValue({
      isOnline: false,
      queued: 3,
      failed: 0,
      conflicts: 0,
      lastSyncedAt: null,
      oldestPendingAt: Date.now(),
      inFlightOldestAt: null,
    });

    const { getByText } = await renderWithTheme(<SyncStatusLine />);
    expect(getByText(`offline · 3${NB}changes waiting`)).toBeTruthy();
  });

  const syncedNow = () => ({
    isOnline: true,
    queued: 0,
    failed: 0,
    conflicts: 0,
    lastSyncedAt: Date.now(),
    oldestPendingAt: null,
    inFlightOldestAt: null,
  });

  it('shows nothing on the line when all is synced', async () => {
    mockUseSyncStatus.mockReturnValue(syncedNow());
    const line = await renderWithTheme(<SyncStatusLine />);
    expect(line.toJSON()).toBeNull();
  });

  it('shows "synced just now" in the expanded detail', async () => {
    mockUseSyncStatus.mockReturnValue(syncedNow());
    const detail = await renderWithTheme(<SyncStatusLine detail />);
    expect(detail.getByText('synced just now')).toBeTruthy();
  });

  it('renders a second failed line in danger colour when failed is 1', async () => {
    mockUseSyncStatus.mockReturnValue({
      isOnline: true,
      queued: 0,
      failed: 1,
      conflicts: 0,
      lastSyncedAt: Date.now(),
    });

    const { getByText } = await renderWithTheme(<SyncStatusLine />);
    const failedLine = getByText('1 change couldn’t save');
    expect(failedLine).toBeTruthy();
    const style = [failedLine.props.style].flat();
    expect(style.some((s: { color?: string }) => s?.color === '#B4472A')).toBe(true);
  });

  it('renders no failed/conflict lines when both are zero', async () => {
    mockUseSyncStatus.mockReturnValue({
      isOnline: true,
      queued: 0,
      failed: 0,
      conflicts: 0,
      lastSyncedAt: Date.now(),
    });

    const { queryByText } = await renderWithTheme(<SyncStatusLine />);
    expect(queryByText(/couldn’t save/)).toBeNull();
    expect(queryByText(/changed elsewhere/)).toBeNull();
  });

  describe('timers', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('D-88 the sync line appears when a write passes 5 s with nothing else changing', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-23T12:00:00Z') });
      const submittedAt = Date.now();
      // The hook value never changes: only time passes.
      mockUseSyncStatus.mockReturnValue({
        isOnline: true,
        queued: 1,
        failed: 0,
        conflicts: 0,
        lastSyncedAt: null,
        oldestPendingAt: submittedAt,
        inFlightOldestAt: submittedAt,
      });

      const { queryByText, getByText, toJSON, unmount } = await renderWithTheme(<SyncStatusLine />);
      expect(toJSON()).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(4_000);
      });
      expect(queryByText('Saving…')).toBeNull();

      await act(async () => {
        jest.advanceTimersByTime(1_000);
      });
      expect(getByText('Saving…')).toBeTruthy();
      await unmount();
    });

    it('D-88 a write that is already old when the line mounts shows at once, and a waiting write swaps to waiting', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-23T12:00:00Z') });
      const t0 = Date.now();
      mockUseSyncStatus.mockReturnValue({
        isOnline: true,
        queued: 2,
        failed: 0,
        conflicts: 0,
        lastSyncedAt: null,
        oldestPendingAt: t0 - 20_000,
        inFlightOldestAt: null,
      });
      const { getByText } = await renderWithTheme(<SyncStatusLine />);
      expect(getByText(`2${NB}changes waiting`)).toBeTruthy();
    });

    it('sets only a timer for the 5 s crossing and clears it on unmount', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-23T12:00:00Z') });
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const submittedAt = Date.now();
      mockUseSyncStatus.mockReturnValue({
        isOnline: true,
        queued: 1,
        failed: 0,
        conflicts: 0,
        lastSyncedAt: null,
        oldestPendingAt: submittedAt,
        inFlightOldestAt: submittedAt,
      });
      const { unmount } = await renderWithTheme(<SyncStatusLine />);
      const ours = setTimeoutSpy.mock.calls
        .map((call, i) => ({ ms: call[1], id: setTimeoutSpy.mock.results[i]?.value }))
        .filter((c) => c.ms === 5_000);
      expect(ours).toHaveLength(1);
      expect(clearTimeoutSpy).not.toHaveBeenCalledWith(ours[0]!.id);
      await unmount();
      expect(clearTimeoutSpy).toHaveBeenCalledWith(ours[0]!.id);
    });

    it('advances "minutes ago" in the detail on its own, and clears its interval on unmount (IN-C04)', async () => {
      jest.useFakeTimers({ now: new Date('2026-09-24T12:00:00Z') });
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      mockUseSyncStatus.mockReturnValue({
        isOnline: true,
        queued: 0,
        failed: 0,
        conflicts: 0,
        lastSyncedAt: Date.now(),
      });

      const { getByText, unmount } = await renderWithTheme(<SyncStatusLine detail />);
      expect(getByText('synced just now')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(getByText('synced 1 minute ago')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(getByText('synced 2 minutes ago')).toBeTruthy();

      // React schedules its own timers, so jest.getTimerCount() is noisy; check the
      // component's own 30s interval id is the one cleared on unmount instead.
      const intervalIds = setIntervalSpy.mock.calls
        .map((call, i) => ({ ms: call[1], id: setIntervalSpy.mock.results[i]?.value }))
        .filter((c) => c.ms === 30_000)
        .map((c) => c.id);
      expect(intervalIds).toHaveLength(1);
      expect(clearIntervalSpy).not.toHaveBeenCalledWith(intervalIds[0]);
      await unmount();
      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalIds[0]);
    });
  });
});
