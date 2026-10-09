import React from 'react';
import { fireEvent, render, waitFor, within, type RenderResult } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';

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
});

describe('TransactionSheet: new and edit', () => {
  // One render per test: a second render in the same test leaks an act() scope into the next
  // test in this project's Jest environment (see recordPrimitives.test.tsx).
  it('names the title and the primary action for an expense', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    expect(out.getByText('New expense')).toBeTruthy();
    expect(out.getByText('Save expense')).toBeTruthy();
  });

  it('names the title and the primary action for income', async () => {
    const inc = await open({ kind: 'new', direction: 'in' });
    expect(inc.getByText('New income')).toBeTruthy();
    expect(inc.getByText('Save income')).toBeTruthy();
  });

  it('names the title and the primary action for an edit', async () => {
    const edit = await open({ kind: 'edit', row: row() });
    expect(edit.getByText('Edit transaction')).toBeTruthy();
    expect(edit.getByText('Save changes')).toBeTruthy();
  });

  it('labels the sheet container for assistive technology', async () => {
    const { getByTestId } = await open({ kind: 'new', direction: 'out' });
    expect(getByTestId('sheet-container').props.accessibilityLabel).toBe('New expense');
  });

  it('saves a valid new expense with a negative amount, an undo step, a toast and analytics', async () => {
    const { getByLabelText, getByText, onClose } = await open({ kind: 'new', direction: 'out' });
    await typeAmount(getByLabelText, '4.20');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Tea');
    await fireEvent.press(getByText('Save expense'));

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const input = (mockAdd.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(input).toMatchObject({
      amount: -420,
      name: 'Tea',
      accountId: 'a1',
      currency: 'GBP',
      status: 'paid',
      undo: { stepId: 'step-1', labelKey: 'added', labelParams: { name: 'Tea' } },
    });
    expect(getToast()).toMatchObject({
      kind: 'ordinary',
      stepId: 'step-1',
      text: { key: 'undo.label.added', params: { name: 'Tea' } },
    });
    expect(mockTrack).toHaveBeenCalledWith('transaction_added', { kind: 'expense', recurring: false });
    expect(onClose).toHaveBeenCalled();
  });

  it('shows inline errors and does not add when the form is invalid', async () => {
    const { getByText, onClose } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Save expense'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(getByText('Give it a name.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends only the changed field on edit', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'edit', row: row() });
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Latte');
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars, undo] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(vars).toMatchObject({ id: 't1', householdId: 'h1', expectedVersion: 3, patch: { name: 'Latte' } });
    expect(undo).toMatchObject({ stepId: 'step-1', labelKey: 'edited', before: { name: 'Coffee' } });
    expect(getToast()?.text?.key).toBe('undo.label.edited');
  });

  it('closes without a write when nothing changed', async () => {
    const { getByText, onClose } = await open({ kind: 'edit', row: row() });
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms before deleting, then shows the destructive toast', async () => {
    const { getByText, getAllByText } = await open({ kind: 'edit', row: row() });
    await fireEvent.press(getByText('Delete'));
    expect(getByText('Delete this transaction?')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    const deletes = getAllByText('Delete');
    await fireEvent.press(deletes[deletes.length - 1]!);
    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
    expect(getToast()).toMatchObject({ kind: 'destructive', stepId: 'del-step' });
  });

  it('picks a category from the picker', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByLabelText('Category'));
    await fireEvent.press(getByText('Groceries'));
    await typeAmount(getByLabelText, '9');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Shop');
    await fireEvent.press(getByText('Save expense'));
    expect((mockAdd.mock.calls[0] as unknown[])[0]).toMatchObject({ categoryId: 'c1' });
  });
});

function leg(over: Partial<TransactionRow>): TransactionRow {
  return row({ name: null, category_id: 'tc', payment_type: null, transfer_id: 'tr1', ...over });
}
const outLeg = () => leg({ id: 'o1', account_id: 'a1', original_amount: -1000 });
const inLeg = () => leg({ id: 'i1', account_id: 'a2', original_amount: 1000 });

describe('TransactionSheet: transfers', () => {
  it('swaps the fields when Transfer is chosen', async () => {
    const { getByText, queryByText, queryByLabelText, getByLabelText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    expect(getByText('New transfer')).toBeTruthy();
    expect(getByText('Add transfer')).toBeTruthy();
    expect(getByLabelText('From account')).toBeTruthy();
    expect(getByLabelText('To account')).toBeTruthy();
    expect(queryByLabelText('Category')).toBeNull();
    expect(queryByLabelText('Account')).toBeNull();
    expect(queryByText('Paid')).toBeNull();
    expect(queryByLabelText('Payment type')).toBeNull();
    expect(getByText(/Transfers move money between your own accounts/)).toBeTruthy();
  });

  it('shows the amount figure with the arrow in the inkDim colour', async () => {
    const { getByText, getByLabelText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    await typeAmount(getByLabelText, '10');
    const figure = getByText(/^↔ /);
    const style = ([] as Record<string, unknown>[]).concat(figure.props.style as never);
    expect(style.some((s) => s && s.color === '#5C5A50')).toBe(true);
  });

  it('records a same-currency transfer, toasts and tracks it', async () => {
    const { getByText, getByLabelText, onClose } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    await fireEvent.press(getByLabelText('To account'));
    await fireEvent.press(getByLabelText('Savings'));
    await typeAmount(getByLabelText, '10');
    await fireEvent.press(getByText('Add transfer'));

    expect(mockAddTransfer).toHaveBeenCalledTimes(1);
    expect((mockAddTransfer.mock.calls[0] as unknown[])[0]).toMatchObject({
      householdId: 'h1',
      ownerId: 'u1',
      from: { id: 'a1', currency: 'GBP' },
      to: { id: 'a2', currency: 'GBP' },
      amountOut: 1000,
      amountIn: 1000,
      transferCategoryId: 'tc',
      toName: 'Savings',
    });
    expect(getToast()).toMatchObject({
      kind: 'ordinary',
      stepId: 'tr-step',
      text: { key: 'undo.label.transferAdded', params: { name: 'Savings' } },
    });
    expect(mockTrack).toHaveBeenCalledWith('transaction_added', { kind: 'transfer', recurring: false });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks a transfer with no destination account', async () => {
    const { getByText, getByLabelText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    await typeAmount(getByLabelText, '10');
    await fireEvent.press(getByText('Add transfer'));
    expect(mockAddTransfer).not.toHaveBeenCalled();
    expect(getByText('Pick an account.')).toBeTruthy();
  });

  it('asks for both amounts across currencies and never derives one', async () => {
    const { getByText, getByLabelText, getByHintText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    await fireEvent.press(getByLabelText('To account'));
    await fireEvent.press(getByLabelText('Euro pot'));
    await typeAmount(getByLabelText, '10');
    await fireEvent.press(getByHintText('Amount received'));
    await typeAmount(getByLabelText, '11.5');
    expect(getByText(/from Current and .* to Euro pot — each in its own currency\./)).toBeTruthy();
    await fireEvent.press(getByText('Add transfer'));
    expect((mockAddTransfer.mock.calls[0] as unknown[])[0]).toMatchObject({
      amountOut: 1000,
      amountIn: 1150,
      to: { id: 'a3', currency: 'EUR' },
    });
  });

  it('S-WR-01: a leg whose partner is not on the server opens read-only, never as a one-leg edit', async () => {
    mockLegs = [inLeg()];
    const { getByText, queryByText, queryByLabelText } = await open({ kind: 'edit', row: inLeg() });
    expect(getByText('Both sides of this transfer are needed to change it. The other side isn’t on the server yet.')).toBeTruthy();
    expect(queryByLabelText('Amount')).toBeNull();
    expect(queryByText('Save changes')).toBeNull();
    expect(queryByText('Delete')).toBeNull();
  });

  it.each([
    ['offline (paused)', { isPending: true, fetchStatus: 'paused', isError: false, isSuccess: false }, 'Both sides of this transfer are needed to change it. You’re offline, so the other side can’t load yet.'],
    ['still loading', { isPending: true, fetchStatus: 'fetching', isError: false, isSuccess: false }, 'Loading both sides of this transfer…'],
    ['a failed read', { isPending: false, fetchStatus: 'idle', isError: true, isSuccess: false }, 'Both sides of this transfer are needed to change it. The other side couldn’t be loaded.'],
  ])('I-03: a partner that is %s is shown as such, not as missing', async (_label, read, text) => {
    mockLegs = [];
    mockLegsRead = read;
    const { getByText, queryByText, queryByLabelText } = await open({ kind: 'edit', row: inLeg() });
    expect(getByText(text)).toBeTruthy();
    expect(queryByText('Both sides of this transfer are needed to change it. The other side isn’t on the server yet.')).toBeNull();
    expect(queryByLabelText('Amount')).toBeNull();
    expect(queryByText('Save changes')).toBeNull();
    expect(queryByText('Delete')).toBeNull();
  });

  it('S-WR-06: a currency picked for an expense does not carry into a transfer from a GBP account', async () => {
    const { getByText, getByTestId, getByLabelText, queryByLabelText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByLabelText('Currency'));
    await fireEvent.press(within(getByTestId('currency-section-popular')).getByText('EUR · Euro'));
    await fireEvent.press(getByText('Transfer'));
    await fireEvent.press(getByLabelText('To account'));
    await fireEvent.press(getByLabelText('Savings'));
    // Current (GBP) to Savings (GBP): same currency, so no second amount is asked for.
    expect(queryByLabelText('Amount received')).toBeNull();
    await typeAmount(getByLabelText, '10');
    await fireEvent.press(getByText('Add transfer'));
    expect(mockAddTransfer).toHaveBeenCalledTimes(1);
    expect((mockAddTransfer.mock.calls[0] as unknown[])[0]).toMatchObject({ from: { id: 'a1', currency: 'GBP' }, to: { currency: 'GBP' } });
  });

  it('S-WR-10: a new transfer says why Save is unavailable while the transfer category loads', async () => {
    mockTransferCat = null;
    const { getByText, getByRole } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    const reason = 'Transfers can be added once your categories have loaded.';
    expect(getByText(reason)).toBeTruthy();
    const save = getByRole('button', { name: 'Add transfer' });
    expect(save).toBeDisabled();
    expect(save.props.accessibilityHint).toBe(reason);
  });

  it('edits both legs from either leg', async () => {
    mockLegs = [outLeg(), inLeg()];
    const { getByText, getByLabelText, onClose } = await open({ kind: 'edit', row: inLeg() });
    expect(getByText('Editing a transfer updates both sides.')).toBeTruthy();
    expect(getByText('Save changes')).toBeTruthy();
    await typeAmount(getByLabelText, '12');
    await fireEvent.press(getByText('Save changes'));
    expect(mockEditTransfer).toHaveBeenCalledTimes(1);
    const [legs, after, ctx] = mockEditTransfer.mock.calls[0] as unknown as [
      { out: { id: string }; in: { id: string } },
      { out: { amount: number }; in: { amount: number } },
      Record<string, unknown>,
    ];
    expect(legs.out.id).toBe('o1');
    expect(legs.in.id).toBe('i1');
    expect(after.out.amount).toBe(-1200);
    expect(after.in.amount).toBe(1200);
    expect(ctx).toMatchObject({ ownerId: 'u1', labelName: 'Savings' });
    expect(getToast()?.text?.key).toBe('undo.label.transferEdited');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes without a toast when a transfer edit changes nothing', async () => {
    mockLegs = [outLeg(), inLeg()];
    mockEditTransfer.mockReturnValueOnce(null);
    const { getByText, onClose } = await open({ kind: 'edit', row: outLeg() });
    await fireEvent.press(getByText('Save changes'));
    expect(getToast()).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms a delete naming both accounts, then removes the pair', async () => {
    mockLegs = [outLeg(), inLeg()];
    const { getByText, getAllByText } = await open({ kind: 'edit', row: outLeg() });
    await fireEvent.press(getByText('Delete'));
    expect(getByText('Delete this transfer? Both linked entries — Current and Savings — will be removed.')).toBeTruthy();
    const deletes = getAllByText('Delete');
    await fireEvent.press(deletes[deletes.length - 1]!);
    expect(mockRemoveTransfer).toHaveBeenCalledTimes(1);
    // I-04 (data IN-03): both legs are in hand, so the partner goes too and its observed version is checked.
    const [leg, , partner] = mockRemoveTransfer.mock.calls[0] as unknown as [{ id: string }, unknown, { id: string } | undefined];
    expect(leg.id).toBe('o1');
    expect(partner?.id).toBe('i1');
    expect(mockRemove).not.toHaveBeenCalled();
    expect(getToast()).toMatchObject({
      kind: 'destructive',
      stepId: 'trd-step',
      text: { key: 'undo.label.transferDeleted', params: { name: 'Savings' } },
    });
  });
});

describe('TransactionSheet: empty figure (S-IN-01)', () => {
  it('shows the empty figure in the home currency when no account is chosen yet', async () => {
    mockNoAccounts = true;
    mockHome = 'USD';
    const { getByText, queryByText } = await open({ kind: 'new', direction: 'out' });
    expect(queryByText('£0.00')).toBeNull();
    expect(getByText(/\$0\.00/)).toBeTruthy();
  });
});

describe('TransactionSheet: amount prefill in the region notation (S-CR-01)', () => {
  it('de-DE: prefills "12,50" and a note-only edit saves just the note', async () => {
    mockRegion = 'DE';
    const { getByLabelText, getByText, queryByText } = await open({
      kind: 'edit',
      row: row({ original_amount: -1250, original_currency: 'EUR', home_currency: 'EUR', account_id: 'a3' }),
    });
    expect(getByLabelText(/^Amount .*12[.,]50/)).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Note'), 'split with Sam');
    await fireEvent.press(getByText('Save changes'));
    expect(queryByText(/match how amounts are written/)).toBeNull();
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(vars).toMatchObject({ patch: { note: 'split with Sam' } });
    expect(Object.keys(vars.patch as object)).toEqual(['note']);
  });

  it('de-DE, KWD (3 decimals): prefills "1,500" and a note-only edit leaves the amount alone', async () => {
    mockRegion = 'DE';
    const { getByLabelText, getByText } = await open({
      kind: 'edit',
      row: row({ original_amount: -1500, original_currency: 'KWD', home_currency: 'GBP' }),
    });
    expect(getByLabelText(/^Amount .*1.500|^Amount .*1,500/)).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Note'), 'dinar');
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(Object.keys(vars.patch as object)).toEqual(['note']);
  });
});

describe('TransactionSheet: keypad, toggles, notes and wording (REC-20)', () => {
  it('types the amount on the keypad and hides it while a text field is focused', async () => {
    const { getByLabelText, queryByLabelText } = await open({ kind: 'new', direction: 'out' });
    await typeAmount(getByLabelText, '4.20');
    expect(getByLabelText('Amount £4.20')).toBeTruthy();
    expect(getByLabelText('Amount £4.20').props.accessibilityLiveRegion).toBe('polite');
    await fireEvent(getByLabelText('What is it for?'), 'focus');
    expect(queryByLabelText('Decimal point')).toBeNull();
    await fireEvent(getByLabelText('What is it for?'), 'blur');
    expect(getByLabelText('Decimal point')).toBeTruthy();
  });

  it('offers Automatic for expense and income, Refund for expense only, neither on a transfer', async () => {
    const { getByText, queryByText } = await open({ kind: 'new', direction: 'out' });
    expect(getByText('Automatic payment')).toBeTruthy();
    expect(getByText('This is a refund')).toBeTruthy();
    await fireEvent.press(getByText('Money in'));
    expect(getByText('Automatic payment')).toBeTruthy();
    expect(queryByText('This is a refund')).toBeNull();
    await fireEvent.press(getByText('Transfer'));
    expect(queryByText('Automatic payment')).toBeNull();
    expect(queryByText('This is a refund')).toBeNull();
  });

  it('saves a refund as a positive amount with the flag and shows the refund note', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await typeAmount(getByLabelText, '29.99');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Return');
    await fireEvent.press(getByText('This is a refund'));
    expect(getByText(/A refund gives the money back to Uncategorised/)).toBeTruthy();
    await fireEvent.press(getByText('Save expense'));
    expect((mockAdd.mock.calls[0] as unknown[])[0]).toMatchObject({ amount: 2999, isRefund: true, isAutomatic: false });
  });

  it('keeps Automatic a label: it does not change the status', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await typeAmount(getByLabelText, '5');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Gym');
    await fireEvent.press(getByText('Automatic payment'));
    await fireEvent.press(getByText('Save expense'));
    expect((mockAdd.mock.calls[0] as unknown[])[0]).toMatchObject({ isAutomatic: true, status: 'paid' });
  });

  it('says what marking a pending line paid does', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await typeAmount(getByLabelText, '12');
    await fireEvent.press(getByText('Pending'));
    expect(getByText('Marking this paid moves Current by £12.00.')).toBeTruthy();
  });

  it('words income status as Received and Expected, with their hints', async () => {
    const { getByText, queryByText, getByHintText } = await open({ kind: 'new', direction: 'in' });
    expect(getByText('Received')).toBeTruthy();
    expect(getByText('Expected')).toBeTruthy();
    expect(getByHintText('Money is in the account')).toBeTruthy();
    expect(getByHintText('Invoiced or scheduled')).toBeTruthy();
    expect(queryByText('Paid')).toBeNull();
  });

  it('shows the FX note with the stored rate for a foreign line', async () => {
    mockRates = [{ quote: 'GBP', rate: '0.86', rate_date: '2026-09-24', source: 'frankfurter-v2' }];
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out', accountId: 'a3' });
    await typeAmount(getByLabelText, '10');
    expect(getByText(/Saves as £8\.60 in GBP at 1 EUR = .* GBP\. The original €10\.00 stays on the record\./)).toBeTruthy();
  });

  it('omits the FX note when no rate is stored', async () => {
    const { getByLabelText, queryByText } = await open({ kind: 'new', direction: 'out', accountId: 'a3' });
    await typeAmount(getByLabelText, '10');
    expect(queryByText(/Saves as/)).toBeNull();
  });

  it('opens a clone as a pending new line and writes nothing until Save', async () => {
    const { getByText, getByLabelText } = await open({
      kind: 'new',
      direction: 'out',
      localDate: '2026-10-09',
      prefill: {
        amountMinor: 1450,
        currency: 'GBP',
        name: 'Rent',
        categoryId: 'c1',
        accountId: 'a1',
        paymentType: 'bank_transfer',
        isRefund: false,
        isAutomatic: true,
      },
    });
    expect(mockAdd).not.toHaveBeenCalled();
    expect(getByLabelText('Amount £14.50')).toBeTruthy();
    await fireEvent.press(getByText('Save expense'));
    expect((mockAdd.mock.calls[0] as unknown[])[0]).toMatchObject({
      amount: -1450,
      name: 'Rent',
      categoryId: 'c1',
      paymentType: 'bank_transfer',
      status: 'pending',
      localDate: '2026-10-09',
      isAutomatic: true,
    });
  });

  it('runs the cap check after a save, carrying the undo step so Undo stays on the toast', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByLabelText('Category'));
    await fireEvent.press(getByText('Groceries'));
    await typeAmount(getByLabelText, '30');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Shop');
    await fireEvent.press(getByText('Save expense'));
    expect(mockCheckCap).toHaveBeenCalledWith(
      expect.objectContaining({ categoryId: 'c1', amountMinor: -3000, currency: 'GBP', stepId: 'step-1' })
    );
  });

  it('reopens a refund as an expense with the toggle on', async () => {
    const { getByText, getByLabelText } = await open({
      kind: 'edit',
      row: row({ original_amount: 2999, is_refund: true } as Partial<TransactionRow>),
    });
    expect(getByLabelText('Amount £29.99')).toBeTruthy();
    expect(getByText('This is a refund')).toBeTruthy();
    expect(getByText('Paid')).toBeTruthy();
  });
});
