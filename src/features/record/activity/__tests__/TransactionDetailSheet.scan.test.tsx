// 10.1-25 (SCN-01, D-13; UI-SPEC section 4): "Read this receipt" on an existing line. The Receipt sheet hands over the image
// pages; stored ones are copied to the phone's cache, the Receipt sheet closes and the scan sheet opens for that line in
// 'existing' mode. Closing the scan deletes the downloaded copies (never the outbox's own files). Below level 2 there is no
// receipt reading at all. (The row itself shows only with a picture attached: ReceiptSheet.test.)
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
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
jest.mock('@/features/record/receipt/useReceiptActions', () => ({
  useReceiptActions: () => ({
    groups: [{ groupId: 'g1', state: 'stored' }],
    removeGroup: jest.fn(),
    add: jest.fn(),
    removeAll: jest.fn(),
    retry: jest.fn(),
    error: null,
    busy: false,
    loading: false,
  }),
}));
jest.mock('@/features/record/receipt/ReceiptStrip', () => ({ ReceiptStrip: () => null }));
jest.mock('@/features/record/receipt/ReceiptViewer', () => ({ ReceiptViewer: () => null }));

type Img = { uri: string; mime: string };
const PAGES: Img[] = [
  { uri: 'https://signed.example/p1', mime: 'image/jpeg' },
  { uri: 'file:///docs/receipt-outbox/p2.jpg', mime: 'image/jpeg' },
];
jest.mock('@/features/record/receipt/ReceiptSheet', () => ({
  ReceiptSheet: (p: { visible: boolean; line: { id: string }; onRead?: (i: Img[]) => void }) => {
    const R = require('react');
    const { Pressable, Text } = require('react-native');
    if (!p.visible) return null;
    return R.createElement(
      R.Fragment,
      null,
      R.createElement(Text, null, `receipt-sheet-open ${p.line.id}`),
      p.onRead
        ? R.createElement(Pressable, { testID: 'read-receipt', onPress: () => p.onRead?.(PAGES) }, R.createElement(Text, null, 'Read this receipt'))
        : null,
    );
  },
}));

type Copies = { images: Img[]; temps: string[] };
let mockCopies: Copies;
const mockCopiesFor = jest.fn(async (_i: Img[]) => mockCopies);
const mockDiscard = jest.fn();
jest.mock('@/features/record/receipt/scanFiles', () => ({
  copiesForReading: (i: Img[]) => mockCopiesFor(i),
  discardFiles: (u: string[]) => mockDiscard(u),
}));
type ScanProps = { visible: boolean; mode: string; line?: { id: string }; householdId: string; images: Img[]; onClose(): void; onDone(id: string): void };
const mockScan = jest.fn();
jest.mock('@/features/record/receipt/ScanSheet', () => ({
  ScanSheet: (p: unknown) => {
    mockScan(p);
    return null;
  },
}));
const scan = (): ScanProps | undefined => mockScan.mock.calls.at(-1)?.[0] as ScanProps | undefined;

jest.mock('@/data/queries/accounts', () => ({ useAccounts: () => ({ data: [{ id: 'a1', name: 'Everyday' }] }) }));
jest.mock('@/data/queries/transactions', () => ({ useLinkedFees: () => ({ data: [] }) }));
jest.mock('@/data/queries/recurringSeries', () => ({ useRecurringSeries: () => ({ data: [] }) }));
jest.mock('@/data/queries/categories', () => {
  const list = [{ id: 'c1', builtin_key: null, name: 'Dining', color_key: 'teal', is_system: false, archived_at: null }];
  return {
    useCategoryLookup: () => ({ all: list, active: list, byId: new Map<string, unknown>(list.map((c) => [c.id, c])), transferCategoryId: null, loading: false }),
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

async function renderSheet(row: ActivityRowView = tx()) {
  return render(
    <ThemeProvider>
      <TransactionDetailSheet row={row} visible today="2026-09-30" onDismiss={jest.fn()} onStatus={jest.fn()} onEdit={jest.fn()} onClone={jest.fn()} onDelete={jest.fn()} />
    </ThemeProvider>,
  );
}

async function openAndRead() {
  const screen = await renderSheet();
  await fireEvent.press(screen.getByLabelText('Receipt, 1 file'));
  expect(screen.getByText('receipt-sheet-open r1')).toBeTruthy();
  await act(async () => {
    fireEvent.press(screen.getByTestId('read-receipt'));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50)); // the scan opens on the frame after the Receipt sheet closes
  });
  return screen;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReceiptsOn = true;
  mockCopies = {
    images: [
      { uri: 'file:///cache/receipt-view/read-1.jpg', mime: 'image/jpeg' },
      { uri: 'file:///docs/receipt-outbox/p2.jpg', mime: 'image/jpeg' },
    ],
    temps: ['file:///cache/receipt-view/read-1.jpg'],
  };
});

describe('TransactionDetailSheet: Read this receipt (10.1-25)', () => {
  it('copies the pages to the phone, closes the Receipt sheet and opens the scan for this line', async () => {
    const screen = await openAndRead();
    expect(mockCopiesFor).toHaveBeenCalledWith(PAGES);
    expect(screen.queryByText('receipt-sheet-open r1')).toBeNull();
    expect(scan()?.visible).toBe(true);
    expect(scan()?.mode).toBe('existing');
    expect(scan()?.line?.id).toBe('r1');
    expect(scan()?.householdId).toBe('h1');
    expect(scan()?.images).toEqual(mockCopies.images);
    expect(mockDiscard).not.toHaveBeenCalledWith(mockCopies.temps);
  });

  it('cancelling the scan deletes only the downloaded copies and changes nothing', async () => {
    await openAndRead();
    await act(async () => scan()!.onClose());
    expect(mockDiscard).toHaveBeenCalledWith(['file:///cache/receipt-view/read-1.jpg']);
    expect(scan()?.visible ?? false).toBe(false);
  });

  it('after confirm the scan closes and the copies go', async () => {
    await openAndRead();
    await act(async () => scan()!.onDone('r1'));
    expect(mockDiscard).toHaveBeenCalledWith(['file:///cache/receipt-view/read-1.jpg']);
    expect(scan()?.visible ?? false).toBe(false);
  });

  it('Try another photo closes the scan, deletes the copies and goes back to the Receipt sheet', async () => {
    const screen = await openAndRead();
    await act(async () => (scan() as ScanProps & { onRetake(): void }).onRetake());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(mockDiscard).toHaveBeenCalledWith(['file:///cache/receipt-view/read-1.jpg']);
    expect(scan()?.visible ?? false).toBe(false);
    expect(screen.getByText('receipt-sheet-open r1')).toBeTruthy();
  });

  it('opens nothing when no page could be copied', async () => {
    mockCopies = { images: [], temps: [] };
    await openAndRead();
    expect(scan()?.visible ?? false).toBe(false);
  });

  it('below level 2 offers no reading', async () => {
    mockReceiptsOn = false;
    const screen = await renderSheet();
    expect(screen.queryByLabelText(/^Receipt,/)).toBeNull();
    expect(scan()?.visible ?? false).toBe(false);
  });
});
