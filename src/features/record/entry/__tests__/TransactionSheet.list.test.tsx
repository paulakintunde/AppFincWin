import React from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { serialiseDraft, type ListItem } from '@/engine/entryList';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { hapticLight, hapticSuccess } from '@/ui/haptics';
import { entryDraftKey } from '../useEntryDraft';
import { TransactionSheet } from '../TransactionSheet';

jest.mock('@/features/record/accounts/AccountSheet', () => ({ AccountSheet: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/ui/haptics', () => ({
  hapticLight: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticWarning: jest.fn(),
  hapticSelection: jest.fn(),
  hapticHeavy: jest.fn(),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => 'new-id');
const mockBulkSave = jest.fn((..._a: unknown[]) => 'bulk-step');
let mockUuid = 0;

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: jest.fn(() => true) }),
  useDeleteTransaction: () => ({ remove: jest.fn(() => 'del-step') }),
  useMarkPaid: () => ({ markPaid: jest.fn(() => 'paid-step') }),
  useSkipOccurrence: () => ({ skip: jest.fn(() => 'skip-step') }),
}));
jest.mock('@/data/mutations/bulkAdd', () => ({ useBulkAdd: () => ({ save: (...a: unknown[]) => mockBulkSave(...a) }) }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('../useCapCrossing', () => ({ useCapCrossing: () => ({ check: jest.fn(() => false) }) }));
jest.mock('@/data/queries/fxLatest', () => ({ useFxLatest: () => ({ data: [] }) }));
jest.mock('@/data/queries/moneyPrefs', () => ({ useMoneyPrefs: () => ({ prefs: { lead_figure: 'home' } }) }));
jest.mock('@/features/record/categories/useCategoryMonthUsage', () => ({ useCategoryMonthUsage: () => ({ usage: new Map(), isLoading: false }) }));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: jest.fn(() => ({ transferId: 'tr1', stepId: 'tr-step' })) }),
  useEditTransfer: () => ({ edit: jest.fn(() => 'tre-step') }),
  useDeleteTransfer: () => ({ remove: jest.fn(() => 'trd-step') }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: jest.fn(() => 'series-step') }),
  useEditSeriesFrom: () => ({ editFrom: jest.fn(() => 'sedit-step') }),
  useEndSeries: () => ({ end: jest.fn(() => 'send-step') }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuid}` }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: jest.fn() }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
      { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
    ],
  }),
}));
jest.mock('@/data/mutations/categoryRules', () => ({ useAddRule: () => ({ add: jest.fn(() => ({ id: 'r', stepId: 'rs' })) }) }));
jest.mock('@/features/record/useGuessContext', () => {
  const value = {
    guess: {
      keywordRules: jest.requireActual('@/engine/categorize').DEFAULT_KEYWORD_RULES,
      learned: new Map(),
      builtinIds: new Map(),
      personalRules: [],
      sharedRules: [],
    },
    rules: [],
    resolved: { personal: [], shared: [], byRuleId: new Map(), unresolvedIds: new Set() },
    memberCategories: [],
    rulesStatus: 'ready',
  };
  return { useGuessContext: () => value };
});
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({
    active: [{ id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null }],
    byId: new Map(),
    transferCategoryId: 'tc',
  }),
}));
jest.mock('@/data/queries/currencyOptions', () => ({
  useCurrencyOptions: () => ({
    options: [{ code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null }],
    loading: false,
  }),
}));
jest.mock('@/data/queries/activity', () => ({
  useTransferLegs: () => ({ legs: [], isLoading: false, isPending: false, fetchStatus: 'idle', isError: false, isSuccess: true }),
}));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-09-25',
  }),
}));

function listItem(id: string, over: Partial<ListItem> = {}): ListItem {
  return {
    id,
    type: 'out',
    amountMinor: 100,
    currency: 'GBP',
    accountId: 'a1',
    localDate: '2026-09-20',
    name: `Item ${id}`,
    categoryId: null,
    paymentType: null,
    status: 'paid',
    statusTouched: false,
    note: '',
    automatic: false,
    refund: false,
    repeat: { freq: 'never' },
    toAccountId: null,
    toCurrency: null,
    amountInMinor: null,
    ...over,
  };
}

async function seedDraft(items: ListItem[]) {
  await AsyncStorage.setItem(entryDraftKey('u1', 'h1'), serialiseDraft(items, '2026-09-24T10:00:00.000Z'));
}

async function typeAmount(text: string) {
  const { getByLabelText, getAllByLabelText } = screen;
  try {
    getByLabelText('Delete last digit');
  } catch {
    await fireEvent.press(getAllByLabelText(/^Amount/)[0]!);
  }
  await fireEvent(getByLabelText('Delete last digit'), 'longPress');
  for (const ch of text) {
    await fireEvent.press(getByLabelText(ch === '.' ? 'Decimal point' : ch));
  }
  await fireEvent.press(getByLabelText('Done'));
}

async function fillEntry(amount: string, name: string) {
  await typeAmount(amount);
  await fireEvent.changeText(screen.getByLabelText('What is it for?'), name);
}

async function addEntry(amount: string, name: string) {
  await fillEntry(amount, name);
  await fireEvent.press(screen.getByText('Add to list'));
}

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode'] = { kind: 'new', direction: 'out' }) {
  const onClose = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={onClose} />
    </ThemeProvider>
  );
  return { ...utils, onClose };
}

let announce: jest.SpyInstance;

beforeEach(async () => {
  jest.clearAllMocks();
  mockUuid = 0;
  resetToastForTests();
  await AsyncStorage.clear();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('footer', () => {
  it('shows Add to list beside Save on a new entry', async () => {
    const { getByText } = await open();
    expect(getByText('Add to list')).toBeTruthy();
    expect(getByText('Save expense')).toBeTruthy();
  });

  it('shows only the usual footer when editing', async () => {
    const { queryByText, getByText } = await open({
      kind: 'edit',
      row: {
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
      } as never,
    });
    expect(queryByText('Add to list')).toBeNull();
    expect(getByText('Save changes')).toBeTruthy();
  });
});

describe('Add to list', () => {
  it('appends the entry, clears the form per D-16 and announces it', async () => {
    const { getByText, getByLabelText } = await open();
    await addEntry('12.50', 'Tesco');
    expect(getByText('1 in list · £12.50')).toBeTruthy();
    expect(getByText('Save 1 entry')).toBeTruthy();
    expect(getByLabelText('What is it for?').props.value).toBe('');
    expect(getByText('Current')).toBeTruthy();
    expect(hapticLight).toHaveBeenCalled();
    expect(announce).toHaveBeenCalledWith('Tesco added to the list. 1 in list · £12.50');
  });

  it('blocks an empty name and adds nothing', async () => {
    const { getByText, queryByText } = await open();
    await typeAmount('5');
    await fireEvent.press(getByText('Add to list'));
    expect(getByText('Give it a name.')).toBeTruthy();
    expect(queryByText(/in list/)).toBeNull();
  });

  it('blocks an invalid Repeats count', async () => {
    const { getByText, getByLabelText, queryByText } = await open();
    await fillEntry('5', 'Gym');
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every week'));
    await fireEvent.press(getByText('After a number of times'));
    await fireEvent.changeText(getByLabelText('Number of times'), '5000');
    await fireEvent.press(getByText('Done'));
    await fireEvent.press(getByText('Add to list'));
    expect(getByText('Use a whole number from 1 to 1000.')).toBeTruthy();
    expect(queryByText(/in list/)).toBeNull();
  });

  it('disables Add at 30 of a type and re-enables for another type', async () => {
    await seedDraft(Array.from({ length: 30 }, (_, i) => listItem(`i${i}`)));
    const { getByText, getByLabelText, queryByText } = await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    expect(await screen.findByText('The list holds 30 money out entries. Save them to add more.')).toBeTruthy();
    expect(getByText('Add to list')).toBeTruthy();
    expect(getByLabelText('Add to list').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(getByText('Money in'));
    expect(queryByText('The list holds 30 money out entries. Save them to add more.')).toBeNull();
    expect(getByLabelText('Add to list').props.accessibilityState.disabled).toBe(false);
  });
});

describe('Save with a list', () => {
  it('saves the list alone from an untouched form with one toast', async () => {
    const { getByText, onClose } = await open();
    await addEntry('3', 'Bus');
    await addEntry('4', 'Tram');
    await fireEvent.press(getByText('Save 2 entries'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockBulkSave).toHaveBeenCalledTimes(1);
    const [items, ctx] = mockBulkSave.mock.calls[0] as unknown as [ListItem[], Record<string, unknown>];
    expect(items.map((i) => i.name)).toEqual(['Bus', 'Tram']);
    expect(items.map((i) => i.amountMinor)).toEqual([300, 400]);
    expect(ctx).toMatchObject({ householdId: 'h1', ownerId: 'u1', homeCurrency: 'GBP', transferCategoryId: 'tc' });
    expect(getToast()).toMatchObject({ stepId: 'bulk-step', text: { key: 'undo.label.addedMany', params: { count: 2 } } });
    expect(hapticSuccess).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    await waitFor(async () => expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).toBeNull());
  });

  it('includes a valid typed entry', async () => {
    const { getByText } = await open();
    await addEntry('3', 'Bus');
    await addEntry('4', 'Tram');
    await fillEntry('5', 'Taxi');
    await fireEvent.press(getByText('Save 3 entries'));
    const [items] = mockBulkSave.mock.calls[0] as unknown as [ListItem[]];
    expect(items.map((i) => i.name)).toEqual(['Bus', 'Tram', 'Taxi']);
  });

  it('refuses a partial form and says why', async () => {
    const { getByText, onClose } = await open();
    await addEntry('3', 'Bus');
    await typeAmount('9');
    await fireEvent.press(getByText('Save 2 entries'));
    expect(mockBulkSave).not.toHaveBeenCalled();
    expect(getByText('Finish or clear this entry to save the list.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('passes a repeating item with its repeat and shows it on the row', async () => {
    const { getByText, getByLabelText } = await open();
    await fillEntry('500', 'Rent');
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every month'));
    await fireEvent.press(getByText('Done'));
    await fireEvent.press(getByText('Add to list'));
    expect(getByText('Repeats monthly')).toBeTruthy();
    await fireEvent.press(getByText('Save 1 entry'));
    const [items] = mockBulkSave.mock.calls[0] as unknown as [ListItem[]];
    expect(items[0]!.repeat).toMatchObject({ freq: 'monthly' });
  });

  it('keeps a single save unchanged when the list is empty', async () => {
    const { getByText } = await open();
    await fillEntry('4.20', 'Tea');
    await fireEvent.press(getByText('Save expense'));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockBulkSave).not.toHaveBeenCalled();
  });
});

describe('editing and removing listed items', () => {
  it('loads a listed item into an empty form and takes it off the list', async () => {
    const { getByText, getByLabelText, queryByText } = await open();
    await addEntry('3', 'Bus');
    await fireEvent.press(getByLabelText(/^Money out, Bus/));
    expect(getByLabelText('What is it for?').props.value).toBe('Bus');
    expect(queryByText(/in list/)).toBeNull();
    expect(getByText('Save expense')).toBeTruthy();
  });

  it('adds a valid form entry first, then loads the item', async () => {
    const { getByText, getByLabelText } = await open();
    await addEntry('3', 'Bus');
    await fillEntry('4', 'Tram');
    await fireEvent.press(getByLabelText(/^Money out, Bus/));
    expect(getByLabelText('What is it for?').props.value).toBe('Bus');
    expect(getByText('1 in list · £4.00')).toBeTruthy();
  });

  it('asks before replacing a partial form', async () => {
    const { getByText, getByLabelText } = await open();
    await addEntry('3', 'Bus');
    await typeAmount('9');
    await fireEvent.press(getByLabelText(/^Money out, Bus/));
    expect(getByText('Clear what’s in the form to edit this one?')).toBeTruthy();
    await fireEvent.press(getByText('Keep typing'));
    expect(getByLabelText('What is it for?').props.value).toBe('');
    expect(getByText('1 in list · £3.00')).toBeTruthy();
  });

  it('replaces a partial form on Clear and edit', async () => {
    const { getByText, getByLabelText } = await open();
    await addEntry('3', 'Bus');
    await typeAmount('9');
    await fireEvent.press(getByLabelText(/^Money out, Bus/));
    await fireEvent.press(getByText('Clear and edit'));
    expect(getByLabelText('What is it for?').props.value).toBe('Bus');
  });

  it('removes an item through its accessibility action', async () => {
    const { getByLabelText, queryByText } = await open();
    await addEntry('3', 'Bus');
    await fireEvent(getByLabelText(/^Money out, Bus/), 'accessibilityAction', { nativeEvent: { actionName: 'right' } });
    expect(queryByText(/in list/)).toBeNull();
  });
});

describe('Undo after removing a listed item', () => {
  it('shows a Removed toast and Undo puts the item back at the same index', async () => {
    const { getByLabelText, getByText } = await open();
    await addEntry('3', 'Bus');
    await addEntry('4', 'Tea');
    await fireEvent(getByLabelText(/^Money out, Tea/), 'accessibilityAction', { nativeEvent: { actionName: 'right' } });
    const toast = getToast();
    expect(toast).toMatchObject({ kind: 'destructive', text: { key: 'record.sheet.list.removed', params: { name: 'Tea' } } });
    expect(toast?.onUndo).toEqual(expect.any(Function));
    expect(getByText('1 in list · £3.00')).toBeTruthy();
    await act(async () => {
      toast?.onUndo?.();
    });
    expect(getByText('2 in list · £7.00')).toBeTruthy();
    const labels = screen.getAllByLabelText(/^Money out, /).map((n) => n.props.accessibilityLabel as string);
    expect(labels[0]).toMatch(/Tea/);
    expect(labels[1]).toMatch(/Bus/);
  });

  it('does nothing when Undo is pressed after the list was saved', async () => {
    const { getByLabelText, getByText, queryByText } = await open();
    await addEntry('3', 'Bus');
    await addEntry('4', 'Tea');
    await fireEvent(getByLabelText(/^Money out, Tea/), 'accessibilityAction', { nativeEvent: { actionName: 'right' } });
    const undo = getToast()?.onUndo;
    await fireEvent.press(getByText(/^Save/));
    await waitFor(() => expect(mockBulkSave).toHaveBeenCalled());
    await act(async () => {
      undo?.();
    });
    expect(queryByText(/in list/)).toBeNull();
  });
});

describe('draft prompts', () => {
  it('continues a stored draft', async () => {
    await seedDraft([listItem('s1'), listItem('s2')]);
    const { getByText } = await open();
    expect(await screen.findByText('You have 2 unsaved entries')).toBeTruthy();
    expect(getByText('They were kept on this phone from last time.')).toBeTruthy();
    await fireEvent.press(getByText('Continue list'));
    expect(await screen.findByText('Item s1')).toBeTruthy();
    expect(getByText('Item s2')).toBeTruthy();
  });

  it('discards a stored draft and clears storage', async () => {
    await seedDraft([listItem('s1'), listItem('s2')]);
    const { queryByText } = await open();
    await fireEvent.press(await screen.findByText('Discard entries'));
    expect(queryByText('Item s1')).toBeNull();
    await waitFor(async () => expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).toBeNull());
  });

  it('mentions an item left out for an archived account', async () => {
    await seedDraft([listItem('s1'), listItem('s2', { accountId: 'gone' })]);
    await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    expect(await screen.findByText('1 entry was left out because its account is no longer available.')).toBeTruthy();
  });

  it('asks on Cancel with items and keeps them for later', async () => {
    await seedDraft([listItem('s1'), listItem('s2')]);
    const { getByText, onClose } = await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    await fireEvent.press(getByText('Cancel'));
    expect(getByText('2 entries aren’t saved yet')).toBeTruthy();
    expect(getByText('Keep the list on this phone for next time, or discard it.')).toBeTruthy();
    await fireEvent.press(getByText('Keep for later'));
    expect(onClose).toHaveBeenCalled();
    expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).not.toBeNull();
  });

  it('discards the list from the Cancel prompt', async () => {
    await seedDraft([listItem('s1')]);
    const { getByText, onClose } = await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    await fireEvent.press(getByText('Cancel'));
    await fireEvent.press(getByText('Discard list'));
    expect(onClose).toHaveBeenCalled();
    await waitFor(async () => expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).toBeNull());
  });

  it('closes straight away on Cancel with an empty list', async () => {
    const { getByText, onClose } = await open();
    await fireEvent.press(getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('never shows the resume prompt when editing', async () => {
    await seedDraft([listItem('s1')]);
    const { queryByText } = await open({
      kind: 'edit',
      row: {
        id: 't1',
        household_id: 'h1',
        account_id: 'a1',
        original_amount: -100,
        original_currency: 'GBP',
        home_currency: 'GBP',
        local_date: '2026-09-20',
        name: 'Coffee',
        category_id: null,
        payment_type: null,
        status: 'paid',
        note: null,
        version: 1,
        transfer_id: null,
        rate_source: 'same-currency',
        rate_date: null,
        rate_pending: false,
      } as never,
    });
    await waitFor(() => expect(queryByText(/unsaved entr/)).toBeNull());
    expect(await AsyncStorage.getItem(entryDraftKey('u1', 'h1'))).not.toBeNull();
  });
});
