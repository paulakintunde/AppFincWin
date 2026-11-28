import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ExportScreen } from '../ExportScreen';
import { parseMonthsParam } from '../parseMonthsParam';
import { EXPORT_MANIFEST } from '@/data/exportManifest';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: { tag: 'client' } }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
const mockExport = jest.fn(async (..._a: unknown[]) => 'saved');
jest.mock('../csvExport', () => ({ exportCsv: (...a: unknown[]) => mockExport(...a) }));
jest.mock('@/data/sync/lockedWrites', () => ({ useLockedWrites: () => [] }));
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ writable: true }) }));

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;

describe('ExportScreen (10-17)', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockExport.mockClear();
  });

  it('lists every manifest table and server-records, and links to Import from CSV', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(wrap(<ExportScreen />));
    expect(queryByTestId('export-scope')).toBeNull();
    await fireEvent.press(getByTestId('export-files-toggle'));
    const list = getByTestId('export-files');
    expect(list).toBeTruthy();
    for (const table of Object.keys(EXPORT_MANIFEST)) expect(getByText(`${table}.csv`)).toBeTruthy();
    expect(getByText(/server-records\.csv/)).toBeTruthy();
    await fireEvent.press(getByTestId('export-import-link'));
    expect(mockPush).toHaveBeenCalledWith('/data-import');
  });

  it('full export calls exportCsv with the client and a progress callback', async () => {
    const { getByText } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(mockExport.mock.calls[0]).toEqual([{ tag: 'client' }, { onProgress: expect.any(Function) }]);
  });

  it('10-review-2 (D-4): shows the gathering steps as an accessible progress bar, then Writing files', async () => {
    let report: (p: unknown) => void = () => {};
    let finish: (v: string) => void = () => {};
    mockExport.mockImplementationOnce(async (..._a: unknown[]) => {
      report = (_a[1] as { onProgress: (p: unknown) => void }).onProgress;
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });
    const { getByText, findByTestId, getByTestId, queryByTestId } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    // Android: nothing shows while the folder picker is open
    expect(queryByTestId('export-progress')).toBeNull();
    await act(async () => report({ phase: 'gathering', done: 5, total: 14 }));
    expect((await findByTestId('export-progress-line')).props.children).toBe('Gathering your records · 5 of 14');
    const bar = getByTestId('export-progress-bar');
    expect(bar.props.accessibilityRole).toBe('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 0, max: 14, now: 5 });
    expect(bar.props.accessibilityLabel).toBe('Gathering your records, 5 of 14');
    await act(async () => report({ phase: 'writing' }));
    expect(getByTestId('export-progress-line').props.children).toBe('Writing files');
    await act(async () => finish('saved'));
    await waitFor(() => expect(queryByTestId('export-progress')).toBeNull());
  });

  it('with months: heading, filtered file list, and exportCsv gets the months', async () => {
    const { getByTestId, getByText, queryByText } = await render(wrap(<ExportScreen months={['2026-08', '2026-09']} />));
    expect(getByTestId('export-scope').props.children).toBe('Only archived months: August 2026 and September 2026');
    await fireEvent.press(getByTestId('export-files-toggle'));
    expect(getByText('transactions.csv')).toBeTruthy();
    expect(getByText('accounts.csv')).toBeTruthy();
    expect(queryByText('debts.csv')).toBeNull();
    expect(queryByText(/server-records/)).toBeNull();
    await fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(mockExport.mock.calls[0]).toEqual([{ tag: 'client' }, { months: ['2026-08', '2026-09'], onProgress: expect.any(Function) }]);
  });
});

describe('parseMonthsParam (route)', () => {
  it('keeps only valid YYYY-MM items', () => {
    expect(parseMonthsParam('2026-08,bad,2026-13')).toEqual(['2026-08']);
  });
  it('no param or nothing valid is undefined', () => {
    expect(parseMonthsParam(undefined)).toBeUndefined();
    expect(parseMonthsParam('')).toBeUndefined();
    expect(parseMonthsParam('x,2026-00')).toBeUndefined();
  });
});
