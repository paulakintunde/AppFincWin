// 10.1-23 (RCP-01, D-09; UI-SPEC section 3): the detail sheet's Receipt row (level 2) opens the Receipt sheet; with files the
// detail shows the thumbnail strip and a thumbnail opens the viewer (a failed upload opens the Receipt sheet instead).
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { ActivityRowView } from '@/data/queries/activity';
import { TransactionDetailSheet } from '../TransactionDetailSheet';

jest.mock('@/features/plans/usePlanState', () => ({ usePlanState: () => ({ status: 'active', writable: true, loading: false }) }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 47, bottom: 12, left: 0, right: 0 }),
}));
jest.setTimeout(30000);
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/features/decide/useDecideAccess', () => ({ useDecideAccess: () => ({ v3: false }) }));
let mockReceiptsOn = true;
jest.mock('@/features/levels/useFeatureAccess', () => ({ useFeatureAccess: (id: string) => ({ visible: id === 'receipts' && mockReceiptsOn }) }));
jest.mock('@/features/record/split/CategorySplitSheet', () => ({ CategorySplitSheet: () => null }));
type MockGroup = { groupId: string; state: 'stored' | 'waiting' | 'failed' };
let mockGroups: MockGroup[] = [];
const mockActionsFor = jest.fn((_h: string, _id: string) => undefined);
const mockRemoveGroup = jest.fn(async (_id: string) => undefined);
jest.mock('@/features/record/receipt/useReceiptActions', () => ({
  useReceiptActions: (h: string, id: string) => {
    mockActionsFor(h, id);
    return { groups: mockGroups, removeGroup: mockRemoveGroup, add: jest.fn(), removeAll: jest.fn(), retry: jest.fn(), error: null, busy: false, loading: false };
  },
}));
jest.mock('@/features/record/receipt/ReceiptSheet', () => ({
  ReceiptSheet: (p: { visible: boolean; line: { id: string } }) => {
    const { Text } = require('react-native');
    return p.visible ? require('react').createElement(Text, null, `receipt-sheet-open ${p.line.id}`) : null;
  },
}));
jest.mock('@/features/record/receipt/ReceiptViewer', () => ({
  ReceiptViewer: (p: { visible: boolean; startGroupId?: string; onRemove(id: string): void }) => {
    const { Text } = require('react-native');
    return p.visible
      ? require('react').createElement(Text, { onPress: () => p.onRemove(p.startGroupId ?? '') }, `viewer-at ${p.startGroupId}`)
      : null;
  },
}));
jest.mock('@/features/record/receipt/ReceiptStrip', () => ({
  ReceiptStrip: (p: { groups: MockGroup[]; onOpen(id: string): void }) => {
    const R = require('react');
    const { Pressable, Text } = require('react-native');
    return R.createElement(
      R.Fragment,
      null,
      p.groups.map((g) =>
        R.createElement(Pressable, { key: g.groupId, testID: `thumb-${g.groupId}`, onPress: () => p.onOpen(g.groupId) }, R.createElement(Text, null, g.groupId))
      )
    );
  },
}));
jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday' }] }) }));
jest.mock('@/data/queries/transactions', () => ({ useLinkedFees: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => {
  const mk = (id: string, name: string) => ({ id, builtin_key: null, name, color_key: 'teal', is_system: false, archived_at: null });
  const list = [mk('c1', 'Dining'), mk('c2', 'Groceries'), mk('c3', 'Gifts')];
  return {
    useCategoryLookup: () => ({
      all: list,
      active: list,
      byId: new Map<string, unknown>(list.map((c) => [c.id, c])),
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
    homeCurrency: 'USD',
    showCents: true,
    region: 'US',
    timeZone: 'America/New_York',
    today: '2026-09-30',
  }),
}));

function tx(over: Partial<ActivityRowView> = {}): ActivityRowView {
  return {
    id: 'r1',
    account_id: 'a1',
    original_amount: -5000,
    original_currency: 'USD',
    home_currency: 'USD',
    rate: null,
    rate_date: null,
    rate_source: null,
    rate_pending: false,
    local_date: '2026-09-20',
    name: 'Lunch at Pret',
    category_id: 'c1',
    payment_type: null,
    note: null,
    status: 'paid',
    transfer_id: null,
    recurring_series_id: null,
    is_refund: false,
    is_automatic: false,
    amountHome: -5000,
    overdue: false,
    counterpartAccountId: null,
    version: 3,
    ...over,
  } as unknown as ActivityRowView;
}

async function renderSheet(row: ActivityRowView) {
  return render(
    <ThemeProvider>
      <TransactionDetailSheet row={row} visible today="2026-09-30" onDismiss={jest.fn()} onStatus={jest.fn()} onEdit={jest.fn()} onClone={jest.fn()} onDelete={jest.fn()} />
    </ThemeProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReceiptsOn = true;
  mockGroups = [];
});

describe('TransactionDetailSheet receipts (10.1-23)', () => {
  it('shows Receipt: None and opens the Receipt sheet for the line', async () => {
    const screen = await renderSheet(tx());
    expect(mockActionsFor).toHaveBeenCalledWith('h1', 'r1');
    expect(screen.queryByTestId('detail-receipt-strip')).toBeNull();
    await fireEvent.press(screen.getByLabelText('Receipt, None'));
    expect(screen.getByText('receipt-sheet-open r1')).toBeTruthy();
  });

  it('counts the files and shows the strip; a thumbnail opens the viewer', async () => {
    mockGroups = [
      { groupId: 'g1', state: 'stored' },
      { groupId: 'g2', state: 'stored' },
      { groupId: 'g3', state: 'stored' },
    ];
    const screen = await renderSheet(tx());
    expect(screen.getByLabelText('Receipt, 3 files')).toBeTruthy();
    expect(screen.getByTestId('detail-receipt-strip')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('thumb-g2'));
    expect(screen.getByText('viewer-at g2')).toBeTruthy();
    await fireEvent.press(screen.getByText('viewer-at g2'));
    expect(mockRemoveGroup).toHaveBeenCalledWith('g2');
  });

  it('reads 1 file for one receipt', async () => {
    mockGroups = [{ groupId: 'g1', state: 'stored' }];
    const screen = await renderSheet(tx());
    expect(screen.getByLabelText('Receipt, 1 file')).toBeTruthy();
  });

  it('says Waiting to upload while a file is on the phone; a failed one opens the Receipt sheet', async () => {
    mockGroups = [
      { groupId: 'g1', state: 'stored' },
      { groupId: 'g2', state: 'failed' },
    ];
    const screen = await renderSheet(tx());
    expect(screen.getByLabelText('Receipt, Waiting to upload')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('thumb-g2'));
    expect(screen.getByText('receipt-sheet-open r1')).toBeTruthy();
    expect(screen.queryByText(/viewer-at/)).toBeNull();
  });

  it('has no Receipt row on a transfer', async () => {
    const screen = await renderSheet(tx({ transfer_id: 'tr1', counterpartAccountId: 'a1' }));
    expect(screen.queryByLabelText(/^Receipt,/)).toBeNull();
    expect(mockActionsFor).not.toHaveBeenCalled();
  });

  it('shows and reads nothing about receipts below level 2', async () => {
    mockReceiptsOn = false;
    const screen = await renderSheet(tx());
    expect(screen.queryByLabelText(/^Receipt,/)).toBeNull();
    expect(mockActionsFor).not.toHaveBeenCalled();
  });
});
