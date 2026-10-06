import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
const mockEdit = jest.fn(() => true);
const mockRemove = jest.fn((): string | null => 'del-step');
const mockAddTransfer = jest.fn(() => ({ transferId: 'tr1', stepId: 'tr-step' }));
const mockEditTransfer = jest.fn((): string | null => 'tre-step');
const mockRemoveTransfer = jest.fn(() => 'trd-step');
const mockTrack = jest.fn();
let mockLegs: TransactionRow[] = [];

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
}));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: mockAddTransfer }),
  useEditTransfer: () => ({ edit: mockEditTransfer }),
  useDeleteTransfer: () => ({ remove: mockRemoveTransfer }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
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
    transferCategoryId: 'tc',
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
  useTransferLegs: () => ({ legs: mockLegs, isLoading: false }),
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
    await fireEvent.changeText(getByLabelText('Amount'), '4.20');
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
    await fireEvent.changeText(getByLabelText('Amount'), '9');
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
    await fireEvent.changeText(getByLabelText('Amount'), '10');
    const figure = getByText(/^↔ /);
    const style = ([] as Record<string, unknown>[]).concat(figure.props.style as never);
    expect(style.some((s) => s && s.color === '#5C5A50')).toBe(true);
  });

  it('records a same-currency transfer, toasts and tracks it', async () => {
    const { getByText, getByLabelText, onClose } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    await fireEvent.press(getByLabelText('To account'));
    await fireEvent.press(getByLabelText('Savings'));
    await fireEvent.changeText(getByLabelText('Amount'), '10');
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
    await fireEvent.changeText(getByLabelText('Amount'), '10');
    await fireEvent.press(getByText('Add transfer'));
    expect(mockAddTransfer).not.toHaveBeenCalled();
    expect(getByText('Pick an account.')).toBeTruthy();
  });

  it('asks for both amounts across currencies and never derives one', async () => {
    const { getByText, getByLabelText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.press(getByText('Transfer'));
    await fireEvent.press(getByLabelText('To account'));
    await fireEvent.press(getByLabelText('Euro pot'));
    await fireEvent.changeText(getByLabelText('Amount sent'), '10');
    await fireEvent.changeText(getByLabelText('Amount received'), '11.5');
    expect(getByText(/from Current and .* to Euro pot — each in its own currency\./)).toBeTruthy();
    await fireEvent.press(getByText('Add transfer'));
    expect((mockAddTransfer.mock.calls[0] as unknown[])[0]).toMatchObject({
      amountOut: 1000,
      amountIn: 1150,
      to: { id: 'a3', currency: 'EUR' },
    });
  });

  it('edits both legs from either leg', async () => {
    mockLegs = [outLeg(), inLeg()];
    const { getByText, getByLabelText, onClose } = await open({ kind: 'edit', row: inLeg() });
    expect(getByText('Editing a transfer updates both sides.')).toBeTruthy();
    expect(getByText('Save changes')).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Amount'), '12');
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
    expect(mockRemove).not.toHaveBeenCalled();
    expect(getToast()).toMatchObject({
      kind: 'destructive',
      stepId: 'trd-step',
      text: { key: 'undo.label.transferDeleted', params: { name: 'Savings' } },
    });
  });
});
