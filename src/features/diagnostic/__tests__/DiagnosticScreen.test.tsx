import React from 'react';
import { Linking, Share } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DiagnosticScreen } from '../DiagnosticScreen';
import { DIAGNOSTIC_FIELDS } from '../diagnosticFields';

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.4.0', nativeBuildVersion: '212' }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/data/sync/useSyncStatus', () => ({
  useSyncStatus: () => ({ isOnline: true, queued: 2, failed: 1, conflicts: 0, lastSyncedAt: Date.UTC(2026, 10, 22, 9, 30), oldestPendingAt: null }),
}));
jest.mock('@/data/sync/failedWrites', () => ({ getFailedWrites: () => [{ code: 'rejected' }] }));
jest.mock('@/features/levels/useUserSetup', () => ({ useUserSetup: () => ({ data: { level: 2 }, loading: false }) }));
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ status: 'active' }) }));

const makeClient = () => {
  const qc = new QueryClient();
  qc.setQueryData(['transactions', 'h', '2026-10'], [{ id: 't', note: 'SENTINEL-DIAG-91', amount: 123456 }]);
  return qc;
};
const wrap = (qc: QueryClient) => (
  <QueryClientProvider client={qc}>
    <ThemeProvider>
      <DiagnosticScreen />
    </ThemeProvider>
  </QueryClientProvider>
);

describe('DiagnosticScreen (DAT-06)', () => {
  let open: jest.SpyInstance;
  let share: jest.SpyInstance;
  beforeEach(() => {
    open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('renders the What is in it rows and sends nothing on mount', async () => {
    const { getByText } = await render(wrap(makeClient()));
    expect(getByText('App version and build')).toBeTruthy();
    expect(getByText('Recent error codes')).toBeTruthy();
    expect(getByText('How many records you have')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it('the see-it sheet shows exactly the text that is sent, with no record data', async () => {
    const { getByTestId, findByTestId, getByText } = await render(wrap(makeClient()));
    await fireEvent.press(getByTestId('diagnostic-see'));
    const shown = (await findByTestId('diagnostic-text')).props.children as string;
    for (const key of DIAGNOSTIC_FIELDS) expect(shown).toContain(`${key}: `);
    expect(shown).not.toContain('SENTINEL-DIAG-91');
    expect(shown).not.toContain('123456');
    await fireEvent.press(getByText('Send to support'));
    await fireEvent.press(getByText('Send'));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    const url = open.mock.calls[0]![0] as string;
    expect(url.startsWith('mailto:support@fincwin.com?subject=')).toBe(true);
    expect(url).toContain(`body=${encodeURIComponent(shown)}`);
  });

  it('Save a copy shares the same text', async () => {
    const { getByText } = await render(wrap(makeClient()));
    await fireEvent.press(getByText('Save a copy'));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect((share.mock.calls[0]![0] as { message: string }).message).toContain('appVersion: 1.4.0');
  });

  it('a failed send shows the warning card', async () => {
    open.mockRejectedValue(new Error('no mail app'));
    const { getByText, findByText } = await render(wrap(makeClient()));
    await fireEvent.press(getByText('Send to support'));
    await fireEvent.press(getByText('Send'));
    expect(await findByText(/It could not be sent/)).toBeTruthy();
  });
});
