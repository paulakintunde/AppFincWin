// 10.1-27 (D-17; T-10.1-27-01): the who-changed notice for a split by item, seen by everyone on the line, with Undo.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/theme/ThemeProvider';
import type { HouseholdEventRow } from '@/db/householdEvents';
import type { TransactionRow } from '@/db/rows';
import { mutationKeys } from '@/data/keys';
import { SharedLineDetail } from '../SharedLineDetail';

jest.setTimeout(60000);

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/services/supabase', () => ({ supabase: {} }));
jest.mock('@/db/transactionSplits', () => ({ ...jest.requireActual('@/db/transactionSplits'), fetchMyLineCategories: () => Promise.resolve([]) }));
jest.mock('@/features/household/useHouseholdScope', () => ({
  useHouseholdScope: () => ({
    userId: 'alex',
    householdId: 'h',
    household: null,
    name: 'Home',
    members: [
      { user_id: 'alex', weight: 1 },
      { user_id: 'sam', weight: 1 },
    ],
    isOwner: true,
    online: true,
  }),
}));
const NAMES: Record<string, string> = { alex: 'Alex', sam: 'Sam' };
jest.mock('@/features/household/useMemberLabel', () => ({
  useMemberLabel: () => (id: string | null) => (id === null ? 'Former member' : (NAMES[id] ?? 'Former member')),
  useMemberSeen: () => () => null,
}));
jest.mock('@/features/household/components/MemberAvatar', () => ({ MemberAvatar: () => null }));
jest.mock('@/features/household/components/SharedBadge', () => ({ SharedBadge: () => null }));
jest.mock('@/features/household/noticeText', () => ({
  useNoticeFormat: () => ({ text: () => 'Sam changed the split', when: () => 'Today' }),
}));
jest.mock('../useSharingMoney', () => ({ useSharingMoney: () => (minor: number) => `$${(minor / 100).toFixed(2)}` }));
let mockCover: 'settled' | 'waiting' | null = null;
jest.mock('../sharedLineState', () => ({
  useStoredSplit: () => ({ participants: ['alex', 'sam'], amounts: { alex: 2450, sam: 3550 } }),
  useLineCover: () => mockCover,
}));
jest.mock('../StaleWriteCard', () => ({ StaleWriteCard: () => null }));
jest.mock('../SplitSheet', () => ({ SplitSheet: () => null }));
jest.mock('@/features/record/entry/pickers/CategoryPicker', () => ({ CategoryPicker: () => null }));
jest.mock('@/data/queries/categories', () => ({
  useCategoryLookup: () => ({ all: [], active: [], byId: new Map(), transferCategoryId: null, loading: false }),
}));
let mockEvents: HouseholdEventRow[] = [];
jest.mock('@/data/queries/household', () => ({ useHouseholdEvents: () => ({ events: mockEvents }) }));
const mockSetSplit = jest.fn();
jest.mock('@/data/mutations/householdSharing', () => ({
  useSetLineSplit: () => ({ mutate: mockSetSplit }),
  useSetMyLineCategory: () => ({ mutate: jest.fn() }),
  splitUndoVars: () => null,
}));
const mockRestore = jest.fn();
jest.mock('@/data/mutations/itemSplit', () => ({
  ...jest.requireActual('@/data/mutations/itemSplit'),
  useRestoreLineSplit: () => ({ mutate: mockRestore }),
}));

const line = {
  id: 'l1',
  household_id: 'h',
  original_amount: -6000,
  original_currency: 'USD',
  household_currency: 'USD',
  category_id: 'g',
  category_parts: [{ c: 'g', a: -4000 }, { c: 'hh', a: -2000 }],
  local_date: '2026-11-20',
  version: 5,
  is_shared: true,
  split_rule: 'amount',
  created_by: 'sam',
  paid_by: 'sam',
} as unknown as TransactionRow;

const before = { rule: 'even', participants: ['alex', 'sam'], shares: { alex: -3000, sam: -3000 } };
const after = { rule: 'amount', participants: ['alex', 'sam'], shares: { alex: -2450, sam: -3550 } };

function event(over: Partial<HouseholdEventRow> = {}): HouseholdEventRow {
  return {
    id: 'e1',
    household_id: 'h',
    kind: 'split_changed',
    actor_id: 'sam',
    subject_id: null,
    ref_id: 'l1',
    params: { by_item: true, before, after },
    created_at: '2026-11-21T10:00:00Z',
    ...over,
  };
}

async function show(qc = new QueryClient()) {
  return render(
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <SharedLineDetail row={line} onMakeChangeAgain={jest.fn()} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCover = null;
  mockEvents = [];
});

describe('SharedLineDetail: split by item notice', () => {
  it('names who split the line, shows each share before and after, and Undo restores the split before it', async () => {
    mockEvents = [event()];
    await show();
    expect(screen.getByText('Sam split this line by item')).toBeTruthy();
    expect(screen.getByLabelText('Alex, from $30.00 to $24.50')).toBeTruthy();
    expect(screen.getByLabelText('Sam, from $30.00 to $35.50')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('byitem-undo'));
    expect(mockRestore).toHaveBeenCalledWith({
      householdId: 'h',
      month: '2026-11',
      id: 'l1',
      expectedVersion: 5,
      before: {
        split: { rule: 'even', participants: ['alex', 'sam'], shares: { alex: -3000, sam: -3000 } },
        rule: 'even',
        manual: false,
        parts: line.category_parts,
        category_id: 'g',
        item_split: null,
      },
    });
    expect(mockSetSplit).not.toHaveBeenCalled();
  });

  it('uses this phone’s own server before-state when the line has not changed since', async () => {
    const qc = new QueryClient();
    const own = {
      split: { rule: 'weight', participants: ['alex', 'sam'], shares: { alex: -2000, sam: -4000 } },
      rule: 'weight',
      manual: true,
      parts: null,
      category_id: 'g',
      item_split: null,
    };
    await qc
      .getMutationCache()
      .build(qc, { mutationKey: mutationKeys.setSplitByItem, mutationFn: async () => ({ version: 5, before: own, shares: null }) })
      .execute({ householdId: 'h', month: '2026-11', id: 'l1', expectedVersion: 4 });
    mockEvents = [event()];
    await show(qc);
    await fireEvent.press(screen.getByTestId('byitem-undo'));
    expect(mockRestore).toHaveBeenCalledWith(expect.objectContaining({ before: own, expectedVersion: 5 }));
  });

  it('after Undo the newest card reads "undid the split" and nothing offers Undo', async () => {
    mockEvents = [event({ id: 'e2', params: { by_item: true, undo: true, before: after, after: before }, created_at: '2026-11-21T10:05:00Z' }), event()];
    await show();
    expect(screen.getByText('Sam undid the split')).toBeTruthy();
    expect(screen.getByText('Sam split this line by item')).toBeTruthy();
    expect(screen.queryByTestId('byitem-undo')).toBeNull();
  });

  it('offers no Undo once a settle-up covers the line', async () => {
    mockCover = 'settled';
    mockEvents = [event()];
    await show();
    expect(screen.getByText('Sam split this line by item')).toBeTruthy();
    expect(screen.queryByTestId('byitem-undo')).toBeNull();
  });

  it('keeps the plain split notices as they were', async () => {
    mockEvents = [event({ params: { before, after } })];
    await show();
    expect(screen.getByText('Sam changed the split')).toBeTruthy();
    expect(screen.queryByTestId('byitem-notice')).toBeNull();
  });
});
