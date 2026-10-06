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
  const utils = render(
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
  it('names the title and the primary action for expense and income', async () => {
    const out = await open({ kind: 'new', direction: 'out' });
    expect(out.getByText('New expense')).toBeTruthy();
    expect(out.getByText('Save expense')).toBeTruthy();
    out.unmount();
    const inc = await open({ kind: 'new', direction: 'in' });
    expect(inc.getByText('New income')).toBeTruthy();
    expect(inc.getByText('Save income')).toBeTruthy();
    inc.unmount();
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
    fireEvent.changeText(getByLabelText('Amount'), '4.20');
    fireEvent.changeText(getByLabelText('What is it for?'), 'Tea');
    fireEvent.press(getByText('Save expense'));

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
    fireEvent.press(getByText('Save expense'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(getByText('Give it a name.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('sends only the changed field on edit', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'edit', row: row() });
    fireEvent.changeText(getByLabelText('What is it for?'), 'Latte');
    fireEvent.press(getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    const [vars, undo] = mockEdit.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(vars).toMatchObject({ id: 't1', householdId: 'h1', expectedVersion: 3, patch: { name: 'Latte' } });
    expect(undo).toMatchObject({ stepId: 'step-1', labelKey: 'edited', before: { name: 'Coffee' } });
    expect(getToast()?.text?.key).toBe('undo.label.edited');
  });

  it('closes without a write when nothing changed', async () => {
    const { getByText, onClose } = await open({ kind: 'edit', row: row() });
    fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('confirms before deleting, then shows the destructive toast', async () => {
    const { getByText } = await open({ kind: 'edit', row: row() });
    fireEvent.press(getByText('Delete'));
    expect(getByText('Delete this transaction?')).toBeTruthy();
    expect(mockRemove).not.toHaveBeenCalled();
    const buttons = getByText('Delete this transaction?');
    expect(buttons).toBeTruthy();
    fireEvent.press(getByText('Delete', { exact: true, includeHiddenElements: true }));
    await waitFor(() => expect(mockRemove).toHaveBeenCalled());
    expect(getToast()).toMatchObject({ kind: 'destructive', stepId: 'del-step' });
  });

  it('picks a category from the picker', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    fireEvent.press(getByLabelText('Category'));
    fireEvent.press(getByText('Groceries'));
    fireEvent.changeText(getByLabelText('Amount'), '9');
    fireEvent.changeText(getByLabelText('What is it for?'), 'Shop');
    fireEvent.press(getByText('Save expense'));
    expect((mockAdd.mock.calls[0] as unknown[])[0]).toMatchObject({ categoryId: 'c1' });
  });
});
