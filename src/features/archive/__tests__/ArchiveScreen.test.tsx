import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ArchiveScreen } from '../ArchiveScreen';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn() }, Redirect: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/Sheet', () => {
  const { View } = require('react-native');
  return { Sheet: ({ visible, children }: { visible: boolean; children: React.ReactNode }) => (visible ? <View>{children}</View> : null) };
});
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));

const mockRestoreAll = jest.fn();
jest.mock('@/data/mutations/archivedMonths', () => ({ useRestoreAllMonths: () => ({ restoreAllMonths: mockRestoreAll }) }));
jest.mock('@/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));

let mockArchived: ReadonlySet<string> = new Set(['2026-09', '2026-08']);
let mockEnabled = true;
jest.mock('../useArchiveState', () => ({
  useArchiveState: () => ({ enabled: mockEnabled, archived: mockArchived, count: mockArchived.size, shared: false, archive: jest.fn(), restore: jest.fn() }),
}));

jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'h1', homeCurrency: 'USD', showCents: false, today: '2026-10-05', userId: 'u1' }),
}));

// August: 4210 in, 3880 out. September: nothing recorded.
const row = (amountHome: number) => ({ amountHome, status: 'paid', transfer_id: null, is_refund: false, rate_pending: false, is_settlement: false });
jest.mock('@/data/queries/activity', () => ({
  useMonthView: (_ctx: unknown, month: string) => ({
    rows: month === '2026-08' ? [row(421000), row(-388000)] : [],
    projections: [],
    isLoading: false,
  }),
}));

describe('ArchiveScreen (UI-SPEC 4b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockArchived = new Set(['2026-09', '2026-08']);
    mockEnabled = true;
  });

  const setup = () =>
    render(
      <ThemeProvider>
        <ArchiveScreen />
      </ThemeProvider>,
    );

  it('lists archived months newest first with income and spend from monthTotals', async () => {
    const { getByText, getAllByText } = await setup();
    expect(getByText('Older months kept out of the way.')).toBeTruthy();
    const september = getByText('September 2026');
    const august = getByText('August 2026');
    expect(september).toBeTruthy();
    expect(august).toBeTruthy();
    expect(getByText('In $4,210 · Out $3,880')).toBeTruthy();
    expect(getAllByText(/^In \$/).length).toBe(2);
  });

  it('opens a month', async () => {
    const { getByText } = await setup();
    await fireEvent.press(getByText('August 2026'));
    expect(router.push).toHaveBeenCalledWith('/archive/2026-08');
  });

  it('Restore all asks first, then restores', async () => {
    const { getByTestId, getByText, getAllByText, queryByText } = await setup();
    expect(queryByText('Restore all months?')).toBeNull();
    await fireEvent.press(getByTestId('archive-restore-all'));
    expect(getByText('Restore all months?')).toBeTruthy();
    expect(mockRestoreAll).not.toHaveBeenCalled();
    await fireEvent.press(getAllByText('Restore all').at(-1)!); // the sheet's primary (the link sits earlier in the tree)
    expect(mockRestoreAll).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('Export the archive opens Export filtered to the archived months', async () => {
    const { getByText } = await setup();
    await fireEvent.press(getByText('Export the archive'));
    expect(router.push).toHaveBeenCalledWith('/export?months=2026-08,2026-09');
  });

  it('empty state has no Export link and no Restore all', async () => {
    mockArchived = new Set();
    const { getByText, queryByText, queryByTestId } = await setup();
    expect(getByText('Nothing archived')).toBeTruthy();
    expect(queryByText('Export the archive')).toBeNull();
    expect(queryByTestId('archive-restore-all')).toBeNull();
  });
});
