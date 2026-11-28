import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { DataImportScreen } from '../DataImportScreen';

const { setMockQueued } = jest.requireMock('@/data/sync/useQueueGuard') as { setMockQueued: (n: number) => void };

jest.setTimeout(30000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/shell/backHistory/BackHistoryProvider', () => ({ useBackHistory: () => ({ goBack: jest.fn(), history: [] }) }));
const mockToast = jest.fn();
jest.mock('@/state/undoToast', () => ({ showToast: (...a: unknown[]) => mockToast(...a) }));
const mockHaptic = jest.fn();
jest.mock('@/ui/haptics', () => ({
  ...jest.requireActual('@/ui/haptics'),
  hapticMilestone: () => mockHaptic(),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ householdId: 'hh', userId: 'me', homeCurrency: 'USD', today: '2026-11-23' }),
}));
let mockAccountsData: { id: string; name: string }[] | undefined = [{ id: 'a-1', name: 'Savings' }];
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: mockAccountsData }),
}));
jest.mock('@/data/queries/decide', () => ({ useDebts: () => ({ data: [] }) }));
jest.mock('@/data/queries/customCurrencies', () => ({ useCustomCurrencies: () => ({ data: [] }) }));
let mockDecimal: string | undefined = '.';
jest.mock('@/services/locale/deviceLocale', () => ({
  ...jest.requireActual('@/services/locale/deviceLocale'),
  getDeviceSeparators: () => ({ decimal: mockDecimal, group: ',' }),
}));
jest.mock('@/data/queries/growGoals', () => ({ useSavingsGoalRows: () => ({ data: [{ id: 'g-1', name: 'Holiday' }] }) }));
jest.mock('@/data/queries/growHoldings', () => ({ useHoldingRows: () => ({ data: [] }) }));
const mockAddAccount = jest.fn();
const mockSaveGoal = jest.fn();
const mockSaveDebt = jest.fn();
const mockAddHolding = jest.fn();
jest.mock('@/data/mutations/accounts', () => ({ useAddAccount: () => ({ add: (...a: unknown[]) => mockAddAccount(...a) }) }));
jest.mock('@/data/mutations/growGoals', () => ({ useSaveGoalPlan: () => ({ save: (...a: unknown[]) => mockSaveGoal(...a) }) }));
jest.mock('@/data/mutations/growDebts', () => ({ useSaveGrowDebt: () => ({ save: (...a: unknown[]) => mockSaveDebt(...a) }) }));
jest.mock('@/data/mutations/growHoldings', () => ({ useAddHolding: () => ({ add: (...a: unknown[]) => mockAddHolding(...a) }) }));
const mockPick = jest.fn();
const mockSaveTemplate = jest.fn(async (..._a: unknown[]) => 'shared');
jest.mock('../files', () => ({
  pickCsvText: () => mockPick(),
  saveTemplateFile: (...a: unknown[]) => mockSaveTemplate(...a),
}));

const wrap = () => (
  <ThemeProvider>
    <DataImportScreen />
  </ThemeProvider>
);

const pickText = (text: string) => mockPick.mockResolvedValueOnce({ kind: 'ok', text });

describe('DataImportScreen (10-18)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockQueued(0);
    mockAccountsData = [{ id: 'a-1', name: 'Savings' }];
    mockDecimal = '.';
  });

  it('10-review (D-5): choosing a file waits until the existing lists have loaded', async () => {
    mockAccountsData = undefined;
    const { getByText } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    expect(mockPick).not.toHaveBeenCalled();
  });

  it('10-review-2 (D-1, D-2): reads normal amounts in any common writing; a short reason per row, the longer note once', async () => {
    pickText('name,kind,currency,opening_balance\nEveryday,checking,USD,1500\nSpare,cash,USD,"1.234,56"\nOdd,cash,USD,"1,2345"\nTwo,cash,USD,"9,9999"\n');
    const { getByText, getAllByText, findByTestId, getByTestId, queryByTestId } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    expect((await findByTestId('import-summary')).props.children).toBe('2 rows ready, 2 need a look');
    expect(getByTestId('import-row-0-amount').props.children).toBe('$1,500');
    expect(getByTestId('import-row-1-amount').props.children).toBe('$1,234.56');
    expect(queryByTestId('import-row-2-amount')).toBeNull();
    expect(getByTestId('import-row-2-check')).toBeTruthy();
    expect(getAllByText('More decimals than USD has')).toHaveLength(2);
    expect(getAllByText('Rows marked Check have an amount to fix in the file. Fix it, then choose the file again.')).toHaveLength(1);
    expect(queryByTestId('import-old-export')).toBeNull();
  });

  it('10-review-2 (D-1): an older FincWin export reads cents and says so once', async () => {
    const id = '123e4567-e89b-42d3-a456-426614174000';
    pickText(`id,household_id,name,kind,currency,opening_balance,created_at,updated_at\n${id},h,Everyday,checking,USD,150000,t,t\n`);
    const { getByText, findByTestId, getByTestId } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    await findByTestId('import-summary');
    expect(getByTestId('import-row-0-amount').props.children).toBe('$1,500');
    expect(getByTestId('import-old-export').props.children).toBe('This is an older FincWin export, so amounts are read in the smallest unit, such as cents.');
  });

  it('10-review-2 (D-2): a "1,234" nothing can settle stays ready with a Read as note', async () => {
    mockDecimal = '٫';
    pickText('name,kind,currency,opening_balance\nEveryday,checking,KWD,"1,234"\n');
    const { getByText, findByTestId, getByTestId } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    expect((await findByTestId('import-summary')).props.children).toBe('1 rows ready, 0 need a look');
    expect(getByTestId('import-row-0-read-as')).toBeTruthy();
    expect(getByText(/^Read as /)).toBeTruthy();
  });

  it('shows the template card and saves a template named for the segment', async () => {
    const { getByText, getByTestId } = await render(wrap());
    expect(getByTestId('import-template')).toBeTruthy();
    await fireEvent.press(getByText('Goals'));
    await fireEvent.press(getByText('Save a template'));
    await waitFor(() => expect(mockSaveTemplate).toHaveBeenCalledTimes(1));
    expect(mockSaveTemplate.mock.calls[0]![0]).toBe('fincwin-goals-template.csv');
    expect(String(mockSaveTemplate.mock.calls[0]![1]).split('\r\n')[0]).toContain('target');
  });

  it('previews ready, check and already-exists rows, then imports only the ready ones', async () => {
    pickText('name,kind,currency,opening_balance\nChecking,checking,USD,1000\nSavings,savings,USD,5\nBad,cash,,5\n');
    const { getByText, findByTestId, getByTestId, queryByTestId } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    expect((await findByTestId('import-summary')).props.children).toBe('1 rows ready, 1 need a look');
    expect(getByTestId('import-row-2-check')).toBeTruthy();
    expect(getByText('Currency missing')).toBeTruthy();
    expect(getByText('Already exists')).toBeTruthy();
    expect(queryByTestId('queue-note')).toBeNull();

    await fireEvent.press(getByText('Import 1 rows'));
    expect(mockAddAccount).toHaveBeenCalledTimes(1);
    expect(mockAddAccount.mock.calls[0]![0]).toMatchObject({ name: 'Checking', opening_balance: 100000 });
    expect(mockHaptic).toHaveBeenCalledTimes(1);
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ text: { key: 'system.ownData.dataImport.addedToast', params: { count: 1, kind: 'accounts' } } }),
    );
  });

  it('the Import anyway switch adds an existing-name row as a new row', async () => {
    pickText('name,kind,currency\nSavings,savings,USD\n');
    const { getByText, findByTestId, getByLabelText } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    expect((await findByTestId('import-summary')).props.children).toBe('0 rows ready, 0 need a look');
    await fireEvent.press(getByLabelText('Import anyway'));
    expect((await findByTestId('import-summary')).props.children).toBe('1 rows ready, 0 need a look');
    await fireEvent.press(getByText('Import 1 rows'));
    expect(mockAddAccount).toHaveBeenCalledTimes(1);
  });

  it('imports goals as saved plans with no series, and shows the goals toast word', async () => {
    pickText('name,currency,target\nTrip,USD,2000\nHoliday,USD,100\n');
    const { getByText, findByTestId } = await render(wrap());
    await fireEvent.press(getByText('Goals'));
    await fireEvent.press(getByText('Choose a file'));
    await findByTestId('import-summary');
    await fireEvent.press(getByText('Import 1 rows'));
    expect(mockSaveGoal).toHaveBeenCalledTimes(1);
    expect(mockSaveGoal.mock.calls[0]![0]).toMatchObject({ ownerId: 'me', householdId: 'hh', series: null, fields: { name: 'Trip', target: 200000 } });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ text: expect.objectContaining({ params: { count: 1, kind: 'goals' } }) }));
  });

  it('refuses up front when the rows would pass the queue cap and writes nothing', async () => {
    setMockQueued(499);
    pickText('name,kind,currency\nA,cash,USD\nB,cash,USD\n');
    const { getByText, findByTestId, getByTestId } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    await findByTestId('import-summary');
    await fireEvent.press(getByText('Import 2 rows'));
    expect(getByTestId('queue-note')).toBeTruthy();
    expect(mockAddAccount).not.toHaveBeenCalled();
    expect(mockHaptic).not.toHaveBeenCalled();
  });

  it('a file that cannot be read gives the one plain message and no preview', async () => {
    pickText('colour,shape\nred,round\n');
    const { getByText, findByTestId, queryByTestId } = await render(wrap());
    await fireEvent.press(getByText('Choose a file'));
    expect(await findByTestId('import-unreadable')).toBeTruthy();
    expect(getByText('This file could not be read. Check that it is a CSV saved from FincWin or the template.')).toBeTruthy();
    expect(queryByTestId('import-preview')).toBeNull();
  });
});
