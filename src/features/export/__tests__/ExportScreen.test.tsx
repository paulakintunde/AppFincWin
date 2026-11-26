import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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

  it('full export calls exportCsv with the client only', async () => {
    const { getByText } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(mockExport.mock.calls[0]).toEqual([{ tag: 'client' }]);
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
    expect(mockExport.mock.calls[0]).toEqual([{ tag: 'client' }, { months: ['2026-08', '2026-09'] }]);
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
