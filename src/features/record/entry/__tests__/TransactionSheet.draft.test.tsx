import React from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { serialiseDraft, type DraftForm, type ListItem } from '@/engine/entryList';
import { resetToastForTests } from '@/state/undoToast';
import { entryDraftKey } from '../useEntryDraft';
import { TransactionSheet } from '../TransactionSheet';

jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) })); // 05.2-44: OccurrenceActions gates on v3
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

let mockUuid = 0;

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: jest.fn(() => 'new-id') }),
  useEditTransaction: () => ({ edit: jest.fn(() => true) }),
  useDeleteTransaction: () => ({ remove: jest.fn(() => 'del-step') }),
  useMarkPaid: () => ({ markPaid: jest.fn(() => 'paid-step') }),
  useSkipOccurrence: () => ({ skip: jest.fn(() => 'skip-step') }),
}));
jest.mock('@/data/mutations/bulkAdd', () => ({ useBulkAdd: () => ({ save: jest.fn(() => 'bulk-step') }) }));
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
      { id: 'a3', name: 'Euro pot', currency: 'EUR', archived_at: null },
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
jest.mock('@/data/queries/categories', () => {
  const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null };
  return {
    useCategoryLookup: () => ({
      all: [groceries],
      active: [groceries],
      byId: new Map(),
      transferCategoryId: 'tc',
    }),
  };
});
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

const KEY = entryDraftKey('u1', 'h1');

function listItem(id: string): ListItem {
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
  };
}

const formDraft: DraftForm = {
  direction: 'out',
  amountText: '8.40',
  name: 'Lunch',
  categoryId: 'unknown-cat',
  accountId: 'a1',
  currency: 'GBP',
  localDate: '2026-09-20',
  status: 'paid',
  statusTouched: false,
  paymentType: null,
  note: '',
  toAccountId: null,
  toCurrency: null,
  amountInText: '',
  automatic: false,
  refund: false,
};

async function seed(items: ListItem[], form: DraftForm | null, v1 = false) {
  const raw = v1
    ? JSON.stringify({ v: 1, savedAt: '2026-09-24T10:00:00.000Z', items })
    : serialiseDraft(items, '2026-09-24T10:00:00.000Z', form);
  await AsyncStorage.setItem(KEY, raw);
}

async function stored() {
  const raw = await AsyncStorage.getItem(KEY);
  return raw === null ? null : JSON.parse(raw);
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

const editRow = {
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
} as never;

async function open(mode: React.ComponentProps<typeof TransactionSheet>['mode'] = { kind: 'new', direction: 'out' }) {
  const onClose = jest.fn();
  const utils = await render(
    <ThemeProvider>
      <TransactionSheet visible mode={mode} onClose={onClose} />
    </ThemeProvider>
  );
  return { ...utils, onClose };
}

// RNTL 14 has no UNSAFE_getAllByType: find the host Modal (the one carrying onRequestClose) in tree order.
function firstModal(el: any): any {
  if (el?.props?.onRequestClose) return el;
  for (const c of el?.children ?? []) {
    if (typeof c === 'string') continue;
    const found = firstModal(c);
    if (found) return found;
  }
  return null;
}
const back = async () => {
  await act(async () => {
    firstModal(screen.root).props.onRequestClose();
  });
};

const backdrop = () => screen.getByTestId('sheet-backdrop', { hidden: true });

beforeEach(async () => {
  jest.clearAllMocks();
  mockUuid = 0;
  resetToastForTests();
  await AsyncStorage.clear();
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

describe('new entry: accidental dismissal keeps a draft (D-25)', () => {
  it('backdrop with a typed amount closes without asking and stores the form', async () => {
    const { onClose, queryByText } = await open();
    await typeAmount('9.50');
    await fireEvent.press(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(queryByText('Discard changes?')).toBeNull();
    expect(queryByText(/Discard list/)).toBeNull();
    await waitFor(async () => expect((await stored())?.form?.amountText).toBe('9.50'));
    expect((await stored()).v).toBe(2);
  });

  it('keeps the list items (and no form when the form is empty)', async () => {
    await seed([listItem('s1')], null);
    const { onClose } = await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    await fireEvent.press(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(async () => expect((await stored()).items).toHaveLength(1));
  });

  it('Android back closes the same way', async () => {
    const { onClose, queryByText } = await open();
    await typeAmount('3');
    await back();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(queryByText('Discard changes?')).toBeNull();
    await waitFor(async () => expect((await stored())?.form?.amountText).toBe('3'));
  });

  it('offers a form-only draft as 1 unsaved entry and Continue restores the typed amount', async () => {
    await seed([], formDraft);
    await open();
    expect(await screen.findByText('You have 1 unsaved entry')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue list'));
    expect(await screen.findByDisplayValue('Lunch')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Amount/)[0]).toBeTruthy();
    expect(screen.getByText(/8\.40/)).toBeTruthy();
  });

  it('Continue restores the Repeats choice (H1a)', async () => {
    await seed([], { ...formDraft, categoryId: null, repeats: { freq: 'monthly', end: { kind: 'count', count: 6 } } });
    await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    expect(await screen.findByText(/After 6 times/)).toBeTruthy();
  });

  it('a restored hand-picked category is not replaced by the guess (H1b)', async () => {
    await seed([], { ...formDraft, name: 'Tesco', categoryId: 'c1' });
    await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    expect(await screen.findByDisplayValue('Tesco')).toBeTruthy();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.queryByText('Suggested')).toBeNull();
  });

  it('a restored cross-currency transfer keeps the typed received amount (H1c)', async () => {
    await seed([], {
      ...formDraft,
      direction: 'transfer',
      categoryId: null,
      toAccountId: 'a3',
      toCurrency: 'EUR',
      amountText: '100',
      amountInText: '123.00',
    });
    await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(screen.getAllByText(/123\.00/).length).toBeGreaterThan(0);
  });

  it('re-applies direction invariants and maps skipped to paid on restore (H4)', async () => {
    await seed([], { ...formDraft, direction: 'transfer', categoryId: 'c1', paymentType: 'card', status: 'skipped' as never, toAccountId: 'a2' });
    await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect((await screen.findAllByText('New transfer')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Groceries')).toBeNull();
    expect(screen.queryByText('Skipped')).toBeNull();
    expect(screen.queryByText('Card')).toBeNull();
  });

  it('Continue does not overwrite a form that already has content (L5)', async () => {
    await seed([], formDraft);
    await open();
    const prompt = await screen.findByText('Continue list');
    await fireEvent.changeText(screen.getByLabelText('What is it for?'), 'Typed first');
    await fireEvent.press(prompt);
    expect(screen.getByDisplayValue('Typed first')).toBeTruthy();
    expect(screen.queryByDisplayValue('Lunch')).toBeNull();
  });

  it('resumes a v1 draft with 2 items', async () => {
    await seed([listItem('s1'), listItem('s2')], null, true);
    await open();
    expect(await screen.findByText('You have 2 unsaved entries')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue list'));
    expect(await screen.findByText('Item s1')).toBeTruthy();
    expect(screen.getByText('Item s2')).toBeTruthy();
  });

  it('Cancel with no list closes and does not keep the form', async () => {
    const { onClose } = await open();
    await typeAmount('4');
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 400));
    expect(await stored()).toBeNull();
  });

  it('Cancel with list items still asks Discard list?', async () => {
    await seed([listItem('s1')], null);
    const { onClose } = await open();
    await fireEvent.press(await screen.findByText('Continue list'));
    await fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('1 entry isn’t saved yet')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('editing an existing entry (D-33)', () => {
  it('closes at once when nothing changed', async () => {
    const { onClose } = await open({ kind: 'edit', row: editRow });
    await fireEvent.press(backdrop());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks Discard changes? when the name changed; Keep editing keeps it, Discard closes', async () => {
    const { onClose } = await open({ kind: 'edit', row: editRow });
    await fireEvent.changeText(screen.getByLabelText('What is it for?'), 'Coffee beans');
    await fireEvent.press(backdrop());
    expect(await screen.findByText('Discard changes?')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByText('Keep editing'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Coffee beans')).toBeTruthy();
    await fireEvent.press(backdrop());
    await fireEvent.press(await screen.findByText('Discard'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cancel with changes closes at once, and no draft is written', async () => {
    const { onClose } = await open({ kind: 'edit', row: editRow });
    await fireEvent.changeText(screen.getByLabelText('What is it for?'), 'Other');
    await fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 400));
    expect(await stored()).toBeNull();
  });
});
