import React from 'react';
import { Keyboard } from 'react-native';
import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';

jest.mock('@/features/record/accounts/AccountSheet', () => ({ AccountSheet: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => 'new-id');
const mockCheckCap = jest.fn((..._a: unknown[]) => false);
const mockPush = jest.fn();
let mockRates: { quote: string; rate: string; rate_date: string; source: string }[] = [];
const mockEdit = jest.fn(() => true);
const mockRemove = jest.fn((): string | null => 'del-step');
const mockAddTransfer = jest.fn(() => ({ transferId: 'tr1', stepId: 'tr-step' }));
const mockEditTransfer = jest.fn((): string | null => 'tre-step');
const mockRemoveTransfer = jest.fn(() => 'trd-step');
const mockTrack = jest.fn();
let mockLegs: TransactionRow[] = [];
let mockLegsRead: Record<string, unknown> = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
let mockRegion = 'GB';
let mockTransferCat: string | null = 'tc';
let mockNoAccounts = false;
let mockHome = 'GBP';

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
  useMarkPaid: () => ({ markPaid: jest.fn(() => 'paid-step') }),
  useSkipOccurrence: () => ({ skip: jest.fn(() => 'skip-step') }),
}));
jest.mock('expo-router', () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('../useCapCrossing', () => ({ useCapCrossing: () => ({ check: (...a: unknown[]) => mockCheckCap(...a) }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: mockRates }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { lead_figure: 'home' } }) }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({ useCategoryMonthUsage: () => ({ usage: new Map(), isLoading: false }) }));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: mockAddTransfer }),
  useEditTransfer: () => ({ edit: mockEditTransfer }),
  useDeleteTransfer: () => ({ remove: mockRemoveTransfer }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
  useEditSeriesFrom: () => ({ editFrom: jest.fn(() => 'sedit-step') }),
  useEndSeries: () => ({ end: jest.fn(() => 'send-step') }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: mockNoAccounts
      ? []
      : [
          { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
          { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
          { id: 'a3', name: 'Euro pot', currency: 'EUR', archived_at: null },
        ],
  }),
}));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    active: [{ id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null }],
    byId: new Map(),
    transferCategoryId: mockTransferCat,
  }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [
      { code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null },
      { code: 'EUR', name: 'Euro', symbol: '€', exponent: 2, kind: 'iso', rateDate: null },
    ],
    loading: false,
  }),
}));
jest.mock('@/data/queries/activity', () => ({
  useTransferLegs: () => ({ legs: mockLegs, isLoading: false, ...mockLegsRead }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: mockHome,
    showCents: true,
    region: mockRegion,
    timeZone: 'Europe/London',
    today: '2026-09-25',
  }),
}));

function row(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    household_id: 'h1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    home_currency: 'GBP',
    local_date: '2026-09-20',
    name: 'Coffee',
    category_id: 'c1',
    payment_type: 'card',
    status: 'paid',
    note: null,
    version: 3,
    transfer_id: null,
    rate_source: 'same-currency',
    rate_date: null,
    rate_pending: false,
    ...over,
  } as TransactionRow;
}

async function typeAmount(getByLabelText: RenderResult['getByLabelText'], text: string) {
  // Long-press backspace clears, so an edit that opens with a prefilled amount types from empty.
  await fireEvent(getByLabelText('Delete last digit'), 'longPress');
  for (const ch of text) {
    await fireEvent.press(getByLabelText(ch === '.' || ch === ',' ? 'Decimal point' : ch));
  }
}

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode'], onClose = jest.fn()) {
  const utils = await render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={onClose} />
    </ThemeProvider>
  );
  return { ...utils, onClose };
}

let listeners: Record<string, () => void> = {};
let dismissSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  resetToastForTests();
  mockLegs = [];
  mockRates = [];
  mockLegsRead = { isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true };
  mockRegion = 'GB';
  mockTransferCat = 'tc';
  mockNoAccounts = false;
  mockHome = 'GBP';
  listeners = {};
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: () => void) => {
    listeners[event] = cb;
    return { remove: jest.fn() };
  }) as never);
  dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
});

const amountPress = (u: RenderResult) => u.getByLabelText(/^Amount/);

describe('TransactionSheet: keypad returns after text fields (261010-kpe)', () => {
  it('tapping the amount after the name field hides the keyboard and edits the amount', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent(u.getByLabelText('What is it for?'), 'focus');
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
    await fireEvent.press(amountPress(u));
    expect(dismissSpy).toHaveBeenCalled();
    await fireEvent.press(u.getByLabelText('7'));
    await fireEvent.press(u.getByLabelText('5'));
    expect(u.getByLabelText(/^Amount .*75/)).toBeTruthy();
  });

  it('keeps the keypad closed when the keyboard hides (02.3 D-12, Pitfall 3)', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent(u.getByLabelText('Note'), 'focus');
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
    await act(async () => listeners.keyboardDidHide?.());
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
  });

  it('edit mode: amount edits after the name field and Save sends the new amount', async () => {
    const u = await open({ kind: 'edit', row: row() });
    await fireEvent(u.getByLabelText('What is it for?'), 'focus');
    await fireEvent.press(amountPress(u));
    await fireEvent(u.getByLabelText('Delete last digit'), 'longPress');
    await fireEvent.press(u.getByLabelText('9'));
    await fireEvent.press(u.getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [{ patch: Record<string, unknown> }];
    expect(vars.patch).toMatchObject({ original_amount: -900 });
  });

  it('opening a picker row dismisses the keyboard', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent(u.getByLabelText('What is it for?'), 'focus');
    dismissSpy.mockClear();
    await fireEvent.press(u.getByText('Category'));
    expect(dismissSpy).toHaveBeenCalled();
  });

  it('keeps the amount editable after a picker row was opened from a focused field', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent(u.getByLabelText('What is it for?'), 'focus');
    await fireEvent.press(u.getByText('Category'));
    await act(async () => listeners.keyboardDidHide?.());
    await fireEvent.press(amountPress(u));
    await fireEvent.press(u.getByLabelText('3'));
    expect(u.getByLabelText(/^Amount .*3/)).toBeTruthy();
  });
});

describe('TransactionSheet: compact amount field and the pad (02.3 D-12)', () => {
  it.each([
    ['out', { kind: 'new', direction: 'out' }],
    ['in', { kind: 'new', direction: 'in' }],
    ['transfer', { kind: 'new', direction: 'transfer' }],
    ['edit', { kind: 'edit', row: row() }],
  ] as const)('%s opens with the pad closed', async (_n, mode) => {
    const u = await open(mode as never);
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
    expect(u.getByLabelText(/^Amount/)).toBeTruthy();
  });

  it('a new entry shows the Amount placeholder', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    expect(u.getByLabelText('Amount')).toBeTruthy();
  });

  it('tapping the amount opens the pad and dismisses the OS keyboard; Done closes it', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(amountPress(u));
    expect(dismissSpy).toHaveBeenCalled();
    expect(u.getByLabelText('Delete last digit')).toBeTruthy();
    expect(amountPress(u).props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(u.getByLabelText('Done'));
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
  });

  it('focusing a text field hides the pad and the keyboard hiding never re-opens it', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(amountPress(u));
    await fireEvent(u.getByLabelText('What is it for?'), 'focus');
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
    await act(async () => listeners.keyboardDidHide?.());
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
  });

  it('a category row, a type chip, a toggle and the blank sheet space close the pad', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(amountPress(u));
    await fireEvent.press(u.getByText('Category'));
    expect(u.queryByLabelText('Delete last digit')).toBeNull();

    await fireEvent.press(amountPress(u));
    await fireEvent.press(u.getByText('Money in'));
    expect(u.queryByLabelText('Delete last digit')).toBeNull();

    await fireEvent.press(amountPress(u));
    await fireEvent.press(u.getByText('Automatic payment'));
    expect(u.queryByLabelText('Delete last digit')).toBeNull();

    await fireEvent.press(amountPress(u));
    await fireEvent(u.getByLabelText('What is it for?'), 'touchStart');
    expect(u.queryByLabelText('Delete last digit')).toBeNull();
  });

  it('typing 4.20 reads Amount £4.20 and Save sends -420', async () => {
    const u = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(amountPress(u));
    for (const ch of '4.20') await fireEvent.press(u.getByLabelText(ch === '.' ? 'Decimal point' : ch));
    expect(u.getByLabelText('Amount £4.20')).toBeTruthy();
    await fireEvent.press(u.getByText('Done'));
    await fireEvent.changeText(u.getByLabelText('What is it for?'), 'Tea');
    await fireEvent.press(u.getByText('Save expense'));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect((mockAdd.mock.calls[0] as unknown[])[0]).toMatchObject({ amount: -420 });
  });

  it('a cross-currency transfer has two fields; the pad types into the one tapped', async () => {
    const u = await open({ kind: 'new', direction: 'transfer' });
    await fireEvent.press(u.getByLabelText('To account'));
    await fireEvent.press(u.getByLabelText('Euro pot'));
    expect(u.getByHintText('Amount sent')).toBeTruthy();
    await fireEvent.press(u.getByHintText('Amount received'));
    expect(u.getByHintText('Amount received').props.accessibilityState).toMatchObject({ expanded: true });
    expect(u.getByHintText('Amount sent').props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(u.getByLabelText('8'));
    expect(u.getAllByLabelText(/^Amount/).length).toBe(2);
    expect(u.getByLabelText(/^Amount .*8/)).toBeTruthy();
  });
});
