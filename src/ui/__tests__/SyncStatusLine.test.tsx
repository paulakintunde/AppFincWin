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

describe('SyncStatusLine', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders "offline · 3 changes queued" when offline with a queue', async () => {
    mockUseSyncStatus.mockReturnValue({
      isOnline: false,
      queued: 3,
      failed: 0,
      conflicts: 0,
      lastSyncedAt: null,
    });

    const { getByText } = await renderWithTheme(<SyncStatusLine />);
    expect(getByText('offline · 3 changes queued')).toBeTruthy();
  });

  it('renders "synced just now" when online and recently synced', async () => {
    mockUseSyncStatus.mockReturnValue({
      isOnline: true,
      queued: 0,
      failed: 0,
      conflicts: 0,
      lastSyncedAt: Date.now(),
    });

    const { getByText } = await renderWithTheme(<SyncStatusLine />);
    expect(getByText('synced just now')).toBeTruthy();
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

  describe('30-second refresh (IN-C04)', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      jest.useRealTimers();
    });

    it('advances "minutes ago" on its own, and clears its interval on unmount', async () => {
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

      const { getByText, unmount } = await renderWithTheme(<SyncStatusLine />);
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
