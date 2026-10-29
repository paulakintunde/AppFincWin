import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { TransactionRow } from '@/db/rows';
import type { IncomePayerPromptRow } from '@/db/incomePayerPrompts';
import type { MoneyFormatter } from '@/ui/money/useMoneyFormatter';
import { IncomeTagChip, incomeChipState, rulesByPayer } from '../IncomeTagChip';
import { IncomeTagSheet } from '../IncomeTagSheet';

const mockTag = jest.fn((_input: unknown) => ({ stepId: 'step-1', tagged: 3 }));
const mockShowToast = jest.fn();
const mockSearch = jest.fn();

jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/ui/haptics', () => ({ hapticLight: jest.fn(), hapticSelection: jest.fn() }));
jest.mock('@/data/mutations/incomeTags', () => ({ useTagIncome: () => ({ tag: (i: unknown) => mockTag(i) }) }));
jest.mock('@/db/transactions', () => ({ fetchTransactionsSearch: (...a: unknown[]) => mockSearch(...a) }));
jest.mock('@/state/undoToast', () => ({ showToast: (t: unknown) => mockShowToast(t) }));
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({ ready: true, userId: 'u1', householdId: 'h1' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const formatter = {
  locale: 'en-GB',
  formatMoney: (m: { amount: number }) => `£${(Math.abs(m.amount) / 100).toFixed(2)}`,
  formatDate: (d: string) => d,
} as unknown as MoneyFormatter;

function tx(over: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: 't1',
    name: 'Acme Ltd',
    original_amount: 250000,
    original_currency: 'GBP',
    local_date: '2026-10-01',
    transfer_id: null,
    deleted_at: null,
    is_refund: false,
    income_kind: null,
    counts_as: null,
    recurring_series_id: null,
    version: 1,
    ...over,
  } as unknown as TransactionRow;
}

function rule(over: Partial<IncomePayerPromptRow> = {}): IncomePayerPromptRow {
  return {
    id: 'r1',
    household_id: 'h1',
    payer_key: 'acme ltd',
    income_kind: 'salary',
    counts_as: 'available',
    apply_to_future: true,
    created_by: null,
    deleted_at: null,
    version: 1,
    ...over,
  };
}

async function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return await render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>{ui}</ThemeProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearch.mockResolvedValue([
    tx({ id: 'e1', local_date: '2026-09-01' }),
    tx({ id: 'e2', local_date: '2026-08-01' }),
    tx({ id: 'e3', local_date: '2026-07-01', income_kind: 'salary', counts_as: 'available' }),
    tx({ id: 'o1', name: 'Other Co' }),
  ]);
});

describe('income chip state', () => {
  it('a row tag wins, then the payer rule, else new income', () => {
    expect(incomeChipState(tx({ income_kind: 'rent', counts_as: 'kept' }), new Map())).toEqual({
      state: 'tagged', kind: 'rent', countsAs: 'kept', regular: false,
    });
    const rules = rulesByPayer([rule()]);
    expect(incomeChipState(tx({ recurring_series_id: 's1' }), rules)).toEqual({
      state: 'tagged', kind: 'salary', countsAs: 'available', regular: true,
    });
    expect(incomeChipState(tx(), new Map())).toEqual({ state: 'new' });
  });

  it('renders each chip text', async () => {
    const cases: [Parameters<typeof IncomeTagChip>[0]['state'], string][] = [
      [{ state: 'tagged', kind: 'salary', countsAs: 'available', regular: false }, 'Salary or wages · counts'],
      [{ state: 'tagged', kind: 'salary', countsAs: 'available', regular: true }, 'Salary or wages · counts · regular'],
      [{ state: 'tagged', kind: 'dividends', countsAs: 'kept', regular: false }, 'Dividends · reinvested, not counted'],
      [{ state: 'tagged', kind: 'rent', countsAs: 'kept', regular: false }, 'Rent · kept, not counted'],
      [{ state: 'new' }, 'New income · what is it?'],
    ];
    for (const [state, text] of cases) {
      const screen = await wrap(<IncomeTagChip state={state} onPress={jest.fn()} />);
      expect(screen.getByText(text)).toBeTruthy();
      await screen.unmount();
    }
  });

  it('labels and presses', async () => {
    const onPress = jest.fn();
    const screen = await wrap(<IncomeTagChip state={{ state: 'new' }} onPress={onPress} />);
    await fireEvent.press(screen.getByLabelText('Income type not set. Opens income type.'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('IncomeTagSheet', () => {
  it('shows the earlier-payments count before save and makes one tag call', async () => {
    const screen = await wrap(<IncomeTagSheet visible tx={tx()} newPayer formatter={formatter} onClose={jest.fn()} />);
    expect(screen.getByText('NEW KIND OF INCOME')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('This also tags 2 earlier payments from Acme Ltd.')).toBeTruthy());

    expect(screen.getByLabelText('Save income type').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByLabelText('Salary or wages'));
    await fireEvent.press(screen.getByLabelText('I spend it or it’s available'));
    await fireEvent.press(screen.getByLabelText('Save income type'));

    expect(mockTag).toHaveBeenCalledTimes(1);
    const call = mockTag.mock.calls[0]![0] as { incomeKind: string; countsAs: string; applyToFuture: boolean; earlier: { id: string }[] };
    expect(call).toMatchObject({ incomeKind: 'salary', countsAs: 'available', applyToFuture: true });
    expect(call.earlier.map((r) => r.id)).toEqual(['e1', 'e2']);
    expect(mockShowToast).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: 'step-1', text: { key: 'activity.incomeTag.toastTagged', params: { count: 3, payer: 'Acme Ltd' } } })
    );
  });

  it('toggle off: no count line, plain saved toast, no future rule', async () => {
    mockTag.mockReturnValueOnce({ stepId: 'step-2', tagged: 1 });
    const screen = await wrap(<IncomeTagSheet visible tx={tx()} newPayer={false} formatter={formatter} onClose={jest.fn()} />);
    await waitFor(() => screen.getByText('This also tags 2 earlier payments from Acme Ltd.'));
    expect(screen.queryByText('NEW KIND OF INCOME')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Apply to future payments from Acme Ltd'));
    expect(screen.queryByText('This also tags 2 earlier payments from Acme Ltd.')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Other'));
    await fireEvent.press(screen.getByLabelText('It’s reinvested or kept'));
    await fireEvent.press(screen.getByLabelText('Save income type'));
    expect(mockTag.mock.calls[0]![0]).toMatchObject({ applyToFuture: false, countsAs: 'kept' });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ text: { key: 'activity.incomeTag.toastSaved' } }));
  });

  it('offers the refund link only when wired, and hands over the payment', async () => {
    const onRefundLink = jest.fn();
    const screen = await wrap(<IncomeTagSheet visible tx={tx()} newPayer formatter={formatter} onClose={jest.fn()} onRefundLink={onRefundLink} />);
    await fireEvent.press(screen.getByLabelText('It’s a refund of a purchase'));
    expect(onRefundLink).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('Not now closes without a write', async () => {
    const onClose = jest.fn();
    const screen = await wrap(<IncomeTagSheet visible tx={tx()} newPayer formatter={formatter} onClose={onClose} />);
    await fireEvent.press(screen.getByLabelText('Not now'));
    expect(onClose).toHaveBeenCalled();
    expect(mockTag).not.toHaveBeenCalled();
  });
});
