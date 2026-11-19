import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { OfflineSavesNotice } from '../OfflineSavesNotice';
import { OfflineSavesChip } from '../OfflineSavesChip';
import { ExportScreen } from '@/features/export/ExportScreen';

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
jest.mock('@/state/undoToast', () => ({ showToast: jest.fn() }));
const mockTrack = jest.fn();
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: (...a: unknown[]) => mockTrack(...a) }) }));
const mockExport = jest.fn(async () => 'saved');
jest.mock('@/features/export/csvExport', () => ({ exportCsv: () => mockExport() }));

let mockWrites: unknown[] = [];
jest.mock('@/data/sync/lockedWrites', () => ({ useLockedWrites: () => mockWrites }));
let mockPlan: Record<string, unknown> = {};
jest.mock('../usePlanState', () => ({ usePlanState: () => mockPlan }));

const writes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `w${i}`,
    mutationKey: ['transactions', 'add'],
    variables: {},
    replayable: true,
    at: '2026-11-19T10:00:00.000Z',
  }));

const wrap = (node: React.ReactElement) => <ThemeProvider>{node}</ThemeProvider>;

describe('OfflineSavesNotice', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockTrack.mockClear();
    mockExport.mockClear();
    mockPlan = { status: 'locked', writable: false };
    mockWrites = [];
  });

  it('renders nothing when no writes are kept', async () => {
    const { queryByTestId } = await render(wrap(<OfflineSavesNotice />));
    expect(queryByTestId('offline-saves-notice')).toBeNull();
  });

  it('with 3 kept writes shows the copy, the actions and the kept items', async () => {
    mockWrites = writes(3);
    const { getByText, getByTestId, findByTestId, getAllByText } = await render(wrap(<OfflineSavesNotice />));
    expect(getAllByText('Saved on this phone. Choose a plan to sync').length).toBeGreaterThan(0);
    expect(getByText(/^3 items are kept here/)).toBeTruthy();
    await fireEvent.press(getByText('Export my data'));
    expect(mockPush).toHaveBeenCalledWith('/export');
    await fireEvent.press(getByText('Choose a plan'));
    expect(mockPush).toHaveBeenCalledTimes(2);
    await fireEvent.press(getByTestId('offline-saves-see'));
    expect(await findByTestId("locked-write-w0")).toBeTruthy();
    expect(await findByTestId("locked-write-w2")).toBeTruthy();
  });

  it('is hidden in the sample state', async () => {
    mockWrites = writes(3);
    mockPlan = { status: 'sample', writable: false };
    const { queryByTestId } = await render(wrap(<OfflineSavesNotice />));
    expect(queryByTestId('offline-saves-notice')).toBeNull();
  });

  it('the Activity chip shows the count and hides at zero', async () => {
    const empty = await render(wrap(<OfflineSavesChip />));
    expect(empty.queryByTestId('offline-saves-chip')).toBeNull();
    mockWrites = writes(3);
    const { getByTestId, getByText } = await render(wrap(<OfflineSavesChip />));
    expect(getByTestId('offline-saves-chip')).toBeTruthy();
    expect(getByText('3')).toBeTruthy();
  });
});

describe('ExportScreen', () => {
  it('exports with a locked plan and tracks locked: true', async () => {
    mockPlan = { status: 'locked', writable: false };
    mockWrites = writes(2);
    const { getByText } = await render(wrap(<ExportScreen />));
    expect(getByText('Items saved on this phone are included.')).toBeTruthy();
    await fireEvent.press(getByText('Export'));
    await new Promise((r) => setTimeout(r, 0));
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith('csv_exported', { locked: true });
  });
});
