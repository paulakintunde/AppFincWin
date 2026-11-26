// 10.1-22 (D-08, RCP-06): the Export screen's separate receipt files step.
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { ExportScreen } from '../ExportScreen';

jest.setTimeout(30000);

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: { tag: 'client' } }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
const mockExport = jest.fn(async (..._a: unknown[]) => 'saved');
jest.mock('../csvExport', () => ({ exportCsv: (...a: unknown[]) => mockExport(...a) }));
const mockReceipts = jest.fn();
jest.mock('@/services/receipts/exportReceipts', () => ({ exportReceiptFiles: (...a: unknown[]) => mockReceipts(...a) }));
jest.mock('@/data/sync/lockedWrites', () => ({ useLockedWrites: () => [] }));
jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ writable: true }) }));

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;

describe('ExportScreen receipt files (10.1-22)', () => {
  beforeEach(() => {
    mockReceipts.mockReset();
    mockToast.mockClear();
    mockExport.mockClear();
  });

  it('shows the receipt card and leaves the records export alone', async () => {
    const { getByText, getByTestId } = await render(wrap(<ExportScreen />));
    expect(getByTestId('export-receipts')).toBeTruthy();
    expect(getByText('Receipt files')).toBeTruthy();
    expect(getByText('Save receipt files')).toBeTruthy();
    await fireEvent.press(getByText('Export'));
    await waitFor(() => expect(mockExport).toHaveBeenCalledTimes(1));
    expect(mockReceipts).not.toHaveBeenCalled();
  });

  it('pressing the button exports the receipt files and confirms', async () => {
    mockReceipts.mockResolvedValue({ ok: true, files: 3, zips: 1, missing: 0 });
    const { getByText } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Save receipt files'));
    await waitFor(() => expect(mockReceipts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'plans.export.done' } }));
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('shows the none line when there are no receipts', async () => {
    mockReceipts.mockResolvedValue({ ok: false, reason: 'none' });
    const { getByText, findByTestId } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Save receipt files'));
    expect((await findByTestId('export-receipts-note')).props.children).toBe('You have no receipts to export.');
  });

  it('shows the partial line with the count of files that could not be fetched', async () => {
    mockReceipts.mockResolvedValue({ ok: true, files: 2, zips: 1, missing: 2 });
    const { getByText, findByTestId } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Save receipt files'));
    expect((await findByTestId('export-receipts-note')).props.children).toBe('2 files could not be fetched. The list shows which.');
  });

  it('uses the existing failure toast for a failure and stays quiet when cancelled', async () => {
    mockReceipts.mockResolvedValueOnce({ ok: false, reason: 'failed' }).mockResolvedValueOnce({ ok: false, reason: 'cancelled' });
    const { getByText } = await render(wrap(<ExportScreen />));
    await fireEvent.press(getByText('Save receipt files'));
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith({ kind: 'info', text: { key: 'sync.exportFailed' } }));
    mockToast.mockClear();
    await fireEvent.press(getByText('Save receipt files'));
    await waitFor(() => expect(mockReceipts).toHaveBeenCalledTimes(2));
    expect(mockToast).not.toHaveBeenCalled();
  });
});
