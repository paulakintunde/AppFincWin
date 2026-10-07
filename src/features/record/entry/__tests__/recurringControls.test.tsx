import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import { getToast, resetToastForTests } from '@/state/undoToast';
import { TransactionSheet } from '../TransactionSheet';
import { RepeatsField } from '../RepeatsField';
import { EditScopePrompt } from '../EditScopePrompt';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.setTimeout(30000);

const mockAdd = jest.fn(() => 'new-id');
const mockEdit = jest.fn(() => true);
const mockRemove = jest.fn((): string | null => 'del-step');
const mockTrack = jest.fn();
const mockCreate = jest.fn((): string => 'series-step');
const mockEditFrom = jest.fn((): string => 'sedit-step');
const mockEnd = jest.fn((): string => 'send-step');
const mockMarkPaid = jest.fn((): string | null => 'paid-step');
const mockSkip = jest.fn((): string | null => 'skip-step');

jest.mock('@/data/mutations/transactions', () => ({
  useAddTransaction: () => ({ add: mockAdd }),
  useEditTransaction: () => ({ edit: mockEdit }),
  useDeleteTransaction: () => ({ remove: mockRemove }),
  useMarkPaid: () => ({ markPaid: mockMarkPaid }),
  useSkipOccurrence: () => ({ skip: mockSkip }),
}));
jest.mock('@/data/mutations/transfers', () => ({
  useAddTransfer: () => ({ add: jest.fn() }),
  useEditTransfer: () => ({ edit: jest.fn() }),
  useDeleteTransfer: () => ({ remove: jest.fn() }),
}));
jest.mock('@/data/mutations/undoCapture', () => ({ newStepId: () => 'step-1' }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'series-1' }));
jest.mock('@/data/mutations/recurringSeries', () => ({
  ...jest.requireActual('@/data/mutations/recurringSeries'),
  useCreateSeries: () => ({ create: mockCreate }),
  useEditSeriesFrom: () => ({ editFrom: mockEditFrom }),
  useEndSeries: () => ({ end: mockEnd }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({
    data: [{ id: 's1', name: 'Rent', version: 4, freq: 'monthly', household_id: 'h1' }],
  }),
}));
jest.mock('@/services/analytics', () => ({ getAnalytics: () => ({ track: mockTrack }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({
    data: [
      { id: 'a1', name: 'Current', currency: 'GBP', archived_at: null },
      { id: 'a2', name: 'Savings', currency: 'GBP', archived_at: null },
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
    options: [{ code: 'GBP', name: 'Pound', symbol: '£', exponent: 2, kind: 'iso', rateDate: null }],
    loading: false,
  }),
}));
jest.mock('@/data/queries/activity', () => ({
  useTransferLegs: () => ({ legs: [], isLoading: false }),
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
    time_zone: 'Europe/London',
    local_date: '2026-09-20',
    name: 'Rent',
    category_id: 'c1',
    payment_type: 'card',
    status: 'paid',
    note: null,
    version: 3,
    transfer_id: null,
    recurring_series_id: null,
    occurrence_date: null,
    rate_source: 'same-currency',
    rate_date: null,
    rate_pending: false,
    ...over,
  } as TransactionRow;
}

const occurrence = (over: Partial<TransactionRow> = {}) =>
  row({ recurring_series_id: 's1', occurrence_date: '2026-09-20', status: 'pending', ...over });

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
});

describe('Repeats on a new entry', () => {
  it('adds without its own undo, creates the series anchored on the new entry, one undo for both', async () => {
    const { getByLabelText, getByText, onClose } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.changeText(getByLabelText('Amount'), '500');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Rent');
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every month'));
    await fireEvent.press(getByText('Done'));
    await fireEvent.press(getByText('Save expense'));

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect((mockAdd.mock.calls[0] as unknown[])[0]).not.toHaveProperty('undo');
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect((mockCreate.mock.calls[0] as unknown[])[0]).toMatchObject({
      anchorTransactionId: 'new-id',
      anchorIsNew: true,
      ownerId: 'u1',
      series: { id: 'series-1', name: 'Rent', freq: 'monthly', amount: -50000, end_date: null, occurrence_count: null },
    });
    expect(getToast()).toMatchObject({ stepId: 'series-step', text: { key: 'undo.label.seriesCreated' } });
    expect(mockTrack).toHaveBeenCalledWith('transaction_added', { kind: 'expense', recurring: true });
    expect(onClose).toHaveBeenCalled();
  });

  it('passes an occurrence count end', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.changeText(getByLabelText('Amount'), '5');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Gym');
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every week'));
    await fireEvent.press(getByText('After a number of times'));
    await fireEvent.changeText(getByLabelText('Number of times'), '12');
    await fireEvent.press(getByText('Done'));
    await fireEvent.press(getByText('Save expense'));
    expect((mockCreate.mock.calls[0] as unknown[])[0]).toMatchObject({
      series: { freq: 'weekly', occurrence_count: 12, end_date: null },
    });
  });

  it('does not save while the count is out of range', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'new', direction: 'out' });
    await fireEvent.changeText(getByLabelText('Amount'), '5');
    await fireEvent.changeText(getByLabelText('What is it for?'), 'Gym');
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every week'));
    await fireEvent.press(getByText('After a number of times'));
    await fireEvent.changeText(getByLabelText('Number of times'), '5000');
    await fireEvent.press(getByText('Done'));
    await fireEvent.press(getByText('Save expense'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('Repeats on an existing one-off entry (D-09)', () => {
  it('makes it the first occurrence without a new entry and without anchorIsNew', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'edit', row: row() });
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every month'));
    await fireEvent.press(getByText('Done'));
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect((mockCreate.mock.calls[0] as unknown[])[0]).toMatchObject({ anchorTransactionId: 't1', anchorIsNew: false });
    expect(getToast()).toMatchObject({ stepId: 'series-step' });
  });

  it('hides the Repeats row for a row already in a series', async () => {
    const { queryByLabelText } = await open({ kind: 'edit', row: occurrence() });
    expect(queryByLabelText('Repeats')).toBeNull();
  });
});

describe('scope prompt', () => {
  it('asks when the amount of an occurrence changes, and This one edits only the row', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.changeText(getByLabelText('Amount'), '20');
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).not.toHaveBeenCalled();
    expect(getByText('Edit this one, or this and future?')).toBeTruthy();
    await fireEvent.press(getByText('This one'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect((mockEdit.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 't1', patch: { original_amount: -2000 } });
    expect(mockEditFrom).not.toHaveBeenCalled();
  });

  it('This and future edits the series from the occurrence date', async () => {
    const { getByLabelText, getByText, onClose } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.changeText(getByLabelText('Amount'), '20');
    await fireEvent.press(getByText('Save changes'));
    await fireEvent.press(getByText('This and future'));
    expect(mockEditFrom).toHaveBeenCalledTimes(1);
    expect((mockEditFrom.mock.calls[0] as unknown[])[0]).toMatchObject({
      id: 's1',
      householdId: 'h1',
      expectedVersion: 4,
      effectiveFrom: '2026-09-20',
      patch: { amount: -2000 },
      ownerId: 'u1',
      name: 'Rent',
    });
    expect(mockEdit).not.toHaveBeenCalled();
    expect(getToast()).toMatchObject({ stepId: 'sedit-step', text: { key: 'undo.label.seriesEdited' } });
    expect(onClose).toHaveBeenCalled();
  });

  it('S-CR-02: a paid occurrence keeps the figure the user typed, and the series changes from the next day', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'edit', row: occurrence({ status: 'paid' }) });
    await fireEvent.changeText(getByLabelText('Amount'), '20');
    await fireEvent.press(getByText('Save changes'));
    await fireEvent.press(getByText('This and future'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect((mockEdit.mock.calls[0] as unknown[])[0]).toMatchObject({ id: 't1', patch: { original_amount: -2000 } });
    expect(mockEditFrom).toHaveBeenCalledTimes(1);
    expect((mockEditFrom.mock.calls[0] as unknown[])[0]).toMatchObject({ effectiveFrom: '2026-09-21', patch: { amount: -2000 } });
    expect(getToast()).toMatchObject({ stepId: 'sedit-step' });
  });

  it('S-CR-02: a pending occurrence with a new note keeps the note and the new amount on that row', async () => {
    const { getByLabelText, getByText } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.changeText(getByLabelText('Amount'), '20');
    await fireEvent.changeText(getByLabelText('Note'), 'landlord rise');
    await fireEvent.press(getByText('Save changes'));
    await fireEvent.press(getByText('This and future'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect((mockEdit.mock.calls[0] as unknown[])[0]).toMatchObject({
      id: 't1',
      patch: { original_amount: -2000, note: 'landlord rise' },
    });
    // The series rewrite starts after this row, so the RPC cannot soft-delete it (and the note).
    expect((mockEditFrom.mock.calls[0] as unknown[])[0]).toMatchObject({ effectiveFrom: '2026-09-21', patch: { amount: -2000 } });
  });

  it('does not ask for a note-only edit', async () => {
    const { getByLabelText, getByText, queryByText } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.changeText(getByLabelText('Note'), 'hello');
    await fireEvent.press(getByText('Save changes'));
    expect(queryByText('Edit this one, or this and future?')).toBeNull();
    expect(mockEdit).toHaveBeenCalledTimes(1);
  });
});

describe('occurrence actions', () => {
  it('marks a pending occurrence paid in one tap', async () => {
    const r = occurrence();
    const { getByText, onClose } = await open({ kind: 'edit', row: r });
    await fireEvent.press(getByText('Mark paid'));
    expect(mockMarkPaid).toHaveBeenCalledWith(r, 'u1', '2026-09-25');
    expect(getToast()).toMatchObject({ stepId: 'paid-step', text: { key: 'undo.label.markedPaid' } });
    expect(onClose).toHaveBeenCalled();
  });

  it('offers no Undo when there is no honest before-state', async () => {
    mockMarkPaid.mockReturnValueOnce(null);
    const { getByText } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.press(getByText('Mark paid'));
    expect(getToast()?.stepId).toBeNull();
  });

  it('adjusts first: sets Paid, keeps the sheet open, then saves without asking for scope', async () => {
    const { getByText, getByLabelText, onClose } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.press(getByText('Adjust, then mark paid'));
    expect(mockMarkPaid).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    await fireEvent.changeText(getByLabelText('Amount'), '20');
    await fireEvent.press(getByText('Save changes'));
    expect(mockEdit).toHaveBeenCalledTimes(1);
    expect((mockEdit.mock.calls[0] as unknown[])[0]).toMatchObject({ patch: { status: 'paid', original_amount: -2000 } });
    expect(mockEditFrom).not.toHaveBeenCalled();
  });

  it('skips one occurrence', async () => {
    const r = occurrence();
    const { getByText } = await open({ kind: 'edit', row: r });
    await fireEvent.press(getByText('Skip this one'));
    expect(mockSkip).toHaveBeenCalledWith(r, 'u1');
    expect(getToast()).toMatchObject({ stepId: 'skip-step' });
  });

  it('confirms before ending the series, then ends it today', async () => {
    const { getByText } = await open({ kind: 'edit', row: occurrence() });
    await fireEvent.press(getByText('End this series'));
    expect(mockEnd).not.toHaveBeenCalled();
    expect(getByText(/^Ends Rent\./)).toBeTruthy();
    await fireEvent.press(getByText('End series'));
    expect(mockEnd).toHaveBeenCalledTimes(1);
    expect((mockEnd.mock.calls[0] as unknown[])[0]).toMatchObject({
      id: 's1',
      householdId: 'h1',
      expectedVersion: 4,
      endDate: '2026-09-25',
      ownerId: 'u1',
      name: 'Rent',
    });
    expect(getToast()).toMatchObject({ stepId: 'send-step', text: { key: 'undo.label.seriesEnded' } });
  });

  it('shows no actions for a paid row', async () => {
    const paid = await open({ kind: 'edit', row: occurrence({ status: 'paid' }) });
    expect(paid.queryByText('Mark paid')).toBeNull();
    expect(paid.queryByText('Skip this one')).toBeNull();
  });

  it('labels a pending occurrence past its date as overdue', async () => {
    const { getByText } = await open({ kind: 'edit', row: occurrence() });
    expect(getByText('Overdue')).toBeTruthy();
  });
});

describe('RepeatsField and EditScopePrompt on their own', () => {
  it('reports the chosen frequency', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText } = await render(
      <ThemeProvider>
        <RepeatsField value={{ freq: 'never' }} onChange={onChange} formatDate={(d) => d} today="2026-09-25" />
      </ThemeProvider>
    );
    await fireEvent.press(getByLabelText('Repeats'));
    await fireEvent.press(getByText('Every quarter'));
    expect(onChange).toHaveBeenCalledWith({ freq: 'quarterly', end: { kind: 'never' } });
  });

  it('routes the three prompt choices', async () => {
    const calls: string[] = [];
    const { getByText } = await render(
      <ThemeProvider>
        <EditScopePrompt
          visible
          onThisOne={() => calls.push('one')}
          onThisAndFuture={() => calls.push('future')}
          onCancel={() => calls.push('cancel')}
        />
      </ThemeProvider>
    );
    await fireEvent.press(getByText('This one'));
    await fireEvent.press(getByText('This and future'));
    await fireEvent.press(getByText('Cancel'));
    expect(calls).toEqual(['one', 'future', 'cancel']);
  });
});
