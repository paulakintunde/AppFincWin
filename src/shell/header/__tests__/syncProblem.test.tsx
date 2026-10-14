import React from 'react';
import { render } from '@testing-library/react-native';
import { useSyncStatus } from '@/data/sync/useSyncStatus';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { hasSyncProblem } from '../syncProblem';
import { SyncProblemLine } from '../SyncProblemLine';

jest.mock('@/data/sync/useSyncStatus', () => ({ useSyncStatus: jest.fn() }));
const mockStatus = useSyncStatus as jest.Mock;

const ok = { isOnline: true, queued: 0, failed: 0, conflicts: 0, lastSyncedAt: 1 };

describe('hasSyncProblem', () => {
  it('is false when all is well', () => {
    expect(hasSyncProblem(ok)).toBe(false);
  });
  it.each([{ isOnline: false }, { queued: 1 }, { failed: 1 }, { conflicts: 1 }])(
    'is true for %j alone',
    (patch) => {
      expect(hasSyncProblem({ ...ok, ...patch })).toBe(true);
    },
  );
});

describe('SyncProblemLine', () => {
  it('renders nothing when there is no problem', async () => {
    mockStatus.mockReturnValue(ok);
    const { toJSON } = await render(
      <ThemeProvider>
        <SyncProblemLine />
      </ThemeProvider>,
    );
    expect(toJSON()).toBeNull();
  });
  it('renders the status text when offline', async () => {
    mockStatus.mockReturnValue({ ...ok, isOnline: false });
    const { getByText } = await render(
      <ThemeProvider>
        <SyncProblemLine />
      </ThemeProvider>,
    );
    expect(getByText('offline')).toBeTruthy();
  });
});
