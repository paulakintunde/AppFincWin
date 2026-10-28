import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import { TransactionDetailSheet } from '../TransactionDetailSheet';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(20000);
// 05.2-33: the sheet reads the Decide switch; these tests cover the switch-off sheet.
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
jest.mock('@/data/queries/accounts', () => ({
  useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday' }, { id: 'a2', name: 'Savings' }] }),
}));
let mockFees: { id: string; original_amount: number; original_currency: string }[] = [];
jest.mock('@/data/queries/transactions', () => ({
  useLinkedFees: () => ({ data: mockFees }),
}));
jest.mock('@/data/queries/recurringSeries', () => ({
  useRecurringSeries: () => ({ data: [{ id: 's1', freq: 'monthly' }] }),
}));
jest.mock('@/data/queries/categories', () => {
  const groceries = { id: 'c1', builtin_key: null, name: 'Groceries', color_key: 'teal', is_system: false, archived_at: null };
  return {
    useCategoryLookup: () => ({
      all: [groceries],
      active: [groceries],
      byId: new Map<string, unknown>([['c1', groceries]]),
      transferCategoryId: null,
      loading: false,
    }),
  };
});
jest.mock('@/features/record/useRecordContext', () => ({
  useRecordContext: () => ({
    ready: true,
    userId: 'u1',
    householdId: 'h1',
    homeCurrency: 'GBP',
    showCents: true,
    region: 'GB',
    timeZone: 'Europe/London',
    today: '2026-09-30',
  }),
}));

function tx(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -1250,
    original_currency: 'GBP',
    home_currency: 'GBP',
    rate: null,
    rate_date: null,
    rate_source: null,
    rate_pending: false,
    local_date: '2026-09-20',
    name: 'Tesco',
    category_id: 'c1',
    payment_type: 'card',
    note: null,
    status: 'pending',
    transfer_id: null,
    recurring_series_id: null,
    is_refund: false,
    is_automatic: false,
    amountHome: -1250,
    overdue: true,
    counterpartAccountId: null,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderSheet(row: ActivityRowView | null) {
  const handlers = { onDismiss: jest.fn(), onStatus: jest.fn(), onEdit: jest.fn(), onClone: jest.fn(), onDelete: jest.fn() };
  const screen = await render(
    <ThemeProvider>
      <TransactionDetailSheet row={row} visible today="2026-09-30" {...handlers} />
    </ThemeProvider>
  );
  return { screen, ...handlers };
}

describe('TransactionDetailSheet', () => {
  it('renders nothing without a row', async () => {
    const { screen } = await renderSheet(null);
    expect(screen.queryByText('Edit transaction')).toBeNull();
  });

  it('shows the header, rows and buttons for a pending expense', async () => {
    const { screen } = await renderSheet(tx({ recurring_series_id: 's1' }));
    expect(screen.getByText('Tesco')).toBeTruthy();
    expect(screen.getByText(/^Groceries · /)).toBeTruthy();
    expect(screen.getByText('Overdue')).toBeTruthy();
    expect(screen.getByText('Everyday')).toBeTruthy();
    expect(screen.getByText('Card')).toBeTruthy();
    expect(screen.getByText('Every month')).toBeTruthy();
    expect(screen.getByText('Manual')).toBeTruthy();
    for (const label of ['Mark as paid', 'Edit transaction', 'Clone transaction', 'Delete transaction']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('wires the buttons back to the screen', async () => {
    const { screen, onStatus, onEdit, onClone, onDelete } = await renderSheet(tx());
    await fireEvent.press(screen.getByText('Mark as paid'));
    expect(onStatus).toHaveBeenCalledWith('paid');
    await fireEvent.press(screen.getByText('Edit transaction'));
    await fireEvent.press(screen.getByText('Clone transaction'));
    await fireEvent.press(screen.getByText('Delete transaction'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClone).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('offers Mark as pending for a paid expense and nothing for a skipped one', async () => {
    const paid = await renderSheet(tx({ status: 'paid' }));
    expect(paid.screen.getByText('Mark as pending')).toBeTruthy();
    const skipped = await renderSheet(tx({ status: 'skipped' }));
    expect(skipped.screen.queryByText(/Mark as/)).toBeNull();
  });

  it('hides Clone for a transfer and shows From / To', async () => {
    const { screen } = await renderSheet(tx({ transfer_id: 't1', counterpartAccountId: 'a2', name: null, category_id: null }));
    expect(screen.queryByText('Clone transaction')).toBeNull();
    expect(screen.getByText('From')).toBeTruthy();
    expect(screen.getByText('Savings')).toBeTruthy();
  });

  it('shows the FX note for a foreign line with a stored rate', async () => {
    const { screen } = await renderSheet(tx({ original_currency: 'EUR', rate: '0.8600', rate_pending: true }));
    expect(screen.getByText(/at 1 EUR = 0\.8600 GBP/)).toBeTruthy();
  });

  describe('statement conversion (D-31..D-33)', () => {
    const stmt = (over: Partial<ActivityRowView> = {}) =>
      tx({
        original_amount: -1392,
        original_currency: 'CAD',
        home_currency: 'CAD',
        stmt_orig_amount: -1000,
        stmt_orig_currency: 'USD',
        conversion_source: 'statement',
        ...over,
      });

    beforeEach(() => {
      mockFees = [];
    });
    it('shows the foreign amount, charged amount, implied rate and provenance note, with no market note', async () => {
      const { screen } = await renderSheet(stmt());
      expect(screen.getByText(/\$10\.00 · charged CA\$13\.92 at 1\.392/)).toBeTruthy();
      expect(screen.getByText('Converted by your bank, as shown on the statement.')).toBeTruthy();
      expect(screen.queryByText(/ = /)).toBeNull();
      expect(screen.queryByText(/^Bank fee/)).toBeNull();
    });
    it('also shows the home-currency note below when the account currency differs from home', async () => {
      const { screen } = await renderSheet(stmt({ home_currency: 'EUR', rate: '0.6800' }));
      expect(screen.getByText(/\$10\.00 · charged CA\$13\.92 at 1\.392/)).toBeTruthy();
      expect(screen.getByText(/at 1 CAD = 0\.6800 EUR/)).toBeTruthy();
    });
    // Review ME-01 / IN-01: an unexpected stored code never crashes the sheet, and an unknown code
    // has no implied rate rather than a guessed scale.
    it.each(['AB', 'XY12'])('a stored statement currency %p shows code and number with no rate', async (code) => {
      const { screen } = await renderSheet(stmt({ stmt_orig_currency: code }));
      expect(screen.getByText(`${code} 10.00 · charged CA$13.92`)).toBeTruthy();
    });
    it('a well-formed but unknown code has no implied rate', async () => {
      const { screen } = await renderSheet(stmt({ stmt_orig_currency: 'REF' }));
      expect(screen.queryByText(/ at /)).toBeNull();
    });
    it('shows a linked bank fee', async () => {
      mockFees = [{ id: 'f1', original_amount: -42, original_currency: 'CAD' }];
      const { screen } = await renderSheet(stmt());
      expect(screen.getByText('Bank fee CA$0.42')).toBeTruthy();
    });
  });
});
